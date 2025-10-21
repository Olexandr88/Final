#!/usr/bin/env node
/**
 * Startup Orchestrator for Autonomous Agent System
 * Starts AI Bridge + Meta-Agent Factory + Ollama Agent with health checks
 * Coordinates multiple AI sessions working in parallel
 */

import { spawn } from 'child_process';
import { logger } from './src/utils/logger.js';
import http from 'http';

const COMPONENTS = [
  {
    name: 'AI Bridge',
    command: 'node',
    args: ['src/ai-bridge.js'],
    healthCheck: () => checkHttpHealth('http://localhost:65029/health'),
    critical: true,
  },
  {
    name: 'Meta-Agent Factory',
    command: 'node',
    args: ['src/agents/meta-agent-factory.js'],
    healthCheck: () => checkWsConnection('ws://localhost:65028'),
    critical: false,
    dependsOn: ['AI Bridge'],
  },
  {
    name: 'Autonomous Ollama Agent',
    command: 'node',
    args: ['src/agents/autonomous-ollama-agent.js'],
    healthCheck: () => checkWsConnection('ws://localhost:65028'),
    critical: false,
    dependsOn: ['AI Bridge'],
  },
];

class SystemOrchestrator {
  constructor() {
    this.processes = new Map();
    this.startTimes = new Map();
    this.restartCounts = new Map();
  }

  async start() {
    logger.info('🚀 Starting Autonomous Agent System...\n');

    for (const component of COMPONENTS) {
      await this.startComponent(component);
    }

    logger.info('\n✅ All components started!\n');
    this.startHealthMonitoring();
  }

  async startComponent(component) {
    const { name, command, args, dependsOn = [] } = component;

    // Wait for dependencies
    if (dependsOn.length > 0) {
      logger.info(`⏳ ${name} waiting for dependencies: ${dependsOn.join(', ')}`);
      await this.waitForDependencies(dependsOn);
    }

    logger.info(`🔧 Starting ${name}...`);

    const proc = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    proc.stdout.on('data', (data) => {
      logger.info(`[${name}] ${data.toString().trim()}`);
    });

    proc.stderr.on('data', (data) => {
      logger.error(`[${name}] ${data.toString().trim()}`);
    });

    proc.on('exit', (code) => {
      logger.warn(`[${name}] Exited with code ${code}`);

      if (component.critical && code !== 0) {
        logger.error(`Critical component ${name} failed!`);
        this.shutdown();
      } else {
        // Auto-restart non-critical components
        const restartCount = this.restartCounts.get(name) || 0;
        if (restartCount < 3) {
          logger.info(`Restarting ${name}... (attempt ${restartCount + 1}/3)`);
          this.restartCounts.set(name, restartCount + 1);
          setTimeout(() => this.startComponent(component), 5000);
        }
      }
    });

    this.processes.set(name, proc);
    this.startTimes.set(name, Date.now());

    // Wait for component to be healthy
    await this.waitForHealth(component);
  }

  async waitForDependencies(dependsOn) {
    for (const dep of dependsOn) {
      const component = COMPONENTS.find((c) => c.name === dep);
      if (component && component.healthCheck) {
        let healthy = false;
        let attempts = 0;
        while (!healthy && attempts < 30) {
          try {
            await component.healthCheck();
            healthy = true;
          } catch (error) {
            attempts++;
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }
    }
  }

  async waitForHealth(component) {
    if (!component.healthCheck) {
      // No health check, just wait 2 seconds
      await new Promise((r) => setTimeout(r, 2000));
      return;
    }

    let healthy = false;
    let attempts = 0;
    const maxAttempts = 30;

    while (!healthy && attempts < maxAttempts) {
      try {
        await component.healthCheck();
        healthy = true;
        logger.info(`✅ ${component.name} is healthy`);
      } catch (error) {
        attempts++;
        if (attempts % 5 === 0) {
          logger.debug(`Waiting for ${component.name}... (${attempts}/${maxAttempts})`);
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    if (!healthy) {
      logger.warn(`⚠️  ${component.name} did not pass health check after ${maxAttempts}s`);
    }
  }

  startHealthMonitoring() {
    setInterval(async () => {
      for (const component of COMPONENTS) {
        if (!component.healthCheck) continue;

        try {
          await component.healthCheck();
        } catch (error) {
          logger.warn(`Health check failed for ${component.name}`);
        }
      }
    }, 30000); // Every 30 seconds
  }

  async shutdown() {
    logger.info('\n👋 Shutting down Autonomous Agent System...');

    for (const [name, proc] of this.processes) {
      logger.info(`  Stopping ${name}...`);
      proc.kill('SIGTERM');
    }

    setTimeout(() => {
      logger.info('Forcefully terminating...');
      process.exit(1);
    }, 5000);
  }

  getStatus() {
    const status = [];
    for (const [name, proc] of this.processes) {
      const uptime = Math.floor((Date.now() - this.startTimes.get(name)) / 1000);
      status.push({
        name,
        pid: proc.pid,
        uptime: `${uptime}s`,
        restarts: this.restartCounts.get(name) || 0,
      });
    }
    return status;
  }
}

// Helper functions
function checkHttpHealth(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      })
      .on('error', reject);
  });
}

function checkWsConnection(url) {
  // Simplified check - just verify bridge is running
  return checkHttpHealth('http://localhost:65029/health');
}

// Start the system
const orchestrator = new SystemOrchestrator();

orchestrator.start().catch((err) => {
  logger.error('Failed to start system:', err.message);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  orchestrator.shutdown();
});

process.on('SIGTERM', () => {
  orchestrator.shutdown();
});

// Status endpoint (log status every 60s)
setInterval(() => {
  logger.info('\n📊 System Status:');
  const status = orchestrator.getStatus();
  status.forEach((s) => {
    logger.info(`  ${s.name}: PID ${s.pid}, Uptime ${s.uptime}, Restarts: ${s.restarts}`);
  });
}, 60000);
