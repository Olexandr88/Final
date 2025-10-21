## Composio Custom Toolkit

This project now exposes a lightweight Composio toolkit that wraps common
repository-centric utilities (listing files, reading files, and running text
searches). The toolkit can be registered against your Composio workspace and
then consumed from any supported provider (OpenAI Agents, MCP bridges, etc.).

### Requirements

- Python packages: `composio_openai`, `composio_openai_agents`, `openai-agents`
- Environment variable `COMPOSIO_API_KEY` set to a valid Composio API key
- Optional: `LLM_FRAMEWORK_REPO_ROOT` if you want the tools to operate on an
  alternate checkout

### Registering the Toolkit

```bash
# Inspect the schemas without calling the API
python scripts/register-composio-llm-toolkit.py --dry-run

# Register the tools with Composio (requires COMPOSIO_API_KEY)
python scripts/register-composio-llm-toolkit.py
```

The script prints the tool slugs that are provisioned (for example
`LLM_FRAMEWORK_LIST_REPO_ENTRIES`). They are immediately available through the
Composio SDK, the MCP bridge, or the OpenAI Agents provider by referencing the
toolkit slug `LLM_FRAMEWORK`.

### Available Tools

All tools return repository-relative paths and enforce safe path handling so
that inputs cannot escape the project root.

| Tool | Description |
|------|-------------|
| `LLM_FRAMEWORK_LIST_REPO_ENTRIES` | List files/directories under a path with glob filters. |
| `LLM_FRAMEWORK_READ_REPO_FILE` | Read a text file with optional byte limits and encoding selection. |
| `LLM_FRAMEWORK_SEARCH_REPO_CONTENT` | Search file contents for a literal string and return contextual snippets. |

### Integrating with Agents

```python
from composio import Composio
from composio_openai_agents import OpenAIAgentsProvider

sdk = Composio()
provider = OpenAIAgentsProvider()
tools = sdk.tools.get(
    user_id="my-user",
    toolkits=["LLM_FRAMEWORK"],
)
wrapped_tools = provider.wrap_tools(tools, sdk.tools.execute)
# `wrapped_tools` can now be forwarded to the OpenAI Agents API.
```

### Testing Helpers

Unit tests for the toolkit live under
`tests/integrations/test_composio_llm_toolkit.py`. The helpers respect the
`LLM_FRAMEWORK_REPO_ROOT` environment variable, so the tests switch to a
temporary directory without touching the real repository. You can leverage the
same environment variable locally if you want to experiment on scratch data.
