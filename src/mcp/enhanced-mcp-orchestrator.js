/**
 * Enhanced MCP Agent Orchestrator v2.0
 * Implements 2025 MCP best practices with Ably transport, approval workflows,
 * semantic versioning, and Datadog monitoring
 * @module enhanced-mcp-orchestrator
 */

import { EventEmitter } from 'events';
import AblyTransport from './ably-transport.js';
import { ApprovalWorkflow } from '../agents/approval-workflow-agent.js';
import { AgentVersionManager } from '../versioning/agent-version-manager.js';
import { DatadogIntegration } from '../monitoring/datadog-integration.js';
import { logger } from '../utils/logger.js';
import WebSocket from 'ws';
import express from 'express';

/**
 * Enhanced MCP Orchestrator coordinating multiple agents with modern transport
 */
export class EnhancedMCPOrchestrator extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      enableAbly: config.enableAbly !== false,
      enableApprovals: config.enableApprovals !== false,
      enableVersioning: config.enableVersioning !== false,
      enableDatadog: config.enableDatadog !== false,
      wsPort: config.wsPort || 65028,
      httpPort: config.httpPort || 65029,
      minAgentVersion: config.minAgentVersion || '1.0.0',
      ablyChannelPrefix: config.ablyChannelPrefix || 'mcp-orchestrator',
      ...config
    };

    // Core components
    this.agents = new Map();
    this.messageQueue = [];
    this.metrics = {
      messagesProcessed: 0,
      approvalsRequested: 0,
      approvalsGranted: 0,
      approvalsDenied: 0
    };

    // Transport layers
    this.ablyTransport = null;
    this.wsServer = null;
    this.httpServer = null;
    this.wsConnections = new Set();

    // Subsystems
    this.approvalWorkflow = null;
    this.versionManager = null;
    this.datadogIntegration = null;

    this.initialized = false;
  }

  /**
   * Initialize all subsystems
   */
  async initialize() {
    try {
      logger.info('Initializing Enhanced MCP Orchestrator v2.0');

      // Initialize Ably transport if enabled
      if (this.config.enableAbly) {
        try {
          this.ablyTransport = new AblyTransport({
            channelPrefix: this.config.ablyChannelPrefix
          });
          await this.ablyTransport.connect();
          logger.info('Ably transport initialized');
        } catch (error) {
          logger.warn('Ably transport failed to initialize, continuing with WebSocket only', {
            error: error.message
          });
          this.config.enableAbly = false;
        }
      }

      // Initialize WebSocket fallback
      await this.initializeWebSocket();

      // Initialize HTTP server for health and SSE endpoints
      await this.initializeHTTP();

      // Initialize approval workflow if enabled
      if (this.config.enableApprovals) {
        this.approvalWorkflow = new ApprovalWorkflow({
          transport: this.ablyTransport || this,
          notificationChannel: 'approvals',
          timeout: 60000 // 1 minute timeout
        });
        logger.info('Approval workflow initialized');
      }

      // Initialize version manager if enabled
      if (this.config.enableVersioning) {
        this.versionManager = new AgentVersionManager({
          minVersion: this.config.minAgentVersion
        });
        logger.info('Agent version manager initialized');
      }

      // Initialize Datadog integration if enabled
      if (this.config.enableDatadog) {
        this.datadogIntegration = new DatadogIntegration({
          prefix: 'mcp.orchestrator.'
        });
        logger.info('Datadog integration initialized');
        this.startMetricsPublishing();
      }

      this.initialized = true;
      this.emit('initialized');
      logger.info('Enhanced MCP Orchestrator initialized successfully', {
        features: {
          ably: this.config.enableAbly,
          approvals: this.config.enableApprovals,
          versioning: this.config.enableVersioning,
          datadog: this.config.enableDatadog
        }
      });

      return true;
    } catch (error) {
      logger.error('Failed to initialize Enhanced MCP Orchestrator', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Initialize WebSocket server for backward compatibility
   */
  async initializeWebSocket() {
    return new Promise((resolve, reject) => {
      try {
        this.wsServer = new WebSocket.Server({ port: this.config.wsPort });

        this.wsServer.on('connection', (ws, req) => {
          const clientId = req.headers['x-agent-id'] || `ws-${Date.now()}`;

          logger.info('WebSocket client connected', { clientId });
          this.wsConnections.add(ws);

          ws.on('message', async (data) => {
            try {
              const message = JSON.parse(data);
              await this.handleMessage(message, { transport: 'websocket', clientId });
            } catch (error) {
              logger.error('Failed to handle WebSocket message', {
                error: error.message,
                clientId
              });
            }
          });

          ws.on('close', () => {
            logger.info('WebSocket client disconnected', { clientId });
            this.wsConnections.delete(ws);
          });

          ws.on('error', (error) => {
            logger.error('WebSocket error', { error: error.message, clientId });
          });
        });

        this.wsServer.on('listening', () => {
          logger.info('WebSocket server listening', { port: this.config.wsPort });
          resolve();
        });

        this.wsServer.on('error', (error) => {
          logger.error('WebSocket server error', { error: error.message });
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Initialize HTTP server for health checks and SSE endpoints
   */
  async initializeHTTP() {
    return new Promise((resolve) => {
      const app = express();
      app.use(express.json());

      // Health check endpoint
      app.get('/health', (req, res) => {
        const health = this.getHealth();
        res.status(health.status === 'healthy' ? 200 : 503).json(health);
      });

      // Agent registry endpoint
      app.get('/agents', (req, res) => {
        const agentList = Array.from(this.agents.entries()).map(([id, info]) => ({
          id,
          ...info
        }));
        res.json({ agents: agentList, total: agentList.length });
      });

      // Metrics endpoint
      app.get('/metrics', (req, res) => {
        res.json(this.metrics);
      });

      // SSE endpoint for events (if Ably enabled)
      if (this.ablyTransport) {
        app.get('/stream/:channel', (req, res) => {
          const handler = this.ablyTransport.createStreamEndpoint(req.params.channel);
          handler(req, res);
        });
      }

      this.httpServer = app.listen(this.config.httpPort, () => {
        logger.info('HTTP server listening', { port: this.config.httpPort });
        resolve();
      });
    });
  }

  /**
   * Register an agent with the orchestrator
   */
  async registerAgent(agentId, capabilities = {}) {
    try {
      const agentInfo = {
        id: agentId,
        capabilities: capabilities.capabilities || capabilities,
        version: capabilities.version || '1.0.0',
        registeredAt: Date.now(),
        lastHeartbeat: Date.now(),
        status: 'active',
        transport: capabilities.transport || 'websocket'
      };

      // Version compatibility check
      if (this.versionManager) {
        const compatible = await this.versionManager.checkCompatibility(
          agentInfo.version,
          this.config.minAgentVersion
        );

        if (!compatible) {
          const error = new Error(
            `Agent version ${agentInfo.version} is incompatible with minimum required version ${this.config.minAgentVersion}`
          );
          logger.error('Agent registration failed - incompatible version', {
            agentId,
            agentVersion: agentInfo.version,
            requiredVersion: this.config.minAgentVersion
          });
          throw error;
        }
      }

      this.agents.set(agentId, agentInfo);

      logger.info('Agent registered', {
        agentId,
        version: agentInfo.version,
        capabilities: agentInfo.capabilities
      });

      this.emit('agent:registered', agentInfo);

      // Publish to Ably if enabled
      if (this.ablyTransport) {
        await this.ablyTransport.publish('system', 'agent.registered', agentInfo);
      }

      return agentInfo;
    } catch (error) {
      logger.error('Failed to register agent', {
        agentId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Unregister an agent
   */
  async unregisterAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      logger.warn('Attempted to unregister unknown agent', { agentId });
      return false;
    }

    this.agents.delete(agentId);
    logger.info('Agent unregistered', { agentId });

    this.emit('agent:unregistered', { agentId });

    if (this.ablyTransport) {
      await this.ablyTransport.publish('system', 'agent.unregistered', { agentId });
    }

    return true;
  }

  /**
   * Update agent heartbeat
   */
  updateHeartbeat(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.lastHeartbeat = Date.now();
      agent.status = 'active';
    }
  }

  /**
   * Route message to appropriate agents
   */
  async routeMessage(message, options = {}) {
    try {
      const {
        requireApproval = false,
        targetAgents = [],
        timeout = 30000
      } = options;

      // Request approval if required
      if (requireApproval && this.approvalWorkflow) {
        logger.info('Requesting approval for operation', {
          operation: message.type,
          targetAgents
        });

        this.metrics.approvalsRequested++;

        const approved = await this.approvalWorkflow.requestApproval({
          operation: message.type,
          data: message.data,
          targetAgents,
          requestedBy: options.requestedBy || 'system'
        });

        if (!approved) {
          logger.warn('Operation denied by approval workflow', {
            operation: message.type
          });
          this.metrics.approvalsDenied++;
          return { status: 'denied', reason: 'Approval not granted' };
        }

        this.metrics.approvalsGranted++;
        logger.info('Operation approved', { operation: message.type });
      }

      // Determine target agents
      const targets = targetAgents.length > 0
        ? targetAgents
        : this.selectAgentsByCapability(message.type);

      if (targets.length === 0) {
        logger.warn('No agents available to handle message', {
          type: message.type
        });
        return { status: 'no_agents', type: message.type };
      }

      // Route via Ably or WebSocket
      const results = await Promise.all(
        targets.map(agentId => this.sendToAgent(agentId, message))
      );

      this.metrics.messagesProcessed++;
      this.emit('message:routed', { message, targets, results });

      return {
        status: 'routed',
        targets,
        results
      };
    } catch (error) {
      logger.error('Failed to route message', {
        error: error.message,
        message: message.type
      });
      throw error;
    }
  }

  /**
   * Send message to specific agent
   */
  async sendToAgent(agentId, message) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Use Ably if enabled and agent supports it
    if (this.ablyTransport && agent.transport === 'ably') {
      await this.ablyTransport.publish(`agent:${agentId}`, message.type, message.data);
      return { agentId, transport: 'ably', status: 'sent' };
    }

    // Fall back to WebSocket broadcast
    const messageStr = JSON.stringify({
      ...message,
      targetAgent: agentId,
      timestamp: Date.now()
    });

    let sent = 0;
    for (const ws of this.wsConnections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
        sent++;
      }
    }

    return { agentId, transport: 'websocket', status: 'broadcast', sent };
  }

  /**
   * Select agents by capability
   */
  selectAgentsByCapability(messageType) {
    const capable = [];

    for (const [agentId, agent] of this.agents) {
      if (agent.status === 'active' && this.agentCanHandle(agent, messageType)) {
        capable.push(agentId);
      }
    }

    return capable;
  }

  /**
   * Check if agent can handle message type
   */
  agentCanHandle(agent, messageType) {
    if (!agent.capabilities) return false;

    const capabilities = Array.isArray(agent.capabilities)
      ? agent.capabilities
      : Object.keys(agent.capabilities);

    return capabilities.some(cap => messageType.includes(cap));
  }

  /**
   * Handle incoming message
   */
  async handleMessage(message, metadata = {}) {
    try {
      logger.debug('Handling message', {
        type: message.type,
        transport: metadata.transport
      });

      switch (message.type) {
        case 'agent.register':
          await this.registerAgent(message.data.agentId, message.data.capabilities);
          break;

        case 'agent.unregister':
          await this.unregisterAgent(message.data.agentId);
          break;

        case 'agent.heartbeat':
          this.updateHeartbeat(message.data.agentId);
          break;

        case 'approval.response':
          if (this.approvalWorkflow) {
            this.approvalWorkflow.handleApprovalResponse(message.data);
          }
          break;

        default:
          await this.routeMessage(message, message.options || {});
      }

      this.emit('message:handled', message);
    } catch (error) {
      logger.error('Failed to handle message', {
        error: error.message,
        messageType: message.type
      });
      this.emit('message:error', { message, error });
    }
  }

  /**
   * Get orchestrator health status
   */
  getHealth() {
    const now = Date.now();
    const activeAgents = Array.from(this.agents.values()).filter(
      agent => (now - agent.lastHeartbeat) < 30000
    );

    const health = {
      status: 'healthy',
      timestamp: now,
      agents: {
        total: this.agents.size,
        active: activeAgents.length,
        inactive: this.agents.size - activeAgents.length
      },
      transport: {
        websocket: {
          enabled: !!this.wsServer,
          clients: this.wsConnections.size
        }
      },
      metrics: this.metrics,
      features: {
        ably: this.config.enableAbly,
        approvals: this.config.enableApprovals,
        versioning: this.config.enableVersioning,
        datadog: this.config.enableDatadog
      }
    };

    if (this.ablyTransport) {
      health.transport.ably = this.ablyTransport.getHealth();
    }

    return health;
  }

  /**
   * Start publishing metrics to Datadog
   */
  startMetricsPublishing() {
    if (!this.datadogIntegration) return;

    this.metricsInterval = setInterval(() => {
      const health = this.getHealth();
      this.datadogIntegration.publishHealth(health);
    }, 10000); // Publish every 10 seconds
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    try {
      logger.info('Shutting down Enhanced MCP Orchestrator');

      // Stop metrics publishing
      if (this.metricsInterval) {
        clearInterval(this.metricsInterval);
      }

      // Close Ably transport
      if (this.ablyTransport) {
        await this.ablyTransport.disconnect();
      }

      // Close WebSocket server
      if (this.wsServer) {
        for (const ws of this.wsConnections) {
          ws.close();
        }
        this.wsServer.close();
      }

      // Close HTTP server
      if (this.httpServer) {
        await new Promise(resolve => this.httpServer.close(resolve));
      }

      logger.info('Enhanced MCP Orchestrator shut down successfully');
      this.emit('shutdown');
    } catch (error) {
      logger.error('Error during shutdown', { error: error.message });
      throw error;
    }
  }
}

export default EnhancedMCPOrchestrator;
