#!/usr/bin/env node
import WebSocket from 'ws';
import dotenv from 'dotenv';
import { getGlobalCoordinator } from '../session-coordinator.js';
import { logger } from '../utils/logger.js';

dotenv.config();

// Initialize session coordination
const sessionCoordinator = getGlobalCoordinator();
const sessionId = sessionCoordinator.initialize();
logger.info(`[Session: ${sessionId.slice(0, 8)}] Code Fixer starting\n`);

const BRIDGE_WS = process.env.BRIDGE_WS || 'ws://localhost:9567';

class CodeFixerAgent {
  constructor() {
    this.ws = null;
    this.sessionCoordinator = sessionCoordinator;
  }

  async connect() {
    logger.info('🔧 Code Fixer Agent connecting...');
    this.ws = new WebSocket(BRIDGE_WS);

    await new Promise((resolve, reject) => {
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
    });

    this.ws.send(JSON.stringify({
      type: 'register',
      clientId: 'code-fixer',
      role: 'fixer',
      skills: ['fix_bugs', 'refactor', 'optimize'],
      intents: ['code.fix', 'code.refactor']
    }));

    await new Promise(r => this.ws.once('message', r));
    logger.info('✅ Code Fixer ready\n');

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
      setTimeout(() => this.connect(), 5000);
    });

    this.ws.on('error', (err) => {
      logger.error('❌ WebSocket error:', err.message);
    });

    // Keep-alive ping
    setInterval(() => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000);
  }

  applyFixes(code, issues) {
    const lines = code.split('\n');
    const fixes = [];

    // Sort issues by line number descending (bottom-up) to preserve line numbers
    const sortedIssues = issues
      .filter(i => i.fix && i.line)
      .sort((a, b) => b.line - a.line);

    sortedIssues.forEach(issue => {
      const lineIdx = issue.line - 1;
      if (lineIdx >= 0 && lineIdx < lines.length) {
        const original = lines[lineIdx];
        lines[lineIdx] = issue.fix;
        fixes.push({
          line: issue.line,
          original: original.trim(),
          fixed: issue.fix.trim(),
          message: issue.message
        });
      }
    });

    return {
      code: lines.join('\n'),
      fixes
    };
  }

  async handleEnvelope(envelope) {
    const code = envelope.payload?.code || '';
    const issues = envelope.payload?.issues || [];
    const filePath = envelope.payload?.filePath || 'unknown';

    try {
      logger.info(`🔧 Fixing ${filePath}...`);
      logger.info(`   Issues to fix: ${issues.length}`);

      if (issues.length === 0) {
        logger.info('✅ No issues to fix\n');

        this.ws.send(JSON.stringify({
          type: 'envelope',
          envelope: {
            intent: 'code.fix_result',
            from: 'code-fixer',
            to: envelope.from,
            taskId: envelope.taskId,
            replyTo: envelope.id,
            payload: {
              original_code: code,
              fixed_code: code,
              fixes: [],
              issues_fixed: 0,
              timestamp: Date.now(),
              filePath
            }
          }
        }));
        return;
      }

      const result = this.applyFixes(code, issues);

      logger.info(`✅ Applied ${result.fixes.length} fixes\n`);

      this.ws.send(JSON.stringify({
        type: 'envelope',
        envelope: {
          intent: 'code.fix_result',
          from: 'code-fixer',
          to: envelope.from,
          taskId: envelope.taskId,
          replyTo: envelope.id,
          payload: {
            original_code: code,
            fixed_code: result.code,
            fixes: result.fixes,
            issues_fixed: result.fixes.length,
            timestamp: Date.now(),
            filePath
          }
        }
      }));
    } catch (error) {
      logger.error('❌ Fix error:', error.message);
      this.ws.send(JSON.stringify({
        type: 'envelope',
        envelope: {
          intent: 'agent.error',
          from: 'code-fixer',
          to: envelope.from,
          taskId: envelope.taskId,
          payload: { error: error.message }
        }
      }));
    }
  }
}

const agent = new CodeFixerAgent();
agent.connect().catch(err => {
  logger.error('❌ Failed to connect:', err.message);
  process.exit(1);
});
