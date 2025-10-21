#!/usr/bin/env node
/**
 * Redis-based Agent Base Class
 * Provides Redis pub/sub connectivity for agents
 */

import { createClient } from 'redis';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { logger } from '../utils/logger.js';

export class RedisAgentBase extends EventEmitter {
  constructor(config) {
    super();

    this.agentId = config.agentId || `agent-${randomUUID()}`;
    this.intents = config.intents || [];
    this.labels = config.labels || [];
    this.tools = config.tools || [];
    this.channels = config.channels || ['default'];
    this.role = config.role || 'agent';

    this.redisUrl = config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';

    // Redis clients
    this.subscriber = null;
    this.publisher = null;

    // Message handlers
    this.intentHandlers = new Map();
    this.messageHandlers = [];

    // Statistics
    this.stats = {
      messagesSent: 0,
      messagesReceived: 0,
      errors: 0,
      connectedAt: null,
      lastSeen: null
    };

    // Connection state
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;

    logger.info(`[${this.agentId}] Agent initialized`, {
      role: this.role,
      intents: this.intents,
      labels: this.labels
    });
  }

  /**
   * Connect to Redis message broker
   */
  async connect() {
    try {
      // Create Redis clients
      this.subscriber = createClient({ url: this.redisUrl });
      this.publisher = this.subscriber.duplicate();

      // Error handlers
      this.subscriber.on('error', (err) => {
        logger.error(`[${this.agentId}] Subscriber error:`, err);
        this.stats.errors++;
        this.emit('error', err);
      });

      this.publisher.on('error', (err) => {
        logger.error(`[${this.agentId}] Publisher error:`, err);
        this.stats.errors++;
        this.emit('error', err);
      });

      // Reconnection handlers
      this.subscriber.on('reconnecting', () => {
        logger.warn(`[${this.agentId}] Reconnecting to Redis...`);
        this.emit('reconnecting');
      });

      this.subscriber.on('ready', () => {
        logger.info(`[${this.agentId}] Redis connection ready`);
        this.connected = true;
        this.reconnectAttempts = 0;
        this.emit('ready');
      });

      // Connect
      await Promise.all([
        this.subscriber.connect(),
        this.publisher.connect()
      ]);

      this.stats.connectedAt = new Date().toISOString();
      this.connected = true;

      logger.info(`[${this.agentId}] Connected to Redis`, { url: this.redisUrl });

      // Subscribe to channels
      await this.subscribeToChannels();

      // Send registration message
      await this.register();

      // Start heartbeat
      this.startHeartbeat();

      this.emit('connected');

      return true;
    } catch (error) {
      logger.error(`[${this.agentId}] Connection failed:`, error);
      this.connected = false;

      // Retry connection
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        logger.info(`[${this.agentId}] Retrying connection in ${delay}ms (attempt ${this.reconnectAttempts})`);
        setTimeout(() => this.connect(), delay);
      } else {
        logger.error(`[${this.agentId}] Max reconnection attempts reached`);
        this.emit('connectionFailed', error);
      }

      throw error;
    }
  }

  /**
   * Subscribe to relevant Redis channels
   */
  async subscribeToChannels() {
    try {
      // Subscribe to personal channel
      await this.subscriber.subscribe(
        `agent:${this.agentId}`,
        this.handleMessage.bind(this)
      );
      logger.info(`[${this.agentId}] Subscribed to personal channel`);

      // Subscribe to broadcast channel
      await this.subscriber.subscribe(
        'agent:broadcast',
        this.handleMessage.bind(this)
      );
      logger.info(`[${this.agentId}] Subscribed to broadcast`);

      // Subscribe to intent channels
      for (const intent of this.intents) {
        await this.subscriber.subscribe(
          `agent:intent:${intent}`,
          this.handleMessage.bind(this)
        );
        logger.info(`[${this.agentId}] Subscribed to intent: ${intent}`);
      }

      // Subscribe to channel-based groups
      for (const channel of this.channels) {
        if (channel !== 'default') {
          await this.subscriber.subscribe(
            `agent:channel:${channel}`,
            this.handleMessage.bind(this)
          );
          logger.info(`[${this.agentId}] Subscribed to channel: ${channel}`);
        }
      }
    } catch (error) {
      logger.error(`[${this.agentId}] Channel subscription failed:`, error);
      throw error;
    }
  }

  /**
   * Handle incoming message
   * @param {string} message - JSON message string
   */
  async handleMessage(message) {
    try {
      const envelope = JSON.parse(message);

      // Update stats
      this.stats.messagesReceived++;
      this.stats.lastSeen = new Date().toISOString();

      // Check if message is for this agent
      if (envelope.to && envelope.to !== this.agentId) {
        // Not for us, ignore
        return;
      }

      logger.debug(`[${this.agentId}] Received message`, {
        id: envelope.id,
        from: envelope.from,
        intent: envelope.intent
      });

      this.emit('message', envelope);

      // Call intent-specific handler if registered
      if (envelope.intent && this.intentHandlers.has(envelope.intent)) {
        const handler = this.intentHandlers.get(envelope.intent);
        await handler(envelope);
      }

      // Call all general handlers
      for (const handler of this.messageHandlers) {
        await handler(envelope);
      }

      // Call onMessage hook
      await this.onMessage(envelope);

    } catch (error) {
      logger.error(`[${this.agentId}] Message handling error:`, error);
      this.stats.errors++;
      this.emit('messageError', { message, error });
    }
  }

  /**
   * Send a message
   * @param {Object} options - Message options
   */
  async sendMessage(options = {}) {
    try {
      if (!this.connected) {
        throw new Error('Agent not connected to Redis');
      }

      const envelope = {
        id: options.id || randomUUID(),
        timestamp: options.timestamp || new Date().toISOString(),
        from: this.agentId,
        to: options.to || null,
        intent: options.intent || 'agent.message',
        taskId: options.taskId || null,
        channel: options.channel || 'default',
        priority: options.priority || 'normal',
        payload: options.payload || {},
        context: options.context || {},
        replyTo: options.replyTo || null,
        trace: options.trace || {}
      };

      const message = JSON.stringify(envelope);

      // Publish to appropriate channel
      if (envelope.to) {
        // Direct message
        await this.publisher.publish(`agent:${envelope.to}`, message);
        logger.debug(`[${this.agentId}] Sent message to ${envelope.to}`, { id: envelope.id });
      } else {
        // Broadcast
        await this.publisher.publish('agent:broadcast', message);
        logger.debug(`[${this.agentId}] Broadcast message`, { id: envelope.id });
      }

      // Also publish to intent channel if specified
      if (envelope.intent) {
        await this.publisher.publish(`agent:intent:${envelope.intent}`, message);
      }

      this.stats.messagesSent++;
      this.emit('messageSent', envelope);

      return envelope;
    } catch (error) {
      logger.error(`[${this.agentId}] Send message failed:`, error);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Send a message and wait for response (RPC pattern)
   * @param {Object} options - Message options
   * @param {number} timeout - Response timeout in ms
   */
  async sendRequest(options, timeout = 30000) {
    const replyChannel = `agent:${this.agentId}:rpc:${randomUUID()}`;

    return new Promise(async (resolve, reject) => {
      let timeoutId;
      let unsubscribe;

      // Set up timeout
      timeoutId = setTimeout(() => {
        if (unsubscribe) unsubscribe();
        reject(new Error('Request timeout'));
      }, timeout);

      // Subscribe to reply channel
      const handleReply = (message) => {
        try {
          const envelope = JSON.parse(message);
          clearTimeout(timeoutId);
          if (unsubscribe) unsubscribe();
          resolve(envelope);
        } catch (error) {
          clearTimeout(timeoutId);
          if (unsubscribe) unsubscribe();
          reject(error);
        }
      };

      // Subscribe
      await this.subscriber.subscribe(replyChannel, handleReply);

      // Store unsubscribe function
      unsubscribe = async () => {
        try {
          await this.subscriber.unsubscribe(replyChannel);
        } catch (err) {
          logger.error(`[${this.agentId}] Unsubscribe failed:`, err);
        }
      };

      // Send request with replyTo
      try {
        await this.sendMessage({
          ...options,
          replyTo: replyChannel
        });
      } catch (error) {
        clearTimeout(timeoutId);
        if (unsubscribe) unsubscribe();
        reject(error);
      }
    });
  }

  /**
   * Reply to a message
   * @param {Object} originalEnvelope - Original message envelope
   * @param {Object} payload - Response payload
   */
  async reply(originalEnvelope, payload) {
    const replyOptions = {
      to: originalEnvelope.replyTo || originalEnvelope.from,
      intent: 'agent.response',
      taskId: originalEnvelope.taskId,
      payload,
      context: {
        ...originalEnvelope.context,
        inReplyTo: originalEnvelope.id
      }
    };

    return await this.sendMessage(replyOptions);
  }

  /**
   * Register intent handler
   * @param {string} intent - Intent name
   * @param {Function} handler - Handler function
   */
  registerIntentHandler(intent, handler) {
    this.intentHandlers.set(intent, handler);
    logger.info(`[${this.agentId}] Registered handler for intent: ${intent}`);
  }

  /**
   * Register general message handler
   * @param {Function} handler - Handler function
   */
  registerMessageHandler(handler) {
    this.messageHandlers.push(handler);
    logger.info(`[${this.agentId}] Registered general message handler`);
  }

  /**
   * Override this method in subclasses
   * @param {Object} envelope - Message envelope
   */
  async onMessage(envelope) {
    // Default implementation - override in subclass
    logger.debug(`[${this.agentId}] Default onMessage handler`, { envelope });
  }

  /**
   * Send registration message to bridge
   */
  async register() {
    try {
      await this.sendMessage({
        to: null, // Broadcast
        intent: 'agent.register',
        payload: {
          agentId: this.agentId,
          role: this.role,
          intents: this.intents,
          labels: this.labels,
          tools: this.tools,
          channels: this.channels,
          timestamp: new Date().toISOString()
        }
      });

      logger.info(`[${this.agentId}] Registration sent`);
    } catch (error) {
      logger.error(`[${this.agentId}] Registration failed:`, error);
    }
  }

  /**
   * Start heartbeat timer
   */
  startHeartbeat() {
    this.heartbeatInterval = setInterval(async () => {
      if (this.connected) {
        try {
          await this.sendMessage({
            to: null,
            intent: 'agent.heartbeat',
            payload: {
              agentId: this.agentId,
              timestamp: new Date().toISOString(),
              stats: this.getStats()
            }
          });

          logger.debug(`[${this.agentId}] Heartbeat sent`);
        } catch (error) {
          logger.error(`[${this.agentId}] Heartbeat failed:`, error);
        }
      }
    }, 60000); // Every 60 seconds

    // Ensure timer doesn't prevent process exit
    this.heartbeatInterval.unref?.();
  }

  /**
   * Stop heartbeat timer
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Get agent statistics
   */
  getStats() {
    return {
      ...this.stats,
      uptime: this.stats.connectedAt
        ? Date.now() - new Date(this.stats.connectedAt).getTime()
        : 0
    };
  }

  /**
   * Disconnect from Redis
   */
  async disconnect() {
    try {
      this.stopHeartbeat();

      // Send unregister message
      await this.sendMessage({
        to: null,
        intent: 'agent.unregister',
        payload: {
          agentId: this.agentId,
          timestamp: new Date().toISOString()
        }
      });

      // Close connections
      if (this.subscriber) await this.subscriber.quit();
      if (this.publisher) await this.publisher.quit();

      this.connected = false;

      logger.info(`[${this.agentId}] Disconnected from Redis`);
      this.emit('disconnected');

    } catch (error) {
      logger.error(`[${this.agentId}] Disconnect error:`, error);
      throw error;
    }
  }
}

export default RedisAgentBase;
