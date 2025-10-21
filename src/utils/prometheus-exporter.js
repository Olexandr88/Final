import { register, Counter, Histogram, Gauge } from 'prom-client';

/**
 * Prometheus metrics exporter for AI Bridge
 * Tracks messages, latency, connections, and resource usage
 */
export class PrometheusMetrics {
  constructor() {
    // Message counter
    this.messageCounter = new Counter({
      name: 'ai_bridge_messages_total',
      help: 'Total messages processed by the AI Bridge',
      labelNames: ['type', 'status', 'intent'],
    });

    // Message latency histogram
    this.messageLatency = new Histogram({
      name: 'ai_bridge_message_latency_ms',
      help: 'Message processing latency in milliseconds',
      labelNames: ['type'],
      buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000],
    });

    // Active connections gauge
    this.activeConnections = new Gauge({
      name: 'ai_bridge_connections_active',
      help: 'Number of active WebSocket connections',
    });

    // Queue depth gauge
    this.queueDepth = new Gauge({
      name: 'ai_bridge_queue_depth',
      help: 'Number of messages in queue',
      labelNames: ['client'],
    });

    // Memory usage gauge
    this.memoryUsage = new Gauge({
      name: 'ai_bridge_memory_usage_bytes',
      help: 'Memory usage in bytes',
      labelNames: ['type'],
    });

    // Cache hit rate
    this.cacheHits = new Counter({
      name: 'ai_bridge_cache_hits_total',
      help: 'Cache hit count',
      labelNames: ['cache_name'],
    });

    this.cacheMisses = new Counter({
      name: 'ai_bridge_cache_misses_total',
      help: 'Cache miss count',
      labelNames: ['cache_name'],
    });

    // Error counter
    this.errorCounter = new Counter({
      name: 'ai_bridge_errors_total',
      help: 'Total errors encountered',
      labelNames: ['type', 'severity'],
    });

    // Agent health score
    this.agentHealth = new Gauge({
      name: 'ai_bridge_agent_health_score',
      help: 'Agent health score (0-100)',
      labelNames: ['agent_id'],
    });
  }

  /**
   * Record a message being processed
   */
  recordMessage(type, status, intent = 'unknown') {
    this.messageCounter.inc({ type, status, intent });
  }

  /**
   * Record message processing latency
   */
  recordLatency(type, durationMs) {
    this.messageLatency.observe({ type }, durationMs);
  }

  /**
   * Set active connection count
   */
  setConnections(count) {
    this.activeConnections.set(count);
  }

  /**
   * Set queue depth for a client
   */
  setQueueDepth(client, depth) {
    this.queueDepth.set({ client }, depth);
  }

  /**
   * Record cache hit
   */
  recordCacheHit(cacheName) {
    this.cacheHits.inc({ cache_name: cacheName });
  }

  /**
   * Record cache miss
   */
  recordCacheMiss(cacheName) {
    this.cacheMisses.inc({ cache_name: cacheName });
  }

  /**
   * Record error
   */
  recordError(type, severity = 'error') {
    this.errorCounter.inc({ type, severity });
  }

  /**
   * Set agent health score
   */
  setAgentHealth(agentId, score) {
    this.agentHealth.set({ agent_id: agentId }, score);
  }

  /**
   * Update memory metrics
   */
  updateMemory() {
    const usage = process.memoryUsage();
    this.memoryUsage.set({ type: 'heapUsed' }, usage.heapUsed);
    this.memoryUsage.set({ type: 'heapTotal' }, usage.heapTotal);
    this.memoryUsage.set({ type: 'rss' }, usage.rss);
    this.memoryUsage.set({ type: 'external' }, usage.external);
    this.memoryUsage.set({ type: 'arrayBuffers' }, usage.arrayBuffers || 0);
  }

  /**
   * Get all metrics in Prometheus format
   */
  async getMetrics() {
    this.updateMemory();
    return register.metrics();
  }

  /**
   * Get metrics as JSON
   */
  async getMetricsJSON() {
    return register.getMetricsAsJSON();
  }

  /**
   * Reset all metrics (for testing)
   */
  reset() {
    register.clear();
  }
}

export default PrometheusMetrics;
