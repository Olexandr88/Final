#!/usr/bin/env node
/**
 * Chrome DevTools Agent for A2A System
 * Connects to A2A bridge and provides AI-powered debugging via Chrome DevTools Protocol
 *
 * Features:
 * - Console error analysis with AI explanations
 * - Network request monitoring and optimization suggestions
 * - Performance profiling with bottleneck detection
 * - Memory leak detection and analysis
 * - DOM inspection with accessibility insights
 */

import WebSocket from 'ws';
import CDP from 'chrome-remote-interface';
import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';
import { EventEmitter } from 'events';

dotenv.config();

const BRIDGE_URL = process.env.BRIDGE_WS || 'ws://localhost:65028';
const AGENT_ID = process.env.AGENT_ID || 'devtools-agent-1';
const CDP_PORT = process.env.CDP_PORT || 9222;
const CDP_HOST = process.env.CDP_HOST || 'localhost';

class DevToolsAgent extends EventEmitter {
  constructor() {
    super();
    this.agentId = AGENT_ID;
    this.ws = null;
    this.cdpClient = null;
    this.connected = false;

    // Event buffers
    this.consoleErrors = [];
    this.networkRequests = new Map();
    this.performanceMetrics = [];
    this.memorySnapshots = [];

    // Analysis settings
    this.config = {
      errorThreshold: parseInt(process.env.ERROR_THRESHOLD) || 3,
      slowRequestMs: parseInt(process.env.SLOW_REQUEST_MS) || 1000,
      samplingIntervalMs: parseInt(process.env.SAMPLING_INTERVAL_MS) || 5000,
      memoryLeakMB: parseInt(process.env.MEMORY_LEAK_MB) || 50,
    };

    logger.info(`🔧 Starting DevTools Agent: ${this.agentId}`);
    logger.info(`   CDP Target: ${CDP_HOST}:${CDP_PORT}`);
    this.connect();
  }

  async connect() {
    try {
      // Connect to AI Bridge
      this.ws = new WebSocket(BRIDGE_URL);

      this.ws.on('open', () => {
        logger.info(`✅ Connected to A2A Bridge at ${BRIDGE_URL}`);
        this.register();
      });

      this.ws.on('message', async (data) => {
        try {
          const msg = JSON.parse(data);
          await this.handleMessage(msg);
        } catch (error) {
          logger.error('❌ Error handling message:', error.message);
        }
      });

      this.ws.on('error', (error) => {
        logger.error('❌ WebSocket error:', error.message);
      });

      this.ws.on('close', () => {
        logger.info('🔌 Disconnected from A2A Bridge');
        setTimeout(() => this.connect(), 5000);
      });

      // Heartbeat
      setInterval(() => {
        if (this.ws && this.ws.readyState === 1) {
          this.ws.send(JSON.stringify({ type: 'heartbeat' }));
        }
      }, 60000);

      // Connect to Chrome DevTools Protocol
      await this.connectCDP();

    } catch (error) {
      logger.error('❌ Connection failed:', error.message);
      setTimeout(() => this.connect(), 5000);
    }
  }

  async connectCDP() {
    try {
      this.cdpClient = await CDP({ host: CDP_HOST, port: CDP_PORT });
      const { Console, Network, Performance, HeapProfiler, Runtime } = this.cdpClient;

      // Enable domains
      await Promise.all([
        Console.enable(),
        Network.enable(),
        Performance.enable(),
        Runtime.enable(),
      ]);

      logger.info('✅ Connected to Chrome DevTools Protocol');
      this.connected = true;

      // Set up event handlers
      this.setupCDPEventHandlers();

      // Start performance sampling
      this.startPerformanceMonitoring();

    } catch (error) {
      logger.error('❌ CDP connection failed:', error.message);
      logger.info('   Make sure Chrome is running with --remote-debugging-port=9222');

      // Retry CDP connection
      setTimeout(() => this.connectCDP(), 10000);
    }
  }

  setupCDPEventHandlers() {
    const { Console, Network, Performance } = this.cdpClient;

    // Console errors
    Console.messageAdded((params) => {
      const { message } = params;
      if (message.level === 'error' || message.level === 'warning') {
        this.handleConsoleError(message);
      }
    });

    // Network requests
    Network.requestWillBeSent((params) => {
      const { requestId, request, timestamp } = params;
      this.networkRequests.set(requestId, {
        url: request.url,
        method: request.method,
        timestamp,
        startTime: timestamp,
      });
    });

    Network.responseReceived((params) => {
      const { requestId, response, timestamp } = params;
      const request = this.networkRequests.get(requestId);
      if (request) {
        request.status = response.status;
        request.mimeType = response.mimeType;
        request.endTime = timestamp;
        request.duration = (timestamp - request.startTime) * 1000; // Convert to ms

        // Check for slow requests
        if (request.duration > this.config.slowRequestMs) {
          this.handleSlowRequest(request);
        }
      }
    });

    Network.loadingFailed((params) => {
      const { requestId, errorText } = params;
      const request = this.networkRequests.get(requestId);
      if (request) {
        request.failed = true;
        request.error = errorText;
        this.handleFailedRequest(request);
      }
    });

    logger.info('📡 CDP event handlers configured');
  }

