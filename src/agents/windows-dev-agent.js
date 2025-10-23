// src/agents/windows-dev-agent.js
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { WinGetManager } from '../integrations/winget-manager.js';
import { WSLBridge } from '../integrations/wsl-bridge.js';
import { PowerShellExecutor } from '../integrations/powershell-executor.js';

/**
 * Windows Development Environment Agent
 * Provides Windows development tools to the AI Bridge ecosystem
 * @module windows-dev-agent
 * @extends EventEmitter
 */
export class WindowsDevAgent extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      bridgeUrl: config.bridgeUrl || 'ws://localhost:65028',
      agentId: config.agentId || `windows-dev-agent-${Date.now()}`,
      reconnectInterval: config.reconnectInterval || 5000,
      heartbeatInterval: config.heartbeatInterval || 30000,
    };

    this.ws = null;
    this.isConnected = false;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;

    // Initialize Windows components
    this.winget = new WinGetManager();
    this.wsl = new WSLBridge();
    this.powershell = new PowerShellExecutor();

    this.capabilities = {
      'windows.package.install': this.installPackage.bind(this),
      'windows.package.search': this.searchPackages.bind(this),
      'windows.package.upgrade': this.upgradePackage.bind(this),
      'windows.package.list': this.listPackages.bind(this),
      'windows.wsl.execute': this.executeWSLCommand.bind(this),
      'windows.wsl.list': this.listWSLDistros.bind(this),
      'windows.powershell.execute': this.executePowerShell.bind(this),
      'windows.system.info': this.getSystemInfo.bind(this),
    };
  }

  /**
   * Initialize Windows Development Agent
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      logger.info('Initializing Windows Development Agent', { agentId: this.config.agentId });

      // Initialize Windows components in parallel
      await Promise.allSettled([
        this.winget.initialize(),
        this.wsl.initialize(),
        this.powershell.initialize(),
      ]);

      logger.info('Windows components initialized', {
        winget: this.winget.isAvailable,
        wsl: this.wsl.isAvailable,
        powershell: this.powershell.isAvailable,
      });

      // Connect to AI Bridge
      await this.connect();
    } catch (error) {
      logger.error('Failed to initialize Windows Development Agent', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Connect to AI Bridge
   * @returns {Promise<void>}
   */
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        logger.info('Connecting to AI Bridge', { url: this.config.bridgeUrl });

        this.ws = new WebSocket(this.config.bridgeUrl);

        this.ws.on('open', () => {
          this.isConnected = true;
          logger.info('Connected to AI Bridge');

          // Register agent with capabilities
          this.sendMessage({
            type: 'agent:register',
            data: {
              agentId: this.config.agentId,
              agentType: 'windows-dev',
              capabilities: Object.keys(this.capabilities),
              metadata: {
                wingetAvailable: this.winget.isAvailable,
                wslAvailable: this.wsl.isAvailable,
                powershellAvailable: this.powershell.isAvailable,
                wslDistros: this.wsl.distros.length,
              },
            },
          });

          this.startHeartbeat();
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data) => {
          this.handleMessage(data);
        });

        this.ws.on('close', () => {
          this.isConnected = false;
          logger.warn('Disconnected from AI Bridge');
          this.stopHeartbeat();
          this.scheduleReconnect();
          this.emit('disconnected');
        });

        this.ws.on('error', (error) => {
          logger.error('WebSocket error', { error: error.message });
          reject(error);
        });

        // Connection timeout
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('Connection timeout'));
          }
        }, 10000);
      } catch (error) {
        logger.error('Failed to connect to AI Bridge', { error: error.message });
        reject(error);
      }
    });
  }

  /**
   * Handle incoming message from AI Bridge
   * @param {string|Buffer} data - Message data
   */
  async handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());

      logger.debug('Received message', { type: message.type });

      switch (message.type) {
        case 'task:execute':
          await this.executeTask(message.data);
          break;

        case 'agent:ping':
          this.sendMessage({
            type: 'agent:pong',
            data: { agentId: this.config.agentId, timestamp: Date.now() },
          });
          break;

        case 'agent:query':
          await this.handleQuery(message.data);
          break;

        default:
          logger.warn('Unknown message type', { type: message.type });
      }

      this.emit('message', message);
    } catch (error) {
      logger.error('Failed to handle message', { error: error.message });
    }
  }

  /**
   * Execute task
   * @param {Object} taskData - Task data
   */
  async executeTask(taskData) {
    try {
      const { taskId, capability, params } = taskData;

      logger.info('Executing task', { taskId, capability });

      if (!this.capabilities[capability]) {
        throw new Error(`Unknown capability: ${capability}`);
      }

      const result = await this.capabilities[capability](params);

      this.sendMessage({
        type: 'task:result',
        data: {
          taskId,
          success: true,
          result,
        },
      });

      this.emit('task:complete', { taskId, result });
    } catch (error) {
      logger.error('Task execution failed', {
        taskId: taskData.taskId,
        error: error.message
      });

      this.sendMessage({
        type: 'task:result',
        data: {
          taskId: taskData.taskId,
          success: false,
          error: error.message,
        },
      });

      this.emit('task:error', { taskId: taskData.taskId, error });
    }
  }

  /**
   * Handle query
   * @param {Object} queryData - Query data
   */
  async handleQuery(queryData) {
    try {
      const { queryId, query } = queryData;

      let response = {};

      switch (query) {
        case 'capabilities':
          response = Object.keys(this.capabilities);
          break;

        case 'status':
          response = {
            winget: this.winget.isAvailable,
            wsl: this.wsl.isAvailable,
            powershell: this.powershell.isAvailable,
            wslDistros: this.wsl.distros,
          };
          break;

        default:
          response = { error: 'Unknown query' };
      }

      this.sendMessage({
        type: 'agent:query:response',
        data: { queryId, response },
      });
    } catch (error) {
      logger.error('Query handling failed', { error: error.message });
    }
  }

  /**
   * Send message to AI Bridge
   * @param {Object} message - Message object
   */
  sendMessage(message) {
    try {
      if (this.isConnected && this.ws) {
        this.ws.send(JSON.stringify(message));
      } else {
        logger.warn('Cannot send message: not connected');
      }
    } catch (error) {
      logger.error('Failed to send message', { error: error.message });
    }
  }

  /**
   * Start heartbeat
   */
  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.sendMessage({
        type: 'agent:heartbeat',
        data: {
          agentId: this.config.agentId,
          timestamp: Date.now(),
        },
      });
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Schedule reconnection
   */
  scheduleReconnect() {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch (error) {
        logger.error('Reconnection failed', { error: error.message });
      }
    }, this.config.reconnectInterval);
  }

  // ========== Capability Implementations ==========

  /**
   * Install package via WinGet
   */
  async installPackage(params) {
    const { packageId, options = {} } = params;
    return await this.winget.install(packageId, options);
  }

  /**
   * Search packages via WinGet
   */
  async searchPackages(params) {
    const { query, options = {} } = params;
    return await this.winget.search(query, options);
  }

  /**
   * Upgrade package via WinGet
   */
  async upgradePackage(params) {
    const { packageId = 'all', options = {} } = params;
    return await this.winget.upgrade(packageId, options);
  }

  /**
   * List installed packages
   */
  async listPackages(params) {
    const { options = {} } = params;
    return await this.winget.list(options);
  }

  /**
   * Execute command in WSL
   */
  async executeWSLCommand(params) {
    const { command, options = {} } = params;
    return await this.wsl.execute(command, options);
  }

  /**
   * List WSL distributions
   */
  async listWSLDistros() {
    return await this.wsl.listDistros();
  }

  /**
   * Execute PowerShell command
   */
  async executePowerShell(params) {
    const { command, options = {} } = params;
    return await this.powershell.execute(command, options);
  }

  /**
   * Get system information
   */
  async getSystemInfo() {
    return await this.powershell.getSystemInfo();
  }

  /**
   * Disconnect agent
   */
  async disconnect() {
    logger.info('Disconnecting Windows Development Agent');

    this.stopHeartbeat();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    this.emit('disconnected');
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const agent = new WindowsDevAgent();

  agent.on('connected', () => {
    console.log('✓ Windows Development Agent connected');
  });

  agent.on('disconnected', () => {
    console.log('✗ Windows Development Agent disconnected');
  });

  agent.on('task:complete', ({ taskId, result }) => {
    console.log(`✓ Task ${taskId} completed`);
  });

  agent.on('task:error', ({ taskId, error }) => {
    console.error(`✗ Task ${taskId} failed:`, error.message);
  });

  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await agent.disconnect();
    process.exit(0);
  });

  agent.initialize().catch((error) => {
    console.error('Failed to start agent:', error.message);
    process.exit(1);
  });
}

export default WindowsDevAgent;
