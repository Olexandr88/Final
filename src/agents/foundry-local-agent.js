/**
 * A2A Foundry Local Agent
 * WebSocket-based agent for multi-agent coordination using Foundry Local
 * @module a2a-foundry-local-agent
 */

import WebSocket from 'ws';
import { FoundryLocalClient } from '../clients/foundry-local-client.js';
import { logger } from '../utils/logger.js';
import { NETWORK, PERFORMANCE } from '../config/constants.js';

const BRIDGE_WS = process.env.BRIDGE_WS || `ws://localhost:${NETWORK.BRIDGE_WS_PORT}`;
const AGENT_ID = process.env.FOUNDRY_AGENT_ID || 'foundry-local-agent-1';
const MODEL = process.env.FOUNDRY_LOCAL_DEFAULT_MODEL || 'phi-3.5-mini';

/**
 * A2A Foundry Local Agent
 * Connects to AI Bridge and provides local NPU/GPU-accelerated inference
 */
class A2AFoundryLocalAgent {
  constructor() {
    this.agentId = AGENT_ID;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = PERFORMANCE.BRIDGE_RECONNECT_DELAY_MS;
    this.foundryClient = new FoundryLocalClient({
      defaultModel: MODEL,
    });
    this.conversationHistory = new Map(); // conversationId -> messages[]
    this.activeRequests = 0;
    this.maxConcurrent = 2; // Lower for NPU/GPU memory constraints
    this.requestQueue = [];
    this.processedMessages = new Set(); // Deduplication
  }

  /**
   * Bootstrap the agent (check service and connect)
   */
  async bootstrap() {
    logger.info('🚀 A2A Foundry Local Agent starting...', {
      agentId: this.agentId,
      model: MODEL,
      bridgeUrl: BRIDGE_WS,
    });

    // Check if Foundry Local service is running
    const serviceRunning = this.foundryClient.isServiceRunning();
    if (!serviceRunning) {
      logger.warn('⚠️  Foundry Local service not running. Agent will queue requests until service is available.');
    } else {
      // Pre-initialize default model
      logger.info('🔄 Pre-initializing default model...');
      const initResult = await this.foundryClient.initialize(MODEL);
      if (initResult.success) {
        logger.info('✅ Default model ready', {
          model: initResult.modelInfo.id,
          hardware: initResult.modelInfo.hardware || 'unknown',
          endpoint: initResult.endpoint,
        });
      } else {
        logger.error('❌ Failed to pre-initialize model', {
          error: initResult.error,
        });
      }
    }

    // Connect to AI Bridge
    this.connect();
  }

