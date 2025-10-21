/**
 * A2A Control Center Performance Optimizer
 * Implements intelligent caching, connection pooling, and memory management
 */

export class A2APerformanceOptimizer {
  constructor(options = {}) {
    this.cacheSize = options.cacheSize || 1000;
    this.cacheTTL = options.cacheTTL || 300000; // 5 minutes
    this.poolSize = options.poolSize || 50;
    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      poolUtilization: 0,
      memoryUsage: 0
    };
    
    this.messageCache = new Map();
    this.connectionPool = new Set();
    this.performanceObserver = null;
  }

  // LRU Message Cache with TTL
  getCachedMessage(key) {
    const cached = this.messageCache.get(key);
    if (!cached) {
      this.metrics.cacheMisses++;
      return null;
    }

    const now = Date.now();
    if (now - cached.timestamp > this.cacheTTL) {
      this.messageCache.delete(key);
      this.metrics.cacheMisses++;
      return null;
    }

    this.metrics.cacheHits++;
    cached.hits++;
    return cached.data;
  }

  setCachedMessage(key, data) {
    // LRU eviction if cache is full
    if (this.messageCache.size >= this.cacheSize) {
      const lruKey = this.findLRUKey();
      if (lruKey) this.messageCache.delete(lruKey);
    }

    this.messageCache.set(key, {
      data,
      timestamp: Date.now(),
      hits: 0
    });
  }

  findLRUKey() {
    let lruKey = null;
    let minHits = Infinity;
    let oldestTime = Infinity;

    for (const [key, value] of this.messageCache.entries()) {
      if (value.hits < minHits || (value.hits === minHits && value.timestamp < oldestTime)) {
        minHits = value.hits;
        oldestTime = value.timestamp;
        lruKey = key;
      }
    }

    return lruKey;
  }

  // Connection Pool Management
  acquireConnection(ws) {
    if (this.connectionPool.size >= this.poolSize) {
      return false; // Pool exhausted
    }

    this.connectionPool.add(ws);
    this.metrics.poolUtilization = (this.connectionPool.size / this.poolSize) * 100;
    return true;
  }

  releaseConnection(ws) {
    this.connectionPool.delete(ws);
    this.metrics.poolUtilization = (this.connectionPool.size / this.poolSize) * 100;
  }

  // Memory Management
  async optimizeMemory() {
    // Clear expired cache entries
    const now = Date.now();
    for (const [key, value] of this.messageCache.entries()) {
      if (now - value.timestamp > this.cacheTTL) {
        this.messageCache.delete(key);
      }
    }

    // Trigger garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // Update memory metrics
    const usage = process.memoryUsage();
    this.metrics.memoryUsage = Math.round(usage.heapUsed / 1024 / 1024);
  }

  // Performance Monitoring
  startMonitoring() {
    // Monitor cache performance
    setInterval(() => {
      const hitRate = this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) * 100;
      console.log(`[A2A Optimizer] Cache Hit Rate: ${hitRate.toFixed(1)}%, Pool: ${this.metrics.poolUtilization.toFixed(1)}%, Memory: ${this.metrics.memoryUsage}MB`);
    }, 30000);

    // Memory optimization every 5 minutes
    setInterval(() => this.optimizeMemory(), 300000);
  }

  getMetrics() {
    const hitRate = this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) * 100 || 0;
    
    return {
      cache: {
        hits: this.metrics.cacheHits,
        misses: this.metrics.cacheMisses,
        hitRate: hitRate.toFixed(2) + '%',
        size: this.messageCache.size,
        maxSize: this.cacheSize
      },
      pool: {
        active: this.connectionPool.size,
        maxSize: this.poolSize,
        utilization: this.metrics.poolUtilization.toFixed(1) + '%'
      },
      memory: {
        heapUsed: this.metrics.memoryUsage + 'MB',
        cacheEntries: this.messageCache.size
      }
    };
  }
}

// Circular Buffer for History (Memory Efficient)
export class CircularBuffer {
  constructor(maxSize) {
    this.buffer = new Array(maxSize);
    this.maxSize = maxSize;
    this.head = 0;
    this.size = 0;
  }

  push(item) {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.maxSize;
    if (this.size < this.maxSize) this.size++;
  }

  toArray() {
    if (this.size === 0) return [];
    
    const result = new Array(this.size);
    let idx = (this.head - this.size + this.maxSize) % this.maxSize;
    
    for (let i = 0; i < this.size; i++) {
      result[i] = this.buffer[idx];
      idx = (idx + 1) % this.maxSize;
    }
    
    return result;
  }

  get length() {
    return this.size;
  }
}

// Batch Message Processor (Reduces WebSocket Overhead)
export class BatchMessageProcessor {
  constructor(batchSize = 10, batchDelay = 100) {
    this.batchSize = batchSize;
    this.batchDelay = batchDelay;
    this.queue = [];
    this.timer = null;
  }

  enqueue(message, callback) {
    this.queue.push({ message, callback });

    if (this.queue.length >= this.batchSize) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.batchDelay);
    }
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.batchSize);
    batch.forEach(({ message, callback }) => callback(message));
  }
}

export default A2APerformanceOptimizer;
