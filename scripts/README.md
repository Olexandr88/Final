# Scripts Directory - Developer Tools & Automation

This directory contains automation scripts and developer utilities for the LLM Framework project.

---

## 🛠️ Developer Utilities

### `dev-utils.sh`

**Purpose:** 20+ shell one-liners for daily development tasks

**Usage:**

```bash
# Source the utilities
source scripts/dev-utils.sh

# Run any function
<function_name> [arguments]
```

**Available Functions:**

#### Code Analysis

- `show_top_commands` - Show most used shell commands
- `find_duplicates` - Find duplicate files in project
- `find_large_files` - Find files larger than 1MB
- `count_loc` - Count lines of code by extension
- `find_long_lines` - Find files with lines >120 chars
- `find_todos` - Find TODO/FIXME comments

#### Test Utilities

- `test_failures_only` - Run tests, show only failures
- `count_tests` - Count test files and cases
- `clean_test_artifacts` - Remove test artifacts (_.test.db, _.test.log)

#### Git Tools

- `git_log_graph` - Pretty git log with graph
- `git_file_authors <file>` - Show top contributors to file

#### Network & Process

- `show_listening_ports` - Show listening network ports
- `kill_port <port>` - Kill process on specific port
- `check_ai_bridge` - Check AI Bridge status (ports 65028/65029)

#### AI Bridge Specific

- `monitor_bridge_metrics` - Monitor AI Bridge metrics (live dashboard)

#### Log Analysis

- `tail_with_time <file>` - Tail log with timestamps
- `analyze_errors [dir]` - Find most common errors in logs

#### Performance

- `show_dir_sizes` - Show directory sizes sorted
- `watch_directory [dir]` - Watch directory for changes

#### Cleanup

- `clean_test_artifacts` - Remove test artifacts
- `clean_empty_dirs` - Remove empty directories

**Examples:**

```bash
# Check if AI Bridge is running
check_ai_bridge

# Find code quality issues
find_long_lines
find_todos

# Kill stuck AI Bridge
kill_port 65028

# Git analysis
git_log_graph
git_file_authors src/ai-bridge.js

# Monitor system
monitor_bridge_metrics
```

---

## 🤖 Console.log Migration Tool

### `migrate-to-logger.sh`

**Purpose:** Automated migration from console.log to Winston logger

**Features:**

- Dry-run mode for safety testing
- Automatic logger import injection
- Full backup before changes
- Syntax validation after migration
- Rollback capability
- Statistics reporting

**Usage:**

#### Dry Run (recommended first)

```bash
./scripts/migrate-to-logger.sh --dry-run --dirs "src/agents"
```

#### Run Migration

```bash
./scripts/migrate-to-logger.sh --dirs "src/agents"
```

#### Rollback (if needed)

```bash
./scripts/migrate-to-logger.sh --rollback .backups/logger-migration-20251017-211826
```

#### Multiple Directories

```bash
./scripts/migrate-to-logger.sh --dirs "src/agents src/utils"
```

**What it does:**

1. Scans target directories for console statements
2. Creates backup in `.backups/logger-migration-*/`
3. Adds logger import if missing
4. Replaces:
   - `console.log` → `logger.info`
   - `console.error` → `logger.error`
   - `console.warn` → `logger.warn`
   - `console.info` → `logger.info`
   - `console.debug` → `logger.debug`
5. Validates syntax with Node.js
6. Reports statistics

**Output Example:**

```
=== Migration Statistics ===

Files processed:    15
Files modified:     12
Total replacements: 186
Backup location:    /c/Users/scarm/.backups/logger-migration-20251017-211826

✓ All files passed syntax check
```

**Options:**

- `--dry-run` - Show what would change without modifying files
- `--rollback <backup>` - Restore files from backup directory
- `--dirs <directories>` - Target directories (space-separated)
- `--help` - Show help message

---

## 🚀 Deployment & Operations

### `deploy-auto.js`

**Purpose:** Automated deployment with health checks

**Usage:**

```bash
npm run deploy:a2a
# or
node scripts/deploy-auto.js
```

**Steps:**

1. Runs tests
2. Builds production assets
3. Performs health checks
4. Deploys to configured environment

### `a2a-deploy.js`

**Purpose:** Deploy A2A (Agent-to-Agent) system

**Usage:**

```bash
npm run deploy:a2a
```

---

## 🏥 Health & Monitoring

### `system-health-monitor.sh`

**Purpose:** Continuous system health monitoring

**Usage:**

```bash
bash scripts/system-health-monitor.sh
```

**Monitors:**

- AI Bridge status (ports 65028/65029)
- CPU/memory usage
- Active processes
- Log file sizes
- Error rates

### `health-check.js`

**Purpose:** One-time health check

**Usage:**

```bash
npm run health:check
```

---

## 📊 Performance

### `performance-optimizer.js`

**Purpose:** Analyze and optimize system performance

