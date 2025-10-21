#!/usr/bin/env node
import SessionDiscoveryService from '../src/session-discovery.js';

async function sendCoordination() {
  const session = new SessionDiscoveryService({
    sessionName: 'Claude-Coordinator',
    capabilities: ['coordination', 'messaging'],
  });

  let messageSent = false;

  // Listen for the target session
  session.on('sessionDiscovered', (discovered) => {
    if (discovered.sessionName === 'scarm-18704' && !messageSent) {
      messageSent = true;
      console.log(`✨ Found ${discovered.sessionName}!\n`);
      console.log(`📤 Sending coordination message...\n`);

      session.sendToSession(discovered.sessionId, {
        type: 'task_coordination',
        from: 'Claude-Coordinator',
        message:
          "👋 I see you're working on TaskCoordinator! I have session discovery, sync, and monitoring running.",
        systems: {
          sessionDiscovery: 'Active - monitoring all sessions',
          sessionSync: 'Ready - can share state and files',
          fileWatching: 'Active - broadcasting changes',
          continuousMonitor: 'Running - logging all messages',
        },
        proposal: "Let's demonstrate distributed task coordination between our sessions!",
        timestamp: new Date().toISOString(),
      });

      console.log('✅ Message sent!\n');
    }
  });

  await session.connect();
  console.log('✅ Connected\n');
  console.log('⏳ Waiting for scarm-18704 session...\n');

  // Wait up to 10 seconds
  await new Promise((r) => setTimeout(r, 10000));

  if (!messageSent) {
    console.log('⚠️  scarm-18704 not found within 10 seconds\n');
    console.log('Available sessions:');
    session
      .getSessions()
      .forEach((s) => console.log(`  - ${s.sessionName} (${s.sessionId.slice(0, 8)})`));
  }

  await session.disconnect();
  process.exit(0);
}

sendCoordination().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
