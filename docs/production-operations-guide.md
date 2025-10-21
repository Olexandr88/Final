# Production Operations Guide

## LLM Multi-Provider Framework - Deployed Optimizations

Quick reference for operating the production deployment.

---

## Quick Start

### Start Full System

```bash
# Option 1: Full system with monitoring
npm run system:start

# Option 2: AI Bridge only with distributed locks
USE_DISTRIBUTED_LOCKS=true \
ENABLE_ORM=true \
ORM_ROLLOUT_PERCENTAGE=25 \
npm run bridge:start
```

### Access Dashboards

- **Redis Commander**: http://localhost:8081
- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9090
- **AI Bridge API**: http://localhost:65029/api/status

---

## Health Monitoring

### Quick Health Check

```bash
npm run locks:health
```

Output:

```
✓ Initialization
✓ Redis Cluster Health (3/3 nodes)
✓ Lock Acquisition (<120ms)
✓ Lock Release
✓ Concurrency Control
✓ Metrics Collection
✓ Failover Readiness
```

### Continuous Monitoring

```bash
# Watch mode (refreshes every 5 seconds)
npm run health:watch
```

### System Health

```bash
npm run health:system
```

Checks:

- Port availability
- Node.js process count
- Memory usage
- Disk space
- Network connectivity

---

## Redis Cluster Management

### Start/Stop/Restart

```bash
npm run redis:start      # Start 3-node cluster
npm run redis:stop       # Stop all nodes
npm run redis:restart    # Restart all nodes
npm run redis:logs       # View logs
```

### Check Node Status

```bash
docker ps --filter name=redis-node
```

Expected output:

```
redis-node-1    Up X minutes (healthy)
redis-node-2    Up X minutes (healthy)
redis-node-3    Up X minutes (healthy)
```

### Manual Redis Commands

```bash
# Connect to node 1
docker exec -it redis-node-1 redis-cli

# Test connectivity
docker exec redis-node-1 redis-cli ping
# Expected: PONG

# Check memory usage
docker exec redis-node-1 redis-cli INFO memory

# View all keys (CAUTION: expensive operation)
docker exec redis-node-1 redis-cli KEYS "*"
```

---

## Performance Monitoring

### Run Benchmark

```bash
npm run locks:benchmark
```

Key metrics to watch:

- **Lock Acquisition P95**: Should be <120ms
- **Throughput**: Should be >50 ops/sec
- **Memory Per Lock**: Should be <10KB

### View Metrics in Grafana

1. Open http://localhost:3000
2. Login: admin/admin
3. Navigate to "Redis Dashboard"
4. Monitor:
   - Commands per second
   - Memory usage
   - Connected clients
   - Keyspace hits/misses

### Prometheus Queries

Open http://localhost:9090/graph

Useful queries:

```promql
# Lock acquisition latency (P95)
histogram_quantile(0.95, rate(lock_acquisition_duration_bucket[5m]))

# Redis memory usage percentage
redis_memory_used_bytes / redis_memory_max_bytes * 100

# Lock success rate
sum(rate(lock_acquisition_success[5m])) / sum(rate(lock_acquisition_total[5m])) * 100
```

---

## Troubleshooting

### Redis Connection Errors

**Symptom**: "ECONNREFUSED" or "Connection timeout"

**Solution**:

```bash
# 1. Check if containers are running
docker ps --filter name=redis-node

# 2. Check container logs
docker logs redis-node-1
docker logs redis-node-2
docker logs redis-node-3

# 3. Restart containers
npm run redis:restart

# 4. Verify connectivity
npm run locks:health
```

### Lock Acquisition Failures

**Symptom**: "Insufficient Redis nodes ready"

**Solution**:

```bash
# 1. Check quorum (need 2/3 nodes)
docker exec redis-node-1 redis-cli ping
docker exec redis-node-2 redis-cli ping
docker exec redis-node-3 redis-cli ping

# 2. Check health
npm run locks:health

# 3. Restart unhealthy nodes
docker restart redis-node-X
```

### High Latency

**Symptom**: Lock acquisition >120ms P95

**Solution**:

```bash
# 1. Check Redis slowlog
docker exec redis-node-1 redis-cli SLOWLOG GET 10

# 2. Check memory usage
docker exec redis-node-1 redis-cli INFO memory

# 3. Check system resources
npm run health:system

# 4. Consider scaling
# - Add more Redis nodes
# - Increase node memory
# - Optimize application code
```

### Memory Issues

**Symptom**: Redis memory usage >80%

**Solution**:

