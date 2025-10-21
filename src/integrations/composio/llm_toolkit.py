"""
Custom Composio toolkit exposing repository-aware utilities.

The helper functions in this module can be registered with a Composio SDK
instance to make the project's local tooling available through Composio's
standard provider interface (and downstream bridges such as OpenAI Agents).
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Sequence

from pydantic import BaseModel, Field, model_validator

try:
    from composio import Composio
except ImportError:  # pragma: no cover
    Composio = None  # type: ignore[misc, assignment]


class RepoContext:
    """Resolve filesystem paths for tool execution while keeping them sandboxed."""

    _default_root = Path(__file__).resolve().parents[2]
    _env_override = "LLM_FRAMEWORK_REPO_ROOT"

    @classmethod
    def root(cls) -> Path:
        override = os.getenv(cls._env_override)
        if override:
            return Path(override).expanduser().resolve()
        return cls._default_root

    @classmethod
    def resolve(cls, relative_path: str) -> Path:
        """Resolve a relative path ensuring it stays within the repository root."""
        base = cls.root()
        candidate = (base / relative_path).resolve()
        if candidate == base:
            return candidate
        if base not in candidate.parents:
            raise ValueError(
                f"Path '{relative_path}' escapes repository root '{base}'."
            )
        return candidate

    @classmethod
    def to_relative(cls, path: Path) -> str:
        """Return a repository-relative string for the given absolute path."""
        return str(path.resolve().relative_to(cls.root()))


class ListRepoEntriesRequest(BaseModel):
    """List files or directories within the repository."""

    path: str = Field(default=".", description="Folder relative to repo root.")
    pattern: str | None = Field(
        default=None,
        description="Glob pattern evaluated relative to the chosen directory.",
    )
    recursive: bool = Field(
        default=True,
        description="Include items from nested directories.",
    )
    include_directories: bool = Field(
        default=False, description="Whether to include directories in the output."
    )
    limit: int = Field(
        default=50, ge=1, le=500, description="Maximum number of results to return."
    )

    @model_validator(mode="after")
    def _validate_path(self) -> "ListRepoEntriesRequest":
        RepoContext.resolve(self.path)
        return self


class ReadRepoFileRequest(BaseModel):
    """Read a text file from the repository."""

    path: str = Field(description="File path relative to the repository root.")
    encoding: str = Field(default="utf-8", description="Text encoding to use.")
    max_bytes: int = Field(
        default=20000,
        ge=1,
        le=200000,
        description="Maximum number of bytes to return from the file.",
    )

    @model_validator(mode="after")
    def _validate_file(self) -> "ReadRepoFileRequest":
        target = RepoContext.resolve(self.path)
        if not target.is_file():
            raise ValueError(f"'{self.path}' is not a file.")
        return self


class SearchRepoContentRequest(BaseModel):
    """Search text content in repository files."""

    query: str = Field(description="Literal string to search for.")
    path: str = Field(default=".", description="Directory to scan.")
    file_glob: str | None = Field(
        default=None,
        description="Optional glob to narrow files (e.g. '*.py').",
    )
    case_sensitive: bool = Field(
        default=False, description="Perform a case-sensitive search."
    )
    max_results: int = Field(
        default=20, ge=1, le=200, description="Maximum number of matches to return."
    )
    context_lines: int = Field(
        default=2, ge=0, le=10, description="Number of context lines per match."
    )
    max_file_bytes: int = Field(
        default=100_000,
        ge=1,
        le=1_000_000,
        description="Skip files larger than this many bytes.",
    )
    encoding: str = Field(default="utf-8", description="Encoding used for file reads.")

    @model_validator(mode="after")
    def _validate_path(self) -> "SearchRepoContentRequest":
        target = RepoContext.resolve(self.path)
        if not target.exists():
            raise ValueError(f"Search path '{self.path}' does not exist.")
        return self


def _iter_repo_entries(
    base_dir: Path,
    pattern: str | None,
    recursive: bool,
) -> Iterable[Path]:
    if recursive:
        if pattern:
            yield from base_dir.rglob(pattern)
        else:
            yield from base_dir.rglob("*")
    else:
        if pattern:
            yield from base_dir.glob(pattern)
        else:
            yield from base_dir.iterdir()


def list_repo_entries(request: ListRepoEntriesRequest) -> Dict[str, object]:
    """Return repository entries matching the provided filters."""
    target_dir = RepoContext.resolve(request.path)
    if not target_dir.exists():
        raise ValueError(f"Directory '{request.path}' does not exist.")
    if not target_dir.is_dir():
        raise ValueError(f"Path '{request.path}' is not a directory.")

    entries: List[Dict[str, object]] = []
    for candidate in _iter_repo_entries(target_dir, request.pattern, request.recursive):
        if candidate.is_dir() and not request.include_directories:
            continue
        if not candidate.is_dir() and candidate.is_file():
            pass
        elif candidate.is_file() is False and candidate.is_dir() is False:
            # Skip non-regular entries (e.g. symlinks, sockets)
            continue

        entries.append(
            {
                "path": RepoContext.to_relative(candidate),
                "is_directory": candidate.is_dir(),
                "size": candidate.stat().st_size if candidate.is_file() else None,
            }
        )
        if len(entries) >= request.limit:
            break

    return {
        "root": str(RepoContext.root()),
        "query": request.model_dump(),
        "results": entries,
        "count": len(entries),
    }


def read_repo_file(request: ReadRepoFileRequest) -> Dict[str, object]:
    """Read a text file from the repository with basic size safeguards."""
    target = RepoContext.resolve(request.path)
    data = target.read_bytes()
    truncated = False
    if len(data) > request.max_bytes:
        data = data[: request.max_bytes]
        truncated = True
    text = data.decode(request.encoding, errors="replace")
    return {
        "path": RepoContext.to_relative(target),
        "encoding": request.encoding,
        "truncated": truncated,
        "byte_length": len(data),
        "content": text,
    }


def _collect_context_snippet(
    lines: Sequence[str],
    index: int,
    context_lines: int,
) -> str:
    start = max(0, index - context_lines)
    end = min(len(lines), index + context_lines + 1)
    snippet = lines[start:end]
    return "\n".join(snippet)


def search_repo_content(request: SearchRepoContentRequest) -> Dict[str, object]:
    """Search for substring matches inside repository text files."""
    base_dir = RepoContext.resolve(request.path)
    if base_dir.is_file():
        candidates = [base_dir]
    else:
        iterator = _iter_repo_entries(
            base_dir,
            request.file_glob,
            recursive=True,
        )
        candidates = [path for path in iterator if path.is_file()]

    results: List[Dict[str, object]] = []
    needle = request.query if request.case_sensitive else request.query.lower()

    for candidate in candidates:
        try:
            if candidate.stat().st_size > request.max_file_bytes:
                continue
            text = candidate.read_text(
                encoding=request.encoding,
                errors="ignore",
            )
        except (OSError, UnicodeDecodeError):
            continue

        haystack = text if request.case_sensitive else text.lower()
        if needle not in haystack:
            continue

        lines = text.splitlines()
        compare_lines = haystack.splitlines()
        for idx, line in enumerate(compare_lines):
            if needle in line:
                results.append(
                    {
                        "file": RepoContext.to_relative(candidate),
                        "line": idx + 1,
                        "snippet": _collect_context_snippet(lines, idx, request.context_lines),
                    }
                )
                if len(results) >= request.max_results:
                    break
        if len(results) >= request.max_results:
            break

    return {
        "root": str(RepoContext.root()),
        "query": request.model_dump(),
        "matches": results,
        "count": len(results),
    }


def register_llm_framework_toolkit(
    sdk: Composio,
    toolkit_slug: str = "LLM_FRAMEWORK",
) -> List[str]:
    """
    Register the repository tooling as a custom Composio toolkit.

    Returns the list of tool slugs that were registered.
    """
    toolkit_slug = toolkit_slug.upper()
    registered_tools = [
        sdk.tools.custom_tool(toolkit=toolkit_slug)(list_repo_entries),
        sdk.tools.custom_tool(toolkit=toolkit_slug)(read_repo_file),
        sdk.tools.custom_tool(toolkit=toolkit_slug)(search_repo_content),
    ]
    return [tool.slug for tool in registered_tools]


@dataclass(frozen=True)
class ToolDescription:
    """Lightweight representation of a tool definition for documentation."""

    name: str
    slug: str
    description: str
    input_schema: Dict[str, object]


def _tool_description_from_callable(
    toolkit_slug: str,
    func,
    request_model: type[BaseModel],
) -> ToolDescription:
    toolkit_slug = toolkit_slug.upper()
    name = f"{toolkit_slug.lower()}_{func.__name__}"
    slug = f"{toolkit_slug.upper()}_{func.__name__.upper()}"
    return ToolDescription(
        name=name,
        slug=slug,
        description=func.__doc__ or "",
        input_schema=request_model.model_json_schema(),
    )


def describe_llm_framework_tools(
    toolkit_slug: str = "LLM_FRAMEWORK",
) -> List[ToolDescription]:
    """
    Produce static metadata for documentation or dry-run previews.
    """
    return [
        _tool_description_from_callable(
            toolkit_slug,
            list_repo_entries,
            ListRepoEntriesRequest,
        ),
        _tool_description_from_callable(
            toolkit_slug,
            read_repo_file,
            ReadRepoFileRequest,
        ),
        _tool_description_from_callable(
            toolkit_slug,
            search_repo_content,
            SearchRepoContentRequest,
        ),
    ]


def describe_llm_framework_tools_as_json(toolkit_slug: str = "LLM_FRAMEWORK") -> str:
    """
    Convenience helper producing JSON output for CLI previews.
    """
    descriptions = describe_llm_framework_tools(toolkit_slug=toolkit_slug)
    return json.dumps(
        [
            {
                "name": desc.name,
                "slug": desc.slug,
                "description": desc.description,
                "input_schema": desc.input_schema,
            }
            for desc in descriptions
        ],
        indent=2,
        sort_keys=True,
    )
