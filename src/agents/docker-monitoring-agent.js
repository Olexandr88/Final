/**
 * Docker Monitoring Agent - AI Bridge integration for Docker events
 * @module docker-monitoring-agent
 */

import WebSocket from 'ws';
import { logger } from '../utils/logger.js';
import { DockerManager } from '../docker/docker-manager.js';

/**
 * Docker Monitoring Agent - Connects Docker Manager to AI Bridge
 */
export class DockerMonitoringAgent {
  constructor(options = {}) {
    this.agentId = options.agentId || 'docker-monitor-1';
    this.bridgeUrl = options.bridgeUrl || 'ws://localhost:65028';
    this.reconnectInterval = options.reconnectInterval || 5000; // 5 seconds
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;

    this.ws = null;
    this.dockerManager = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;

    // Capabilities
    this.capabilities = [
      'docker.container.list',
      'docker.container.start',
      'docker.container.stop',
      'docker.container.restart',
      'docker.container.remove',
      'docker.container.stats',
      'docker.container.logs',
      'docker.image.list',
      'docker.volume.list',
      'docker.network.list',
      'docker.system.info'
    ];
  }

  /**
   * Start the agent
   * @param {DockerManager} dockerManager - Docker Manager instance
   * @returns {Promise<void>}
   */
  async start(dockerManager) {
    if (!dockerManager) {
      throw new Error('DockerManager instance required');
    }

    this.dockerManager = dockerManager;

    // Subscribe to Docker Manager events
    this._subscribeToDockerEvents();

    // Connect to AI Bridge
    await this._connectToBridge();

    logger.info('Docker Monitoring Agent started', { agentId: this.agentId });
  }

  /**
   * Stop the agent
   * @returns {Promise<void>}
   */
  async stop() {
    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Unsubscribe from Docker events
    if (this.dockerManager) {
      this._unsubscribeFromDockerEvents();
    }

    // Close WebSocket connection
    if (this.ws) {
      this.ws.close(1000, 'Agent shutdown');
      this.ws = null;
    }

    this.isConnected = false;
    logger.info('Docker Monitoring Agent stopped', { agentId: this.agentId });
  }

