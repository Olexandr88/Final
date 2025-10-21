"""
Composio integration helpers for the LLM Framework project.

Expose utilities to register the local repository as a custom Composio toolkit
and share a small library of repo-aware tools with other agent frameworks.
"""

from .llm_toolkit import (
    describe_llm_framework_tools,
    register_llm_framework_toolkit,
    ListRepoEntriesRequest,
    ReadRepoFileRequest,
    SearchRepoContentRequest,
)

__all__ = [
    "describe_llm_framework_tools",
    "register_llm_framework_toolkit",
    "ListRepoEntriesRequest",
    "ReadRepoFileRequest",
    "SearchRepoContentRequest",
]
