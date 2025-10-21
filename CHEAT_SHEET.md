# LLM Framework - Command Cheat Sheet

> **Quick reference for all utilities based on shell_one_liners.sh**

**Last Updated**: 2025-10-18
**Utilities**: 70+ JavaScript scripts + 19 shell scripts
**Based On**: 288 shell one-liner patterns

---

## ⚡ Quick Start (< 30 seconds)

```bash
npm run quickfix          # 5-second health check
npm run system:start      # Start AI Bridge + agents
npm run monitor:live      # Real-time dashboard
```

---

## 🎯 Master Control Commands

| Command                 | Description                           | Time        |
| ----------------------- | ------------------------------------- | ----------- |
| `npm run quickfix`      | 5-second instant diagnostic           | 5s          |
| `npm run control`       | Master control hub (all tools)        | Interactive |
| `npm run swiss`         | Swiss Army Knife utility menu         | Interactive |
| `npm run diag:advanced` | Advanced diagnostics (8 modes)        | Interactive |
| `npm run monitor:live`  | Real-time system monitor (5s refresh) | Real-time   |

---

## 🔧 Git Operations

**Command**: `node scripts/git-helper.js <command>`

| Command        | Description                     | Example                     |
| -------------- | ------------------------------- | --------------------------- |
| `log-graph`    | Beautiful git log with graph    | `log-graph`                 |
| `log-pretty`   | Colorful formatted log          | `log-pretty`                |
| `recent`       | Last 20 commits                 | `recent`                    |
| `summary`      | Repository overview             | `summary`                   |
| `authors`      | Contributors with commit counts | `authors`                   |
| `file-history` | History of specific file        | `file-history package.json` |
| `blame`        | Who changed each line           | `blame src/file.js`         |
| `diff-branch`  | Compare two branches            | `diff-branch main develop`  |
| `today`        | Commits made today              | `today`                     |
| `contributors` | Top contributors by LOC         | `contributors 10`           |

**NPM Shortcuts**:

```bash
npm run git:log           # Beautiful log graph
npm run git:summary       # Repository summary
npm run git:contributors  # Top contributors
```

---

## 💾 Backup & Archive

**Command**: `node scripts/backup-helper.js <command>`

| Command             | Description                      | Example                                |
| ------------------- | -------------------------------- | -------------------------------------- |
| `dir-backup`        | Backup directory with tar+gzip   | `dir-backup ./src ./backups`           |
| `incremental`       | Incremental backup (last N days) | `incremental ./src 7`                  |
| `restore`           | Restore from backup              | `restore backup.tar.gz ./restored`     |
| `verify`            | Verify backup integrity          | `verify backup.tar.gz`                 |
| `list-backups`      | List all backups                 | `list-backups ./backups`               |
| `sync-remote`       | Sync to remote (rsync)           | `sync-remote ./data user@host:/backup` |
| `compress-estimate` | Estimate compressed size         | `compress-estimate ./src`              |

**NPM Shortcuts**:

```bash
npm run backup:dir ./src      # Backup directory
npm run backup:restore ./file # Restore backup
```

---

## 🔍 File Comparison (Diff)

**Command**: `node scripts/diff-helper.js <command>`

| Command             | Description                    | Example                             |
| ------------------- | ------------------------------ | ----------------------------------- |
| `files`             | Compare two files              | `files file1.txt file2.txt`         |
| `dirs`              | Compare two directories        | `dirs ./src ./backup/src`           |
| `json`              | Compare JSON files (sorted)    | `json config.json config.prod.json` |
| `unified`           | Unified diff format            | `unified file1 file2`               |
| `side-by-side`      | Side-by-side comparison        | `side-by-side file1 file2`          |
| `stats`             | Diff statistics only           | `stats file1 file2`                 |
| `binary`            | Compare binary files (hexdump) | `binary bin1 bin2`                  |
| `ignore-whitespace` | Diff ignoring whitespace       | `ignore-whitespace file1 file2`     |
| `ignore-case`       | Diff ignoring case             | `ignore-case file1 file2`           |

**NPM Shortcuts**:

```bash
npm run diff:files file1 file2   # Quick diff
npm run diff:json config1 config2 # JSON comparison
```

