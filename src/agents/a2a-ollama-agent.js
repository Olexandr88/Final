#!/usr/bin/env node
/**
 * Real Ollama Agent for A2A System
 * Connects to A2A bridge and uses Ollama API to respond
 */

import WebSocket from 'ws';
import dotenv from 'dotenv';
import http from 'http';
import https from 'https';
import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';
import { OllamaClusterCoordinator } from '../utils/ollama-cluster-coordinator.js';

dotenv.config();

const fetchApi = globalThis.fetch ?? fetch;
if (!globalThis.fetch) {
  globalThis.fetch = fetchApi;
}

// HTTP connection pooling for better performance
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 10,
  maxFreeSockets: 5,
  timeout: 30000,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 10,
  maxFreeSockets: 5,
  timeout: 30000,
});

const BRIDGE_URL = process.env.BRIDGE_WS || 'ws://localhost:65028';
const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const AGENT_ID = 'ollama-agent-1';
const MODEL = process.env.OLLAMA_MODEL || 'llama2';

class A2AOllamaAgent {
  constructor() {
    this.agentId = AGENT_ID;
    this.ws = null;
    this.conversationHistory = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectDelay = 30000; // 30 seconds max
    this.baseReconnectDelay = 1000; // 1 second base

    // Circuit breaker for Ollama API
    this.circuitBreaker = {
      failures: 0,
      threshold: 3,
      timeout: 60000, // 1 minute cooldown
      state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
      nextRetry: 0,
    };

    // Request queue to prevent overload (max 3 concurrent)
    this.requestQueue = [];
    this.activeRequests = 0;
    this.maxConcurrent = 3;
    this.inFlightMessages = new Set();

    // Message deduplication
    this.processedMessages = new Set();
    this.messageCleanupInterval = setInterval(() => {
      // Clean old message IDs (older than 5 minutes)
      if (this.processedMessages.size > 1000) {
        this.processedMessages.clear();
      }
    }, 300000);

    this.clusterSync = new OllamaClusterCoordinator({
      clusterId: process.env.OLLAMA_CLUSTER_ID || 'default',
      maxGlobalConcurrency: Number(process.env.OLLAMA_GLOBAL_MAX_CONCURRENCY || this.maxConcurrent),
    });

    logger.info(`🤖 Starting Ollama Agent: ${this.agentId}`);
    logger.info(`📡 Ollama URL: ${OLLAMA_URL}`);
    logger.info(`🧠 Model: ${MODEL}`);
    this.connect();
  }

  async bootstrap() {
    const available = await this.waitForOllama();
    if (!available) {
      logger.warn(
        '??  Ollama not reachable yet. Requests will queue until the service becomes available.'
      );
    }
    this.connect();
  }

