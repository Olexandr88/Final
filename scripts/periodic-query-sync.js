#!/usr/bin/env node
/**
 * Periodic Query Sync
 * Queries TaskCoordinator API and external endpoints to keep state fresh
 */

import { TaskCoordinator } from '../src/task-coordinator.js';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const coordinator = new TaskCoordinator('ws://localhost:65028', `query-sync-${Date.now()}`);
const QUERY_INTERVAL = 15000; // 15 seconds

async function queryAgents() {
  try {
    const { stdout } = await execAsync(
      'curl -s http://localhost:65029/agents 2>/dev/null || echo "{}"'
    );
    return JSON.parse(stdout.trim() || '{}');
  } catch {
    return {};
  }
}

async function queryTasks() {
  try {
    const { stdout } = await execAsync(
      'curl -s http://localhost:65029/tasks 2>/dev/null || echo "{}"'
    );
    return JSON.parse(stdout.trim() || '{}');
  } catch {
    return {};
  }
}

async function startPeriodicQuerySync() {
  console.log('🔍 Starting Periodic Query Sync System...\n');

  await coordinator.connect();

  let queryCount = 0;

  setInterval(async () => {
    queryCount++;

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🔍 QUERY SYNC #${queryCount} - ${new Date().toLocaleTimeString()}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Query local coordinator state
    const coordStats = coordinator.getStats();
    console.log(`\n📊 Coordinator Stats:`);
    console.log(`   Total Tasks: ${coordStats.total}`);
    console.log(`   Available: ${coordStats.available}`);
    console.log(`   Claimed: ${coordStats.claimed}`);
    console.log(`   Completed: ${coordStats.completed}`);
    console.log(`   Claimed by Us: ${coordStats.claimedByUs}`);

    // Query external APIs
    const [agents, tasks] = await Promise.all([queryAgents(), queryTasks()]);

    if (agents.agents?.length > 0) {
      console.log(`\n🤖 Active Agents: ${agents.agents.length}`);
      agents.agents.forEach((agent) => {
        console.log(`   - ${agent.name || agent.id}: ${agent.status}`);
      });
    }

    if (tasks.tasks?.length > 0) {
      console.log(`\n📋 External Tasks: ${tasks.tasks.length}`);
      tasks.tasks.forEach((task) => {
        console.log(`   - ${task.id}: ${task.status} (${task.type})`);
      });
    }

    // Broadcast fresh state snapshot
    coordinator.broadcast({
      intent: 'state.snapshot',
      payload: {
        from: coordinator.sessionId,
        timestamp: Date.now(),
        coordStats,
        agents: agents.agents || [],
        tasks: tasks.tasks || [],
        queryId: queryCount,
      },
    });

    console.log(`\n✅ State snapshot broadcasted (#${queryCount})`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  }, QUERY_INTERVAL);

  // Listen for state snapshots from other sessions
  coordinator.on('message', (message) => {
    if (message.intent === 'state.snapshot' && message.payload?.from !== coordinator.sessionId) {
      console.log(`📸 Snapshot from ${message.payload.from}:`);
      console.log(`   Tasks: ${message.payload.coordStats?.total || 0}`);
      console.log(`   Agents: ${message.payload.agents?.length || 0}\n`);
    }
  });

  console.log('✅ Periodic Query Sync Active');
  console.log(`   - Querying every ${QUERY_INTERVAL / 1000} seconds`);
  console.log('   - Broadcasting state snapshots');
  console.log('   - Listening for updates from other sessions\n');
}

startPeriodicQuerySync().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
