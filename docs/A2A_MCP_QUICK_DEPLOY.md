# A2A MCP Full Integration - Quick Deploy Guide

## 🚀 What Was Built

Complete A2A MCP integration system with:

### 1. **Unified CLI Tool** (`src/cli/a2a-cli.js`)
- **Commands**: `a2a start|stop|status|deploy|logs|agents`
- **Components**: bridge, ollama, claude, analyzer, mcp-continue, mcp-jules, all
- **Features**: Health checks, graceful shutdown, process management

### 2. **Admin Dashboard** (`electron/a2a-admin-dashboard.html`)
- Real-time WebSocket metrics from AI Bridge
- Connected agents monitoring
- Message throughput charts (Chart.js)
- System health indicators
- Control panel for starting/stopping components

### 3. **Deployment Targets**
- PM2 (process manager)
- Docker (containerization)
- Railway (cloud hosting)
- Cloudflare Workers (edge)
- Vercel (web hosting)

---

## 📦 Installation

### Install CLI Globally

```bash
# Navigate to project
cd C:\Users\scarm

# Install dependencies (if not already)
npm install commander chalk axios

# Link CLI globally
npm link

# Now use anywhere
a2a --help
```

---

## 🎯 Quick Start

### 1. Start AI Bridge

```bash
a2a start bridge
```

Starts AI Bridge on ports:
- WebSocket: `ws://localhost:65028`
- HTTP: `http://localhost:65029`

### 2. Start Agents

```bash
# Start Ollama agent
a2a start ollama

# Start Claude agent (requires ANTHROPIC_API_KEY)
a2a start claude

# Start Code Analyzer
a2a start analyzer

# Or start everything at once
a2a start all
```

### 3. Check System Status

```bash
a2a status
```

Output:
```
━━━ A2A System Status ━━━

✅ AI Bridge: Running
   Port: localhost:65029
   Uptime: 75 minutes
   Connected Agents: 2
   Messages Processed: 0
   Errors: 0
   Memory: 11.55 MB

━━━ Connected Agents ━━━

✅ test-autonomous-agent
   Role: test-agent
   Health Score: 100%
   Messages: 0 sent, 0 received
   Last Seen: 4:16:59 PM

✅ e4405d74-6fe3-479e-9f8f-c77d24a70f56
   Role: agent
   Health Score: 100%
   Messages: 0 sent, 0 received
   Last Seen: 4:17:02 PM

━━━ Ollama Status ━━━

✅ Ollama: Running
   Models: 19
```

### 4. Open Admin Dashboard

```bash
# Via npm script
npm run dashboard:admin

# Or open directly
start electron/a2a-admin-dashboard.html
```

### 5. View Logs

```bash
# Show last 50 lines
a2a logs bridge

# Follow logs in real-time
a2a logs bridge --follow

# Show more lines
a2a logs bridge --lines 100
```

### 6. List Connected Agents

```bash
a2a agents
```

Output (table format):
```
┌─────────┬───────────────────────────┬──────────┬──────────┬─────┬──────────┬───────────┐
│ (index) │            ID             │   Role   │ Health % │ Sent│ Received │ Last Seen │
├─────────┼───────────────────────────┼──────────┼──────────┼─────┼──────────┼───────────┤
│    0    │ 'test-autonomous-agent'   │  'test-' │   100    │  0  │    0     │ '4:16 PM' │
│    1    │ 'e4405d74-6fe3-479e...'   │ 'agent'  │   100    │  0  │    0     │ '4:17 PM' │
└─────────┴───────────────────────────┴──────────┴──────────┴─────┴──────────┴───────────┘
```

---

## 🚢 Deployment

### Deploy to PM2

```bash
a2a deploy pm2
```

Uses existing `ecosystem.config.cjs` to run:
- AI Bridge (port 65028/65029)
- Ollama Agent
- Claude Agent
- Code Analyzer
- All other configured agents

### Deploy to Docker

```bash
a2a deploy docker
```

Builds Docker image using `Dockerfile`:
- Multi-stage build for optimized size
- Health checks for AI Bridge
- Exposes ports 65028, 65029, 11434