  /**
   * Connect to AI Bridge WebSocket
   */
  connect() {
    try {
      logger.info('🔌 Connecting to AI Bridge...', { url: BRIDGE_WS });
      this.ws = new WebSocket(BRIDGE_WS);

      this.ws.on('open', () => {
        logger.info('✅ Connected to AI Bridge');
        this.reconnectAttempts = 0;
        this.register();
        this.startHeartbeat();
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (error) => {
        logger.error('❌ WebSocket error', { error: error.message });
      });

      this.ws.on('close', () => {
        logger.warn('⚠️  Disconnected from AI Bridge');
        this.stopHeartbeat();
        this.attemptReconnect();
      });
    } catch (error) {
      logger.error('❌ Failed to create WebSocket connection', {
        error: error.message,
      });
      this.attemptReconnect();
    }
  }

  /**
   * Register agent with AI Bridge
   */
  register() {
    const capabilities = {
      type: 'register',
      data: {
        id: this.agentId,
        capabilities: [
          'chat',
          'local-inference',
          'npu-acceleration',
          'offline-capable',
          'phi-3.5',
          'privacy-focused',
        ],
        provider: 'foundry-local',
        models: [MODEL],
        status: 'ready',
        hardware: 'npu/gpu/cpu',
      },
      metadata: {
        timestamp: Date.now(),
        version: '1.0.0',
      },
    };

    this.sendMessage(capabilities);
    logger.info('📝 Registered with AI Bridge', {
      agentId: this.agentId,
      capabilities: capabilities.data.capabilities,
    });
  }

  /**
   * Handle incoming WebSocket messages
   * @param {Buffer|String} data - Message data
   */
  async handleMessage(data) {
    try {
      const msg = JSON.parse(data.toString());

      // Deduplication check
      const msgId = msg.metadata?.messageId || JSON.stringify(msg);
      if (this.processedMessages.has(msgId)) {
        logger.debug('Duplicate message ignored', { messageId: msgId });
        return;
      }
      this.processedMessages.add(msgId);

      // Cleanup old processed messages (keep last 1000)
      if (this.processedMessages.size > 1000) {
        const toDelete = Array.from(this.processedMessages).slice(0, 100);
        toDelete.forEach((id) => this.processedMessages.delete(id));
      }

      logger.debug('📨 Message received', {
        type: msg.type,
        from: msg.data?.from,
      });

      switch (msg.type) {
        case 'query':
        case 'chat':
          await this.handleChatQuery(msg);
          break;

        case 'ping':
          this.sendMessage({ type: 'pong', data: { agentId: this.agentId } });
          break;

        case 'status-request':
          await this.sendStatus();
          break;

        case 'list-models':
          await this.handleListModels(msg);
          break;

        default:
          logger.debug('Unhandled message type', { type: msg.type });
      }
    } catch (error) {
      logger.error('❌ Error handling message', {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Handle chat query with conversation history support
   * @param {Object} msg - Chat message
   */
  async handleChatQuery(msg) {
    // Queue request if at max concurrency
    if (this.activeRequests >= this.maxConcurrent) {
      logger.debug('Max concurrent requests reached, queuing...', {
        active: this.activeRequests,
        max: this.maxConcurrent,
      });
      this.requestQueue.push(msg);
      return;
    }

    this.activeRequests++;
    logger.info('💬 Processing chat query', {
      active: this.activeRequests,
      queued: this.requestQueue.length,
    });

    try {
      const query = msg.data?.query || msg.data?.message || '';
      const conversationId = msg.data?.conversationId || 'default';
      const stream = msg.data?.stream !== undefined ? msg.data.stream : true;

      // Get or create conversation history
      if (!this.conversationHistory.has(conversationId)) {
        this.conversationHistory.set(conversationId, []);
      }
      const history = this.conversationHistory.get(conversationId);

      // Add user message to history
      history.push({ role: 'user', content: query });

      // Keep history size manageable (last 20 messages)
      if (history.length > 20) {
        history.splice(0, history.length - 20);
      }

      logger.debug('Conversation context', {
        conversationId,
        historyLength: history.length,
      });

      // Send to Foundry Local
      const result = await this.foundryClient.chat(history, {
        stream,
        temperature: msg.data?.temperature || 0.7,
        max_tokens: msg.data?.max_tokens || 1024,
      });

      if (stream) {
        // Stream response chunks
        let fullResponse = '';
        for await (const chunk of result.stream) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            fullResponse += content;
            this.sendMessage({
              type: 'response-chunk',
              data: {
                content,
                conversationId,
                model: result.modelAlias,
              },
              metadata: {
                agentId: this.agentId,
                timestamp: Date.now(),
              },
            });
          }
        }

        // Add assistant response to history
        history.push({ role: 'assistant', content: fullResponse });

        // Send completion
        this.sendMessage({
          type: 'response-complete',
          data: {
            conversationId,
            totalTokens: fullResponse.length,
            model: result.modelAlias,
          },
          metadata: {
            agentId: this.agentId,
            timestamp: Date.now(),
          },
        });
      } else {
        // Non-streaming response
        const content = result.response.choices[0]?.message?.content || '';
        history.push({ role: 'assistant', content });

        this.sendMessage({
          type: 'response',
          data: {
            response: content,
            conversationId,
            model: result.modelAlias,
            usage: result.response.usage,
          },
          metadata: {
            agentId: this.agentId,
            timestamp: Date.now(),
          },
        });
      }

      logger.info('✅ Chat query completed', {
        conversationId,
        streaming: stream,
      });
    } catch (error) {
      logger.error('❌ Chat query failed', {
        error: error.message,
        stack: error.stack,
      });

      this.sendMessage({
        type: 'error',
        data: {
          error: error.message,
          agentId: this.agentId,
        },
        metadata: {
          timestamp: Date.now(),
        },
      });
    } finally {
      this.activeRequests--;

      // Process queued requests
      if (this.requestQueue.length > 0 && this.activeRequests < this.maxConcurrent) {
        const nextMsg = this.requestQueue.shift();
        setImmediate(() => this.handleChatQuery(nextMsg));
      }
    }
  }

  /**
   * Handle list models request
   * @param {Object} msg - List models message
   */
  async handleListModels(msg) {
    try {
      const models = await this.foundryClient.listCachedModels();
      this.sendMessage({
        type: 'models-list',
        data: {
          models,
          count: models.length,
        },
        metadata: {
          agentId: this.agentId,
          timestamp: Date.now(),
        },
      });
    } catch (error) {
      logger.error('❌ Failed to list models', { error: error.message });
      this.sendMessage({
        type: 'error',
        data: {
          error: error.message,
          agentId: this.agentId,
        },
      });
    }
  }

  /**
   * Send status update to AI Bridge
   */
  async sendStatus() {
    const serviceRunning = this.foundryClient.isServiceRunning();
    const status = {
      type: 'status',
      data: {
        agentId: this.agentId,
        status: serviceRunning ? 'ready' : 'service-unavailable',
        activeRequests: this.activeRequests,
        queuedRequests: this.requestQueue.length,
        conversationCount: this.conversationHistory.size,
        serviceRunning,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      },
      metadata: {
        timestamp: Date.now(),
      },
    };

    this.sendMessage(status);
  }

  /**
   * Send message to AI Bridge
   * @param {Object} message - Message to send
   */
  sendMessage(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      logger.warn('⚠️  Cannot send message - WebSocket not open');
    }
  }

  /**
   * Start heartbeat ping
   */
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.sendMessage({
        type: 'heartbeat',
        data: { agentId: this.agentId },
        metadata: { timestamp: Date.now() },
      });
    }, NETWORK.PING_INTERVAL_MS);
  }

  /**
   * Stop heartbeat ping
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Attempt to reconnect to AI Bridge
   */
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('❌ Max reconnect attempts reached. Giving up.');
      process.exit(1);
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;

    logger.info(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    logger.info('🛑 Shutting down Foundry Local Agent...');
    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close();
    }

    await this.foundryClient.cleanup();
    logger.info('👋 Shutdown complete');
    process.exit(0);
  }
}

// Bootstrap agent
const agent = new A2AFoundryLocalAgent();
agent.bootstrap();

// Graceful shutdown handlers
process.on('SIGINT', () => agent.shutdown());
process.on('SIGTERM', () => agent.shutdown());

export default A2AFoundryLocalAgent;
