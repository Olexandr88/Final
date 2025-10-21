# Distributed Locks Migration Guide

## Overview

This guide explains how to migrate from local file-based locks to distributed Redis Redlock for multi-node coordination in the LLM Multi-Provider Framework.

---

## What is Redis Redlock?

Redlock is a distributed locking algorithm that provides:

- **Fault tolerance**: Works even if some Redis nodes fail (requires majority consensus)
- **Deadlock prevention**: Automatic lock expiration with TTL
- **Mutual exclusion**: Guaranteed single lock holder across multiple processes
- **High availability**: No single point of failure

Reference: https://redis.io/topics/distlock

---

## Architecture Changes

### Before: Local File-Based Locks

```
Session 1 → Lock Manager → File System (.lock files)
Session 2 → Lock Manager → File System (.lock files)
```

**Limitations:**

- Single machine only
- No coordination across distributed systems
- Process crash can leave stale locks
- File system overhead

### After: Distributed Redis Redlock

```
Session 1 → Lock Manager → Redis Redlock → Redis Node 1
                                         → Redis Node 2
                                         → Redis Node 3
Session 2 → Lock Manager → Redis Redlock → (Same Redis Cluster)
```

**Benefits:**

- Works across multiple machines/containers
- Automatic failover with majority consensus
- TTL-based expiration prevents deadlocks
- Millisecond latency for lock operations

---

## Setup Instructions

### 1. Start Redis Cluster

Using Docker Compose (3-node cluster for Redlock):

```bash
docker-compose -f docker-compose.redis.yml up -d redis-1 redis-2 redis-3
```

Verify all nodes are healthy:

```bash
docker ps | grep redis
docker logs redis-node-1
docker logs redis-node-2
docker logs redis-node-3
```

Expected output: All containers running, health checks passing.

### 2. Environment Configuration

Add to `.env`:

```bash
# Enable distributed locks
USE_DISTRIBUTED_LOCKS=true

# Redis node configuration (for Redlock)
REDIS_HOST_1=localhost
REDIS_PORT_1=6379

REDIS_HOST_2=localhost
REDIS_PORT_2=6380

REDIS_HOST_3=localhost
REDIS_PORT_3=6381

# Optional: Lock tuning
REDLOCK_TTL=10000           # Lock TTL in milliseconds (default: 10s)
REDLOCK_RETRY_COUNT=3       # Retry attempts (default: 3)
REDLOCK_RETRY_DELAY=200     # Retry delay in ms (default: 200ms)
```

### 3. Code Changes

#### Existing Code (No Changes Required!)

The lock manager API remains **100% backward compatible**. Existing code works without modification:

```javascript
import SessionManager from './src/session-manager.js';
import LockManager from './src/lock-manager.js';

const sessionManager = new SessionManager();
sessionManager.register();

const lockManager = new LockManager(sessionManager);

// Same API as before!
await lockManager.acquireLock('/path/to/resource');
// ... do work ...
await lockManager.releaseLock('/path/to/resource');
```

#### Enabling Distributed Locks

**Option 1: Environment Variable**

```bash
USE_DISTRIBUTED_LOCKS=true npm run start:bridge
```

**Option 2: Programmatic**

```javascript
const lockManager = new LockManager(sessionManager, {
  useDistributed: true,
  redisConfig: {
    nodes: [
      { host: 'localhost', port: 6379 },
      { host: 'localhost', port: 6380 },
      { host: 'localhost', port: 6381 },
    ],
    lockTTL: 10000,
    retryCount: 3,
  },
});
```

### 4. Automatic Fallback

The lock manager automatically falls back to local locks if:

- Redis cluster is unavailable
- Majority of nodes are down
- Distributed lock acquisition fails

**Fallback Logic:**

```
1. Try distributed lock (Redis Redlock)
2. On failure → Log warning → Use local file lock
3. Continue operations (no downtime)
```

---

## Usage Patterns

### Basic Lock Acquisition

```javascript
// Acquire lock (distributed if available, else local)
const lock = await lockManager.acquireLock('resource-123');
console.log('Lock acquired:', lock.distributed ? 'Distributed' : 'Local');

// Do critical work
await performCriticalOperation();

// Release lock
await lockManager.releaseLock('resource-123');
```

### With Auto-Release (Recommended)

```javascript
await lockManager.withLock('resource-123', async () => {
  // Lock automatically acquired before function
  await performCriticalOperation();
  // Lock automatically released after function
});
```

### Custom TTL and Options

```javascript
// Acquire lock with 30-second TTL
const lock = await lockManager.acquireLock('resource-123', 'write', 30000);

// Acquire lock with auto-renewal (for long-running tasks)
const lockManager = new LockManager(sessionManager, { useDistributed: true });
await lockManager._acquireDistributedLock('resource-123', 'write', 60000, {
  autoRenew: true, // Lock will be renewed automatically
});
```

### Monitoring Lock Status

