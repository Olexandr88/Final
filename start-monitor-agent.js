#!/usr/bin/env node
/**
 * Monitor Agent - Non-intrusive system observer
 * Watches other agents and documents system activity
 * NO file modifications, NO locks acquired - read-only observer
 */

import WebSocket from 'ws';
import { logger } from './src/utils/logger.js';

const BRIDGE_WS = process.env.BRIDGE_WS || 'ws://localhost:65028';

class MonitorAgent {
  constructor() {
    this.agentId = 'monitor-agent-claude';
    this.ws = null;
    this.observations = [];
  }

  async connect() {
    logger.info(`🔍 Monitor Agent connecting...`);
    this.ws = new WebSocket(BRIDGE_WS);

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 30000);
      this.ws.on('open', () => {
        clearTimeout(timeout);
        resolve();
      });
      this.ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // Register as read-only monitor
    this.ws.send(
      JSON.stringify({
        type: 'register',
        clientId: this.agentId,
        role: 'monitor',
        labels: ['observer', 'documentation', 'non-intrusive', 'read-only'],
        tools: [], // NO TOOLS - observation only
        intents: ['monitor.observe', 'monitor.report'],
        maxConcurrentTasks: 1,
      })
    );

    await new Promise((r) => this.ws.once('message', r));
    logger.info('✅ Monitor Agent connected (read-only mode)');

    this.setupHandlers();
  }

  setupHandlers() {
    this.ws.on('message', async (data) => {
      const msg = JSON.parse(data.toString());

      // Just observe envelopes, don't respond
      if (Array.isArray(msg) && msg[0] === 'env') {
        const envelope = msg[1];
        this.recordObservation(envelope);
      }
    });

    this.ws.on('close', () => {
      logger.info('🔌 Monitor disconnected');
    });

    this.ws.on('error', (err) => {
      logger.error('❌ WebSocket error:', err.message);
    });

    // Heartbeat
    setInterval(() => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000);

    // Report observations every 30 seconds (non-intrusive)
    setInterval(() => {
      this.reportObservations();
    }, 30000);
  }

  recordObservation(envelope) {
    const obs = {
      timestamp: new Date().toISOString(),
      from: envelope.from,
      to: envelope.to,
      intent: envelope.intent,
      hasPayload: !!envelope.payload,
    };

    this.observations.push(obs);

    // Keep last 100 observations only
    if (this.observations.length > 100) {
      this.observations.shift();
    }

    // Log interesting activity (file operations, tool executions)
    if (envelope.intent?.includes('file') || envelope.intent?.includes('tool')) {
      logger.info(`📊 Observed: ${envelope.from} → ${envelope.to}: ${envelope.intent}`);
    }
  }

  reportObservations() {
    if (this.observations.length === 0) return;

    const recent = this.observations.slice(-10);
    const summary = {
      totalObserved: this.observations.length,
      recentActivity: recent.length,
      activeAgents: [...new Set(recent.map((o) => o.from))],
      commonIntents: this.getMostCommonIntents(recent),
    };

    logger.info('📋 System Activity Summary:', summary);
  }

  getMostCommonIntents(observations) {
    const intentCounts = {};
    observations.forEach((obs) => {
      intentCounts[obs.intent] = (intentCounts[obs.intent] || 0) + 1;
    });

    return Object.entries(intentCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([intent, count]) => ({ intent, count }));
  }
}

// Start monitor
const monitor = new MonitorAgent();
monitor.connect().catch((err) => {
  logger.error('Failed to connect Monitor Agent:', err.message);
  process.exit(1);
});

process.on('SIGINT', () => {
  logger.info('\n👋 Shutting down Monitor Agent...');
  process.exit(0);
});
