# Developer Tools & Utilities

Comprehensive toolkit for LLM Framework development, testing, and diagnostics.

---

## 🎮 System Control (Master Command)

**The one command to rule them all** - unified control interface for all common workflows.

### Usage

```bash
# Show all available actions
npm run control help

# Common actions
npm run control status      # Show complete system status
npm run control start       # Start AI Bridge and agents
npm run control stop        # Stop all processes
npm run control test basic  # Run quick tests
npm run control clean       # Clean workspace
npm run control quick       # Full workflow: stop + clean + test + start
```

### Available Actions

| Action           | Description                                                 |
| ---------------- | ----------------------------------------------------------- |
| `status`         | Show complete system status (git, bridge, processes, tests) |
| `start`          | Start AI Bridge and agents                                  |
| `stop`           | Stop all AI Bridge processes                                |
| `test [pattern]` | Run quick tests with optional pattern                       |
| `clean`          | Clean workspace                                             |
| `diagnostic`     | Run full system diagnostic                                  |
| `dev`            | Start development mode (bridge + watch)                     |
| `reset`          | Complete reset (stop + clean + status)                      |
| `health`         | Quick health check                                          |
| `quick`          | Quick workflow: stop + clean + test + start                 |
| `info`           | Show system information                                     |

### Examples

```bash
# Check what's running
npm run control status

# Quick workflow (most common)
npm run control quick

# Clean start
npm run control reset
npm run control start

# Test specific feature
npm run control test a2a

# Health check
npm run control health
```

**File**: `scripts/system-control.js`

---

## 🚀 Quick Test Runner

Run individual test files or patterns quickly without waiting for the full test suite.

### Usage

```bash
# Run tests matching a pattern
npm run quick-test [pattern]

# Examples
npm run quick-test basic           # Run basic.test.js
npm run quick-test a2a              # Run all A2A tests
npm run quick-test claude           # Run Claude-related tests
npm run quick-test                  # Run all tests (one by one)
```

### Features

- ⚡ Runs tests individually (no concurrency issues)
- ⏱️ 30-second timeout per test file
- 📊 Summary report with pass/fail counts
- 🎯 Pattern matching for test file selection

### Output Example

```
🧪 Running: basic.test.js
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[test output...]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ basic.test.js passed (0.12s)

📊 Test Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total: 1
✅ Passed: 1
❌ Failed: 0
⏱️  Time: 0.12s
```

**File**: `scripts/quick-test.js`

---

## 🧹 Workspace Cleanup

Remove temporary files, test artifacts, and development clutter.

### Usage

```bash
# Preview what will be removed (dry run)
npm run workspace:clean:dry

# Normal cleanup (safe mode)
npm run workspace:clean

# Aggressive cleanup (includes reports and demo files)
npm run workspace:clean:aggressive
```

### What Gets Removed

**Always removed:**

- Test artifacts: `.test-sessions/`, `test-output.txt`, `test.txt`
- Temp files: `variableContent`, `NUL`, `summary.txt`
- Temp directories: `test-workspace/`, `demo/`, `output/`

**Aggressive mode also removes:**

- Demo scripts: `demo-*.js`, `test-a2a-*.js`, `validate-*.js`
- Report files: `*-COMPLETE.md`, `*-REPORT.md`, `*-STATUS.md`

### Features

- 🔍 Dry-run mode to preview changes
- 📊 Summary report with space saved
- 🛡️ Protects critical directories (src, tests, node_modules, etc.)
- ⚡ Fast pattern-based cleanup

**File**: `scripts/workspace-cleanup.js`

---

## 🛠️ Developer Helper

Quick access to common development tasks using shell one-liners.

### Usage

```bash
# Show all available commands
npm run dev:helper

# Specific commands
npm run dev:ports              # Show all listening ports
npm run dev:bridge-check       # Check AI Bridge ports (65028, 65029)
npm run dev:kill-bridge        # Kill all AI Bridge processes
```

### Available Commands

| Command                | Description                             |
| ---------------------- | --------------------------------------- |
| `ports`                | Show all listening ports on the system  |
| `bridge-ports`         | Check if AI Bridge ports are in use     |
| `kill-bridge`          | Kill all AI Bridge processes            |
| `node-procs`           | List all Node.js processes              |
| `git-status`           | Quick git status summary                |
| `quick-test [pattern]` | Run quick test on specific file         |
| `cleanup`              | Cleanup workspace (dry run preview)     |
| `disk-usage`           | Check disk usage of project directories |
| `env-check`            | Check environment variables             |

### Examples

```bash
# Check what's running on ports
node scripts/dev-helper.js ports

# See bridge status
node scripts/dev-helper.js bridge-ports

# Kill stuck bridge processes
node scripts/dev-helper.js kill-bridge

# Run quick test
node scripts/dev-helper.js quick-test basic

# Check environment
node scripts/dev-helper.js env-check
```

**File**: `scripts/dev-helper.js`

---

## 🌉 AI Bridge Diagnostic

Comprehensive diagnostic tool for AI Bridge and A2A system health monitoring.

### Usage

```bash
# Run diagnostics (Git Bash required)
npm run bridge:diagnostic

# Or directly
bash scripts/ai-bridge-diagnostic.sh

# Kill bridge after diagnostic
bash scripts/ai-bridge-diagnostic.sh --kill-bridge
```

