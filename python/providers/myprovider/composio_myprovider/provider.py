"""Example custom Composio providers for bespoke AI runtimes.

This module demonstrates both non-agentic and agentic provider patterns as
documented in https://docs.composio.dev/providers/custom/python. The goal is
to showcase how Composio tools can be adapted to the formats expected by
different execution environments.
"""

from __future__ import annotations

from typing import Callable, Dict, List, Optional, Sequence, TypeAlias

from composio.core.provider import (
    AgenticProvider,
    AgenticProviderExecuteFn,
    NonAgenticProvider,
)
from composio.types import (
    Modifiers,
    Tool,
    ToolExecutionResponse,
)

# ---------------------------------------------------------------------------
# Non-agentic provider example
# ---------------------------------------------------------------------------


class MyAITool:
    """Simple container that mirrors a generic JSON tool schema."""

    def __init__(self, name: str, description: str, parameters: dict):
        self.name = name
        self.description = description
        self.parameters = parameters

    def __repr__(self) -> str:  # pragma: no cover - convenience for demos
        return f"MyAITool(name={self.name!r}, description={self.description!r})"


MyAIToolCollection: TypeAlias = List[MyAITool]


class MyAIProvider(NonAgenticProvider[MyAITool, MyAIToolCollection], name="my-ai-platform"):
    """Custom provider for a hypothetical non-agentic AI platform."""

    def wrap_tool(self, tool: Tool) -> MyAITool:
        """Transform a single Composio tool into the platform format."""
        return MyAITool(
            name=tool.slug,
            description=tool.description or "",
            parameters={
                "type": "object",
                "properties": tool.input_parameters.get("properties", {}),
                "required": tool.input_parameters.get("required", []),
            },
        )

    def wrap_tools(self, tools: Sequence[Tool]) -> MyAIToolCollection:
        """Transform a collection of tools."""
        return [self.wrap_tool(tool) for tool in tools]

    # Optional helper demonstrating how to reuse Composio's executor
    def execute_my_ai_tool_call(
        self,
        user_id: str,
        tool_call: dict,
        modifiers: Optional[Modifiers] = None,
    ) -> ToolExecutionResponse:
        """Execute a tool call that follows the platform's schema."""
        return self.execute_tool(
            slug=tool_call["name"],
            arguments=tool_call.get("arguments", {}),
            modifiers=modifiers,
            user_id=user_id,
        )


# ---------------------------------------------------------------------------
# Agentic provider example
# ---------------------------------------------------------------------------


class AgentTool:
    """Light-weight wrapper that matches a generic agent runtime contract."""

    def __init__(
        self,
        name: str,
        description: str,
        execute: Callable[..., Dict],
        schema: dict,
    ):
        self.name = name
        self.description = description
        self.execute = execute
        self.schema = schema

    def __repr__(self) -> str:  # pragma: no cover - convenience for demos
        return f"AgentTool(name={self.name!r}, description={self.description!r})"


AgentToolCollection: TypeAlias = List[AgentTool]


class MyAgentProvider(AgenticProvider[AgentTool, AgentToolCollection], name="my-agent-platform"):
    """Custom provider geared towards agent runtimes that expect callables."""

    def wrap_tool(
        self,
        tool: Tool,
        execute_tool: AgenticProviderExecuteFn,
    ) -> AgentTool:
        """Transform a single Composio tool into the agent runtime format."""

        def execute_wrapper(**kwargs: Dict) -> Dict:
            result = execute_tool(tool.slug, kwargs)
            if not result.get("successful", False):
                raise RuntimeError(result.get("error", "Tool execution failed"))
            return result.get("data", {})

        return AgentTool(
            name=tool.slug,
            description=tool.description or "",
            execute=execute_wrapper,
            schema=tool.input_parameters,
        )

    def wrap_tools(
        self,
        tools: Sequence[Tool],
        execute_tool: AgenticProviderExecuteFn,
    ) -> AgentToolCollection:
        """Transform the collection of tools for the agent runtime."""
        return [self.wrap_tool(tool, execute_tool) for tool in tools]
