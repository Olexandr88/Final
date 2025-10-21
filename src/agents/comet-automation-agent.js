import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

/**
 * Comet Browser Automation Agent
 * Connects to Perplexity Comet browser via Chrome DevTools Protocol (CDP)
 * Enables autonomous browsing, navigation, and data extraction
 * @module comet-automation-agent
 */

export class CometAutomationAgent extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      cometPath:
        config.cometPath ||
        'C:\\Users\\scarm\\AppData\\Local\\Perplexity\\Comet\\Application\\comet.exe',
      debugPort: config.debugPort || 9222,
      bridgeWS: config.bridgeWS || process.env.BRIDGE_WS || 'ws://localhost:65028',
      agentId: config.agentId || 'comet-assistant-1',
      autoReconnect: config.autoReconnect !== false,
      reconnectDelay: config.reconnectDelay || 5000,
      ...config,
    };

    this.bridgeConnection = null;
    this.cdpConnection = null;
    this.cdpTargets = new Map();
    this.isConnected = false;
    this.isCometRunning = false;
    this.capabilities = [
      'autonomous-browsing',
      'page-navigation',
      'dom-interaction',
      'data-extraction',
      'screenshot-capture',
      'network-monitoring',
    ];
  }

  /**
   * Initialize and connect to AI Bridge and Comet browser
   */
  async initialize() {
    try {
      logger.info('Initializing Comet Automation Agent', { agentId: this.config.agentId });

      // Check if Comet is running
      await this.ensureCometRunning();

      // Connect to AI Bridge
      await this.connectToBridge();

      // Connect to Comet via CDP
      await this.connectToComet();

      logger.info('Comet Automation Agent initialized successfully');
      this.emit('ready');

      return { success: true, message: 'Comet agent ready' };
    } catch (error) {
      logger.error('Failed to initialize Comet agent', { error: error.message });
      throw error;
    }
  }

  /**
   * Ensure Comet browser is running
   */
  async ensureCometRunning() {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Check if Comet is running
      try {
        const { stdout } = await execAsync('tasklist | findstr /I "comet.exe"');
        if (stdout.includes('comet.exe')) {
          this.isCometRunning = true;
          logger.info('Comet browser is already running');
          return;
        }
      } catch (checkError) {
        // Not running, will launch
      }

      // Launch Comet with remote debugging enabled
      logger.info('Launching Comet browser with CDP enabled');
      const launchCommand = `"${this.config.cometPath}" --remote-debugging-port=${this.config.debugPort} --disable-features=AutomationControlled`;

      exec(launchCommand, (error) => {
        if (error) {
          logger.error('Failed to launch Comet', { error: error.message });
        } else {
          this.isCometRunning = true;
          logger.info('Comet browser launched successfully');
        }
      });

      // Wait for Comet to start
      await new Promise((resolve) => setTimeout(resolve, 3000));
    } catch (error) {
      logger.error('Error ensuring Comet is running', { error: error.message });
      throw new Error(`Failed to start Comet: ${error.message}`);
    }
  }

  /**
   * Connect to AI Bridge WebSocket hub
   */
  async connectToBridge() {
    return new Promise((resolve, reject) => {
      try {
        logger.info('Connecting to AI Bridge', { url: this.config.bridgeWS });

        this.bridgeConnection = new WebSocket(this.config.bridgeWS);

        this.bridgeConnection.on('open', () => {
          logger.info('Connected to AI Bridge');

          // Register agent with bridge
          this.sendToBridge({
            type: 'agent:register',
            data: {
              agentId: this.config.agentId,
              name: 'Comet Assistant',
              capabilities: this.capabilities,
              status: 'active',
            },
          });

          this.isConnected = true;
          resolve();
        });

        this.bridgeConnection.on('message', (data) => {
          this.handleBridgeMessage(data);
        });

        this.bridgeConnection.on('error', (error) => {
          logger.error('Bridge connection error', { error: error.message });
          if (!this.isConnected) {
            reject(error);
          }
        });

        this.bridgeConnection.on('close', () => {
          logger.warn('Bridge connection closed');
          this.isConnected = false;

          if (this.config.autoReconnect) {
            setTimeout(() => this.connectToBridge(), this.config.reconnectDelay);
          }
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('Bridge connection timeout'));
          }
        }, 10000);
      } catch (error) {
        logger.error('Failed to connect to bridge', { error: error.message });
        reject(error);
      }
    });
  }

  /**
   * Connect to Comet browser via Chrome DevTools Protocol
   */
  async connectToComet() {
    try {
      const axios = (await import('axios')).default;

      // Get CDP endpoint
      const response = await axios.get(`http://localhost:${this.config.debugPort}/json/version`);
      const wsUrl = response.data.webSocketDebuggerUrl;

      logger.info('Connecting to Comet CDP', { wsUrl });

      this.cdpConnection = new WebSocket(wsUrl);

      return new Promise((resolve, reject) => {
        this.cdpConnection.on('open', () => {
          logger.info('Connected to Comet CDP');
          this.emit('cdp:connected');
          resolve();
        });

        this.cdpConnection.on('message', (data) => {
          this.handleCDPMessage(data);
        });

        this.cdpConnection.on('error', (error) => {
          logger.error('CDP connection error', { error: error.message });
          reject(error);
        });

        this.cdpConnection.on('close', () => {
          logger.warn('CDP connection closed');
          this.emit('cdp:disconnected');
        });
      });
    } catch (error) {
      logger.error('Failed to connect to Comet CDP', { error: error.message });
      throw new Error(`CDP connection failed: ${error.message}`);
    }
  }

  /**
   * Handle incoming messages from AI Bridge
   */
  handleBridgeMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      logger.debug('Bridge message received', { type: message.type });

      switch (message.type) {
        case 'comet:navigate':
          this.navigate(message.data.url);
          break;

        case 'comet:execute':
          this.executeScript(message.data.script);
          break;

        case 'comet:extract':
          this.extractData(message.data.selector);
          break;

        case 'comet:screenshot':
          this.takeScreenshot();
          break;

        case 'comet:search':
          this.autonomousSearch(message.data.query);
          break;

        default:
          logger.warn('Unknown message type', { type: message.type });
      }
    } catch (error) {
      logger.error('Error handling bridge message', { error: error.message });
    }
  }

  /**
   * Handle incoming CDP messages
   */
  handleCDPMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      this.emit('cdp:message', message);

      // Handle specific CDP events
      if (message.method === 'Page.loadEventFired') {
        this.emit('page:loaded');
      }
    } catch (error) {
      logger.error('Error handling CDP message', { error: error.message });
    }
  }

  /**
   * Send message to AI Bridge
   */
  sendToBridge(message) {
    if (!this.bridgeConnection || !this.isConnected) {
      logger.error('Cannot send to bridge - not connected');
      return;
    }

    try {
      this.bridgeConnection.send(
        JSON.stringify({
          ...message,
          metadata: {
            agentId: this.config.agentId,
            timestamp: Date.now(),
            ...message.metadata,
          },
        })
      );
    } catch (error) {
      logger.error('Error sending to bridge', { error: error.message });
    }
  }

  /**
   * Send CDP command to Comet
   */
  async sendCDPCommand(method, params = {}) {
    if (!this.cdpConnection) {
      throw new Error('CDP not connected');
    }

    const id = Date.now();
    const command = { id, method, params };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('CDP command timeout'));
      }, 30000);

      const messageHandler = (data) => {
        const response = JSON.parse(data.toString());
        if (response.id === id) {
          clearTimeout(timeout);
          this.cdpConnection.removeListener('message', messageHandler);

          if (response.error) {
            reject(new Error(response.error.message));
          } else {
            resolve(response.result);
          }
        }
      };

      this.cdpConnection.on('message', messageHandler);
      this.cdpConnection.send(JSON.stringify(command));
    });
  }

  /**
   * Navigate to URL
   */
  async navigate(url) {
    try {
      logger.info('Navigating to URL', { url });

      const result = await this.sendCDPCommand('Page.navigate', { url });

      this.sendToBridge({
        type: 'comet:navigation:complete',
        data: { url, frameId: result.frameId },
      });

      return result;
    } catch (error) {
      logger.error('Navigation failed', { error: error.message, url });
      throw error;
    }
  }

  /**
   * Execute JavaScript in browser context
   */
  async executeScript(script) {
    try {
      logger.info('Executing script', { script: script.substring(0, 100) });

      const result = await this.sendCDPCommand('Runtime.evaluate', {
        expression: script,
        returnByValue: true,
      });

      this.sendToBridge({
        type: 'comet:script:executed',
        data: { result: result.result.value },
      });

      return result.result.value;
    } catch (error) {
      logger.error('Script execution failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Extract data from page using selector
   */
  async extractData(selector) {
    try {
      logger.info('Extracting data', { selector });

      const script = `
        Array.from(document.querySelectorAll('${selector}')).map(el => ({
          text: el.textContent.trim(),
          html: el.innerHTML,
          attributes: Array.from(el.attributes).reduce((acc, attr) => {
            acc[attr.name] = attr.value;
            return acc;
          }, {})
        }))
      `;

      const data = await this.executeScript(script);

      this.sendToBridge({
        type: 'comet:data:extracted',
        data: { selector, results: data },
      });

      return data;
    } catch (error) {
      logger.error('Data extraction failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Take screenshot of current page
   */
  async takeScreenshot() {
    try {
      logger.info('Taking screenshot');

      const result = await this.sendCDPCommand('Page.captureScreenshot', {
        format: 'png',
      });

      this.sendToBridge({
        type: 'comet:screenshot:captured',
        data: { screenshot: result.data },
      });

      return result.data;
    } catch (error) {
      logger.error('Screenshot failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Perform autonomous search using Comet's AI
   */
  async autonomousSearch(query) {
    try {
      logger.info('Performing autonomous search', { query });

      // Navigate to Perplexity with query
      await this.navigate(`https://www.perplexity.ai/search?q=${encodeURIComponent(query)}`);

      // Wait for results (simplified - real implementation would wait for specific elements)
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Extract results
      const results = await this.extractData('.search-result, [data-search-result]');

      this.sendToBridge({
        type: 'comet:search:complete',
        data: { query, results },
      });

      return results;
    } catch (error) {
      logger.error('Autonomous search failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Cleanup and disconnect
   */
  async destroy() {
    logger.info('Destroying Comet Automation Agent');

    if (this.cdpConnection) {
      this.cdpConnection.close();
    }

    if (this.bridgeConnection) {
      this.bridgeConnection.close();
    }

    this.isConnected = false;
    this.emit('destroyed');
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new CometAutomationAgent();

  agent.on('ready', () => {
    console.log('✅ Comet Automation Agent is ready');
    console.log('📍 Connected to AI Bridge');
    console.log('🌐 CDP connection established');
    console.log('\nCapabilities:', agent.capabilities.join(', '));
  });

  agent.on('error', (error) => {
    console.error('❌ Agent error:', error.message);
  });

  agent.initialize().catch((error) => {
    console.error('Failed to initialize agent:', error);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down Comet agent...');
    await agent.destroy();
    process.exit(0);
  });
}

export default CometAutomationAgent;
