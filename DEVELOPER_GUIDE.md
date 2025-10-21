# Developer Guide - LLM Multi-Provider Framework

> **Quick Start for Developers** - Get productive in 5 minutes

## 🚀 Setup (< 2 minutes)

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.example .env

# 3. Add your API keys to .env
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...
DEEPSEEK_API_KEY=sk-...

# 4. Run tests to verify setup
npm test
```

## 🛠️ Essential Developer Commands

### Quick Testing

```bash
npm run test:quick basic          # Run basic tests only
npm run test:quick a2a            # Run A2A system tests
npm run test:quick claude         # Run Claude client tests
npm test                          # Full test suite (slow)
```

### Development Utilities

```bash
npm run dev:helper                # Show all dev commands
npm run dev:ports                 # Check what ports are in use
npm run dev:bridge-check          # Check if AI Bridge is running
npm run dev:kill-bridge           # Kill stuck bridge processes
```

### Network Debugging

```bash
npm run net:listening             # Show all listening ports
npm run net:connections           # Analyze active connections
npm run net:kill 3000             # Kill process on port 3000
npm run net:analyze               # Show network analyzer commands
npm run net:dns google.com        # DNS lookup with multiple resolvers
npm run net:scan 127.0.0.1 80 443 # Port scanning (defensive only)
npm run net:watch 65028           # Watch port for connections
npm run net:summary               # Summarize active connections
node scripts/network-debug.js dns-resolve google.com
```

### Process Management

```bash
npm run proc:top                  # Top CPU-consuming processes
npm run proc:mem                  # Top memory-consuming processes
npm run proc:zombie               # Find stuck Node.js processes
npm run proc:watch                # Watch Node.js process count
```

### SSL/TLS Operations

```bash
npm run ssl:helper                # Show all SSL commands
npm run ssl:check google.com 443  # Check certificate details
npm run ssl:gen-key               # Generate RSA private key
npm run ssl:test example.com      # Test SSL/TLS connection
```

### System Diagnostics

```bash
npm run quickfix                  # 5-second instant diagnostic
npm run diag:advanced             # Interactive diagnostics menu (8 modes)
npm run diag:full                 # Full system analysis
npm run health:check              # Project health check
npm run health:system             # AI system health scanner
npm run monitor:live              # Real-time dashboard (5s refresh)
npm run quick-test                # Quick test runner
```

### Shell Toolkit (NEW)

```bash
npm run swiss                     # Swiss Army Knife utility menu
npm run util                      # Alias for swiss
npm run control                   # Master control hub (all tools)
```

**Swiss Army Knife Features:**

- Git visualization (beautiful log with stats)
- Quick HTTP server (Python/PHP fallback)
- DNS lookup (dig/host/nslookup/Google DNS API)
- Base64 encode/decode (text and files)
- Text processing toolkit (7 operations)
- Network quick tests (ping, TCP, HTTP, DNS)
- System info (CPU, memory, disk, processes)
- Project analysis (file types, dependencies, git)

### Workspace Cleanup

```bash
npm run cleanup                   # Kill zombies & clean artifacts
npm run workspace:clean:dry       # Preview what will be deleted
npm run workspace:clean           # Clean temp files safely
npm run workspace:clean:aggressive # Deep clean (removes reports)
```

## 📁 Project Structure

```
LLM/
├── src/
│   ├── ai-bridge.js              # WebSocket hub (port 65028/65029)
│   ├── claude-client.js          # Claude Sonnet 4.5 client
│   ├── agents/                   # A2A agent implementations
│   │   ├── a2a-claude-agent.js   # Claude A2A agent
│   │   ├── a2a-ollama-agent.js   # Ollama local LLM
│   │   ├── code-analyzer-agent.js # AST-based code analysis
│   │   └── code-fixer-agent.js   # Automated refactoring
│   ├── utils/                    # Shared utilities
│   │   ├── logger.js             # Winston structured logging
│   │   ├── message-cache.js      # LRU cache with TTL
│   │   └── performance-monitor.js # Metrics collection
│   └── optimization/             # Performance optimizations
├── tests/                        # Node.js test runner tests
├── scripts/                      # Developer utilities
│   ├── dev-helper.js             # Swiss-army knife for dev
│   ├── quick-test.js             # Fast individual test runner
│   ├── cleanup-processes.js      # Zombie process killer
│   ├── network-debug.js          # Network diagnostics
│   ├── network-analyzer.js       # Advanced network analysis (11 commands)
│   ├── ssl-helper.js             # SSL/TLS operations (11 commands)
│   ├── advanced-diagnostics.sh   # Interactive system diagnostics
│   ├── process-manager.js        # Process management
│   └── workspace-cleanup.js      # Automated cleanup
└── .github/workflows/            # CI/CD pipelines
```

## 🔌 AI Bridge System

### Starting the A2A System

```bash
# Start AI Bridge only
npm run bridge:start

