/**
 * Docker Integration Tests - Tests with real Docker daemon
 * NOTE: Requires Docker to be running
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DockerClient } from '../../src/docker/docker-client.js';
import { DockerManager } from '../../src/docker/docker-manager.js';
import { DockerEventsEmitter } from '../../src/docker/docker-events-emitter.js';
import WebSocket from 'ws';

describe('Docker Integration Tests', () => {
  let client;
  let manager;
  let emitter;
  let dockerAvailable = false;
  let testContainerId = null;

  before(async () => {
    client = new DockerClient();

    try {
      dockerAvailable = await client.ping();

      if (!dockerAvailable) {
        console.log('⚠️  Docker not available - skipping integration tests');
      }
    } catch (error) {
      console.log('⚠️  Docker not available - skipping integration tests');
      dockerAvailable = false;
    }
  });

  describe('DockerClient Integration', () => {
    it('should ping Docker daemon', async () => {
      if (!dockerAvailable) return;

      const result = await client.ping();
      assert.strictEqual(result, true);
    });

    it('should get Docker system info', async () => {
      if (!dockerAvailable) return;

      const info = await client.getInfo();

      assert.ok(info);
      assert.ok(typeof info.containers === 'number');
      assert.ok(typeof info.containersRunning === 'number');
      assert.ok(info.serverVersion);
      assert.ok(info.osType);
    });

    it('should list containers', async () => {
      if (!dockerAvailable) return;

      const containers = await client.listContainers({ all: true });

      assert.ok(Array.isArray(containers));
      // May be empty if no containers exist
    });

    it('should list images', async () => {
      if (!dockerAvailable) return;

      const images = await client.listImages();

      assert.ok(Array.isArray(images));
      // May be empty if no images exist
    });

    it('should list volumes', async () => {
      if (!dockerAvailable) return;

      const volumes = await client.listVolumes();

      assert.ok(Array.isArray(volumes));
    });

    it('should list networks', async () => {
      if (!dockerAvailable) return;

      const networks = await client.listNetworks();

      assert.ok(Array.isArray(networks));
      assert.ok(networks.length > 0); // Default networks should exist
    });
  });

  describe('DockerManager Integration', () => {
    beforeEach(async () => {
      if (!dockerAvailable) return;

      manager = new DockerManager({
        pollIntervalContainers: 500,
        pollIntervalStats: 500
      });
    });

    afterEach(async () => {
      if (manager && manager.isRunning) {
        await manager.stop();
      }
    });

    it('should start and stop manager', async () => {
      if (!dockerAvailable) return;

      await manager.start();
      assert.strictEqual(manager.isRunning, true);

      await manager.stop();
      assert.strictEqual(manager.isRunning, false);
    });

    it('should poll containers', async () => {
      if (!dockerAvailable) return;

      let polled = false;

      manager.on('container:discovered', () => {
        polled = true;
      });

      await manager.start();

      // Wait for polling
      await new Promise(resolve => setTimeout(resolve, 600));

      const containers = manager.getContainers();
      assert.ok(Array.isArray(containers));
    });

    it('should get system info', async () => {
      if (!dockerAvailable) return;

      await manager.start();

      const info = await manager.getSystemInfo();

      assert.ok(info);
      assert.ok(typeof info.containers === 'number');
    });

    it('should list images through manager', async () => {
      if (!dockerAvailable) return;

      await manager.start();

      const images = await manager.listImages();

      assert.ok(Array.isArray(images));
    });

    it('should list volumes through manager', async () => {
      if (!dockerAvailable) return;

      await manager.start();

      const volumes = await manager.listVolumes();

      assert.ok(Array.isArray(volumes));
    });

    it('should list networks through manager', async () => {
      if (!dockerAvailable) return;

      await manager.start();

      const networks = await manager.listNetworks();

      assert.ok(Array.isArray(networks));
      assert.ok(networks.length > 0);
    });
  });

  describe('DockerEventsEmitter Integration', () => {
    beforeEach(async () => {
      if (!dockerAvailable) return;

      manager = new DockerManager({
        pollIntervalContainers: 500,
        pollIntervalStats: 500
      });

      await manager.start();

      emitter = new DockerEventsEmitter(manager);
    });

    afterEach(async () => {
      if (emitter && emitter.isRunning) {
        await emitter.stop();
      }

      if (manager && manager.isRunning) {
        await manager.stop();
      }
    });

    it('should start WebSocket server', async () => {
      if (!dockerAvailable) return;

      await emitter.start(0); // Dynamic port

      assert.strictEqual(emitter.isRunning, true);
      assert.ok(emitter.wss);
    });

    it('should accept WebSocket connections', async () => {
      if (!dockerAvailable) return;

      const port = 65031; // Use different port to avoid conflicts
      await emitter.start(port);

      const ws = new WebSocket(`ws://localhost:${port}`);

      await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
      });

      assert.strictEqual(ws.readyState, WebSocket.OPEN);
      assert.strictEqual(emitter.getClientCount(), 1);

      ws.close();
      await new Promise(resolve => setTimeout(resolve, 100));

      assert.strictEqual(emitter.getClientCount(), 0);
    });

    it('should send initial state to client', async () => {
      if (!dockerAvailable) return;

      const port = 65032;
      await emitter.start(port);

      const ws = new WebSocket(`ws://localhost:${port}`);
      let receivedMessage = null;

      await new Promise((resolve) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'initial:state') {
            receivedMessage = message;
            resolve();
          }
        });

        ws.on('open', () => {
          // Initial state should be sent automatically
        });
      });

      assert.ok(receivedMessage);
      assert.strictEqual(receivedMessage.type, 'initial:state');
      assert.ok(receivedMessage.data);
      assert.ok(Array.isArray(receivedMessage.data.containers));

      ws.close();
    });

    it('should broadcast Docker events', async () => {
      if (!dockerAvailable) return;

      const port = 65033;
      await emitter.start(port);

      const ws = new WebSocket(`ws://localhost:${port}`);
      const receivedEvents = [];

      await new Promise((resolve) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          receivedEvents.push(message);

          if (receivedEvents.length > 1) { // Initial state + at least one event
            resolve();
          }
        });

        ws.on('open', () => {
          // Wait for events
        });

        // Give it time to receive events
        setTimeout(resolve, 1500);
      });

      assert.ok(receivedEvents.length > 0);
      assert.ok(receivedEvents.some(e => e.type === 'initial:state'));

      ws.close();
    });

    it('should handle client ping/pong', async () => {
      if (!dockerAvailable) return;

      const port = 65034;
      await emitter.start(port);

      const ws = new WebSocket(`ws://localhost:${port}`);

      await new Promise((resolve) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({ type: 'ping' }));
        });

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'pong') {
            resolve();
          }
        });
      });

      ws.close();
    });

    it('should handle multiple concurrent clients', async () => {
      if (!dockerAvailable) return;

      const port = 65035;
      await emitter.start(port);

      const clients = [];

      // Connect 5 clients
      for (let i = 0; i < 5; i++) {
        const ws = new WebSocket(`ws://localhost:${port}`);
        await new Promise(resolve => ws.on('open', resolve));
        clients.push(ws);
      }

      assert.strictEqual(emitter.getClientCount(), 5);

      // Close all clients
      for (const ws of clients) {
        ws.close();
      }

      await new Promise(resolve => setTimeout(resolve, 100));
      assert.strictEqual(emitter.getClientCount(), 0);
    });
  });

  describe('End-to-End Workflow', () => {
    it('should handle complete Docker workflow', async () => {
      if (!dockerAvailable) return;

      // Start manager
      manager = new DockerManager({
        pollIntervalContainers: 500,
        pollIntervalStats: 500
      });

      await manager.start();
      assert.strictEqual(manager.isRunning, true);

      // Start emitter
      const port = 65036;
      emitter = new DockerEventsEmitter(manager);
      await emitter.start(port);
      assert.strictEqual(emitter.isRunning, true);

      // Connect WebSocket client
      const ws = new WebSocket(`ws://localhost:${port}`);
      const events = [];

      await new Promise((resolve) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({ type: 'subscribe' }));
        });

        ws.on('message', (data) => {
          events.push(JSON.parse(data.toString()));
          if (events.length >= 2) { // Initial state + subscribed
            resolve();
          }
        });

        setTimeout(resolve, 1000);
      });

      // Should have received events
      assert.ok(events.length > 0);
      assert.ok(events.some(e => e.type === 'initial:state'));

      // Cleanup
      ws.close();
      await emitter.stop();
      await manager.stop();

      assert.strictEqual(manager.isRunning, false);
      assert.strictEqual(emitter.isRunning, false);
    });
  });
});
