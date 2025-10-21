/**
 * Auto-Sync Loop
 * Periodically queries agents/tasks and broadcasts session.sync messages
 * Creates a unified timeline for all coordinators
 */

import { TaskCoordinator } from '../src/task-coordinator.js';
import fs from 'node:fs';
import path from 'node:path';

const logPath = path.resolve(process.cwd(), 'logs/auto-sync-loop.log');
fs.mkdirSync(path.dirname(logPath), { recursive: true });

const writeLog = (message) => {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  fs.appendFileSync(logPath, `${line}\n`);
};

const coordinator = new TaskCoordinator(undefined, `auto-sync-${Date.now()}`);

// Configuration
const QUERY_INTERVAL = 15000; // 15 seconds
const SYNC_INTERVAL = 30000; // 30 seconds
const HTTP_API = process.env.AI_BRIDGE_HTTP_PORT
  ? `http://localhost:${process.env.AI_BRIDGE_HTTP_PORT}`
  : 'http://localhost:65029';

// Query agents via HTTP API
const queryAgents = async () => {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`${HTTP_API}/agents`);
    const data = await response.json();

    writeLog(`agents_query count=${data.agents?.length || 0}`);

    // Broadcast agent snapshot
    coordinator.broadcast({
      intent: 'session.sync',
      payload: {
        type: 'agents_snapshot',
        who: coordinator.sessionId,
        what: {
          totalAgents: data.agents?.length || 0,
          agentIds: data.agents?.map((a) => a.id) || [],
        },
        when: Date.now(),
      },
    });

    return data.agents || [];
  } catch (error) {
    writeLog(`agents_query_error: ${error.message}`);
    return [];
  }
};

// Query tasks via HTTP API
const queryTasks = async () => {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`${HTTP_API}/tasks`);
    const data = await response.json();

    const stats = {
      total: data.tasks?.length || 0,
      available: data.tasks?.filter((t) => t.status === 'available').length || 0,
      claimed: data.tasks?.filter((t) => t.status === 'claimed').length || 0,
      completed: data.tasks?.filter((t) => t.status === 'completed').length || 0,
    };

    writeLog(
      `tasks_query total=${stats.total} available=${stats.available} claimed=${stats.claimed} completed=${stats.completed}`
    );

    // Broadcast task snapshot
    coordinator.broadcast({
      intent: 'task.sync',
      payload: {
        type: 'tasks_snapshot',
        who: coordinator.sessionId,
        what: stats,
        when: Date.now(),
      },
    });

    return data.tasks || [];
  } catch (error) {
    writeLog(`tasks_query_error: ${error.message}`);
    return [];
  }
};

// Query local task coordinator state
const queryLocalState = () => {
  const stats = coordinator.getStats();
  const state = {
    sessionId: coordinator.sessionId,
    stats,
    claimedTasks: Array.from(coordinator.claimedTasks.values()),
    discoveredSessions: coordinator.discoveredSessions
      ? Array.from(coordinator.discoveredSessions.values()).map((s) => ({
          id: s.sessionId || s.from,
          name: s.sessionName,
          capabilities: s.capabilities,
        }))
      : [],
  };

  const sessionsCount = coordinator.discoveredSessions ? coordinator.discoveredSessions.size : 0;
  writeLog(
    `local_state tasks=${stats.total} sessions=${sessionsCount} claimed=${stats.claimedByUs}`
  );

  // Broadcast state snapshot
  coordinator.broadcast({
    intent: 'session.sync',
    payload: {
      type: 'state_snapshot',
      who: coordinator.sessionId,
      what: state,
      when: Date.now(),
    },
  });

  return state;
};

// Heartbeat with state
const sendHeartbeat = () => {
  const stats = coordinator.getStats();

  coordinator.broadcast({
    intent: 'session.heartbeat',
    payload: {
      sessionId: coordinator.sessionId,
      timestamp: Date.now(),
      state: {
        tasks: stats,
        sessions: coordinator.discoveredSessions.size,
        uptime: Date.now() - startTime,
      },
    },
  });

  writeLog('heartbeat_sent');
};

// Start time
let startTime = Date.now();

// Event handlers
coordinator.on('task.available', (task) => {
  writeLog(`task.available id=${task.id} title="${task.title}"`);
});

coordinator.on('task.claimed.other', (task) => {
  writeLog(`task.claimed id=${task.id} by=${task.claimedBy}`);
});

coordinator.on('task.completed', (task) => {
  writeLog(`task.completed id=${task.id}`);
});

coordinator.on('session.discovered', (session) => {
  writeLog(
    `session.discovered id=${session.sessionId || session.from} name="${session.sessionName || 'unknown'}"`
  );
});

// Main loop
coordinator
  .connect()
  .then(() => {
    writeLog(`connected sessionId=${coordinator.sessionId}`);

    // Query loops
    setInterval(async () => {
      await queryAgents();
      await queryTasks();
      queryLocalState();
    }, QUERY_INTERVAL);

    // Sync loop
    setInterval(() => {
      sendHeartbeat();
    }, SYNC_INTERVAL);

    // Initial queries
    setTimeout(async () => {
      await queryAgents();
      await queryTasks();
      queryLocalState();
    }, 2000);

    process.on('SIGINT', () => {
      writeLog('shutting_down');
      coordinator.disconnect();
      process.exit(0);
    });
  })
  .catch((error) => {
    writeLog(`connection_error: ${error.message}`);
    process.exit(1);
  });
