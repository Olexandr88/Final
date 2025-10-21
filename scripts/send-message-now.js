#!/usr/bin/env node
/**
 * Send a direct message to another session RIGHT NOW
 */

import SessionDiscoveryService from '../src/session-discovery.js';

async function sendMessage() {
  console.log('💬 Connecting to send a message...\n');

  const session = new SessionDiscoveryService({
    sessionName: 'Claude-Messenger',
    capabilities: ['messaging'],
    metadata: { purpose: 'Direct messaging' },
  });

  let messageSent = false;

  session.on('sessionDiscovered', async (discovered) => {
    console.log(`✨ Found: ${discovered.sessionName} (${discovered.sessionId.slice(0, 8)})`);

    if (!messageSent) {
      messageSent = true;

      console.log(`\n📤 SENDING MESSAGE TO ${discovered.sessionName}...\n`);

      session.sendToSession(discovered.sessionId, {
        type: 'direct_message',
        from: 'Claude-Messenger',
        subject: 'Hello from Claude!',
        body: '👋 This is a test message from your other Claude Code session. Can you see this?',
        timestamp: new Date().toISOString(),
        requestReply: true,
      });

      console.log('✅ Message sent!\n');
      console.log('Waiting for response for 10 seconds...\n');
    }
  });

  session.on('sessionMessage', ({ fromSession, payload }) => {
    console.log(`\n📨 RECEIVED REPLY from ${fromSession?.sessionName}:`);
    console.log(JSON.stringify(payload, null, 2));
    console.log('\n✅ Communication successful!\n');
  });

  await session.connect();
  console.log('✅ Connected! Looking for sessions...\n');

  // Wait 10 seconds then exit
  setTimeout(async () => {
    const sessions = session.getSessions();
    console.log(`\n📊 Final Status:`);
    console.log(`   Found ${sessions.length} session(s)`);
    console.log(`   Messages sent: ${session.getStats().messagesSent}`);
    console.log(`   Messages received: ${session.getStats().messagesReceived}\n`);

    await session.disconnect();
    process.exit(0);
  }, 10000);
}

sendMessage().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
