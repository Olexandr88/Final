# MCP Server Configuration

This document describes the Model Context Protocol (MCP) servers configured for this project.

## Overview

MCP servers enable Claude Code to interact with external tools and services. This project has three MCP servers configured in `.mcp.json`:

## Configured Servers

### 1. GitHub MCP Server
**Package**: `@modelcontextprotocol/server-github`

**Purpose**: Provides direct GitHub repository access, PR management, and issue tracking capabilities.

**Features**:
- Repository operations (clone, pull, push)
- Pull request management (create, review, merge)
- Issue tracking (create, update, close)
- Branch management
- Commit history access

**Configuration**:
```json
{
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
  }
}
```

**Requirements**: Set `GITHUB_TOKEN` environment variable with a GitHub Personal Access Token.

### 2. Filesystem MCP Server
**Package**: `@modelcontextprotocol/server-filesystem`

**Purpose**: Provides safe filesystem access for reading and writing files within the project directory.

**Features**:
- Read file contents
- Write and modify files
- Directory traversal
- File search operations
- Sandboxed to project directory: `/home/user/Final`

**Configuration**:
```json
{
  "command": "npx",
  "args": [
    "-y",
    "@modelcontextprotocol/server-filesystem",
    "${PROJECT_DIR}"
  ]
}
```

**Security**: Limited to the project directory for safety.

### 3. Sequential Thinking MCP Server
**Package**: `@modelcontextprotocol/server-sequential-thinking`

**Purpose**: Enables deep reasoning and multi-step problem-solving capabilities.

**Features**:
- Complex problem decomposition
- Step-by-step analysis
- Logical reasoning chains
- Planning and strategy development
- Enhanced problem-solving for difficult tasks

**Configuration**:
```json
{
  "command": "npx",
  "args": [
    "-y",
    "@modelcontextprotocol/server-sequential-thinking"
  ]
}
```

## Usage

### Activating MCP Servers

The MCP servers are automatically loaded when Claude Code starts in this project. To enable/disable specific servers:

1. **View available servers**: Run `/mcp` command in Claude Code
2. **Enable/disable servers**: Use `@server-name` to toggle servers
3. **Check server status**: Available in the MCP management interface

### Environment Variables

Create a `.env` file in the project root with:

```bash
# GitHub MCP Server
GITHUB_TOKEN=your_github_personal_access_token_here
```

To create a GitHub token:
1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Generate new token (classic)
3. Select scopes: `repo`, `read:org`, `workflow`
4. Copy token to `.env` file

### Testing MCP Configuration

To verify MCP servers are working:

```bash
# Check if .mcp.json is valid
cat .mcp.json | jq .

# Verify environment variables
echo $GITHUB_TOKEN
```

In Claude Code:
1. Start a new session
2. Run `/mcp` to view server status
3. Try using a server feature (e.g., "list GitHub issues")

## Integration with Project

### With Jules Automation
MCP servers integrate with Jules automation system for:
- Automated PR creation and management
- Issue tracking and auto-assignment
- File operations during auto-fixes
- Deep analysis for optimization tasks

### With Agent Orchestrator
The agent orchestrator (`scripts/autonomous-orchestrator.js`) can leverage:
- GitHub MCP for repository operations
- Filesystem MCP for code analysis
- Sequential Thinking MCP for complex decision-making

### With Dashboard
Dashboard monitoring includes:
- MCP server health status
- Active server count
- Tool usage metrics
- Error tracking

## Troubleshooting

### Server Not Starting

**Issue**: MCP server fails to start

**Solutions**:
1. Check if `npx` is available: `npx --version`
2. Verify package can be installed: `npx -y @modelcontextprotocol/server-github --version`
3. Check logs in Claude Code with `--mcp-debug` flag
4. Ensure environment variables are set

### GitHub Token Issues

**Issue**: GitHub MCP server authentication fails

**Solutions**:
1. Verify `GITHUB_TOKEN` is set: `echo $GITHUB_TOKEN`
2. Check token has required scopes
3. Test token: `curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user`
4. Regenerate token if expired

### Permission Denied

**Issue**: Filesystem MCP server can't access files

**Solutions**:
1. Verify paths are within `<project-root>` (replace with your actual project directory)
2. Check file permissions: `ls -la <file>`
3. Ensure Claude Code has read/write access
4. Review permission rules in `/permissions`

## Advanced Configuration

### Custom Server Paths

To use a different filesystem path:

```json
{
  "filesystem": {
    "command": "npx",
    "args": [
      "-y",
      "@modelcontextprotocol/server-filesystem",
      "/custom/path/here"
    ]
  }
}
```

### Additional MCP Servers

To add more MCP servers, edit `.mcp.json`:

```json
{
  "mcpServers": {
    "existing-servers": "...",
    "new-server": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-new"],
      "env": {
        "CONFIG_VAR": "${ENV_VAR}"
      }
    }
  }
}
```

### Server Timeouts

Set custom timeouts via environment variables:

```bash
MCP_TIMEOUT=30000           # Server startup timeout (ms)
MCP_TOOL_TIMEOUT=60000      # Tool execution timeout (ms)
```

## Resources

- [MCP Documentation](https://modelcontextprotocol.io/)
- [Claude Code MCP Guide](https://docs.claude.com/en/docs/claude-code/mcp)
- [Available MCP Servers](https://github.com/modelcontextprotocol)
- [GitHub MCP Server](https://github.com/modelcontextprotocol/servers/tree/main/src/github)
- [Filesystem MCP Server](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem)
- [Sequential Thinking MCP Server](https://github.com/modelcontextprotocol/servers/tree/main/src/sequential-thinking)

## Future A2A MCP Integration

This project is prepared for Agent-to-Agent (A2A) MCP integration. To add A2A capabilities:

1. Identify or create an A2A MCP server
2. Add configuration to `.mcp.json`
3. Update this documentation
4. Integrate with agent orchestrator
5. Test multi-agent communication

The current setup provides a foundation for A2A communication through the GitHub and filesystem servers, enabling agents to:
- Share code and documentation via filesystem
- Coordinate through GitHub issues and PRs
- Use sequential thinking for complex multi-agent planning

## Support

For issues with MCP configuration:
1. Check `/mcp` in Claude Code for server status
2. Review logs with `--mcp-debug` flag
3. Consult [project issues](https://github.com/Scarmonit/Final/issues)
4. Reference Claude Code documentation

---

Last Updated: October 21, 2025
Project: Final - AI Agent Infrastructure
