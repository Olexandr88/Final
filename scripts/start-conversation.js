#!/usr/bin/env node
/**
 * Interactive conversation between Claude sessions
 * Coordinates work and prevents overlap
 */

import SessionDiscoveryService from '../src/session-discovery.js';
import SessionSyncManager from '../src/session-sync-manager.js';

async function startConversation() {
  console.log('💬 Starting interactive conversation system...\n');

  // Create both discovery and sync
  const discovery = new SessionDiscoveryService({
    sessionName: 'Claude-Collaborative',
    capabilities: ['conversation', 'coordination', 'task-execution'],
    metadata: {
      role: 'collaborative-assistant',
      workingOn: 'Available for tasks',
      availableSkills: ['testing', 'documentation', 'refactoring', 'analysis'],
    },
  });

  const sync = new SessionSyncManager({
    sessionName: 'Claude-Collaborative',
    watchDirectories: ['.'],
    syncInterval: 5000,
  });

  let conversationStarted = false;
  let myCurrentTask = null;
  const conversationHistory = [];

  // Listen for the other session
  discovery.on('sessionDiscovered', async (session) => {
    if (session.sessionName === 'scarm-18704' && !conversationStarted) {
      conversationStarted = true;

      console.log(`\n✨ Found ${session.sessionName}! Starting conversation...\n`);

      // Initial greeting and inquiry
      const greeting = {
        type: 'conversation',
        from: 'Claude-Collaborative',
        message:
          '👋 Hey! I see you have TaskCoordinator running with 3 tasks. I can help coordinate our work to avoid overlap.\n\nWhat are you currently working on? I can take on one of the remaining tasks.',
        currentStatus: {
          workingOn: myCurrentTask || 'Nothing - ready to help!',
          availableFor: ['Generate test suite', 'Update documentation', 'Performance analysis'],
          capabilities: ['testing', 'documentation', 'refactoring', 'code analysis'],
        },
        timestamp: new Date().toISOString(),
      };

      discovery.sendToSession(session.sessionId, greeting);
      conversationHistory.push({ direction: 'sent', ...greeting });

      console.log('📤 Sent initial greeting and work inquiry\n');
    }
  });

  // Listen for messages and respond intelligently
  discovery.on('sessionMessage', async ({ fromSession, payload }) => {
    if (fromSession.sessionName !== 'scarm-18704') return;

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📨 MESSAGE FROM ${fromSession.sessionName}:`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(JSON.stringify(payload, null, 2));
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    conversationHistory.push({ direction: 'received', ...payload });

    // Respond based on message type
    let response;

    if (payload.type === 'task_assignment') {
      // They're assigning us a task
      myCurrentTask = payload.task;
      response = {
        type: 'conversation',
        from: 'Claude-Collaborative',
        message: `✅ Got it! I'll start working on "${payload.task}". I'll let you know when I'm done.\n\nMeanwhile, what are you focusing on? Want to coordinate our next steps?`,
        status: {
          acceptedTask: payload.task,
          estimatedTime: '5-10 minutes',
          willNotifyOnComplete: true,
        },
        timestamp: new Date().toISOString(),
      };

      // Actually claim the task via sync
      await sync.claimTask(payload.taskId || payload.task.toLowerCase().replace(/\s+/g, '-'), {
        assignedBy: fromSession.sessionName,
        task: payload.task,
      });
    } else if (payload.type === 'work_update') {
      // They're telling us what they're working on
      response = {
        type: 'conversation',
        from: 'Claude-Collaborative',
        message: `👍 Perfect! You work on "${payload.currentTask}", and I'll avoid that area.\n\nI can handle one of the other tasks. Which would you prefer I tackle first:\n1. Generate test suite\n2. Update documentation\n3. Performance analysis`,
        status: {
          acknowledgedTheirWork: payload.currentTask,
          avoidingOverlap: true,
          readyForAssignment: true,
        },
        timestamp: new Date().toISOString(),
      };
    } else if (payload.type === 'question') {
      // They're asking us something
      response = {
        type: 'conversation',
        from: 'Claude-Collaborative',
        message: `Let me help with that! ${generateHelpfulResponse(payload.question)}\n\nAnything else you need?`,
        timestamp: new Date().toISOString(),
      };
    } else {
      // Generic response
      response = {
        type: 'conversation',
        from: 'Claude-Collaborative',
        message: `I hear you! ${generateContextualResponse(payload)}\n\nHow can we best coordinate our work?`,
        timestamp: new Date().toISOString(),
      };
    }

    // Send response
    discovery.sendToSession(fromSession.sessionId, response);
    conversationHistory.push({ direction: 'sent', ...response });

    console.log('📤 Sent response\n');
  });

  // Listen for task events from sync
  sync.on('taskClaimed', ({ taskId, fromSession }) => {
    if (fromSession.sessionName !== 'Claude-Collaborative') {
      console.log(`\n🔔 ${fromSession.sessionName} claimed: ${taskId}`);
      console.log('   → Avoiding overlap on this task\n');
    }
  });

  sync.on('taskCompleted', ({ taskId, fromSession }) => {
    if (fromSession.sessionName !== 'Claude-Collaborative') {
      console.log(`\n✅ ${fromSession.sessionName} completed: ${taskId}`);

      // Send congratulations
      const sessions = discovery.getSessions();
      const otherSession = sessions.find((s) => s.sessionName === fromSession.sessionName);

      if (otherSession) {
        discovery.sendToSession(otherSession.sessionId, {
          type: 'conversation',
          from: 'Claude-Collaborative',
          message: `🎉 Nice work completing "${taskId}"! What's next on your list? I'm ready to help with the remaining tasks.`,
          timestamp: new Date().toISOString(),
        });
      }
    }
  });

  // Connect both systems
  await Promise.all([discovery.connect(), sync.init()]);

  console.log('✅ Connected and ready for conversation!\n');
  console.log('💡 I will:\n');
  console.log('   - Listen for messages from other sessions');
  console.log('   - Respond intelligently to coordinate work');
  console.log('   - Avoid overlapping tasks');
  console.log('   - Keep conversation going\n');
  console.log('Press Ctrl+C to stop\n');

  // Periodic status
  setInterval(() => {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📊 STATUS UPDATE - ${new Date().toISOString()}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Current Task: ${myCurrentTask || 'None - waiting for assignment'}`);
    console.log(`Messages Exchanged: ${conversationHistory.length}`);
    console.log(`Connected Sessions: ${discovery.getSessions().length}`);
    console.log(`Shared State Keys: ${sync.getStatus().sharedStateKeys}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  }, 60000); // Every minute

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down conversation...\n');
    console.log(`📊 Conversation Summary:`);
    console.log(`   Messages exchanged: ${conversationHistory.length}`);
    console.log(`   Tasks coordinated: ${myCurrentTask ? 1 : 0}\n`);

    await Promise.all([discovery.disconnect(), sync.cleanup()]);

    process.exit(0);
  });
}

// Helper functions
function generateHelpfulResponse(question) {
  const responses = {
    'what are you working on': "I'm currently available and ready to take on tasks!",
    'can you help': 'Absolutely! I can help with testing, documentation, or analysis.',
    'what should I do':
      'Let me check the task list and suggest what would complement your work best.',
  };

  const lowerQ = question?.toLowerCase() || '';
  for (const [key, response] of Object.entries(responses)) {
    if (lowerQ.includes(key)) return response;
  }

  return "I'm here to help! Just let me know what you need.";
}

function generateContextualResponse(payload) {
  if (payload.message) {
    return `Thanks for the message!`;
  }
  return `Got your update.`;
}

startConversation().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
