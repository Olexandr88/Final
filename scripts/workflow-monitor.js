/**
 * Real-time Workflow Monitor
 * Displays live progress of multi-agent workflows
 */

import fs from 'fs/promises';
import path from 'path';

const BRIDGE_URL = 'http://localhost:51179';
const WORKSPACE = '.multi-claude/shared';
const REFRESH_INTERVAL = 2000; // 2 seconds

// Terminal colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

class WorkflowMonitor {
  constructor() {
    this.running = true;
    this.lastMessageCount = 0;
    this.startTime = Date.now();
    this.phases = {
      architect: { status: 'pending', startTime: null, endTime: null, charCount: 0 },
      developer: { status: 'pending', startTime: null, endTime: null, charCount: 0 },
      tester: { status: 'pending', startTime: null, endTime: null, charCount: 0 }
    };
  }

  clearScreen() {
    process.stdout.write('\x1Bc');
  }

  async getBridgeStatus() {
    try {
      const response = await fetch(`${BRIDGE_URL}/api/status`);
      return await response.json();
    } catch (error) {
      return { error: error.message };
    }
  }

  async getHistory() {
    try {
      const response = await fetch(`${BRIDGE_URL}/history`);
      const data = await response.json();
      return data.history || [];
    } catch (error) {
      return [];
    }
  }

  async getDeliverables() {
    try {
      const files = await fs.readdir(WORKSPACE);
      const stats = await Promise.all(
        files.map(async (file) => {
          const filepath = path.join(WORKSPACE, file);
          const stat = await fs.stat(filepath);
          const content = await fs.readFile(filepath, 'utf-8');
          return {
            name: file,
            size: stat.size,
            charCount: content.length,
            modified: stat.mtime
          };
        })
      );
      return stats.sort((a, b) => b.modified - a.modified);
    } catch (error) {
      return [];
    }
  }

  analyzeHistory(history) {
    const recentMessages = history.slice(-20);

    // Check for architect responses
    const archResponses = recentMessages.filter(msg =>
      msg.intent === 'ai.response' &&
      msg.payload?.response?.toLowerCase().includes('architect')
    );
    if (archResponses.length > 0 && this.phases.architect.status === 'pending') {
      this.phases.architect.status = 'complete';
      this.phases.architect.endTime = Date.now();
      this.phases.architect.charCount = archResponses[0].payload.response.length;
    }

    // Check for developer responses
    const devResponses = recentMessages.filter(msg =>
      msg.intent === 'ai.response' &&
      (msg.payload?.response?.toLowerCase().includes('implement') ||
       msg.payload?.response?.toLowerCase().includes('code'))
    );
    if (devResponses.length > 0 && this.phases.developer.status === 'pending') {
      this.phases.developer.status = 'complete';
      this.phases.developer.endTime = Date.now();
      this.phases.developer.charCount = devResponses[0].payload.response.length;
    }

    // Check for tester responses
    const testResponses = recentMessages.filter(msg =>
      msg.intent === 'ai.response' &&
      (msg.payload?.response?.toLowerCase().includes('test') ||
       msg.payload?.response?.toLowerCase().includes('qa'))
    );
    if (testResponses.length > 0 && this.phases.tester.status === 'pending') {
      this.phases.tester.status = 'complete';
      this.phases.tester.endTime = Date.now();
      this.phases.tester.charCount = testResponses[0].payload.response.length;
    }

    // Check for in-progress
    const recentQueries = recentMessages.filter(msg =>
      msg.intent === 'ai.query' &&
      Date.now() - new Date(msg.timestamp).getTime() < 10000
    );

    if (recentQueries.length > 0) {
      if (this.phases.architect.status === 'pending') {
        this.phases.architect.status = 'in-progress';
        this.phases.architect.startTime = new Date(recentQueries[0].timestamp).getTime();
      } else if (this.phases.developer.status === 'pending' && this.phases.architect.status === 'complete') {
        this.phases.developer.status = 'in-progress';
        this.phases.developer.startTime = new Date(recentQueries[0].timestamp).getTime();
      } else if (this.phases.tester.status === 'pending' && this.phases.developer.status === 'complete') {
        this.phases.tester.status = 'in-progress';
        this.phases.tester.startTime = new Date(recentQueries[0].timestamp).getTime();
      }
    }
  }

