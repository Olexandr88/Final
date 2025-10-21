# MCP Server Implementation

Complete Model Context Protocol (MCP) server for the LLM Framework, enabling IDE integration and standardized tool access.

## Overview

This MCP server provides standardized access to LLM Framework capabilities including code analysis, test execution, session management, and file operations. It uses the official `@modelcontextprotocol/sdk` for Claude Desktop, Continue.dev, and other MCP-compatible IDEs.

## Architecture

```
src/mcp/
├── index.js              # Entry point (stdio transport)
├── mcp-server.js         # Core MCP server implementation
├── mcp-integration.js    # Legacy integration layer
└── README.md            # Documentation

Integration Flow:
IDE (Claude Desktop/Continue.dev/VS Code)
        ↓ (stdio transport)
    MCP Server (index.js)
        ↓
    MCPServer class (mcp-server.js)
        ↓
    Tool Handlers
        ↓
    LLM Framework Components
    ├── Code Analyzer Agent
    ├── Session Manager
    ├── Context Manager
    └── File System
```

## Installation

The MCP server is built into the LLM framework. No additional installation required.

Dependencies (already in package.json):
- `@modelcontextprotocol/sdk` ^1.0.4
- `@anthropic-ai/sdk` ^0.67.0

## Usage

### Starting the Server

```bash
# Start with default settings
npm run mcp:start

# Start with debug logging
npm run mcp:debug

# Start with custom working directory
node src/mcp/index.js --cwd /path/to/project
```

### Jules-Focused MCP Server

The project also ships a lightweight MCP server that only exposes Jules-centric tooling. Launch it when you just need Jules session management inside an MCP-compatible client.

```bash
# Start the Jules server (stdio transport)
npm run mcp:jules
```

Available Jules tools:

| Tool | Description |
|------|-------------|
| `jules_create_session` | Create a Jules session for a repository/source. |
| `jules_list_sessions` | List accessible Jules sessions. |
| `jules_get_session` | Fetch details for a specific session. |
| `jules_send_message` | Send a follow-up message to an existing session. |

Configure `JULES_API_KEY` in `.env` before starting the server. When calling `jules_get_session`, pass the numeric `id` returned by `jules_list_sessions` (the server will also accept a full resource name like `sessions/123` and normalize it for you).

### Command Line Options

```
--debug              Enable debug logging
--name <name>        Server name (default: llm-framework-mcp)
--version <version>  Server version (default: 1.0.0)
--cwd <path>         Working directory (default: current directory)
--help, -h           Show help message
```

## IDE Integration

### Claude Desktop

Add to `~/.claude/config.json` (macOS/Linux) or `%APPDATA%\Claude\config.json` (Windows):

```json
{
  "mcpServers": {
    "llm-framework": {
      "command": "node",
      "args": [
        "C:/Users/scarm/src/mcp/index.js"
      ],
      "cwd": "C:/Users/scarm",
      "env": {
        "LOG_LEVEL": "INFO"
      }
    }
  }
}
```

### Continue.dev

