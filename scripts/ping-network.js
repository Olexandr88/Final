#!/usr/bin/env node
/**
 * Ping Network
 * Sends direct ping messages to every discovered session so agents know how to respond to peers.
 */

import { SessionDiscoveryService } from '../src/session-discovery.js';

const resolveHttpBase = () => {
  if (process.env.PING_HTTP_BASE) {
    return process.env.PING_HTTP_BASE.replace(/\/$/, '');
  }
  const host =
    process.env.PING_HTTP_HOST ||
    process.env.AI_BRIDGE_HTTP_HOST ||
    process.env.AI_BRIDGE_HOST ||
    'localhost';
  const port = process.env.PING_HTTP_PORT || process.env.AI_BRIDGE_HTTP_PORT || 65029;
  const protocol = process.env.PING_HTTP_PROTO || 'http';
  return `${protocol}://${host}:${port}`;
};

const httpBase = resolveHttpBase();
const pingMessage =
  process.env.PING_MESSAGE || '👋 Ping from the coordination grid. Reply with session.pong!';
const sessionName = process.env.PING_SESSION_NAME || 'Ping-Coordinator';
const bridgeUrl = process.env.PING_BRIDGE_WS;

const service = new SessionDiscoveryService({
  bridgeUrl,
  sessionName,
  capabilities: ['ping', 'diagnostics', 'session-sync'],
  metadata: {
    purpose: 'Network reachability ping',
    instructions: 'Respond with session.pong and include current workload stats.',
  },
});

const nowPayload = (what, extra = {}) => ({
  who: service.sessionId,
  what,
  when: new Date().toISOString(),
  ...extra,
});

const fetchAgents = async () => {
  const res = await fetch(`${httpBase}/agents`);
  if (!res.ok) {
    throw new Error(`Failed to fetch agents: ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data?.agents) ? data.agents : [];
};

const sendPing = (agent) => {
  service.sendToSession(
    agent.id,
    nowPayload('session.ping', {
      message: pingMessage,
      target: {
        id: agent.id,
        role: agent.role,
        labels: agent.labels || [],
      },
      expectations: [
        'Respond with session.pong payload containing capabilities + current tasks',
        'Log the response to hook log via session.sync broadcast',
      ],
    })
  );
};

const run = async () => {
  try {
    console.log('🚀 Connecting for network ping...\n');
    await service.connect();
    console.log(`✓ Connected as ${service.sessionName} (${service.sessionId})`);

    service.on('sessionDiscovered', (session) => {
      console.log(
        `👀 Discovered session: ${session.sessionName || session.from} [${session.sessionId}]`
      );
    });

    service.on('sessionMessage', ({ fromSession, payload }) => {
      if (payload?.what === 'session.pong') {
        console.log(`📡 Pong from ${fromSession.sessionName || fromSession.sessionId}:`, payload);
      } else {
        console.log(
          `💬 Message from ${fromSession.sessionName || fromSession.sessionId}:`,
          payload
        );
      }
    });

    const agents = (await fetchAgents()).filter((agent) => agent.id !== service.sessionId);
    if (agents.length === 0) {
      console.log('⚠️ No agents to ping. Exiting.');
      process.exit(0);
    }

    console.log(`📬 Pinging ${agents.length} agents...\n`);
    agents.forEach(sendPing);

    service.broadcast(
      nowPayload('session.ping.broadcast', {
        message: pingMessage,
        targets: agents.map((agent) => ({
          id: agent.id,
          role: agent.role,
          labels: agent.labels || [],
        })),
        expectations: ['Respond with session.pong', 'Echo to hook log'],
      })
    );

    console.log('⌛ Waiting for responses. Press Ctrl+C to quit when done.\n');
    const timeoutMs = Number(process.env.PING_WAIT_MS || 120000);
    setTimeout(() => {
      console.log('⏲️ Ping window elapsed. Disconnecting.');
      service.disconnect();
      process.exit(0);
    }, timeoutMs);
  } catch (error) {
    console.error('Ping failed:', error);
    process.exit(1);
  }
};

run();
