#!/usr/bin/env node
/**
 * A2A Auto-Deployment Script
 * Manages A2A services with auto-restart and health monitoring
 */

import { spawn } from 'child_process';
import http from 'http';

const services = {
  bridge: {
    name: 'AI Bridge',
    cmd: 'node',
    args: ['src/ai-bridge.js'],
    healthUrl: 'http://localhost:4568/health',
    restartDelay: 3000,
  },
  a2a: {
    name: 'A2A Server',
    cmd: 'node',
    args: ['src/enhanced-a2a-server.js'],
    healthUrl: 'http://localhost:3001/health',
    restartDelay: 3000,
  },
};

const processes = new Map();

async function checkHealth(url) {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const req = http.get(
      {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        timeout: 2000,
      },
      (res) => {
        resolve(res.statusCode === 200);
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function startService(key, config) {
  console.log(`🚀 Starting ${config.name}...`);

  const proc = spawn(config.cmd, config.args, {
    stdio: 'pipe',
    shell: true,
  });

  proc.stdout.on('data', (data) => {
    console.log(`[${config.name}] ${data.toString().trim()}`);
  });

  proc.stderr.on('data', (data) => {
    console.error(`[${config.name}] ERROR: ${data.toString().trim()}`);
  });

  proc.on('exit', (code) => {
    console.log(`⚠️  ${config.name} exited with code ${code}`);
    processes.delete(key);

    // Auto-restart
    setTimeout(() => {
      console.log(`🔄 Restarting ${config.name}...`);
      startService(key, config);
    }, config.restartDelay);
  });

  processes.set(key, proc);
  console.log(`✅ ${config.name} started (PID: ${proc.pid})`);
}

async function monitorHealth() {
  for (const [key, config] of Object.entries(services)) {
    if (processes.has(key)) {
      const healthy = await checkHealth(config.healthUrl);
      if (!healthy) {
        console.log(`❌ ${config.name} health check failed - restarting...`);
        processes.get(key).kill();
      }
    }
  }
}

// Start all services
console.log('🎯 A2A Auto-Deployment Starting...\n');

for (const [key, config] of Object.entries(services)) {
  startService(key, config);
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

// Health monitoring every 30s
setInterval(monitorHealth, 30000);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down A2A services...');
  for (const proc of processes.values()) {
    proc.kill();
  }
  process.exit(0);
});

console.log('\n✅ A2A services deployed with auto-restart');
console.log('📊 Health monitoring active (30s interval)');
console.log('Press Ctrl+C to stop all services\n');
