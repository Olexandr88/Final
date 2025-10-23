# Enhanced MCP Agent Orchestrator v2.0 - User Guide

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [Usage Examples](#usage-examples)
6. [API Reference](#api-reference)
7. [Monitoring & Observability](#monitoring--observability)
8. [Troubleshooting](#troubleshooting)
9. [Advanced Topics](#advanced-topics)

---

## Overview

The Enhanced MCP Agent Orchestrator v2.0 is a production-ready multi-agent coordination system that implements 2025 MCP (Model Context Protocol) best practices. It provides:

- **Dual Transport Support**: Modern Ably streamable HTTP + backward-compatible WebSocket
- **Approval Workflows**: Multi-agent coordination for sensitive operations
- **Semantic Versioning**: Agent capability version management
- **Datadog Integration**: Production-grade monitoring and metrics
- **Docker/Kubernetes Ready**: Containerized deployment with health checks

### Architecture

```
┌─────────────────────────────────────────┐
│  Enhanced MCP Orchestrator v2.0         │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────┐  ┌─────────────────┐ │
│  │ Ably HTTP    │  │ WebSocket       │ │
│  │ Transport    │  │ Fallback        │ │
│  └──────┬───────┘  └────────┬────────┘ │
│         │                   │          │
│         └──────┬────────────┘          │
│                │                       │
│         ┌──────▼────────┐              │
│         │ Orchestrator  │              │
│         │    Core       │              │
│         └──────┬────────┘              │
│                │                       │
│    ┌───────────┼───────────┐           │
│    │           │           │           │
│ ┌──▼──┐   ┌───▼───┐   ┌──▼──┐         │
│ │Ver- │   │Appr-  │   │Data-│         │
│ │sion │   │oval   │   │dog  │         │
│ │Mgr  │   │Flow   │   │Intg │         │
│ └─────┘   └───────┘   └─────┘         │
└─────────────────────────────────────────┘
```

---

## Prerequisites

### Required

- **Node.js**: >= 18.0.0
- **npm**: >= 8.0.0
- **Git**: Latest version

### Optional (for full feature set)

- **Ably Account**: For streamable HTTP transport ([signup](https://www.ably.com/signup))
- **Datadog Account**: For monitoring ([signup](https://www.datadoghq.com/))
- **Docker**: For containerized deployment (>= 20.10)

---

## Installation

### 1. Install Dependencies

```bash
npm install ably semver hot-shots
```

### 2. Environment Configuration

Create or update `.env`:

```bash
# Ably Configuration (optional but recommended)
ABLY_API_KEY=your_ably_api_key_here

# AI Bridge Ports (maintain compatibility)
AI_BRIDGE_WS_PORT=65028
AI_BRIDGE_HTTP_PORT=65029

# Datadog (optional)
DATADOG_API_KEY=your_datadog_key_here
DATADOG_HOST=localhost
DATADOG_PORT=8125

# Application
NODE_ENV=production
LOG_LEVEL=info
```

### 3. Verify Installation

```bash
node -e "import('./src/mcp/enhanced-mcp-orchestrator.js').then(() => console.log('✓ Installation verified'))"
```

---

## Configuration

### Basic Configuration

```javascript
import EnhancedMCPOrchestrator from './src/mcp/enhanced-mcp-orchestrator.js';

const orchestrator = new EnhancedMCPOrchestrator({
  // Enable/disable features
  enableAbly: true,
  enableApprovals: true,
  enableVersioning: true,
  enableDatadog: true,

  // Network configuration
  wsPort: 65028,
  httpPort: 65029,

  // Version requirements
  minAgentVersion: '2.0.0',

  // Ably channel prefix
  ablyChannelPrefix: 'mcp-orchestrator'
});

await orchestrator.initialize();
```

### Advanced Configuration

```javascript
const orchestrator = new EnhancedMCPOrchestrator({
  enableAbly: true,
  enableApprovals: true,
  enableVersioning: true,
  enableDatadog: true,

  // Approval workflow settings
  approvalTimeout: 60000, // 1 minute
  requiredApprovers: 2,
  autoApproveOperations: ['query', 'read'],

  // Version management
  minAgentVersion: '2.0.0',
  strictVersioning: true,

  // Datadog tags
  datadogGlobalTags: ['env:production', 'service:mcp-orchestrator']
});
```

---

## Usage Examples

### Example 1: Register an Agent

```javascript
// Register agent with capabilities
await orchestrator.registerAgent('code-analyzer-1', {
  capabilities: ['ast-parsing', 'linting', 'refactoring'],
  version: '2.1.0',
  transport: 'ably' // or 'websocket'
});
```

### Example 2: Route Message (No Approval)

```javascript
// Send analysis task to agent
const result = await orchestrator.routeMessage({
  type: 'task.analyze',
  data: {
    file: 'src/index.js',
    options: { checkStyle: true }
  }
}, {
  requireApproval: false,
  targetAgents: ['code-analyzer-1']
});

console.log(result);
// { status: 'routed', targets: ['code-analyzer-1'], results: [...] }
```

### Example 3: Approval-Gated Operation

```javascript
// Deploy operation requires approval
const result = await orchestrator.routeMessage({
  type: 'operation.deploy',
  data: {
    environment: 'production',
    version: 'v2.0.0'
  }
}, {
  requireApproval: true,
  requestedBy: 'user@example.com',
  targetAgents: ['deployment-agent']
});

// Approval workflow triggered automatically
// Operation waits for approval before executing
```

### Example 4: Health Monitoring

```javascript
// Get orchestrator health status
const health = orchestrator.getHealth();

console.log(health);
/*
{
  status: 'healthy',
  timestamp: 1698765432000,
  agents: { total: 5, active: 4, inactive: 1 },
  transport: {
    ably: { connected: true, state: 'connected' },
    websocket: { enabled: true, clients: 5 }
  },
  metrics: {
    messagesProcessed: 1247,
    approvalsRequested: 12,
    approvalsGranted: 10
  }
}
*/
```

---

## API Reference

### EnhancedMCPOrchestrator

#### Constructor

```javascript
new EnhancedMCPOrchestrator(config)
```

**Parameters:**
- `config` (Object): Configuration options
  - `enableAbly` (Boolean): Enable Ably transport (default: true)
  - `enableApprovals` (Boolean): Enable approval workflows (default: true)
  - `enableVersioning` (Boolean): Enable version management (default: true)
  - `enableDatadog` (Boolean): Enable Datadog metrics (default: true)
  - `wsPort` (Number): WebSocket port (default: 65028)
  - `httpPort` (Number): HTTP port (default: 65029)
  - `minAgentVersion` (String): Minimum agent version (default: '1.0.0')

#### Methods

##### `initialize()`

Initialize the orchestrator and all subsystems.

**Returns:** `Promise<Boolean>`

##### `registerAgent(agentId, capabilities)`

Register a new agent with the orchestrator.

**Parameters:**
- `agentId` (String): Unique agent identifier
- `capabilities` (Object): Agent capabilities and version
  - `capabilities` (Array): List of capabilities
  - `version` (String): Semantic version
  - `transport` (String): 'ably' or 'websocket'

**Returns:** `Promise<Object>` - Agent info

##### `routeMessage(message, options)`

Route a message to target agents.

**Parameters:**
- `message` (Object): Message to route
  - `type` (String): Message type
  - `data` (Object): Message payload
- `options` (Object): Routing options
  - `requireApproval` (Boolean): Require approval before routing
  - `targetAgents` (Array): Specific agents to target
  - `timeout` (Number): Routing timeout in ms

**Returns:** `Promise<Object>` - Routing result

##### `getHealth()`

Get current orchestrator health status.

**Returns:** `Object` - Health status

##### `shutdown()`

Gracefully shutdown the orchestrator.

**Returns:** `Promise<void>`

---

## Monitoring & Observability

### Health Endpoint

```bash
curl http://localhost:65029/health
```

**Response:**
```json
{
  "status": "healthy",
  "agents": { "total": 5, "active": 4 },
  "transport": {
    "ably": { "connected": true },
    "websocket": { "clients": 5 }
  },
  "metrics": { "messagesProcessed": 1247 }
}
```

### Datadog Metrics

When Datadog integration is enabled, the following metrics are published:

| Metric | Type | Description |
|--------|------|-------------|
| `mcp.orchestrator.agents.total` | Gauge | Total registered agents |
| `mcp.orchestrator.agents.active` | Gauge | Active agents (heartbeat < 30s) |
| `mcp.orchestrator.messages.processed` | Counter | Total messages routed |
| `mcp.orchestrator.approvals.requested` | Counter | Approval requests |
| `mcp.orchestrator.approvals.granted` | Counter | Approved operations |
| `mcp.orchestrator.approvals.denied` | Counter | Denied operations |

---

## Troubleshooting

### Issue: Ably Connection Fails

**Symptoms:** Warning message "Ably transport failed to initialize"

**Solutions:**
1. Verify `ABLY_API_KEY` in `.env`
2. Check network connectivity
3. Review Ably dashboard for account status

**Fallback:** Orchestrator automatically falls back to WebSocket-only mode

### Issue: Approval Timeout

**Symptoms:** Error "Approval request timed out"

**Solutions:**
1. Increase approval timeout in config
2. Verify approver agents are registered
3. Check approver agent connectivity

### Issue: Version Incompatibility

**Symptoms:** Error "Agent version X is incompatible"

**Solutions:**
1. Update agent to meet minimum version requirement
2. Lower `minAgentVersion` in orchestrator config (not recommended)
3. Use version manager to get migration path

---

## Advanced Topics

### Custom Approval Workflow

```javascript
import { ApprovalWorkflow } from './src/agents/approval-workflow-agent.js';

const customWorkflow = new ApprovalWorkflow({
  transport: orchestrator.ablyTransport,
  timeout: 120000, // 2 minutes
  requiredApprovers: 2,
  autoApproveOperations: ['read', 'query']
});

orchestrator.approvalWorkflow = customWorkflow;
```

### Version Migration

```javascript
import { AgentVersionManager } from './src/versioning/agent-version-manager.js';

const versionManager = new AgentVersionManager();

const migration = versionManager.getMigrationPath('1.5.0', '2.0.0');

console.log(migration);
/*
{
  from: '1.5.0',
  to: '2.0.0',
  required: true,
  breaking: true,
  steps: [
    { type: 'major', version: '2.0.0', breaking: true }
  ]
}
*/
```

### Custom Datadog Tags

```javascript
import { DatadogIntegration } from './src/monitoring/datadog-integration.js';

const datadog = new DatadogIntegration({
  globalTags: [
    'env:production',
    'region:us-east-1',
    'team:platform'
  ]
});

orchestrator.datadogIntegration = datadog;
```

---

## See Also

- [Enhanced MCP Orchestrator Implementation](./ENHANCED_MCP_ORCHESTRATOR_IMPLEMENTATION.md)
- [Ably Documentation](https://www.ably.com/documentation)
- [Semantic Versioning Spec](https://semver.org/)
- [Datadog StatsD](https://docs.datadoghq.com/developers/dogstatsd/)

---

**Version:** 2.0.0
**Last Updated:** 2025-10-23
