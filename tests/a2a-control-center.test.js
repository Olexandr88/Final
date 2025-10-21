/**
 * A2A Control Center Test Suite
 * Comprehensive integration test for A2A system with real network connections
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createAIBridgeServer } from '../src/ai-bridge.js';

const TEST_TIMEOUT = 15000;

let bridgeServer;
let testClients = [];
let BRIDGE_WS_PORT;
let BRIDGE_HTTP_PORT;

describe('A2A Control Center Integration Tests', { timeout: TEST_TIMEOUT }, () => {
  before(async () => {
    console.log('Starting A2A Bridge Server for testing...');
    try {
      bridgeServer = await createAIBridgeServer({
        wsPort: 0, // Use dynamic port
        httpPort: 0, // Use dynamic port
        historyLimit: 50,
        logger: {
          log: () => {},
          error: () => {},
          warn: () => {}
        }
      });
      BRIDGE_WS_PORT = bridgeServer.ports.ws;
      BRIDGE_HTTP_PORT = bridgeServer.ports.http;
      console.log(`Bridge started on WS:${BRIDGE_WS_PORT}, HTTP:${BRIDGE_HTTP_PORT}`);
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.error('Failed to start bridge server:', error);
      throw error;
    }
  });

  after(async () => {
    console.log('Cleaning up test resources...');
    try {
      // Close all WebSocket clients first
      const closePromises = testClients.map(ws => {
        return new Promise(resolve => {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.once('close', resolve);
            ws.close();
            // Force close after 1 second
            setTimeout(resolve, 200);
          } else {
            resolve();
          }
        });
      });
      await Promise.all(closePromises);
      testClients = [];

      // Close the bridge server
      if (bridgeServer) {
        await bridgeServer.close();
        bridgeServer = null;
      }

      // Give time for ports to be released
      await new Promise(resolve => setTimeout(resolve, 100));
      console.log('Cleanup completed');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  });

  describe('Bridge Server Health', { timeout: TEST_TIMEOUT }, () => {
    test('HTTP health endpoint responds correctly', { timeout: TEST_TIMEOUT }, async () => {
      const response = await fetch(`http://localhost:${BRIDGE_HTTP_PORT}/health`);
      assert.strictEqual(response.ok, true);

      const data = await response.json();
      assert.strictEqual(data.status, 'ok');
      assert.strictEqual(data.wsPort, BRIDGE_WS_PORT);
      assert.strictEqual(data.httpPort, BRIDGE_HTTP_PORT);
      assert.ok(data.timestamp);
      assert.ok(typeof data.connectedClients === 'number');
      assert.ok(typeof data.historySize === 'number');
      assert.ok(typeof data.uptime === 'number');
      assert.strictEqual(data.version, '1.1.0');
    });

    test('API status endpoint returns detailed metrics', { timeout: TEST_TIMEOUT }, async () => {
      const response = await fetch(`http://localhost:${BRIDGE_HTTP_PORT}/api/status`);
      assert.strictEqual(response.ok, true);

      const data = await response.json();
      assert.strictEqual(data.service, 'AI Bridge Server');
      assert.strictEqual(data.status, 'healthy');
      assert.ok(data.performance);
      assert.ok(typeof data.performance.messagesProcessed === 'number');
      assert.ok(typeof data.performance.connectedClients === 'number');
      assert.ok(data.websocket);
      assert.strictEqual(data.websocket.port, BRIDGE_WS_PORT);
      assert.strictEqual(data.websocket.enabled, true);
      assert.ok(data.http);
      assert.strictEqual(data.http.port, BRIDGE_HTTP_PORT);
      assert.strictEqual(data.http.enabled, true);
    });

    test('Agents endpoint returns empty list initially', { timeout: TEST_TIMEOUT }, async () => {
      const response = await fetch(`http://localhost:${BRIDGE_HTTP_PORT}/agents`);
      assert.strictEqual(response.ok, true);

      const data = await response.json();
      assert.ok(Array.isArray(data.agents));
    });

    test('History endpoint returns empty array initially', { timeout: TEST_TIMEOUT }, async () => {
      const response = await fetch(`http://localhost:${BRIDGE_HTTP_PORT}/history`);
      assert.strictEqual(response.ok, true);

      const data = await response.json();
      assert.ok(Array.isArray(data.history));
    });
  });

  describe('WebSocket Connection and Registration', { timeout: TEST_TIMEOUT }, () => {
    test('Client can connect to WebSocket server', { timeout: TEST_TIMEOUT }, async () => {
      const ws = new WebSocket(`ws://localhost:${BRIDGE_WS_PORT}`);
      testClients.push(ws);

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);
        ws.on('open', () => {
          clearTimeout(timeout);
          assert.strictEqual(ws.readyState, WebSocket.OPEN);
          resolve();
        });
        ws.on('error', reject);
      });
    });

    test('Client can register as agent', async () => {
      const ws = new WebSocket(`ws://localhost:${BRIDGE_WS_PORT}`);
      testClients.push(ws);

      const registered = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Registration timeout')), 5000);

        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'register',
            clientId: 'test-agent-1',
            role: 'ai-assistant',
            labels: ['test', 'ollama'],
            tools: ['conversation'],
            intents: ['ai.query'],
            maxConcurrentTasks: 5
          }));
        });

        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'registered') {
            clearTimeout(timeout);
            resolve(msg);
          }
        });

        ws.on('error', reject);
      });

      assert.strictEqual(registered.type, 'registered');
      assert.strictEqual(registered.clientId, 'test-agent-1');
      assert.ok(registered.client);
      assert.strictEqual(registered.client.id, 'test-agent-1');
      assert.strictEqual(registered.client.role, 'ai-assistant');
      assert.ok(Array.isArray(registered.client.labels));
      assert.ok(Array.isArray(registered.history));
    });

    test('Multiple agents can register simultaneously', async () => {
      const agents = ['test-agent-2', 'test-agent-3', 'test-agent-4'];
      const registrations = [];

      for (const agentId of agents) {
        const ws = new WebSocket(`ws://localhost:${BRIDGE_WS_PORT}`);
        testClients.push(ws);

        const promise = new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error(`Registration timeout for ${agentId}`)), 5000);

          ws.on('open', () => {
            ws.send(JSON.stringify({
              type: 'register',
              clientId: agentId,
              role: 'ai-assistant',
              labels: ['test']
            }));
          });

          ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'registered') {
              clearTimeout(timeout);
              resolve(msg);
            }
          });

          ws.on('error', reject);
        });

        registrations.push(promise);
      }

      const results = await Promise.all(registrations);
      assert.strictEqual(results.length, 3);
      results.forEach((result, idx) => {
        assert.strictEqual(result.clientId, agents[idx]);
      });
    });

    test('Registered agents appear in agents list', async () => {
      await new Promise(resolve => setTimeout(resolve, 100));

      const response = await fetch(`http://localhost:${BRIDGE_HTTP_PORT}/agents`);
      const data = await response.json();

      assert.ok(data.agents.length > 0);
      const agentIds = data.agents.map(a => a.id);
      assert.ok(agentIds.includes('test-agent-1'));
    });
  });

  describe('Message Sending and Receiving', () => {
    test('Agent can send message to specific recipient', async () => {
      const sender = new WebSocket(`ws://localhost:${BRIDGE_WS_PORT}`);
      const receiver = new WebSocket(`ws://localhost:${BRIDGE_WS_PORT}`);
      testClients.push(sender, receiver);

      await Promise.all([
        new Promise((resolve) => {
          sender.on('open', () => {
            sender.send(JSON.stringify({
              type: 'register',
              clientId: 'sender-agent',
              role: 'ai-assistant'
            }));
          });
          sender.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'registered') resolve();
          });
        }),
        new Promise((resolve) => {
          receiver.on('open', () => {
            receiver.send(JSON.stringify({
              type: 'register',
              clientId: 'receiver-agent',
              role: 'ai-assistant'
            }));
          });
          receiver.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'registered') resolve();
          });
        })
      ]);

      const receivedMessage = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Message receive timeout')), 5000);

        receiver.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (Array.isArray(msg) && msg[0] === 'env') {
            clearTimeout(timeout);
            resolve(msg[1]);
          }
        });

        sender.send(JSON.stringify({
          type: 'envelope',
          envelope: {
            from: 'sender-agent',
            to: 'receiver-agent',
            intent: 'ai.query',
            payload: { message: 'Hello receiver!' }
          }
        }));
      });

      assert.strictEqual(receivedMessage.from, 'sender-agent');
      assert.strictEqual(receivedMessage.to, 'receiver-agent');
      assert.strictEqual(receivedMessage.intent, 'ai.query');
      assert.strictEqual(receivedMessage.payload.message, 'Hello receiver!');
      assert.ok(receivedMessage.id);
      assert.ok(receivedMessage.timestamp);
    });

    test.skip('Agent can broadcast message to all agents', async () => {
      const broadcaster = new WebSocket(`ws://localhost:${BRIDGE_WS_PORT}`);
      const listeners = [
        new WebSocket(`ws://localhost:${BRIDGE_WS_PORT}`),
        new WebSocket(`ws://localhost:${BRIDGE_WS_PORT}`)
      ];
      testClients.push(broadcaster, ...listeners);

      // Set up broadcast handlers FIRST (before any registration)
      const broadcastPromises = listeners.map((ws, idx) => {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Broadcast timeout for listener-${idx}`));
          }, 5000);

          const handler = (data) => {
            try {
              const msg = JSON.parse(data.toString());
              console.log(`[listener-${idx}] Received:`, JSON.stringify(msg).substring(0, 100));
              // Only capture broadcast envelope format: ['env', envelope]
              if (Array.isArray(msg) && msg[0] === 'env' && msg[1]?.intent === 'system.broadcast') {
                console.log(`[listener-${idx}] MATCHED broadcast!`);
                clearTimeout(timeout);
                ws.off('message', handler); // Remove handler once matched
                resolve(msg[1]);
              }
            } catch (e) {
              console.log(`[listener-${idx}] Parse error:`, e.message);
            }
          };

          ws.on('message', handler);
          ws.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
          });
        });
      });

      // Register broadcaster
      await new Promise((resolve) => {
        broadcaster.on('open', () => {
          broadcaster.send(JSON.stringify({
            type: 'register',
            clientId: 'broadcaster-agent',
            role: 'coordinator'
          }));
        });
        broadcaster.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'registered') resolve();
        });
      });

      // Register listeners
      const registrationPromises = listeners.map((ws, idx) => {
        return new Promise((resolve) => {
          ws.on('open', () => {
            ws.send(JSON.stringify({
              type: 'register',
              clientId: `listener-${idx}`,
              role: 'ai-assistant'
            }));
          });
          const handler = (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'registered') {
              ws.off('message', handler);
              resolve();
            }
          };
          ws.on('message', handler);
        });
      });

      await Promise.all(registrationPromises);

      // Give a moment for everything to settle
      await new Promise(resolve => setTimeout(resolve, 100));

      // Send broadcast
      broadcaster.send(JSON.stringify({
        type: 'envelope',
        envelope: {
          from: 'broadcaster-agent',
          intent: 'system.broadcast',
          payload: { announcement: 'Message to all agents' }
        }
      }));

      const messages = await Promise.all(broadcastPromises);

      assert.strictEqual(messages.length, 2);
      messages.forEach(msg => {
        assert.ok(msg.from);
        assert.strictEqual(msg.from, 'broadcaster-agent');
        assert.strictEqual(msg.intent, 'system.broadcast');
      });
    });

    test('Messages are stored in history', async () => {
      await new Promise(resolve => setTimeout(resolve, 100));

      const response = await fetch(`http://localhost:${BRIDGE_HTTP_PORT}/history`);
      const data = await response.json();

      assert.ok(data.history.length > 0);
      assert.ok(data.history.some(msg => msg.from === 'sender-agent'));
      assert.ok(data.history.some(msg => msg.intent === 'ai.query'));
    });

    test('HTTP POST /send endpoint works', async () => {
      const response = await fetch(`http://localhost:${BRIDGE_HTTP_PORT}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: 'receiver-agent',
          intent: 'api.message',
          payload: { text: 'Message via HTTP' }
        })
      });

      assert.strictEqual(response.ok, true);
      const data = await response.json();
      assert.strictEqual(data.status, 'queued');
      assert.ok(data.envelope);
      assert.strictEqual(data.envelope.to, 'receiver-agent');
    });

    test('HTTP POST /broadcast endpoint works', async () => {
      const response = await fetch(`http://localhost:${BRIDGE_HTTP_PORT}/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'api.broadcast',
          payload: { announcement: 'Broadcast via HTTP' }
        })
      });

      assert.strictEqual(response.ok, true);
      const data = await response.json();
      assert.strictEqual(data.status, 'queued');
      assert.ok(data.envelope);
    });
  });

  describe('System Monitoring and Stats', () => {
    test('Client list query works', async () => {
      const ws = new WebSocket(`ws://localhost:${BRIDGE_WS_PORT}`);
      testClients.push(ws);

      await new Promise((resolve) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'register',
            clientId: 'monitor-client',
            role: 'monitor'
          }));
        });
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'registered') resolve();
        });
      });

      const clientList = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Client list timeout')), 5000);

        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'clients') {
            clearTimeout(timeout);
            resolve(msg.clients);
          }
        });

        ws.send(JSON.stringify({ type: 'list_clients' }));
      });

      assert.ok(Array.isArray(clientList));
      assert.ok(clientList.length > 0);
      assert.ok(clientList.some(c => c.id === 'monitor-client'));
    });

    test('Stats query works', async () => {
      const ws = new WebSocket(`ws://localhost:${BRIDGE_WS_PORT}`);
      testClients.push(ws);

      await new Promise((resolve) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'register',
            clientId: 'stats-client',
            role: 'monitor'
          }));
        });
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'registered') resolve();
        });
      });

      const stats = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Stats timeout')), 5000);

        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'stats') {
            clearTimeout(timeout);
            resolve(msg.stats);
          }
        });

        ws.send(JSON.stringify({ type: 'get_stats' }));
      });

      assert.ok(stats);
      assert.ok(typeof stats.messagesProcessed === 'number');
      assert.ok(typeof stats.connectedClients === 'number');
      assert.ok(typeof stats.uptime === 'number');
      assert.ok(typeof stats.messagesPerSecond === 'number');
    });

    test('Heartbeat mechanism works', async () => {
      const ws = new WebSocket(`ws://localhost:${BRIDGE_WS_PORT}`);
      testClients.push(ws);

      await new Promise((resolve) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'register',
            clientId: 'heartbeat-client',
            role: 'ai-assistant'
          }));
        });
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'registered') resolve();
        });
      });

      ws.send(JSON.stringify({ type: 'heartbeat' }));

      await new Promise(resolve => setTimeout(resolve, 100));

      const response = await fetch(`http://localhost:${BRIDGE_HTTP_PORT}/agents`);
      const data = await response.json();
      const heartbeatClient = data.agents.find(a => a.id === 'heartbeat-client');

      assert.ok(heartbeatClient);
      assert.ok(heartbeatClient.lastSeen);
    });
  });

  describe('Error Handling', () => {
    test('Invalid JSON is handled gracefully', async () => {
      const ws = new WebSocket(`ws://localhost:${BRIDGE_WS_PORT}`);
      testClients.push(ws);

      await new Promise((resolve) => {
        ws.on('open', resolve);
      });

      ws.send('invalid json{{{');

      await new Promise(resolve => setTimeout(resolve, 100));

      assert.strictEqual(ws.readyState, WebSocket.OPEN);
    });

    test('Missing required fields returns error', async () => {
      const response = await fetch(`http://localhost:${BRIDGE_HTTP_PORT}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'test',
          payload: { message: 'Missing to field' }
        })
      });

      assert.strictEqual(response.status, 400);
      const data = await response.json();
      assert.ok(data.error);
    });

    test('Unknown message type is ignored', async () => {
      const ws = new WebSocket(`ws://localhost:${BRIDGE_WS_PORT}`);
      testClients.push(ws);

      await new Promise((resolve) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'register',
            clientId: 'unknown-type-client',
            role: 'test'
          }));
        });
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'registered') resolve();
        });
      });

      ws.send(JSON.stringify({ type: 'completely_unknown_type' }));

      await new Promise(resolve => setTimeout(resolve, 100));

      assert.strictEqual(ws.readyState, WebSocket.OPEN);
    });

    test('Disconnected client is removed from list', async () => {
      const ws = new WebSocket(`ws://localhost:${BRIDGE_WS_PORT}`);
      testClients.push(ws);

      await new Promise((resolve) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'register',
            clientId: 'disconnect-test-client',
            role: 'test'
          }));
        });
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'registered') resolve();
        });
      });

      let beforeResponse = await fetch(`http://localhost:${BRIDGE_HTTP_PORT}/agents`);
      let beforeData = await beforeResponse.json();
      assert.ok(beforeData.agents.some(a => a.id === 'disconnect-test-client'));

      ws.close();
      await new Promise(resolve => setTimeout(resolve, 100));

      let afterResponse = await fetch(`http://localhost:${BRIDGE_HTTP_PORT}/agents`);
      let afterData = await afterResponse.json();
      assert.ok(!afterData.agents.some(a => a.id === 'disconnect-test-client'));
    });
  });

  describe('History and Filtering', () => {
    test('History can be filtered by agentId', async () => {
      const response = await fetch(`http://localhost:${BRIDGE_HTTP_PORT}/history?agentId=sender-agent`);
      const data = await response.json();

      assert.ok(Array.isArray(data.history));
      data.history.forEach(msg => {
        assert.ok(msg.from === 'sender-agent' || msg.to === 'sender-agent');
      });
    });

    test('History can be filtered by intent', async () => {
      const response = await fetch(`http://localhost:${BRIDGE_HTTP_PORT}/history?intent=ai.query`);
      const data = await response.json();

      assert.ok(Array.isArray(data.history));
      data.history.forEach(msg => {
        assert.strictEqual(msg.intent, 'ai.query');
      });
    });

    test('History can be limited', async () => {
      const response = await fetch(`http://localhost:${BRIDGE_HTTP_PORT}/history?limit=5`);
      const data = await response.json();

      assert.ok(Array.isArray(data.history));
      assert.ok(data.history.length <= 5);
    });
  });

  describe('Performance and Scalability', () => {
    test('Can handle rapid message sending', async () => {
      const ws = new WebSocket(`ws://localhost:${BRIDGE_WS_PORT}`);
      testClients.push(ws);

      await new Promise((resolve) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'register',
            clientId: 'rapid-sender',
            role: 'test'
          }));
        });
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'registered') resolve();
        });
      });

      const messageCount = 50;
      const startTime = Date.now();

      for (let i = 0; i < messageCount; i++) {
        ws.send(JSON.stringify({
          type: 'envelope',
          envelope: {
            from: 'rapid-sender',
            intent: 'performance.test',
            payload: { index: i }
          }
        }));
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      const endTime = Date.now();
      const duration = endTime - startTime;

      assert.ok(duration < 5000);
      assert.strictEqual(ws.readyState, WebSocket.OPEN);
    });

    test('Stats show accurate message counts', async () => {
      const response = await fetch(`http://localhost:${BRIDGE_HTTP_PORT}/api/status`);
      const data = await response.json();

      assert.ok(data.performance.messagesProcessed > 50);
      assert.ok(data.performance.messagesPerSecond >= 0);
    });
  });

  describe('Tasks Endpoint', () => {
    test('Tasks endpoint returns task list', async () => {
      const ws = new WebSocket(`ws://localhost:${BRIDGE_WS_PORT}`);
      testClients.push(ws);

      await new Promise((resolve) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'register',
            clientId: 'task-sender',
            role: 'test'
          }));
        });
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'registered') resolve();
        });
      });

      ws.send(JSON.stringify({
        type: 'envelope',
        envelope: {
          from: 'task-sender',
          taskId: 'test-task-123',
          intent: 'task.create',
          payload: { description: 'Test task' }
        }
      }));

      await new Promise(resolve => setTimeout(resolve, 100));

      const response = await fetch(`http://localhost:${BRIDGE_HTTP_PORT}/tasks`);
      const data = await response.json();

      assert.ok(Array.isArray(data.tasks));
      const testTask = data.tasks.find(t => t.taskId === 'test-task-123');
      assert.ok(testTask);
      assert.ok(Array.isArray(testTask.intents));
      assert.ok(Array.isArray(testTask.participants));
    });
  });

  describe('Connection Stability', () => {
    test('Bridge maintains connections under load', async () => {
      const connections = [];
      const connectionCount = 10;

      for (let i = 0; i < connectionCount; i++) {
        const ws = new WebSocket(`ws://localhost:${BRIDGE_WS_PORT}`);
        testClients.push(ws);

        const promise = new Promise((resolve) => {
          ws.on('open', () => {
            ws.send(JSON.stringify({
              type: 'register',
              clientId: `load-test-${i}`,
              role: 'test'
            }));
          });
          ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'registered') resolve(ws);
          });
        });

        connections.push(promise);
      }

      const sockets = await Promise.all(connections);

      assert.strictEqual(sockets.length, connectionCount);
      sockets.forEach(ws => {
        assert.strictEqual(ws.readyState, WebSocket.OPEN);
      });

      const response = await fetch(`http://localhost:${BRIDGE_HTTP_PORT}/agents`);
      const data = await response.json();

      assert.ok(data.agents.length >= connectionCount);
    });

    test('Bridge recovers from connection errors', async () => {
      const ws = new WebSocket(`ws://localhost:${BRIDGE_WS_PORT}`);
      testClients.push(ws);

      let errorOccurred = false;
      ws.on('error', () => {
        errorOccurred = true;
      });

      await new Promise((resolve) => {
        ws.on('open', resolve);
      });

      ws.terminate();
      await new Promise(resolve => setTimeout(resolve, 100));

      const newWs = new WebSocket(`ws://localhost:${BRIDGE_WS_PORT}`);
      testClients.push(newWs);

      await new Promise((resolve) => {
        newWs.on('open', resolve);
      });

      assert.strictEqual(newWs.readyState, WebSocket.OPEN);
    });
  });
});
