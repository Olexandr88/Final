from __future__ import annotations

import os
from importlib import reload
from pathlib import Path

import pytest

import src.integrations.composio.llm_toolkit as toolkit


@pytest.fixture(autouse=True)
def reset_env(monkeypatch):
    monkeypatch.delenv("LLM_FRAMEWORK_REPO_ROOT", raising=False)
    yield
    monkeypatch.delenv("LLM_FRAMEWORK_REPO_ROOT", raising=False)


def _prepare_repo(tmp_path: Path) -> None:
    (tmp_path / "docs").mkdir()
    (tmp_path / "src").mkdir()
    (tmp_path / "docs" / "note.txt").write_text("Hello composio!\nLine two\n")
    (tmp_path / "src" / "index.js").write_text("console.log('hi');\n")


def test_list_repo_entries(tmp_path, monkeypatch):
    _prepare_repo(tmp_path)
    monkeypatch.setenv("LLM_FRAMEWORK_REPO_ROOT", str(tmp_path))
    reload(toolkit)

    request = toolkit.ListRepoEntriesRequest(
        path="docs",
        pattern="*.txt",
        recursive=False,
    )
    result = toolkit.list_repo_entries(request)
    assert result["count"] == 1
    assert result["results"][0]["path"] == "docs/note.txt"
    assert result["results"][0]["is_directory"] is False


def test_read_repo_file(tmp_path, monkeypatch):
    _prepare_repo(tmp_path)
    monkeypatch.setenv("LLM_FRAMEWORK_REPO_ROOT", str(tmp_path))
    reload(toolkit)

    request = toolkit.ReadRepoFileRequest(path="docs/note.txt", max_bytes=5)
    result = toolkit.read_repo_file(request)
    assert result["path"] == "docs/note.txt"
    assert result["truncated"] is True
    assert result["content"] == "Hello"


def test_search_repo_content(tmp_path, monkeypatch):
    _prepare_repo(tmp_path)
    monkeypatch.setenv("LLM_FRAMEWORK_REPO_ROOT", str(tmp_path))
    reload(toolkit)

    request = toolkit.SearchRepoContentRequest(
        query="composio",
        path=".",
        file_glob="*.txt",
        context_lines=0,
    )
    result = toolkit.search_repo_content(request)
    assert result["count"] == 1
    match = result["matches"][0]
    assert match["file"] == "docs/note.txt"
    assert "composio" in match["snippet"]


def test_register_dry_run(monkeypatch, tmp_path):
    _prepare_repo(tmp_path)
    monkeypatch.setenv("LLM_FRAMEWORK_REPO_ROOT", str(tmp_path))
    reload(toolkit)

    descriptions = toolkit.describe_llm_framework_tools()
    assert len(descriptions) == 3
    slugs = {desc.slug for desc in descriptions}
    expected = {
        "LLM_FRAMEWORK_LIST_REPO_ENTRIES",
        "LLM_FRAMEWORK_READ_REPO_FILE",
        "LLM_FRAMEWORK_SEARCH_REPO_CONTENT",
    }
    assert expected.issubset(slugs)
