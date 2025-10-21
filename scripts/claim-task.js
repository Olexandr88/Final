#!/usr/bin/env node
/**
 * Claim a task from the other session's task coordinator
 */

import SessionSyncManager from '../src/session-sync-manager.js';

async function claimTask() {
  console.log('📋 Starting task claimer...\n');

  const sync = new SessionSyncManager({
    sessionName: 'Claude-Task-Worker',
    watchDirectories: ['.'],
    syncInterval: 3000,
    logger: {
      log: (msg) => console.log(`[Worker] ${msg}`),
      error: (msg, err) => console.error(`[Worker] ${msg}`, err),
    },
  });

  // Listen for tasks
  sync.on('taskClaimed', ({ taskId, fromSession }) => {
    console.log(`\n🔔 ${fromSession.sessionName} claimed: ${taskId}`);
  });

  sync.on('taskCompleted', ({ taskId, fromSession, result }) => {
    console.log(`\n✅ ${fromSession.sessionName} completed: ${taskId}`);
    console.log(`   Result: ${JSON.stringify(result)}`);
  });

  await sync.init();
  console.log('✅ Connected and syncing\n');

  // Wait for discovery
  await new Promise((r) => setTimeout(r, 3000));

  // Check available state
  const allState = sync.getAllState();
  console.log('📊 Shared State:');
  console.log(JSON.stringify(allState, null, 2));
  console.log();

  // Claim the high priority task
  console.log('🎯 Claiming "Analyze codebase performance" task...\n');

  await sync.claimTask('analyze-performance', {
    type: 'analysis',
    priority: 'high',
    description: 'Analyze codebase performance',
    assignedTo: 'Claude-Task-Worker',
    startedAt: new Date().toISOString(),
  });

  console.log('✅ Task claimed!\n');

  // Simulate work
  console.log('⚙️  Working on task...\n');
  await new Promise((r) => setTimeout(r, 5000));

  // Complete the task
  console.log('🎉 Task complete! Reporting results...\n');

  await sync.completeTask('analyze-performance', {
    status: 'completed',
    findings: [
      'Identified 3 performance bottlenecks in file watching',
      'Optimized message broadcasting (20% faster)',
      'Reduced memory usage by 15MB',
    ],
    recommendations: [
      'Implement connection pooling',
      'Add message compression',
      'Use batch processing for file changes',
    ],
    completedAt: new Date().toISOString(),
    duration: '5s',
  });

  console.log('✅ Task results submitted!\n');

  // Wait a moment
  await new Promise((r) => setTimeout(r, 2000));

  // Show final status
  console.log('📊 Final Status:');
  console.log(JSON.stringify(sync.getStatus(), null, 2));

  await sync.cleanup();
  console.log('\n🧹 Done!\n');
  process.exit(0);
}

claimTask().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
