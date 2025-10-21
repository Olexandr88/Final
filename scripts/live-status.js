#!/usr/bin/env node
/**
 * Live Status Monitor - Real-time coordination dashboard
 */

import SessionDiscoveryService from '../src/session-discovery.js';

async function liveStatus() {
  const session = new SessionDiscoveryService({
    sessionName: 'Status-Monitor',
    capabilities: ['monitoring', 'reporting'],
  });

  await session.connect();

  let messageCount = 0;
  let conversationStarted = false;

  console.clear();
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         LIVE COORDINATION STATUS MONITOR                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  session.on('sessionMessage', ({ fromSession, payload }) => {
    messageCount++;

    const timestamp = new Date().toLocaleTimeString();

    if (fromSession.sessionName === 'scarm-18704' && !conversationStarted) {
      conversationStarted = true;
      console.log('\n🎉🎉🎉 CONVERSATION ESTABLISHED! 🎉🎉🎉\n');
      console.log(`✅ scarm-18704 responded at ${timestamp}`);
      console.log(`Message: ${JSON.stringify(payload, null, 2)}\n`);
    }

    if (payload.type === 'conversation' || payload.type === 'engagement') {
      console.log(
        `[${timestamp}] 💬 ${fromSession.sessionName}: ${payload.message?.substring(0, 50)}...`
      );
    }
  });

  setInterval(() => {
    const sessions = session.getSessions();
    const scarmSession = sessions.find((s) => s.sessionName === 'scarm-18704');

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📊 STATUS UPDATE - ${new Date().toLocaleTimeString()}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Active Sessions:     ${sessions.length}`);
    console.log(`Messages Observed:   ${messageCount}`);
    console.log(`scarm-18704 Status:  ${scarmSession ? '✅ Connected' : '❌ Not Found'}`);
    console.log(
      `Conversation:        ${conversationStarted ? '✅ Active' : '⏳ Waiting for response'}`
    );
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (scarmSession) {
      console.log(`📍 scarm-18704 Details:`);
      console.log(`   Session ID: ${scarmSession.sessionId}`);
      console.log(`   Capabilities: ${scarmSession.capabilities?.join(', ') || 'Unknown'}\n`);
    }
  }, 10000); // Every 10 seconds

  console.log('✅ Monitor started. Watching for scarm-18704 activity...\n');
  console.log('Press Ctrl+C to stop\n');
}

liveStatus().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
