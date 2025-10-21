/**
 * Session Monitor - Continuous background monitoring of all sessions
 * Run with: ! node src/coordination/session-monitor.js &
 * @module session-monitor
 */

import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';

const SESSIONS = [
  'session-1-coordinator',
  'session-2-observer',
  'session-3-factory',
  'session-4-testing',
  'session-5-development',
  'session-6-optimization',
  'session-7-security',
];

const STATE_DIR = '.agent-locks/SESSION-STATE';
const CHECK_INTERVAL = 60000; // 1 minute
const STALE_THRESHOLD = 30 * 60 * 1000; // 30 minutes

class SessionMonitor {
  constructor() {
    this.alerts = [];
    this.lastCheck = Date.now();
  }

  /**
   * Check health of all sessions
   */
  async checkAllSessions() {
    const now = new Date();
    const report = {
      timestamp: now.toISOString(),
      healthy: [],
      warning: [],
      critical: [],
      stale: [],
      missing: [],
    };

    for (const sessionId of SESSIONS) {
      try {
        const statePath = path.join(STATE_DIR, `${sessionId}.json`);
        const data = await fs.readFile(statePath, 'utf-8');
        const state = JSON.parse(data);

        // Check token count status
        const status = state.context?.status || state.status;
        if (status === 'critical') {
          report.critical.push({ sessionId, tokens: state.context?.estimatedTokens });
          this.logAlert('CRITICAL', sessionId, `Token count: ${state.context?.estimatedTokens}`);
        } else if (status === 'warning') {
          report.warning.push({ sessionId, tokens: state.context?.estimatedTokens });
          this.logAlert('WARNING', sessionId, `Token count: ${state.context?.estimatedTokens}`);
        } else {
          report.healthy.push({ sessionId, tokens: state.context?.estimatedTokens });
        }

        // Check for stale sessions
        const lastUpdate = new Date(state.lastUpdate);
        const timeSinceUpdate = now - lastUpdate;
        if (timeSinceUpdate > STALE_THRESHOLD) {
          report.stale.push({
            sessionId,
            minutesSinceUpdate: Math.floor(timeSinceUpdate / 60000),
          });
          this.logAlert(
            'STALE',
            sessionId,
            `No update for ${Math.floor(timeSinceUpdate / 60000)} minutes`
          );
        }
      } catch (error) {
        report.missing.push(sessionId);
        // Don't log missing sessions as alerts - they may not be started yet
      }
    }

    return report;
  }

  /**
   * Log alert to console and file
   */
  logAlert(level, sessionId, message) {
    const alert = {
      timestamp: new Date().toISOString(),
      level,
      sessionId,
      message,
    };

    this.alerts.push(alert);

    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts.shift();
    }

    // Console output with emoji
    const emoji = {
      CRITICAL: '🔴',
      WARNING: '⚠️',
      STALE: '⏰',
      INFO: 'ℹ️',
    };

    console.log(`${emoji[level]} [${level}] ${sessionId}: ${message}`);
    logger.warn(`[${level}] ${sessionId}: ${message}`);
  }

  /**
   * Save monitoring report
   */
  async saveReport(report) {
    try {
      const reportPath = '.agent-locks/METRICS/monitoring-report.json';
      await fs.mkdir('.agent-locks/METRICS', { recursive: true });
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    } catch (error) {
      logger.error('Failed to save monitoring report:', error);
    }
  }

  /**
   * Check for sessions needing handoff
   */
  async checkHandoffNeeds() {
    try {
      const coordPath = '.agent-locks/SESSION-COORDINATION.json';
      const data = await fs.readFile(coordPath, 'utf-8');
      const coord = JSON.parse(data);

      const needsHandoff = Object.entries(coord.sessions || {})
        .filter(([id, state]) => state.status === 'CONTEXT_FULL')
        .map(([id, state]) => ({ sessionId: id, handoffFile: state.handoffFile }));

      if (needsHandoff.length > 0) {
        console.log('🔄 SESSIONS NEEDING HANDOFF:');
        needsHandoff.forEach(({ sessionId, handoffFile }) => {
          console.log(`   ${sessionId} → ${handoffFile}`);
        });
        this.logAlert('CRITICAL', 'coordinator', `${needsHandoff.length} sessions need handoff`);
      }

      return needsHandoff;
    } catch (error) {
      logger.error('Failed to check handoff needs:', error);
      return [];
    }
  }

  /**
   * Display summary
   */
  displaySummary(report) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📊 Session Monitor Report - ${report.timestamp}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (report.healthy.length > 0) {
      console.log(`✅ Healthy Sessions (${report.healthy.length}):`);
      report.healthy.forEach(({ sessionId, tokens }) => {
        console.log(`   ${sessionId}: ${tokens || 'N/A'} tokens`);
      });
      console.log();
    }

    if (report.warning.length > 0) {
      console.log(`⚠️  Warning Sessions (${report.warning.length}):`);
      report.warning.forEach(({ sessionId, tokens }) => {
        console.log(`   ${sessionId}: ${tokens} tokens (approaching limit)`);
      });
      console.log();
    }

    if (report.critical.length > 0) {
      console.log(`🔴 Critical Sessions (${report.critical.length}):`);
      report.critical.forEach(({ sessionId, tokens }) => {
        console.log(`   ${sessionId}: ${tokens} tokens (NEEDS HANDOFF)`);
      });
      console.log();
    }

    if (report.stale.length > 0) {
      console.log(`⏰ Stale Sessions (${report.stale.length}):`);
      report.stale.forEach(({ sessionId, minutesSinceUpdate }) => {
        console.log(`   ${sessionId}: No update for ${minutesSinceUpdate} minutes`);
      });
      console.log();
    }

    if (report.missing.length > 0) {
      console.log(`❓ Not Started (${report.missing.length}):`);
      report.missing.forEach((sessionId) => {
        console.log(`   ${sessionId}`);
      });
      console.log();
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  /**
   * Main monitoring loop
   */
  async start() {
    console.log('🚀 Session Monitor Starting...');
    console.log(`   Monitoring ${SESSIONS.length} sessions`);
    console.log(`   Check interval: ${CHECK_INTERVAL / 1000}s`);
    console.log(`   Stale threshold: ${STALE_THRESHOLD / 60000} minutes\n`);

    while (true) {
      try {
        // Check all sessions
        const report = await this.checkAllSessions();

        // Check for handoff needs
        const handoffs = await this.checkHandoffNeeds();

        // Display summary
        this.displaySummary(report);

        // Save report
        await this.saveReport(report);

        // Wait for next check
        await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL));
      } catch (error) {
        logger.error('Monitor loop error:', error);
        console.error('❌ Monitor error:', error.message);
        // Continue monitoring despite errors
        await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL));
      }
    }
  }
}

// Start monitoring
const monitor = new SessionMonitor();
monitor.start().catch((error) => {
  console.error('💥 Monitor crashed:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Session Monitor shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Session Monitor shutting down...');
  process.exit(0);
});
