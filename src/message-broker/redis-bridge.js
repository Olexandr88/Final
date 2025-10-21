#!/usr/bin/env node
/**
 * Redis-based Message Broker Integration for AI Bridge
 * Provides pub/sub, stream persistence, and dead letter queue
 */

import { createClient } from 'redis';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';

export class RedisBridge extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      redisUrl: config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
      streamName: config.streamName || 'messages:all',
      dlqStream: config.dlqStream || 'messages:dlq',
      consumerGroup: config.consumerGroup || 'bridge-consumers',
      consumerId: config.consumerId || `bridge-${process.pid}`,
      maxStreamLength: config.maxStreamLength || 10000,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 5000,
      batchSize: config.batchSize || 10,
      blockTime: config.blockTime || 5000,
      ...config
    };

    // Redis clients (separate for pub/sub/consume)
    this.publisher = null;
    this.subscriber = null;
    this.consumer = null;

    // Statistics
    this.stats = {
      messagesPublished: 0,
      messagesConsumed: 0,
      messagesPersisted: 0,
      dlqMessages: 0,
      errors: 0,
      startTime: Date.now()
    };

    // Channel subscriptions
    this.subscriptions = new Map();

    // Retry tracking
    this.retryAttempts = new Map();

    logger.info('[Redis Bridge] Initialized', { config: this.config });
  }

  /**
   * Initialize Redis connections
   */
  async initialize() {
    try {
      // Create Redis clients
      this.publisher = createClient({ url: this.config.redisUrl });
      this.subscriber = this.publisher.duplicate();
      this.consumer = this.publisher.duplicate();

      // Error handlers
      this.publisher.on('error', (err) => {
        logger.error('[Redis Bridge] Publisher error:', err);
        this.stats.errors++;
        this.emit('error', { source: 'publisher', error: err });
      });

      this.subscriber.on('error', (err) => {
        logger.error('[Redis Bridge] Subscriber error:', err);
        this.stats.errors++;
        this.emit('error', { source: 'subscriber', error: err });
      });

      this.consumer.on('error', (err) => {
        logger.error('[Redis Bridge] Consumer error:', err);
        this.stats.errors++;
        this.emit('error', { source: 'consumer', error: err });
      });

      // Connect all clients
      await Promise.all([
        this.publisher.connect(),
        this.subscriber.connect(),
        this.consumer.connect()
      ]);

      logger.info('[Redis Bridge] Connected to Redis');

      // Initialize consumer group
      await this.initializeConsumerGroup();

      // Start consuming from stream
      this.startStreamConsumer();

      this.emit('ready');
      return true;
    } catch (error) {
      logger.error('[Redis Bridge] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Create consumer group if not exists
   */
  async initializeConsumerGroup() {
    try {
      await this.consumer.xGroupCreate(
        this.config.streamName,
        this.config.consumerGroup,
        '0',
        { MKSTREAM: true }
      );
      logger.info('[Redis Bridge] Consumer group created', {
        stream: this.config.streamName,
        group: this.config.consumerGroup
      });
    } catch (error) {
      if (error.message.includes('BUSYGROUP')) {
        logger.info('[Redis Bridge] Consumer group already exists');
      } else {
        throw error;
      }
    }
  }

  /**
   * Publish message to Redis channels
   * @param {Object} envelope - Message envelope
   */
  async publishMessage(envelope) {
    try {
      const message = JSON.stringify(envelope);

      // Direct message to specific agent
      if (envelope.to) {
        await this.publisher.publish(`agent:${envelope.to}`, message);
        logger.debug('[Redis Bridge] Published to agent channel', {
          to: envelope.to,
          id: envelope.id
        });
      } else {
        // Broadcast to all agents
        await this.publisher.publish('agent:broadcast', message);
        logger.debug('[Redis Bridge] Published to broadcast', { id: envelope.id });
      }

      // Intent-based routing
      if (envelope.intent) {
        await this.publisher.publish(`agent:intent:${envelope.intent}`, message);
        logger.debug('[Redis Bridge] Published to intent channel', {
          intent: envelope.intent,
          id: envelope.id
        });
      }

      // Channel-based routing
      if (envelope.channel && envelope.channel !== 'default') {
        await this.publisher.publish(`agent:channel:${envelope.channel}`, message);
      }

      this.stats.messagesPublished++;
      this.emit('messagePublished', envelope);

      return envelope.id;
    } catch (error) {
      logger.error('[Redis Bridge] Publish failed:', error);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Persist message to Redis stream
   * @param {Object} envelope - Message envelope
   */
  async persistMessage(envelope) {
    try {
      // Add to main message stream
      const streamId = await this.publisher.xAdd(
        this.config.streamName,
        '*',
        { data: JSON.stringify(envelope) },
        {
          TRIM: {
            strategy: 'MAXLEN',
            threshold: this.config.maxStreamLength,
            strategyModifier: '~'
          }
        }
      );

      // Add to task-specific stream if taskId present
      if (envelope.taskId) {
        await this.publisher.xAdd(
          `messages:task:${envelope.taskId}`,
          '*',
          { data: JSON.stringify(envelope) },
          { TRIM: { strategy: 'MAXLEN', threshold: 1000 } }
        );
      }

      // Add to agent-specific stream for inbox
      if (envelope.to) {
        await this.publisher.xAdd(
          `messages:agent:${envelope.to}`,
          '*',
          { data: JSON.stringify(envelope) },
          { TRIM: { strategy: 'MAXLEN', threshold: 500 } }
        );
      }

      this.stats.messagesPersisted++;
      this.emit('messagePersisted', { envelope, streamId });

      logger.debug('[Redis Bridge] Message persisted', {
        id: envelope.id,
        streamId
      });

      return streamId;
    } catch (error) {
      logger.error('[Redis Bridge] Persist failed:', error);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Subscribe to a Redis channel
   * @param {string} channel - Channel name
   * @param {Function} handler - Message handler function
   */
  async subscribe(channel, handler) {
    try {
      await this.subscriber.subscribe(channel, (message) => {
        try {
          const envelope = JSON.parse(message);
          handler(envelope);
        } catch (error) {
          logger.error('[Redis Bridge] Message parse error:', error);
        }
      });

      this.subscriptions.set(channel, handler);
      logger.info('[Redis Bridge] Subscribed to channel', { channel });
    } catch (error) {
      logger.error('[Redis Bridge] Subscribe failed:', error);
      throw error;
    }
  }

  /**
   * Unsubscribe from a Redis channel
   * @param {string} channel - Channel name
   */
  async unsubscribe(channel) {
    try {
      await this.subscriber.unsubscribe(channel);
      this.subscriptions.delete(channel);
      logger.info('[Redis Bridge] Unsubscribed from channel', { channel });
    } catch (error) {
      logger.error('[Redis Bridge] Unsubscribe failed:', error);
      throw error;
    }
  }

  /**
   * Start consuming messages from Redis stream
   */
  startStreamConsumer() {
    const consumeLoop = async () => {
      try {
        // Read messages from stream
        const messages = await this.consumer.xReadGroup(
          this.config.consumerGroup,
          this.config.consumerId,
          [{ key: this.config.streamName, id: '>' }],
          {
            COUNT: this.config.batchSize,
            BLOCK: this.config.blockTime
          }
        );

        if (messages && messages.length > 0) {
          for (const { messages: streamMessages } of messages) {
            for (const { id: messageId, message } of streamMessages) {
              await this.processStreamMessage(messageId, message);
            }
          }
        }

        // Process pending messages (unacknowledged)
        await this.processPendingMessages();

      } catch (error) {
        logger.error('[Redis Bridge] Stream consumer error:', error);
        this.stats.errors++;
        this.emit('error', { source: 'consumer', error });
      }

      // Continue consuming
      setImmediate(consumeLoop);
    };

    consumeLoop();
    logger.info('[Redis Bridge] Stream consumer started');
  }

  /**
   * Process a single stream message
   * @param {string} messageId - Redis stream message ID
   * @param {Object} message - Message data
   */
  async processStreamMessage(messageId, message) {
    try {
      const envelope = JSON.parse(message.data);

      this.stats.messagesConsumed++;
      this.emit('messageConsumed', { messageId, envelope });

      // Acknowledge message
      await this.consumer.xAck(
        this.config.streamName,
        this.config.consumerGroup,
        messageId
      );

      logger.debug('[Redis Bridge] Message processed and acknowledged', {
        messageId,
        envelopeId: envelope.id
      });

    } catch (error) {
      logger.error('[Redis Bridge] Message processing failed:', {
        messageId,
        error: error.message
      });

      // Track retry attempts
      const attempts = this.retryAttempts.get(messageId) || 0;
      this.retryAttempts.set(messageId, attempts + 1);

      if (attempts + 1 >= this.config.maxRetries) {
        // Move to DLQ after max retries
        await this.moveToDLQ(messageId, message, error, attempts + 1);
        await this.consumer.xAck(
          this.config.streamName,
          this.config.consumerGroup,
          messageId
        );
        this.retryAttempts.delete(messageId);
      } else {
        // Will be retried in next pending check
        logger.warn('[Redis Bridge] Message will be retried', {
          messageId,
          attempts: attempts + 1,
          maxRetries: this.config.maxRetries
        });
      }
    }
  }

  /**
   * Process pending (unacknowledged) messages
   */
  async processPendingMessages() {
    try {
      const pending = await this.consumer.xPending(
        this.config.streamName,
        this.config.consumerGroup,
        '-',
        '+',
        10
      );

      if (pending && pending.messages && pending.messages.length > 0) {
        for (const { id: messageId, consumer: consumerId, millisecondsSinceLastDelivery } of pending.messages) {
          // Only process if message is old enough (retry delay)
          if (millisecondsSinceLastDelivery > this.config.retryDelay) {
            // Claim the message
            const claimed = await this.consumer.xClaim(
              this.config.streamName,
              this.config.consumerGroup,
              this.config.consumerId,
              this.config.retryDelay,
              [messageId]
            );

            if (claimed && claimed.messages && claimed.messages.length > 0) {
              const { id, message } = claimed.messages[0];
              await this.processStreamMessage(id, message);
            }
          }
        }
      }
    } catch (error) {
      logger.error('[Redis Bridge] Pending messages processing failed:', error);
    }
  }

  /**
   * Move failed message to dead letter queue
   * @param {string} messageId - Redis stream message ID
   * @param {Object} message - Original message
   * @param {Error} error - Error that caused failure
   * @param {number} attempts - Number of retry attempts
   */
  async moveToDLQ(messageId, message, error, attempts) {
    try {
      const dlqEntry = {
        originalMessageId: messageId,
        originalMessage: message.data,
        error: error.message,
        errorStack: error.stack,
        attempts: attempts.toString(),
        timestamp: new Date().toISOString(),
        consumerGroup: this.config.consumerGroup,
        consumerId: this.config.consumerId
      };

      await this.publisher.xAdd(
        this.config.dlqStream,
        '*',
        dlqEntry
      );

      this.stats.dlqMessages++;
      this.emit('dlqMessage', dlqEntry);

      logger.warn('[Redis Bridge] Message moved to DLQ', {
        messageId,
        error: error.message,
        attempts
      });
    } catch (dlqError) {
      logger.error('[Redis Bridge] Failed to move message to DLQ:', dlqError);
    }
  }

  /**
   * Get message history from stream
   * @param {Object} options - Query options
   */
  async getHistory(options = {}) {
    try {
      const {
        stream = this.config.streamName,
        limit = 100,
        start = '-',
        end = '+'
      } = options;

      const messages = await this.consumer.xRange(
        stream,
        start,
        end,
        { COUNT: limit }
      );

      return messages.map(({ id, message }) => ({
        streamId: id,
        ...JSON.parse(message.data)
      }));
    } catch (error) {
      logger.error('[Redis Bridge] Get history failed:', error);
      throw error;
    }
  }

  /**
   * Get DLQ messages
   * @param {number} limit - Maximum messages to return
   */
  async getDLQMessages(limit = 100) {
    try {
      const messages = await this.consumer.xRange(
        this.config.dlqStream,
        '-',
        '+',
        { COUNT: limit }
      );

      return messages.map(({ id, message }) => ({
        dlqId: id,
        originalMessageId: message.originalMessageId,
        originalMessage: JSON.parse(message.originalMessage),
        error: message.error,
        attempts: parseInt(message.attempts, 10),
        timestamp: message.timestamp
      }));
    } catch (error) {
      logger.error('[Redis Bridge] Get DLQ messages failed:', error);
      throw error;
    }
  }

  /**
   * Retry a message from DLQ
   * @param {string} dlqId - DLQ message ID
   */
  async retryDLQMessage(dlqId) {
    try {
      // Get message from DLQ
      const [dlqMessage] = await this.consumer.xRange(
        this.config.dlqStream,
        dlqId,
        dlqId
      );

      if (!dlqMessage) {
        throw new Error(`DLQ message not found: ${dlqId}`);
      }

      // Parse and republish
      const envelope = JSON.parse(dlqMessage.message.originalMessage);
      await this.publishMessage(envelope);
      await this.persistMessage(envelope);

      // Remove from DLQ
      await this.consumer.xDel(this.config.dlqStream, dlqId);

      logger.info('[Redis Bridge] DLQ message retried', { dlqId, envelopeId: envelope.id });

      return envelope.id;
    } catch (error) {
      logger.error('[Redis Bridge] DLQ retry failed:', error);
      throw error;
    }
  }

  /**
   * Delete message from DLQ
   * @param {string} dlqId - DLQ message ID
   */
  async deleteDLQMessage(dlqId) {
    try {
      await this.consumer.xDel(this.config.dlqStream, dlqId);
      logger.info('[Redis Bridge] DLQ message deleted', { dlqId });
    } catch (error) {
      logger.error('[Redis Bridge] DLQ delete failed:', error);
      throw error;
    }
  }

  /**
   * Get consumer group lag (pending messages)
   */
  async getConsumerLag() {
    try {
      const pending = await this.consumer.xPending(
        this.config.streamName,
        this.config.consumerGroup
      );

      return {
        pendingCount: pending.pending,
        consumers: pending.consumers || []
      };
    } catch (error) {
      logger.error('[Redis Bridge] Get consumer lag failed:', error);
      throw error;
    }
  }

  /**
   * Get bridge statistics
   */
  getStats() {
    const uptime = (Date.now() - this.stats.startTime) / 1000;

    return {
      ...this.stats,
      uptime,
      messagesPerSecond: this.stats.messagesPublished / uptime,
      subscriptions: this.subscriptions.size,
      retryTracking: this.retryAttempts.size
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const ping = await this.publisher.ping();
      const lag = await this.getConsumerLag();
      const dlqInfo = await this.consumer.xLen(this.config.dlqStream);

      return {
        status: 'healthy',
        redis: {
          connected: ping === 'PONG',
          url: this.config.redisUrl
        },
        stream: {
          name: this.config.streamName,
          consumerGroup: this.config.consumerGroup,
          lag: lag.pendingCount
        },
        dlq: {
          depth: dlqInfo
        },
        stats: this.getStats()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  /**
   * Close all Redis connections
   */
  async close() {
    try {
      if (this.publisher) await this.publisher.quit();
      if (this.subscriber) await this.subscriber.quit();
      if (this.consumer) await this.consumer.quit();

      logger.info('[Redis Bridge] Closed all connections');
    } catch (error) {
      logger.error('[Redis Bridge] Close failed:', error);
      throw error;
    }
  }
}

export default RedisBridge;