  formatDuration(ms) {
    if (!ms) return '--';
    const seconds = Math.floor(ms / 1000);
    return `${seconds}s`;
  }

  getStatusIcon(status) {
    switch (status) {
      case 'complete': return `${colors.green}✓${colors.reset}`;
      case 'in-progress': return `${colors.yellow}⟳${colors.reset}`;
      case 'pending': return `${colors.dim}○${colors.reset}`;
      default: return '?';
    }
  }

  getStatusColor(status) {
    switch (status) {
      case 'complete': return colors.green;
      case 'in-progress': return colors.yellow;
      case 'pending': return colors.dim;
      default: return colors.reset;
    }
  }

  async render() {
    this.clearScreen();

    const status = await this.getBridgeStatus();
    const history = await this.getHistory();
    const deliverables = await this.getDeliverables();

    this.analyzeHistory(history);

    const elapsed = Date.now() - this.startTime;
    const elapsedSeconds = Math.floor(elapsed / 1000);

    // Header
    console.log(`${colors.bright}${colors.cyan}╔═══════════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}║         MULTI-AGENT WORKFLOW MONITOR                          ║${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}╚═══════════════════════════════════════════════════════════════╝${colors.reset}`);
    console.log('');

    // System Status
    console.log(`${colors.bright}📊 SYSTEM STATUS${colors.reset}`);
    console.log(`   Bridge: ${status.status === 'healthy' ? colors.green + '●' + colors.reset : colors.red + '●' + colors.reset} ${status.status || 'unknown'}`);
    console.log(`   Messages: ${history.length}`);
    console.log(`   Uptime: ${elapsedSeconds}s`);
    console.log('');

    // Workflow Progress
    console.log(`${colors.bright}🎯 WORKFLOW PROGRESS${colors.reset}`);
    console.log('');

    const phases = ['architect', 'developer', 'tester'];
    const labels = ['📐 Architecture', '💻 Development', '🧪 Testing'];

    phases.forEach((phase, idx) => {
      const p = this.phases[phase];
      const icon = this.getStatusIcon(p.status);
      const color = this.getStatusColor(p.status);
      const duration = p.endTime && p.startTime ? this.formatDuration(p.endTime - p.startTime) : '--';
      const chars = p.charCount > 0 ? `${p.charCount} chars` : '--';

      console.log(`   ${icon} ${color}${labels[idx]}${colors.reset}`);
      console.log(`      Status: ${color}${p.status}${colors.reset} | Duration: ${duration} | Output: ${chars}`);

      if (idx < phases.length - 1) {
        console.log(`      ${colors.dim}↓${colors.reset}`);
      }
    });

    console.log('');

    // Deliverables
    console.log(`${colors.bright}📦 DELIVERABLES${colors.reset}`);
    if (deliverables.length > 0) {
      deliverables.slice(0, 5).forEach(file => {
        const age = Math.floor((Date.now() - file.modified.getTime()) / 1000);
        console.log(`   ${colors.green}●${colors.reset} ${file.name}`);
        console.log(`      ${colors.dim}${file.charCount} chars | ${age}s ago${colors.reset}`);
      });
    } else {
      console.log(`   ${colors.dim}No deliverables yet...${colors.reset}`);
    }

    console.log('');
    console.log(`${colors.dim}Press Ctrl+C to exit${colors.reset}`);
  }

  async start() {
    console.log('Starting workflow monitor...\n');

    const interval = setInterval(async () => {
      if (!this.running) {
        clearInterval(interval);
        return;
      }

      try {
        await this.render();
      } catch (error) {
        console.error('Monitor error:', error.message);
      }
    }, REFRESH_INTERVAL);

    // Initial render
    await this.render();

    // Handle Ctrl+C
    process.on('SIGINT', () => {
      this.running = false;
      clearInterval(interval);
      this.clearScreen();
      console.log('\nMonitor stopped.\n');
      process.exit(0);
    });
  }
}

// Start monitor
const monitor = new WorkflowMonitor();
monitor.start().catch(console.error);
