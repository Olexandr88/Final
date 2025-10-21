# Redis Redlock Quick Start Guide

## 5-Minute Setup

### 1. Start Redis Cluster

```bash
npm run redis:start
```

Wait for all nodes to be healthy (~30 seconds).

### 2. Configure Environment

Add to `.env`:

```bash
USE_DISTRIBUTED_LOCKS=true
REDIS_HOST_1=localhost
REDIS_PORT_1=6379
REDIS_HOST_2=localhost
REDIS_PORT_2=6380
REDIS_HOST_3=localhost
REDIS_PORT_3=6381
```

### 3. Verify Health

```bash
npm run locks:health
```

Expected output: ✅ ALL CHECKS PASSED

### 4. Start Application

```bash
npm run bridge:start
```

That's it! Distributed locks are now active.

---

## Usage Examples

### Basic Lock

```javascript
import LockManager from './src/lock-manager.js';
import SessionManager from './src/session-manager.js';

const sessionManager = new SessionManager();
sessionManager.register();

const lockManager = new LockManager(sessionManager, {
  useDistributed: true
});

// Acquire lock
await lockManager.acquireLock('/path/to/resource');

// Do work
await performCriticalOperation();

// Release lock
await lockManager.releaseLock('/path/to/resource');
```

### Auto-Release (Recommended)

```javascript
await lockManager.withLock('/path/to/resource', async () => {
  // Lock automatically acquired
  await performCriticalOperation();
  // Lock automatically released
});
```

---

## Key Features

✅ **Multi-node coordination**: Works across distributed systems
✅ **High availability**: No single point of failure (3-node cluster)
✅ **Automatic fallback**: Uses local locks if Redis unavailable
✅ **Zero code changes**: Existing code works as-is
✅ **Performance**: < 80ms lock acquisition (P95)
✅ **Monitoring**: Built-in health checks and metrics

---

## Common Commands

```bash
# Redis Management
npm run redis:start      # Start cluster
npm run redis:stop       # Stop cluster
npm run redis:restart    # Restart cluster
npm run redis:logs       # View logs

# Health & Monitoring
npm run locks:health     # Health check
npm run locks:benchmark  # Performance test
npm run locks:test       # Run tests

# Web UIs
http://localhost:8081    # Redis Commander
http://localhost:3000    # Grafana (admin/admin)
http://localhost:9090    # Prometheus
```

---

## Troubleshooting

### Issue: Locks not working

**Check**: Are Redis nodes running?

```bash
docker ps | grep redis
```

**Fix**: Start Redis cluster

```bash
npm run redis:start
```

### Issue: Slow performance

**Check**: Redis latency

```bash
docker exec redis-node-1 redis-cli --latency
```

**Fix**: Ensure Redis running locally (not remote)

### Issue: Tests failing

**Check**: Redis cluster healthy

```bash
npm run locks:health
```

**Fix**: Restart cluster

```bash
npm run redis:restart
```

---

## Performance Targets

| Metric | Target | Typical |
|--------|--------|---------|
| Lock Latency (P95) | < 120ms | 50-80ms |
| Throughput | > 50 ops/sec | 80-150 ops/sec |
| Success Rate | > 90% | 95%+ |

---

## Architecture

```
Application
    ↓
Lock Manager
    ↓
Redis Redlock
    ↓
┌─────────┬─────────┬─────────┐
│ Redis 1 │ Redis 2 │ Redis 3 │
│  6379   │  6380   │  6381   │
└─────────┴─────────┴─────────┘

Requires 2/3 nodes for quorum
```

---

## Rollback

If issues arise, disable distributed locks:

```bash
# Stop Redis
npm run redis:stop

# Or set in .env
USE_DISTRIBUTED_LOCKS=false
```

System automatically falls back to local locks.

---

## Documentation

- **Full Implementation Report**: `docs/DISTRIBUTED_LOCKS_REPORT.md`
- **Migration Guide**: `docs/distributed-locks-migration-guide.md`
- **DevOps Guide**: `docs/devops-optimization-guide.md`

---

## Support

- GitHub Issues: https://github.com/Scarmonit/LLM/issues
- Email: scarmonit@gmail.com

---

**Last Updated**: 2025-10-20