```bash
# 1. Check current usage
docker exec redis-node-1 redis-cli INFO memory | grep used_memory_human

# 2. Check eviction policy (should be allkeys-lru)
docker exec redis-node-1 redis-cli CONFIG GET maxmemory-policy

# 3. Increase maxmemory (currently 2GB)
docker exec redis-node-1 redis-cli CONFIG SET maxmemory 4gb
docker exec redis-node-1 redis-cli CONFIG REWRITE

# 4. Force eviction if needed (CAUTION)
docker exec redis-node-1 redis-cli FLUSHDB
```

### Port Conflicts

**Symptom**: "Port already allocated"

**Solution**:

```bash
# 1. Check what's using the port
netstat -ano | findstr :6379

# 2. Stop conflicting container
docker ps -a
docker stop <container-id>
docker rm <container-id>

# 3. Restart Redis cluster
npm run redis:restart
```

---

## Scaling

### Vertical Scaling (Increase Resources)

**Increase Redis Memory**:

Edit `config/redis.conf`:

```conf
maxmemory 4gb  # Increase from 2gb
```

Restart containers:

```bash
npm run redis:restart
```

**Increase Connection Pool**:

Edit application config:

```javascript
const poolConfig = {
  min: 10, // Increase from 5
  max: 50, // Increase from 20
};
```

### Horizontal Scaling (Add Nodes)

**Add 4th Redis Node**:

Edit `docker-compose.redis.yml`:

```yaml
redis-4:
  image: redis:7-alpine
  container_name: redis-node-4
  ports:
    - '6382:6379'
  volumes:
    - redis-4-data:/data
    - ./config/redis.conf:/usr/local/etc/redis/redis.conf:ro
  command: redis-server /usr/local/etc/redis/redis.conf
  # ... same config as other nodes
```

Update environment variables:

```bash
export REDIS_HOST_4=localhost
export REDIS_PORT_4=6382
```

Update code to use 4 nodes (requires quorum of 3/4).

---

## Backup & Recovery

### Backup Redis Data

**Manual Snapshot**:

```bash
# Trigger background save
docker exec redis-node-1 redis-cli BGSAVE

# Copy RDB file
docker cp redis-node-1:/data/dump.rdb ./backups/dump-$(date +%Y%m%d-%H%M%S).rdb
```

**Automated Backup** (cron job):

```bash
# Add to crontab (every 6 hours)
0 */6 * * * docker exec redis-node-1 redis-cli BGSAVE && docker cp redis-node-1:/data/dump.rdb /backups/redis/dump-$(date +\%Y\%m\%d-\%H\%M\%S).rdb
```

### Restore Redis Data

```bash
# 1. Stop Redis cluster
npm run redis:stop

# 2. Copy backup to container volume
docker run --rm -v redis-1-data:/data -v $(pwd)/backups:/backups alpine cp /backups/dump.rdb /data/dump.rdb

# 3. Start Redis cluster
npm run redis:start

# 4. Verify data
docker exec redis-node-1 redis-cli DBSIZE
```

### Backup Event Store

```bash
# Copy event store database
cp .architecture/event-store.db backups/event-store-$(date +%Y%m%d-%H%M%S).db

# Copy Prisma database
cp prisma/dev.db backups/prisma-$(date +%Y%m%d-%H%M%S).db
```

---

## Security Hardening

### Enable Redis Authentication

1. Generate secure password:

```bash
openssl rand -base64 32
```

2. Edit `config/redis.conf`:

```conf
requirepass YOUR_SECURE_PASSWORD_HERE
```

3. Restart Redis:

```bash
npm run redis:restart
```

4. Update application config:

```javascript
const redisConfig = {
  password: process.env.REDIS_PASSWORD,
};
```

5. Test connection:

```bash
docker exec redis-node-1 redis-cli -a YOUR_SECURE_PASSWORD_HERE ping
```

### Enable Protected Mode

Edit `config/redis.conf`:

```conf
protected-mode yes
bind 127.0.0.1  # Only allow local connections
```

Restart Redis:

```bash
npm run redis:restart
```

### Network Security

**Firewall Rules** (production):

```bash
# Allow only necessary ports
ufw allow 65028/tcp  # AI Bridge WebSocket
ufw allow 65029/tcp  # AI Bridge HTTP
ufw deny 6379/tcp    # Block external Redis access
ufw deny 6380/tcp
ufw deny 6381/tcp
```

**Docker Network Isolation**:

```yaml
# In docker-compose.redis.yml
networks:
  ai-bridge-network:
    driver: bridge
    internal: true # Prevent external access
```

