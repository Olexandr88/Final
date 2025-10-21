#!/usr/bin/env node
/**
 * Continuous listener - monitors all session communication
 * This will run forever and show all messages in real-time
 */

import SessionDiscoveryService from '../src/session-discovery.js';

async function listen() {
  console.log('🎧 Starting continuous listener...\n');

  const listener = new SessionDiscoveryService({
    sessionName: 'Claude-Listener',
    capabilities: ['monitoring', 'listening'],
    metadata: {
      purpose: 'Continuous message monitoring',
      startTime: new Date().toISOString(),
    },
  });

  let messageCount = 0;
  let sessionsSeen = new Set();

  // Log all session discoveries
  listener.on('sessionDiscovered', (session) => {
    if (!sessionsSeen.has(session.sessionId)) {
      sessionsSeen.add(session.sessionId);
      console.log(`\n✨ NEW SESSION DISCOVERED:`);
      console.log(`   Name: ${session.sessionName}`);
      console.log(`   ID:   ${session.sessionId.slice(0, 8)}`);
      console.log(`   Caps: ${session.capabilities.join(', ')}`);
      console.log(`   CWD:  ${session.metadata?.cwd || 'N/A'}\n`);
    }
  });

  // Log all incoming messages
  listener.on('sessionMessage', ({ fromSession, payload }) => {
    messageCount++;
    const timestamp = new Date().toISOString();

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📨 MESSAGE #${messageCount} at ${timestamp}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`From:    ${fromSession?.sessionName || 'unknown'}`);
    console.log(`Type:    ${payload.type || 'unknown'}`);
    console.log(`Payload:`);
    console.log(JSON.stringify(payload, null, 2));
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // Auto-acknowledge if requested
    if (payload.requestAck || payload.requestReply) {
      console.log(`🔄 Auto-acknowledging message...\n`);
      listener.sendToSession(fromSession.sessionId, {
        type: 'acknowledgment',
        from: 'Claude-Listener',
        originalMessage: payload.type,
        message: `✅ Message received and logged by Claude-Listener!`,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Log session departures
  listener.on('sessionDeparted', (session) => {
    console.log(
      `\n❌ SESSION DEPARTED: ${session.sessionName} (${session.sessionId.slice(0, 8)})\n`
    );
  });

  // Connect
  await listener.connect();
  console.log('✅ Connected to AI Bridge');
  console.log('🎧 Listening for all messages...');
  console.log('📊 Status updates every 30 seconds');
  console.log('\nPress Ctrl+C to stop\n');

  // Status updates every 30 seconds
  setInterval(() => {
    const sessions = listener.getSessions();
    const stats = listener.getStats();

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📊 STATUS UPDATE - ${new Date().toISOString()}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Active Sessions: ${sessions.length}`);
    console.log(`Messages Seen:   ${messageCount}`);
    console.log(`Messages Sent:   ${stats.messagesSent}`);
    console.log(`Messages Rcvd:   ${stats.messagesReceived}`);
    console.log(`Uptime:          ${Math.floor(stats.uptime / 1000)}s`);

    if (sessions.length > 0) {
      console.log(`\nActive Sessions:`);
      sessions.forEach((s, i) => {
        console.log(
          `  ${i + 1}. ${s.sessionName} (${s.sessionId.slice(0, 8)}) - ${s.healthy ? '✅' : '⚠️'}`
        );
      });
    }
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  }, 30000);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Stopping listener...');
    console.log(`\n📊 Final Statistics:`);
    console.log(`   Total messages logged: ${messageCount}`);
    console.log(`   Sessions discovered: ${sessionsSeen.size}`);
    console.log(`   Uptime: ${Math.floor(listener.getStats().uptime / 1000)}s\n`);

    await listener.disconnect();
    process.exit(0);
  });
}

listen().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