# Start complete system (bridge + agents)
npm run system:start

# Start with all agents + GUI
npm run system:full
```

### Port Configuration

- **WebSocket**: 65028 (agent communication)
- **HTTP API**: 65029 (metrics, health checks)

### Environment Variables

```bash
# AI Bridge
AI_BRIDGE_WS_COMPRESSION_THRESHOLD=4096
AI_BRIDGE_WS_COMPRESSION_LEVEL=1

# LLM Providers
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...
DEEPSEEK_API_KEY=sk-...

# Node Environment
NODE_ENV=development
LOG_LEVEL=info
```

## 🧪 Testing Philosophy

### Test Strategy

1. **Unit Tests**: Fast, isolated tests (< 1s each)
2. **Integration Tests**: System-level tests (< 5s each)
3. **Concurrency**: Tests run sequentially to avoid port conflicts

### Test Patterns

```javascript
// Good: Dynamic port allocation
const server = await createServer({ port: 0 }); // OS assigns port

// Bad: Fixed ports (causes conflicts)
const server = await createServer({ port: 3000 }); // ❌
```

### Running Specific Tests

```bash
# Pattern matching
npm run test:quick a2a           # All A2A tests
npm run test:quick claude        # Claude tests only

# Single file
node --test tests/basic.test.js

# With coverage
npm run test:coverage
```

## 🐛 Debugging

### Quick Diagnostic Workflow (⚡ Start Here)

```bash
# Step 1: 5-second system check (fastest)
npm run quickfix

# Step 2: If issues found, open master control hub
npm run control

# Step 3: Launch real-time monitor in background
npm run monitor:live &

# Step 4: Use Swiss Army Knife for specific tasks
npm run swiss
```

### Check System Health

```bash
# All-in-one health check
npm run dev:helper git-status
npm run dev:helper env-check

# Network diagnostics
npm run net:listening            # Check ports
npm run dev:bridge-check         # Bridge status
npm run net:summary              # Connection summary

# Process diagnostics
npm run proc:top                 # CPU usage
npm run proc:mem                 # Memory usage
npm run proc:zombie              # Stuck processes
npm run proc:watch               # Watch Node.js process count

# Advanced diagnostics (interactive menu)
npm run diag:advanced
  # 1. System Resources (vmstat/iostat)
  # 2. Process System Calls (strace)
  # 3. Log Analysis
  # 4. Text Processing
  # 5. Network Deep Analysis
  # 6. Performance Bottlenecks
  # 7. Security Audit
  # 8. AI Bridge Analysis
