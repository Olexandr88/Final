# Continue-Ollama MCP Server Guide

## Overview

The Continue-Ollama MCP server enables VS Code's [Continue extension](https://continue.dev) to use local Ollama models with full autocomplete, agent mode, and code analysis capabilities.

**Features:**
- ✅ **Auto-detection** of all installed Ollama models
- ✅ **Streaming autocomplete** with <100ms latency target
- ✅ **Agent mode** with conversation context retention
- ✅ **Code analysis** and refactoring suggestions
- ✅ **Model switching** on-the-fly
- ✅ **MCP protocol** compliance (stdio transport)

## Prerequisites

1. **Ollama** installed and running: [https://ollama.ai](https://ollama.ai)
2. **VS Code** with **Continue extension**
3. **Node.js** 18+
4. At least one Ollama model downloaded (e.g., `ollama pull llama3`)

## Installation

```bash
npm install
npm run mcp:continue
```

## Configuration

Add to `~/.continue/config.json`:

```json
{
  "mcpServers": {
    "ollama": {
      "command": "node",
      "args": ["C:\\Users\\scarm\\src\\mcp\\continue-ollama-server.js"],
      "env": {
        "OLLAMA_ENDPOINT": "http://localhost:11434",
        "OLLAMA_DEFAULT_MODEL": "llama3"
      }
    }
  }
}
```

## npm Scripts

```bash
npm run mcp:continue       # Start MCP server (stdio)
npm run mcp:continue:dev   # Start with development logging
npm test tests/continue-ollama-mcp.test.js
```

**Version:** 1.0.0
