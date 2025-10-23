/**
 * Ably Transport Layer for MCP 2025 Streamable HTTP
 * Implements modern streamable HTTP transport alongside existing WebSocket
 * @module ably-transport
 */

import Ably from 'ably';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

export class AblyTransport extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      apiKey: process.env.ABLY_API_KEY,
      channelPrefix: config.channelPrefix || 'mcp-orchestrator',
      autoReconnect: config.autoReconnect !== false,
      ...config
    };

    this.client = null;
    this.channels = new Map();
    this.connected = false;
  }

  /**
   * Initialize Ably client and connect
   */
  async connect() {
    try {
      this.client = new Ably.Realtime({
        key: this.config.apiKey,
        echoMessages: false,
        autoConnect: this.config.autoReconnect
      });

      return new Promise((resolve, reject) => {
        this.client.connection.once('connected', () => {
          this.connected = true;
          logger.info('Ably transport connected', { clientId: this.client.auth.clientId });
          this.emit('connected');
          resolve();
        });

        this.client.connection.once('failed', (err) => {
          logger.error('Ably connection failed', { error: err.message });
          reject(err);
        });

        // Connection state monitoring
        this.client.connection.on('suspended', () => {
          logger.warn('Ably connection suspended');
          this.emit('suspended');
        });

        this.client.connection.on('closed', () => {
          this.connected = false;
          logger.info('Ably connection closed');
          this.emit('disconnected');
        });
      });
    } catch (error) {
      logger.error('Failed to initialize Ably transport', { error: error.message });
      throw error;
    }
  }

  /**
   * Get or create a channel
   */
  getChannel(channelName) {
    const fullChannelName = `${this.config.channelPrefix}:${channelName}`;

    if (!this.channels.has(fullChannelName)) {
      const channel = this.client.channels.get(fullChannelName);
      this.channels.set(fullChannelName, channel);

      // Attach event listeners
      channel.on('attached', () => {
        logger.debug('Channel attached', { channel: fullChannelName });
      });

      channel.on('detached', () => {
        logger.debug('Channel detached', { channel: fullChannelName });
      });
    }

    return this.channels.get(fullChannelName);
  }

  /**
   * Publish message to channel (MCP envelope)
   */
  async publish(channelName, eventType, data, metadata = {}) {
    try {
      const channel = this.getChannel(channelName);

      const envelope = {
        type: eventType,
        data,
        metadata: {
          ...metadata,
          timestamp: Date.now(),
          version: '2.0',
          transport: 'ably-http'
        }
      };

      await channel.publish(eventType, envelope);
      logger.debug('Message published', { channel: channelName, type: eventType });

      return envelope;
    } catch (error) {
      logger.error('Failed to publish message', {
        channel: channelName,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Subscribe to channel events
   */
  subscribe(channelName, eventType, callback) {
    const channel = this.getChannel(channelName);

    const handler = (message) => {
      logger.debug('Message received', {
        channel: channelName,
        type: message.name
      });
      callback(message.data, message);
    };

    if (eventType) {
      channel.subscribe(eventType, handler);
    } else {
      channel.subscribe(handler);
    }

    return () => channel.unsubscribe(eventType, handler);
  }

  /**
   * Create HTTP SSE stream endpoint (for clients)
   */
  createStreamEndpoint(channelName) {
    const channel = this.getChannel(channelName);

    // Return Express middleware
    return (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const messageHandler = (message) => {
        const data = JSON.stringify({
          id: message.id,
          name: message.name,
          data: message.data,
          timestamp: message.timestamp
        });
        res.write(`data: ${data}\n\n`);
      };

      channel.subscribe(messageHandler);

      req.on('close', () => {
        channel.unsubscribe(messageHandler);
        res.end();
      });

      // Send initial connection message
      res.write(`data: ${JSON.stringify({ type: 'connected', channel: channelName })}\n\n`);
    };
  }

  /**
   * Graceful shutdown
   */
  async disconnect() {
    try {
      for (const [name, channel] of this.channels) {
        await channel.detach();
        logger.debug('Channel detached during shutdown', { channel: name });
      }

      this.channels.clear();

      if (this.client) {
        this.client.close();
        logger.info('Ably transport disconnected');
      }

      this.connected = false;
      this.emit('disconnected');
    } catch (error) {
      logger.error('Error during Ably disconnect', { error: error.message });
      throw error;
    }
  }

  /**
   * Health check
   */
  getHealth() {
    return {
      connected: this.connected,
      state: this.client?.connection.state || 'disconnected',
      channels: Array.from(this.channels.keys()),
      errorInfo: this.client?.connection.errorReason || null
    };
  }
}

export default AblyTransport;