### What It Checks

1. **Port Status** - Are WS (65028) and HTTP (65029) listening?
2. **Active Processes** - Node.js/bridge/agent processes
3. **Process Count** - By user
4. **Network Connections** - Active connections summary
5. **Connectivity Tests** - Can we reach the bridge?
6. **Recent Logs** - Log activity in last 60 minutes
7. **Zombie Processes** - Defunct process detection
8. **Memory Usage** - Node.js memory consumption
9. **Open Files** - Files opened by AI Bridge
10. **Disk Usage** - Project directory sizes
11. **Health Check** - HTTP health endpoint status
12. **Recent Errors** - Last 100 lines of logs

### Output Example

```
╔════════════════════════════════════════════════════╗
║   AI Bridge & A2A System Diagnostic Tool          ║
╚════════════════════════════════════════════════════╝

[1] Checking AI Bridge Ports...
tcp4  0  0  127.0.0.1.65028  *.*  LISTEN
tcp4  0  0  127.0.0.1.65029  *.*  LISTEN

[2] Active Node.js Processes...
1234  node  src/ai-bridge.js
5678  node  src/agents/a2a-ollama-agent.js

...

Diagnostic Complete - 2025-10-17 12:34:56
```

**File**: `scripts/ai-bridge-diagnostic.sh`

---

## 📦 NPM Script Reference

### Testing

```bash
npm test                    # Full test suite (sequential)
npm run test:quick          # Quick test runner (by pattern)
npm run quick-test [name]   # Quick test specific file
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests only
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report
```

### Development

```bash
npm run dev                 # Start dev server with nodemon
npm run dev:helper [cmd]    # Developer helper utility
npm run dev:ports           # Show listening ports
npm run dev:bridge-check    # Check bridge status
npm run dev:kill-bridge     # Kill bridge processes
```

### AI Bridge & Agents

```bash
npm run bridge:start        # Start AI Bridge server
npm run bridge:diagnostic   # Run bridge diagnostics
npm run agent:ollama        # Start Ollama agent
npm run agent:claude        # Start Claude agent
npm run agent:analyzer      # Start code analyzer
npm run system:start        # Start bridge + agents
npm run system:full         # Start complete system
```

### Workspace Management

```bash
npm run workspace:clean         # Clean workspace
npm run workspace:clean:dry     # Preview cleanup
npm run workspace:clean:aggressive  # Aggressive cleanup
npm run cleanup             # Pre-test cleanup
```

### Optimization & Health

```bash
npm run optimize            # Run optimization suite
npm run performance:analyze # Performance analysis
npm run health:check        # Health check
npm run health:monitor      # Monitor health (bash)
npm run system:optimize     # System optimization
```

---

## 🎯 Best Practices

### Before Committing

```bash
# 1. Run quick tests on changed areas
npm run quick-test <your-feature>

# 2. Check workspace cleanliness
npm run workspace:clean:dry

# 3. Verify bridge is not running
npm run dev:bridge-check

# 4. Run linter
npm run lint:fix

# 5. Full test suite (if time permits)
npm test
```

### Debugging A2A Issues

```bash
# 1. Run full diagnostic
npm run bridge:diagnostic

# 2. Check bridge ports
npm run dev:bridge-check

# 3. Kill stuck processes
npm run dev:kill-bridge

# 4. Check environment
node scripts/dev-helper.js env-check

# 5. Restart system
npm run system:start
```

### Test Development

```bash
# 1. Create test file in tests/
touch tests/my-feature.test.js

# 2. Run it quickly
npm run quick-test my-feature

# 3. Watch for changes
npm run test:watch

# 4. Check coverage when done
npm run test:coverage
```

---

## 🔧 Troubleshooting

### Tests Timing Out

- Use `npm run quick-test [pattern]` to run individual tests
- Check for port conflicts with `npm run dev:ports`
- Kill stuck processes with `npm run dev:kill-bridge`

### Bridge Won't Start

```bash
# Check if port is in use
npm run dev:bridge-check

# Kill existing processes
npm run dev:kill-bridge

# Try starting again
npm run bridge:start
```

### Workspace Cluttered

```bash
# See what can be removed
npm run workspace:clean:dry

# Clean it up
npm run workspace:clean
```

### Environment Issues

```bash
# Check all env vars
node scripts/dev-helper.js env-check

# Verify .env file exists
ls -la .env
```

---

## 📝 Shell One-Liners Source

The `scripts/ai-bridge-diagnostic.sh` and `scripts/dev-helper.js` utilities leverage patterns from the comprehensive shell one-liners collection at:

**File**: `Desktop/shell_one_liners.sh`

This includes:

- `lsof` patterns for port checking
- `ps` patterns for process monitoring
- `netstat` for network analysis
- `find` for log file discovery
- `curl` for HTTP health checks

---

## 🚀 Future Enhancements

Planned improvements:

- [ ] Visual dashboard for real-time monitoring
- [ ] Automated test bisection for finding failures
- [ ] Performance regression detection
- [ ] Automatic cleanup on test failures
- [ ] Integration with CI/CD pipeline
- [ ] Windows-native diagnostic tools (PowerShell)

---

**Last Updated**: 2025-10-17
**Maintained By**: scarmonit
**Related Files**: `CLAUDE.md`, `package.json`, `scripts/`
