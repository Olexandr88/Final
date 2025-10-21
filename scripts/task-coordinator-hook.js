/**
 * Task Coordinator Hook
 * Keeps an always-on coordinator session connected to the AI Bridge,
 * emitting heartbeats and logging task/session activity for monitoring.
 */

import fs from 'node:fs';
import path from 'node:path';
import { TaskCoordinator } from '../src/task-coordinator.js';

const resolveBridgeUrl = () => {
  if (process.env.AI_BRIDGE_WS) {
    return process.env.AI_BRIDGE_WS;
  }

  const port = process.env.AI_BRIDGE_PORT || 65028;
  const host = process.env.AI_BRIDGE_HOST || 'localhost';
  const protocol = process.env.AI_BRIDGE_PROTOCOL || 'ws';
  return `${protocol}://${host}:${port}`;
};

const resolveBridgeHttpBase = () => {
  if (process.env.AI_BRIDGE_HTTP) {
    return process.env.AI_BRIDGE_HTTP.replace(/\/$/, '');
  }

  const port = process.env.AI_BRIDGE_HTTP_PORT || 65029;
  const host = process.env.AI_BRIDGE_HTTP_HOST || process.env.AI_BRIDGE_HOST || 'localhost';
  const protocol = process.env.AI_BRIDGE_HTTP_PROTOCOL || 'http';
  return `${protocol}://${host}:${port}`;
};

const logPath =
  process.env.TASK_HOOK_LOG || path.resolve(process.cwd(), 'logs/task-coordinator-hook.log');
fs.mkdirSync(path.dirname(logPath), { recursive: true });

const writeLog = (message) => {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  fs.appendFileSync(logPath, `${line}\n`);
};

const coordinator = new TaskCoordinator(
  resolveBridgeUrl(),
  process.env.TASK_HOOK_SESSION_ID || `task-hook-${Date.now()}`
);
const heartbeatIntervalMs = Number(process.env.TASK_HOOK_HEARTBEAT_MS || 15000);
const statsIntervalMs = Number(process.env.TASK_HOOK_STATS_MS || 30000);
const runtimeLimitMs = Number(process.env.TASK_HOOK_RUNTIME_MS || 0);
let heartbeatTimer = null;
let statsTimer = null;
let shuttingDown = false;
const bridgeHttpBase = resolveBridgeHttpBase();

const handleStatsLog = () => {
  const stats = coordinator.getStats();
  writeLog(
    `stats total=${stats.total} available=${stats.available} claimed=${stats.claimed} completed=${stats.completed} claimedByUs=${stats.claimedByUs}`
  );
};

