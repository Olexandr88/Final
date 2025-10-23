/**
 * Docker Events Emitter - WebSocket server for real-time Docker events
 * @module docker-events-emitter
 */

import { WebSocketServer } from 'ws';
import { logger } from '../utils/logger.js';

/**
 * Docker Events Emitter class - Broadcasts Docker events via WebSocket
 */
export class DockerEventsEmitter {
  constructor(dockerManager, options = {}) {
    this.manager = dockerManager;
    this.port = options.port || 65030;
    this.heartbeatInterval = options.heartbeatInterval || 30000; // 30 seconds

    this.wss = null;
    this.clients = new Set();
    this.heartbeatTimer = null;
    this.isRunning = false;

    // Bind methods
    this._handleConnection = this._handleConnection.bind(this);
    this._handleManagerEvent = this._handleManagerEvent.bind(this);
    this._sendHeartbeat = this._sendHeartbeat.bind(this);
  }

  /**
   * Start WebSocket server
   * @param {number} [port] - Override default port
   * @returns {Promise<void>}
   */
  async start(port) {
    if (this.isRunning) {
      logger.warn('Docker Events Emitter already running');
      return;
    }

    const wsPort = port || this.port;

    try {
      // Create WebSocket server
      this.wss = new WebSocketServer({ port: wsPort });

      // Handle connections
      this.wss.on('connection', this._handleConnection);

      // Handle server errors
      this.wss.on('error', (error) => {
        logger.error('WebSocket server error', { error: error.message });
      });

      // Subscribe to Docker Manager events
      this._subscribeToManagerEvents();

      // Start heartbeat
      this.heartbeatTimer = setInterval(this._sendHeartbeat, this.heartbeatInterval);

      this.isRunning = true;
      logger.info('Docker Events Emitter started', { port: wsPort });
    } catch (error) {
      logger.error('Failed to start Docker Events Emitter', { error: error.message });
      throw error;
    }
  }