---

## 🌐 DNS & Domain Tools

**Command**: `node scripts/dns-helper.js <command>`

| Command             | Description                 | Example                         |
| ------------------- | --------------------------- | ------------------------------- |
| `lookup`            | DNS lookup (A records)      | `lookup google.com`             |
| `mx`                | Get MX (mail) records       | `mx github.com`                 |
| `ns`                | Get NS (nameserver) records | `ns example.com`                |
| `txt`               | Get TXT records             | `txt example.com`               |
| `soa`               | Get SOA record              | `soa example.com`               |
| `dig`               | Dig query                   | `dig example.com A`             |
| `reverse`           | Reverse DNS lookup          | `reverse 8.8.8.8`               |
| `whois`             | WHOIS domain lookup         | `whois example.com`             |
| `all`               | Get all DNS records         | `all example.com`               |
| `check-propagation` | Check DNS across servers    | `check-propagation example.com` |
| `google-dns`        | Query Google DNS over HTTPS | `google-dns example.com`        |

**NPM Shortcuts**:

```bash
npm run dns:lookup google.com     # Quick DNS lookup
npm run dns:check example.com     # Check propagation
```

---

## 🔒 SSL/TLS Operations

**Command**: `node scripts/ssl-helper.js <command>`

| Command          | Description               | Example                            |
| ---------------- | ------------------------- | ---------------------------------- |
| `check-cert`     | Check SSL certificate     | `check-cert google.com 443`        |
| `gen-key`        | Generate RSA private key  | `gen-key 2048 mykey.key`           |
| `gen-csr`        | Generate CSR              | `gen-csr private.key request.csr`  |
| `self-signed`    | Generate self-signed cert | `self-signed 365 cert.crt`         |
| `verify-cert`    | Verify cert matches key   | `verify-cert cert.crt private.key` |
| `cert-info`      | Show certificate details  | `cert-info cert.crt`               |
| `test-ssl`       | Test SSL/TLS connection   | `test-ssl example.com`             |
| `extract-pubkey` | Extract public key        | `extract-pubkey private.key`       |

**NPM Shortcuts**:

```bash
npm run ssl:check google.com      # Check certificate
npm run ssl:gen-key               # Generate key
npm run ssl:test example.com      # Test connection
```

---

## 🌐 Network Analysis

**Command**: `node scripts/network-analyzer.js <command>`

| Command               | Description                   | Example                            |
| --------------------- | ----------------------------- | ---------------------------------- |
| `dns-lookup`          | DNS lookup multiple resolvers | `dns-lookup google.com`            |
| `scan-ports`          | Port scan (defensive only)    | `scan-ports 127.0.0.1 80 443`      |
| `port-watch`          | Watch specific port           | `port-watch 65028`                 |
| `connections-summary` | Summarize connections         | `connections-summary`              |
| `bandwidth-monitor`   | Monitor bandwidth             | `bandwidth-monitor`                |
| `whois`               | WHOIS lookup                  | `whois example.com`                |
| `http-headers`        | Fetch HTTP headers            | `http-headers https://example.com` |
| `ssl-check`           | Quick SSL check               | `ssl-check example.com`            |

**NPM Shortcuts**:

```bash
npm run net:analyze               # Show all commands
npm run net:dns google.com        # DNS lookup
npm run net:scan 127.0.0.1 80 443 # Port scan
npm run net:watch 65028           # Watch port
npm run net:summary               # Connection summary
```

---

## 📊 Log Analysis

**Command**: `node scripts/log-analyzer.js <command>`

| Command         | Description               | Example                          |
| --------------- | ------------------------- | -------------------------------- |
| `grep-pattern`  | Search for pattern        | `grep-pattern error app.log`     |
| `tail-follow`   | Follow log (like tail -f) | `tail-follow app.log`            |
| `top-ips`       | Find top IPs              | `top-ips access.log`             |
| `filter-errors` | Filter errors/warnings    | `filter-errors app.log`          |
| `http-status`   | Analyze HTTP status codes | `http-status access.log`         |
| `time-range`    | Extract time range        | `time-range app.log 14:00 15:00` |
| `unique-lines`  | Remove duplicates         | `unique-lines file.log`          |