const fetchJson = async (path) => {
  const url = `${bridgeHttpBase}${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`request failed ${res.status} for ${url}`);
  }
  return res.json();
};

const gatherBridgeSnapshot = async () => {
  try {
    const [status, agentsPayload, tasksPayload] = await Promise.all([
      fetchJson('/api/status'),
      fetchJson('/agents'),
      fetchJson('/tasks'),
    ]);

    const agents = Array.isArray(agentsPayload?.agents) ? agentsPayload.agents : [];
    const tasks = Array.isArray(tasksPayload?.tasks) ? tasksPayload.tasks : [];

    const roleSummary = agents.reduce((acc, agent) => {
      const role = agent.role || 'unknown';
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {});

    writeLog(
      `bridge snapshot clients=${status?.performance?.connectedClients ?? agents.length} messages=${status?.performance?.messagesProcessed ?? 'n/a'} queued=${status?.performance?.queuedMessages ?? 'n/a'}`
    );
    writeLog(
      `agents summary total=${agents.length} roles=${
        Object.entries(roleSummary)
          .map(([role, count]) => `${role}:${count}`)
          .join(',') || 'none'
      }`
    );
    writeLog(
      `tasks summary total=${tasks.length} available=${tasks.filter((t) => t.status === 'available').length}`
    );

    coordinator.broadcast({
      intent: 'session.sync',
      payload: {
        sessionId: coordinator.sessionId,
        timestamp: Date.now(),
        stats: coordinator.getStats(),
        bridge: {
          uptime: status?.uptime ?? null,
          connectedClients: status?.performance?.connectedClients ?? agents.length,
          queuedMessages: status?.performance?.queuedMessages ?? null,
          messagesProcessed: status?.performance?.messagesProcessed ?? null,
        },
        agents: {
          total: agents.length,
          roles: roleSummary,
        },
        tasks: {
          total: tasks.length,
          available: tasks.filter((t) => t.status === 'available').length,
          claimed: tasks.filter((t) => t.status === 'claimed').length,
          completed: tasks.filter((t) => t.status === 'completed').length,
        },
      },
    });
  } catch (error) {
    writeLog(`snapshot.error ${error.message}`);
  }
};

const registerEventHandlers = () => {
  coordinator.on('task.available', (task) => {
    writeLog(`task.available id=${task.id} title="${task.title}" priority=${task.priority}`);
  });

  coordinator.on('task.claimed', (task) => {
    writeLog(`task.claimed id=${task.id} title="${task.title}" by=self`);
  });

  coordinator.on('task.claimed.other', (task) => {
    writeLog(`task.claimed.other id=${task.id} title="${task.title}" by=${task.claimedBy}`);
  });

  coordinator.on('task.completed', (task) => {
    writeLog(
      `task.completed id=${task.id} title="${task.title}" result=${JSON.stringify(task.result)}`
    );
  });

  coordinator.on('task.completed.other', (task) => {
    writeLog(`task.completed.other id=${task.id} title="${task.title}" by=${task.claimedBy}`);
  });

  coordinator.on('collaboration.request', ({ taskId, from, role }) => {
    writeLog(`collaboration.request taskId=${taskId} from=${from} role=${role}`);
  });

  coordinator.on('session.discovered', (session) => {
    writeLog(
      `session.discovered id=${session.sessionId || session.from} name="${session.sessionName || 'unknown'}" capabilities=${
        session.capabilities?.join('|') || 'none'
      }`
    );
  });

  coordinator.on('message', (message) => {
    if (!message.intent?.startsWith('task.')) {
      writeLog(
        `message type=${message.type || 'unknown'} intent=${message.intent || 'none'} from=${message.from || 'unknown'}`
      );
    }
  });
};

const cleanup = (reason = 'shutting down hook session') => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  writeLog(reason);

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }

  if (statsTimer) {
    clearInterval(statsTimer);
  }

  coordinator.disconnect();
  process.exit(0);
};

const start = async () => {
  try {
    registerEventHandlers();

    await coordinator.connect();
    writeLog(`connected sessionId=${coordinator.sessionId} bridge=${coordinator.bridgeUrl}`);

    heartbeatTimer = setInterval(() => {
      coordinator.broadcast({
        intent: 'session.heartbeat',
        payload: {
          sessionId: coordinator.sessionId,
          timestamp: Date.now(),
          metrics: {
            claimedTasks: coordinator.claimedTasks.size,
            totalTasks: coordinator.getStats().total,
          },
        },
      });
      writeLog('heartbeat sent');
    }, heartbeatIntervalMs);

    const periodicSync = async () => {
      handleStatsLog();
      await gatherBridgeSnapshot();
    };

    await periodicSync();
    statsTimer = setInterval(() => {
      periodicSync().catch((error) => writeLog(`periodicSync.error ${error.message}`));
    }, statsIntervalMs);

    if (runtimeLimitMs > 0) {
      setTimeout(() => cleanup('runtime limit reached'), runtimeLimitMs);
    }

    process.on('SIGINT', () => cleanup('received SIGINT'));
    process.on('SIGTERM', () => cleanup('received SIGTERM'));
  } catch (error) {
    writeLog(`error ${error.message}`);
    process.exit(1);
  }
};

start();
