import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { ResourceManager } from '../utils/resource-manager.js';
// Temporarily comment out SecureToolExecutor due to import chain issues
// import { SecureToolExecutor } from '../tools/secure-tool-executor.js';
import { ToolExecutor } from '../tools/tool-executor.js';

/**
 * Base Agent Class
 * Provides common functionality for all AI Bridge agents
 * - WebSocket connection management
 * - Automatic reconnection with exponential backoff
 * - Message handling and routing
 * - Health monitoring
 * - Error handling
 * - Resource lifecycle management (prevents memory leaks)
 * - Tool execution with security layers
 */
export class BaseAgent extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      bridgeUrl: config.bridgeUrl || process.env.BRIDGE_WS || 'ws://localhost:65028',
      clientId: config.clientId || 'unknown-agent',
      role: config.role || 'agent',
      labels: config.labels || [],
      tools: config.tools || [],
      intents: config.intents || [],
      reconnectDelay: config.reconnectDelay || 1000,
      maxReconnectDelay: config.maxReconnectDelay || 30000,
      maxReconnectAttempts: config.maxReconnectAttempts || Infinity,
      heartbeatInterval: config.heartbeatInterval || 30000,
      sessionSyncInterval: config.sessionSyncInterval || 30000, // Session state sync broadcasts
      // Tool execution permissions
      toolPermissions: config.toolPermissions || {
        file_read: true,
        file_write: false,
        command_exec: false,
        git_operations: false,
        code_analysis: true,
        test_execution: false,
      },
      ...config,
    };

    this.ws = null;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.sessionSyncTimer = null; // Session.sync broadcast timer
    this.isConnected = false;
    this.messageQueue = [];

    // Cycle 5 Optimization: Resource lifecycle management
    this.resources = new ResourceManager(this.config.clientId);

    // Initialize secure tool executor
    // Use regular ToolExecutor for now (SecureToolExecutor has import issues)
    this.toolExecutor = new ToolExecutor(this.config.clientId, this.config.toolPermissions);

    // Listen to tool execution events
    this.toolExecutor.on('toolExecuted', (event) => {
      this.emit('toolExecuted', event);
      logger.debug('Tool executed', event);
    });

    this.toolExecutor.on('securityViolation', (event) => {
      this.emit('securityViolation', event);
      logger.error('Security violation', event);
    });
  }

  /**
   * Connect to AI Bridge
   */
  async connect() {
    return new Promise((resolve, reject) => {
      logger.info(`🤖 ${this.config.clientId} connecting...`);

      try {
        this.ws = new WebSocket(this.config.bridgeUrl);

        this.ws.on('open', () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          logger.info(`✅ ${this.config.clientId} ready`);

          this.register();
          this.startHeartbeat();
          this.startSessionSync(); // Start session.sync broadcasts
          this.flushMessageQueue();

          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data) => {
          try {
            this.handleIncomingMessage(data);
          } catch (error) {
            logger.error(`Message handling error in ${this.config.clientId}`, {
              error: error.message,
              stack: error.stack,
            });
            this.emit('error', error);
          }
        });

        this.ws.on('close', () => {
          this.isConnected = false;
          this.stopHeartbeat();
          this.stopSessionSync(); // Stop session.sync broadcasts
          logger.warn(`🔌 ${this.config.clientId} disconnected`);

          this.emit('disconnected');
          this.handleReconnect();
        });

        this.ws.on('error', (error) => {
          logger.error(`WebSocket error in ${this.config.clientId}`, {
            error: error.message,
          });
          this.emit('error', error);

          if (!this.isConnected) {
            reject(error);
          }
        });
      } catch (error) {
        logger.error(`Connection failed for ${this.config.clientId}`, {
          error: error.message,
        });
        reject(error);
      }
    });
  }

  /**
   * Register agent with AI Bridge
   */
  register() {
    const registration = {
      type: 'register',
      clientId: this.config.clientId,
      role: this.config.role,
      labels: this.config.labels,
      tools: this.config.tools,
      intents: this.config.intents,
      timestamp: new Date().toISOString(),
    };

    this.send(registration);
  }

  /**
   * Handle incoming message from AI Bridge
   */
  handleIncomingMessage(data) {
    const envelope = JSON.parse(data.toString());

    logger.info(`\n📨 Processing request: ${envelope.intent || envelope.type}`);
    logger.info(`🔧 Processing: ${envelope.intent || envelope.type}`);

    // Route to specific handler
    if (envelope.type === 'ping') {
      this.handlePing(envelope);
    } else if (envelope.intent) {
      this.handleIntent(envelope);
    } else {
      this.handleMessage(envelope);
    }

    this.emit('message', envelope);
  }

  /**
   * Handle ping message
   */
  handlePing(envelope) {
    this.send({
      type: 'pong',
      to: envelope.from,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle intent-based message
   * Override this in subclasses
   */
  async handleIntent(envelope) {
    logger.warn(`Intent ${envelope.intent} not implemented in ${this.config.clientId}`);

    this.sendResponse(envelope, {
      status: 'not_implemented',
      error: `Intent ${envelope.intent} not supported`,
      agent: this.config.clientId,
    });
  }

  /**
   * Handle generic message
   * Override this in subclasses
   */
  async handleMessage(envelope) {
    logger.debug(`Message received in ${this.config.clientId}`, { envelope });
  }

  /**
   * Send message to AI Bridge
   */
  send(data) {
    const message = typeof data === 'string' ? data : JSON.stringify(data);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      logger.warn(`Message queued (not connected): ${this.config.clientId}`);
      this.messageQueue.push(message);
    }
  }

  /**
   * Send response to a request
   */
  sendResponse(originalEnvelope, payload) {
    this.send({
      type: 'response',
      to: originalEnvelope.from,
      intent: originalEnvelope.intent,
      correlationId: originalEnvelope.id,
      payload,
      timestamp: new Date().toISOString(),
      from: this.config.clientId,
    });
  }

  /**
   * Flush queued messages
   */
  flushMessageQueue() {
    while (this.messageQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const message = this.messageQueue.shift();
      this.ws.send(message);
    }
  }

  /**
   * Start heartbeat
   */
  startHeartbeat() {
    this.stopHeartbeat();

    this.heartbeatTimer = this.resources.setInterval(
      () => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.send({
            type: 'heartbeat',
            from: this.config.clientId,
            timestamp: new Date().toISOString(),
          });
        }
      },
      this.config.heartbeatInterval,
      'heartbeat'
    );
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      this.resources.clearTimer(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Start session.sync broadcasts for cross-session coordination
   * Broadcasts agent state at regular intervals so all sessions have shared visibility
   */
  startSessionSync() {
    this.stopSessionSync();

    this.sessionSyncTimer = this.resources.setInterval(
      () => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          const status = this.getStatus();
          const syncPayload = {
            who: this.config.clientId,
            what: 'session.sync.agent',
            when: new Date().toISOString(),
            agent: {
              clientId: this.config.clientId,
              role: this.config.role,
              connected: this.isConnected,
              intents: this.config.intents,
              labels: this.config.labels,
              toolCount: status.toolCount,
              permissions: status.permissions,
              queuedMessages: status.queuedMessages,
            },
          };

          // Add tool usage stats if available
          if (this.toolExecutor && typeof this.toolExecutor.getMetrics === 'function') {
            try {
              syncPayload.tools = this.toolExecutor.getMetrics();
            } catch (error) {
              logger.debug('Unable to get tool metrics', { error: error.message });
            }
          }

          this.send({
            type: 'broadcast',
            intent: 'session.sync',
            from: this.config.clientId,
            payload: syncPayload,
            timestamp: new Date().toISOString(),
          });

          logger.debug(`session.sync broadcast sent`, { clientId: this.config.clientId });
        }
      },
      this.config.sessionSyncInterval,
      'session-sync'
    );
  }

  /**
   * Stop session.sync broadcasts
   */
  stopSessionSync() {
    if (this.sessionSyncTimer) {
      this.resources.clearTimer(this.sessionSyncTimer);
      this.sessionSyncTimer = null;
    }
  }

  /**
   * Handle reconnection with exponential backoff
   */
  handleReconnect() {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      logger.error(`Max reconnect attempts reached for ${this.config.clientId}`);
      this.emit('max_reconnects');
      return;
    }

    this.reconnectAttempts++;

    const delay = Math.min(
      this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.config.maxReconnectDelay
    );

    logger.info(
      `🔌 Reconnecting ${this.config.clientId} in ${delay}ms (attempt ${this.reconnectAttempts})...`
    );

    this.reconnectTimer = this.resources.setTimeout(() => {
      this.connect().catch((error) => {
        logger.error(`Reconnect failed for ${this.config.clientId}`, { error: error.message });
      });
    }, delay);
  }

  /**
   * Disconnect from AI Bridge
   * Cycle 5: Now includes comprehensive resource cleanup
   */
  async disconnect() {
    logger.info(`Disconnecting ${this.config.clientId}...`);

    this.stopHeartbeat();
    this.stopSessionSync(); // Stop session.sync broadcasts

    if (this.reconnectTimer) {
      this.resources.clearTimer(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Cycle 5 Optimization: Clean up all managed resources
    const cleanupStats = this.resources.cleanup();
    logger.debug(`Resource cleanup for ${this.config.clientId}`, cleanupStats);

    this.isConnected = false;
    this.emit('disconnected');
  }

  /**
   * Execute a tool with full security
   * @param {string} toolName - Tool name
   * @param {Object} params - Tool parameters
   * @returns {Promise<Object>} Execution result
   */
  async executeTool(toolName, params) {
    return await this.toolExecutor.executeTool(toolName, params, {
      agentId: this.config.clientId,
      timestamp: Date.now(),
    });
  }

  /**
   * Get available tools
   * @returns {Array<Object>} Available tools with permission status
   */
  getAvailableTools() {
    return this.toolExecutor.getAvailableTools();
  }

  /**
   * Get security and execution stats
   * @returns {Object} Security statistics
   */
  getSecurityStats() {
    return this.toolExecutor.getSecurityStats();
  }

  /**
   * Get agent status
   */
  getStatus() {
    return {
      clientId: this.config.clientId,
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      queuedMessages: this.messageQueue.length,
      role: this.config.role,
      intents: this.config.intents,
      toolCount: this.toolExecutor ? this.toolExecutor.tools.size : 0,
      permissions: this.config.toolPermissions,
    };
  }
}

export default BaseAgent;
