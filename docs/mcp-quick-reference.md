# LLM Framework MCP Server - Quick Reference

## Configuration File

**Location**: `C:\Users\scarm\.claude\mcp.json`

## Quick Start Commands

```bash
# Test MCP server
npm run mcp:start

# Debug mode
npm run mcp:debug

# Start with AI Bridge
npm run system:start
```

## Available MCP Tools

| Tool                   | Description                                    | Key Parameters                           |
| ---------------------- | ---------------------------------------------- | ---------------------------------------- |
| `analyze_code`         | Code analysis for bugs and quality             | `code`, `filepath`, `language`           |
| `run_tests`            | Execute test suite                             | `pattern`, `timeout`, `parallel`         |
| `get_context`          | Get session context                            | `sessionId`, `includeHistory`            |
| `execute_command`      | Run shell commands safely                      | `command`, `cwd`, `timeout`, `env`       |
| `read_file`            | Read file contents                             | `filepath`, `encoding`, `maxSize`        |
| `write_file`           | Write to file with backup                      | `filepath`, `content`, `createBackup`    |
| `jules_list_sessions`  | List Jules sessions (requires `JULES_API_KEY`) | `page_size`, `page_token`                |
| `jules_get_session`    | Fetch details for a Jules session              | `session_id`                             |
| `jules_create_session` | Create a Jules session for a source            | `prompt`, `source_id`, `starting_branch` |
| `jules_send_message`   | Send a message to a Jules session              | `session_id`, `message`                  |

## Configuration Summary

```json
{
  "command": "node",
  "args": ["C:\\Users\\scarm\\src\\mcp\\index.js"],
  "transport": "stdio",
  "scope": "project"
}
```

## Environment Variables

- `NODE_ENV`: production
- `LOG_LEVEL`: info
- `AI_BRIDGE_PORT`: 65028
- `AI_BRIDGE_HTTP_PORT`: 65029
- `JULES_API_KEY`: required for Jules MCP tools

## Integration Points

### With Claude Code

- Automatic startup via stdio transport
- Tools appear in Claude Code's tool palette
- JSON-RPC communication over stdin/stdout

### With AI Bridge

- WebSocket: ws://localhost:65028
- HTTP API: http://localhost:65029
- Multi-agent orchestration

## Common Issues

| Issue              | Solution                                          |
| ------------------ | ------------------------------------------------- |
| Tools not showing  | Restart Claude Code, check `disabled: false`      |
| Connection timeout | Increase timeout in config, check Node.js version |
| Permission errors  | Verify file permissions, run with admin if needed |
| AI Bridge offline  | Start with `npm run bridge:start`                 |

## File Locations

- **MCP Server**: `src/mcp/index.js`
- **MCP Config**: `.claude/mcp.json`
- **Audit Logs**: `.claude/logs/mcp-audit.log`
- **Documentation**: `docs/mcp-configuration.md`

## Security Features

- ✅ Command validation (blocks dangerous operations)
- ✅ File size limits (1MB default)
- ✅ Timeout protection (configurable)
- ✅ Automatic backups before overwrites
- ✅ Path validation and resolution

## Status Check

```bash
# Check if MCP server is configured
cat .claude/mcp.json | grep "llm-framework"

# Verify dependencies
npm list @modelcontextprotocol/sdk

# Test help command
node src/mcp/index.js --help
```

## Next Steps After Configuration

1. ✅ **Restart Claude Code** - Load new MCP configuration
2. ✅ **Verify Tools** - Check tools appear in Claude Code
3. ✅ **Test Tool** - Try analyze_code or get_context
4. ✅ **Start AI Bridge** - `npm run bridge:start` for advanced features
5. ✅ **Review Logs** - Check `.claude/logs/` for any errors

---

**Quick Access**: Press `Ctrl+K` in Claude Code to access MCP tools