**NPM Shortcuts**:

```bash
npm run log:analyze               # Show all commands
npm run log:grep error app.log    # Search logs
npm run log:errors app.log        # Filter errors
npm run log:ips access.log        # Top IPs
npm run log:http access.log       # HTTP status
```

---

## 🏥 System Health & Diagnostics

### Quick Health Check

```bash
npm run quickfix                  # 5-second check (fastest)
npm run health:check              # Project health
npm run health:system             # AI system health
npm run health:monitor            # Quick health check
npm run health:watch              # Health watch (5s loop)
```

### Process Management

```bash
npm run proc:top                  # Top CPU processes
npm run proc:mem                  # Top memory processes
npm run proc:watch                # Watch process count
npm run proc:zombie               # Find zombie processes
npm run cleanup                   # Kill zombies & clean artifacts
```

### Network Diagnostics

```bash
npm run net:listening             # Show listening ports
npm run net:connections           # Active connections
npm run net:kill <port>           # Kill process on port
npm run net:debug                 # Network debug utility
npm run net:diag                  # Network diagnostics
```

### Advanced Diagnostics

```bash
npm run diag:advanced             # Interactive diagnostics (8 modes)
npm run diag:full                 # Full system analysis
npm run bridge:diagnostic         # AI Bridge diagnostic
npm run monitor:live              # Real-time dashboard
```

---

## 🧪 Testing

```bash
# Quick Tests (Fast)
npm run test:quick                # Basic + A2A tests (10s)
npm run test:quick <pattern>      # Pattern matching

# Full Test Suite
npm test                          # All tests (concurrency: 4)
npm run test:parallel             # Parallel (concurrency: 4)
npm run test:fast                 # Max parallel (concurrency: 8)

# Specific Tests
npm run test:unit                 # Unit tests only
npm run test:integration          # Integration tests only
npm run test:coverage             # With coverage report

# Utilities
npm run quick-test                # Quick test runner
npm run test:safe                 # Safe isolated runner
```

---

## 🔧 Development Utilities

### Code Helpers

```bash
npm run analyze                   # AI code assistant
npm run assistant                 # Code assistant
npm run assistant:cli             # CLI assistant
npm run lint                      # ESLint check
npm run lint:fix                  # Auto-fix linting
npm run format                    # Prettier format
```

### Workspace Management

```bash
npm run workspace:clean:dry       # Preview cleanup
npm run workspace:clean           # Clean temp files
npm run workspace:clean:aggressive # Deep clean
npm run cleanup                   # Kill zombies + clean
npm run cleanup:test              # Test artifacts cleanup
```

### Development Server

```bash
npm run dev                       # Development server (nodemon)
npm run start                     # Start production
npm run start:optimized           # Optimized server
npm run start:ultra               # Ultra-optimized server
```

---

## 🤖 AI Bridge System

### Start/Stop

```bash
npm run bridge:start              # Start AI Bridge (WS:65028, HTTP:65029)
npm run system:start              # Start bridge + agents
npm run system:full               # Bridge + agents + GUI
npm run dev:kill-bridge           # Kill bridge processes
```

### Agents

```bash
npm run agent:claude              # Start Claude agent
npm run agent:ollama              # Start Ollama agent
npm run agent:analyzer            # Start code analyzer
npm run agent:fixer               # Start code fixer
npm run agents:start              # Start analyzer + fixer
```

### Monitoring

```bash
npm run bridge:diagnostic         # Bridge diagnostics
npm run dev:bridge-check          # Check bridge status
npm run monitor:live              # Real-time monitor
```

---

## 🚀 Performance & Optimization

```bash
npm run optimize                  # Optimization suite
npm run optimize:full             # Full optimization
npm run ultra:optimize            # Ultra optimization
npm run performance:analyze       # Performance analysis
npm run test:performance          # Performance tests
npm run validate:ultra            # Validate optimization
```

---

## 🛠️ Swiss Army Knife (Interactive Menu)

```bash
npm run swiss                     # Launch Swiss Army Knife
npm run util                      # Alias for swiss
```

**Features**:

