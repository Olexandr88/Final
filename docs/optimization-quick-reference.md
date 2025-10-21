# DevOps Optimization Quick Reference Card

## 🚀 Quick Commands

### Benchmark and Monitor
```bash
npm run benchmark              # Full benchmark suite
npm run profile                # System snapshot
npm run profile:watch          # Real-time monitoring
npm run health:check          # Health check
```

### Windows Optimization
```powershell
# Run as Administrator
npm run optimize:windows
```

### Production Start
```bash
npm run start:optimized-prod   # With all optimizations
```

---

## 📊 Key Metrics

### Target Performance (After Optimization)

| Metric | Target | Command to Check |
|--------|--------|-----------------|
| Startup Time | < 100ms | `hyperfine 'npm start'` |
| Memory Usage | < 200MB | `npm run profile` |
| Throughput | > 750 ops/sec | `npm run benchmark` |
| Event Loop p95 | < 10ms | `npm run benchmark` |
| GC Pause | < 40ms | `node --trace-gc` |

### Alert Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Heap Usage | > 75% | > 90% |
| Event Loop Delay | > 50ms | > 100ms |
| Worker Queue | > 500 | > 1000 |
| GC Pause | > 50ms | > 100ms |

---

## ⚙️ Node.js Performance Flags

### Production Configuration
```bash
NODE_OPTIONS="--max-old-space-size=4096 --optimize-for-size --expose-gc"
UV_THREADPOOL_SIZE=8
NODE_ENV=production
```

### Development Configuration
```bash
NODE_OPTIONS="--inspect=9229 --trace-warnings"
UV_THREADPOOL_SIZE=4
NODE_ENV=development
```

### Profiling Configuration
```bash
NODE_OPTIONS="--prof --trace-opt --trace-deopt"
```

---

## 🔧 Common Optimizations

### 1. Increase Thread Pool
```bash
# .env
UV_THREADPOOL_SIZE=8
```

### 2. Manual GC
```javascript
// Enable with --expose-gc flag
if (global.gc) {
  global.gc();
}
```

### 3. Worker Pool Size
```javascript
// Optimal size for CPU-bound tasks
const poolSize = Math.max(2, cpus().length - 1);
```

### 4. Connection Pool
```javascript
const pool = new AdvancedConnectionPool(factory, {
  minSize: 2,
  maxSize: 10,
  idleTimeout: 30000
});
```

---

## 🐛 Troubleshooting

### High Memory

**Check:**
```bash
node --expose-gc --trace-gc src/ai-bridge.js
```

**Fix:**
- Lower GC threshold
- Review cache sizes
- Take heap snapshot

### Event Loop Lag

**Check:**
```bash
node --trace-warnings src/ai-bridge.js
```

**Fix:**
- Move work to workers
- Reduce sync operations
- Batch queries

### Worker Timeouts

**Check:**
```javascript
console.log(workerPool.getMetrics());
```

**Fix:**
- Increase timeout
- Add more workers
- Implement priorities

---

## 📁 File Locations

### Documentation
- `docs/devops-optimization-guide.md` - Full guide (70 pages)
- `docs/optimization-quickstart.md` - Quick start (5-30 min)
- `docs/devops-optimization-summary.md` - Implementation summary

### Scripts
- `scripts/benchmark-suite.js` - Benchmark tool
- `scripts/optimize-windows.ps1` - Windows optimizer
- `scripts/quick-profile.js` - System profiler

### Configuration
- `.env.production` - Production settings (create this)
- `package.json` - npm scripts (updated)

---

## 🎯 Quick Start (5 Minutes)

1. **Run Baseline**
   ```bash
   npm run benchmark > baseline.txt
   ```

2. **Apply Windows Optimizations** (Admin required)
   ```bash
   npm run optimize:windows
   ```

3. **Add to package.json**
   ```json
   "start:prod": "cross-env NODE_ENV=production NODE_OPTIONS='--max-old-space-size=4096 --expose-gc' node src/ai-bridge.js"
   ```

4. **Test**
   ```bash
   npm run benchmark > optimized.txt
   diff baseline.txt optimized.txt
   ```

---

## 📈 Expected Improvements

| Phase | Duration | Improvement |
|-------|----------|-------------|
| Quick Start | 5 min | 15-25% |
| Worker Pool | 1 day | +30-40% |
| Memory Mgmt | 1 day | +25-35% |
| Full Implementation | 4 weeks | 30-50% overall |

---

## 🔗 Resources

- Node.js Docs: https://nodejs.org/en/docs/guides/simple-profiling/
- V8 Optimization: https://v8.dev/docs
- GitHub: https://github.com/Scarmonit/LLM

---

## ⚡ Power User Tips

### Benchmark Comparison
```bash
# Before optimization
npm run benchmark > before.txt

# After optimization
npm run benchmark > after.txt

# Compare
diff before.txt after.txt
```

### Profile Memory
```bash
node --expose-gc --heap-prof src/ai-bridge.js
# Let run 60s, then analyze .heapprofile
```

### Analyze V8
```bash
node --prof src/ai-bridge.js
node --prof-process isolate-*.log > v8-analysis.txt
```

### Monitor Event Loop
```bash
node --trace-warnings --trace-deprecation src/ai-bridge.js
```

---

**Generated:** 2025-10-20 | **Version:** 1.0.0