**Usage:**

```bash
npm run performance:analyze
```

**Generates:**

- Performance metrics report
- Bottleneck analysis
- Optimization recommendations
- Saved to `reports/` directory

---

## 🧹 Cleanup & Maintenance

### Pre-commit Hook (`.husky/pre-commit`)

**Purpose:** Quality gates before commits

**Checks:**

1. ✅ No console.log in src/ (allow in tests/)
2. ✅ Line length limit (120 chars)
3. ⚠️ TODO/FIXME must have descriptions
4. ⚠️ ESLint validation (warning only)
5. ✅ Node.js syntax validation (blocking)

**Bypass (not recommended):**

```bash
git commit --no-verify
```

### `.claude/scripts/pre-test-cleanup.js`

**Purpose:** Clean test artifacts before running tests

**Auto-runs:** Before `npm test` (configured in package.json)

**Manual run:**

```bash
npm run cleanup
```

---

## 📦 Build Scripts

### `build-website.js`

**Purpose:** Build static website

**Usage:**

```bash
npm run build:website
```

---

## 🔧 AI Bridge Management

### Starting AI Bridge

```bash
# Standard start
npm run start:bridge

# With agents
npm run agents:start
```

### Monitoring

```bash
# Check status
source scripts/dev-utils.sh
check_ai_bridge

# Live metrics
monitor_bridge_metrics
```

### Troubleshooting

```bash
# Check what's on the ports
show_listening_ports

# Kill stuck process
kill_port 65028
kill_port 65029

# View logs with timestamps
tail_with_time logs/ai-bridge.log
```

---

## 📚 Common Workflows

### Daily Development

```bash
# 1. Source utilities
source scripts/dev-utils.sh

# 2. Check system health
check_ai_bridge
show_listening_ports

# 3. Find issues
find_todos
find_long_lines

# 4. Run tests
npm test
```

### Code Quality Improvement

```bash
# 1. Find console.log usage
grep -r "console\." src/ | wc -l

# 2. Migrate to logger (dry run first)
./scripts/migrate-to-logger.sh --dry-run --dirs "src/utils"

# 3. Run actual migration
./scripts/migrate-to-logger.sh --dirs "src/utils"

# 4. Verify
npm test

# 5. Commit
git add .
git commit -m "refactor: migrate console.log to logger in utils"
```

### Deployment

```bash
# 1. Health check
npm run health:check

# 2. Run tests
npm test

# 3. Build
npm run build

# 4. Deploy
npm run deploy:a2a

# 5. Monitor
monitor_bridge_metrics
```

---

## 🎯 Best Practices

### Before Migration

1. Always run with `--dry-run` first
2. Review the changes it would make
3. Ensure backups are created
4. Have rollback command ready

### After Migration

1. Run syntax validation
2. Run full test suite
3. Review git diff
4. Test affected functionality
5. Commit with descriptive message

### Monitoring

1. Use `check_ai_bridge` regularly
2. Monitor logs with `tail_with_time`
3. Run `health:check` before deployments
4. Check `performance:analyze` weekly

---

## 🔒 Safety Features

### Backups

All migration scripts create backups in `.backups/` before making changes.

**Backup naming:**

```
.backups/logger-migration-YYYYMMDD-HHMMSS/
```

### Rollback

```bash
./scripts/migrate-to-logger.sh --rollback <backup-path>
```

### Validation

- Syntax validation with `node --check`
- Test suite validation
- Git diff review

---

## 📖 Additional Resources

- [CLAUDE.md](../CLAUDE.md) - Project guidelines
- [AUTONOMOUS_IMPROVEMENTS.md](../AUTONOMOUS_IMPROVEMENTS.md) - Recent improvements
- [code-quality-report.md](../code-quality-report.md) - Quality analysis
- [shell-utils-improvements.md](../shell-utils-improvements.md) - Shell utilities reference

---

## 🤝 Contributing

When adding new scripts:

1. **Add to this README** - Document usage and purpose
2. **Make executable** - `chmod +x scripts/new-script.sh`
3. **Add help message** - `--help` flag
4. **Include dry-run** - For destructive operations
5. **Create backups** - Before modifications
6. **Validate output** - Syntax checks
7. **Add to package.json** - If user-facing

---

## 📊 Script Statistics

| Script                     | Lines | Type    | Purpose              |
| -------------------------- | ----- | ------- | -------------------- |
| `dev-utils.sh`             | 400+  | Bash    | Developer utilities  |
| `migrate-to-logger.sh`     | 300+  | Bash    | Logger migration     |
| `deploy-auto.js`           | 200+  | Node.js | Automated deployment |
| `performance-optimizer.js` | 500+  | Node.js | Performance analysis |
| `health-check.js`          | 150+  | Node.js | Health monitoring    |

---

**Last Updated:** 2025-10-17
**Maintained by:** LLM Framework Team