  /**
   * Connect to AI Bridge
   * @private
   * @returns {Promise<void>}
   */
  async _connectToBridge() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.bridgeUrl);

        this.ws.on('open', () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;

          // Register with bridge
          this._register();

          logger.info('Connected to AI Bridge', { agentId: this.agentId, url: this.bridgeUrl });
          resolve();
        });

        this.ws.on('message', (data) => {
          this._handleBridgeMessage(data);
        });

        this.ws.on('close', () => {
          this.isConnected = false;
          logger.warn('Disconnected from AI Bridge', { agentId: this.agentId });

          // Attempt reconnection
          this._scheduleReconnect();
        });

        this.ws.on('error', (error) => {
          logger.error('AI Bridge connection error', { agentId: this.agentId, error: error.message });

          if (!this.isConnected) {
            reject(error);
          }
        });
      } catch (error) {
        logger.error('Failed to connect to AI Bridge', { error: error.message });
        reject(error);
      }
    });
  }

  /**
   * Schedule reconnection attempt
   * @private
   */
  _scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached', { agentId: this.agentId });
      return;
    }

    this.reconnectAttempts++;

    const delay = this.reconnectInterval * Math.min(this.reconnectAttempts, 5);

    logger.info('Scheduling reconnection', {
      agentId: this.agentId,
      attempt: this.reconnectAttempts,
      delay: `${delay}ms`
    });

    this.reconnectTimer = setTimeout(() => {
      this._connectToBridge().catch((error) => {
        logger.error('Reconnection failed', { error: error.message });
      });
    }, delay);
  }

  /**
   * Register agent with bridge
   * @private
   */
  _register() {
    this._sendToBridge({
      type: 'agent:register',
      data: {
        agentId: this.agentId,
        agentType: 'docker-monitor',
        capabilities: this.capabilities,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Handle message from AI Bridge
   * @private
   * @param {Buffer} data - Message data
   */
  async _handleBridgeMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      logger.debug('Received bridge message', { type: message.type });

      switch (message.type) {
        case 'bridge:registered':
          logger.info('Agent registered with bridge', { agentId: this.agentId });
          break;

        case 'docker:command':
          await this._handleDockerCommand(message.data);
          break;

        case 'docker:query':
          await this._handleDockerQuery(message.data);
          break;

        case 'ping':
          this._sendToBridge({ type: 'pong', timestamp: new Date().toISOString() });
          break;

        default:
          logger.debug('Unknown message type', { type: message.type });
      }
    } catch (error) {
      logger.error('Failed to handle bridge message', { error: error.message });
    }
  }

  /**
   * Handle Docker command from bridge
   * @private
   * @param {Object} data - Command data
   */
  async _handleDockerCommand(data) {
    const { action, containerId, options } = data;

    try {
      let result;

      switch (action) {
        case 'start':
          await this.dockerManager.startContainer(containerId);
          result = { success: true, action, containerId };
          break;

        case 'stop':
          await this.dockerManager.stopContainer(containerId);
          result = { success: true, action, containerId };
          break;

        case 'restart':
          await this.dockerManager.restartContainer(containerId);
          result = { success: true, action, containerId };
          break;

        case 'remove':
          await this.dockerManager.removeContainer(containerId, options);
          result = { success: true, action, containerId };
          break;

        default:
          result = { success: false, error: `Unknown action: ${action}` };
      }

      // Send result back to bridge
      this._sendToBridge({
        type: 'docker:command:result',
        data: result
      });
    } catch (error) {
      logger.error('Docker command failed', { action, containerId, error: error.message });

      this._sendToBridge({
        type: 'docker:command:result',
        data: {
          success: false,
          action,
          containerId,
          error: error.message
        }
      });
    }
  }

  /**
   * Handle Docker query from bridge
   * @private
   * @param {Object} data - Query data
   */
  async _handleDockerQuery(data) {
    const { query, params } = data;

    try {
      let result;

      switch (query) {
        case 'list-containers':
          result = this.dockerManager.getContainers();
          break;

        case 'get-container':
          result = await this.dockerManager.getContainer(params.containerId);
          break;

        case 'get-stats':
          result = this.dockerManager.getStats(params.containerId);
          break;

        case 'list-images':
          result = await this.dockerManager.listImages();
          break;

        case 'list-volumes':
          result = await this.dockerManager.listVolumes();
          break;

        case 'list-networks':
          result = await this.dockerManager.listNetworks();
          break;

        case 'system-info':
          result = await this.dockerManager.getSystemInfo();
          break;

        default:
          result = { error: `Unknown query: ${query}` };
      }

      // Send result back to bridge
      this._sendToBridge({
        type: 'docker:query:result',
        data: { query, result }
      });
    } catch (error) {
      logger.error('Docker query failed', { query, error: error.message });

      this._sendToBridge({
        type: 'docker:query:result',
        data: {
          query,
          result: null,
          error: error.message
        }
      });
    }
  }

  /**
   * Subscribe to Docker Manager events
   * @private
   */
  _subscribeToDockerEvents() {
    const events = [
      'manager:started',
      'manager:stopped',
      'container:discovered',
      'container:removed',
      'container:started',
      'container:stopped',
      'container:restarted',
      'container:paused',
      'container:unpaused'
    ];

    for (const event of events) {
      this.dockerManager.on(event, (data) => {
        this._broadcastDockerEvent(event, data);
      });
    }

    // Stats events (throttled)
    let lastStatsBroadcast = 0;
    const statsThrottle = 5000; // 5 seconds

    this.dockerManager.on('container:stats', (data) => {
      const now = Date.now();
      if (now - lastStatsBroadcast > statsThrottle) {
        this._broadcastDockerEvent('container:stats', data);
        lastStatsBroadcast = now;
      }
    });
  }

  /**
   * Unsubscribe from Docker Manager events
   * @private
   */
  _unsubscribeFromDockerEvents() {
    if (this.dockerManager) {
      this.dockerManager.removeAllListeners();
    }
  }

  /**
   * Broadcast Docker event to AI Bridge
   * @private
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  _broadcastDockerEvent(event, data) {
    if (!this.isConnected) {
      return;
    }

    this._sendToBridge({
      type: 'docker:event',
      data: {
        event,
        payload: data,
        agentId: this.agentId,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Send message to AI Bridge
   * @private
   * @param {Object} message - Message to send
   */
  _sendToBridge(message) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('Cannot send to bridge: not connected', { agentId: this.agentId });
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      logger.error('Failed to send to bridge', { agentId: this.agentId, error: error.message });
    }
  }

  /**
   * Get agent status
   * @returns {Object} Agent status
   */
  getStatus() {
    return {
      agentId: this.agentId,
      isConnected: this.isConnected,
      bridgeUrl: this.bridgeUrl,
      reconnectAttempts: this.reconnectAttempts,
      capabilities: this.capabilities.length,
      dockerManagerRunning: this.dockerManager?.isRunning || false
    };
  }
}

export default DockerMonitoringAgent;
