#!/usr/bin/env node
/**
 * AI Bridge Performance Optimizations Module
 * Additional performance enhancements for the AI Bridge server
 */

// Request coalescing - deduplicate concurrent identical requests
export class CoalescingCache {
  constructor() {
    this.pending = new Map();
    this.hits = 0;
    this.coalesced = 0;
  }

  async get(key, computeFn) {
    // If already pending, wait for it
    if (this.pending.has(key)) {
      this.coalesced++;
      return this.pending.get(key);
    }

    // Otherwise, start computation
    this.hits++;
    const promise = Promise.resolve().then(() => computeFn());
    this.pending.set(key, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      this.pending.delete(key);
    }
  }

  getStats() {
    return {
      pendingRequests: this.pending.size,
      totalRequests: this.hits,
      coalescedRequests: this.coalesced,
      savingsRate: this.hits > 0 ? ((this.coalesced / this.hits) * 100).toFixed(2) + '%' : '0%'
    };
  }

  clear() {
    this.pending.clear();
    this.hits = 0;
    this.coalesced = 0;
  }
}

// Message batcher for outbound WebSocket messages
export class MessageBatcher {
  constructor(ws, options = {}) {
    this.ws = ws;
    this.batchWindow = options.batchWindow || 10; // ms
    this.maxBatchSize = options.maxBatchSize || 50;
    this.buffer = [];
    this.timer = null;
    this.messagesSent = 0;
    this.batchesSent = 0;
  }

  send(message) {
    // Skip batching for critical messages
    if (message.type === 'error' || message.type === 'registered') {
      this.flush();
      this.ws.send(JSON.stringify(message));
      this.messagesSent++;
      return;
    }

    this.buffer.push(message);

    // Flush if buffer full
    if (this.buffer.length >= this.maxBatchSize) {
      this.flush();
      return;
    }

    // Schedule flush
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.batchWindow);
    }
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.buffer.length === 0) return;

    if (this.buffer.length === 1) {
      // Single message - send directly
      this.ws.send(JSON.stringify(this.buffer[0]));
      this.messagesSent++;
    } else {
      // Batch send
      this.ws.send(JSON.stringify({
        type: 'message_batch',
        messages: this.buffer
      }));
      this.messagesSent += this.buffer.length;
      this.batchesSent++;
    }

    this.buffer = [];
  }

  getStats() {
    return {
      messagesSent: this.messagesSent,
      batchesSent: this.batchesSent,
      buffered: this.buffer.length,
      avgBatchSize: this.batchesSent > 0 ? (this.messagesSent / this.batchesSent).toFixed(2) : '0'
    };
  }

  destroy() {
    this.flush();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

// Adaptive cache with dynamic TTL based on access patterns
export class AdaptiveCache {
  constructor(options = {}) {
    this.cache = new Map();
    this.minTTL = options.minTTL || 1000; // 1s
    this.maxTTL = options.maxTTL || 10000; // 10s
    this.accessCounts = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Track access
    this.hits++;
    const count = this.accessCounts.get(key) || 0;
    this.accessCounts.set(key, count + 1);

    return entry.value;
  }

  set(key, value) {
    // Calculate adaptive TTL based on access frequency
    const accessCount = this.accessCounts.get(key) || 0;
    let ttl = this.maxTTL;

    if (accessCount > 100) {
      ttl = this.minTTL; // High frequency = short TTL
    } else if (accessCount > 10) {
      ttl = Math.floor((this.minTTL + this.maxTTL) / 2);
    }

    this.cache.set(key, {
      value,
      expires: Date.now() + ttl,
      ttl
    });
  }

  clear() {
    this.cache.clear();
    this.accessCounts.clear();
  }

  getStats() {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? ((this.hits / total) * 100).toFixed(2) + '%' : '0%',
      avgTTL: this._calculateAvgTTL()
    };
  }

  _calculateAvgTTL() {
    if (this.cache.size === 0) return '0ms';
    let sum = 0;
    for (const entry of this.cache.values()) {
      sum += entry.ttl;
    }
    return Math.round(sum / this.cache.size) + 'ms';
  }
}

// Per-client rate limiter
export class ClientRateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60000; // 1 minute
    this.maxRequests = options.maxRequests || 100;
    this.clients = new Map();
  }

  check(clientId) {
    const now = Date.now();
    let client = this.clients.get(clientId);

    if (!client) {
      client = { count: 0, resetTime: now + this.windowMs };
      this.clients.set(clientId, client);
    }

    // Reset if window expired
    if (now >= client.resetTime) {
      client.count = 0;
      client.resetTime = now + this.windowMs;
    }

    client.count++;

    return {
      allowed: client.count <= this.maxRequests,
      remaining: Math.max(0, this.maxRequests - client.count),
      resetTime: client.resetTime
    };
  }

  cleanup() {
    const now = Date.now();
    for (const [clientId, client] of this.clients.entries()) {
      if (now >= client.resetTime + this.windowMs) {
        this.clients.delete(clientId);
      }
    }
  }

  getStats() {
    return {
      trackedClients: this.clients.size,
      windowMs: this.windowMs,
      maxRequests: this.maxRequests
    };
  }
}