```javascript
// Check lock statistics
const stats = lockManager.getStats();
console.log('Local locks:', stats.localLocks);
console.log('Distributed locks:', stats.distributedLocks);
console.log('Distributed healthy:', stats.distributedHealthy);

// Check health status
const health = await lockManager.getHealthStatus();
console.log('System healthy:', health.healthy);
console.log('Distributed health:', health.distributedHealth);
```

---

## Performance Benchmarks

### Expected Performance

| Metric                         | Target       | Typical        |
| ------------------------------ | ------------ | -------------- |
| Lock Acquisition Latency (P95) | < 120ms      | 50-80ms        |
| Throughput                     | > 50 ops/sec | 80-150 ops/sec |
| Contention Success Rate        | > 80%        | 85-95%         |
| Memory Per Lock                | < 10KB       | 3-5KB          |
| Health Check Time              | < 100ms      | 20-50ms        |

### Running Benchmarks

```bash
node scripts/benchmark-distributed-locks.js
```

Expected output:

```
===========================================
DISTRIBUTED LOCKS BENCHMARK SUMMARY
===========================================

✓ PASS | Lock Acquisition P95: 78ms (target: 120ms)
✓ PASS | Throughput: 127 ops/sec (target: 50 ops/sec)
✓ PASS | Contention Success Rate: 92% (target: 80%)
✓ PASS | Memory Per Lock: 4KB (target: 10KB)
✓ PASS | Health Check Time: 35ms (target: 100ms)

✓ ALL BENCHMARKS PASSED
```

---

## Testing

### Unit Tests

```bash
npm test tests/redis-redlock.test.js
```

### Integration Tests

```bash
# Ensure Redis cluster is running
docker-compose -f docker-compose.redis.yml up -d

# Run tests
npm run test:integration
```

### Health Check

```bash
# Check Redis cluster health
node -e "
import RedisRedlockManager from './src/utils/redis-redlock-manager.js';
const manager = new RedisRedlockManager();
await manager.initialize();
const health = await manager.getHealthStatus();
console.log(JSON.stringify(health, null, 2));
await manager.cleanup();
"
```

---

## Failure Scenarios

### Scenario 1: Single Node Failure

**Behavior:**

- Redlock requires 2/3 nodes (majority)
- Lock operations continue normally
- Performance may degrade slightly

**Action:**

- Monitor logs for warnings
- Restart failed node
- No manual intervention needed

### Scenario 2: Two Nodes Failure (Loss of Quorum)

**Behavior:**

- Lock manager automatically falls back to local locks
- Warning logged: "Distributed lock system unhealthy"
- Operations continue with local locks

**Action:**

- Restore Redis nodes ASAP
- System automatically recovers when quorum restored

### Scenario 3: Network Partition

**Behavior:**

- Redlock cannot reach majority of nodes
- Falls back to local locks
- Prevents split-brain scenarios

**Action:**

- Fix network connectivity
- System recovers automatically

### Scenario 4: Lock Expiration

**Behavior:**

- Locks have TTL (default 10 seconds)
- Expired locks are automatically released
- New lock requests can proceed

**Action:**

- For long-running operations, use `autoRenew: true`
- Or periodically extend lock with `extendLock()`

---

## Monitoring and Alerting

### Health Check Endpoint

If using AI Bridge with HTTP API:

```bash
curl http://localhost:65038/health/locks
```

Response:

```json
{
  "healthy": true,
  "localLocks": 2,
  "distributedEnabled": true,
  "distributedHealth": {
    "healthy": true,
    "healthyNodes": 3,
    "totalNodes": 3,
    "hasQuorum": true,
    "nodes": [
      { "node": { "host": "localhost", "port": 6379 }, "healthy": true, "latency": "2.34ms" },
      { "node": { "host": "localhost", "port": 6380 }, "healthy": true, "latency": "2.67ms" },
      { "node": { "host": "localhost", "port": 6381 }, "healthy": true, "latency": "2.89ms" }
    ]
  }
}
```

### Prometheus Metrics

Lock metrics are exported for Prometheus scraping:

```
# HELP distributed_locks_acquired_total Total number of distributed locks acquired
# TYPE distributed_locks_acquired_total counter
distributed_locks_acquired_total 1234

# HELP distributed_locks_failed_total Total number of failed lock acquisitions
# TYPE distributed_locks_failed_total counter
distributed_locks_failed_total 12

# HELP distributed_lock_acquisition_duration_ms Lock acquisition latency
# TYPE distributed_lock_acquisition_duration_ms histogram
distributed_lock_acquisition_duration_ms_bucket{le="50"} 45
distributed_lock_acquisition_duration_ms_bucket{le="100"} 89
distributed_lock_acquisition_duration_ms_bucket{le="200"} 98
```

### Grafana Dashboard

Use the included Grafana dashboard for visualization:

1. Start Grafana: `docker-compose -f docker-compose.redis.yml up -d grafana`
2. Open http://localhost:3000 (admin/admin)
3. Import dashboard: `config/grafana/dashboards/distributed-locks.json`

Metrics:

