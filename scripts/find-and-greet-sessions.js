#!/usr/bin/env node
import SessionDiscoveryService from '../src/session-discovery.js';

async function findAndGreet() {
  console.log('🔍 Actively searching for other Claude Code sessions...\n');

  const mySession = new SessionDiscoveryService({
    sessionName: 'Claude-Assistant-Active',
    capabilities: ['ai-assistant', 'active-discovery'],
    metadata: {
      purpose: 'Finding and greeting other sessions',
      from: 'Claude Code Assistant',
    },
  });

  let foundSessions = new Set();

  mySession.on('sessionDiscovered', (session) => {
    if (!foundSessions.has(session.sessionId)) {
      foundSessions.add(session.sessionId);

      console.log(`\n✨ FOUND SESSION: ${session.sessionName}`);
      console.log(`   ID: ${session.sessionId.slice(0, 8)}`);
      console.log(`   Capabilities: ${session.capabilities.join(', ')}`);
      console.log(`   Working Dir: ${session.metadata?.cwd || 'N/A'}\n`);

      // Send greeting immediately
      console.log(`📤 Sending greeting to ${session.sessionName}...`);
      mySession.sendToSession(session.sessionId, {
        type: 'greeting',
        from: 'Claude-Assistant-Active',
        message: "👋 Hello! I'm Claude Code Assistant. I can see you now!",
        timestamp: new Date().toISOString(),
        requestAck: true,
      });
    }
  });

  mySession.on('sessionMessage', ({ fromSession, payload }) => {
    console.log(`\n📨 RECEIVED MESSAGE from ${fromSession?.sessionName || 'unknown'}:`);
    console.log(JSON.stringify(payload, null, 2));

    // Auto-reply to acknowledgements
    if (payload.type === 'ack' || payload.requestAck) {
      console.log(`\n📤 Sending acknowledgement back...`);
      mySession.sendToSession(fromSession.sessionId, {
        type: 'ack',
        message: 'Message received! Communication working!',
        originalMessage: payload,
        timestamp: new Date().toISOString(),
      });
    }
  });

  await mySession.connect();
  console.log('✅ Connected and actively searching...\n');

  // Force query every 3 seconds
  const queryInterval = setInterval(() => {
    console.log('🔄 Refreshing session list...');
    mySession._queryExistingSessions();
  }, 3000);

  // Report status every 5 seconds
  setInterval(() => {
    const sessions = mySession.getSessions();
    console.log(
      `\n📊 Status: Found ${sessions.length} session(s), Sent ${mySession.getStats().messagesSent} messages`
    );

    if (sessions.length > 0) {
      console.log('   Active Sessions:');
      sessions.forEach((s) => {
        console.log(
          `   - ${s.sessionName} (${s.sessionId.slice(0, 8)}) - ${s.healthy ? '✅' : '⚠️'}`
        );
      });
    }
  }, 5000);

  // Keep running
  console.log('Running continuously. Press Ctrl+C to stop.\n');

  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Stopping...');
    clearInterval(queryInterval);
    await mySession.disconnect();
    process.exit(0);
  });
}

findAndGreet().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