```

### Common Issues

**Port Already in Use**

```bash
npm run net:kill 65028           # Kill process on AI Bridge port
npm run dev:kill-bridge          # Kill all bridge processes
npm run net:listening            # Verify port is freed
```

**Tests Timing Out**

```bash
npm run proc:zombie              # Find stuck test processes
npm run cleanup                  # Kill zombies & clean artifacts
taskkill /F /IM node.exe         # Nuclear option (Windows)
```

**Memory Issues**

```bash
npm run proc:mem                 # Check memory usage
npm run workspace:clean:dry      # Preview cleanup
npm run workspace:clean          # Clean temp files
npm run proc:zombie              # Kill zombie processes
```

**AI Bridge Not Responding**

```bash
npm run dev:bridge-check         # Check bridge status
npm run health:system            # AI system health scan
npm run bridge:diagnostic        # Full diagnostic
npm run dev:kill-bridge          # Kill and restart
npm run bridge:start             # Start fresh
```

**Network Issues**

```bash
npm run net:debug                # Network debug utility
npm run net:dns google.com       # Test DNS resolution
npm run net:watch 65028          # Watch AI Bridge port
npm run swiss                    # Menu option 6: Network Quick Test
```

**Performance Degradation**

```bash
npm run quickfix                 # Baseline metrics
npm run diag:advanced            # Select mode 6: Bottlenecks
npm run proc:top                 # Top CPU consumers
npm run proc:mem                 # Top memory consumers
npm run performance:analyze      # Full performance analysis
```

## 📊 Performance Monitoring

### Metrics Endpoints

```bash
# AI Bridge health
curl http://localhost:65029/health

# Detailed metrics
curl http://localhost:65029/api/status

# Agent list
curl http://localhost:65029/api/agents
```

### Performance Targets

- **Message Latency**: < 120ms (p95)
- **Memory (idle)**: < 100MB
- **Cache Hit Rate**: > 75%
- **Startup Time**: < 2s

## 🔧 Code Conventions

### Logging (Use Winston)

```javascript
import { logger } from './utils/logger.js';

// ✅ Good
logger.info('Processing request', { requestId, userId });
logger.error('Request failed', { error: err.message });

// ❌ Bad
console.log('Processing request'); // No structured logging
```

### Error Handling

```javascript
// ✅ Good
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  logger.error('Operation failed', { error: error.message });
  throw new Error(`Operation failed: ${error.message}`);
}

// ❌ Bad
const result = await riskyOperation(); // Unhandled rejection
```

### Async/Await

```javascript
// ✅ Good
const data = await fs.promises.readFile('file.txt', 'utf-8');

// ❌ Bad
const data = fs.readFileSync('file.txt'); // Blocks event loop
```

## 🚢 Deployment

### Pre-Deployment Checklist

```bash
# 1. Run full test suite
npm test

# 2. Check for security issues
npm audit

# 3. Build production assets
npm run build:optimized

# 4. Verify environment variables
npm run dev:helper env-check
```

### Production Environment

```bash
# Set production mode
export NODE_ENV=production

# Start optimized server
npm run start:production
```

## 🎓 Learning Resources

### Key Files to Read

1. **CLAUDE.md** - Project constitution and coding standards
2. **PERFORMANCE_BASELINE.md** - Performance metrics and targets
3. **OPTIMIZATION_SUMMARY.md** - Recent optimization work
4. **tests/a2a-control-center.test.js** - Integration test examples

### Architecture Docs

- **A2A Protocol**: Agent-to-agent communication via WebSocket
- **Circuit Breaker**: Prevents cascade failures to Ollama
- **LRU Cache**: Response caching with TTL
- **Circular Buffers**: Memory-efficient history storage

## 🎯 Daily Development Workflow

### Morning Startup (< 30 seconds)

```bash
# 1. Quick health check
npm run quickfix

# 2. If all green, start AI Bridge system
npm run system:start

# 3. Launch monitoring in background (optional)
npm run monitor:live &

# 4. Ready to code!
```

### Active Development Loop

```bash
# Make code changes...

# Run relevant tests (fast)
npm run test:quick <pattern>

# Check for issues
npm run quickfix

# Commit when ready
git add .
git commit -m "feat: your feature"
```

### Pre-Commit Checklist

```bash
# 1. Run tests
npm test

# 2. Check system health
npm run quickfix

# 3. Lint and format
npm run lint:fix
npm run format

# 4. Verify no zombies
npm run proc:zombie

# 5. Clean workspace
npm run workspace:clean:dry
```

### End of Day Cleanup

```bash
# 1. Kill zombie processes
npm run cleanup

# 2. Clean workspace
npm run workspace:clean

# 3. Verify system state
npm run quickfix

# 4. Commit final work
git status && git add . && git commit
```

## 💡 Pro Tips

### Speed Up Development

```bash
# Use quick-test for fast iteration
npm run test:quick <pattern>

# Monitor file changes
npm run test:watch

