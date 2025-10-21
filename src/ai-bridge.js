#!/usr/bin/env node
import { WebSocketServer } from 'ws';
import express from 'express';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { randomUUID, createHash } from 'node:crypto';
import { once, EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fastJson from 'fast-json-stringify';
import { ResponseCache } from './utils/optimized-cache.js';
import { globalPerformanceMonitor } from './utils/performance-monitor.js';
import { globalLazyLoader } from './utils/lazy-loader.js';
import { CircuitBreakerManager } from './utils/circuit-breaker.js';

dotenv.config();

// Register heavy modules for lazy loading - EXPANDED for better startup performance
globalLazyLoader.register('compression', () => import('compression'));
globalLazyLoader.register('node:net', () => import('node:net'));
globalLazyLoader.register('better-sqlite3', () => import('better-sqlite3'));
globalLazyLoader.register('pg', () => import('pg'));
globalLazyLoader.register('winston', () => import('winston'));
globalLazyLoader.register('acorn', () => import('acorn'));
globalLazyLoader.register('acorn-walk', () => import('acorn-walk'));
globalLazyLoader.register('@anthropic-ai/sdk', () => import('@anthropic-ai/sdk'));
globalLazyLoader.register('zod', () => import('zod'));

// Preload critical modules in background after startup
setImmediate(() => {
  globalLazyLoader.preload(['compression', '@anthropic-ai/sdk']).catch(() => {});
});

const DEFAULT_HISTORY_LIMIT = Number(process.env.AI_BRIDGE_HISTORY_LIMIT) || 50;
const MAX_QUEUE_PER_CLIENT = Number(process.env.AI_BRIDGE_MAX_QUEUE) || 50;
const TOKEN_AUTH_ENABLED = process.env.AI_BRIDGE_AUTH_TOKEN ? true : false;
const ALLOWED_ORIGINS = (process.env.AI_BRIDGE_CORS_ORIGINS || '*').split(',').map((s) => s.trim());

// WebSocket compression configuration
const WS_COMPRESSION_THRESHOLD = Number(process.env.AI_BRIDGE_WS_COMPRESSION_THRESHOLD) || 4096; // 4KB default (was 8KB)
const WS_COMPRESSION_LEVEL = Number(process.env.AI_BRIDGE_WS_COMPRESSION_LEVEL) || 1; // 1 = fastest, 9 = best compression

function previewPayload(payload, length = 80) {
  try {
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return text.length > length ? `${text.slice(0, length)}…` : text;
  } catch (_error) {
    return '[unserializable payload]';
  }
}

class CircularBuffer {
  constructor(limit) {
    this.limit = limit;
    this.buf = new Array(limit);
    this.index = 0;
    this.size = 0;
  }
  push(item) {
    this.buf[this.index] = item;
    this.index = (this.index + 1) % this.limit;
    if (this.size < this.limit) this.size++;
  }
  toArray() {
    if (this.size < this.limit) {
      return this.buf.slice(0, this.size);
    }
    return [...this.buf.slice(this.index), ...this.buf.slice(0, this.index)];
  }
  filter(fn) {
    return this.toArray().filter(fn);
  }
  get length() {
    return this.size;
  }
}

export class AIBridge extends EventEmitter {
  constructor({ logger = console, historyLimit = DEFAULT_HISTORY_LIMIT } = {}) {
    super();
    this.logger = logger;
    this.historyLimit = historyLimit;
    this.clients = new Map(); // clientId -> { ws, meta }
    this.messageQueue = new Map(); // clientId -> envelope[] waiting delivery
    this.history = new CircularBuffer(historyLimit); // chronological list of envelopes
    this.startTime = Date.now();
    this.stats = {
      messagesProcessed: 0,
      totalConnections: 0,
      errors: 0,
      lastError: null,
    };

    // Circuit breaker for client health monitoring
    this.circuitBreakers = new CircuitBreakerManager({
      failureThreshold: 5,
      resetTimeout: 60000,
      halfOpenRequests: 3,
    });

    // Cleanup timer - optimized interval
    const interval = Number(process.env.AI_BRIDGE_CLEANUP_INTERVAL_MS) || 120000; // Increased to 120s for better performance
    this.cleanupTimer = setInterval(() => this._cleanup(), interval);
    this.cleanupTimer.unref?.();

    // Performance metrics
    this.metrics = {
      lastCleanup: Date.now(),
      cleanupDuration: 0,
      messageQueuePeak: 0,
      clientsPeak: 0,
    };

    // WebSocket message size tracking
    this.messageSizeMetrics = {
      small: 0, // <1KB
      medium: 0, // 1-10KB
      large: 0, // 10-100KB
      huge: 0, // >100KB
      totalBytes: 0,
      totalMessages: 0,
    };
  }

  _isOriginAllowed(origin) {
    if (!origin || ALLOWED_ORIGINS.includes('*')) return true;
    return ALLOWED_ORIGINS.includes(origin);
  }

  _authOk(token) {
    if (!TOKEN_AUTH_ENABLED) return true;
    return token === process.env.AI_BRIDGE_AUTH_TOKEN;
  }

  registerClient(ws, registration) {
    if (!this._authOk(registration?.authToken)) {
      ws.send(JSON.stringify({ type: 'error', error: 'unauthorized' }));
      ws.close(1008, 'Unauthorized');
      return {};
    }

    const clientId = registration.clientId || randomUUID();
    const meta = {
      id: clientId,
      role: registration.role || 'agent',
      labels: registration.labels || [],
      tools: registration.tools || [],
      intents: registration.intents || [],
      maxConcurrentTasks: registration.maxConcurrentTasks ?? 1,
      lastSeen: new Date().toISOString(),
      connectedAt: new Date().toISOString(),
      // Performance metrics
      messagesSent: 0,
      messagesReceived: 0,
      errors: 0,
      lastError: null,
      avgLatency: 0,
      healthScore: 100,
    };

    this.clients.set(clientId, { ws, meta });
    this.stats.totalConnections++;
    this.logger.log(
      `[Bridge] Registered ${clientId} (${meta.role}) – ${this.clients.size} connected`
    );

    // Emit event for coordinators
    this.emit('clientRegistered', meta);

    const queued = this.messageQueue.get(clientId);
    if (queued?.length) {
      queued.splice(0, MAX_QUEUE_PER_CLIENT).forEach((envelope) => {
        this._sendEnvelope(clientId, envelope);
      });
      this.messageQueue.delete(clientId);
    }

    return meta;
  }

  unregisterClient(clientId) {
    if (!this.clients.has(clientId)) return;
    this.clients.delete(clientId);
    this.circuitBreakers.remove(clientId); // Clean up circuit breaker
    this.logger.log(`[Bridge] Client disconnected: ${clientId} (${this.clients.size} remaining)`);

    // Emit event for coordinators
    this.emit('clientDisconnected', clientId);
  }

  listClients() {
    return Array.from(this.clients.values()).map(({ meta }) => meta);
  }

  getHistory({ limit, agentId, taskId, intent } = {}) {
    let result = this.history.toArray();
    if (agentId) {
      result = result.filter((item) => item.from === agentId || item.to === agentId);
    }
    if (taskId) {
      result = result.filter((item) => item.taskId === taskId);
    }
    if (intent) {
      result = result.filter((item) => item.intent === intent);
    }
    const max = Number.isFinite(limit) ? Number(limit) : this.historyLimit;
    return result.slice(-max);
  }

  getStats() {
    const uptime = Date.now() - this.startTime;
    return {
      ...this.stats,
      uptime: Math.floor(uptime / 1000),
      connectedClients: this.clients.size,
      queuedMessages: Array.from(this.messageQueue.values()).reduce(
        (sum, queue) => sum + queue.length,
        0
      ),
      historySize: this.history.length,
      messagesPerSecond: this.stats.messagesProcessed / (uptime / 1000) || 0,
      performance: {
        lastCleanup: this.metrics.lastCleanup,
        cleanupDuration: this.metrics.cleanupDuration,
        messageQueuePeak: this.metrics.messageQueuePeak,
        clientsPeak: this.metrics.clientsPeak,
        memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
      },
    };
  }

  acceptEnvelope(envelope, { allowQueue = true } = {}) {
    return globalPerformanceMonitor.timeSync('acceptEnvelope', () => {
      try {
        const enriched = this._enrichEnvelope(envelope);
        this.history.push(enriched);
        this.stats.messagesProcessed++;

        if (enriched.to) {
          if (!this._sendEnvelope(enriched.to, enriched) && allowQueue) {
            // Check global queue limit
            const MAX_TOTAL_QUEUED = 1000;
            const currentQueuedTotal = Array.from(this.messageQueue.values()).reduce(
              (sum, q) => sum + q.length,
              0
            );

            if (currentQueuedTotal >= MAX_TOTAL_QUEUED) {
              this.logger.warn(
                `[Bridge] Total queue limit reached (${MAX_TOTAL_QUEUED}), dropping message`
              );
              this.stats.errors++;
              return enriched;
            }

            const q = this.messageQueue.get(enriched.to) || [];
            if (q.length >= MAX_QUEUE_PER_CLIENT) {
              q.shift(); // drop oldest
            }
            q.push(enriched);
            this.messageQueue.set(enriched.to, q);
            this.logger.log(`[Bridge] Queued envelope ${enriched.id} for ${enriched.to} (offline)`);
          }
        } else {
          this._broadcast(enriched.from, enriched);
        }

        this.logger.log(
          `[Bridge] Envelope ${enriched.intent || 'agent.message'} from ${enriched.from} -> ${
            enriched.to || 'broadcast'
          }: ${previewPayload(enriched.payload)}`
        );

        // Emit event for coordinators
        this.emit('envelopeProcessed', enriched);

        return enriched;
      } catch (error) {
        this.stats.errors++;
        this.stats.lastError = error.message;
        this.logger.error(`[Bridge] Error processing envelope: ${error.message}`);
        throw error;
      }
    });
  }

  // Batch process multiple envelopes at once for better throughput
  // OPTIMIZED: Parallel enrichment with Promise.allSettled + chunked broadcasting
  async acceptEnvelopeBatch(envelopes, { allowQueue = true } = {}) {
    const CHUNK_SIZE = 50; // Process in chunks to avoid overwhelming event loop
    const results = [];

    // Parallel enrichment with error isolation
    const enrichPromises = envelopes.map((envelope) =>
      Promise.resolve()
        .then(() => {
          const enriched = this._enrichEnvelope(envelope);
          this.stats.messagesProcessed++;
          return { success: true, envelope: enriched };
        })
        .catch((error) => {
          this.stats.errors++;
          this.stats.lastError = error.message;
          this.logger.error(`[Bridge] Error enriching envelope: ${error.message}`);
          return { success: false, error: error.message };
        })
    );

    const enrichmentResults = await Promise.allSettled(enrichPromises);

    // Extract successful envelopes
    const enrichedBatch = enrichmentResults
      .filter((r) => r.status === 'fulfilled' && r.value.success)
      .map((r) => r.value.envelope);

    // Batch history insertion (single operation instead of multiple pushes)
    if (enrichedBatch.length > 0) {
      this.history.pushBatch?.(enrichedBatch) || enrichedBatch.forEach((e) => this.history.push(e));
    }

    // Collect all results
    enrichmentResults.forEach((r) => {
      results.push(
        r.status === 'fulfilled' ? r.value : { success: false, error: r.reason?.message }
      );
    });

    // Chunked parallel send/queue operations to avoid blocking
    for (let i = 0; i < enrichedBatch.length; i += CHUNK_SIZE) {
      const chunk = enrichedBatch.slice(i, i + CHUNK_SIZE);

      await Promise.allSettled(
        chunk.map((enriched) =>
          Promise.resolve().then(() => {
            if (enriched.to) {
              if (!this._sendEnvelope(enriched.to, enriched) && allowQueue) {
                const q = this.messageQueue.get(enriched.to) || [];
                if (q.length >= MAX_QUEUE_PER_CLIENT) {
                  q.shift();
                }
                q.push(enriched);
                this.messageQueue.set(enriched.to, q);
              }
            } else {
              this._broadcast(enriched.from, enriched);
            }
          })
        )
      );
    }

    this.emit('envelopeBatchProcessed', enrichedBatch);
    return results;
  }

  _cleanup() {
    const startTime = Date.now();
    let removedQueues = 0;
    let expiredClients = 0;

    // remove queues for disconnected clients
    for (const [clientId, queue] of this.messageQueue.entries()) {
      const client = this.clients.get(clientId);
      if (!client || client.ws.readyState !== 1) {
        if (queue.length > MAX_QUEUE_PER_CLIENT) {
          queue.splice(0, queue.length - MAX_QUEUE_PER_CLIENT);
          removedQueues++;
        }
      }
    }

    // expire clients not seen for 10 minutes
    const ttlMs = Number(process.env.AI_BRIDGE_CLIENT_TTL_MS) || 10 * 60 * 1000;
    const now = Date.now();
    for (const [clientId, { meta }] of this.clients.entries()) {
      if (meta.lastSeen && now - Date.parse(meta.lastSeen) > ttlMs) {
        this.logger.log(`[Bridge] Expiring idle client ${clientId}`);
        this.unregisterClient(clientId);
        expiredClients++;
      }
    }

    // Update metrics
    this.metrics.lastCleanup = now;
    this.metrics.cleanupDuration = Date.now() - startTime;
    this.metrics.messageQueuePeak = Math.max(this.metrics.messageQueuePeak, this.messageQueue.size);
    this.metrics.clientsPeak = Math.max(this.metrics.clientsPeak, this.clients.size);

    if (removedQueues > 0 || expiredClients > 0) {
      this.logger.log(
        `[Bridge] Cleanup: removed ${removedQueues} queues, expired ${expiredClients} clients in ${this.metrics.cleanupDuration}ms`
      );
    }
  }

  _enrichEnvelope(envelope) {
    const now = new Date().toISOString();
    return {
      id: envelope.id || randomUUID(),
      timestamp: envelope.timestamp || now,
      intent: envelope.intent || 'agent.message',
      taskId: envelope.taskId ?? null,
      channel: envelope.channel || 'default',
      priority: envelope.priority ?? 'normal',
      from: envelope.from || 'unknown',
      role: envelope.role || this.clients.get(envelope.from)?.meta.role || 'agent',
      to: envelope.to ?? null,
      replyTo: envelope.replyTo ?? null,
      context: envelope.context ?? {},
      payload: envelope.payload ?? {},
      tools: envelope.tools ?? [],
      attachments: envelope.attachments ?? [],
      trace: envelope.trace ?? {},
    };
  }

  _sendEnvelope(targetId, envelope) {
    const target = this.clients.get(targetId);
    if (!target || target.ws.readyState !== 1) {
      return false;
    }

    // Use circuit breaker to protect against failing clients
    return this.circuitBreakers
      .getBreaker(targetId)
      .execute(async () => {
        const sendStart = Date.now();
        // Minimal wrapper to reduce JSON size
        const payload = JSON.stringify(['env', envelope]);

        // Track message size metrics
        const size = Buffer.byteLength(payload);
        this.messageSizeMetrics.totalBytes += size;
        this.messageSizeMetrics.totalMessages++;
        if (size < 1024) {
          this.messageSizeMetrics.small++;
        } else if (size < 10240) {
          this.messageSizeMetrics.medium++;
        } else if (size < 102400) {
          this.messageSizeMetrics.large++;
        } else {
          this.messageSizeMetrics.huge++;
        }

        // Send with promise wrapper for circuit breaker
        await new Promise((resolve, reject) => {
          target.ws.send(payload, (error) => {
            if (error) reject(error);
            else resolve();
          });
        });

        // Track performance metrics
        const latency = Date.now() - sendStart;
        target.meta.messagesSent++;
        target.meta.avgLatency =
          (target.meta.avgLatency * (target.meta.messagesSent - 1) + latency) /
          target.meta.messagesSent;

        return true;
      })
      .catch((error) => {
        this.logger.error(`[Bridge] Failed to send envelope to ${targetId}: ${error.message}`);
        this.stats.errors++;
        this.stats.lastError = error.message;

        // Track client-specific errors
        if (target?.meta) {
          target.meta.errors++;
          target.meta.lastError = error.message;
          target.meta.healthScore = Math.max(0, target.meta.healthScore - 5);
        }

        return false;
      });
  }

  async _broadcast(senderId, envelope) {
    return await globalPerformanceMonitor.timeAsync('broadcast', async () => {
      // Single-pass filter for active clients
      const activeClients = [];
      for (const [clientId, { ws }] of this.clients.entries()) {
        if (clientId !== senderId && ws.readyState === 1) {
          activeClients.push({ clientId, ws });
        }
      }

      if (activeClients.length === 0) return;

      // Serialize ONCE after filtering (optimization)
      const payload = JSON.stringify(['env', envelope]);

      // Parallel broadcast with proper error handling
      const sends = activeClients.map(
        ({ clientId, ws }) =>
          new Promise((resolve, reject) => {
            ws.send(payload, (error) => {
              if (error) {
                this.logger.error(`[Bridge] Failed broadcast to ${clientId}: ${error.message}`);
                this.stats.errors++;
                this.stats.lastError = error.message;
                reject(error);
              } else {
                resolve();
              }
            });
          })
      );

      await Promise.allSettled(sends);
    });
  }
}

/**
 * Check if a port is available
 * @param {number} port - Port to check
 * @returns {Promise<boolean>} True if port is available
 */
async function isPortAvailable(port) {
  const { default: net } = await globalLazyLoader.get('node:net');
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(false);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

/**
 * Find an available port, starting from the preferred port
 * @param {number} preferredPort - Preferred port to try first
 * @param {number} maxAttempts - Maximum number of ports to try
 * @returns {Promise<number>} Available port number
 */
async function findAvailablePort(preferredPort, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = preferredPort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  // If no port found in range, return 0 to let OS assign
  return 0;
}

export async function createAIBridgeServer({
  wsPort = Number(process.env.AI_BRIDGE_PORT) || 4567,
  httpPort = Number(process.env.AI_BRIDGE_HTTP_PORT) || 4568,
  historyLimit = DEFAULT_HISTORY_LIMIT,
  logger = console,
  retryOnPortConflict = true,
} = {}) {
  const bridge = new AIBridge({ logger, historyLimit });
  const statusCache = new ResponseCache(2000); // 2 second cache
  const clientsCache = new ResponseCache(2000); // 2 second cache for clients endpoint

  // Smart cache invalidation - clear caches on significant events
  bridge.on('clientRegistered', () => {
    clientsCache.clear(); // Clear clients cache when new client connects
  });

  bridge.on('clientDisconnected', () => {
    clientsCache.clear(); // Clear clients cache when client disconnects
  });

  // Only invalidate status cache on significant changes (not every message)
  let lastStatsSnapshot = null;
  bridge.on('envelopeProcessed', () => {
    const currentStats = bridge.getStats();
    // Only clear status cache if significant change (10+ messages or error count changed)
    if (
      !lastStatsSnapshot ||
      currentStats.messagesProcessed - lastStatsSnapshot.messagesProcessed >= 10 ||
      currentStats.errors !== lastStatsSnapshot.errors ||
      currentStats.connectedClients !== lastStatsSnapshot.connectedClients
    ) {
      statusCache.clear();
      lastStatsSnapshot = currentStats;
    }
  });

  // Check if ports are available and find alternatives if needed
  let actualWsPort = wsPort;
  let actualHttpPort = httpPort;

  if (retryOnPortConflict) {
    const wsAvailable = await isPortAvailable(wsPort);
    const httpAvailable = await isPortAvailable(httpPort);

    if (!wsAvailable) {
      logger.warn(`[Bridge] Port ${wsPort} is busy, finding alternative...`);
      actualWsPort = await findAvailablePort(wsPort);
      if (actualWsPort === 0) {
        logger.warn(`[Bridge] No available ports found in range, using dynamic port allocation`);
      } else {
        logger.log(`[Bridge] Using alternative WebSocket port: ${actualWsPort}`);
      }
    }

    if (!httpAvailable) {
      logger.warn(`[Bridge] Port ${httpPort} is busy, finding alternative...`);
      // Ensure HTTP port doesn't conflict with the chosen WS port
      let candidateHttpPort = await findAvailablePort(httpPort);
      while (candidateHttpPort === actualWsPort && candidateHttpPort !== 0) {
        candidateHttpPort = await findAvailablePort(candidateHttpPort + 1);
      }
      actualHttpPort = candidateHttpPort;
      if (actualHttpPort === 0) {
        logger.warn(`[Bridge] No available ports found in range, using dynamic port allocation`);
      } else {
        logger.log(`[Bridge] Using alternative HTTP port: ${actualHttpPort}`);
      }
    }
  }

  const app = express();

  // Request timing middleware for metrics
  const requestTimings = [];
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      requestTimings.push({
        path: req.path,
        method: req.method,
        duration,
        status: res.statusCode,
        timestamp: Date.now(),
      });
      // Keep only last 1000 requests
      if (requestTimings.length > 1000) requestTimings.shift();
    });
    next();
  });

  // Compression middleware for responses > 1KB (lazy loaded)
  const { default: compression } = await globalLazyLoader.get('compression');
  app.use(
    compression({
      threshold: 1024, // Only compress responses larger than 1KB
      level: 6, // Balance between speed and compression ratio
    })
  );

  app.use(express.json({ limit: '1mb' }));

  // Basic rate limiting
  const limiter = rateLimit({
    windowMs: Number(process.env.AI_BRIDGE_RATE_WINDOW_MS) || 60 * 1000,
    max: Number(process.env.AI_BRIDGE_RATE_MAX) || 120,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);

  // CORS
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS.includes('*') || (origin && ALLOWED_ORIGINS.includes(origin))) {
      res.header('Access-Control-Allow-Origin', origin || '*');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization'
    );
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  // Simple auth middleware for HTTP
  app.use((req, res, next) => {
    if (!TOKEN_AUTH_ENABLED) return next();
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (token === process.env.AI_BRIDGE_AUTH_TOKEN) return next();
    return res.status(401).json({ error: 'unauthorized' });
  });

  // ETag generator helper
  const generateETag = (data) => {
    const hash = createHash('md5');
    hash.update(JSON.stringify(data));
    return `"${hash.digest('hex')}"`;
  };

  // Health endpoint with ETag support
  app.get('/health', (req, res) => {
    const stats = bridge.getStats();
    const response = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      wsPort: actualWsPort,
      httpPort: actualHttpPort,
      connectedClients: bridge.clients.size,
      historySize: bridge.history.length,
      uptime: stats.uptime,
      version: '1.1.0',
      environment: process.env.NODE_ENV || 'development',
    };

    // Generate ETag (excluding timestamp for better caching)
    const cacheableData = { ...response, timestamp: undefined };
    const etag = generateETag(cacheableData);

    // Check If-None-Match header
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    res.set('ETag', etag);
    res.set('Cache-Control', 'public, max-age=2');
    res.json(response);
  });

  // Status endpoint with caching
  app.get('/api/status', (req, res) => {
    // Check cache first
    const cached = statusCache.get('status');
    if (cached) {
      res.set('X-Cache', 'HIT');
      return res.json(cached);
    }

    const stats = bridge.getStats();
    const response = {
      service: 'AI Bridge Server',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.1.0',
      uptime: stats.uptime,
      stats,
      performance: {
        connectedClients: stats.connectedClients,
        messagesProcessed: stats.messagesProcessed,
        messagesPerSecond: Number(stats.messagesPerSecond.toFixed(2)),
        queuedMessages: stats.queuedMessages,
        errors: stats.errors,
        lastError: stats.lastError,
      },
      websocket: { port: actualWsPort, enabled: true, connections: stats.connectedClients },
      http: { port: actualHttpPort, enabled: true },
      storage: { historySize: stats.historySize, historyLimit },
      environment: process.env.NODE_ENV || 'development',
    };

    statusCache.set('status', response);
    res.set('X-Cache', 'MISS');
    res.json(response);
  });

  // Stats endpoint (alias for /api/status for backward compatibility)
  app.get('/stats', (req, res) => {
    const stats = bridge.getStats();
    res.json({
      service: 'AI Bridge Server',
      timestamp: new Date().toISOString(),
      version: '1.1.0',
      uptime: stats.uptime,
      connectedClients: stats.connectedClients,
      messagesProcessed: stats.messagesProcessed,
      messagesPerSecond: Number(stats.messagesPerSecond.toFixed(2)),
      queuedMessages: stats.queuedMessages,
      historySize: stats.historySize,
      errors: stats.errors,
      lastError: stats.lastError,
      clients: bridge.listClients(),
    });
  });

  // Health check endpoint for caches and subsystems
  app.get('/api/health/cache', (req, res) => {
    // Collect cache health from all agents (if available via bridge metadata)
    const cacheHealth = {
      service: 'Cache Health Monitor',
      timestamp: new Date().toISOString(),
      caches: {
        // Response cache health would be reported by agents via metadata
        // For now, return bridge-level cache info
        statusCache: {
          size: statusCache.cache.size,
          ttl: statusCache.ttl,
          healthy: true,
        },
      },
      recommendations: [],
    };

    res.json(cacheHealth);
  });

  // GET /api/cache/stats - Detailed cache performance statistics
  app.get('/api/cache/stats', (req, res) => {
    const statusCacheStats = statusCache.getStats();
    const clientsCacheStats = clientsCache.getStats();

    res.json({
      service: 'Cache Statistics',
      timestamp: new Date().toISOString(),
      caches: {
        statusCache: {
          ...statusCacheStats,
          ttl: statusCache.ttl + 'ms',
        },
        clientsCache: {
          ...clientsCacheStats,
          ttl: clientsCache.ttl + 'ms',
        },
      },
      summary: {
        totalHits: statusCacheStats.hits + clientsCacheStats.hits,
        totalMisses: statusCacheStats.misses + clientsCacheStats.misses,
        overallHitRate: (() => {
          const total = statusCacheStats.total + clientsCacheStats.total;
          const hits = statusCacheStats.hits + clientsCacheStats.hits;
          return total > 0 ? ((hits / total) * 100).toFixed(2) + '%' : '0%';
        })(),
        totalEntries: statusCacheStats.size + clientsCacheStats.size,
      },
    });
  });

  // Detailed health check with all subsystems
  app.get('/api/health/detailed', (req, res) => {
    const stats = bridge.getStats();
    const memUsage = process.memoryUsage();
    const queuedByClient = new Map();

    for (const [clientId, queue] of bridge.messageQueue.entries()) {
      queuedByClient.set(clientId, queue.length);
    }

    const health = {
      service: 'AI Bridge Server',
      timestamp: new Date().toISOString(),
      status: 'healthy',
      version: '1.1.0',
      subsystems: {
        websocket: {
          status: wss.clients.size >= 0 ? 'healthy' : 'degraded',
          port: actualWsPort,
          connections: wss.clients.size,
          healthy: true,
        },
        http: {
          status: 'healthy',
          port: actualHttpPort,
          healthy: true,
        },
        bridge: {
          status: stats.errors < 100 ? 'healthy' : 'degraded',
          connectedClients: stats.connectedClients,
          messagesProcessed: stats.messagesProcessed,
          messagesPerSecond: Number(stats.messagesPerSecond.toFixed(2)),
          queuedMessages: stats.queuedMessages,
          errors: stats.errors,
          healthy: stats.errors < 100,
        },
        cache: {
          status: 'healthy',
          statusCacheSize: statusCache.cache.size,
          clientsCacheSize: clientsCache.cache.size,
          healthy: true,
        },
        memory: {
          status: memUsage.heapUsed < 500 * 1024 * 1024 ? 'healthy' : 'degraded',
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
          rss: Math.round(memUsage.rss / 1024 / 1024),
          external: Math.round(memUsage.external / 1024 / 1024),
          unit: 'MB',
          healthy: memUsage.heapUsed < 500 * 1024 * 1024,
        },
      },
      queues: Object.fromEntries(queuedByClient),
      uptime: stats.uptime,
      lastError: stats.lastError,
      performance: stats.performance,
    };

    const overallHealthy = Object.values(health.subsystems).every((s) => s.healthy);
    health.status = overallHealthy ? 'healthy' : 'degraded';

    res.json(health);
  });

  // GET /api/clients - List all connected clients with filtering support and ETag
  app.get('/api/clients', (req, res) => {
    const { role, label, tool, intent } = req.query;

    // Build cache key from query params
    const cacheKey = `clients:${role || ''}:${label || ''}:${tool || ''}:${intent || ''}`;
    const cached = clientsCache.get(cacheKey);
    if (cached) {
      res.set('X-Cache', 'HIT');

      // Generate ETag for cached response
      const etag = generateETag(cached);
      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }
      res.set('ETag', etag);
      return res.json(cached);
    }

    let clients = bridge.listClients().map((client) => ({
      id: client.id,
      role: client.role,
      labels: client.labels,
      tools: client.tools,
      intents: client.intents,
      connected: true,
      lastSeen: client.lastSeen,
      connectedAt: client.connectedAt,
      // Include new performance metrics
      messagesSent: client.messagesSent || 0,
      messagesReceived: client.messagesReceived || 0,
      errors: client.errors || 0,
      avgLatency: client.avgLatency ? Number(client.avgLatency.toFixed(2)) : 0,
      healthScore: client.healthScore || 100,
    }));

    // Apply filters
    if (role) {
      clients = clients.filter((c) => c.role === role);
    }
    if (label) {
      clients = clients.filter((c) => c.labels.includes(label));
    }
    if (tool) {
      clients = clients.filter((c) => c.tools.includes(tool));
    }
    if (intent) {
      clients = clients.filter((c) => c.intents.includes(intent));
    }

    const response = { clients, count: clients.length };
    clientsCache.set(cacheKey, response);

    // Generate ETag
    const etag = generateETag(response);
    res.set('ETag', etag);
    res.set('X-Cache', 'MISS');
    res.json(response);
  });

  // GET /api/clients/:id - Get detailed information about a specific client
  app.get('/api/clients/:id', (req, res) => {
    const { id } = req.params;
    const client = bridge.clients.get(id);

    if (!client) {
      return res.status(404).json({
        error: 'Client not found',
        clientId: id,
      });
    }

    // Get client's message history
    const clientHistory = bridge.getHistory({ agentId: id, limit: 100 });
    const queuedMessages = bridge.messageQueue.get(id) || [];

    // Calculate additional metrics
    const errorRate =
      client.meta.messagesSent > 0
        ? ((client.meta.errors / client.meta.messagesSent) * 100).toFixed(2) + '%'
        : '0%';

    const response = {
      client: {
        id: client.meta.id,
        role: client.meta.role,
        labels: client.meta.labels,
        tools: client.meta.tools,
        intents: client.meta.intents,
        maxConcurrentTasks: client.meta.maxConcurrentTasks,
        connected: client.ws.readyState === 1,
        lastSeen: client.meta.lastSeen,
        connectedAt: client.meta.connectedAt,
        connectionState: ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][client.ws.readyState],
      },
      performance: {
        messagesSent: client.meta.messagesSent,
        messagesReceived: client.meta.messagesReceived,
        errors: client.meta.errors,
        errorRate,
        avgLatency: client.meta.avgLatency ? Number(client.meta.avgLatency.toFixed(2)) : 0,
        healthScore: client.meta.healthScore,
        lastError: client.meta.lastError || null,
      },
      queues: {
        depth: queuedMessages.length,
        maxDepth: MAX_QUEUE_PER_CLIENT,
        utilization: ((queuedMessages.length / MAX_QUEUE_PER_CLIENT) * 100).toFixed(1) + '%',
        oldestMessage: queuedMessages.length > 0 ? queuedMessages[0].timestamp : null,
      },
      history: {
        totalMessages: clientHistory.length,
        recentMessages: clientHistory.slice(-10).map((env) => ({
          id: env.id,
          timestamp: env.timestamp,
          intent: env.intent,
          from: env.from,
          to: env.to,
          payloadSize: JSON.stringify(env.payload).length,
        })),
      },
    };

    res.json(response);
  });

  // WebSocket broadcast stats to all monitor clients - OPTIMIZED: Adaptive setTimeout
  let lastStatsHash = '';
  let statsBroadcastTimer = null;

  const broadcastStats = () => {
    // Only compute if there are monitor clients
    const monitorClients = Array.from(bridge.clients.values()).filter(
      ({ meta, ws }) => meta.role === 'monitor' && ws.readyState === 1
    );

    // Adaptive delay: Long sleep when no monitors, short when monitors exist
    if (monitorClients.length === 0) {
      statsBroadcastTimer = setTimeout(broadcastStats, 30000); // 30s when idle
      return;
    }

    const stats = bridge.getStats();
    const statsData = {
      connectedClients: stats.connectedClients,
      messagesProcessed: stats.messagesProcessed,
      messagesPerSecond: Number(stats.messagesPerSecond.toFixed(2)),
      queuedMessages: stats.queuedMessages,
      historySize: stats.historySize,
      uptime: stats.uptime,
      errors: stats.errors,
      clients: bridge.listClients(),
    };

    // Only broadcast if stats actually changed (excluding uptime/timestamp)
    const currentHash = `${stats.connectedClients}|${stats.messagesProcessed}|${stats.queuedMessages}|${stats.errors}`;
    if (currentHash !== lastStatsHash) {
      lastStatsHash = currentHash;
      const payload = JSON.stringify({
        type: 'stats_update',
        stats: statsData,
      });

      // Send to monitor clients only
      monitorClients.forEach(({ ws }) => ws.send(payload));
    }

    // Schedule next broadcast
    statsBroadcastTimer = setTimeout(broadcastStats, 15000); // 15s when active
  };

  // Start adaptive stats broadcasting
  statsBroadcastTimer = setTimeout(broadcastStats, 15000);
  bridge.statsBroadcastTimer = statsBroadcastTimer;

  // POST /api/send - Send message via HTTP (converted to WebSocket)
  app.post('/api/send', (req, res) => {
    const { from, to, intent, payload, taskId } = req.body;

    if (!to) {
      return res.status(400).json({ error: 'Recipient `to` is required' });
    }

    if (!payload) {
      return res.status(400).json({ error: 'Message `payload` is required' });
    }

    try {
      const envelope = bridge.acceptEnvelope({
        from: from || 'http-api',
        to,
        intent: intent || 'agent.message',
        payload,
        taskId,
      });
      res.status(202).json({
        success: true,
        status: 'queued',
        envelope: {
          id: envelope.id,
          from: envelope.from,
          to: envelope.to,
          intent: envelope.intent,
          timestamp: envelope.timestamp,
        },
      });
    } catch (error) {
      logger.error(`[Bridge] Error sending message:`, error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/send/batch - Send multiple messages in one request
  app.post('/api/send/batch', async (req, res) => {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Field `messages` must be an array' });
    }

    if (messages.length === 0) {
      return res.status(400).json({ error: 'Messages array cannot be empty' });
    }

    if (messages.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 messages per batch' });
    }

    try {
      const envelopes = messages.map((msg) => ({
        from: msg.from || 'http-api',
        to: msg.to,
        intent: msg.intent || 'agent.message',
        payload: msg.payload,
        taskId: msg.taskId,
      }));

      const results = await bridge.acceptEnvelopeBatch(envelopes);

      const successful = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      res.status(202).json({
        success: true,
        status: 'batch_processed',
        total: messages.length,
        successful,
        failed,
        results: results.map((r) =>
          r.success
            ? {
                id: r.envelope.id,
                from: r.envelope.from,
                to: r.envelope.to,
                intent: r.envelope.intent,
                timestamp: r.envelope.timestamp,
              }
            : {
                error: r.error,
              }
        ),
      });
    } catch (error) {
      logger.error(`[Bridge] Error sending batch:`, error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/metrics - Comprehensive performance metrics
  app.get('/api/metrics', (req, res) => {
    const stats = bridge.getStats();
    const memUsage = process.memoryUsage();

    const avgMsgSize =
      bridge.messageSizeMetrics.totalMessages > 0
        ? Math.round(bridge.messageSizeMetrics.totalBytes / bridge.messageSizeMetrics.totalMessages)
        : 0;

    res.json({
      service: 'AI Bridge Metrics',
      timestamp: new Date().toISOString(),
      performance: {
        uptime: stats.uptime,
        messagesProcessed: stats.messagesProcessed,
        messagesPerSecond: Number(stats.messagesPerSecond.toFixed(2)),
        errors: stats.errors,
        errorRate:
          stats.messagesProcessed > 0
            ? ((stats.errors / stats.messagesProcessed) * 100).toFixed(2) + '%'
            : '0%',
      },
      resources: {
        connectedClients: stats.connectedClients,
        clientsPeak: stats.performance?.clientsPeak || stats.connectedClients,
        queuedMessages: stats.queuedMessages,
        messageQueuePeak: stats.performance?.messageQueuePeak || 0,
        historySize: stats.historySize,
        historyLimit,
      },
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
        external: Math.round(memUsage.external / 1024 / 1024) + 'MB',
        rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
      },
      websocket: {
        messageSizeDistribution: {
          small: bridge.messageSizeMetrics.small,
          medium: bridge.messageSizeMetrics.medium,
          large: bridge.messageSizeMetrics.large,
          huge: bridge.messageSizeMetrics.huge,
        },
        totalMessages: bridge.messageSizeMetrics.totalMessages,
        totalBytes: bridge.messageSizeMetrics.totalBytes,
        avgMessageSize: avgMsgSize + ' bytes',
        totalBandwidth: Math.round(bridge.messageSizeMetrics.totalBytes / 1024) + 'KB',
      },
      cache: {
        statusCache: statusCache.getStats(),
        clientsCache: clientsCache.getStats(),
      },
      cleanup: {
        lastRun: stats.performance?.lastCleanup
          ? new Date(stats.performance.lastCleanup).toISOString()
          : 'never',
        duration: (stats.performance?.cleanupDuration || 0) + 'ms',
      },
      circuitBreakers: bridge.circuitBreakers.getMetrics(),
      http: {
        recentRequests: requestTimings.slice(-100).map((r) => ({
          path: r.path,
          method: r.method,
          duration: r.duration + 'ms',
          status: r.status,
        })),
        avgResponseTime:
          requestTimings.length > 0
            ? (
                requestTimings.reduce((sum, r) => sum + r.duration, 0) / requestTimings.length
              ).toFixed(2) + 'ms'
            : '0ms',
      },
    });
  });

  // GET /api/circuit-breakers - Circuit breaker health status
  app.get('/api/circuit-breakers', (req, res) => {
    const metrics = bridge.circuitBreakers.getMetrics();
    const statuses = bridge.circuitBreakers.getAllStatuses();

    res.json({
      service: 'Circuit Breaker Monitor',
      timestamp: new Date().toISOString(),
      summary: metrics,
      breakers: statuses,
      recommendations: (() => {
        const recs = [];
        const openCount = statuses.filter((s) => s.state === 'OPEN').length;
        const halfOpenCount = statuses.filter((s) => s.state === 'HALF_OPEN').length;

        if (openCount > 0) {
          recs.push({
            severity: 'warning',
            message: `${openCount} client(s) with open circuit breaker - investigate connection issues`,
          });
        }
        if (halfOpenCount > 0) {
          recs.push({
            severity: 'info',
            message: `${halfOpenCount} client(s) in recovery mode (half-open)`,
          });
        }
        if (metrics.totalFailures > 100) {
          recs.push({
            severity: 'error',
            message: 'High total failure count - system health degraded',
          });
        }
        return recs;
      })(),
    });
  });

  // GET /api/queues - Queue depth monitoring
  app.get('/api/queues', (req, res) => {
    const queues = Array.from(bridge.messageQueue.entries()).map(([clientId, queue]) => {
      const client = bridge.clients.get(clientId);
      return {
        clientId,
        queueDepth: queue.length,
        maxDepth: MAX_QUEUE_PER_CLIENT,
        utilization: ((queue.length / MAX_QUEUE_PER_CLIENT) * 100).toFixed(1) + '%',
        clientConnected: client && client.ws.readyState === 1,
        oldestMessage: queue.length > 0 ? queue[0].timestamp : null,
      };
    });

    const totalQueued = queues.reduce((sum, q) => sum + q.queueDepth, 0);
    const highUtilization = queues.filter((q) => q.queueDepth > MAX_QUEUE_PER_CLIENT * 0.8);

    res.json({
      service: 'Queue Monitoring',
      timestamp: new Date().toISOString(),
      summary: {
        totalQueues: queues.length,
        totalMessages: totalQueued,
        highUtilization: highUtilization.length,
        warnings: highUtilization.length > 0 ? ['High queue utilization detected'] : [],
      },
      queues,
    });
  });

  // GET /api/dashboard - Enhanced dashboard with formatted metrics for visualization
  app.get('/api/dashboard', (req, res) => {
    const stats = bridge.getStats();
    const memUsage = process.memoryUsage();
    const clients = bridge.listClients();
    const statusCacheStats = statusCache.getStats();
    const clientsCacheStats = clientsCache.getStats();

    // Calculate client health distribution
    const healthyClients = clients.filter((c) => c.healthScore >= 80).length;
    const degradedClients = clients.filter((c) => c.healthScore >= 50 && c.healthScore < 80).length;
    const unhealthyClients = clients.filter((c) => c.healthScore < 50).length;

    // Calculate message processing metrics
    const avgMsgSize =
      bridge.messageSizeMetrics.totalMessages > 0
        ? Math.round(bridge.messageSizeMetrics.totalBytes / bridge.messageSizeMetrics.totalMessages)
        : 0;

    const errorRate =
      stats.messagesProcessed > 0
        ? ((stats.errors / stats.messagesProcessed) * 100).toFixed(2)
        : '0.00';

    // System health score (0-100)
    const memoryHealthScore =
      memUsage.heapUsed < 200 * 1024 * 1024
        ? 100
        : memUsage.heapUsed < 400 * 1024 * 1024
          ? 75
          : memUsage.heapUsed < 600 * 1024 * 1024
            ? 50
            : 25;

    const errorHealthScore =
      stats.errors < 10 ? 100 : stats.errors < 50 ? 75 : stats.errors < 100 ? 50 : 25;

    const overallHealthScore = Math.round(
      (memoryHealthScore +
        errorHealthScore +
        (healthyClients / Math.max(clients.length, 1)) * 100) /
        3
    );

    const dashboard = {
      service: 'AI Bridge Dashboard',
      timestamp: new Date().toISOString(),
      version: '1.1.0',
      uptime: stats.uptime,
      health: {
        overall: overallHealthScore,
        status:
          overallHealthScore >= 80
            ? 'healthy'
            : overallHealthScore >= 50
              ? 'degraded'
              : 'unhealthy',
        subsystems: {
          memory: {
            score: memoryHealthScore,
            status: memoryHealthScore >= 80 ? 'healthy' : 'degraded',
          },
          errors: {
            score: errorHealthScore,
            status: errorHealthScore >= 80 ? 'healthy' : 'degraded',
          },
          clients: {
            score: Math.round((healthyClients / Math.max(clients.length, 1)) * 100),
            status: unhealthyClients === 0 ? 'healthy' : 'degraded',
          },
        },
      },
      metrics: {
        clients: {
          total: clients.length,
          healthy: healthyClients,
          degraded: degradedClients,
          unhealthy: unhealthyClients,
          peak: stats.performance?.clientsPeak || clients.length,
        },
        messages: {
          processed: stats.messagesProcessed,
          perSecond: Number(stats.messagesPerSecond.toFixed(2)),
          queued: stats.queuedMessages,
          queuePeak: stats.performance?.messageQueuePeak || 0,
          errors: stats.errors,
          errorRate: errorRate + '%',
          avgSize: avgMsgSize + ' bytes',
          totalBandwidth: Math.round(bridge.messageSizeMetrics.totalBytes / 1024) + 'KB',
        },
        cache: {
          statusCache: {
            hits: statusCacheStats.hits,
            misses: statusCacheStats.misses,
            hitRate: statusCacheStats.hitRate,
            size: statusCacheStats.size,
          },
          clientsCache: {
            hits: clientsCacheStats.hits,
            misses: clientsCacheStats.misses,
            hitRate: clientsCacheStats.hitRate,
            size: clientsCacheStats.size,
          },
          overallHitRate: (() => {
            const total = statusCacheStats.total + clientsCacheStats.total;
            const hits = statusCacheStats.hits + clientsCacheStats.hits;
            return total > 0 ? ((hits / total) * 100).toFixed(2) + '%' : '0%';
          })(),
        },
        memory: {
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
          rss: Math.round(memUsage.rss / 1024 / 1024),
          external: Math.round(memUsage.external / 1024 / 1024),
          unit: 'MB',
        },
      },
      config: {
        wsPort: actualWsPort,
        httpPort: actualHttpPort,
        historyLimit: historyLimit,
        historySize: stats.historySize,
        maxQueuePerClient: MAX_QUEUE_PER_CLIENT,
        compressionThreshold: WS_COMPRESSION_THRESHOLD + ' bytes',
        compressionLevel: WS_COMPRESSION_LEVEL,
        environment: process.env.NODE_ENV || 'development',
      },
      alerts: (() => {
        const alerts = [];
        if (unhealthyClients > 0)
          alerts.push({ severity: 'warning', message: `${unhealthyClients} client(s) unhealthy` });
        if (memUsage.heapUsed > 400 * 1024 * 1024)
          alerts.push({ severity: 'warning', message: 'High memory usage' });
        if (stats.errors > 50) alerts.push({ severity: 'error', message: 'High error count' });
        if (stats.queuedMessages > 100)
          alerts.push({ severity: 'warning', message: 'High queue depth' });
        return alerts;
      })(),
    };

    res.json(dashboard);
  });

  // GET /metrics - Prometheus-compatible metrics endpoint
  app.get('/metrics', (req, res) => {
    const stats = bridge.getStats();
    const memUsage = process.memoryUsage();

    const metrics = [];

    // Bridge metrics
    metrics.push('# HELP ai_bridge_clients_connected Number of connected clients');
    metrics.push('# TYPE ai_bridge_clients_connected gauge');
    metrics.push(`ai_bridge_clients_connected ${stats.connectedClients}`);

    metrics.push('# HELP ai_bridge_messages_processed_total Total messages processed');
    metrics.push('# TYPE ai_bridge_messages_processed_total counter');
    metrics.push(`ai_bridge_messages_processed_total ${stats.messagesProcessed}`);

    metrics.push('# HELP ai_bridge_messages_per_second Messages processed per second');
    metrics.push('# TYPE ai_bridge_messages_per_second gauge');
    metrics.push(`ai_bridge_messages_per_second ${stats.messagesPerSecond.toFixed(2)}`);

    metrics.push('# HELP ai_bridge_queued_messages Number of queued messages');
    metrics.push('# TYPE ai_bridge_queued_messages gauge');
    metrics.push(`ai_bridge_queued_messages ${stats.queuedMessages}`);

    metrics.push('# HELP ai_bridge_errors_total Total errors');
    metrics.push('# TYPE ai_bridge_errors_total counter');
    metrics.push(`ai_bridge_errors_total ${stats.errors}`);

    metrics.push('# HELP ai_bridge_uptime_seconds Uptime in seconds');
    metrics.push('# TYPE ai_bridge_uptime_seconds counter');
    metrics.push(`ai_bridge_uptime_seconds ${stats.uptime}`);

    metrics.push('# HELP ai_bridge_history_size Current history buffer size');
    metrics.push('# TYPE ai_bridge_history_size gauge');
    metrics.push(`ai_bridge_history_size ${stats.historySize}`);

    // Memory metrics
    metrics.push('# HELP ai_bridge_memory_heap_used_bytes Heap memory used');
    metrics.push('# TYPE ai_bridge_memory_heap_used_bytes gauge');
    metrics.push(`ai_bridge_memory_heap_used_bytes ${memUsage.heapUsed}`);

    metrics.push('# HELP ai_bridge_memory_heap_total_bytes Total heap memory');
    metrics.push('# TYPE ai_bridge_memory_heap_total_bytes gauge');
    metrics.push(`ai_bridge_memory_heap_total_bytes ${memUsage.heapTotal}`);

    metrics.push('# HELP ai_bridge_memory_rss_bytes Resident set size');
    metrics.push('# TYPE ai_bridge_memory_rss_bytes gauge');
    metrics.push(`ai_bridge_memory_rss_bytes ${memUsage.rss}`);

    // Per-client metrics
    const clients = bridge.listClients();
    metrics.push('# HELP ai_bridge_client_messages_sent_total Messages sent per client');
    metrics.push('# TYPE ai_bridge_client_messages_sent_total counter');
    clients.forEach((client) => {
      metrics.push(
        `ai_bridge_client_messages_sent_total{client_id="${client.id}",role="${client.role}"} ${client.messagesSent || 0}`
      );
    });

    metrics.push('# HELP ai_bridge_client_messages_received_total Messages received per client');
    metrics.push('# TYPE ai_bridge_client_messages_received_total counter');
    clients.forEach((client) => {
      metrics.push(
        `ai_bridge_client_messages_received_total{client_id="${client.id}",role="${client.role}"} ${client.messagesReceived || 0}`
      );
    });

    metrics.push('# HELP ai_bridge_client_health_score Client health score (0-100)');
    metrics.push('# TYPE ai_bridge_client_health_score gauge');
    clients.forEach((client) => {
      metrics.push(
        `ai_bridge_client_health_score{client_id="${client.id}",role="${client.role}"} ${client.healthScore || 100}`
      );
    });

    metrics.push('# HELP ai_bridge_client_avg_latency_ms Average message latency per client');
    metrics.push('# TYPE ai_bridge_client_avg_latency_ms gauge');
    clients.forEach((client) => {
      metrics.push(
        `ai_bridge_client_avg_latency_ms{client_id="${client.id}",role="${client.role}"} ${(client.avgLatency || 0).toFixed(2)}`
      );
    });

    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send(metrics.join('\n') + '\n');
  });

  app.get('/agents', (req, res) => {
    res.json({ agents: bridge.listClients() });
  });

  app.get('/history', (req, res) => {
    const { limit, agentId, taskId, intent } = req.query;
    res.json({
      history: bridge.getHistory({
        limit: limit ? Number(limit) : undefined,
        agentId,
        taskId,
        intent,
      }),
    });
  });

  // POST /api/history/replay - Replay messages from history for debugging
  app.post('/api/history/replay', (req, res) => {
    const { messageId, messageIds, fromTimestamp, toTimestamp, targetClient } = req.body;

    if (!targetClient) {
      return res.status(400).json({ error: 'targetClient is required for replay' });
    }

    const target = bridge.clients.get(targetClient);
    if (!target) {
      return res.status(404).json({ error: 'Target client not found', targetClient });
    }

    let messagesToReplay = [];

    // Replay by message ID(s)
    if (messageId) {
      const msg = bridge.history.toArray().find((env) => env.id === messageId);
      if (msg) messagesToReplay.push(msg);
    } else if (messageIds && Array.isArray(messageIds)) {
      const historyArray = bridge.history.toArray();
      messagesToReplay = historyArray.filter((env) => messageIds.includes(env.id));
    } else if (fromTimestamp || toTimestamp) {
      // Replay by timestamp range
      const from = fromTimestamp ? new Date(fromTimestamp).getTime() : 0;
      const to = toTimestamp ? new Date(toTimestamp).getTime() : Date.now();
      messagesToReplay = bridge.history.toArray().filter((env) => {
        const envTime = new Date(env.timestamp).getTime();
        return envTime >= from && envTime <= to;
      });
    } else {
      return res
        .status(400)
        .json({ error: 'Must specify messageId, messageIds, or timestamp range' });
    }

    if (messagesToReplay.length === 0) {
      return res.status(404).json({ error: 'No messages found to replay' });
    }

    // Replay messages to target client
    let successCount = 0;
    let failureCount = 0;

    messagesToReplay.forEach((env) => {
      const replayEnvelope = {
        ...env,
        id: randomUUID(), // New ID for replayed message
        timestamp: new Date().toISOString(),
        context: {
          ...env.context,
          replay: true,
          originalId: env.id,
          originalTimestamp: env.timestamp,
        },
      };

      if (bridge._sendEnvelope(targetClient, replayEnvelope)) {
        successCount++;
      } else {
        failureCount++;
      }
    });

    res.json({
      success: true,
      replayed: successCount,
      failed: failureCount,
      total: messagesToReplay.length,
      targetClient,
    });
  });

  // Browser extension history endpoint
  app.post('/history', (req, res) => {
    try {
      const { source, items, timestamp } = req.body;

      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: 'Invalid history items' });
      }

      logger.log(`[Bridge] Received ${items.length} history items from ${source || 'unknown'}`);

      items.forEach((item) => {
        bridge.acceptEnvelope({
          intent: 'browser.history',
          from: source || 'browser-extension',
          timestamp: item.visitTime || timestamp || Date.now(),
          payload: {
            url: item.url,
            title: item.title,
            visitTime: item.visitTime,
            visitCount: item.visitCount,
            typedCount: item.typedCount,
            transitionType: item.transitionType,
            metadata: item.metadata,
          },
        });
      });

      res.json({ success: true, received: items.length });
    } catch (error) {
      logger.error(`[Bridge] Error processing history:`, error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/broadcast', (req, res) => {
    const envelope = bridge.acceptEnvelope({
      ...req.body,
      from: req.body?.from || 'api',
    });
    res.status(202).json({ status: 'queued', envelope });
  });

  app.post('/send', (req, res) => {
    if (!req.body?.to) {
      return res.status(400).json({ error: 'Recipient `to` is required' });
    }
    const envelope = bridge.acceptEnvelope({
      ...req.body,
      from: req.body?.from || 'api',
    });
    res.status(202).json({ status: 'queued', envelope });
  });

  app.get('/tasks', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;

    const tasks = new Map();
    bridge.history.toArray().forEach((envelope) => {
      if (!envelope.taskId) return;
      const task = tasks.get(envelope.taskId) || {
        taskId: envelope.taskId,
        intents: new Set(),
        lastUpdate: envelope.timestamp,
        participants: new Set(),
        lastEnvelope: envelope,
      };
      task.intents.add(envelope.intent);
      task.participants.add(envelope.from);
      task.participants.add(envelope.to);
      task.lastUpdate = envelope.timestamp;
      task.lastEnvelope = envelope;
      tasks.set(envelope.taskId, task);
    });

    const taskArray = Array.from(tasks.values()).map((task) => ({
      taskId: task.taskId,
      intents: Array.from(task.intents),
      participants: Array.from(task.participants).filter(Boolean),
      lastUpdate: task.lastUpdate,
      lastEnvelope: task.lastEnvelope,
    }));

    res.json({
      tasks: taskArray.slice(offset, offset + limit),
      total: taskArray.length,
      limit,
      offset,
    });
  });

  logger.log(`[Bridge] Configured ports: WS=${wsPort}, HTTP=${httpPort}`);

  // WebSocket server with configurable compression settings
  const wss = new WebSocketServer({
    port: actualWsPort,
    perMessageDeflate: {
      zlibDeflateOptions: {
        level: WS_COMPRESSION_LEVEL, // Configurable via AI_BRIDGE_WS_COMPRESSION_LEVEL
        memLevel: 7, // Reduced memory usage
      },
      zlibInflateOptions: {
        chunkSize: 10 * 1024, // 10KB chunks for balanced performance
        windowBits: 14, // Reduce window size for lower memory
      },
      clientNoContextTakeover: true,
      serverNoContextTakeover: true,
      concurrencyLimit: 3, // Further reduced for stability
      threshold: WS_COMPRESSION_THRESHOLD, // Configurable via AI_BRIDGE_WS_COMPRESSION_THRESHOLD (default 4KB)
    },
    maxPayload: 2 * 1024 * 1024, // 2MB limit
    backlog: 100, // Connection backlog
    clientTracking: true,
    handleProtocols: undefined, // No custom protocol handling
  });
  await once(wss, 'listening');
  actualWsPort = wss.address().port;
  logger.log(`[Bridge] WebSocket listening on ws://localhost:${actualWsPort}`);

  wss.on('connection', (ws, req) => {
    const origin = req.headers.origin;
    if (!bridge._isOriginAllowed(origin)) {
      logger.warn(`[Bridge] Origin not allowed: ${origin}`);
      ws.close(1008, 'Origin not allowed');
      return;
    }

    let clientId = null;
    let pingTimeout = null;

    // Ping/pong health check - send ping every 30s
    const pingInterval = setInterval(() => {
      if (ws.readyState === 1) {
        ws.ping();
        pingTimeout = setTimeout(() => {
          logger.warn(`[Bridge] Client ${clientId} ping timeout, closing connection`);
          ws.terminate();
        }, 10000); // 10s timeout for pong response
      }
    }, 30000);

    ws.on('pong', () => {
      if (pingTimeout) clearTimeout(pingTimeout);
    });

    ws.on('message', (raw) => {
      let payload;
      try {
        payload = JSON.parse(raw.toString());
      } catch (_error) {
        logger.error('[Bridge] Received invalid JSON payload');
        bridge.stats.errors++;
        bridge.stats.lastError = 'Invalid JSON payload';
        return;
      }

      if (payload.type === 'register') {
        const meta = bridge.registerClient(ws, payload);
        clientId = meta.id;
        ws.send(
          JSON.stringify({
            type: 'registered',
            clientId: meta.id,
            client: meta,
            history: bridge.getHistory({ limit: 10 }),
          })
        );
        return;
      }

      if (payload.type === 'heartbeat') {
        if (clientId && bridge.clients.has(clientId)) {
          bridge.clients.get(clientId).meta.lastSeen = new Date().toISOString();
        }
        return;
      }

      if (payload.type === 'list_clients') {
        ws.send(
          JSON.stringify({
            type: 'clients',
            clients: bridge.listClients(),
          })
        );
        return;
      }

      if (payload.type === 'get_stats') {
        ws.send(
          JSON.stringify({
            type: 'stats',
            stats: bridge.getStats(),
          })
        );
        return;
      }

      if (payload.type === 'envelope' && payload.envelope) {
        bridge.acceptEnvelope({ ...payload.envelope, from: payload.envelope.from || clientId });

        // Track received messages
        if (clientId && bridge.clients.has(clientId)) {
          bridge.clients.get(clientId).meta.messagesReceived++;
        }

        return;
      }

      if (
        payload.type === 'envelope_batch' &&
        payload.envelopes &&
        Array.isArray(payload.envelopes)
      ) {
        // Batch send via WebSocket
        if (payload.envelopes.length > 100) {
          ws.send(JSON.stringify({ type: 'error', error: 'Maximum 100 envelopes per batch' }));
          return;
        }

        const results = bridge.acceptEnvelopeBatch(
          payload.envelopes.map((env) => ({ ...env, from: env.from || clientId }))
        );

        // Track received messages
        if (clientId && bridge.clients.has(clientId)) {
          bridge.clients.get(clientId).meta.messagesReceived += payload.envelopes.length;
        }

        // Send batch response
        ws.send(
          JSON.stringify({
            type: 'envelope_batch_result',
            total: results.length,
            successful: results.filter((r) => r.success).length,
            failed: results.filter((r) => !r.success).length,
            results: results.map((r) => (r.success ? { id: r.envelope.id } : { error: r.error })),
          })
        );

        return;
      }

      logger.warn('[Bridge] Unknown payload type:', payload?.type);
    });

    ws.on('close', () => {
      clearInterval(pingInterval);
      if (pingTimeout) clearTimeout(pingTimeout);
      if (clientId) bridge.unregisterClient(clientId);
    });

    ws.on('error', (error) => {
      const errorMsg = error.code === 'ECONNRESET' ? 'Connection reset by peer' : error.message;
      logger.error(`[Bridge] WebSocket error (client: ${clientId || 'unknown'}):`, errorMsg);
      bridge.stats.errors++;
      bridge.stats.lastError = errorMsg;

      // Emit error event for monitoring
      bridge.emit('clientError', { clientId: clientId || 'unknown', error: errorMsg });

      clearInterval(pingInterval);
      if (pingTimeout) clearTimeout(pingTimeout);
    });
  });

  const httpServer = app.listen(actualHttpPort);
  await once(httpServer, 'listening');
  actualHttpPort = httpServer.address().port;
  logger.log(`[Bridge] HTTP API listening on http://localhost:${actualHttpPort}`);

  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;

    // CRITICAL: Clear ALL timers to prevent memory leaks
    if (bridge.cleanupTimer) clearInterval(bridge.cleanupTimer);
    if (bridge.statsBroadcastTimer) clearTimeout(bridge.statsBroadcastTimer);

    // Clear response cache
    statusCache.clear();

    // Force close all WebSocket connections FIRST
    for (const ws of wss.clients) {
      try {
        ws.terminate();
      } catch (e) {
        // Ignore errors during forced termination
      }
    }

    await new Promise((resolve) => wss.close(resolve));
    await new Promise((resolve) => httpServer.close(resolve));
  }

  return {
    bridge,
    wss,
    httpServer,
    ports: { ws: actualWsPort, http: actualHttpPort },
    actualWsPort,
    actualHttpPort,
    close,
  };
}

async function startCli() {
  const server = await createAIBridgeServer();
  const banner = `
========================================
   AI Bridge Server v1.1.0
========================================
  WebSocket: ws://localhost:${server.ports.ws}
  HTTP API:  http://localhost:${server.ports.http}

  Health:    http://localhost:${server.ports.http}/health
  Status:    http://localhost:${server.ports.http}/api/status
  Agents:    http://localhost:${server.ports.http}/agents
  History:   http://localhost:${server.ports.http}/history
  Tasks:     http://localhost:${server.ports.http}/tasks
========================================
`;
  console.log(banner);
  console.log('[Bridge] Waiting for agents to connect…');

  const shutdown = async () => {
    console.log('\n[Bridge] Shutting down AI Bridge…');
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const modulePath = fileURLToPath(import.meta.url);
const scriptPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (scriptPath && modulePath === scriptPath) {
  startCli().catch((error) => {
    console.error('Fatal error starting AI Bridge:', error.message);
    process.exit(1);
  });
}
