# Continue.dev MCP Integration - Quick Start Guide

## What is This?

This integration connects Continue.dev VS Code extension to the LLM Framework via Model Context Protocol (MCP), enabling Continue to access advanced code analysis, context management, and session coordination tools.

## Prerequisites

- VS Code with Continue.dev extension installed
- Node.js >= 18.0.0
- LLM Framework project setup

## Installation Steps

### 1. Verify Configuration

The MCP server is already configured in your Continue.dev settings:

**Location:** `C:\Users\scarm\.continue\config.json`

**Configuration:**

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "name": "llm-framework",
        "description": "LLM Framework MCP Server",
        "command": "node",
        "args": ["C:\\Users\\scarm\\src\\mcp\\server.js"],
        "tools": ["analyze_code", "manage_context", "coordinate_session", "monitor_performance"]
      }
    ]
  }
}
```

### 2. Test MCP Server

Verify the MCP server works correctly:

```bash
# Run automated tests
npm run mcp:test

# Or manually start the server
npm run mcp:server
```

### 3. Restart VS Code

For Continue.dev to load the new MCP configuration:

1. Close VS Code completely
2. Reopen VS Code
3. Open your LLM Framework project

### 4. Verify Integration

Open Continue.dev chat panel and try these prompts:

**Test 1: Code Analysis**

```
Analyze this code for performance issues:

async function fetchData() {
  const response = await fetch('/api/data');
  return response.json();
}
```

**Test 2: Context Management**

```
Save the current conversation context with key "session-123"
```

**Test 3: Performance Monitoring**

```
Monitor memory usage for 5 seconds
```

## Available Tools

### 1. analyze_code

Analyze code for patterns, anti-patterns, and quality metrics.

**Use cases:**

- Security vulnerability detection
- Performance optimization suggestions
- Code quality assessment
- Pattern detection

**Example prompt:**

> "Analyze this function for security issues: [paste code]"

### 2. manage_context

Manage conversation context and memory.

**Use cases:**

- Save conversation state
- Load previous context
- Clear memory
- Compress large contexts

**Example prompt:**

> "Save this conversation context as 'feature-auth'"

### 3. coordinate_session

Coordinate multi-agent sessions.

**Use cases:**

- Create collaborative coding sessions
- Track agent participation
- Monitor session status

**Example prompt:**

> "Create a new coding session called 'refactor-api'"

### 4. monitor_performance

Monitor system performance metrics.

**Use cases:**

- Track memory usage
- Monitor CPU utilization
- Measure operation latency
- System health checks

**Example prompt:**

> "Show current memory and CPU usage"

## Common Usage Patterns

### Code Review Workflow

1. **Analyze Code:**

   ```
   Analyze this pull request for quality and security:
   [paste code diff]
   ```

2. **Save Context:**

   ```
   Save this review as "pr-1234-review"
   ```

3. **Monitor Impact:**
   ```
   Monitor performance after these changes
   ```

### Development Session

1. **Start Session:**

   ```
   Create a new development session "feature-login"
   ```

2. **Iterative Development:**

   ```
   Analyze this implementation for improvements:
   [paste code]
   ```

3. **Track Progress:**
   ```
   Save current state to "feature-login-progress"
   ```

### Performance Optimization

1. **Initial Analysis:**

   ```
   Analyze this function for performance issues:
   [paste code]
   ```

2. **Monitor Baseline:**

   ```
   Monitor memory and CPU for 10 seconds
   ```

3. **Apply Optimizations:**
   ```
   Analyze optimized version:
   [paste optimized code]
   ```

## Troubleshooting

### MCP Server Not Responding

**Symptoms:** Continue.dev can't access MCP tools

**Solutions:**

1. Test server manually: `npm run mcp:test`
2. Check Node version: `node --version` (must be >=18.0.0)
3. Verify file paths in Continue config
4. Check Continue logs: `Ctrl+Shift+P` → "Continue: Show Logs"
5. Restart VS Code

### Tools Not Available in Chat

**Symptoms:** MCP tools don't appear in Continue suggestions

**Solutions:**

1. Verify `experimental.modelContextProtocolServers` exists in config
2. Check server.js is executable
3. Review Continue.dev experimental features settings
4. Try explicit tool invocation in prompt

### Timeout Errors

**Symptoms:** Tool calls time out

**Solutions:**

1. Check system resources (memory, CPU)
2. Increase timeout in `src/mcp/server.js` (default 30s)
3. Simplify input parameters
4. Monitor system: `npm run monitor:live`

### Server Crashes

**Symptoms:** MCP server stops unexpectedly

**Solutions:**

1. Check stderr output for errors
2. Run with debug mode: `npm run mcp:debug`
3. Review server logs
4. Test with simple requests first

## Advanced Configuration

### Custom Tool Timeout

Edit `src/mcp/server.js`:

```javascript
// Change timeout from 30s to 60s
setTimeout(() => {
  reject(new Error('Tool call timeout'));
}, 60000); // was 30000
```

### Add Custom Tools

Edit `src/mcp/server.js` and register new tools:

```javascript
_registerTools() {
  // Existing tools...

  // Add custom tool
  this.tools.set('custom_tool', {
    description: 'Custom tool description',
    parameters: {
      type: 'object',
      properties: {
        param: { type: 'string', description: 'Parameter' }
      },
      required: ['param']
    },
    handler: this._handleCustomTool.bind(this)
  });
}