# Check only what you need
npm run dev:helper connections  # Network status
npm run proc:top                # Resource usage
npm run quickfix                # 5-second health check
```

### Power User Shortcuts

```bash
# One-line system check and start
npm run quickfix && npm run system:start

# Quick serve current directory
npm run swiss  # Select option 2: HTTP Server

# Beautiful git log
npm run swiss  # Select option 1: Git Visualization

# Find and kill process on port
npm run net:kill <port>

# Watch AI Bridge in real-time
npm run monitor:live

# Master control hub (access everything)
npm run control
```

### Debugging Workflow

1. **Quick check**: `npm run quickfix` (5 seconds)
2. **Detailed analysis**: `npm run diag:advanced` (interactive)
3. **Real-time monitoring**: `npm run monitor:live` (5s refresh)
4. **Specific tool**: `npm run swiss` (Swiss Army Knife menu)
5. **Deep dive**: Check logs, verify ports, analyze processes

### Keyboard Shortcuts (via npm scripts)

| Command                | Shortcut                             | Time        |
| ---------------------- | ------------------------------------ | ----------- |
| **Quick Diagnostics**  |                                      |             |
| 5-second health check  | `npm run quickfix`                   | 5s          |
| Master control hub     | `npm run control`                    | Interactive |
| Swiss Army Knife       | `npm run swiss`                      | Interactive |
| Live monitoring        | `npm run monitor:live`               | Real-time   |
| Advanced diagnostics   | `npm run diag:advanced`              | Interactive |
| **Testing**            |                                      |             |
| Quick test             | `npm run test:quick <pattern>`       | Fast        |
| Full test suite        | `npm test`                           | Slow        |
| Test with coverage     | `npm run test:coverage`              | Slow        |
| **Network**            |                                      |             |
| Port scan              | `npm run net:listening`              | 1s          |
| DNS lookup             | `npm run net:dns <domain>`           | 2s          |
| Kill port              | `npm run net:kill <port>`            | 1s          |
| Network summary        | `npm run net:summary`                | 2s          |
| Watch port             | `npm run net:watch <port>`           | Real-time   |
| **Process Management** |                                      |             |
| Top CPU                | `npm run proc:top`                   | 1s          |
| Top Memory             | `npm run proc:mem`                   | 1s          |
| Find zombies           | `npm run proc:zombie`                | 2s          |
| Kill zombies           | `npm run cleanup`                    | 5s          |
| **AI Bridge**          |                                      |             |
| Start bridge           | `npm run bridge:start`               | 2s          |
| Kill bridge            | `npm run dev:kill-bridge`            | 1s          |
| Bridge diagnostic      | `npm run bridge:diagnostic`          | 5s          |
| Start system           | `npm run system:start`               | 5s          |
| **SSL/TLS**            |                                      |             |
| SSL check              | `npm run ssl:check <domain>`         | 2s          |
| SSL test               | `npm run ssl:test <domain>`          | 3s          |
| Generate key           | `npm run ssl:gen-key`                | 1s          |
| **Workspace**          |                                      |             |
| Clean (dry-run)        | `npm run workspace:clean:dry`        | 2s          |
| Clean workspace        | `npm run workspace:clean`            | 5s          |
| Aggressive clean       | `npm run workspace:clean:aggressive` | 10s         |

## 🤝 Contributing

### Before Committing

```bash
# 1. Run tests
npm test

# 2. Lint code
npm run lint:fix

# 3. Format code
npm run format

# 4. Check git status
git status
```

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**: feat, fix, docs, style, refactor, test, chore

**Example**:

```
feat(ai-bridge): add message compression for large payloads

- Implemented 4KB compression threshold
- Added LZ compression (level 1)
- Reduced network bandwidth by 40%

Closes #123
```

## 📞 Getting Help

- **GitHub Issues**: https://github.com/Scarmonit/LLM/issues
- **Documentation**: See CLAUDE.md for detailed conventions
- **Performance**: See PERFORMANCE_BASELINE.md for metrics

---

**Last Updated**: 2025-10-17
**Version**: 2.1.1-parallel-optimized

🚀 Happy coding!
