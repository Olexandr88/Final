#!/usr/bin/env node
/**
 * EXAMPLE: How to Use Existing Autonomous Ollama System
 * This demonstrates usage - does NOT create new systems
 */

import { ToolExecutor } from './src/tools/tool-executor.js';
import { fileLockManager } from './src/coordination/file-lock-manager.js';

console.log('📚 EXAMPLE USAGE SCRIPTS\n');
console.log('These examples show how to use the EXISTING autonomous system');
console.log('='.repeat(70) + '\n');

// ============================================================================
// EXAMPLE 1: Direct Tool Execution (Simple)
// ============================================================================
console.log('EXAMPLE 1: Direct Tool Execution');
console.log('-'.repeat(70));

async function example1_DirectToolExecution() {
  // Create tool executor with permissions
  const executor = new ToolExecutor('example-agent', {
    file_read: true,
    file_write: true,
    command_exec: true,
    git_operations: true,
  });

  console.log('✅ Available tools:', executor.getAvailableTools().join(', '));

  // Read a file
  const readResult = await executor.executeTool('read', {
    file_path: 'package.json',
  });

  console.log('✅ Read package.json');
  console.log('   Preview:', readResult.result.content.substring(0, 100) + '...\n');
}

// ============================================================================
// EXAMPLE 2: Safe File Writing with Locks (Multi-Session Safe)
// ============================================================================
console.log('EXAMPLE 2: Safe File Writing with Locks');
console.log('-'.repeat(70));

async function example2_SafeFileWriting() {
  const agentId = 'example-writer';
  const filePath = './example-output.txt';
  const content = `Written at ${new Date().toISOString()} by example script`;

  // Acquire lock before writing
  const acquired = await fileLockManager.acquireLock(agentId, filePath);

  if (acquired) {
    console.log('✅ Lock acquired for', filePath);

    try {
      const executor = new ToolExecutor(agentId, { file_write: true });
      await executor.executeTool('write', { file_path: filePath, content });
      console.log('✅ File written successfully');
    } finally {
      await fileLockManager.releaseLock(agentId, filePath);
      console.log('✅ Lock released\n');
    }
  } else {
    console.log('❌ Could not acquire lock (another session using file)\n');
  }
}

// ============================================================================
// EXAMPLE 3: Using withLock Helper (Recommended)
// ============================================================================
console.log('EXAMPLE 3: Using withLock Helper (Cleaner)');
console.log('-'.repeat(70));

async function example3_WithLockHelper() {
  const agentId = 'example-helper';
  const filePath = './example-locked.txt';

  await fileLockManager.withLock(agentId, filePath, async () => {
    console.log('✅ Inside locked section - safe to modify file');

    const executor = new ToolExecutor(agentId, { file_write: true });
    await executor.executeTool('write', {
      file_path: filePath,
      content: 'This was written safely with automatic locking',
    });

    console.log('✅ File written, lock will auto-release');
  });

  console.log('✅ Lock automatically released\n');
}

// ============================================================================
// EXAMPLE 4: Git Operations
// ============================================================================
console.log('EXAMPLE 4: Git Operations');
console.log('-'.repeat(70));

async function example4_GitOperations() {
  const executor = new ToolExecutor('git-example', {
    git_operations: true,
  });

  // Get git status
  const statusResult = await executor.executeTool('git_status', {});
  console.log('✅ Git Status:', statusResult.result.status ? 'Changes detected' : 'Clean');

  // Get git log
  const logResult = await executor.executeTool('git_log', { limit: 5 });
  console.log('✅ Recent commits:', logResult.result.commits.length);
  console.log('   Latest:', logResult.result.commits[0]);
  console.log();
}

// ============================================================================
// EXAMPLE 5: Command Execution
// ============================================================================
console.log('EXAMPLE 5: Command Execution');
console.log('-'.repeat(70));

async function example5_CommandExecution() {
  const executor = new ToolExecutor('cmd-example', {
    command_exec: true,
  });

  // Run a safe command
  const result = await executor.executeTool('bash', {
    command: 'echo',
    args: ['Hello from autonomous tool executor!'],
  });

  console.log('✅ Command output:', result.result.stdout);
  console.log();
}

// ============================================================================
// EXAMPLE 6: Check Active Locks (Monitoring)
// ============================================================================
console.log('EXAMPLE 6: Check Active Locks (Monitoring)');
console.log('-'.repeat(70));

async function example6_MonitorLocks() {
  const activeLocks = await fileLockManager.getActiveLocks();
  console.log('✅ Active locks:', activeLocks.length);

  if (activeLocks.length > 0) {
    activeLocks.forEach((lock) => {
      console.log('   -', lock.filePath, 'locked by', lock.agentId);
    });
  } else {
    console.log('   No active locks');
  }

  const stats = fileLockManager.getStats();
  console.log('✅ Lock stats:');
  console.log('   Active agents:', stats.activeAgents);
  console.log('   Total locks:', stats.totalLocks);
  console.log();
}

// ============================================================================
// EXAMPLE 7: Metrics Tracking
// ============================================================================
console.log('EXAMPLE 7: Metrics Tracking');
console.log('-'.repeat(70));

async function example7_MetricsTracking() {
  const executor = new ToolExecutor('metrics-example', {
    file_read: true,
    file_write: true,
  });

  // Perform some operations
  await executor.executeTool('read', { file_path: 'package.json' });
  await executor.executeTool('write', {
    file_path: './metrics-test.txt',
    content: 'Test',
  });

  // Get metrics
  const metrics = executor.getMetrics();
  console.log('✅ Execution metrics:');
  console.log('   Total executions:', metrics.totalExecutions);
  console.log('   Success rate:', metrics.successRate);
  console.log('   Tool usage:', Object.keys(metrics.toolUsage).join(', '));
  console.log();
}

// ============================================================================
// RUN ALL EXAMPLES
// ============================================================================

async function runAllExamples() {
  try {
    await example1_DirectToolExecution();
    await example2_SafeFileWriting();
    await example3_WithLockHelper();
    await example4_GitOperations();
    await example5_CommandExecution();
    await example6_MonitorLocks();
    await example7_MetricsTracking();

    console.log('='.repeat(70));
    console.log('✅ ALL EXAMPLES COMPLETED SUCCESSFULLY\n');
    console.log('Key Takeaways:');
    console.log('1. Use ToolExecutor for direct tool access');
    console.log('2. Use fileLockManager.withLock() for safe file operations');
    console.log('3. Always set appropriate permissions');
    console.log('4. Monitor locks to prevent conflicts');
    console.log('5. Track metrics for observability');
    console.log('\nThese patterns work with:');
    console.log('- standalone-ollama-executor.js (standalone mode)');
    console.log('- start-autonomous-system.js (full system)');
    console.log('- Any custom agent implementations\n');
  } catch (error) {
    console.error('❌ Error running examples:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  runAllExamples();
}

export {
  example1_DirectToolExecution,
  example2_SafeFileWriting,
  example3_WithLockHelper,
  example4_GitOperations,
  example5_CommandExecution,
  example6_MonitorLocks,
  example7_MetricsTracking,
};