  /**
   * Stop WebSocket server
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isRunning) {
      logger.warn('Docker Events Emitter not running');
      return;
    }

    try {
      // Clear heartbeat timer
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }

      // Unsubscribe from Docker Manager events
      this._unsubscribeFromManagerEvents();

      // Close all client connections
      for (const client of this.clients) {
        client.close(1000, 'Server shutdown');
      }
      this.clients.clear();

      // Close WebSocket server
      if (this.wss) {
        await new Promise((resolve) => {
          this.wss.close(() => resolve());
        });
        this.wss = null;
      }

      this.isRunning = false;
      logger.info('Docker Events Emitter stopped');
    } catch (error) {
      logger.error('Failed to stop Docker Events Emitter', { error: error.message });
      throw error;
    }
  }

  /**
   * Handle new WebSocket connection
   * @private
   * @param {WebSocket} ws - WebSocket client
   */
  _handleConnection(ws) {
    logger.info('WebSocket client connected', { total: this.clients.size + 1 });

    // Add to clients set
    this.clients.add(ws);

    // Send initial state
    this._sendInitialState(ws);

    // Handle client messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this._handleClientMessage(ws, message);
      } catch (error) {
        logger.error('Failed to parse client message', { error: error.message });
      }
    });

    // Handle client disconnect
    ws.on('close', () => {
      this.clients.delete(ws);
      logger.info('WebSocket client disconnected', { total: this.clients.size });
    });

    // Handle client errors
    ws.on('error', (error) => {
      logger.error('WebSocket client error', { error: error.message });
      this.clients.delete(ws);
    });

    // Setup pong handler for heartbeat
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
  }

  /**
   * Send initial state to newly connected client
   * @private
   * @param {WebSocket} ws - WebSocket client
   */
  _sendInitialState(ws) {
    const containers = this.manager.getContainers();

    this._sendToClient(ws, {
      type: 'initial:state',
      data: {
        containers,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Handle message from client
   * @private
   * @param {WebSocket} ws - WebSocket client
   * @param {Object} message - Client message
   */
  _handleClientMessage(ws, message) {
    logger.debug('Received client message', { type: message.type });

    switch (message.type) {
      case 'ping':
        this._sendToClient(ws, { type: 'pong', timestamp: new Date().toISOString() });
        break;

      case 'subscribe':
        // Client subscription handled automatically
        this._sendToClient(ws, { type: 'subscribed', timestamp: new Date().toISOString() });
        break;

      case 'request:containers':
        const containers = this.manager.getContainers();
        this._sendToClient(ws, { type: 'containers:list', data: containers });
        break;

      case 'request:stats':
        if (message.containerId) {
          const stats = this.manager.getStats(message.containerId);
          this._sendToClient(ws, {
            type: 'container:stats',
            data: { id: message.containerId, stats }
          });
        }
        break;

      default:
        logger.warn('Unknown message type', { type: message.type });
    }
  }

  /**
   * Subscribe to Docker Manager events
   * @private
   */
  _subscribeToManagerEvents() {
    const events = [
      'manager:started',
      'manager:stopped',
      'container:discovered',
      'container:removed',
      'container:started',
      'container:stopped',
      'container:restarted',
      'container:paused',
      'container:unpaused',
      'container:stats'
    ];

    for (const event of events) {
      this.manager.on(event, this._handleManagerEvent);
    }
  }

  /**
   * Unsubscribe from Docker Manager events
   * @private
   */
  _unsubscribeFromManagerEvents() {
    const events = [
      'manager:started',
      'manager:stopped',
      'container:discovered',
      'container:removed',
      'container:started',
      'container:stopped',
      'container:restarted',
      'container:paused',
      'container:unpaused',
      'container:stats'
    ];

    for (const event of events) {
      this.manager.removeListener(event, this._handleManagerEvent);
    }
  }

  /**
   * Handle event from Docker Manager
   * @private
   * @param {*} data - Event data
   */
  _handleManagerEvent(data) {
    // The event name is available through the listener context
    // We'll broadcast to all clients
    const event = this.manager.eventNames().find(e =>
      this.manager.listeners(e).includes(this._handleManagerEvent)
    );

    this.broadcast({
      type: event || 'docker:event',
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Broadcast message to all connected clients
   * @param {Object} message - Message to broadcast
   */
  broadcast(message) {
    const payload = JSON.stringify(message);
    let successCount = 0;
    let failCount = 0;

    for (const client of this.clients) {
      if (client.readyState === 1) { // WebSocket.OPEN
        try {
          client.send(payload);
          successCount++;
        } catch (error) {
          logger.error('Failed to send to client', { error: error.message });
          failCount++;
        }
      }
    }

    if (failCount > 0) {
      logger.warn('Broadcast partial failure', { success: successCount, failed: failCount });
    }
  }

  /**
   * Send message to specific client
   * @private
   * @param {WebSocket} ws - WebSocket client
   * @param {Object} message - Message to send
   */
  _sendToClient(ws, message) {
    if (ws.readyState === 1) { // WebSocket.OPEN
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        logger.error('Failed to send to client', { error: error.message });
      }
    }
  }

  /**
   * Send heartbeat to all clients
   * @private
   */
  _sendHeartbeat() {
    const deadClients = new Set();

    for (const client of this.clients) {
      if (!client.isAlive) {
        deadClients.add(client);
        client.terminate();
      } else {
        client.isAlive = false;
        client.ping();
      }
    }

    // Remove dead clients
    for (const client of deadClients) {
      this.clients.delete(client);
    }

    if (deadClients.size > 0) {
      logger.info('Removed dead clients', { count: deadClients.size, remaining: this.clients.size });
    }
  }

  /**
   * Get connected clients count
   * @returns {number} Number of connected clients
   */
  getClientCount() {
    return this.clients.size;
  }
}

export default DockerEventsEmitter;