### Deploy to Cloud

```bash
# Railway
a2a deploy railway

# Cloudflare Workers
a2a deploy cloudflare

# Vercel
a2a deploy vercel
```

---

## 🎛️ Admin Dashboard Features

### Real-Time Metrics
- **System Status**: AI Bridge online/offline, Ollama status
- **Performance**: Messages/second, memory usage, uptime
- **Agents**: Connected agents with health scores
- **Messages**: Recent message history with type/timestamp

### Visualizations
- **Throughput Chart**: Live message throughput graph (Chart.js)
- **Agent Cards**: Visual representation of each agent's status
- **Status Indicators**: Pulsing dots for component health

### Controls
- **Start Bridge**: Launch AI Bridge
- **Start Agents**: Launch Ollama/Claude agents
- **Stop All**: Graceful shutdown of all components
- **Refresh**: Manual data refresh
- **Docs**: Link to GitHub documentation

### Auto-Refresh
Dashboard refreshes every **5 seconds** automatically.

---

## 📊 MCP Integration

### Start MCP Servers

```bash
# Continue MCP (VS Code Continue extension)
a2a start mcp-continue

# Jules MCP
a2a start mcp-jules
```

### Available MCP Tools

**Continue-Ollama MCP** (6 tools):
1. `list_models` - Auto-detect Ollama models
2. `select_model` - Switch active model
3. `autocomplete` - Code completion (streaming)
4. `chat` - Multi-turn conversations
5. `analyze_code` - Code analysis
6. `refactor_code` - Code refactoring

**MCP Servers in Project**:
- `continue-ollama-server.js` - Continue extension integration
- `jules-mcp-server.js` - Jules AI integration
- `mcp-server.js` - Generic MCP server
- `mcp-integration.js` - MCP bridge integration
- `provider-detector.js` - Auto-detect LLM providers

---

## 🔧 Configuration

### Environment Variables

Create `.env` file:

```bash
# AI Bridge
AI_BRIDGE_PORT=65028
AI_BRIDGE_HTTP_PORT=65029
BRIDGE_WS=ws://localhost:65028

# Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama2

# Claude
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Logging
LOG_LEVEL=info
NODE_ENV=production
```

### AI Bridge Configuration

Edit `src/ai-bridge.js`:

```javascript
const DEFAULT_HISTORY_LIMIT = 50;  // Message history size
const MAX_QUEUE_PER_CLIENT = 50;   // Max queued messages
const WS_COMPRESSION_THRESHOLD = 4096;  // 4KB
```

### Agent Configuration

Each agent in `src/agents/`:
- `a2a-ollama-agent.js` - Ollama configuration
- `a2a-claude-agent.js` - Claude configuration
- `code-analyzer-agent.js` - Analyzer configuration

---

## 📈 Performance

### Current System Metrics

```
Uptime: 1.25 hours
Messages Processed: 0 (idle)
Connected Agents: 2
Memory Usage: 11.55 MB
Errors: 0
Health Score: 100%
```

### Optimization Features

**AI Bridge**:
- Message compression (>4KB auto-compressed)
- Connection pooling (HTTP keep-alive)
- Circuit breakers (prevent cascade failures)
- Request queuing (max 3 concurrent/agent)
- Circular buffer for history (memory-efficient)

**Agents**:
- Auto-reconnect with exponential backoff
- Message deduplication
- Health monitoring (heartbeat every 3 min)
- Graceful shutdown handlers

---

## 🧪 Testing

### Run Tests

```bash
# All tests
npm test

# A2A integration tests
npm run test:a2a

# MCP tests
npm run test:mcp

# Performance tests
npm run test:performance
```

### Manual Testing

```bash
# 1. Start system
a2a start all

# 2. Check status
a2a status

# 3. Send test message (demo client)
node demo-a2a-message.js

# 4. View logs
a2a logs bridge

# 5. Stop system
a2a stop all
```

---

## 📚 Additional Resources

