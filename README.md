# LLM Multi-Provider Framework

[![CI](https://github.com/railwayapp/railpack/actions/workflows/ci.yml/badge.svg)](https://github.com/railwayapp/railpack/actions/workflows/ci.yml)
[![Run Tests](https://github.com/railwayapp/railpack/actions/workflows/run_tests.yml/badge.svg)](https://github.com/railwayapp/railpack/actions/workflows/run_tests.yml)

Node.js-based autonomous AI orchestration system providing unified interfaces to multiple LLM providers (Claude, Ollama, Jules), with advanced features including RAG pipelines, agent-to-agent protocols, browser history analysis, and real-time WebSocket coordination.

**Version**: 2.1.1-parallel-optimized | **Node**: >=18.0.0 | **License**: ISC

---

## Features

- **Multi-Provider LLM Support**: Claude (Anthropic), Ollama (local), Jules API
- **A2A (Agent-to-Agent) Protocol**: Real-time WebSocket coordination between AI agents
- **LLMPacks Build System**: Zero-config Docker image builder (inspired by Nixpacks + CNB)
- **RAG Pipelines**: ChromaDB vector store integration
- **Browser Analysis**: Intelligent history parsing and insights
- **Session Management**: Multi-session support with context isolation
- **Electron GUI**: Desktop application for agent orchestration
- **Performance Optimized**: Aggressive caching, connection pooling, parallel execution

---

## Quick Start

### Installation

```bash
npm install
```

### Basic Usage

```bash
# Start AI Bridge (WebSocket hub for agents)
npm run bridge:start

# Start agents
npm run agent:ollama
npm run agent:claude
npm run agent:analyzer

# Or start entire system at once
npm run system:start
```

### LLMPacks - Zero-Config Build System

LLMPacks automatically detects your project type and builds optimized Docker images:

```bash
# Auto-detect project type
npm run llmpacks:detect

# Generate build plan
npm run llmpacks:plan

# Build Docker image
npm run llmpacks:build

# Get project info
npm run llmpacks:info

# Create example config
npm run llmpacks:init
```

**Supported Project Types**:
- **Electron** - Desktop applications (auto-detects electron-builder, electron-forge)
- **Node.js** - npm, yarn, pnpm projects
- **Python** - pip, pipenv, poetry projects
- **Go** - Go module projects
- **Static Sites** - HTML/CSS/JS (nginx-served)

**Example Workflow**:

```bash
# In your Electron project directory
npx llmpacks detect
# Output: ✓ Detected: Electron (confidence: 95%)

npx llmpacks plan --json > build-plan.json
# Generates multi-phase build plan

npx llmpacks build --name my-app --tag v1.0.0
# Builds optimized Docker image with multi-stage build

docker run -p 3000:3000 my-app:v1.0.0
```

**Custom Configuration** (`llmpacks.toml`):

```toml
[variables]
NODE_ENV = "production"
PORT = 3000

[phases.build]
commands = ["npm run build"]
environment = { NODE_ENV = "production" }

[start]
command = "npm start"
port = 3000
```

---

## Architecture

### Core Components

```
LLM/
├── src/
│   ├── agents/              # A2A agents (Claude, Ollama, analyzers)
│   ├── llmpacks/            # Build system (NEW)
│   │   ├── index.js         # Main orchestrator
│   │   ├── detector.js      # Language detection
│   │   ├── build-plan.js    # Build plan generator
│   │   ├── docker-builder.js # Docker image builder
│   │   ├── config-loader.js # TOML configuration
│   │   ├── cli.js           # CLI interface
│   │   └── providers/       # Language providers
│   │       ├── nodejs.js    # Node.js/npm/yarn/pnpm
│   │       ├── electron.js  # Electron apps
│   │       ├── python.js    # Python projects
│   │       ├── go.js        # Go projects
│   │       └── static.js    # Static sites
│   ├── clients/             # LLM client implementations
│   ├── ai-bridge.js         # WebSocket coordination hub
│   └── session-manager.js   # Multi-session coordination
├── electron/                # Electron GUI
├── tests/                   # Test suite
└── docs/                    # Documentation
```

### AI Bridge (WebSocket Hub)

Central coordination system for agent-to-agent communication:

- **Port**: WebSocket on 65028, HTTP on 65029
- **Message Format**: `{ type, data, metadata }`
- **Features**: Message routing, agent registry, health monitoring, auto-healing

### LLMPacks Build System

Inspired by Nixpacks (Railway) and Cloud Native Buildpacks:

1. **Detection** - Auto-detect project language/framework from file patterns
2. **Planning** - Generate multi-phase build plan (install → build → start)
3. **Building** - Create multi-stage Dockerfile with layer caching
4. **Optimization** - Minimal base images, production-only dependencies

**Build Plan Structure**:

```javascript
{
  provider: "electron",
  version: "18",
  cacheKey: "abc123def456",
  phases: [
    { name: "install", commands: ["npm ci"], cacheDirectories: ["node_modules"] },
    { name: "build", commands: ["npm run build"], environment: { NODE_ENV: "production" } },
    { name: "start", command: "xvfb-run npm start", port: 3000 }
  ]
}
```

---

## Development

### Testing

```bash
npm test                    # Full test suite
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report
```

### Linting & Formatting

```bash
npm run lint                # Check code style
npm run lint:fix            # Auto-fix issues
npm run format              # Format with Prettier
```

### Building

```bash
npm run build               # Production build
npm run package             # Electron packaging (Windows)
npm run build:docker        # Docker image for LLM framework
```

### Performance Monitoring

```bash
npm run performance:analyze  # Generate performance report
npm run health:check         # System health check
npm run benchmark            # Run benchmarks
```

---

## Deployment

### LLMPacks Deployment

```bash
# Build production Docker image
npm run llmpacks:build -- --name llm-framework --tag production --push

# Deploy to Railway
railway up

# Deploy to Vercel
npm run deploy:vercel

# Deploy to Cloudflare Workers
npm run deploy:cloudflare
```

### Manual Deployment

```bash
npm run deploy:auto         # Automated deployment script
npm run deploy:railway      # Railway deployment
npm run deploy:vercel       # Vercel deployment
```

---

## CLI Commands

### LLMPacks CLI

```bash
llmpacks detect              # Auto-detect project type
llmpacks plan                # Generate build plan
llmpacks build               # Build Docker image
llmpacks build --push        # Build and push to registry
llmpacks init                # Create example config
llmpacks info                # Show project info
llmpacks --help              # Show help
```

### A2A (Agent-to-Agent) CLI

```bash
npm run a2a                  # A2A control center
npm run a2a:mcp              # A2A MCP CLI
npm run agent:ollama         # Start Ollama agent
npm run agent:claude         # Start Claude agent
npm run control-center       # GUI control center
```

---

## Configuration

### Environment Variables

```bash
# LLM API Keys
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...
DEEPSEEK_API_KEY=sk-...

# System Config
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# AI Bridge
AI_BRIDGE_PORT=65028
AI_BRIDGE_HTTP_PORT=65029
```

### LLMPacks Configuration

Create `llmpacks.toml` in your project root:

```toml
# Variables injected into all phases
[variables]
NODE_ENV = "production"
API_URL = "https://api.example.com"

# Override provider settings
[providers]
name = "nodejs"
version = "18"

# Customize build phases
[phases.build]
commands = ["npm run build", "npm run optimize"]

# Start configuration
[start]
command = "node dist/server.js"
port = 8080
```

---

## Documentation

- **Implementation Guide**: [`docs/LLMPACKS_IMPLEMENTATION_GUIDE.md`](docs/LLMPACKS_IMPLEMENTATION_GUIDE.md)
- **Python A2A Integration**: [`docs/PYTHON_A2A_MCP_INTEGRATION.md`](docs/PYTHON_A2A_MCP_INTEGRATION.md)
- **Project Constitution**: [`CLAUDE.md`](CLAUDE.md)

---

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create feature branch (`git checkout -b feat/amazing-feature`)
3. Follow coding conventions in `CLAUDE.md`
4. Write tests for new features
5. Ensure all tests pass (`npm test`)
6. Submit pull request

---

## License

ISC License - see LICENSE file

---

## Contact

- **Repository**: https://github.com/Scarmonit/LLM
- **Issues**: https://github.com/Scarmonit/LLM/issues
- **Author**: scarmonit (scarmonit@gmail.com)

---

**Built with Claude Code** 🚀