- Lock acquisition rate
- Lock latency (P50, P95, P99)
- Success/failure rate
- Active locks gauge
- Redis cluster health

---

## Troubleshooting

### Issue: Locks not working after migration

**Check:**

```bash
# Verify Redis cluster is running
docker ps | grep redis

# Check environment variables
echo $USE_DISTRIBUTED_LOCKS
echo $REDIS_HOST_1
```

**Solution:**

- Ensure `USE_DISTRIBUTED_LOCKS=true` is set
- Verify Redis nodes are reachable
- Check firewall rules (ports 6379-6381)

### Issue: High lock latency

**Check:**

```bash
# Test Redis latency
docker exec redis-node-1 redis-cli --latency

# Check network conditions
ping localhost
```

**Solution:**

- Reduce network latency (use local Redis)
- Increase `retryDelay` if many retries
- Check Redis CPU/memory usage

### Issue: Lock timeouts under high load

**Check:**

```javascript
const stats = lockManager.getStats();
console.log('Contention:', stats.distributedMetrics);
```

**Solution:**

- Increase lock timeout: `acquireLock(resource, 'write', 10000)`
- Use lock queuing or rate limiting
- Optimize critical section code

### Issue: Memory leaks with many locks

**Check:**

```javascript
const locks = lockManager.listLocks();
console.log('Active locks:', locks.length);
```

**Solution:**

- Ensure all locks are released (use `withLock()`)
- Check for error handling issues
- Monitor `lockManager.getStats()`

---

## Best Practices

### 1. Always Release Locks

```javascript
// ❌ BAD - Lock not released on error
try {
  await lockManager.acquireLock('resource');
  await riskyOperation();
} catch (err) {
  // Lock not released!
}

// ✅ GOOD - Lock always released
try {
  await lockManager.acquireLock('resource');
  await riskyOperation();
} finally {
  await lockManager.releaseLock('resource');
}

// ✅ BEST - Use withLock()
await lockManager.withLock('resource', async () => {
  await riskyOperation();
});
```

### 2. Choose Appropriate TTL

```javascript
// Short operations (< 5 seconds)
await lockManager.acquireLock('resource', 'write', 5000);

// Medium operations (5-30 seconds)
await lockManager.acquireLock('resource', 'write', 30000);

// Long operations (> 30 seconds) - Use auto-renewal
const lock = await lockManager._acquireDistributedLock('resource', 'write', 60000, {
  autoRenew: true,
});
```

### 3. Handle Lock Failures Gracefully

```javascript
try {
  await lockManager.acquireLock('resource', 'write', 5000);
  await performWork();
} catch (err) {
  if (err.message.includes('Timeout acquiring lock')) {
    // Resource is busy, retry later or queue
    console.log('Resource busy, retrying in 1 second');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return performWork(); // Retry
  }
  throw err; // Other error, propagate
}
```

### 4. Monitor Lock Metrics

```javascript
setInterval(async () => {
  const stats = lockManager.getStats();
  console.log('Lock Statistics:', {
    local: stats.localLocks,
    distributed: stats.distributedLocks,
    healthy: stats.distributedHealthy,
  });

  if (!stats.distributedHealthy) {
    console.warn('WARNING: Distributed locks unhealthy, using local fallback');
  }
}, 60000); // Every minute
```

### 5. Use Lock Prefixes for Organization

```javascript
const LOCK_PREFIXES = {
  SESSION: 'session:',
  FILE: 'file:',
  DATABASE: 'db:',
  AGENT: 'agent:',
};

// Organized lock keys
await lockManager.acquireLock(`${LOCK_PREFIXES.SESSION}${sessionId}`);
await lockManager.acquireLock(`${LOCK_PREFIXES.FILE}${filePath}`);
```

---

## Rollback Plan

If distributed locks cause issues, rollback is simple:

### Option 1: Disable via Environment

```bash
USE_DISTRIBUTED_LOCKS=false npm run start:bridge
```

### Option 2: Stop Redis Cluster

```bash
docker-compose -f docker-compose.redis.yml stop redis-1 redis-2 redis-3
```

Lock manager automatically falls back to local locks. No code changes needed.

---

## Production Deployment Checklist

- [ ] Redis cluster running (3+ nodes)
- [ ] All nodes passing health checks
- [ ] Environment variables configured
- [ ] Benchmarks passing performance targets
- [ ] Monitoring/alerting configured
- [ ] Grafana dashboard imported
- [ ] Backup plan for Redis data
- [ ] Runbook for node failure scenarios
- [ ] Load testing completed
- [ ] Rollback procedure tested

---

## Support and Resources

- Redis Redlock Specification: https://redis.io/topics/distlock
- ioredis Documentation: https://github.com/redis/ioredis
- Redlock NPM Package: https://www.npmjs.com/package/redlock
- Project Issues: https://github.com/Scarmonit/LLM/issues

---

**Last Updated**: 2025-10-20
**Version**: 1.0.0
**Author**: LLM Framework DevOps Team