  startPerformanceMonitoring() {
    setInterval(async () => {
      try {
        if (!this.connected) return;

        const { Performance } = this.cdpClient;
        const metrics = await Performance.getMetrics();

        this.performanceMetrics.push({
          timestamp: Date.now(),
          metrics: metrics.metrics,
        });

        // Keep only last 100 samples
        if (this.performanceMetrics.length > 100) {
          this.performanceMetrics.shift();
        }

        // Check for performance degradation
        this.analyzePerformance();

      } catch (error) {
        logger.error('❌ Performance monitoring error:', error.message);
      }
    }, this.config.samplingIntervalMs);
  }

  register() {
    const registration = {
      type: 'register',
      clientId: this.agentId,
      role: 'devtools-monitor',
      labels: ['devtools', 'debugging', 'performance', 'monitoring'],
      tools: [
        'console-analysis',
        'network-monitoring',
        'performance-profiling',
        'memory-inspection',
        'dom-analysis',
      ],
      intents: [
        'devtools.analyze-console',
        'devtools.monitor-network',
        'devtools.profile-performance',
        'devtools.inspect-memory',
        'devtools.analyze-dom',
      ],
      maxConcurrentTasks: 5,
    };

    this.ws.send(JSON.stringify(registration));
    logger.info(`📝 Registered as ${this.agentId}`);
  }

  async handleMessage(msg) {
    if (msg.type === 'registered') {
      logger.info('✅ Registration confirmed');
      logger.info(`   Client ID: ${msg.client.id}`);
      logger.info(`   Role: ${msg.client.role}`);
      logger.info('🎧 Listening for DevTools events...\n');
      return;
    }

    if (msg[0] === 'env') {
      const envelope = msg[1];
      await this.handleEnvelope(envelope);
    }
  }

  async handleEnvelope(envelope) {
    const { from, to, intent, payload, id } = envelope;

    // Only respond to messages directed at us
    if (to !== this.agentId && to !== null) return;

    logger.info(`\n📨 Received message from ${from}`);
    logger.info(`   Intent: ${intent}`);

    let result;

    try {
      switch (intent) {
        case 'devtools.analyze-console':
          result = await this.getConsoleAnalysis();
          break;
        case 'devtools.monitor-network':
          result = await this.getNetworkAnalysis();
          break;
        case 'devtools.profile-performance':
          result = await this.getPerformanceAnalysis();
          break;
        case 'devtools.inspect-memory':
          result = await this.getMemoryAnalysis();
          break;
        case 'devtools.get-status':
          result = this.getStatus();
          break;
        default:
          result = { error: `Unknown intent: ${intent}` };
      }

      // Send response via A2A
      this.sendResponse(from, id, result);

    } catch (error) {
      logger.error('❌ Error handling envelope:', error.message);
      this.sendResponse(from, id, { error: error.message });
    }
  }

  handleConsoleError(message) {
    const error = {
      timestamp: Date.now(),
      level: message.level,
      text: message.text,
      source: message.source,
      url: message.url,
      line: message.line,
      column: message.column,
      stackTrace: message.stackTrace,
    };

    this.consoleErrors.push(error);

    // Keep only last 100 errors
    if (this.consoleErrors.length > 100) {
      this.consoleErrors.shift();
    }

    logger.warn(`🐛 Console ${message.level}: ${message.text}`);

    // If error count exceeds threshold, trigger analysis
    if (this.consoleErrors.length >= this.config.errorThreshold) {
      this.requestAIAnalysis('console-errors', this.consoleErrors.slice(-this.config.errorThreshold));
    }
  }

  handleSlowRequest(request) {
    logger.warn(`🐌 Slow request detected: ${request.url} (${request.duration.toFixed(0)}ms)`);

    this.requestAIAnalysis('slow-request', {
      url: request.url,
      method: request.method,
      duration: request.duration,
      status: request.status,
    });
  }

  handleFailedRequest(request) {
    logger.error(`❌ Request failed: ${request.url} - ${request.error}`);

    this.requestAIAnalysis('failed-request', {
      url: request.url,
      method: request.method,
      error: request.error,
    });
  }

