#!/usr/bin/env node
/**
 * Broadcast Sync - Unified session synchronization
 * Sends periodic sync messages to keep all sessions coordinated
 */

import { TaskCoordinator } from '../src/task-coordinator.js';

const coordinator = new TaskCoordinator('ws://localhost:65028', `broadcast-sync-${Date.now()}`);

const syncSchema = {
  who: null, // Session ID
  what: null, // Action/status
  when: null, // Timestamp
  taskId: null, // Optional task reference
  state: {}, // Additional state data
};

async function startBroadcastSync() {
  console.log('🔄 Starting Broadcast Sync System...\n');

  await coordinator.connect();

  let syncCount = 0;

  // Periodic sync broadcasts every 10 seconds
  setInterval(() => {
    syncCount++;

    const syncMessage = {
      intent: 'session.sync',
      payload: {
        who: coordinator.sessionId,
        what: 'heartbeat',
        when: Date.now(),
        syncId: syncCount,
        state: {
          connected: coordinator.connected,
          claimedTasks: Array.from(coordinator.claimedTasks),
          totalTasks: coordinator.tasks.size,
          capabilities: coordinator.capabilities,
        },
      },
    };

    coordinator.broadcast(syncMessage);

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📡 SYNC BROADCAST #${syncCount}`);
    console.log(`   Time: ${new Date(syncMessage.payload.when).toLocaleTimeString()}`);
    console.log(`   From: ${syncMessage.payload.who}`);
    console.log(
      `   Tasks: ${syncMessage.payload.state.totalTasks} total, ${syncMessage.payload.state.claimedTasks.length} claimed`
    );
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  }, 10000); // Every 10 seconds

  // Listen for sync messages from other sessions
  coordinator.on('message', (message) => {
    if (message.intent === 'session.sync' && message.payload?.who !== coordinator.sessionId) {
      console.log(`📥 Received sync from ${message.payload.who}`);
      console.log(
        `   Tasks: ${message.payload.state?.totalTasks || 0} total, ${message.payload.state?.claimedTasks?.length || 0} claimed\n`
      );
    }

    if (message.intent === 'task.sync') {
      console.log(`📋 Task sync: ${message.payload?.taskId} - ${message.payload?.what}`);
    }
  });

  // Task coordination messages
  coordinator.on('task.claimed', (task) => {
    coordinator.broadcast({
      intent: 'task.sync',
      payload: {
        who: coordinator.sessionId,
        what: 'claimed',
        when: Date.now(),
        taskId: task.id,
        state: { taskTitle: task.title },
      },
    });
  });

  coordinator.on('task.completed', (task) => {
    coordinator.broadcast({
      intent: 'task.sync',
      payload: {
        who: coordinator.sessionId,
        what: 'completed',
        when: Date.now(),
        taskId: task.id,
        state: { taskTitle: task.title, result: task.result },
      },
    });
  });

  console.log('✅ Broadcast Sync System Active');
  console.log('   - Sending sync heartbeats every 10 seconds');
  console.log('   - Listening for sync messages from other sessions');
  console.log('   - Broadcasting task state changes\n');
}

startBroadcastSync().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