Add to `~/.continue/config.json`:

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "name": "llm-framework",
        "command": "node",
        "args": ["C:\\Users\\scarm\\src\\mcp\\index.js"],
        "cwd": "C:\\Users\\scarm"
      }
    ]
  }
}
```

### VS Code (via Claude Code Extension)

Add to `.vscode/settings.json`:

```json
{
  "claude.mcpServers": {
    "llm-framework": {
      "command": "node",
      "args": ["src/mcp/index.js"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

## Available Tools

### 1. analyze_code

Analyze source code for bugs, security issues, and quality metrics using AST-based analysis.

**Parameters:**
- `code` (string, required): Source code to analyze
- `filepath` (string, optional): File path for context
- `language` (string, optional): Programming language (auto-detected)

**Response:**
```json
{
  "success": true,
  "filepath": "example.js",
  "metrics": {
    "qualityScore": 85,
    "complexity": 12,
    "maintainability": 78
  },
  "issues": {
    "total": 3,
    "errors": 1,
    "warnings": 2,
    "info": 0
  },
  "details": [
    {
      "line": 10,
      "severity": "warning",
      "message": "Prefer const over let",
      "category": "style"
    }
  ],
  "recommendations": [
    "Consider refactoring complex functions"
  ]
}
```

### 2. run_tests

Execute test suite with configurable options.

**Parameters:**
- `pattern` (string, optional): Test file pattern (default: "tests")
- `timeout` (number, optional): Timeout in ms (default: 30000)
- `parallel` (boolean, optional): Run tests in parallel (default: true)

**Response:**
```json
{
  "success": true,
  "passed": 45,
  "failed": 2,
  "skipped": 1,
  "duration": 5432,
  "output": "..."
}
```

### 3. get_context

Retrieve session context and state information.

**Parameters:**
- `sessionId` (string, optional): Session ID (uses current if not provided)
- `includeHistory` (boolean, optional): Include log history (default: false)

**Response:**
```json
{
  "session": {
    "id": "abc123...",
    "pid": 12345,
    "startTime": 1698765432000,
    "status": "active",
    "uptime": 123456
  },
  "locks": [],
  "workingDirectory": "/path/to/project"
}
```

### 4. execute_command

Execute shell commands safely with validation.

**Parameters:**
- `command` (string, required): Shell command to execute
- `cwd` (string, optional): Working directory
- `timeout` (number, optional): Timeout in ms (default: 10000)
- `env` (object, optional): Environment variables

**Response:**
```json
{
  "success": true,
  "exitCode": 0,
  "stdout": "v20.19.0\n",
  "stderr": ""
}
```

**Security:** Dangerous commands (e.g., `rm -rf /`) are blocked.

### 5. read_file

Read file contents with encoding support.

**Parameters:**
- `filepath` (string, required): File path (absolute or relative)
- `encoding` (string, optional): File encoding (default: "utf-8")
- `maxSize` (number, optional): Max file size in bytes (default: 1MB)

**Response:**
```json
{
  "success": true,
  "filepath": "/absolute/path/file.txt",
  "content": "file contents...",
  "size": 1024,
  "modified": "2025-10-20T12:00:00.000Z"
}
```

### 6. write_file

Write content to file with backup support.

**Parameters:**
- `filepath` (string, required): File path (absolute or relative)
- `content` (string, required): Content to write
- `encoding` (string, optional): File encoding (default: "utf-8")
- `createBackup` (boolean, optional): Create backup (default: true)

**Response:**
```json
{
  "success": true,
  "filepath": "/absolute/path/file.txt",
  "size": 1024,
  "modified": "2025-10-20T12:00:00.000Z"
}
```

### 7. jules_list_sessions

List Jules sessions available to the configured `JULES_API_KEY`.

**Parameters:**
- `page_size` (number, optional): Number of sessions to return (default: 10)
- `page_token` (string, optional): Pagination token from a previous call

**Response:**
```json
{
  "success": true,
  "sessions": [
    {
      "name": "sessions/8882450117182433887",
      "title": "Setup environment",
      "state": "IN_PROGRESS",
      "id": "8882450117182433887"
    }
  ],
  "nextPageToken": "1760970107408046714"
}
```

### 8. jules_get_session

Fetch detailed information for a single Jules session. Accepts either the numeric session ID or a resource name (`sessions/<id>`).

**Parameters:**
- `session_id` (string, required): Session identifier (numeric ID or resource name)

**Response:**
```json
{
  "success": true,
  "sessionId": "sessions/8882450117182433887",
  "session": {
    "name": "sessions/8882450117182433887",
    "title": "Setup environment",
    "state": "IN_PROGRESS",
    "prompt": "Setup environment..."
  }
}
```

### 9. jules_create_session

Create a Jules session for a repository/source.

**Parameters:**
- `prompt` (string, required): Task prompt for Jules
- `source_id` (string, required): Source identifier (e.g., `sources/github/owner/repo`)
- `title` (string, optional): Session title
- `starting_branch` (string, optional): Repository branch (default: `main`)

**Response:**
```json
{
  "success": true,
  "sessionId": "8882450117182433887",
  "data": {
    "name": "sessions/8882450117182433887",
    "url": "https://jules.google.com/session/8882450117182433887"
  }
}
```

### 10. jules_send_message

Send a follow-up message to an existing Jules session.

**Parameters:**
- `session_id` (string, required): Session identifier (numeric ID or resource name)
- `message` (string, required): Message content to send

**Response:**
```json
{
  "success": true,
  "sessionId": "sessions/8882450117182433887",
  "data": {
    "acknowledged": true
  }
}
```

## Testing

Run MCP server tests:

```bash
# Run MCP server tests
npm test tests/mcp-server.test.js

# Run with coverage
npm run test:coverage
```

Test coverage includes:
- Tool definitions and schemas
- Code analysis functionality
- File read/write operations
- Command execution and validation
- Session context retrieval
- Error handling and edge cases

### Manual Testing

Test the server manually:

```bash
# Start server
npm run mcp:debug

# In another terminal, test with stdio
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node src/mcp/index.js
```

## Integration with Framework Components

The MCP server integrates with existing LLM framework components:

- **Code Analyzer Agent** (`src/agents/code-analyzer-agent.js`): Used for `analyze_code` tool
- **Session Manager** (`src/session-manager.js`): Provides session context and state
- **Logger** (`src/utils/logger.js`): Structured logging with history

## Security

### Command Execution Safety

The `execute_command` tool implements security measures:

1. **Dangerous Pattern Detection**: Blocks commands like `rm -rf /`, `format c:`, etc.
2. **Timeout Protection**: Prevents long-running commands from blocking
3. **Working Directory Validation**: Ensures commands run in safe locations
4. **Environment Isolation**: Controlled environment variable access

### File Operation Safety

File operations include:

1. **Path Validation**: Absolute path resolution to prevent traversal attacks
2. **Size Limits**: Maximum file size enforcement (default 1MB)
3. **Backup Creation**: Automatic backups before overwriting files
4. **Error Handling**: Graceful failure with detailed error messages

## Error Handling

The MCP server uses standardized error codes from the MCP specification:

- `InvalidParams`: Invalid or missing parameters
- `MethodNotFound`: Unknown tool requested
- `InternalError`: Server-side execution errors

All errors are logged and returned in a consistent format.

## Troubleshooting

### Server Won't Start

1. Check Node.js version: `node --version` (requires >=18.0.0)
2. Verify dependencies: `npm install`
3. Check for port conflicts (stdio transport doesn't use ports)
4. Review logs in debug mode: `npm run mcp:debug`

### Tool Execution Failures

1. Verify tool parameters match schema
2. Check file paths are absolute or relative to working directory
3. Ensure proper permissions for file operations
4. Review command validation for `execute_command`

### IDE Integration Issues

1. Verify config file location and syntax
2. Check command path in IDE config
3. Ensure working directory is correct
4. Test server manually: `npm run mcp:start`
5. Review IDE's MCP server logs

## Performance

The MCP server is optimized for:

- **Fast Startup**: < 500ms initialization time
- **Low Memory**: < 100MB baseline memory usage
- **Concurrent Requests**: Handles multiple tool calls efficiently
- **Session Management**: Connection pooling for database operations

## Logging

Logging levels (set via `LOG_LEVEL` env var):

- `ERROR`: Critical errors only
- `WARN`: Warnings and errors
- `INFO`: Standard operations (default)
- `DEBUG`: Detailed debugging information

## Development

### Adding New Tools

1. Add tool definition to `_defineTools()` method
2. Implement handler method (e.g., `_handleNewTool()`)
3. Add case to request handler in `_setupHandlers()`
4. Update tests in `tests/mcp-server.test.js`
5. Document in this README

### Contributing

Follow the project's coding conventions in `CLAUDE.md`:

1. ESM modules only (import/export)
2. Async/await for async operations
3. Proper error handling with try-catch
4. Structured logging via Logger
5. JSDoc comments for public APIs
6. Comprehensive test coverage

## Support

- GitHub Issues: https://github.com/Scarmonit/LLM/issues
- Email: scarmonit@gmail.com

## License

ISC License - See project root LICENSE file

---

**Version**: 1.0.0
**Last Updated**: 2025-10-20
**Maintainer**: scarmonit
