#!/usr/bin/env python
"""
Register the LLM Framework custom Composio toolkit.

Usage:
    python scripts/register-composio-llm-toolkit.py           # Registers tools
    python scripts/register-composio-llm-toolkit.py --dry-run # Prints tool schemas

The script requires the COMPOSIO_API_KEY environment variable when not running
in dry-run mode.
"""

from __future__ import annotations

import argparse
import sys
from typing import Sequence

try:
    from composio import Composio
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "The composio package is required. Install it via `pip install composio_openai`."
    ) from exc

from src.integrations.composio.llm_toolkit import (
    describe_llm_framework_tools_as_json,
    register_llm_framework_toolkit,
)


def _parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Register custom Composio tools for the LLM Framework repository."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print tool definitions without calling the Composio API.",
    )
    parser.add_argument(
        "--toolkit",
        default="LLM_FRAMEWORK",
        help="Override the toolkit slug used during registration.",
    )
    return parser.parse_args(argv)


def _dry_run(toolkit: str) -> None:
    print(describe_llm_framework_tools_as_json(toolkit_slug=toolkit))


def _register(toolkit: str) -> None:
    sdk = Composio()
    slugs = register_llm_framework_toolkit(sdk, toolkit_slug=toolkit)
    print(
        f"Registered {len(slugs)} tool(s) under toolkit '{toolkit.upper()}': "
        + ", ".join(slugs)
    )


def main(argv: Sequence[str] | None = None) -> None:
    args = _parse_args(sys.argv[1:] if argv is None else argv)
    if args.dry_run:
        _dry_run(args.toolkit)
    else:
        _register(args.toolkit)


if __name__ == "__main__":  # pragma: no cover - direct execution entry point
    main()
