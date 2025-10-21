import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { CommandHandlers } from '../../src/architecture/command-handlers.js';
import { EventStore } from '../../src/architecture/event-store.js';
import fs from 'fs';
import path from 'path';

describe('Command Handlers - CQRS Architecture', () => {
  let commandHandlers;
  let eventStore;
  const testDbPath = path.join(process.cwd(), '.architecture', 'command-test.db');

  before(async () => {
    eventStore = new EventStore(testDbPath);
    commandHandlers = new CommandHandlers(eventStore);
  });

  after(async () => {
    await eventStore.cleanup();
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
      if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
    } catch (err) {
      // Ignore
    }
  });

  it('should handle CreateSession command', async () => {
    const sessionId = await commandHandlers.handleCreateSession({
      pid: process.pid,
      cwd: process.cwd(),
      userId: 'test-user',
    });

    assert.ok(sessionId, 'Session ID should be returned');

    const events = await eventStore.getEventStream('Session', sessionId);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].eventType, 'SessionCreated');
    assert.strictEqual(events[0].data.pid, process.pid);
  });

  it('should reject CreateSession without required fields', async () => {
    await assert.rejects(async () => {
      await commandHandlers.handleCreateSession({
        cwd: process.cwd(),
        // Missing pid
      });
    }, /PID is required/);
  });

  it('should handle UpdateSession command', async () => {
    const sessionId = await commandHandlers.handleCreateSession({
      pid: 123,
      cwd: '/test',
    });

    await commandHandlers.handleUpdateSession({
      sessionId,
      currentTask: 'testing update',
    });

    const events = await eventStore.getEventStream('Session', sessionId);
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[1].eventType, 'SessionUpdated');
    assert.strictEqual(events[1].data.currentTask, 'testing update');
  });

  it('should reject UpdateSession for non-existent session', async () => {
    await assert.rejects(async () => {
      await commandHandlers.handleUpdateSession({
        sessionId: 'non-existent-session',
        currentTask: 'test',
      });
    }, /not found/);
  });

  it('should handle AcquireLock command', async () => {
    const sessionId = await commandHandlers.handleCreateSession({
      pid: 456,
      cwd: '/test',
    });

    const lockId = await commandHandlers.handleAcquireLock({
      sessionId,
      resourcePath: '/test/resource',
      lockType: 'write',
    });

    assert.ok(lockId, 'Lock ID should be returned');

    const events = await eventStore.getEventStream('Lock', lockId);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].eventType, 'LockAcquired');
    assert.strictEqual(events[0].data.resourcePath, '/test/resource');
    assert.strictEqual(events[0].data.lockType, 'write');
  });

  it('should reject AcquireLock without required fields', async () => {
    await assert.rejects(async () => {
      await commandHandlers.handleAcquireLock({
        sessionId: 'test-session',
        // Missing resourcePath
      });
    }, /resource path are required/);
  });

  it('should handle ReleaseLock command', async () => {
    const sessionId = await commandHandlers.handleCreateSession({
      pid: 789,
      cwd: '/test',
    });

    const lockId = await commandHandlers.handleAcquireLock({
      sessionId,
      resourcePath: '/test/resource2',
      lockType: 'read',
    });

    await commandHandlers.handleReleaseLock({
      lockId,
    });

    const events = await eventStore.getEventStream('Lock', lockId);
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].eventType, 'LockAcquired');
    assert.strictEqual(events[1].eventType, 'LockReleased');
  });

  it('should reject ReleaseLock for non-existent lock', async () => {
    await assert.rejects(async () => {
      await commandHandlers.handleReleaseLock({
        lockId: 'non-existent-lock',
      });
    }, /not found/);
  });

  it('should handle TerminateSession command', async () => {
    const sessionId = await commandHandlers.handleCreateSession({
      pid: 999,
      cwd: '/test',
    });

    await commandHandlers.handleTerminateSession({
      sessionId,
      reason: 'test termination',
    });

    const events = await eventStore.getEventStream('Session', sessionId);
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[1].eventType, 'SessionTerminated');
    assert.strictEqual(events[1].data.reason, 'test termination');
  });

  it('should preserve correlation ID across events', async () => {
    const correlationId = 'test-correlation-' + Date.now();

    const sessionId = await commandHandlers.handleCreateSession({
      pid: 111,
      cwd: '/test',
      correlationId,
    });

    await commandHandlers.handleUpdateSession({
      sessionId,
      currentTask: 'correlated task',
      correlationId,
    });

    const events = await eventStore.getEventsByCorrelation(correlationId);
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].correlationId, correlationId);
    assert.strictEqual(events[1].correlationId, correlationId);
  });

  it('should handle high-throughput command processing', async () => {
    const sessionId = await commandHandlers.handleCreateSession({
      pid: 222,
      cwd: '/test',
    });

    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(
        commandHandlers.handleUpdateSession({
          sessionId,
          currentTask: `task-${i}`,
        })
      );
    }

    await Promise.all(promises);

    const events = await eventStore.getEventStream('Session', sessionId);
    assert.ok(events.length >= 51); // 1 create + 50 updates
  });

  it('should validate business rules in commands', async () => {
    // Test missing sessionId
    await assert.rejects(async () => {
      await commandHandlers.handleUpdateSession({
        currentTask: 'test',
      });
    }, /Session ID is required/);

    // Test missing lockId
    await assert.rejects(async () => {
      await commandHandlers.handleReleaseLock({});
    }, /Lock ID is required/);
  });

  it('should default lock type to write if not specified', async () => {
    const sessionId = await commandHandlers.handleCreateSession({
      pid: 333,
      cwd: '/test',
    });

    const lockId = await commandHandlers.handleAcquireLock({
      sessionId,
      resourcePath: '/test/default-lock',
    });

    const events = await eventStore.getEventStream('Lock', lockId);
    assert.strictEqual(events[0].data.lockType, 'write');
  });
});
