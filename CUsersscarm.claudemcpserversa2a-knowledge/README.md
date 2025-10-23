# A2A MCP Server (Agent-to-Agent Model Context Protocol)

🚀 **Production-Ready MCP Server** for agent automation and workflow orchestration.

## ✨ Features

- **🤖 Multi-Agent System**: Enhanced, Advanced, and Practical agents
- **🔧 Comprehensive Tools**: 40+ built-in tools for automation
- **📡 Real-time Streaming**: WebSocket streaming for live updates
- **🔐 Permission System**: Fine-grained access control
- **📊 Monitoring**: Built-in metrics and health monitoring
- **⚡ High Performance**: Optimized for production workloads

## 🚀 Quick Start

### 1. Install & Build
```bash
npm install
npm run build
```

### 2. Start Server
```bash
# Development (with auto-reload)
npm run dev

# Production
npm start

# Direct execution
node dist/src/index.js
```

### 3. Test the Server
```bash
node test-mcp-client.js
```

## 🔌 MCP Client Integration

### Claude Desktop Configuration
Add to your Claude Desktop settings:
```json
{
  "mcpServers": {
    "a2a-server": {
      "command": "node",
      "args": ["dist/src/index.js"],
      "cwd": "/path/to/a2a-project"
    }
  }
}
```

## 🤖 Available Agents

### Enhanced Agents
- **web_scraper** - Advanced web scraping with pagination
- **content_writer** - SEO-optimized content generation
- **data_analyst** - Comprehensive data analysis
- **api_tester** - API testing automation
- **deploy_manager** - Multi-platform deployment
- **security_scanner** - Vulnerability scanning

### Advanced Agents
- **email_automator** - Email campaign automation
- **database_manager** - Database operations
- **cloud_orchestrator** - Multi-cloud management
- **ml_pipeline_manager** - ML pipeline automation
- **workflow_orchestrator** - Complex workflows
- **real_time_monitor** - Real-time monitoring

## 🛠️ Core Capabilities

- **Agent Management**: Deploy, update, enable/disable agents
- **Session Management**: Multi-session support with handoffs
- **Tool Execution**: Execute practical and advanced tools
- **Permission Control**: Grant, request, approve permissions
- **MCP Integration**: Cross-agent tool sharing
- **Real-time Streaming**: Live updates via WebSocket


## 📚 Documentation

- **[Complete Usage Guide](MCP_USAGE_GUIDE.md)** - Detailed usage instructions
- **[API Reference](A2A-MCP-Optimization-Summary.md)** - Technical implementation details

## 🔧 Configuration

### Environment Variables
```bash
MAX_CONCURRENCY=50        # Max concurrent operations
LOG_LEVEL=info           # Logging level  
ENABLE_STREAMING=true    # WebSocket streaming
STREAM_PORT=8787         # Streaming port
METRICS_PORT=9090        # Metrics port (0=disabled)
```

### WebSocket Streaming
- **URL**: `ws://127.0.0.1:8787`
- **Events**: `start`, `chunk`, `final`, `error`
- **Real-time**: Live agent execution updates

## 🚀 Deployment Status

✅ **Production Ready** - Server is fully implemented and tested  
✅ **Multi-Agent Support** - Enhanced and Advanced agents deployed  
✅ **Tool Registry** - 40+ practical and advanced tools available  
✅ **WebSocket Streaming** - Real-time updates working  
✅ **Permission System** - Fine-grained access control active  
✅ **Metrics & Health** - Monitoring endpoints operational  

## 🎯 Next Steps

1. **Deploy to Production**: Use PM2, Docker, or cloud platforms
2. **Add Custom Agents**: Extend with domain-specific agents
3. **Integrate Workflows**: Connect to existing automation
4. **Scale & Monitor**: Use metrics for production monitoring

**The A2A MCP Server is ready for production use!** 🎉