---

## Alerting Setup

### Email Alerts (via Prometheus Alertmanager)

1. Install Alertmanager:

```bash
docker run -d -p 9093:9093 prom/alertmanager
```

2. Configure alerts (`config/alerts.yml`):

```yaml
groups:
  - name: redis_alerts
    rules:
      - alert: RedisNodeDown
        expr: redis_up == 0
        for: 1m
        annotations:
          summary: 'Redis node {{ $labels.instance }} is down'

      - alert: RedisMemoryHigh
        expr: redis_memory_used_bytes / redis_memory_max_bytes > 0.8
        for: 5m
        annotations:
          summary: 'Redis memory usage >80%'

      - alert: LockLatencyHigh
        expr: lock_acquisition_p95 > 120
        for: 2m
        annotations:
          summary: 'Lock acquisition latency >120ms'
```

3. Configure email notifications in Alertmanager.

### Slack Alerts

Use Prometheus Alertmanager webhook integration:

```yaml
receivers:
  - name: 'slack'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'
        channel: '#alerts'
        text: '{{ .CommonAnnotations.summary }}'
```

---

## Performance Tuning

### Redis Optimization

**Increase Memory**:

```conf
maxmemory 4gb
```

**Optimize Eviction**:

```conf
maxmemory-policy allkeys-lru  # Evict least recently used keys
maxmemory-samples 10          # More samples = better eviction
```

**Disable Persistence** (if acceptable):

```conf
save ""              # Disable RDB snapshots
appendonly no        # Disable AOF
```

**Increase Backlog**:

```conf
tcp-backlog 2048     # Increase from 511
```

### Application Optimization

**Connection Pooling**:

```javascript
const poolConfig = {
  min: 10,
  max: 50,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};
```

**Lock TTL Tuning**:

```javascript
const lockConfig = {
  lockTTL: 5000, // Increase if operations are slow
  retryCount: 3, // Increase for high contention
  retryDelay: 100, // Decrease for lower latency
};
```

**Batch Operations**:

```javascript
// Instead of:
for (const item of items) {
  await acquireLock(item);
}

// Use:
await Promise.all(items.map((item) => acquireLock(item)));
```

---

## Monitoring Cheat Sheet

### Critical Metrics

| Metric           | Command                                          | Threshold   |
| ---------------- | ------------------------------------------------ | ----------- |
| Redis health     | `npm run locks:health`                           | 3/3 nodes   |
| Lock latency P95 | `npm run locks:benchmark`                        | <120ms      |
| Throughput       | `npm run locks:benchmark`                        | >50 ops/sec |
| Memory usage     | `docker exec redis-node-1 redis-cli INFO memory` | <80%        |
| Error rate       | Check Grafana dashboard                          | <0.1%       |

### Quick Diagnostics

```bash
# All-in-one health check
npm run locks:health && npm run health:system

# Check Redis cluster status
docker ps --filter name=redis-node --format "{{.Names}}: {{.Status}}"

# Check AI Bridge status
curl http://localhost:65029/api/status

# View recent logs
docker logs --tail 50 redis-node-1
```

---

## Maintenance Windows

### Recommended Schedule

**Daily**:

- Check health dashboards (Grafana)
- Review error logs
- Verify backup completion

**Weekly**:

- Run full benchmark suite
- Review performance trends
- Check for outdated dependencies

**Monthly**:

- Update Docker images
- Review and rotate logs
- Capacity planning review

### Planned Downtime Procedure

1. **Notify users** (if applicable)
2. **Create backup**:
   ```bash
   docker exec redis-node-1 redis-cli BGSAVE
   cp .architecture/event-store.db backups/
   ```
3. **Stop services**:
   ```bash
   npm run redis:stop
   ```
4. **Perform maintenance**
5. **Start services**:
   ```bash
   npm run redis:start
   ```
6. **Verify health**:
   ```bash
   npm run locks:health
   ```
7. **Monitor for 15 minutes**

---

## Contact & Support

**Issue Tracking**: https://github.com/Scarmonit/LLM/issues
**Documentation**: C:\Users\scarm\docs\
**Deployment Report**: C:\Users\scarm\DEPLOYMENT_REPORT.md

**Emergency Rollback**:

```bash
# Quick rollback to pre-optimization state
export USE_DISTRIBUTED_LOCKS=false
export ENABLE_ORM=false
npm run bridge:start
```

---

**Last Updated**: 2025-10-20
**Version**: 1.0.0
