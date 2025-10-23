/**
 * Docker Manager - Unit Tests
 */

import { describe, it, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { DockerManager } from '../src/docker/docker-manager.js';
import { DockerClient } from '../src/docker/docker-client.js';

describe('DockerManager', () => {
  let manager;
  let mockClient;

  beforeEach(() => {
    // Mock DockerClient
    mockClient = {
      ping: mock.fn(async () => true),
      listContainers: mock.fn(async () => [
        {
          id: 'container1',
          name: 'test-container-1',
          image: 'nginx:latest',
          state: 'running',
          status: 'Up 2 hours',
          created: Date.now() / 1000,
          ports: [],
          labels: {}
        }
      ]),
      getContainerStats: mock.fn(async () => ({
        cpu_stats: {
          cpu_usage: { total_usage: 1000000 },
          system_cpu_usage: 10000000,
          online_cpus: 4
        },
        precpu_stats: {
          cpu_usage: { total_usage: 900000 },
          system_cpu_usage: 9000000
        },
        memory_stats: {
          usage: 104857600, // 100MB
          limit: 1073741824  // 1GB
        },
        networks: {
          eth0: {
            rx_bytes: 1024000,
            tx_bytes: 512000
          }
        },
        blkio_stats: {
          io_service_bytes_recursive: [
            { op: 'Read', value: 2048000 },
            { op: 'Write', value: 1024000 }
          ]
        }
      })),
      startContainer: mock.fn(async () => {}),
      stopContainer: mock.fn(async () => {}),
      restartContainer: mock.fn(async () => {}),
      removeContainer: mock.fn(async () => {}),
      inspectContainer: mock.fn(async (id) => ({
        id,
        name: 'test-container',
        image: 'nginx:latest',
        state: { Status: 'running' },
        created: new Date().toISOString()
      })),
      getInfo: mock.fn(async () => ({
        containers: 5,
        containersRunning: 3,
        containersPaused: 0,
        containersStopped: 2,
        images: 10
      }))
    };

    manager = new DockerManager({
      pollIntervalContainers: 100, // Fast polling for tests
      pollIntervalStats: 100,
      cacheTTL: 1000
    });

    // Inject mock client
    manager.client = mockClient;
  });

  afterEach(async () => {
    if (manager && manager.isRunning) {
      await manager.stop();
    }
  });

  describe('Initialization', () => {
    it('should create manager with default options', () => {
      const mgr = new DockerManager();
      assert.ok(mgr);
      assert.strictEqual(mgr.isRunning, false);
      assert.strictEqual(mgr.pollIntervalContainers, 2000);
      assert.strictEqual(mgr.pollIntervalStats, 1000);
    });

    it('should create manager with custom options', () => {
      const mgr = new DockerManager({
        pollIntervalContainers: 5000,
        pollIntervalStats: 2000,
        cacheTTL: 60000
      });

      assert.strictEqual(mgr.pollIntervalContainers, 5000);
      assert.strictEqual(mgr.pollIntervalStats, 2000);
      assert.strictEqual(mgr.cacheTTL, 60000);
    });
  });

  describe('Start/Stop', () => {
    it('should start manager successfully', async () => {
      await manager.start();

      assert.strictEqual(manager.isRunning, true);
      assert.ok(mockClient.ping.mock.calls.length > 0);
      assert.ok(mockClient.listContainers.mock.calls.length > 0);
    });

    it('should emit manager:started event', async () => {
      let eventEmitted = false;

      manager.on('manager:started', () => {
        eventEmitted = true;
      });

      await manager.start();
      assert.strictEqual(eventEmitted, true);
    });

    it('should throw error if Docker not available', async () => {
      mockClient.ping = mock.fn(async () => false);

      await assert.rejects(
        async () => await manager.start(),
        /Docker daemon not available/
      );
    });

    it('should stop manager successfully', async () => {
      await manager.start();
      await manager.stop();

      assert.strictEqual(manager.isRunning, false);
      assert.strictEqual(manager.pollTimers.containers, null);
      assert.strictEqual(manager.pollTimers.stats, null);
    });

    it('should emit manager:stopped event', async () => {
      let eventEmitted = false;

      manager.on('manager:stopped', () => {
        eventEmitted = true;
      });

      await manager.start();
      await manager.stop();

      assert.strictEqual(eventEmitted, true);
    });

    it('should warn if starting already running manager', async () => {
      await manager.start();
      await manager.start(); // Second start

      // Should still be running
      assert.strictEqual(manager.isRunning, true);
    });

    it('should warn if stopping non-running manager', async () => {
      await manager.stop(); // Stop without start

      assert.strictEqual(manager.isRunning, false);
    });
  });

  describe('Container Polling', () => {
    it('should poll containers periodically', async () => {
      await manager.start();

      const initialCalls = mockClient.listContainers.mock.calls.length;

      // Wait for at least one more poll
      await new Promise(resolve => setTimeout(resolve, 150));

      assert.ok(mockClient.listContainers.mock.calls.length > initialCalls);
    });

    it('should detect new containers', async () => {
      let discoveredContainer = null;

      manager.on('container:discovered', (container) => {
        discoveredContainer = container;
      });

      await manager.start();

      // Wait for polling
      await new Promise(resolve => setTimeout(resolve, 150));

      assert.ok(discoveredContainer);
      assert.strictEqual(discoveredContainer.id, 'container1');
      assert.strictEqual(discoveredContainer.name, 'test-container-1');
    });

    it('should detect container state changes', async () => {
      let stateChangeEvent = null;

      manager.on('container:stopped', (container) => {
        stateChangeEvent = container;
      });

      await manager.start();
      await new Promise(resolve => setTimeout(resolve, 150));

      // Change container state
      mockClient.listContainers = mock.fn(async () => [
        {
          id: 'container1',
          name: 'test-container-1',
          image: 'nginx:latest',
          state: 'exited',
          status: 'Exited (0) 1 second ago',
          created: Date.now() / 1000,
          ports: [],
          labels: {}
        }
      ]);

      await new Promise(resolve => setTimeout(resolve, 150));

      assert.ok(stateChangeEvent);
      assert.strictEqual(stateChangeEvent.state, 'exited');
    });

    it('should detect removed containers', async () => {
      let removedContainer = null;

      manager.on('container:removed', (container) => {
        removedContainer = container;
      });

      await manager.start();
      await new Promise(resolve => setTimeout(resolve, 150));

      // Remove container from list
      mockClient.listContainers = mock.fn(async () => []);

      await new Promise(resolve => setTimeout(resolve, 150));

      assert.ok(removedContainer);
      assert.strictEqual(removedContainer.id, 'container1');
    });
  });

  describe('Stats Collection', () => {
    it('should collect stats for running containers', async () => {
      let statsEvent = null;

      manager.on('container:stats', (data) => {
        statsEvent = data;
      });

      await manager.start();

      // Wait for stats polling
      await new Promise(resolve => setTimeout(resolve, 150));

      assert.ok(statsEvent);
      assert.strictEqual(statsEvent.id, 'container1');
      assert.ok(statsEvent.stats);
      assert.ok(statsEvent.stats.cpu);
      assert.ok(statsEvent.stats.memory);
    });

    it('should parse stats correctly', async () => {
      await manager.start();

      const rawStats = {
        cpu_stats: {
          cpu_usage: { total_usage: 1000000 },
          system_cpu_usage: 10000000,
          online_cpus: 4
        },
        precpu_stats: {
          cpu_usage: { total_usage: 900000 },
          system_cpu_usage: 9000000
        },
        memory_stats: {
          usage: 104857600,
          limit: 1073741824
        },
        networks: {
          eth0: { rx_bytes: 1024000, tx_bytes: 512000 }
        },
        blkio_stats: {
          io_service_bytes_recursive: [
            { op: 'Read', value: 2048000 },
            { op: 'Write', value: 1024000 }
          ]
        }
      };

      const parsed = manager._parseStats(rawStats);

      assert.ok(parsed.cpu);
      assert.ok(parsed.memory);
      assert.ok(parsed.network);
      assert.ok(parsed.blockIO);

      assert.strictEqual(typeof parsed.cpu.percent, 'string');
      assert.strictEqual(typeof parsed.memory.percent, 'string');
    });
  });

  describe('Container Operations', () => {
    beforeEach(async () => {
      await manager.start();
      await new Promise(resolve => setTimeout(resolve, 150)); // Wait for initial poll
    });

    it('should start container', async () => {
      await manager.startContainer('container1');

      assert.strictEqual(mockClient.startContainer.mock.calls.length, 1);
      assert.strictEqual(mockClient.startContainer.mock.calls[0].arguments[0], 'container1');
    });

    it('should stop container', async () => {
      await manager.stopContainer('container1');

      assert.strictEqual(mockClient.stopContainer.mock.calls.length, 1);
      assert.strictEqual(mockClient.stopContainer.mock.calls[0].arguments[0], 'container1');
    });

    it('should restart container', async () => {
      await manager.restartContainer('container1');

      assert.strictEqual(mockClient.restartContainer.mock.calls.length, 1);
      assert.strictEqual(mockClient.restartContainer.mock.calls[0].arguments[0], 'container1');
    });

    it('should remove container', async () => {
      await manager.removeContainer('container1', { force: true });

      assert.strictEqual(mockClient.removeContainer.mock.calls.length, 1);
      assert.strictEqual(mockClient.removeContainer.mock.calls[0].arguments[0], 'container1');
      assert.deepStrictEqual(mockClient.removeContainer.mock.calls[0].arguments[1], { force: true });
    });
  });

  describe('Caching', () => {
    beforeEach(async () => {
      await manager.start();
      await new Promise(resolve => setTimeout(resolve, 150));
    });

    it('should cache container details', async () => {
      const container = await manager.getContainer('container1');

      assert.ok(container);
      assert.strictEqual(mockClient.inspectContainer.mock.calls.length, 1);

      // Second call should use cache
      const cached = await manager.getContainer('container1');
      assert.strictEqual(mockClient.inspectContainer.mock.calls.length, 1); // Still 1
      assert.deepStrictEqual(cached, container);
    });

    it('should cache stats', async () => {
      // Wait for stats to be collected
      await new Promise(resolve => setTimeout(resolve, 150));

      const stats = manager.getStats('container1');
      assert.ok(stats);
      assert.ok(stats.cpu);
      assert.ok(stats.memory);
    });

    it('should cache system info', async () => {
      const info1 = await manager.getSystemInfo();
      const info2 = await manager.getSystemInfo();

      assert.strictEqual(mockClient.getInfo.mock.calls.length, 1); // Cached
      assert.deepStrictEqual(info1, info2);
    });
  });

  describe('Getters', () => {
    beforeEach(async () => {
      await manager.start();
      await new Promise(resolve => setTimeout(resolve, 150));
    });

    it('should get containers list', () => {
      const containers = manager.getContainers();

      assert.ok(Array.isArray(containers));
      assert.strictEqual(containers.length, 1);
      assert.strictEqual(containers[0].id, 'container1');
    });

    it('should get stats for container', async () => {
      await new Promise(resolve => setTimeout(resolve, 150)); // Wait for stats

      const stats = manager.getStats('container1');
      assert.ok(stats);
      assert.ok(stats.cpu);
    });

    it('should return null for non-existent stats', () => {
      const stats = manager.getStats('nonexistent');
      assert.strictEqual(stats, null);
    });
  });

  describe('Error Handling', () => {
    it('should handle polling errors gracefully', async () => {
      mockClient.listContainers = mock.fn(async () => {
        throw new Error('Connection failed');
      });

      let errorEmitted = false;
      manager.on('error', () => {
        errorEmitted = true;
      });

      await assert.rejects(async () => await manager.start());
    });

    it('should handle stats collection errors', async () => {
      mockClient.getContainerStats = mock.fn(async () => {
        throw new Error('Stats unavailable');
      });

      await manager.start();

      // Wait for stats polling - should not throw
      await new Promise(resolve => setTimeout(resolve, 200));

      // Manager should still be running
      assert.strictEqual(manager.isRunning, true);
    });
  });
});
