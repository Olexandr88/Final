/**
 * AI Bridge Adapter
 * Integrates marketplace with AI Bridge for agent notifications
 * @module marketplace/ai-bridge-adapter
 */

import WebSocket from 'ws';
import { logger } from '../utils/logger.js';

class AIBridgeAdapter {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.reconnectInterval = 5000;
    this.reconnectTimeout = null;
    this.wsUrl = `ws://localhost:65028`;
    this.clientId = 'marketplace-service';
  }

  /**
   * Connect to AI Bridge
   */
  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      logger.debug('AI Bridge already connected');
      return;
    }

    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on('open', () => {
        this.connected = true;
        logger.info('Connected to AI Bridge', { wsUrl: this.wsUrl });

        // Register with bridge
        this.send({
          type: 'register',
          data: {
            clientId: this.clientId,
            capabilities: ['marketplace.notifications'],
            version: '1.0.0',
          },
        });

        // Clear reconnect timeout
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = null;
        }
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          logger.error('Failed to parse AI Bridge message', { error: error.message });
        }
      });

      this.ws.on('close', () => {
        this.connected = false;
        logger.warn('Disconnected from AI Bridge');
        this.scheduleReconnect();
      });

      this.ws.on('error', (error) => {
        logger.error('AI Bridge connection error', { error: error.message });
      });
    } catch (error) {
      logger.error('Failed to connect to AI Bridge', { error: error.message });
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule reconnection attempt
   */
  scheduleReconnect() {
    if (this.reconnectTimeout) {
      return;
    }

    logger.info('Scheduling AI Bridge reconnect', {
      interval: this.reconnectInterval,
    });

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, this.reconnectInterval);
  }

  /**
   * Handle incoming message from AI Bridge
   * @param {Object} message - Message from bridge
   */
  handleMessage(message) {
    logger.debug('Received message from AI Bridge', { message });

    switch (message.type) {
      case 'register_ack':
        logger.info('Registration acknowledged by AI Bridge');
        break;
      case 'query':
        this.handleQuery(message);
        break;
      case 'command':
        this.handleCommand(message);
        break;
      default:
        logger.debug('Unknown message type', { type: message.type });
    }
  }

  /**
   * Handle query from AI Bridge
   * @param {Object} message - Query message
   */
  async handleQuery(message) {
    // Handle marketplace queries from agents
    // This could be extended to allow agents to query marketplace directly
    logger.debug('Handling AI Bridge query', { message });
  }

  /**
   * Handle command from AI Bridge
   * @param {Object} message - Command message
   */
  async handleCommand(message) {
    // Handle marketplace commands from agents
    // This could be extended to allow agents to control marketplace
    logger.debug('Handling AI Bridge command', { message });
  }

  /**
   * Send message to AI Bridge
   * @param {Object} message - Message to send
   */
  send(message) {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('AI Bridge not connected, cannot send message', { message });
      return false;
    }

    try {
      this.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      logger.error('Failed to send message to AI Bridge', {
        error: error.message,
        message,
      });
      return false;
    }
  }

  /**
   * Notify AI Bridge about marketplace event
   * @param {string} event - Event type
   * @param {Object} data - Event data
   */
  async notify(event, data) {
    if (!this.connected) {
      logger.debug('AI Bridge not connected, skipping notification', { event });
      return;
    }

    const message = {
      type: 'marketplace.event',
      data: {
        event,
        ...data,
        timestamp: new Date().toISOString(),
      },
      metadata: {
        source: this.clientId,
      },
    };

    const sent = this.send(message);

    if (sent) {
      logger.debug('Sent marketplace event to AI Bridge', { event, data });
    }
  }

  /**
   * Disconnect from AI Bridge
   */
  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
      logger.info('Disconnected from AI Bridge');
    }
  }

  /**
   * Check if connected
   * @returns {boolean} Connection status
   */
  isConnected() {
    return this.connected && this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
const bridgeAdapter = new AIBridgeAdapter();

// Auto-connect on module load
bridgeAdapter.connect();

/**
 * Notify AI Bridge about marketplace event
 * @param {string} event - Event type
 * @param {Object} data - Event data
 */
export async function notifyAIBridge(event, data) {
  return bridgeAdapter.notify(event, data);
}

export default bridgeAdapter;
