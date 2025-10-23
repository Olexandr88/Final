/**
 * WebSocket Connection Pool
 * Manages WebSocket connections efficiently with pooling and reconnection
 */

import { EventEmitter } from 'events';
import { NETWORK } from '../config/cpu-optimized-constants.js';

export class WebSocketPool extends EventEmitter {
  constructor(options = {}) {
    super();

    this.maxConnections = options.maxConnections || 10;
    this.connectionTimeout = options.connectionTimeout || NETWORK.WEBSOCKET_TIMEOUT_MS;
    this.reconnectDelay = options.reconnectDelay || NETWORK.RECONNECT_BASE_DELAY_MS;

    this.connections = new Map(); // url -> connection object
    this.activeConnections = 0;
    this.metrics = {
      created: 0,
      reused: 0,
      closed: 0,
      errors: 0,
      reconnections: 0,
    };
  }

  /**
   * Get or create a WebSocket connection
   */
  async getConnection(url, options = {}) {
    // Check for existing connection
    const existing = this.connections.get(url);

    if (existing && existing.ws.readyState === 1) {
      this.metrics.reused++;
      existing.lastUsed = Date.now();
      return existing.ws;
    }

    // Create new connection if under limit
    if (this.activeConnections >= this.maxConnections) {
      // Find and close least recently used connection
      this.evictLRU();
    }

    return this.createConnection(url, options);
  }

  /**
   * Create a new WebSocket connection
   */
  createConnection(url, options = {}) {
    return new Promise((resolve, reject) => {
      const ws = new (require('ws'))(url, options);
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error(`Connection timeout: ${url}`));
      }, this.connectionTimeout);

      ws.on('open', () => {
        clearTimeout(timeout);

        const connection = {
          ws,
          url,
          created: Date.now(),
          lastUsed: Date.now(),
          messageCount: 0,
        };

        this.connections.set(url, connection);
        this.activeConnections++;
        this.metrics.created++;

        this.emit('connected', { url, connection });
        resolve(ws);
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        this.metrics.errors++;
        this.emit('error', { url, error });
        reject(error);
      });

      ws.on('close', () => {
        this.connections.delete(url);
        this.activeConnections--;
        this.metrics.closed++;
        this.emit('disconnected', { url });
      });
    });
  }

  /**
   * Evict least recently used connection
   */
  evictLRU() {
    let oldestUrl = null;
    let oldestTime = Infinity;

    for (const [url, conn] of this.connections.entries()) {
      if (conn.lastUsed < oldestTime) {
        oldestTime = conn.lastUsed;
        oldestUrl = url;
      }
    }

    if (oldestUrl) {
      const conn = this.connections.get(oldestUrl);
      if (conn && conn.ws) {
        conn.ws.close();
      }
      this.connections.delete(oldestUrl);
    }
  }

  /**
   * Send message through pooled connection
   */
  async send(url, message, options = {}) {
    const ws = await this.getConnection(url, options);

    return new Promise((resolve, reject) => {
      ws.send(message, (error) => {
        if (error) {
          this.metrics.errors++;
          reject(error);
        } else {
          const conn = this.connections.get(url);
          if (conn) {
            conn.messageCount++;
            conn.lastUsed = Date.now();
          }
          resolve();
        }
      });
    });
  }

  /**
   * Close a specific connection
   */
  closeConnection(url) {
    const conn = this.connections.get(url);
    if (conn && conn.ws) {
      conn.ws.close();
    }
    this.connections.delete(url);
  }

  /**
   * Close all connections
   */
  closeAll() {
    for (const [url, conn] of this.connections.entries()) {
      if (conn.ws) {
        conn.ws.close();
      }
    }
    this.connections.clear();
    this.activeConnections = 0;
  }

  /**
   * Get pool metrics
   */
  getMetrics() {
    const connections = Array.from(this.connections.values()).map((conn) => ({
      url: conn.url,
      age: Date.now() - conn.created,
      idleTime: Date.now() - conn.lastUsed,
      messageCount: conn.messageCount,
      readyState: conn.ws.readyState,
    }));

    return {
      ...this.metrics,
      activeConnections: this.activeConnections,
      maxConnections: this.maxConnections,
      utilizationRate: ((this.activeConnections / this.maxConnections) * 100).toFixed(2) + '%',
      reuseRate:
        this.metrics.created > 0
          ? ((this.metrics.reused / (this.metrics.created + this.metrics.reused)) * 100).toFixed(
              2
            ) + '%'
          : '0%',
      connections,
    };
  }

  /**
   * Health check - ping all connections
   */
  async healthCheck() {
    const results = [];

    for (const [url, conn] of this.connections.entries()) {
      const result = {
        url,
        healthy: false,
        latency: null,
      };

      if (conn.ws.readyState === 1) {
        const start = Date.now();
        try {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Ping timeout')), 5000);

            conn.ws.ping(() => {
              clearTimeout(timeout);
              result.latency = Date.now() - start;
              result.healthy = true;
              resolve();
            });
          });
        } catch (error) {
          result.healthy = false;
        }
      }

      results.push(result);
    }

    return results;
  }
}

export default WebSocketPool;
