/**
 * Coordination Igniter
 * Seeds a set of starter tasks and broadcasts sync directives so idle agents can engage.
 */

import { TaskCoordinator } from '../src/task-coordinator.js';

const bridgeUrl = process.env.ACTIVATION_BRIDGE_WS;
const sessionId = process.env.ACTIVATION_SESSION_ID || `task-activator-${Date.now()}`;

const coordinator = new TaskCoordinator(bridgeUrl, sessionId);

const tasksToSeed = [
  {
    title: 'Map current agents & capabilities',
    description: 'Compile a capability matrix for all connected agents using /agents snapshot.',
    type: 'analysis',
    priority: 'high',
    metadata: {
      estimatedTime: '8 minutes',
      requiredCapabilities: ['monitoring', 'reporting'],
      deliverable: 'agents/capabilities.md',
    },
  },
  {
    title: 'Health-check broadcast',
    description: 'Send a session.sync acknowledgement containing heartbeat + load status.',
    type: 'coordination',
    priority: 'medium',
    metadata: {
      estimatedTime: '5 minutes',
      requiredCapabilities: ['session-sync', 'heartbeat'],
      deliverable: 'session-sync log entry',
    },
  },
  {
    title: 'Task pipeline validation',
    description:
      'Claim this task and record the full lifecycle (create -> claim -> complete) in hook log.',
    type: 'validation',
    priority: 'medium',
    metadata: {
      estimatedTime: '6 minutes',
      requiredCapabilities: ['task-coordination', 'logging'],
      deliverable: 'hook log entry referencing task ID',
    },
  },
];

const standardPayload = (what, extra = {}) => ({
  who: coordinator.sessionId,
  what,
  when: new Date().toISOString(),
  ...extra,
});

const broadcastActivationSummary = (createdTasks) => {
  coordinator.broadcast({
    intent: 'session.sync',
    payload: standardPayload('activation.summary', {
      summary: 'Activation kickoff triggered. Tasks seeded and ready to claim.',
      tasks: createdTasks.map((task) => ({
        id: task.id,
        title: task.title,
        priority: task.priority,
        requiredCapabilities: task.metadata?.requiredCapabilities || [],
      })),
      expectations: [
        'First available coordinator should acknowledge via session.sync',
        'Agents claim tasks matching capabilities',
        'Completion details logged to hook file',
      ],
    }),
  });
};

const broadcastTaskCreated = (task) => {
  coordinator.broadcast({
    intent: 'task.sync',
    taskId: task.id, // Required at envelope level for /tasks endpoint
    payload: standardPayload('task.created', {
      task: {
        id: task.id,
        title: task.title,
        priority: task.priority,
        type: task.type,
        metadata: task.metadata,
      },
      directive:
        'Ready for claim. Reply with session.sync {what:task.claim.intent} before execution.',
    }),
  });
};

const run = async () => {
  try {
    console.log('🚀 Starting coordination igniter...\n');

    coordinator.on('task.claimed', (task) => {
      console.log(`✅ Self-claimed task: ${task.id} – ${task.title}`);
    });
    coordinator.on('task.claimed.other', (task) => {
      console.log(`🤝 External claim: ${task.id} by ${task.claimedBy}`);
    });
    coordinator.on('task.completed.other', (task) => {
      console.log(`🎉 External completion: ${task.id} by ${task.claimedBy}`);
    });
    coordinator.on('session.discovered', (session) => {
      console.log(`👥 Session discovered: ${session.sessionName || session.from}`);
    });

    await coordinator.connect();
    console.log(`✓ Connected as ${coordinator.sessionId}\n`);

    const seededTasks = tasksToSeed.map((task) => coordinator.createTask(task));
    seededTasks.forEach(broadcastTaskCreated);
    broadcastActivationSummary(seededTasks);

    console.log('📡 Activation broadcast issued.');
    console.log('   - Waiting for acknowledgements via session.sync\n');

    // Periodic nudge every 45 seconds
    const reminderIntervalMs = Number(process.env.ACTIVATION_REMINDER_MS || 45000);
    const reminderTimer = setInterval(() => {
      const stats = coordinator.getStats();
      coordinator.broadcast({
        intent: 'session.sync',
        payload: standardPayload('activation.reminder', {
          message: 'Activation still pending — claim a task that matches your capabilities.',
          stats,
          expectations: ['Ack via session.sync', 'Update hook log post-claim'],
        }),
      });
      console.log(`🔁 Reminder broadcast sent. Stats: ${JSON.stringify(stats)}`);
    }, reminderIntervalMs);

    process.on('SIGINT', () => {
      console.log('\nStopping coordination igniter...');
      clearInterval(reminderTimer);
      coordinator.disconnect();
      process.exit(0);
    });
  } catch (error) {
    console.error('Activation failed:', error);
    process.exit(1);
  }
};

run();
