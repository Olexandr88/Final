## Custom Composio provider quick start

This package mirrors the official [Composio “Python custom provider” guide](https://docs.composio.dev/providers/custom/python) and acts as a reference implementation for the two integration styles:

- **Non-agentic providers** wrap Composio tools into plain JSON schemas that can be sent directly to an LLM API (Anthropic, OpenAI responses, etc.).
- **Agentic providers** expose executable callables that can be plugged into an agent runtime (OpenAI Agents, crew orchestration frameworks, custom planners).

### Project layout

```
python/providers/myprovider/
├── README.md
├── composio_myprovider/
│   ├── __init__.py
│   ├── provider.py      # Non-agentic + agentic provider implementations
│   └── py.typed
├── myprovider_demo.py   # Demonstration script
├── pyproject.toml
└── setup.py
```

### Provider implementations

`composio_myprovider/provider.py` exports two classes:

- `MyAIProvider` (inherits `NonAgenticProvider`) transforms tools into declarative schemas and provides a helper `execute_my_ai_tool_call` for replaying tool invocations through Composio.
- `MyAgentProvider` (inherits `AgenticProvider`) converts tools into callables with the correct signature for agent frameworks and normalises error handling.

Both providers are re-exported via `composio_myprovider.__init__` for easy imports.

### Demo usage

`myprovider_demo.py` highlights both flows:

```bash
poetry run python myprovider_demo.py  # or python -m python.providers.myprovider.myprovider_demo
```

The script:

1. Registers a simple `EchoTool` with `MyAIProvider`, prints the wrapped schema, and executes it through the helper method.
2. Creates `MyAgentProvider`, wraps the same tool for an agent runtime, retrieves tools via `Composio(...).tools.get`, and simulates an agent callback by calling the wrapped tool directly.

Adjust the demo to integrate with your actual platform client (Anthropic, OpenAI Agents, LangChain, etc.).

### Creating additional providers

The Composio CLI/Make commands scaffold new providers:

```bash
# Non-agentic provider
make create-provider name=myprovider

# Agentic provider
make create-provider name=myagent agentic=true

# Specify a custom output directory
make create-provider name=myprovider output=/path/to/custom/dir
```

After scaffolding:

1. Implement the `wrap_tool` / `wrap_tools` methods per the target runtime.
2. Add optional helper methods for invoking tools in your environment.
3. Document usage in the generated `README.md` and provide demos/tests.
