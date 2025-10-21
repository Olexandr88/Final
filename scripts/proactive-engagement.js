#!/usr/bin/env node
/**
 * Proactive Engagement - Keeps trying to establish conversation
 * Sends periodic messages to scarm-18704 until they respond
 */

import SessionDiscoveryService from '../src/session-discovery.js';

const messages = [
  {
    type: 'engagement',
    message:
      "👋 Hey scarm-18704! I'm ready to help with those 3 tasks. Are you working on one already?",
    context: 'initial_ping',
  },
  {
    type: 'task_offer',
    message:
      '🎯 I can take on:\n1. Generate test suite\n2. Update documentation\n3. Performance analysis\n\nWhich one should I start with?',
    context: 'offering_help',
  },
  {
    type: 'status_check',
    message:
      "💬 Just checking in! I'm here and ready to coordinate. What are you focusing on right now?",
    context: 'checking_status',
  },
  {
    type: 'collaboration',
    message: '🤝 We can work in parallel to get more done faster. Want to split the tasks?',
    context: 'suggesting_collaboration',
  },
  {
    type: 'friendly_nudge',
    message: "😊 Still here! Let me know when you're ready to coordinate work.",
    context: 'gentle_reminder',
  },
];

async function startProactiveEngagement() {
  console.log('🚀 Starting proactive engagement system...\n');

  const session = new SessionDiscoveryService({
    sessionName: 'Claude-Proactive-Engager',
    capabilities: ['conversation', 'task-coordination', 'persistent-engagement'],
    metadata: {
      role: 'engagement-specialist',
      purpose: 'Establish communication with scarm-18704',
    },
  });

  await session.connect();

  let messageIndex = 0;
  let targetSession = null;
  let responseReceived = false;

  // Listen for scarm-18704
  session.on('sessionDiscovered', (discovered) => {
    if (discovered.sessionName === 'scarm-18704') {
      targetSession = discovered;
      console.log(`✅ Found ${discovered.sessionName}!\n`);
    }
  });

  // Listen for ANY response from scarm-18704
  session.on('sessionMessage', ({ fromSession, payload }) => {
    if (fromSession.sessionName === 'scarm-18704') {
      responseReceived = true;
      console.log('\n🎉 SUCCESS! scarm-18704 responded!\n');
      console.log('Message:', JSON.stringify(payload, null, 2));
      console.log('\n✅ Mission accomplished. Stopping engagement.\n');
      process.exit(0);
    }
  });

  // Send periodic engagement messages
  setInterval(() => {
    if (!responseReceived && targetSession) {
      const msg = messages[messageIndex % messages.length];

      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📤 Sending engagement message #${messageIndex + 1}`);
      console.log(`   Type: ${msg.type}`);
      console.log(`   To: ${targetSession.sessionName}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`Message: ${msg.message}\n`);

      session.sendToSession(targetSession.sessionId, {
        ...msg,
        from: 'Claude-Proactive-Engager',
        timestamp: new Date().toISOString(),
        attempt: messageIndex + 1,
      });

      messageIndex++;
    } else if (!targetSession) {
      console.log('⏳ Waiting to discover scarm-18704...\n');
    }
  }, 30000); // Every 30 seconds

  console.log('💡 Strategy:');
  console.log('   - Sending engagement messages every 30 seconds');
  console.log('   - Rotating through different message types');
  console.log('   - Will stop when scarm-18704 responds\n');
  console.log('Press Ctrl+C to stop\n');
}

startProactiveEngagement().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
