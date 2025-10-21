#!/usr/bin/env node
import WebSocket from 'ws';
import dotenv from 'dotenv';
import { getGlobalCoordinator } from '../session-coordinator.js';
import ContextAwareAnalyzer from './context-aware-analyzer.js';
import { logger } from '../utils/logger.js';

dotenv.config();

// Initialize session coordination
const sessionCoordinator = getGlobalCoordinator();
const sessionId = sessionCoordinator.initialize();
logger.info(`[Session: ${sessionId.slice(0, 8)}] Code Analyzer starting\n`);

const BRIDGE_WS = process.env.BRIDGE_WS || 'ws://localhost:65028';

class CodeAnalyzerAgent {
  constructor() {
    this.ws = null;
    this.sessionCoordinator = sessionCoordinator;
    this.analyzer = new ContextAwareAnalyzer();
  }

  async connect() {
    logger.info('🔍 Code Analyzer Agent connecting...');
    this.ws = new WebSocket(BRIDGE_WS);

    await new Promise((resolve, reject) => {
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
    });

    this.ws.send(
      JSON.stringify({
        type: 'register',
        clientId: 'code-analyzer',
        role: 'analyzer',
        skills: ['analyze_code', 'find_bugs', 'code_review'],
        intents: ['code.analyze', 'code.review'],
      })
    );

    await new Promise((r) => this.ws.once('message', r));
    logger.info('✅ Code Analyzer ready\n');

    this.setupHandlers();
  }

  setupHandlers() {
    this.ws.on('message', async (data) => {
      const msg = JSON.parse(data.toString());
      if (Array.isArray(msg) && msg[0] === 'env') {
        await this.handleEnvelope(msg[1]);
      }
    });

    this.ws.on('close', () => {
      logger.info('🔌 Disconnected - attempting reconnect...');
      // Clean up ping interval before reconnecting
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
      setTimeout(() => this.connect(), 5000);
    });

    this.ws.on('error', (err) => {
      logger.error('❌ WebSocket error:', err.message);
    });

    // Keep-alive ping - optimized interval (store reference for cleanup)
    this.pingInterval = setInterval(() => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 60000);
  }

  analyzeCode(code, filepath = 'unknown') {
    return this.analyzer.analyzeWithContext(code, filepath, {
      source: 'code-analyzer-agent',
    });
  }

  async handleEnvelope(envelope) {
    logger.info(`📬 Analyzing code from ${envelope.from}`);

    const code = envelope.payload?.code || '';
    const filepath = envelope.payload?.filePath || envelope.payload?.filepath || 'unknown';

    try {
      logger.info(`🔍 Analyzing ${filepath}...`);

      const analysis = this.analyzeCode(code, filepath);

      logger.info(`✅ Analysis complete - ${analysis.issues.length} issues found\n`);

      this.ws.send(
        JSON.stringify({
          type: 'envelope',
          envelope: {
            intent: 'code.analysis_result',
            from: 'code-analyzer',
            to: envelope.from,
            taskId: envelope.taskId,
            replyTo: envelope.id,
            payload: {
              filePath: analysis.filePath,
              analysis: {
                quality_score: analysis.metrics?.qualityScore,
                bugs:
                  analysis.issues
                    ?.filter((i) => i.severity === 'error')
                    .map((i) => `Line ${i.line}: ${i.message}`) || [],
                security_issues:
                  analysis.issues?.filter(
                    (i) =>
                      i.message?.toLowerCase().includes('security') ||
                      i.message?.toLowerCase().includes('password')
                  ) || [],
                performance_issues:
                  analysis.issues?.filter((i) =>
                    i.message?.toLowerCase().includes('performance')
                  ) || [],
                warnings:
                  analysis.issues
                    ?.filter((i) => i.severity === 'warning')
                    .map((i) => `Line ${i.line}: ${i.message}`) || [],
                info:
                  analysis.issues
                    ?.filter((i) => i.severity === 'info')
                    .map((i) => `Line ${i.line}: ${i.message}`) || [],
                context: analysis.context,
                recommendations: analysis.recommendations,
              },
              timestamp: Date.now(),
            },
          },
        })
      );
    } catch (error) {
      logger.error('❌ Analysis error:', error.message);
      this.ws.send(
        JSON.stringify({
          type: 'envelope',
          envelope: {
            intent: 'agent.error',
            from: 'code-analyzer',
            to: envelope.from,
            taskId: envelope.taskId,
            payload: { error: error.message },
          },
        })
      );
    }
  }
}

const agent = new CodeAnalyzerAgent();
agent.connect().catch((err) => {
  logger.error('❌ Failed to connect:', err.message);
  process.exit(1);
});
