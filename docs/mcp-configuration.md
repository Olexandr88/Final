# MCP Server Configuration for Claude Code

## Overview

The LLM Framework MCP (Model Context Protocol) server has been successfully configured for Claude Code integration. This enables Claude Code to access the framework's AI agents, code analysis tools, and multi-provider LLM capabilities.

## Configuration Location

**File**: `C:\Users\scarm\.claude\mcp.json`

The configuration has been added to the existing MCP server list under the key `llm-framework`.

## Configuration Details

```json
{
  "mcpServers": {
    "llm-framework": {
      "command": "node",
      "args": ["C:\\Users\\scarm\\src\\mcp\\index.js"],
      "env": {
        "NODE_ENV": "production",
        "LOG_LEVEL": "info",
        "AI_BRIDGE_PORT": "65028",
        "AI_BRIDGE_HTTP_PORT": "65029",
        "PORT": "8080"
      },
      "description": "LLM Framework MCP Server - Multi-provider LLM orchestration with AI Bridge integration",
      "scope": "project",
      "disabled": false,
      "alwaysAllow": []
    }
  }
}
```

## Transport Type

- **Transport**: stdio (Standard Input/Output)
- **Protocol**: MCP 1.0.4 (@modelcontextprotocol/sdk)
- **Communication**: Bidirectional JSON-RPC over stdin/stdout

## Available Tools

The MCP server exposes the following tools to Claude Code:

### 1. `analyze_code`

Analyze code for bugs, security issues, and quality metrics.

**Input Schema**:

```typescript
{
  code: string;           // Source code to analyze
  filepath?: string;      // File path for context
  language?: string;      // Programming language (auto-detected)
}
```

**Output**: Analysis results with quality scores, issues, and recommendations.

---

### 2. `run_tests`

Execute test suite and return results.

**Input Schema**:

```typescript
{
  pattern?: string;      // Test file pattern (default: "tests")
  timeout?: number;      // Timeout in ms (default: 30000)
  parallel?: boolean;    // Run in parallel (default: true)
}
```

**Output**: Test results with pass/fail counts and output.

---

### 3. `get_context`

Retrieve session context and state information.

**Input Schema**:

```typescript
{
  sessionId?: string;       // Session ID (uses current if not provided)
  includeHistory?: boolean; // Include log history (default: false)
}
```

**Output**: Session information, locks, and working directory.

---

### 4. `execute_command`

Execute shell commands safely with timeout and validation.

**Input Schema**:

```typescript
{
  command: string;       // Shell command to execute
  cwd?: string;          // Working directory
  timeout?: number;      // Timeout in ms (default: 10000)
  env?: object;          // Environment variables
}
```

**Output**: Command execution results with stdout/stderr.

---

### 5. `read_file`

Read file contents with encoding support.

**Input Schema**:

```typescript
{
  filepath: string;      // Absolute or relative file path
  encoding?: string;     // File encoding (default: "utf-8")
  maxSize?: number;      // Max file size in bytes (default: 1MB)
}
```

**Output**: File content, size, and modification time.

---

### 6. `write_file`

Write content to file with backup and validation.

**Input Schema**:

```typescript
{
  filepath: string;         // Absolute or relative file path
  content: string;          // File content to write
  encoding?: string;        // File encoding (default: "utf-8")
  createBackup?: boolean;   // Create backup (default: true)
}
```

**Output**: Write success confirmation with file details.

---

## Environment Variables

The following environment variables are configured:

- `NODE_ENV`: `production`
- `LOG_LEVEL`: `info`
- `AI_BRIDGE_PORT`: `65028` (WebSocket port for AI Bridge)
- `AI_BRIDGE_HTTP_PORT`: `65029` (HTTP API port for AI Bridge)
- `PORT`: `8080` (Server port)

## Starting the MCP Server

### Manual Start (for testing):

```bash
# Standard mode
npm run mcp:start

# Debug mode with verbose logging
npm run mcp:debug

# Or directly
node src/mcp/index.js
node src/mcp/index.js --debug
```

### Automatic Start:

Claude Code will automatically start the MCP server when needed using the stdio transport. No manual startup is required when using Claude Code.

## Verification

To verify the MCP server is working:

1. **Restart Claude Code** to load the new configuration
2. **Check available tools** in Claude Code's MCP tool list
3. **Test a tool** by asking Claude to analyze code or run tests

## Integration with AI Bridge

The MCP server integrates with the AI Bridge system:

- **AI Bridge WebSocket**: `ws://localhost:65028`
- **AI Bridge HTTP API**: `http://localhost:65029`

To use AI Bridge features:

```bash
# Start the AI Bridge
npm run bridge:start

# Start agents
npm run agent:analyzer
npm run agent:ollama
npm run agent:claude

# Or start everything together
npm run system:start
```

## Security Features

1. **Command Validation**: Dangerous commands (rm -rf /, format, etc.) are blocked
2. **File Size Limits**: Default 1MB limit on file reads
3. **Timeout Protection**: All operations have configurable timeouts
4. **Backup Creation**: Automatic backups before file overwrites
5. **Path Validation**: Resolves and validates file paths

## Scope

- **Scope**: `project`
- **Working Directory**: `C:\Users\scarm` (project root)
- **Access Level**: Project-level tools and files

## Troubleshooting

### Issue: MCP server not connecting

**Solution**:

1. Check that Node.js is in PATH
2. Verify `src/mcp/index.js` exists
3. Check `.claude\mcp.json` syntax is valid JSON
4. Restart Claude Code

### Issue: Tools not appearing

**Solution**:

1. Ensure `disabled: false` in configuration
2. Check environment variables are set
3. Review Claude Code logs for errors
4. Verify MCP SDK is installed: `npm list @modelcontextprotocol/sdk`

### Issue: Commands timing out

**Solution**:

1. Increase timeout values in `.claude\mcp.json`
2. Check system performance
3. Verify AI Bridge is running if needed

### Issue: Permission errors

**Solution**:

1. Check file permissions on project directory
2. Verify Node.js has necessary permissions
3. Run Claude Code with appropriate privileges

## Testing the Configuration

Test the MCP server manually:

```bash
# Run help command
node src/mcp/index.js --help

# Test with debug logging
node src/mcp/index.js --debug

# Verify MCP SDK installation
npm list @modelcontextprotocol/sdk
```

## Additional Resources

- **MCP Specification**: https://modelcontextprotocol.io
- **Anthropic MCP Docs**: https://docs.anthropic.com/en/docs/build-with-claude/mcp
- **Project CLAUDE.md**: `C:\Users\scarm\CLAUDE.md`
- **LLM Framework Repository**: https://github.com/Scarmonit/LLM

## Next Steps

1. Restart Claude Code to load the new configuration
2. Test the MCP tools with a simple code analysis
3. Explore integrating with the AI Bridge for advanced agent coordination
4. Review logs at `C:\Users\scarm\.claude\logs\mcp-audit.log` for audit trail

---

**Configuration Status**: ✅ Complete
**Last Updated**: 2025-10-20
**Version**: 2.1.1-parallel-optimized
