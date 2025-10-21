# A2A MCP CLI - Comprehensive Guide

## Overview

The A2A MCP CLI is a powerful command-line interface that integrates **native MCP (Model Context Protocol) tools** with **intelligent agent orchestration**. This system provides access to 500+ apps via Composio/Rube, autonomous task execution, cross-agent memory synchronization, and self-healing capabilities.

## Table of Contents

1. [Installation](#installation)
2. [Quick Start](#quick-start)
3. [CLI Commands](#cli-commands)
4. [Agent Management](#agent-management)
5. [Task Orchestration](#task-orchestration)
6. [Memory Management](#memory-management)
7. [Workflows](#workflows)
8. [System Health](#system-health)
9. [MCP Tools](#mcp-tools)
10. [Architecture](#architecture)
11. [Examples](#examples)
12. [Troubleshooting](#troubleshooting)

---

## Installation

### Prerequisites

- Node.js >= 18.0.0
- npm >= 8.0.0
- Python >= 3.8.0 (for Python A2A integration)

### Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Install Python dependencies (optional)
pip install -r requirements-python-a2a.txt
```

### Verify Installation

```bash
# Test CLI
npm run a2a:mcp -- --version

# Run tests
npm run a2a:mcp:test
```

---

## Quick Start

### Interactive Mode (Recommended)

```bash
npm run a2a:mcp:interactive
```

This launches an interactive terminal interface with guided prompts for all operations.

### Spawn Your First Agent

```bash
npm run a2a:mcp:spawn -- -t code-reviewer
```

### Execute a Task

```bash
npm run a2a:mcp:task -- "Analyze code quality and create a report"
```

### Run a Workflow

```bash
npm run a2a:mcp:workflow
# Lists all available workflows

node src/a2a-mcp-cli.js workflow:run feature-development -c '{"featureName":"auth","description":"Add authentication"}'
```

---

## CLI Commands

### General Syntax

```bash
node src/a2a-mcp-cli.js <command> [options]
```

Or using npm scripts:

```bash
npm run a2a:mcp -- <command> [options]
```

### Available Commands

| Command | Description |
|---------|-------------|
| `agent:spawn` | Spawn a new agent |
| `agent:list` | List all active agents |
| `task:execute <description>` | Execute a task with smart orchestration |
| `memory:sync` | Synchronize memory across agents |
| `memory:search <query>` | Search the memory graph |
| `workflow:run <name>` | Run a predefined workflow |
| `workflow:list` | List available workflows |
| `health:check` | Check system health and detect issues |
| `mcp:exec <server> <tool>` | Execute MCP tool directly |
| `interactive` | Start interactive mode |

---

## Agent Management

### Agent Types

The A2A MCP CLI includes a marketplace of specialized agents:

| Agent Type | Capabilities | MCP Tools |
|------------|-------------|-----------|
| **code-reviewer** | Review code, suggest improvements, enforce best practices | github, filesystem, git-workflow, code-quality |
| **deployment-specialist** | Deploy applications, manage CI/CD, rollbacks | github, git-workflow, rube, chrome |
| **data-analyst** | Query databases, generate insights, visualizations | sqlite, filesystem, rube |
| **ui-tester** | Test UI, take screenshots, visual regression testing | chrome, puppeteer, filesystem |
| **integration-specialist** | Integrate with 500+ apps via Composio | rube, memory, filesystem |
| **knowledge-manager** | Manage knowledge graph, cross-agent learning | memory, filesystem, sequential-thinking |
| **bug-fixer** | Debug issues, propose fixes, verify solutions | github, filesystem, git-workflow, sequential-thinking |
| **doc-writer** | Write technical documentation, API docs | github, filesystem, rube |
| **perf-optimizer** | Optimize performance, profile code | chrome, filesystem, sequential-thinking, rube |
| **security-auditor** | Audit security, find vulnerabilities | github, filesystem, code-quality, rube |
| **general-purpose** | Handle general tasks | rube, filesystem, memory |

### Spawning Agents

#### Interactive Selection

```bash
npm run a2a:mcp:spawn
```

#### Specify Agent Type

```bash
node src/a2a-mcp-cli.js agent:spawn -t code-reviewer
```

#### Custom Configuration

```bash
node src/a2a-mcp-cli.js agent:spawn \
  -t integration-specialist \
  --mcp-tools rube github memory \
  --capabilities integrate api-call webhook
```

### Listing Agents

```bash
# List all active agents
npm run a2a:mcp:agents

# Filter by type
node src/a2a-mcp-cli.js agent:list -f code-reviewer
```

Output:
```
📋 Active Agents (3):

● code-reviewer-1745... - code-reviewer
   Capabilities: review, suggest, lint, approve
   Uptime: 2m 45s

● data-analyst-1745... - data-analyst
   Capabilities: query, visualize, insights, reporting
   Uptime: 1m 30s
```

---

## Task Orchestration

### Smart Task Execution

The Smart Orchestrator uses AI to:
1. Analyze task complexity
2. Search for required MCP tools (500+ apps via Rube)
3. Create execution plan with parallel/sequential steps
4. Spawn specialized agents automatically
5. Execute task and return results

### Execute a Task

```bash
node src/a2a-mcp-cli.js task:execute "Deploy new feature to production"
```

### Generate Plan Only (No Execution)

```bash
node src/a2a-mcp-cli.js task:execute "Build full-stack app" --plan
```

Output:
```
📋 Execution Plan:

Task: Build full-stack app
Difficulty: hard
Estimated Time: 45000ms
Agents Required: 5

Step 1: Set up project structure
  Agent: general-purpose
  MCP Tools: filesystem, rube
  Parallel: No

Step 2: Create backend API
  Agent: deployment-specialist
  MCP Tools: github, git-workflow, rube
  Parallel: Yes

Step 3: Create frontend UI
  Agent: ui-tester
  MCP Tools: chrome, filesystem
  Parallel: Yes
```

### Task Execution Options

```bash
node src/a2a-mcp-cli.js task:execute "Task description" \
  --plan                    # Show plan without executing
  --parallel                # Enable parallel execution (default: true)
  --difficulty medium       # Task difficulty: easy, medium, hard
```

---

## Memory Management

### Cross-Agent Memory Sync

The Memory Sync Manager uses **MCP Memory Server** to create a knowledge graph that persists across:
- Agent sessions
- System restarts
- Multiple workflows

### Sync Knowledge

```bash
# Sync all sessions
npm run a2a:mcp:memory:sync

# Sync specific session
node src/a2a-mcp-cli.js memory:sync -s session-123
```

### Search Memory

```bash
node src/a2a-mcp-cli.js memory:search "GitHub pull requests"
```

Output:
```
🔍 Search Results (3):

1. session-abc-github-pr (KnowledgeItem)
   • Task: Create pull request
   • Result: Success
   • PR URL: https://github.com/Scarmonit/LLM/pull/42

2. review-42 (CodeReview)
   • PR #42
   • Analysis: Code quality is good
```

### Memory Architecture

```
Knowledge Graph (MCP Memory)
├── Sessions (AgentSession)
│   ├── session-123
│   └── session-456
├── Knowledge Items (KnowledgeItem)
│   ├── session-123-task
│   └── session-123-result
└── Healing Patterns (HealingPattern)
    ├── pattern-performance-1
    └── pattern-memory-2
```

---

## Workflows

### Predefined Workflows

| Workflow | Description | Steps |
|----------|-------------|-------|
| **feature-development** | Branch → Implement → PR → Screenshot | 5 |
| **bug-fix** | Analyze → Search → Fix → PR | 5 |
| **deployment** | Check status → Analyze commits → Deploy → Tag | 5 |
| **code-review** | Get PR → Get diff → Analyze → Review | 5 |
| **data-analysis** | List tables → Describe → Query → Write results | 4 |
| **ui-testing** | Navigate → Snapshot → Screenshot → Perf trace | 4 |

### Run a Workflow

```bash
node src/a2a-mcp-cli.js workflow:run feature-development -c '{
  "featureName": "authentication",
  "description": "Add user authentication",
  "owner": "Scarmonit",
  "repo": "LLM"
}'
```

### Workflow Context (JSON)

Each workflow accepts a context object with workflow-specific parameters:

```javascript
// feature-development
{
  "featureName": "auth",
  "description": "Add authentication",
  "owner": "Scarmonit",
  "repo": "LLM",
  "draft": false
}

// bug-fix
{
  "bugDescription": "Memory leak in agent spawner",
  "bugId": "bug-123",
  "filePath": "./src/agents/agent-registry.js",
  "edits": [...]
}

// deployment
{
  "version": "v2.2.0",
  "releaseNotes": "Performance improvements",
  "deployTool": "GITHUB_CREATE_DEPLOYMENT"
}
```

### Custom Workflows

```javascript
import { WorkflowEngine } from './src/workflows/workflow-engine.js';

const engine = new WorkflowEngine();

engine.addWorkflow('custom-workflow', {
  name: 'Custom Workflow',
  description: 'My custom workflow',
  mcpTools: ['github', 'rube'],
  steps: [
    {
      name: 'Step 1',
      mcp: 'github',
      tool: 'searchCode',
      parallel: false,
      getParams: (context) => ({
        query: context.searchQuery
      })
    }
  ]
});
```

---

## System Health

### Auto-Healing System

The Autonomous Healer:
1. Detects performance, filesystem, resource, and code quality issues
2. Searches for known fix patterns in memory
3. Uses AI to discover new fixes
4. Stores successful fixes for future use

### Run Health Check

```bash
npm run a2a:mcp:health
```

Output:
```
⚠️  Found 3 issues:

1. [HIGH] Largest Contentful Paint exceeds 2.5s threshold
   Component: rendering
   Impact: Poor user experience and SEO ranking

2. [MEDIUM] Total Blocking Time exceeds 300ms threshold
   Component: javascript
   Impact: Delayed interactivity

3. [MEDIUM] Cumulative Layout Shift exceeds 0.1 threshold
   Component: layout
   Impact: Visual instability
```

### Auto-Fix Issues

```bash
node src/a2a-mcp-cli.js health:check --fix
```

Output:
```
🔧 Fix Summary:

Issues Fixed: 2/3
Failed: 1
Duration: 5432ms
```

### Issue Categories

| Category | Detection | Fix Method |
|----------|-----------|------------|
| **Performance** | Chrome DevTools trace | Optimize resources, reduce blocking |
| **Filesystem** | Large directories, log files | Cleanup, compression |
| **Resource** | Memory > 80%, high CPU | Clear caches, optimize structures |
| **Code Quality** | Linting, static analysis | Auto-refactor, apply fixes |

---

## MCP Tools

### Available MCP Servers

The A2A MCP CLI integrates with these MCP servers:

1. **Rube (Composio)** - 500+ apps (Slack, GitHub, Gmail, etc.)
2. **GitHub** - Code search, PR management, issues
3. **Memory** - Knowledge graph, entities, relations
4. **Chrome DevTools** - Browser automation, screenshots, performance
5. **Filesystem** - File operations, search, edit
6. **Sequential Thinking** - AI-powered reasoning
7. **SQLite** - Database queries
8. **Git Workflow** - Branch, commit, PR generation

### Direct MCP Tool Execution

```bash
node src/a2a-mcp-cli.js mcp:exec rube searchTools \
  -a '{"use_case":"Send Slack message","known_fields":""}'
```

### Rube (Composio) Examples

```bash
# Search for tools
node src/a2a-mcp-cli.js mcp:exec rube searchTools \
  -a '{"use_case":"Create GitHub PR","known_fields":"repo:LLM"}'

# Execute parallel tools
node src/a2a-mcp-cli.js mcp:exec rube multiExecute \
  -a '{
    "tools": [
      {"tool_slug":"SLACK_SEND_MESSAGE","arguments":{"channel":"#general","text":"Hello"}},
      {"tool_slug":"GITHUB_CREATE_ISSUE","arguments":{"title":"Bug","body":"Fix this"}}
    ]
  }'
```

### GitHub Examples

```bash
# Search code
node src/a2a-mcp-cli.js mcp:exec github searchCode \
  -a '{"query":"function authenticate"}'

# Create PR
node src/a2a-mcp-cli.js mcp:exec github createPullRequest \
  -a '{
    "owner":"Scarmonit",
    "repo":"LLM",
    "title":"New feature",
    "head":"feature/auth",
    "base":"main"
  }'
```

### Memory Examples

```bash
# Create entities
node src/a2a-mcp-cli.js mcp:exec memory createEntities \
  -a '{
    "entities": [{
      "name":"task-123",
      "entityType":"Task",
      "observations":["Status: Complete","Duration: 2000ms"]
    }]
  }'

# Search nodes
node src/a2a-mcp-cli.js mcp:exec memory searchNodes \
  -a '{"query":"GitHub pull request"}'
```

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    A2A MCP CLI                          │
│  (Command-line Interface + Interactive Mode)            │
└────────────────┬────────────────────────────────────────┘
                 │
      ┌──────────┼──────────┐
      │          │          │
      ▼          ▼          ▼
┌──────────┐ ┌──────────┐ ┌──────────────┐
│  Agent   │ │  Smart   │ │   Memory     │
│ Registry │ │Orchestr. │ │ Sync Manager │
└────┬─────┘ └────┬─────┘ └──────┬───────┘
     │            │               │
     │    ┌───────┴────────┐      │
     │    │                │      │
     ▼    ▼                ▼      ▼
┌─────────────────────────────────────┐
│        MCP-Aware Agents             │
│  (Code Reviewer, Deployer, etc.)    │
└────────────┬────────────────────────┘
             │
   ┌─────────┼─────────┐
   │         │         │
   ▼         ▼         ▼
┌────────┐ ┌────────┐ ┌────────┐
│  Rube  │ │ GitHub │ │ Memory │
│  (500+ │ │  (PR,  │ │ (Graph,│
│  apps) │ │ Issues)│ │ Learn) │
└────────┘ └────────┘ └────────┘
```

### Component Breakdown

#### 1. **MCPAwareAgent** (`src/agents/mcp-aware-agent.js`)

- Base agent class with native MCP integration
- Initializes MCP clients dynamically
- Routes intents to appropriate MCP tools
- Supports: rube, github, memory, chrome, filesystem, sequential-thinking, sqlite, git-workflow

#### 2. **SmartOrchestrator** (`src/orchestration/smart-orchestrator.js`)

- AI-powered task planning
- Uses Sequential Thinking for complex analysis
- Searches for tools via Rube
- Creates execution plans with parallel/sequential steps
- Spawns agents automatically

#### 3. **MemorySyncManager** (`src/memory/memory-sync-manager.js`)

- Cross-agent knowledge sharing
- MCP Memory graph integration
- Local cache for performance
- Periodic sync loop
- Stores entities, relations, observations

#### 4. **AgentRegistry** (`src/registry/agent-registry.js`)

- Agent marketplace with 11 specialized types
- Capability-based agent selection
- Agent lifecycle management
- Uptime tracking

#### 5. **WorkflowEngine** (`src/workflows/workflow-engine.js`)

- 6 predefined workflows
- Custom workflow support
- Step-by-step execution
- MCP tool integration

#### 6. **AutonomousHealer** (`src/optimization/autonomous-healer.js`)

- Issue detection (performance, filesystem, resources)
- Known fix pattern matching
- AI-powered fix discovery
- Pattern storage in memory

---

## Examples

### Example 1: Complete Feature Development

```bash
# Interactive mode
npm run a2a:mcp:interactive

# Select: Run Workflow
# Choose: feature-development
# Enter context:
{
  "featureName": "user-profile",
  "description": "Add user profile page with avatar upload",
  "owner": "Scarmonit",
  "repo": "LLM",
  "draft": false
}

# Workflow executes:
# 1. Create feature branch: feature/user-profile
# 2. Search for required tools (file upload, UI components)
# 3. Execute implementation in parallel
# 4. Create pull request
# 5. Take screenshot for verification
```

### Example 2: Bug Fix with AI Analysis

```bash
node src/a2a-mcp-cli.js workflow:run bug-fix -c '{
  "bugDescription": "Memory leak in WebSocket connections",
  "bugId": "bug-789",
  "searchQuery": "WebSocket connection cleanup",
  "filePath": "./src/ai-bridge.js",
  "owner": "Scarmonit",
  "repo": "LLM"
}'

# Workflow:
# 1. AI analyzes bug with Sequential Thinking
# 2. Searches codebase for bug location
# 3. Creates fix branch
# 4. Edits files to fix bug
# 5. Creates PR with analysis
```

### Example 3: Autonomous System Monitoring

```bash
# Set up periodic health check + auto-fix
while true; do
  npm run a2a:mcp:health -- --fix
  sleep 300  # 5 minutes
done

# Or use a cron job:
# */5 * * * * cd /path/to/LLM && npm run a2a:mcp:health -- --fix
```

### Example 4: Multi-Agent Collaboration

```bash
# Spawn multiple specialized agents
node src/a2a-mcp-cli.js agent:spawn -t code-reviewer
node src/a2a-mcp-cli.js agent:spawn -t security-auditor
node src/a2a-mcp-cli.js agent:spawn -t perf-optimizer

# Execute task that uses all agents
node src/a2a-mcp-cli.js task:execute \
  "Audit codebase for security, performance, and code quality issues" \
  --difficulty hard \
  --parallel
```

---

## Troubleshooting

### Common Issues

#### 1. **Agent Spawn Fails**

```bash
Error: Unknown MCP tool: xyz
```

**Solution**: Check that MCP tool is available:
```bash
node src/a2a-mcp-cli.js mcp:exec --help
```

#### 2. **Memory Sync Errors**

```bash
Error: MCP Memory client not available
```

**Solution**: Initialize Memory Sync Manager with MCP client:
```javascript
import { MemorySyncManager } from './src/memory/memory-sync-manager.js';
import { MCPAwareAgent } from './src/agents/mcp-aware-agent.js';

const agent = new MCPAwareAgent({ mcpTools: ['memory'] });
await agent.connect();

const memorySync = new MemorySyncManager();
await memorySync.initialize(agent.mcpClients.memory);
```

#### 3. **Task Execution Timeout**

```bash
Error: Task execution timeout
```

**Solution**: Increase difficulty level or split task:
```bash
node src/a2a-mcp-cli.js task:execute "Large task" --difficulty hard
```

#### 4. **Workflow Context Errors**

```bash
Error: Missing required context parameter
```

**Solution**: Check workflow definition for required params:
```bash
node src/a2a-mcp-cli.js workflow:list
# Read step.getParams() to see required context
```

### Debug Mode

Enable detailed logging:

```bash
export LOG_LEVEL=debug
npm run a2a:mcp:interactive
```

### Test Individual Components

```bash
# Test MCPAwareAgent
npm test tests/a2a-mcp-cli.test.js -- -t "MCPAwareAgent"

# Test SmartOrchestrator
npm test tests/a2a-mcp-cli.test.js -- -t "SmartOrchestrator"

# Test Memory Sync
npm test tests/a2a-mcp-cli.test.js -- -t "MemorySyncManager"
```

---

## Advanced Usage

### Programmatic API

```javascript
import { SmartOrchestrator } from './src/orchestration/smart-orchestrator.js';
import { AgentRegistry } from './src/registry/agent-registry.js';
import { WorkflowEngine } from './src/workflows/workflow-engine.js';

// Execute task programmatically
const orchestrator = new SmartOrchestrator();
await orchestrator.initialize();

const result = await orchestrator.executeTask(
  'Deploy application to production',
  { difficulty: 'hard', parallel: true }
);

console.log('Task completed:', result);

// Spawn agent programmatically
const registry = new AgentRegistry();
const agent = await registry.spawn('code-reviewer', {
  mcpTools: ['github', 'filesystem']
});

// Run workflow programmatically
const engine = new WorkflowEngine();
const result = await engine.run('feature-development', {
  featureName: 'payments',
  description: 'Add Stripe payments'
});
```

### Custom Agent Types

```javascript
import { AgentRegistry } from './src/registry/agent-registry.js';

const registry = new AgentRegistry();

// Add custom agent type to registry
registry.agentDefinitions['custom-agent'] = {
  name: 'Custom Agent',
  description: 'My custom specialized agent',
  capabilities: ['custom-task-1', 'custom-task-2'],
  mcpTools: ['rube', 'memory'],
  cost: 'medium',
  estimatedDuration: 3000,
  specialization: 'custom',
  requiredSkills: ['skill-1', 'skill-2']
};

// Spawn custom agent
const agent = await registry.spawn('custom-agent');
```

---

## Performance

### Benchmarks

- **Agent Spawn Time**: ~200ms
- **Task Planning Time**: ~500ms (easy), ~2s (hard)
- **Workflow Execution**: 2-10s depending on complexity
- **Memory Sync**: ~100ms for 10 entities
- **Health Check**: ~500ms

### Optimization Tips

1. **Use Parallel Execution**: Enable `--parallel` for independent tasks
2. **Cache MCP Clients**: Reuse agents instead of spawning new ones
3. **Batch Operations**: Use workflows for multi-step tasks
4. **Memory Sync**: Run periodic sync instead of per-operation
5. **Filter Agent Search**: Use specific agent types instead of auto-selection

---

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

---

## License

ISC - See [LICENSE](../LICENSE) for details.

---

## Support

- **GitHub Issues**: https://github.com/Scarmonit/LLM/issues
- **Documentation**: https://github.com/Scarmonit/LLM/tree/main/docs
- **Email**: scarmonit@gmail.com

---

**Last Updated**: 2025-10-21
**Version**: 1.0.0