  analyzePerformance() {
    if (this.performanceMetrics.length < 2) return;

    const current = this.performanceMetrics[this.performanceMetrics.length - 1];
    const previous = this.performanceMetrics[this.performanceMetrics.length - 2];

    // Find JSHeapUsedSize metric
    const currentHeap = current.metrics.find(m => m.name === 'JSHeapUsedSize');
    const previousHeap = previous.metrics.find(m => m.name === 'JSHeapUsedSize');

    if (currentHeap && previousHeap) {
      const heapGrowth = (currentHeap.value - previousHeap.value) / (1024 * 1024); // MB

      if (heapGrowth > this.config.memoryLeakMB) {
        logger.warn(`⚠️  Potential memory leak detected: +${heapGrowth.toFixed(2)}MB`);
        this.requestAIAnalysis('memory-leak', {
          heapGrowth,
          currentHeapMB: currentHeap.value / (1024 * 1024),
          previousHeapMB: previousHeap.value / (1024 * 1024),
        });
      }
    }
  }

  async requestAIAnalysis(type, data) {
    // Send analysis request to Claude/Ollama agents via A2A
    const envelope = {
      from: this.agentId,
      to: null, // Broadcast to available AI agents
      intent: 'ai.analyze',
      payload: {
        analysisType: type,
        data,
        context: 'DevTools monitoring detected an issue that needs AI analysis',
      },
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };

    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(['env', envelope]));
      logger.info(`🤖 Requested AI analysis for: ${type}`);
    }
  }

  async getConsoleAnalysis() {
    return {
      totalErrors: this.consoleErrors.length,
      recentErrors: this.consoleErrors.slice(-10),
      errorsBySource: this.groupBy(this.consoleErrors, 'source'),
      errorsByUrl: this.groupBy(this.consoleErrors, 'url'),
    };
  }

  async getNetworkAnalysis() {
    const requests = Array.from(this.networkRequests.values());
    const completed = requests.filter(r => r.endTime);
    const failed = requests.filter(r => r.failed);
    const slow = completed.filter(r => r.duration > this.config.slowRequestMs);

    return {
      total: requests.length,
      completed: completed.length,
      failed: failed.length,
      slow: slow.length,
      averageDuration: completed.reduce((sum, r) => sum + r.duration, 0) / completed.length || 0,
      slowRequests: slow.map(r => ({
        url: r.url,
        duration: r.duration,
        status: r.status,
      })),
      failedRequests: failed.map(r => ({
        url: r.url,
        error: r.error,
      })),
    };
  }

  async getPerformanceAnalysis() {
    if (this.performanceMetrics.length === 0) {
      return { message: 'No performance data available yet' };
    }

    const latest = this.performanceMetrics[this.performanceMetrics.length - 1];
    const metricsMap = {};

    latest.metrics.forEach(m => {
      metricsMap[m.name] = m.value;
    });

    return {
      timestamp: latest.timestamp,
      metrics: metricsMap,
      heapUsedMB: (metricsMap.JSHeapUsedSize || 0) / (1024 * 1024),
      heapTotalMB: (metricsMap.JSHeapTotalSize || 0) / (1024 * 1024),
      samplesCount: this.performanceMetrics.length,
    };
  }

  async getMemoryAnalysis() {
    try {
      const { HeapProfiler } = this.cdpClient;
      await HeapProfiler.enable();

      // Take heap snapshot (this can be large, so we just return summary)
      const snapshot = await HeapProfiler.takeHeapSnapshot();

      await HeapProfiler.disable();

      return {
        snapshotTaken: true,
        timestamp: Date.now(),
        message: 'Heap snapshot collected successfully',
      };
    } catch (error) {
      return {
        error: error.message,
        message: 'Failed to collect heap snapshot',
      };
    }
  }

  getStatus() {
    return {
      agentId: this.agentId,
      connected: this.connected,
      cdpHost: CDP_HOST,
      cdpPort: CDP_PORT,
      consoleErrors: this.consoleErrors.length,
      networkRequests: this.networkRequests.size,
      performanceSamples: this.performanceMetrics.length,
      config: this.config,
    };
  }

  sendResponse(to, requestId, data) {
    const envelope = {
      from: this.agentId,
      to,
      intent: 'devtools.response',
      payload: data,
      id: `${requestId}-response`,
    };

    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(['env', envelope]));
      logger.info(`📤 Sent response to ${to}`);
    }
  }

  groupBy(array, key) {
    return array.reduce((acc, item) => {
      const group = item[key] || 'unknown';
      acc[group] = (acc[group] || 0) + 1;
      return acc;
    }, {});
  }

  async disconnect() {
    if (this.cdpClient) {
      await this.cdpClient.close();
    }
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Start agent
const agent = new DevToolsAgent();

// Handle process termination
process.on('SIGINT', async () => {
  logger.info('\n👋 Shutting down DevTools Agent...');
  await agent.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('\n👋 Shutting down DevTools Agent...');
  await agent.disconnect();
  process.exit(0);
});

export default DevToolsAgent;