1. Git Visualization (beautiful log with stats)
2. Quick HTTP Server (Python/PHP fallback)
3. DNS Lookup (dig/host/nslookup/Google DNS API)
4. Base64 Encode/Decode (text and files)
5. Text Processing Toolkit (7 operations)
6. Network Quick Tests (ping, TCP, HTTP, DNS)
7. System Info (CPU, memory, disk, processes)
8. Project Analysis (file types, dependencies, git)

---

## 📋 Common Workflows

### Morning Startup

```bash
npm run quickfix && npm run system:start
npm run monitor:live &
```

### Before Committing

```bash
npm run quickfix
npm test
npm run lint:fix && npm run format
npm run proc:zombie
npm run workspace:clean:dry
```

### Debugging Network Issues

```bash
npm run net:listening           # Check ports
npm run net:summary             # Active connections
npm run net:watch 65028         # Watch AI Bridge
npm run bridge:diagnostic       # Full diagnostic
```

### Performance Investigation

```bash
npm run quickfix                # Baseline
npm run proc:top                # CPU consumers
npm run proc:mem                # Memory consumers
npm run performance:analyze     # Full analysis
```

### End of Day Cleanup

```bash
npm run cleanup                 # Kill zombies
npm run workspace:clean         # Clean temp files
npm run quickfix                # Final check
```

---

## 📚 Shell One-Liners Integration

This toolkit is based on **288 battle-tested shell one-liners**:

- **Blocks 1-11**: Shell manipulation & utilities
- **Blocks 12-28**: File operations (mkdir, rename, chmod)
- **Blocks 29-41**: Process monitoring (lsof, ps, top)
- **Blocks 42-56**: File searching (find with various filters)
- **Blocks 57-73**: System monitoring (vmstat, iostat, kill)
- **Blocks 74-78**: File comparison (diff, vimdiff)
- **Blocks 79-85**: Logs & backups (tail, tar, dump)
- **Blocks 86-97**: Process control (cpulimit, screen)
- **Blocks 98-138**: OpenSSL & security
- **Blocks 139-160**: Networking (curl, HTTP)
- **Blocks 161-228**: Advanced networking (ssh, tcpdump, nmap)
- **Blocks 229-240**: DNS & domains (dig, certbot, whois)
- **Blocks 241-242**: Git operations
- **Blocks 243-245**: Python utilities
- **Blocks 246-287**: Text processing (awk, sed, grep, perl)

**Reference**: `~/Desktop/shell_one_liners.sh`

---

## 🎯 Quick Reference Cards

### Network Troubleshooting

```bash
npm run net:listening     # What's running?
npm run net:summary       # Who's connected?
npm run net:dns <domain>  # Can I resolve?
npm run net:kill <port>   # Kill process
```

### Process Issues

```bash
npm run proc:top          # What's consuming CPU?
npm run proc:mem          # What's using memory?
npm run proc:zombie       # Any zombies?
npm run cleanup           # Clean it up
```

### Git Quick Actions

```bash
node scripts/git-helper.js summary       # Repo overview
node scripts/git-helper.js recent        # Recent commits
node scripts/git-helper.js authors       # Contributors
node scripts/git-helper.js today         # Today's work
```

### SSL/TLS Quick Check

```bash
npm run ssl:check google.com    # Check certificate
npm run ssl:test example.com    # Test connection
```

### DNS Quick Lookup

```bash
npm run net:dns google.com               # Quick DNS
node scripts/dns-helper.js lookup github.com  # Detailed
node scripts/dns-helper.js check-propagation example.com  # Propagation
```

---

## 📞 Help & Documentation

```bash
# Get help for any utility
node scripts/<utility>.js help

# Examples
node scripts/git-helper.js help
node scripts/backup-helper.js help
node scripts/diff-helper.js help
node scripts/dns-helper.js help
node scripts/ssl-helper.js help
node scripts/network-analyzer.js help
node scripts/log-analyzer.js help
```

---

**For full documentation**: See `DEVELOPER_GUIDE.md`
**For project status**: See `PROJECT_STATUS.md`
**For AI instructions**: See `CLAUDE.md`

---

**Last Updated**: 2025-10-18
**Version**: 2.1.1-parallel-optimized
**Total Utilities**: 70 JS + 19 Shell = **89 scripts**
