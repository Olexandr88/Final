#!/usr/bin/env node
import SessionDiscoveryService from './src/session-discovery.js';

// Create 2 sessions that will talk to each other
async function test() {
  console.log('🚀 Creating 2 sessions...\n');

  // Session 1
  const session1 = new SessionDiscoveryService({
    sessionName: 'Alice',
    capabilities: ['frontend'],
    metadata: { role: 'developer' },
  });

  session1.on('sessionDiscovered', (s) => {
    console.log(`[Alice] 👋 Found ${s.sessionName}!`);
  });

  session1.on('sessionMessage', ({ fromSession, payload }) => {
    console.log(`[Alice] 📨 Message from ${fromSession.sessionName}: "${payload.message}"`);
  });

  await session1.connect();
  console.log('✓ Alice connected\n');

  // Wait a moment
  await new Promise((r) => setTimeout(r, 1000));

  // Session 2
  const session2 = new SessionDiscoveryService({
    sessionName: 'Bob',
    capabilities: ['backend'],
    metadata: { role: 'developer' },
  });

  session2.on('sessionDiscovered', (s) => {
    console.log(`[Bob] 👋 Found ${s.sessionName}!`);

    // Bob sends a message to Alice when he discovers her
    if (s.sessionName === 'Alice') {
      setTimeout(() => {
        console.log(`[Bob] 💬 Sending message to Alice...`);
        session2.sendToSession(s.sessionId, {
          message: 'Hello Alice! Nice to meet you!',
        });
      }, 500);
    }
  });

  session2.on('sessionMessage', ({ fromSession, payload }) => {
    console.log(`[Bob] 📨 Message from ${fromSession.sessionName}: "${payload.message}"`);
  });

  await session2.connect();
  console.log('✓ Bob connected\n');

  // Wait for discovery and messaging
  await new Promise((r) => setTimeout(r, 3000));

  // Alice replies
  const bobSession = session1.getSessions().find((s) => s.sessionName === 'Bob');
  if (bobSession) {
    console.log(`[Alice] 💬 Replying to Bob...`);
    session1.sendToSession(bobSession.sessionId, {
      message: 'Hi Bob! Great to see you here!',
    });
  }

  // Wait for reply
  await new Promise((r) => setTimeout(r, 2000));

  // Show summary
  console.log('\n📊 Summary:');
  console.log(`  Alice discovered: ${session1.getSessions().length} session(s)`);
  console.log(`  Bob discovered: ${session2.getSessions().length} session(s)`);
  console.log(`  Alice sent: ${session1.getStats().messagesSent} messages`);
  console.log(`  Bob sent: ${session2.getStats().messagesSent} messages`);

  // Cleanup
  console.log('\n🧹 Cleaning up...');
  await session1.disconnect();
  await session2.disconnect();

  console.log('\n✅ Test complete! Both sessions discovered each other and exchanged messages.\n');
  process.exit(0);
}

test().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