async _handleCustomTool(params) {
  // Implementation
  return { result: 'success' };
}
```

### Environment Variables

Configure via Continue.dev config:

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "name": "llm-framework",
        "env": {
          "DEBUG": "mcp:*",
          "NODE_ENV": "development",
          "MCP_TIMEOUT": "60000"
        }
      }
    ]
  }
}
```

## Integration with LLM Framework

### AI Bridge Coordination

MCP server can coordinate with AI Bridge for multi-agent workflows:

```javascript
// Start full system
npm run system:full

// MCP server + AI Bridge + Agents
```

### Context Manager Integration

Share context between Continue.dev and other agents:

```javascript
// In Continue.dev prompt
"Save context to 'shared-session'";

// In other agent
const context = await contextManager.load('shared-session');
```

### Performance Monitoring

MCP server can monitor AI Bridge and agent performance:

```javascript
// Monitor complete system
'Monitor performance for all active agents';
```

## Best Practices

### 1. Context Management

- Save context regularly during long sessions
- Use descriptive keys: `"feature-auth-v1"` not `"ctx1"`
- Compress context when token count gets high
- Clear old contexts periodically

### 2. Code Analysis

- Specify analysis focus (security, performance, quality)
- Analyze small code chunks for faster results
- Use iterative refinement for complex code
- Review suggestions critically

### 3. Session Coordination

- Create sessions for distinct features
- Use consistent naming conventions
- Monitor session status regularly
- Clean up completed sessions

### 4. Performance Monitoring

- Monitor during critical operations
- Compare before/after metrics
- Set appropriate duration (don't over-monitor)
- Save metrics for historical comparison

## Resources

- **MCP Server Code:** `src/mcp/server.js`
- **Test Suite:** `src/mcp/test-server.js`
- **Documentation:** `src/mcp/README.md`
- **Continue Config:** `C:\Users\scarm\.continue\config.json`

## NPM Scripts Reference

```bash
npm run mcp:server    # Start MCP server (manual)
npm run mcp:test      # Run MCP server tests
npm run mcp:debug     # Start with debug output
npm run system:full   # Start complete system (Bridge + Agents + MCP)
```

## Support

For issues or questions:

1. Check Continue.dev logs: `Ctrl+Shift+P` → "Continue: Show Logs"
2. Test server manually: `npm run mcp:test`
3. Review MCP documentation: `src/mcp/README.md`
4. Check LLM Framework CLAUDE.md for system architecture

## Next Steps

1. Test all four tools with sample prompts
2. Integrate MCP into your development workflow
3. Create custom tools for project-specific needs
4. Explore multi-agent coordination with AI Bridge
5. Monitor and optimize performance

---

**Status:** MCP server configured and ready to use with Continue.dev

**Version:** 1.0.0

**Last Updated:** 2025-10-20