  connect() {
    this.ws = new WebSocket(BRIDGE_URL);

    this.ws.on('open', () => {
      logger.info(`✅ Connected to A2A Bridge at ${BRIDGE_URL}`);
      this.reconnectAttempts = 0; // Reset on successful connection
      this.register();
    });

    this.ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data);
        await this.handleMessage(msg);
      } catch (error) {
        logger.error('❌ Error handling message:', error.message);
      }
    });

    this.ws.on('error', (error) => {
      logger.error('❌ WebSocket error:', error.message);
    });

    this.ws.on('close', () => {
      logger.info('🔌 Disconnected from A2A Bridge');

      // Clean up heartbeat interval to prevent memory leak
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }

      // Exponential backoff with jitter
      this.reconnectAttempts++;
      const backoffDelay = Math.min(
        this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
        this.maxReconnectDelay
      );
      const jitter = Math.random() * 1000; // 0-1s jitter
      const delay = backoffDelay + jitter;

      logger.info(
        `🔄 Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${this.reconnectAttempts})...`
      );
      setTimeout(() => this.connect(), delay);
    });

    // Heartbeat - optimized interval (store reference for cleanup)
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === 1) {
        try {
          this.ws.send(JSON.stringify({ type: 'heartbeat' }));
        } catch (err) {
          logger.error('❌ Heartbeat failed:', err.message);
        }
      }
    }, 180000); // Increased to 180s (3min) to reduce network overhead
  }

  /**
   * Cleanup method to properly dispose of timers
   */
  cleanup() {
    if (this.messageCleanupInterval) {
      clearInterval(this.messageCleanupInterval);
      this.messageCleanupInterval = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.ws) {
      this.ws.close();
    }
    if (this.clusterSync) {
      this.clusterSync.shutdown();
      this.clusterSync = null;
    }
    this.requestQueue = [];
    this.inFlightMessages.clear();
    this.processedMessages.clear();
  }

  register() {
    const registration = {
      type: 'register',
      clientId: this.agentId,
      role: 'ai-assistant',
      labels: ['ollama', 'llm', 'ai', 'local'],
      tools: ['conversation', 'analysis', 'reasoning'],
      intents: ['ai.query', 'ai.analyze', 'ai.converse', 'agent.health'],
      maxConcurrentTasks: 5,
    };

    this.ws.send(JSON.stringify(registration));
    logger.info(`📝 Registered as ${this.agentId}`);
  }

  async handleMessage(msg) {
    if (msg.type === 'registered') {
      logger.info('✅ Registration confirmed');
      logger.info(`   Client ID: ${msg.client.id}`);
      logger.info(`   Role: ${msg.client.role}`);
      logger.info('🎧 Listening for messages...\n');
      return;
    }

    if (msg[0] === 'env') {
      const envelope = msg[1];
      await this.handleEnvelope(envelope);
    }
  }

  async handleEnvelope(envelope) {
    const { from, to, intent, payload, id } = envelope;

    if (to !== this.agentId && to !== null) {
      return;
    }

    if (id && this.processedMessages.has(id)) {
      logger.info(`??  Skipping duplicate message ID: ${id}`);
      return;
    }

    if (id && this.inFlightMessages.has(id)) {
      logger.info(`??  Message ${id} is already being processed`);
      return;
    }

    logger.info(`?? Received message from ${from}`);
    logger.info(`   Intent: ${intent}`);
    logger.info(`   Payload:`, JSON.stringify(payload).slice(0, 100));

    if (intent === 'agent.health') {
      const clusterStats = this.clusterSync
        ? {
            enabled: true,
            totalInflight: this.clusterSync.getTotalInflight(),
            localInflight: this.clusterSync.getLocalInflight(),
            maxConcurrency: this.clusterSync.getMaxConcurrency(),
            waiters: this.clusterSync.getWaiterCount(),
            peers: this.clusterSync.getPeerCount(),
          }
        : { enabled: false };

      const saturated =
        clusterStats.enabled &&
        typeof clusterStats.totalInflight === 'number' &&
        typeof clusterStats.maxConcurrency === 'number' &&
        clusterStats.maxConcurrency > 0 &&
        clusterStats.totalInflight >= clusterStats.maxConcurrency;

      const status = this.circuitBreaker.state === 'OPEN' ? 'error' : saturated ? 'warn' : 'ok';

      const healthEnvelope = {
        type: 'envelope',
        envelope: {
          from: this.agentId,
          to: from,
          intent: 'agent.health',
          replyTo: id,
          payload: {
            status,
            agent: this.agentId,
            model: MODEL,
            activeRequests: this.activeRequests,
            queueSize: this.requestQueue.length,
            circuitBreaker: this.circuitBreaker.state,
            failures: this.circuitBreaker.failures,
            cluster: clusterStats,
            queueLimit: this.maxConcurrent,
            timestamp: new Date().toISOString(),
          },
        },
      };
      this.ws.send(JSON.stringify(healthEnvelope));
      if (id) {
        this.processedMessages.add(id);
      }
      return;
    }

    if (this.activeRequests >= this.maxConcurrent) {
      if (this.requestQueue.length >= 10) {
        logger.info(`??  Request queue full, dropping message`);
        return;
      }
      logger.info(
        `??  Queueing request (${this.requestQueue.length + 1} queued, ${this.activeRequests} active)`
      );
      this.requestQueue.push(envelope);
      return;
    }

    this._startProcessing(envelope);
  }

  _startProcessing(envelope) {
    const { id } = envelope;
    if (id) {
      this.inFlightMessages.add(id);
    }
    this.activeRequests++;
    this._processRequest(envelope)
      .catch((error) => {
        logger.error('? Unhandled processing error:', error.message);
      })
      .finally(() => {
        if (id) {
          this.inFlightMessages.delete(id);
          this.processedMessages.add(id);
        }
        this.activeRequests = Math.max(this.activeRequests - 1, 0);
        this._drainQueue();
      });
  }

  _drainQueue() {
    if (this.requestQueue.length === 0) {
      return;
    }

    while (this.requestQueue.length > 0 && this.activeRequests < this.maxConcurrent) {
      const nextEnvelope = this.requestQueue.shift();
      if (!nextEnvelope) continue;
      const { id } = nextEnvelope;
      if (id && (this.processedMessages.has(id) || this.inFlightMessages.has(id))) {
        continue;
      }
      this._startProcessing(nextEnvelope);
    }
  }

  async _processRequest(envelope) {
    const { from, to, intent, payload, id } = envelope;
    let releaseClusterSlot = null;
    try {
      if (this.clusterSync) {
        releaseClusterSlot = await this.clusterSync.acquire({ envelopeId: id, from, intent });
      }

      const userMessage =
        payload?.message || payload?.query || payload?.question || JSON.stringify(payload);

      logger.info(`🤔 Processing with Ollama (${MODEL})...`);

      // Check circuit breaker
      if (this.circuitBreaker.state === 'OPEN') {
        if (Date.now() < this.circuitBreaker.nextRetry) {
          throw new Error('Circuit breaker open - Ollama service temporarily unavailable');
        }
        this.circuitBreaker.state = 'HALF_OPEN';
        logger.info('🔄 Circuit breaker entering HALF_OPEN state');
      }

      // Call Ollama API with timeout and retry
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      let response;
      let retries = 2;
      const isHttps = OLLAMA_URL.startsWith('https');

      while (retries > 0) {
        try {
          response = await fetchApi(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Connection: 'keep-alive',
            },
            body: JSON.stringify({
              model: MODEL,
              prompt: userMessage,
              stream: false,
              options: {
                temperature: 0.7,
                top_p: 0.9,
                top_k: 40,
                num_predict: 256, // Optimized for faster responses
                num_ctx: 2048, // Balanced context for speed
                num_thread: 6, // Increased threads for faster inference
              },
            }),
            signal: controller.signal,
            agent: isHttps ? httpsAgent : httpAgent, // Use connection pooling
          });
          if (response.ok) break;
          retries--;
          if (retries > 0) await new Promise((r) => setTimeout(r, 1000));
        } catch (err) {
          retries--;
          if (retries === 0) throw err;
          await new Promise((r) => setTimeout(r, 1000));
        }
      }

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      const aiResponse = result.response;

      logger.info(`✅ Ollama responded (${aiResponse.length} chars)`);
      logger.info(`   Response preview: ${aiResponse.slice(0, 100)}...`);

      // Reset circuit breaker on success
      if (this.circuitBreaker.state === 'HALF_OPEN') {
        logger.info('✅ Circuit breaker returning to CLOSED state');
      }
      this.circuitBreaker.state = 'CLOSED';
      this.circuitBreaker.failures = 0;

      // Send response back
      const responseEnvelope = {
        type: 'envelope',
        envelope: {
          from: this.agentId,
          to: from,
          intent: 'ai.response',
          replyTo: id,
          payload: {
            response: aiResponse,
            model: MODEL,
            agent: this.agentId,
            processed_at: new Date().toISOString(),
          },
        },
      };

      this.ws.send(JSON.stringify(responseEnvelope));
      logger.info(`📤 Sent response back to ${from}\n`);
    } catch (error) {
      logger.error(`❌ Error processing message:`, error.message);

      // Update circuit breaker on failure
      this.circuitBreaker.failures++;
      if (this.circuitBreaker.failures >= this.circuitBreaker.threshold) {
        this.circuitBreaker.state = 'OPEN';
        this.circuitBreaker.nextRetry = Date.now() + this.circuitBreaker.timeout;
        const retryTime = new Date(this.circuitBreaker.nextRetry).toLocaleTimeString();
        logger.info(
          `⚠️  Circuit breaker OPEN after ${this.circuitBreaker.failures} ` +
            `failures. Retry at ${retryTime}`
        );
      }

      // Sanitize error message for production
      const sanitizedError =
        process.env.NODE_ENV === 'production'
          ? 'An error occurred processing your request'
          : error.message;

      // Send error response
      const errorEnvelope = {
        type: 'envelope',
        envelope: {
          from: this.agentId,
          to: from,
          intent: 'ai.error',
          replyTo: id,
          payload: {
            error: sanitizedError,
            agent: this.agentId,
            timestamp: new Date().toISOString(),
          },
        },
      };
      this.ws.send(JSON.stringify(errorEnvelope));
    } finally {
      if (typeof releaseClusterSlot === 'function') {
        try {
          releaseClusterSlot();
        } catch (releaseError) {
          logger.debug('Failed to release Ollama cluster slot', {
            error: releaseError.message,
          });
        }
      }
    }
  }

  async pingOllama(timeoutMs = 3000) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetchApi(`${OLLAMA_URL}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  async waitForOllama() {
    const maxAttempts = parseInt(process.env.OLLAMA_BOOT_ATTEMPTS || '5', 10);
    const baseDelay = parseInt(process.env.OLLAMA_BOOT_DELAY || '2000', 10);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const available = await this.pingOllama();
      if (available) {
        logger.info(`? Ollama is reachable (attempt ${attempt}/${maxAttempts})`);
        return true;
      }

      const delay = baseDelay * attempt;
      logger.warn(
        `??  Ollama not reachable (attempt ${attempt}/${maxAttempts}). Retrying in ${(delay / 1000).toFixed(1)}s...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    logger.error('?? Ollama service is still unreachable after multiple attempts.');
    logger.info('   • Ensure Ollama is installed: https://ollama.com/download');
    logger.info('   • Start the service: ollama serve');
    logger.info(`   • Pull the model "${MODEL}": ollama pull ${MODEL}`);
    return false;
  }
}

// Start agent
const agent = new A2AOllamaAgent();

// Cleanup function
function cleanup() {
  logger.info('\n?? Shutting down Ollama Agent...');
  if (agent && typeof agent.cleanup === 'function') {
    agent.cleanup();
  } else {
    if (agent && agent.heartbeatInterval) {
      clearInterval(agent.heartbeatInterval);
    }
    if (agent && agent.messageCleanupInterval) {
      clearInterval(agent.messageCleanupInterval);
    }
    if (agent && agent.ws) {
      agent.ws.close();
    }
    if (agent && agent.clusterSync) {
      agent.clusterSync.shutdown();
    }
  }
  // Cleanup connection pool agents
  if (httpAgent) httpAgent.destroy();
  if (httpsAgent) httpsAgent.destroy();
  process.exit(0);
}

// Handle shutdown
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
