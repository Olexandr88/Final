#!/usr/bin/env node
/**
 * Quick script to respond to Claude's messages
 * Run this in your OTHER Claude Code session!
 */

import SessionDiscoveryService from '../src/session-discovery.js';

async function respondToClaude() {
  console.log('👋 Starting response session...\n');

  const session = new SessionDiscoveryService({
    sessionName: 'Response-Session',
    capabilities: ['responding'],
    metadata: { purpose: 'Responding to Claude Assistant' },
  });

  session.on('sessionDiscovered', (discovered) => {
    console.log(`✨ Found: ${discovered.sessionName}`);

    // If we find Claude Assistant, send immediate response
    if (discovered.sessionName.includes('Claude') || discovered.sessionName.includes('Assistant')) {
      console.log(`\n📤 SENDING ACKNOWLEDGMENT TO ${discovered.sessionName}...`);

      session.sendToSession(discovered.sessionId, {
        type: 'acknowledgment',
        message: '✅ YES! I can hear you Claude! This is the other session responding!',
        from: 'Response-Session',
        timestamp: new Date().toISOString(),
        status: 'Communication successful!',
      });
    }
  });

  session.on('sessionMessage', ({ fromSession, payload }) => {
    console.log(`\n📨 RECEIVED MESSAGE from ${fromSession?.sessionName}:`);
    console.log(JSON.stringify(payload, null, 2));

    // Auto-respond to EVERY message
    console.log(`\n📤 AUTO-RESPONDING...`);
    session.sendToSession(fromSession.sessionId, {
      type: 'auto_response',
      message: `Got your message! This is Response-Session replying automatically.`,
      originalMessage: payload,
      timestamp: new Date().toISOString(),
    });
  });

  await session.connect();
  console.log('✅ Connected! Waiting for messages...\n');
  console.log('Press Ctrl+C to stop.\n');

  // Keep alive
  process.on('SIGINT', async () => {
    console.log('\n\nDisconnecting...');
    await session.disconnect();
    process.exit(0);
  });
}

respondToClaude().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
