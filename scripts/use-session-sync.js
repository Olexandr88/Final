#!/usr/bin/env node
/**
 * Simple example: Add session sync to your project
 *
 * Usage: node scripts/use-session-sync.js
 */

import SessionSyncManager from '../src/session-sync-manager.js';

async function main() {
  console.log('🔄 Starting session with sync enabled...\n');

  // Create sync manager
  const sync = new SessionSyncManager({
    sessionName: process.env.SESSION_NAME || `Dev-${process.pid}`,
    watchDirectories: ['.'],
    syncInterval: 5000,
  });

  // Listen for remote changes
  sync.on('stateChanged', ({ key, value, remote }) => {
    if (remote) {
      console.log(`📥 Received state update: ${key} = ${JSON.stringify(value)}`);
    }
  });

  sync.on('remoteFileChanged', ({ filepath, fromSession }) => {
    console.log(`📄 ${fromSession.sessionName} modified: ${filepath}`);
  });

  sync.on('taskClaimed', ({ taskId, fromSession }) => {
    console.log(`🔒 ${fromSession.sessionName} claimed task: ${taskId}`);
  });

  sync.on('taskCompleted', ({ taskId, fromSession }) => {
    console.log(`✅ ${fromSession.sessionName} completed task: ${taskId}`);
  });

  // Initialize
  await sync.init();

  console.log('✅ Connected! This session will now sync with others.\n');
  console.log('Example operations:\n');

  // Example 1: Set shared state
  console.log('1. Setting shared state...');
  sync.setState('my.setting', { value: 'hello', timestamp: Date.now() });

  await new Promise((r) => setTimeout(r, 1000));

  // Example 2: Read shared state
  console.log('2. Reading all shared state...');
  const allState = sync.getAllState();
  console.log('   Current state:', JSON.stringify(allState, null, 2));

  await new Promise((r) => setTimeout(r, 1000));

  // Example 3: Claim a task
  console.log('3. Claiming a task...');
  await sync.claimTask('example-task', {
    description: 'Example task to demonstrate coordination',
  });

  await new Promise((r) => setTimeout(r, 2000));

  // Example 4: Complete the task
  console.log('4. Completing the task...');
  await sync.completeTask('example-task', {
    result: 'success',
    completedAt: new Date().toISOString(),
  });

  // Show status
  console.log('\n📊 Session Status:');
  console.log(JSON.stringify(sync.getStatus(), null, 2));

  console.log('\n💡 This session will continue syncing with others.');
  console.log('   Press Ctrl+C to stop.\n');

  // Keep running
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Stopping sync...');
    await sync.cleanup();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
