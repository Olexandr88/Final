# LLM Framework - Quick Start Guide

Get up and running in 60 seconds.

---

## 🚀 Installation

```bash
# Clone the repository
git clone https://github.com/Scarmonit/LLM.git
cd LLM

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys
```

---

## ⚡ Essential Commands

### System Control (Master Command)

```bash
# Show system status
npm run control status

# Start everything
npm run control start

# Stop everything
npm run control stop

# Quick workflow (stop + clean + test + start)
npm run control quick

# Get help
npm run control help
```

### Development

```bash
# Start development mode
npm run dev

# Run specific tests
npm run quick-test basic
npm run quick-test a2a

# Check bridge status
npm run dev:bridge-check

# Clean workspace
npm run workspace:clean
```

### Testing

```bash
# Quick test (single file)
npm run quick-test [pattern]

# Full test suite
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration
```

---

## 🌉 AI Bridge Quick Start

### Start the Bridge

```bash
# Option 1: System control
npm run control start

# Option 2: Direct start
npm run bridge:start
```

### Verify It's Running

```bash
# Check ports
npm run dev:bridge-check

# Health check
npm run control health

# Full diagnostic
npm run bridge:diagnostic
```

### Connect Agents

```bash
# In separate terminals:
npm run agent:ollama    # Terminal 1
npm run agent:claude    # Terminal 2
npm run agent:analyzer  # Terminal 3

# Or start all at once:
npm run system:start
```

---

## 🧪 Testing Your Setup

### Basic Verification

```bash
# 1. Check system status
npm run control status

# 2. Run basic tests
npm run quick-test basic

# 3. Test A2A system
npm run quick-test a2a

# 4. Start the bridge
npm run control start
```

### Full Verification

```bash
# Complete workflow
npm run control quick
```

This will:
1. Stop any running processes
2. Clean the workspace
3. Run basic tests
4. Start the system

---

## 🛠️ Common Workflows

### Daily Development

```bash
# Morning startup
npm run control status
npm run control start

# Work on feature
npm run dev

# Test your changes
npm run quick-test [your-feature]

# Evening shutdown
npm run control stop
```

### Before Committing

```bash
# 1. Run relevant tests
npm run quick-test [feature]

# 2. Clean workspace
npm run workspace:clean

# 3. Lint and format
npm run lint:fix
npm run format

# 4. Full test suite
npm test
```

### Troubleshooting

```bash
# Something's broken?
npm run control reset        # Reset everything
npm run bridge:diagnostic    # Run diagnostics
npm run dev:kill-bridge     # Kill stuck processes
npm run control status      # Check status
```

---

## 📦 Project Structure

```
LLM/
├── src/                    # Core framework code
│   ├── ai-bridge.js       # WebSocket hub
│   ├── agents/            # A2A agents
│   ├── clients/           # LLM clients
│   └── utils/             # Utilities
├── tests/                 # Test suite
├── scripts/               # Automation scripts
│   ├── system-control.js  # Master control
│   ├── quick-test.js      # Quick test runner
│   ├── dev-helper.js      # Dev utilities
│   └── workspace-cleanup.js
├── .env                   # Environment config
├── package.json           # Project config
└── CLAUDE.md             # Development guidelines
```

---

## 🔐 Environment Variables

Required in `.env`:

```bash
# LLM API Keys
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...
DEEPSEEK_API_KEY=sk-...

# Configuration
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# AI Bridge (optional, defaults shown)
AI_BRIDGE_WS_PORT=65028
AI_BRIDGE_HTTP_PORT=65029
```

---

## 🎯 Key Features

### System Control
One command for all common workflows:
- `npm run control status` - System overview
- `npm run control quick` - Full workflow
- `npm run control test` - Quick tests

### Quick Testing
Run individual test files without waiting:
- `npm run quick-test basic` - Basic tests
- `npm run quick-test a2a` - A2A tests
- `npm run quick-test claude` - Claude tests

### Developer Tools
Built-in utilities for common tasks:
- `npm run dev:helper` - Dev commands
- `npm run workspace:clean` - Clean workspace
- `npm run bridge:diagnostic` - Full diagnostic

---

## 📚 Documentation

- `DEVELOPER_TOOLS.md` - Complete tool reference
- `CLAUDE.md` - Development guidelines and conventions
- `README.md` - Project overview

---

## 🆘 Getting Help

### Commands

```bash
npm run control help        # System control help
npm run dev:helper         # Dev helper commands
npm run quick-test         # Test runner usage
```

### Status Checks

```bash
npm run control status     # Overall status
npm run control health     # Health check
npm run control info       # System info
```

### Diagnostics

```bash
npm run bridge:diagnostic  # Full bridge diagnostic
npm run dev:ports         # Port status
npm run dev:bridge-check  # Bridge status
```

---

## 🎓 Learning Path

### Day 1: Setup
1. Install and configure
2. Run `npm run control status`
3. Start the bridge: `npm run control start`
4. Run basic tests: `npm run quick-test basic`

### Day 2: Development
1. Learn system control: `npm run control help`
2. Try dev helper: `npm run dev:helper`
3. Make a change and test it
4. Clean up: `npm run workspace:clean`

### Day 3: Advanced
1. Run diagnostics: `npm run bridge:diagnostic`
2. Start full system: `npm run system:start`
3. Write and run your own tests
4. Explore the codebase

---

## ✨ Tips

- **Use system control** for everything: `npm run control <action>`
- **Run quick tests** during development, not the full suite
- **Clean workspace** regularly: `npm run workspace:clean`
- **Check status** before and after work: `npm run control status`
- **Kill stuck processes** if tests hang: `npm run dev:kill-bridge`

---

**Next Steps:**
- Read `DEVELOPER_TOOLS.md` for detailed tool documentation
- Read `CLAUDE.md` for coding conventions
- Start building! 🚀

---

**Last Updated**: 2025-10-17
**Version**: 2.1.1-parallel-optimized
