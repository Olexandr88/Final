/**
 * Session Wake System
 * Allows sessions to wake each other up for coordination
 * Supports targeted wake-ups, broadcasts, and acknowledgments
 */

import { TaskCoordinator } from '../src/task-coordinator.js';
import fs from 'node:fs';
import path from 'node:path';

const logPath = path.resolve(process.cwd(), 'logs/session-wake-system.log');
fs.mkdirSync(path.dirname(logPath), { recursive: true });

const writeLog = (message) => {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  fs.appendFileSync(logPath, `${line}\n`);
};

const coordinator = new TaskCoordinator(undefined, `wake-system-${Date.now()}`);

// Track discovered sessions for targeted wake-ups
const activeSessions = new Map();
const pendingWakeups = new Map(); // wakeId -> { from, to, reason, timestamp }

/**
 * Wake up a specific session
 */
const wakeSession = (targetSessionId, reason, urgency = 'normal', payload = {}) => {
  const wakeId = `wake-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const wakeMessage = {
    intent: 'session.wake',
    payload: {
      wakeId,
      from: coordinator.sessionId,
      to: targetSessionId,
      reason,
      urgency, // 'low', 'normal', 'high', 'critical'
      timestamp: Date.now(),
      data: payload,
    },
  };

  coordinator.send({
    type: 'direct',
    to: targetSessionId,
    ...wakeMessage,
  });

  pendingWakeups.set(wakeId, {
    from: coordinator.sessionId,
    to: targetSessionId,
    reason,
    timestamp: Date.now(),
  });

  writeLog(
    `wake.sent wakeId=${wakeId} to=${targetSessionId} reason="${reason}" urgency=${urgency}`
  );
  return wakeId;
};

/**
 * Wake all sessions (broadcast)
 */
const wakeAll = (reason, urgency = 'normal', payload = {}) => {
  const wakeId = `wake-broadcast-${Date.now()}`;

  coordinator.broadcast({
    intent: 'session.wake.broadcast',
    payload: {
      wakeId,
      from: coordinator.sessionId,
      reason,
      urgency,
      timestamp: Date.now(),
      data: payload,
    },
  });

  writeLog(
    `wake.broadcast wakeId=${wakeId} reason="${reason}" urgency=${urgency} sessions=${activeSessions.size}`
  );
  return wakeId;
};

/**
 * Acknowledge a wake-up
 */
const acknowledgeWake = (wakeId, fromSession, status = 'acknowledged') => {
  coordinator.send({
    type: 'direct',
    to: fromSession,
    intent: 'session.wake.ack',
    payload: {
      wakeId,
      from: coordinator.sessionId,
      status, // 'acknowledged', 'working', 'completed', 'ignored'
      timestamp: Date.now(),
    },
  });

  writeLog(`wake.ack wakeId=${wakeId} to=${fromSession} status=${status}`);
};

/**
 * Wake sessions with specific capability
 */
const wakeByCapability = (capability, reason, urgency = 'normal', payload = {}) => {
  const capableSessions = Array.from(activeSessions.values())
    .filter((s) => s.capabilities?.includes(capability))
    .map((s) => s.id);

  if (capableSessions.length === 0) {
    writeLog(`wake.capability.none capability="${capability}" reason="${reason}"`);
    return null;
  }

  const wakeId = `wake-cap-${Date.now()}`;

  capableSessions.forEach((sessionId) => {
    coordinator.send({
      type: 'direct',
      to: sessionId,
      intent: 'session.wake',
      payload: {
        wakeId: `${wakeId}-${sessionId}`,
        from: coordinator.sessionId,
        to: sessionId,
        reason,
        urgency,
        requiredCapability: capability,
        timestamp: Date.now(),
        data: payload,
      },
    });
  });

  writeLog(
    `wake.capability wakeId=${wakeId} capability="${capability}" sessions=${capableSessions.length} reason="${reason}"`
  );
  return wakeId;
};

/**
 * Wake sessions for task coordination
 */
const wakeForTask = (taskId, taskTitle, requiredCapabilities = []) => {
  const reason = `Task available: ${taskTitle}`;

  if (requiredCapabilities.length > 0) {
    // Wake only capable sessions
    const capableSessions = Array.from(activeSessions.values())
      .filter((s) => requiredCapabilities.some((cap) => s.capabilities?.includes(cap)))
      .map((s) => s.id);

    capableSessions.forEach((sessionId) => {
      wakeSession(sessionId, reason, 'normal', {
        taskId,
        taskTitle,
        requiredCapabilities,
      });
    });

    writeLog(`wake.task taskId=${taskId} capable_sessions=${capableSessions.length}`);
  } else {
    // Wake all sessions
    wakeAll(reason, 'normal', { taskId, taskTitle });
  }
};

/**
 * Wake for collaboration request
 */
const wakeForCollaboration = (targetSessionId, taskId, role, details = {}) => {
  const reason = `Collaboration requested: ${role} on task ${taskId}`;

  wakeSession(targetSessionId, reason, 'high', {
    type: 'collaboration',
    taskId,
    role,
    details,
  });

  writeLog(`wake.collaboration to=${targetSessionId} taskId=${taskId} role="${role}"`);
};

/**
 * Wake for urgent issue
 */
const wakeForUrgent = (issue, affectedSessions = []) => {
  const reason = `URGENT: ${issue}`;

  if (affectedSessions.length > 0) {
    affectedSessions.forEach((sessionId) => {
      wakeSession(sessionId, reason, 'critical', { issue });
    });
  } else {
    wakeAll(reason, 'critical', { issue });
  }

  writeLog(`wake.urgent issue="${issue}" sessions=${affectedSessions.length || 'all'}`);
};

// Event handlers
coordinator.on('message', (message) => {
  const { intent, payload, from } = message;

  switch (intent) {
    case 'session.announce':
      // Track discovered sessions
      const sessionId = payload.sessionId || from;
      activeSessions.set(sessionId, {
        id: sessionId,
        name: payload.sessionName,
        capabilities: payload.capabilities || [],
        lastSeen: Date.now(),
      });
      writeLog(
        `session.discovered id=${sessionId} name="${payload.sessionName}" capabilities=${payload.capabilities?.join(',') || 'none'}`
      );
      break;

    case 'session.wake':
    case 'session.wake.broadcast':
      // We received a wake-up
      const { wakeId, reason, urgency, data } = payload;
      writeLog(`wake.received wakeId=${wakeId} from=${from} reason="${reason}" urgency=${urgency}`);

      // Acknowledge
      acknowledgeWake(wakeId, from, 'acknowledged');

      // Process based on urgency
      if (urgency === 'critical') {
        console.log(`\n🚨 CRITICAL WAKE-UP from ${from}: ${reason}\n`);
      } else if (urgency === 'high') {
        console.log(`\n⚡ HIGH PRIORITY from ${from}: ${reason}\n`);
      }

      // Handle specific wake-up types
      if (data?.taskId) {
        writeLog(`wake.action type=task taskId=${data.taskId}`);
      } else if (data?.type === 'collaboration') {
        writeLog(`wake.action type=collaboration taskId=${data.taskId} role="${data.role}"`);
      }
      break;

    case 'session.wake.ack':
      // Wake-up acknowledged
      const ackWakeId = payload.wakeId;
      const ackStatus = payload.status;
      writeLog(`wake.ack.received wakeId=${ackWakeId} from=${from} status=${ackStatus}`);

      if (pendingWakeups.has(ackWakeId)) {
        pendingWakeups.delete(ackWakeId);
      }
      break;

    case 'task.create':
      // New task created - wake capable sessions
      const task = payload.task;
      if (task) {
        wakeForTask(task.id, task.title, task.metadata?.requiredCapabilities);
      }
      break;
  }
});

coordinator.on('session.heartbeat', ({ sessionId }) => {
  // Update last seen
  if (activeSessions.has(sessionId)) {
    const session = activeSessions.get(sessionId);
    session.lastSeen = Date.now();
  }
});

// Periodic cleanup of stale sessions
setInterval(() => {
  const now = Date.now();
  const staleThreshold = 60000; // 1 minute

  for (const [sessionId, session] of activeSessions.entries()) {
    if (now - session.lastSeen > staleThreshold) {
      activeSessions.delete(sessionId);
      writeLog(`session.stale id=${sessionId} removed`);
    }
  }
}, 30000);

// Demo: Wake up sessions periodically
const runDemo = () => {
  setInterval(() => {
    const sessionCount = activeSessions.size;

    if (sessionCount > 0) {
      // Every 60 seconds, wake all sessions with a coordination request
      wakeAll('Coordination check-in', 'low', {
        type: 'check-in',
        activeSessions: sessionCount,
        timestamp: Date.now(),
      });
    }
  }, 60000);

  // Example: Wake specific session after 10 seconds
  setTimeout(() => {
    if (activeSessions.size > 0) {
      const firstSession = Array.from(activeSessions.keys())[0];
      wakeSession(firstSession, 'Test wake-up message', 'normal', {
        message: 'This is a test wake-up from the wake system',
      });
    }
  }, 10000);
};

// Connect and start
coordinator
  .connect()
  .then(() => {
    writeLog(`connected sessionId=${coordinator.sessionId}`);
    console.log(`✓ Session Wake System Connected`);
    console.log(`✓ Session ID: ${coordinator.sessionId}`);
    console.log(`\n🔔 Wake system active - monitoring for sessions...\n`);

    // Run demo
    runDemo();

    // Expose wake functions for manual use
    global.wake = {
      session: wakeSession,
      all: wakeAll,
      byCapability: wakeByCapability,
      forTask: wakeForTask,
      forCollaboration: wakeForCollaboration,
      urgent: wakeForUrgent,
      list: () => Array.from(activeSessions.values()),
      stats: () => ({
        activeSessions: activeSessions.size,
        pendingWakeups: pendingWakeups.size,
        sessions: Array.from(activeSessions.values()),
      }),
    };

    console.log(`\n📋 Available commands:`);
    console.log(`   wake.session(sessionId, reason, urgency, payload)`);
    console.log(`   wake.all(reason, urgency, payload)`);
    console.log(`   wake.byCapability(capability, reason, urgency, payload)`);
    console.log(`   wake.forTask(taskId, taskTitle, requiredCapabilities)`);
    console.log(`   wake.forCollaboration(sessionId, taskId, role, details)`);
    console.log(`   wake.urgent(issue, affectedSessions)`);
    console.log(`   wake.list() - List active sessions`);
    console.log(`   wake.stats() - Show wake system stats\n`);

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
