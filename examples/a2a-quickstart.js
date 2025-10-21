#!/usr/bin/env node
/**
 * A2A System Quick Start Guide
 *
 * Start servers:
 *   npm run start:a2a     # HTTP server on port 3001
 *   npm run start:bridge  # WebSocket bridge on port 4567
 */

import WebSocket from 'ws';
import fetch from 'node-fetch';

// Example 1: HTTP API Usage (Simple)
async function httpExample() {
  console.log('\n=== HTTP API Example ===\n');

  // Register an agent
  const reg = await fetch('http://localhost:3001/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent_id: 'worker-1',
      capabilities: ['data-processing'],
      metadata: { version: '1.0' }
    })
  });
  console.log('✅ Registered:', await reg.json());

  // Send message between agents
  const msg = await fetch('http://localhost:3001/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'worker-1',
      to: 'test-agent-1',
      payload: { task: 'analyze data', data: [1, 2, 3] }
    })
  });
  console.log('✅ Message sent:', await msg.json());

  // Create workflow
  const wf = await fetch('http://localhost:3001/workflow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'data-pipeline',
      steps: [
        { provider: 'ollama', action: 'preprocess' },
        { provider: 'claude', action: 'analyze' },
        { provider: 'ollama', action: 'summarize' }
      ],
      input: 'User data to process'
    })
  });
  console.log('✅ Workflow created:', await wf.json());
}

// Example 2: WebSocket Bridge Usage (Real-time)
function websocketExample() {
  console.log('\n=== WebSocket Bridge Example ===\n');

  const ws = new WebSocket('ws://localhost:4567');

  ws.on('open', () => {
    console.log('✅ Connected to bridge');

    // Register with capabilities
    ws.send(JSON.stringify({
      type: 'register',
      clientId: 'realtime-agent',
      role: 'worker',
      tools: ['compute', 'transform'],
      maxConcurrentTasks: 5
    }));
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data);

    if (msg.type === 'registered') {
      console.log('✅ Registered as:', msg.client.id);

      // Send envelope to specific agent
      ws.send(JSON.stringify({
        type: 'envelope',
        envelope: {
          from: 'realtime-agent',
          to: 'worker-1',
          intent: 'task.assign',
          payload: { job: 'compute-42' }
        }
      }));

      // Broadcast to all agents
      ws.send(JSON.stringify({
        type: 'envelope',
        envelope: {
          from: 'realtime-agent',
          intent: 'system.announce',
          payload: { status: 'ready' }
        }
      }));
    }

    if (msg[0] === 'env') {
      const envelope = msg[1];
      console.log('📬 Received:', envelope.intent, 'from', envelope.from);
      console.log('   Payload:', envelope.payload);
    }
  });

  // Heartbeat to stay connected
  setInterval(() => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'heartbeat' }));
    }
  }, 30000);

  return ws;
}

// Example 3: Multi-Agent Collaboration
async function collaborationExample() {
  console.log('\n=== Multi-Agent Collaboration ===\n');

  const result = await fetch('http://localhost:3001/collaborate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'collaborative-task',
      agents: ['worker-1', 'test-agent-1', 'realtime-agent'],
      task: 'Analyze user behavior and generate insights',
      data: {
        users: 1000,
        events: 5000,
        timeframe: '24h'
      }
    })
  });
  console.log('✅ Collaboration started:', await result.json());
}

// Run examples
(async () => {
  try {
    await httpExample();
    const ws = websocketExample();

    await new Promise(resolve => setTimeout(resolve, 2000));
    await collaborationExample();

    setTimeout(() => {
      ws.close();
      console.log('\n✅ Demo complete\n');
      process.exit(0);
    }, 3000);

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
