#!/usr/bin/env node
/**
 * Autonomous Workflow Example
 * Demonstrates how to use the unified autonomous system
 *
 * This example shows:
 * 1. Creating specialized agents via Meta-Agent Factory
 * 2. Using Ollama agents for code analysis
 * 3. Automatic file locking across multiple AI sessions
 * 4. Batch operations for parallel execution
 */

import { BridgeAPIClient } from '../src/coordination/api-client.js';
import { AutonomousCoordinator } from '../src/coordination/autonomous-coordinator.js';
import { logger } from '../src/utils/logger.js';

async function main() {
  logger.info('🚀 Starting Autonomous Workflow Example\n');

  // 1. Initialize coordinator (this handles locking for us)
  const coordinator = new AutonomousCoordinator({
    autoStartBridge: false, // Assume bridge is already running
    autoStartMetaFactory: false
  });

  await coordinator.initialize();
  logger.info('✅ Coordinator initialized\n');

  // 2. Create API client
  const api = new BridgeAPIClient();

  try {
    // 3. Check system health
    logger.info('📊 Checking system health...');
    const health = await api.getHealth();
    logger.info('Health:', health);

    // 4. Get connected agents
    const clients = await api.getClients();
    logger.info('\n📡 Connected agents:', clients);

    // 5. Create specialized agents in PARALLEL
    logger.info('\n🏭 Creating specialized agents...');

    const agentCreationResults = await api.sendBatch([
      {
        to: 'meta-agent-factory',
        intent: 'agent.create',
        payload: { type: 'security-scanner', name: 'security-agent-1' }
      },
      {
        to: 'meta-agent-factory',
        intent: 'agent.create',
        payload: { type: 'test-generator', name: 'test-gen-1' }
      },
      {
        to: 'meta-agent-factory',
        intent: 'agent.create',
        payload: { type: 'doc-generator', name: 'doc-gen-1' }
      }
    ]);

    logger.info('Agent creation results:', agentCreationResults);

    // 6. Spawn the agents
    logger.info('\n🚀 Spawning agents...');
    await api.spawnAgent('security-agent-1');
    await api.spawnAgent('test-gen-1');
    logger.info('✅ Agents spawned');

    // 7. Use Ollama agent for code analysis (if available)
    logger.info('\n🤖 Querying Ollama agent...');

    try {
      const analysisResult = await api.queryOllama(
        'Analyze this e-commerce cart code and provide 5 critical fixes needed: var declarations, console.log statements, hardcoded password, SQL injection vulnerability, and == vs === comparison. Be specific and concise.',
        'ollama-agent-1'
      );

      logger.info('Analysis result:', analysisResult);
    } catch (error) {
      logger.warn('Ollama agent not available:', error.message);
    }

    // 8. Demonstrate file locking
    logger.info('\n🔒 Demonstrating automatic file locking...');

    // This automatically acquires locks at both session and file level
    await coordinator.executeFileOperation(
      'write',
      './examples/demo-output.txt',
      async () => {
        const fs = await import('fs/promises');
        const content = `
Autonomous Workflow Example Output
===================================
Session: ${coordinator.sessionId}
Timestamp: ${new Date().toISOString()}
System Status: ${JSON.stringify(coordinator.getStatus(), null, 2)}
`;
        await fs.writeFile('./examples/demo-output.txt', content, 'utf-8');
        logger.info('✅ File written with automatic locking');
      }
    );

    // 9. List all spawned agents
    logger.info('\n📋 Listing spawned agents...');
    const agentList = await api.listAgents();
    logger.info('Spawned agents:', agentList);

    logger.info('\n✨ Workflow complete!');

  } catch (error) {
    logger.error('Workflow failed:', {
      error: error.message,
      stack: error.stack
    });
  } finally {
    await coordinator.shutdown();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  main().catch(error => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });
}

export default main;
