"""Minimal demonstration of the custom provider implementations."""

from __future__ import annotations

import asyncio
from pprint import pprint

from composio import Composio
from composio.core.tool import tool
from composio.local_tools import LocalToolSet

from composio_myprovider.provider import MyAIProvider, MyAgentProvider


@tool(name="EchoTool", description="A simple tool that echoes back the input.")
def echo(message: str) -> str:
    """Example tool used for both provider variants."""
    return message


async def demo_non_agentic() -> None:
    provider = MyAIProvider()
    toolset = LocalToolSet(tools=[echo])
    await provider.register_toolset(toolset)

    wrapped_tools = provider.get_tools()
    print("Non-agentic wrapped tools:")
    pprint(wrapped_tools)

    tool_call = {"name": "EchoTool", "arguments": {"message": "Hello, world!"}}
    response = await asyncio.to_thread(
        provider.execute_my_ai_tool_call,
        user_id="default",
        tool_call=tool_call,
    )
    print("Non-agentic execution response:", response)


async def demo_agentic() -> None:
    provider = MyAgentProvider()
    toolset = LocalToolSet(tools=[echo])
    await provider.register_toolset(toolset)

    composio = Composio(provider=provider)
    tools = composio.tools.get(user_id="default")
    print("Agentic tool metadata:")
    pprint(tools)

    # Simulate an agent runtime calling back into the provider.
    agent_tool = provider.get_tools()[0]
    result = agent_tool.execute(message="Agent hello")
    print("Agentic execution result:", result)


async def main() -> None:
    await demo_non_agentic()
    await demo_agentic()


if __name__ == "__main__":
    asyncio.run(main())