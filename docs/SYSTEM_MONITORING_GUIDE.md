# System Monitoring & Autofix Guide

## Overview

The System Monitoring and Autofix feature provides comprehensive real-time monitoring, error detection, automatic healing, and performance analytics for the LLM Multi-Provider Framework. This system ensures maximum uptime and automatically recovers from common failure scenarios.

**Version**: 1.0.0
**Last Updated**: 2025-10-21

---

## Table of Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Quick Start](#quick-start)
4. [Components](#components)
5. [Usage Examples](#usage-examples)
6. [Dashboard Guide](#dashboard-guide)
7. [Configuration Reference](#configuration-reference)
8. [Troubleshooting](#troubleshooting)
9. [API Reference](#api-reference)

---

## Features

### Error Detection

- ✅ **Automatic Error Classification** - Categorizes errors by type and severity
- ✅ **Pattern Detection** - Identifies recurring error patterns
- ✅ **Error Storm Detection** - Alerts on high error rates (>10 errors/minute)
- ✅ **Persistent Error History** - SQLite database storage with 7-day retention
- ✅ **Global Exception Handling** - Captures uncaught exceptions and promise rejections

### Automatic Healing

- ✅ **6 Healing Strategies** - Network retry, circuit breaker reset, WebSocket reconnect, memory cleanup, database retry, connection pool refresh
- ✅ **Intelligent Strategy Selection** - Chooses best strategy based on error type and success rate
- ✅ **Fix Verification** - Validates that fixes actually resolved the issue
- ✅ **Concurrent Fix Limiting** - Prevents resource exhaustion
- ✅ **Success Rate Tracking** - Learns which strategies work best

### Health Monitoring

- ✅ **Component Health Checks** - Periodic checks on all system components
- ✅ **Aggregated Health Score** - Weighted scoring across components
- ✅ **Health Status Levels** - Healthy, Degraded, Down
- ✅ **HTTP & Function-based Checks** - Flexible health check methods
- ✅ **Component Registration API** - Easy integration of new components

### Performance Metrics

- ✅ **Real-time Metrics Collection** - CPU, memory, event loop lag, connections
- ✅ **Time-series Storage** - SQLite with 3 retention buckets (1h, 24h, 7d)
- ✅ **Alert Thresholds** - Configurable alerts for resource usage
- ✅ **Automatic Cleanup** - Old metrics purged based on retention policy
- ✅ **V8 Heap Statistics** - Memory profiling

### Monitoring Dashboard

- ✅ **Real-time Updates** - WebSocket-powered live data
- ✅ **Interactive Charts** - Chart.js line charts for metrics
- ✅ **Error Stream** - Live error feed with severity badges
- ✅ **Autofix Activity Log** - Recent healing actions
- ✅ **System Health Overview** - Health score and component status

---

## Architecture

### Component Hierarchy

```
MonitoringCoordinator (Orchestrator)
├── ErrorDetector (Error Management)
│   ├── Global Exception Listeners
│   ├── Error Classification Engine
│   ├── Pattern Detection
│   └── SQLite Error Database
├── AutofixEngine (Self-Healing)
│   ├── NetworkRetryStrategy
│   ├── CircuitBreakerResetStrategy
│   ├── WebSocketReconnectStrategy
│   ├── MemoryCleanupStrategy
│   ├── DatabaseRetryStrategy
│   └── ConnectionPoolRefreshStrategy
├── HealthMonitor (Health Checks)
│   ├── Component Registry
│   ├── Health Check Scheduler
│   └── Aggregated Scoring
└── MetricsCollector (Performance Analytics)
    ├── System Metrics (CPU, Memory, Lag)
    ├── Event Loop Lag Monitoring
    ├── Alert Threshold Manager
    └── SQLite Metrics Database
```

### Data Flow

```
Error Occurs
    ↓
ErrorDetector.classifyError()
    ↓
ErrorDetector.recordError()
    ↓
    ├──→ Database Storage
    ├──→ Pattern Detection
    ├──→ Error Storm Check
    └──→ Emit 'error-detected' Event
         ↓
    MonitoringCoordinator
         ↓
    AutofixEngine.attemptFix()
         ↓
    Select Strategy → Execute → Verify
         ↓
    Mark Error Resolved
```

---

## Quick Start

### 1. Basic Setup

```bash
# Start monitoring system
npm run monitoring:start

# Open dashboard (Electron)
npm run monitoring:dashboard

# Run tests
npm run test:monitoring
```

### 2. Programmatic Usage

```javascript
import { MonitoringCoordinator } from './src/monitoring/monitoring-coordinator.js';

// Create coordinator
const coordinator = new MonitoringCoordinator({
  errorDbPath: './data/errors.db',
  metricsDbPath: './data/metrics.db',
  autofixEnabled: true,
});

// Initialize
await coordinator.initialize();

// Register components for health monitoring
coordinator.registerComponent('ai-bridge', {
  type: 'ai_bridge',
  healthCheck: async () => {
    // Health check logic
    return { status: 'healthy', latency: 50 };
  },
  weight: 0.4,
});

// Start monitoring
await coordinator.start();

// Get system status
const status = coordinator.getSystemStatus();
console.log(status);
```

### 3. AI Bridge Integration

```javascript
import { MonitoringCoordinator } from './src/monitoring/monitoring-coordinator.js';
import { AIBridge } from './src/ai-bridge.js';

const coordinator = new MonitoringCoordinator();
await coordinator.initialize();

const bridge = new AIBridge();
await bridge.start();

// Attach WebSocket client for broadcasting
coordinator.attachWebSocketClient(bridge.wss);

// Start broadcasting dashboard data every 5 seconds
setInterval(() => {
  coordinator.broadcastStatus();
}, 5000);
```

---

## Components

### ErrorDetector

**Purpose**: Detect, classify, and track errors across the system.

#### Error Severity Levels

| Level      | Description               | Examples                                 |
| ---------- | ------------------------- | ---------------------------------------- |
| `CRITICAL` | System-threatening errors | Out of memory, resource exhaustion       |
| `HIGH`     | Service degradation       | Database failures, authentication errors |
| `MEDIUM`   | Recoverable errors        | Network timeouts, WebSocket disconnects  |
| `LOW`      | Minor issues              | Validation errors, logic errors          |

#### Error Categories

| Category          | Description                    |
| ----------------- | ------------------------------ |
| `NETWORK`         | Connection errors, timeouts    |
| `DATABASE`        | Database query failures, locks |
| `AUTHENTICATION`  | Auth failures, token issues    |
| `RESOURCE`        | Memory, CPU, disk issues       |
| `LOGIC`           | Application logic errors       |
| `EXTERNAL_API`    | Third-party API failures       |
| `WEBSOCKET`       | WebSocket connection issues    |
| `CIRCUIT_BREAKER` | Circuit breaker trips          |

#### API

```javascript
import { ErrorDetector } from './src/monitoring/error-detector.js';

const detector = new ErrorDetector({
  errorStormThreshold: 10, // errors per minute
  errorStormWindow: 60000, // 1 minute
  maxErrorHistory: 1000,
});

await detector.initialize();

// Manual error recording
const error = new Error('Connection timeout');
const classified = detector.classifyError(error, { source: 'api-call' });
detector.recordError(classified);

// Get statistics
const stats = detector.getStatistics({ timeWindow: 3600000 });

// Mark error resolved
await detector.markResolved(errorId, 'NetworkRetry');

// Events
detector.on('error-detected', (error) => {
  console.log('Error:', error);
});

detector.on('pattern-detected', (pattern) => {
  console.warn('Pattern detected:', pattern);
});

detector.on('error-storm-start', (data) => {
  console.error('Error storm!', data);
});
```

---

### AutofixEngine

**Purpose**: Automatically apply healing strategies to resolve errors.

#### Available Strategies

1. **NetworkRetryStrategy**
   - **Handles**: Network errors (ECONNREFUSED, ETIMEDOUT)
   - **Approach**: Exponential backoff retry (3 attempts)
   - **Success Criteria**: Successful reconnection

2. **CircuitBreakerResetStrategy**
   - **Handles**: Circuit breaker open errors
   - **Approach**: Wait 30s, perform health check, force reset
   - **Success Criteria**: Health check passes + breaker resets

3. **WebSocketReconnectStrategy**
   - **Handles**: WebSocket disconnection errors
   - **Approach**: Reconnect with exponential backoff, restore session
   - **Success Criteria**: WebSocket connected + session restored

4. **MemoryCleanupStrategy**
   - **Handles**: Memory/heap errors
   - **Approach**: Force GC, clear caches, drain connection pools
   - **Success Criteria**: Memory freed

5. **DatabaseRetryStrategy**
   - **Handles**: Database query failures, locks
   - **Approach**: Retry with increased timeout
   - **Success Criteria**: Query succeeds

6. **ConnectionPoolRefreshStrategy**
   - **Handles**: Connection pool exhaustion
   - **Approach**: Drain, clear, reinitialize pool
   - **Success Criteria**: Pool refreshed

#### API

```javascript
import { AutofixEngine } from './src/monitoring/autofix-engine.js';

const engine = new AutofixEngine({
  enabled: true,
  maxConcurrentFixes: 3,
  minSuccessRate: 0.3, // 30% minimum success rate
});

await engine.initialize();

// Attempt fix
const error = {
  category: 'network',
  message: 'Connection timeout',
  severity: 'medium',
};

const context = {
  reconnect: async () => {
    /* reconnection logic */
  },
  healthCheck: async () => ({ status: 'healthy' }),
};

const result = await engine.attemptFix(error, context);

if (result.status === 'success') {
  console.log('Fix successful:', result.details);
} else {
  console.log('Fix failed:', result.details);
}

// Get statistics
const stats = engine.getStatistics();
console.log('Success rate:', stats.successRate);

// Enable/disable
engine.enable();
engine.disable();

// Events
engine.on('fix-success', (fix) => {
  console.log('Fix successful:', fix);
});

engine.on('fix-failure', (fix) => {
  console.error('Fix failed:', fix);
});
```

---

### HealthMonitor

**Purpose**: Perform periodic health checks on system components.

#### Health Status Levels

| Status     | Description             | Score Range |
| ---------- | ----------------------- | ----------- |
| `HEALTHY`  | All systems operational | 70-100%     |
| `DEGRADED` | Some services affected  | 30-70%      |
| `DOWN`     | Critical services down  | 0-30%       |

#### Component Types

- `AI_BRIDGE` - Weight: 0.4 (40%)
- `AGENT` - Weight: 0.3 (30%)
- `DATABASE` - Weight: 0.2 (20%)
- `EXTERNAL_API` - Weight: 0.1 (10%)

#### API

```javascript
import { HealthMonitor, ComponentType, HealthStatus } from './src/monitoring/health-monitor.js';

const monitor = new HealthMonitor({
  checkInterval: 30000, // 30 seconds
  healthTimeout: 5000, // 5 seconds
});

await monitor.initialize();

// Register components
monitor.registerComponent('ai-bridge', {
  type: ComponentType.AI_BRIDGE,
  healthCheck: 'http://localhost:65029/api/health', // URL-based
  weight: 0.4,
});

monitor.registerComponent('ollama-agent', {
  type: ComponentType.AGENT,
  healthCheck: async () => {
    // Function-based
    // Custom health check logic
    return { status: HealthStatus.HEALTHY, latency: 100 };
  },
  weight: 0.3,
});

// Start monitoring
monitor.startMonitoring();

// Get current health
const health = monitor.getCurrentHealth();
console.log('Health score:', health.score);
console.log('Status:', health.status);

// Get statistics
const stats = monitor.getStatistics({ timeWindow: 3600000 });
console.log('Uptime:', stats.uptimePercentage);

// Events
monitor.on('health-status-change', (change) => {
  console.log(`Health changed from ${change.from} to ${change.to}`);
});

monitor.on('component-health', (health) => {
  console.log(`Component ${health.id}: ${health.status}`);
});
```

---

### MetricsCollector

**Purpose**: Collect and store system performance metrics.

#### Collected Metrics

| Metric               | Description              | Alert Threshold |
| -------------------- | ------------------------ | --------------- |
| `cpu_percent`        | CPU usage percentage     | 80%             |
| `memory_heap_used`   | Heap memory used (bytes) | 1GB             |
| `memory_heap_total`  | Total heap size          | -               |
| `memory_rss`         | Resident set size        | -               |
| `event_loop_lag`     | Event loop delay (ms)    | 50ms            |
| `active_connections` | Open connections         | -               |

#### Retention Buckets

| Bucket | Retention | Aggregation              |
| ------ | --------- | ------------------------ |
| `1h`   | 1 hour    | Raw data (10s intervals) |
| `24h`  | 24 hours  | 1-minute aggregates      |
| `7d`   | 7 days    | 5-minute aggregates      |

#### API

```javascript
import { MetricsCollector } from './src/monitoring/metrics-collector.js';

const collector = new MetricsCollector({
  collectionInterval: 10000, // 10 seconds
  alertThresholds: {
    cpu: 80,
    memory: 1024 * 1024 * 1024,
    eventLoopLag: 50,
    errorRate: 5,
  },
});

await collector.initialize();

// Start collection
collector.startCollection();

// Manual collection
await collector.collectMetrics();

// Get metrics
const metrics = collector.getMetrics({
  metricType: 'cpu_percent',
  startTime: Date.now() - 3600000, // Last hour
  endTime: Date.now(),
  limit: 360, // 1 hour at 10s intervals
});

// Get statistics
const stats = collector.getStatistics({
  metricType: 'memory_heap_used',
  timeWindow: 3600000,
});

console.log('Avg memory:', stats.avg);
console.log('Max memory:', stats.max);

// Events
collector.on('metrics-collected', (metrics) => {
  console.log('CPU:', metrics.cpu);
  console.log('Memory:', metrics.memory.heapUsed);
});

collector.on('alert-triggered', (alert) => {
  console.warn('Alert:', alert.type, alert.value);
});

collector.on('alert-cleared', (alert) => {
  console.info('Alert cleared:', alert.type);
});
```

---

## Dashboard Guide

### Accessing the Dashboard

```bash
# Launch dashboard (Electron)
npm run monitoring:dashboard

# Or open directly in browser (if running as web app)
# http://localhost:8080/monitoring-dashboard.html
```

### Dashboard Sections

#### 1. System Health Card

- Overall health status (HEALTHY/DEGRADED/DOWN)
- Health score percentage
- Uptime percentage
- Component count

#### 2. Performance Metrics Cards

- **CPU Usage** - Real-time CPU percentage with line chart
- **Memory Usage** - Heap usage in MB with line chart
- **Event Loop Lag** - Current lag in ms with line chart

#### 3. Statistics Cards

- **Error Statistics** - Total errors, critical count, resolved count, error storm status
- **Autofix Statistics** - Total fixes, success rate, active fixes, average duration

#### 4. Activity Feeds

- **Recent Errors** - Last 10 errors with severity badges and timestamps
- **Recent Autofixes** - Last 10 healing actions with strategy and duration

### Dashboard Features

- **Auto-refresh** - WebSocket live updates every 5 seconds
- **Interactive Charts** - Hover for precise values
- **Autofix Toggle** - Enable/disable automatic healing
- **Manual Refresh** - Force data refresh
- **Error Storm Banner** - Prominent alert on error storms

---

## Configuration Reference

### ErrorDetector Options

```javascript
{
  dbPath: './data/errors.db',           // SQLite database path
  errorStormThreshold: 10,              // errors/minute threshold
  errorStormWindow: 60000,              // window in ms (1 minute)
  patternDetectionWindow: 300000,       // pattern window (5 minutes)
  maxErrorHistory: 1000                 // max in-memory errors
}
```

### AutofixEngine Options

```javascript
{
  enabled: true,                        // enable/disable autofix
  maxConcurrentFixes: 3,                // max parallel fixes
  minSuccessRate: 0.3                   // minimum 30% success rate
}
```

### HealthMonitor Options

```javascript
{
  checkInterval: 30000,                 // check every 30 seconds
  healthTimeout: 5000,                  // 5s timeout per check
  degradedThreshold: 0.7,               // 70% = degraded
  downThreshold: 0.3,                   // 30% = down
  componentWeights: {
    ai_bridge: 0.4,
    agent: 0.3,
    database: 0.2,
    external_api: 0.1
  }
}
```

### MetricsCollector Options

```javascript
{
  collectionInterval: 10000,            // collect every 10 seconds
  dbPath: './data/metrics.db',          // SQLite database path
  retentionPeriods: {
    '1h': 3600000,                      // 1 hour
    '24h': 86400000,                    // 24 hours
    '7d': 604800000                     // 7 days
  },
  alertThresholds: {
    cpu: 80,                            // 80% CPU
    memory: 1073741824,                 // 1GB
    eventLoopLag: 50,                   // 50ms
    errorRate: 5                        // 5 errors/min
  }
}
```

### MonitoringCoordinator Options

```javascript
{
  autofixEnabled: true,                 // enable autofix
  errorDbPath: './data/errors.db',      // error database
  metricsDbPath: './data/metrics.db',   // metrics database
  errorDetector: { /* ErrorDetector options */ },
  autofixEngine: { /* AutofixEngine options */ },
  healthMonitor: { /* HealthMonitor options */ },
  metricsCollector: { /* MetricsCollector options */ }
}
```

---

## Troubleshooting

### Issue: Errors not being detected

**Symptoms**: No errors appearing in dashboard or database.

**Solutions**:

1. Check ErrorDetector initialization:
   ```javascript
   await errorDetector.initialize();
   ```
2. Verify global listeners are attached:
   ```bash
   # Should see "Global error listeners registered" in logs
   ```
3. Manually trigger error to test:
   ```javascript
   const error = new Error('Test error');
   const classified = errorDetector.classifyError(error);
   errorDetector.recordError(classified);
   ```

---

### Issue: Autofix not working

**Symptoms**: Errors detected but no autofix attempts.

**Solutions**:

1. Check if autofix is enabled:
   ```javascript
   autofixEngine.enable();
   ```
2. Verify error severity (autofix skips LOW severity):
   ```javascript
   // Only MEDIUM, HIGH, CRITICAL trigger autofix
   ```
3. Check concurrent fix limit:
   ```javascript
   const stats = autofixEngine.getStatistics();
   console.log('Active fixes:', stats.activeFixes);
   // If at maxConcurrentFixes, new fixes will be skipped
   ```

---

### Issue: Health checks failing

**Symptoms**: All components showing as DOWN.

**Solutions**:

1. Verify health check timeout is sufficient:
   ```javascript
   healthMonitor.config.healthTimeout = 10000; // Increase to 10s
   ```
2. Check component health check logic:
   ```javascript
   // For URL-based checks, ensure endpoint is accessible
   // For function-based checks, ensure function returns correct format
   ```
3. Test health check manually:
   ```javascript
   const component = healthMonitor.components.get('component-id');
   const result = await component.healthCheck();
   console.log(result); // Should return { status, latency, details }
   ```

---

### Issue: Dashboard not updating

**Symptoms**: Dashboard shows stale data.

**Solutions**:

1. Check WebSocket connection:
   ```javascript
   // In browser console
   console.log(ws.readyState); // Should be 1 (OPEN)
   ```
2. Verify AI Bridge is running:
   ```bash
   npm run start:bridge
   # Should see "AI Bridge WebSocket server started on port 65028"
   ```
3. Check for WebSocket errors in console:
   ```javascript
   // Look for connection errors in browser DevTools
   ```
4. Manual refresh:
   ```javascript
   // Click "Refresh" button in dashboard
   ```

---

### Issue: High memory usage

**Symptoms**: Memory growing over time, potential memory leak.

**Solutions**:

1. Check error history size:
   ```javascript
   console.log(errorDetector.recentErrors.length);
   // If near maxErrorHistory (default 1000), increase threshold
   errorDetector.config.maxErrorHistory = 2000;
   ```
2. Check metrics retention:
   ```javascript
   // Old metrics should be cleaned up automatically
   await metricsCollector.cleanupOldMetrics();
   ```
3. Manually trigger garbage collection:
   ```javascript
   if (global.gc) {
     global.gc();
   }
   ```

---

### Issue: SQLite database locked

**Symptoms**: "Database locked" errors in logs.

**Solutions**:

1. Close other connections to the database
2. Increase busy timeout:
   ```javascript
   this.db.pragma('busy_timeout = 5000'); // 5 seconds
   ```
3. Use WAL mode for better concurrency:
   ```javascript
   this.db.pragma('journal_mode = WAL');
   ```

---

## API Reference

### MonitoringCoordinator

#### Methods

| Method                             | Description                     | Returns         |
| ---------------------------------- | ------------------------------- | --------------- |
| `initialize()`                     | Initialize all subsystems       | `Promise<void>` |
| `start()`                          | Start monitoring                | `Promise<void>` |
| `stop()`                           | Stop monitoring                 | `Promise<void>` |
| `registerComponent(id, component)` | Register health check component | `void`          |
| `unregisterComponent(id)`          | Unregister component            | `void`          |
| `getSystemStatus()`                | Get comprehensive status        | `Object`        |
| `getDashboardData()`               | Get dashboard data              | `Object`        |
| `enableAutofix()`                  | Enable autofix                  | `void`          |
| `disableAutofix()`                 | Disable autofix                 | `void`          |
| `broadcastStatus()`                | Broadcast via WebSocket         | `void`          |

#### Events

| Event                  | Payload                         | Description            |
| ---------------------- | ------------------------------- | ---------------------- |
| `initialized`          | -                               | Subsystems initialized |
| `started`              | -                               | Monitoring started     |
| `stopped`              | -                               | Monitoring stopped     |
| `error-detected`       | `{ error }`                     | Error detected         |
| `error-storm`          | `{ errorCount, threshold }`     | Error storm started    |
| `error-pattern`        | `{ pattern, count }`            | Pattern detected       |
| `autofix-success`      | `{ fixId, strategy, duration }` | Fix successful         |
| `autofix-failure`      | `{ fixId, error }`              | Fix failed             |
| `health-status-change` | `{ from, to, score }`           | Health changed         |
| `metric-alert`         | `{ type, value, threshold }`    | Metric alert           |

---

## Best Practices

### 1. Component Registration

Register all critical components with appropriate weights:

```javascript
// Critical (40% weight)
coordinator.registerComponent('ai-bridge', {
  type: ComponentType.AI_BRIDGE,
  healthCheck: 'http://localhost:65029/api/health',
  weight: 0.4,
});

// Important (30% weight)
coordinator.registerComponent('claude-agent', {
  type: ComponentType.AGENT,
  healthCheck: async () => agent.health(),
  weight: 0.3,
});

// Supporting (20% weight)
coordinator.registerComponent('database', {
  type: ComponentType.DATABASE,
  healthCheck: async () => db.ping(),
  weight: 0.2,
});
```

### 2. Error Context

Provide rich context when recording errors:

```javascript
const error = new Error('API call failed');
const classified = errorDetector.classifyError(error, {
  source: 'external-api',
  endpoint: 'https://api.example.com/data',
  method: 'GET',
  statusCode: 503,
  attempt: 2,
});
errorDetector.recordError(classified);
```

### 3. Custom Healing Strategies

Extend AutofixEngine with custom strategies:

```javascript
import { HealingStrategy, StrategyResult } from './src/monitoring/autofix-engine.js';

class CustomRetryStrategy extends HealingStrategy {
  constructor() {
    super('CustomRetry', { maxAttempts: 5 });
  }

  canHandle(error) {
    return error.category === 'custom_error';
  }

  async execute(error, context) {
    // Custom healing logic
    return {
      status: StrategyResult.SUCCESS,
      details: 'Fixed using custom strategy',
    };
  }
}

// Add to engine
autofixEngine.strategies.push(new CustomRetryStrategy());
```

### 4. Integration with AI Bridge

```javascript
// In AI Bridge startup
import { MonitoringCoordinator } from './src/monitoring/monitoring-coordinator.js';

const coordinator = new MonitoringCoordinator();
await coordinator.initialize();
await coordinator.start();

// Register AI Bridge for health checks
coordinator.registerComponent('ai-bridge', {
  type: ComponentType.AI_BRIDGE,
  healthCheck: async () => ({
    status: this.isRunning ? 'healthy' : 'down',
    latency: this.metrics.averageLatency,
    activeConnections: this.clients.size,
  }),
  weight: 0.4,
});

// Broadcast monitoring data via WebSocket
setInterval(() => {
  coordinator.broadcastStatus();
}, 5000);
```

---

## Production Deployment Checklist

- [ ] Configure appropriate database paths for error and metrics databases
- [ ] Set up log rotation for Winston logger
- [ ] Configure alert thresholds based on system capacity
- [ ] Register all critical components for health monitoring
- [ ] Test autofix strategies in staging environment
- [ ] Set up monitoring dashboard on secure port with authentication
- [ ] Configure WebSocket reconnection for dashboard
- [ ] Set up backup/archival for metrics database
- [ ] Monitor disk usage for SQLite databases
- [ ] Configure error notification integration (email, Slack, etc.)

---

## Support & Contributing

- **GitHub Issues**: https://github.com/Scarmonit/LLM/issues
- **Documentation**: `/docs/SYSTEM_MONITORING_GUIDE.md`
- **Main README**: `/README.md`

---

**Last Updated**: 2025-10-21
**Document Version**: 1.0.0
