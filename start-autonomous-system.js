#!/usr/bin/env node
/**
 * Autonomous System Starter
 * Quick start script for the complete autonomous system
 *
 * Usage:
 *   node start-autonomous-system.js                    # Start full system
 *   node start-autonomous-system.js --agents 3        # Start with 3 Ollama agents
 *   node start-autonomous-system.js --model llama3.2  # Use specific model
 */

import { AutonomousCoordinator } from './src/coordination/autonomous-coordinator.js';
import { logger } from './src/utils/logger.js';

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const numAgents = parseInt(args.find(arg => arg.startsWith('--agents'))?.split('=')[1] || '1');
  const model = args.find(arg => arg.startsWith('--model'))?.split('=')[1] || 'llama3.1';
  const skipBridge = args.includes('--skip-bridge');
  const skipFactory = args.includes('--skip-factory');

  logger.info('🚀 Starting Autonomous System');
  logger.info('Configuration:', {
    numAgents,
    model,
    skipBridge,
    skipFactory
  });

  // Initialize coordinator
  const coordinator = new AutonomousCoordinator({
    autoStartBridge: !skipBridge,
    autoStartMetaFactory: !skipFactory
  });

  // Handle graceful shutdown
  const shutdown = async () => {
    logger.info('\n\n🛑 Shutting down...');
    await coordinator.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    // 1. Initialize the system
    await coordinator.initialize();

    // 2. Spawn autonomous agents
    logger.info(`\n📦 Spawning ${numAgents} autonomous agent(s)...`);

    const agents = [];
    for (let i = 0; i < numAgents; i++) {
      const agentId = await coordinator.spawnAutonomousAgent({
        model,
        agentId: `ollama-agent-${i + 1}`
      });

      if (agentId) {
        agents.push(agentId);
        logger.info(`  ✅ Agent ${agentId} ready`);
      }

      // Stagger agent starts to avoid race conditions
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 3. Display system status
    logger.info('\n═══════════════════════════════════════════════');
    logger.info('✨ AUTONOMOUS SYSTEM ONLINE ✨');
    logger.info('═══════════════════════════════════════════════');

    const status = coordinator.getStatus();
    logger.info('\nSystem Status:');
    logger.info(`  Session ID: ${status.sessionId}`);
    logger.info(`  Leader: ${status.isLeader ? 'Yes 👑' : 'No (Follower)'}`);
    logger.info(`  Active Processes: ${status.processes.length}`);
    logger.info(`  Active Agents: ${agents.length}`);
    logger.info(`  File Locks: ${status.locks.file.totalLocks}`);

    logger.info('\nRunning Processes:');
    status.processes.forEach(proc => {
      logger.info(`  - ${proc.id} (${proc.type}) - uptime: ${Math.floor(proc.uptime / 1000)}s`);
    });

    logger.info('\n═══════════════════════════════════════════════');
    logger.info('\n📡 AI Bridge: ws://localhost:65028');
    logger.info('🌐 HTTP API: http://localhost:65029');
    logger.info('\nPress Ctrl+C to shutdown\n');

    // 4. Example usage
    if (args.includes('--demo')) {
      logger.info('\n🎬 Running demo workflow...');

      // Example: Execute a file operation with automatic locking
      await coordinator.executeFileOperation(
        'write',
        './demo-file.txt',
        async () => {
          const fs = await import('fs/promises');
          await fs.writeFile('./demo-file.txt', `Demo from ${coordinator.sessionId}\n`, 'utf-8');
          logger.info('✅ Demo file written with automatic locking');
        }
      );
    }

    // Keep process alive
    await new Promise(() => {}); // Run forever until Ctrl+C

  } catch (error) {
    logger.error('Failed to start autonomous system', {
      error: error.message,
      stack: error.stack
    });
    await coordinator.shutdown();
    process.exit(1);
  }
}

// Help text
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Autonomous System Starter
=========================

Usage: node start-autonomous-system.js [options]

Options:
  --agents=N         Number of Ollama agents to spawn (default: 1)
  --model=NAME       Ollama model to use (default: llama3.1)
  --skip-bridge      Don't start AI Bridge (assume already running)
  --skip-factory     Don't start Meta-Agent Factory
  --demo             Run a demo workflow after startup
  --help, -h         Show this help message

Examples:
  # Start full system with 1 agent
  node start-autonomous-system.js

  # Start with 3 agents using llama3.2
  node start-autonomous-system.js --agents=3 --model=llama3.2

  # Start without bridge (if already running)
  node start-autonomous-system.js --skip-bridge

  # Run demo workflow
  node start-autonomous-system.js --demo
`);
  process.exit(0);
}

main();
