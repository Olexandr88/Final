# LLM Framework - Quick Reference Card

> **Print this or keep it open while developing**

## ⚡ 5-Second Commands (Use These First)

```bash
npm run quickfix        # Instant health check (5s)
npm run control         # Master control hub (all tools)
npm run swiss           # Swiss Army Knife (8 utilities)
npm run monitor:live    # Real-time dashboard (5s refresh)
```

---

## 🎯 Most Common Tasks

### Starting Your Day

```bash
npm run quickfix && npm run system:start
```

### Running Tests

```bash
npm run test:quick <pattern>    # Fast iteration
npm test                        # Full suite
```

### Debugging Issues

```bash
npm run quickfix                # Quick check
npm run diag:advanced           # Deep analysis
npm run monitor:live            # Real-time watch
```

### Cleaning Up

```bash
npm run cleanup                 # Kill zombies
npm run workspace:clean         # Clean files
```

---

## 📊 Diagnostics & Monitoring

| Command                 | Purpose               | Time        |
| ----------------------- | --------------------- | ----------- |
| `npm run quickfix`      | 5-second health check | 5s          |
| `npm run control`       | Master control hub    | Interactive |
| `npm run swiss`         | Swiss Army Knife menu | Interactive |
| `npm run monitor:live`  | Real-time dashboard   | Live        |
| `npm run diag:advanced` | 8-mode deep analysis  | Interactive |
| `npm run health:check`  | Project health        | 10s         |
| `npm run health:system` | AI system health      | 15s         |

---

## 🌐 Network Commands

| Command                         | Purpose                  | Time |
| ------------------------------- | ------------------------ | ---- |
| `npm run net:listening`         | Show all listening ports | 1s   |
| `npm run net:connections`       | Active connections       | 2s   |
| `npm run net:summary`           | Connection summary       | 2s   |
| `npm run net:kill <port>`       | Kill process on port     | 1s   |
| `npm run net:dns <domain>`      | DNS lookup (4 methods)   | 2s   |
| `npm run net:watch <port>`      | Watch port activity      | Live |
| `npm run net:scan <ip> <ports>` | Port scanning            | 5s   |

---

## 🔧 Process Management

| Command               | Purpose               | Time |
| --------------------- | --------------------- | ---- |
| `npm run proc:top`    | Top CPU processes     | 1s   |
| `npm run proc:mem`    | Top memory processes  | 1s   |
| `npm run proc:zombie` | Find zombie processes | 2s   |
| `npm run proc:watch`  | Watch Node.js count   | Live |
| `npm run cleanup`     | Kill zombies + clean  | 5s   |

---

## 🔒 SSL/TLS Operations

| Command                      | Purpose               | Time |
| ---------------------------- | --------------------- | ---- |
| `npm run ssl:helper`         | Show all SSL commands | 1s   |
| `npm run ssl:check <domain>` | Check certificate     | 2s   |
| `npm run ssl:test <domain>`  | Test SSL/TLS          | 3s   |
| `npm run ssl:gen-key`        | Generate RSA key      | 1s   |

---

## 🧪 Testing

| Command                        | Purpose              | Time   |
| ------------------------------ | -------------------- | ------ |
| `npm run test:quick <pattern>` | Quick pattern test   | Fast   |
| `npm test`                     | Full test suite      | Slow   |
| `npm run test:unit`            | Unit tests only      | Medium |
| `npm run test:integration`     | Integration tests    | Medium |
| `npm run test:coverage`        | With coverage report | Slow   |
| `npm run test:watch`           | Watch mode           | Live   |

---

## 🤖 AI Bridge System

| Command                     | Purpose                | Time |
| --------------------------- | ---------------------- | ---- |
| `npm run bridge:start`      | Start AI Bridge only   | 2s   |
| `npm run system:start`      | Start bridge + agents  | 5s   |
| `npm run system:full`       | Start all + GUI        | 10s  |
| `npm run dev:bridge-check`  | Check bridge status    | 1s   |
| `npm run dev:kill-bridge`   | Kill bridge processes  | 1s   |
| `npm run bridge:diagnostic` | Full bridge diagnostic | 5s   |

**Ports:**

- WebSocket: `65028`
- HTTP API: `65029`

---

## 🧹 Workspace Management

| Command                              | Purpose          | Time |
| ------------------------------------ | ---------------- | ---- |
| `npm run workspace:clean:dry`        | Preview cleanup  | 2s   |
| `npm run workspace:clean`            | Clean temp files | 5s   |
| `npm run workspace:clean:aggressive` | Deep clean       | 10s  |