### Documentation
- **Integration Guide**: `docs/A2A_MCP_INTEGRATION_GUIDE.md`
- **API Reference**: `docs/A2A_API_REFERENCE.md`
- **Deployment Guide**: `docs/DEPLOYMENT_GUIDE.md`
- **Continue MCP**: `docs/CONTINUE_MCP_GUIDE.md`
- **Ollama Cloud**: `docs/OLLAMA_CLOUD_GUIDE.md`

### Package Scripts (150+ available)

**AI Bridge**:
- `npm run bridge:start` - Start AI Bridge
- `npm run bridge:diagnostic` - Run diagnostics

**Agents**:
- `npm run agent:ollama` - Start Ollama agent
- `npm run agent:claude` - Start Claude agent
- `npm run agent:analyzer` - Start analyzer

**MCP**:
- `npm run mcp:continue` - Continue MCP server
- `npm run mcp:jules` - Jules MCP server
- `npm run mcp:debug` - MCP debug mode

**System**:
- `npm run system:start` - Start bridge + agents
- `npm run system:full` - Start everything
- `npm run system:monitor` - System monitoring

**Deployment**:
- `npm run deploy` - Auto-deploy
- `npm run deploy:railway` - Deploy to Railway
- `npm run deploy:cloudflare` - Deploy to Cloudflare
- `npm run deploy:vercel` - Deploy to Vercel

**Monitoring**:
- `npm run health:check` - Health check
- `npm run health:monitor` - Live monitoring
- `npm run monitor:live` - Real-time dashboard

---

## 🐛 Troubleshooting

### AI Bridge Won't Start

**Problem**: Port 65028/65029 already in use

**Solution**:
```bash
# Check what's using the port
netstat -ano | findstr "65028"

# Kill the process
taskkill /PID <process-id> /F

# Or use helper script
npm run dev:kill-bridge
```

### Agents Not Connecting

**Problem**: WebSocket connection refused

**Check**:
1. Is AI Bridge running? `a2a status`
2. Correct BRIDGE_WS? `echo $BRIDGE_WS` or `echo %BRIDGE_WS%`
3. Firewall blocking? Check Windows Firewall
4. Check logs: `a2a logs bridge`

### Ollama Not Detected

**Problem**: Ollama status shows "Offline"

**Solution**:
```bash
# Start Ollama service
ollama serve

# Verify it's running
curl http://localhost:11434/api/tags

# Check available models
ollama list
```

### Dashboard Shows No Data

**Problem**: Admin dashboard shows "Loading..."

**Check**:
1. AI Bridge running? `curl http://localhost:65029/api/status`
2. CORS issues? Check browser console
3. Proxy/firewall blocking? Test with `curl`

### CLI Command Not Found

**Problem**: `a2a: command not found`

**Solution**:
```bash
# Link CLI globally
cd C:\Users\scarm
npm link

# Or use via npm
npm run a2a -- status

# Or use node directly
node src/cli/a2a-cli.js status
```

---

## 🎉 Success Checklist

✅ AI Bridge running on ports 65028/65029
✅ Ollama running with 19 models available
✅ At least 1 agent connected
✅ Admin dashboard accessible
✅ CLI commands working (`a2a status`)
✅ MCP servers available (`npm run mcp:continue`)
✅ No errors in logs
✅ Health score 100%

---

## 🚀 Next Steps

1. **Explore MCP Integration**: `docs/CONTINUE_MCP_GUIDE.md`
2. **Deploy to Cloud**: `a2a deploy railway`
3. **Create Custom Agents**: See `src/agents/base-agent.js`
4. **Build Workflows**: See `docs/WORKFLOW_GUIDE.md`
5. **Monitor Performance**: `npm run performance:analyze`

---

## 📞 Support

- **GitHub Issues**: https://github.com/Scarmonit/LLM/issues
- **Documentation**: https://github.com/Scarmonit/LLM/tree/main/docs
- **CLI Help**: `a2a --help`
- **Email**: scarmonit@gmail.com

---

**Generated with Claude CLI + 11 MCP Servers**
**Version**: 1.0.0
**Last Updated**: 2025-10-21