---

## 🎨 Swiss Army Knife (npm run swiss)

**8 Built-in Utilities:**

1. **Git Visualization** - Beautiful commit log with stats
2. **HTTP Server** - Quick serve (Python/PHP/netcat)
3. **DNS Lookup** - 4 methods (dig/host/nslookup/Google)
4. **Base64 Encode/Decode** - Text and files
5. **Text Processing** - 7 operations (dedupe, number, extract, etc.)
6. **Network Quick Test** - Ping, TCP, HTTP, DNS
7. **System Info** - CPU, memory, disk, processes
8. **Project Analysis** - File types, dependencies, git stats

---

## 🔍 Advanced Diagnostics (npm run diag:advanced)

**8 Analysis Modes:**

1. **System Resources** - vmstat, iostat, CPU, memory
2. **Process System Calls** - strace analysis
3. **Log Analysis** - Error patterns, timestamps
4. **Text Processing** - AWK/sed/grep operations
5. **Network Deep Analysis** - Traffic, connections, WebSocket
6. **Performance Bottlenecks** - CPU, I/O, memory bottlenecks
7. **Security Audit** - SUID files, permissions, recent changes
8. **AI Bridge Analysis** - Bridge-specific diagnostics

---

## 📈 Performance Monitoring

**Metrics Endpoints:**

```bash
curl http://localhost:65029/health      # Health check
curl http://localhost:65029/api/status  # Detailed metrics
curl http://localhost:65029/api/agents  # Agent list
```

**Performance Targets:**

- Message Latency: < 120ms (p95)
- Memory (idle): < 100MB
- Cache Hit Rate: > 75%
- Startup Time: < 2s

---

## 🚨 Emergency Commands

### System is Hanging

```bash
npm run proc:zombie              # Find culprits
npm run cleanup                  # Kill zombies
taskkill /F /IM node.exe         # Nuclear option (Windows)
```

### Port Conflicts

```bash
npm run net:listening            # Find what's using ports
npm run net:kill 65028           # Kill specific port
npm run dev:kill-bridge          # Kill AI Bridge
```

### Memory Issues

```bash
npm run proc:mem                 # Find memory hogs
npm run workspace:clean          # Free disk space
npm run cleanup                  # Kill zombies
```

### Network Issues

```bash
npm run net:debug                # Network diagnostic
npm run net:dns google.com       # Test DNS
npm run net:summary              # Connection overview
npm run swiss                    # Menu → Network Quick Test
```

---

## 🎯 Daily Workflow

**Morning (< 30 seconds):**

```bash
npm run quickfix && npm run system:start
```

**Development Loop:**

```bash
# Code... test... code... test...
npm run test:quick <pattern>
npm run quickfix
```

**Pre-Commit:**

```bash
npm test && npm run lint:fix && npm run format
npm run proc:zombie && npm run workspace:clean:dry
```

**End of Day:**

```bash
npm run cleanup && npm run workspace:clean
npm run quickfix
```

---

## 📚 Documentation Files

- `START-HERE.md` - Onboarding guide
- `DEVELOPER_GUIDE.md` - Complete developer reference (this file)
- `TOOLKIT-SUMMARY.md` - Shell toolkit overview
- `CHEAT-SHEET.md` - Shell one-liner reference
- `SYSTEM-MAP.txt` - Visual system architecture
- `CONVERSATION-SUMMARY.md` - Session work summary
- `CLAUDE.md` - Project constitution
- `PERFORMANCE_BASELINE.md` - Performance metrics

---

## 🔗 Quick Links

- **GitHub**: https://github.com/Scarmonit/LLM
- **Issues**: https://github.com/Scarmonit/LLM/issues
- **Version**: 2.1.1-parallel-optimized
- **Node**: >= 18.0.0

---

## 💡 Pro Tips

1. **Use `npm run quickfix` first** - Fastest diagnostic (5s)
2. **Keep `npm run monitor:live` running** - Real-time visibility
3. **Use `npm run control`** - Access all tools from one place
4. **Try `npm run swiss`** - 8 utilities without memorizing commands
5. **Chain commands**: `npm run quickfix && npm run system:start`
6. **Add aliases** to `.bashrc`:
   ```bash
   alias qf='npm run quickfix'
   alias mc='npm run control'
   alias sw='npm run swiss'
   alias mon='npm run monitor:live'
   ```

---

**Last Updated**: 2025-10-17
**Print Date**: ******\_******

---

_Keep this handy while developing. Memorize the "5-Second Commands" section first._
