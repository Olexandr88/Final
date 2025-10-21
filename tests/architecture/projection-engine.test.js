import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ProjectionEngine } from '../../src/architecture/projection-engine.js';
import { EventStore } from '../../src/architecture/event-store.js';
import { QueryHandlers } from '../../src/architecture/query-handlers.js';
import fs from 'fs';
import path from 'path';

describe('Projection Engine - CQRS Architecture', () => {
  let projectionEngine;
  let eventStore;
  let queryHandlers;
  const eventDbPath = path.join(process.cwd(), '.architecture', 'proj-event-test.db');
  const queryDbPath = path.join(process.cwd(), '.architecture', 'proj-query-test.db');

  before(async () => {
    eventStore = new EventStore(eventDbPath);
    queryHandlers = new QueryHandlers(queryDbPath);
    projectionEngine = new ProjectionEngine(eventStore, queryHandlers);
  });

  after(async () => {
    await eventStore.cleanup();
    await queryHandlers.cleanup();

    try {
      [eventDbPath, queryDbPath].forEach((dbPath) => {
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
        if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
      });
    } catch (err) {
      // Ignore
    }
  });

  it('should project SessionCreated event to read model', async () => {
    const event = await eventStore.appendEvent({
      aggregateType: 'Session',
      aggregateId: 'proj-session-1',
      eventType: 'SessionCreated',
      data: {
        pid: 100,
        cwd: '/test/path',
        startTime: Date.now(),
        status: 'active',
      },
    });

    await projectionEngine.projectEvent(event);

    const session = await queryHandlers.getSession('proj-session-1');
    assert.ok(session);
    assert.strictEqual(session.session_id, 'proj-session-1');
    assert.strictEqual(session.pid, 100);
    assert.strictEqual(session.status, 'active');
  });

  it('should project SessionUpdated event to read model', async () => {
    const createEvent = await eventStore.appendEvent({
      aggregateType: 'Session',
      aggregateId: 'proj-session-2',
      eventType: 'SessionCreated',
      data: {
        pid: 200,
        cwd: '/test',
        startTime: Date.now(),
        status: 'active',
      },
    });

    await projectionEngine.projectEvent(createEvent);

    const updateEvent = await eventStore.appendEvent({
      aggregateType: 'Session',
      aggregateId: 'proj-session-2',
      eventType: 'SessionUpdated',
      data: {
        currentTask: 'projection test',
        lastHeartbeat: Date.now(),
      },
    });

    await projectionEngine.projectEvent(updateEvent);

    const session = await queryHandlers.getSession('proj-session-2');
    assert.strictEqual(session.current_task, 'projection test');
    assert.strictEqual(session.version, 2);
  });

  it('should project SessionTerminated event to read model', async () => {
    const createEvent = await eventStore.appendEvent({
      aggregateType: 'Session',
      aggregateId: 'proj-session-3',
      eventType: 'SessionCreated',
      data: {
        pid: 300,
        cwd: '/test',
        startTime: Date.now(),
        status: 'active',
      },
    });

    await projectionEngine.projectEvent(createEvent);

    const terminateEvent = await eventStore.appendEvent({
      aggregateType: 'Session',
      aggregateId: 'proj-session-3',
      eventType: 'SessionTerminated',
      data: {
        reason: 'test',
        terminatedAt: Date.now(),
      },
    });

    await projectionEngine.projectEvent(terminateEvent);

    const session = await queryHandlers.getSession('proj-session-3');
    assert.strictEqual(session.status, 'terminated');
  });

  it('should project LockAcquired event to read model', async () => {
    const event = await eventStore.appendEvent({
      aggregateType: 'Lock',
      aggregateId: 'proj-lock-1',
      eventType: 'LockAcquired',
      data: {
        sessionId: 'proj-session-1',
        resourcePath: '/test/resource',
        lockType: 'write',
        acquiredAt: Date.now(),
      },
    });

    await projectionEngine.projectEvent(event);

    const lock = await queryHandlers.getLockInfo('/test/resource');
    assert.ok(lock);
    assert.strictEqual(lock.lock_id, 'proj-lock-1');
    assert.strictEqual(lock.resource_path, '/test/resource');
    assert.strictEqual(lock.status, 'active');
  });

  it('should project LockReleased event to read model', async () => {
    const acquireEvent = await eventStore.appendEvent({
      aggregateType: 'Lock',
      aggregateId: 'proj-lock-2',
      eventType: 'LockAcquired',
      data: {
        sessionId: 'proj-session-1',
        resourcePath: '/test/resource2',
        lockType: 'read',
        acquiredAt: Date.now(),
      },
    });

    await projectionEngine.projectEvent(acquireEvent);

    const releaseEvent = await eventStore.appendEvent({
      aggregateType: 'Lock',
      aggregateId: 'proj-lock-2',
      eventType: 'LockReleased',
      data: {
        releasedAt: Date.now(),
      },
    });

    await projectionEngine.projectEvent(releaseEvent);

    // Released locks should not be returned by getLockInfo
    const lock = await queryHandlers.getLockInfo('/test/resource2');
    assert.strictEqual(lock, null);
  });

  it('should rebuild all projections from event store', async () => {
    // Create multiple events
    await eventStore.appendEvent({
      aggregateType: 'Session',
      aggregateId: 'rebuild-session-1',
      eventType: 'SessionCreated',
      data: { pid: 111, cwd: '/test', startTime: Date.now(), status: 'active' },
    });

    await eventStore.appendEvent({
      aggregateType: 'Session',
      aggregateId: 'rebuild-session-2',
      eventType: 'SessionCreated',
      data: { pid: 222, cwd: '/test', startTime: Date.now(), status: 'active' },
    });

    await eventStore.appendEvent({
      aggregateType: 'Lock',
      aggregateId: 'rebuild-lock-1',
      eventType: 'LockAcquired',
      data: {
        sessionId: 'rebuild-session-1',
        resourcePath: '/rebuild',
        lockType: 'write',
        acquiredAt: Date.now(),
      },
    });

    // Rebuild projections
    await projectionEngine.rebuildProjections();

    // Verify sessions exist
    const session1 = await queryHandlers.getSession('rebuild-session-1');
    const session2 = await queryHandlers.getSession('rebuild-session-2');
    assert.ok(session1);
    assert.ok(session2);

    // Verify lock exists
    const lock = await queryHandlers.getLockInfo('/rebuild');
    assert.ok(lock);
  });

  it('should handle projection errors gracefully', async () => {
    // Create event with malformed data
    const event = {
      eventType: 'SessionCreated',
      aggregateType: 'Session',
      aggregateId: 'error-session',
      data: null, // This will cause an error
      version: 1,
      timestamp: Date.now(),
    };

    // Should not throw, just log error
    await projectionEngine.projectEvent(event);

    // Session should not exist
    const session = await queryHandlers.getSession('error-session');
    assert.strictEqual(session, null);
  });

  it('should project multiple events in order', async () => {
    const sessionId = 'multi-event-session';

    for (let i = 1; i <= 5; i++) {
      const event = await eventStore.appendEvent({
        aggregateType: 'Session',
        aggregateId: sessionId,
        eventType: i === 1 ? 'SessionCreated' : 'SessionUpdated',
        data:
          i === 1
            ? { pid: 999, cwd: '/test', startTime: Date.now(), status: 'active' }
            : { currentTask: `task-${i}`, lastHeartbeat: Date.now() },
      });

      await projectionEngine.projectEvent(event);
    }

    const session = await queryHandlers.getSession(sessionId);
    assert.strictEqual(session.current_task, 'task-5');
    assert.strictEqual(session.version, 5);
  });

  it('should support partial rebuilds from timestamp', async () => {
    const timestamp = Date.now();

    // Create event before timestamp
    await eventStore.appendEvent({
      aggregateType: 'Session',
      aggregateId: 'partial-session-1',
      eventType: 'SessionCreated',
      data: { pid: 111, cwd: '/test', startTime: Date.now(), status: 'active' },
    });

    // Wait to ensure different timestamp
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Create events after timestamp
    await eventStore.appendEvent({
      aggregateType: 'Session',
      aggregateId: 'partial-session-2',
      eventType: 'SessionCreated',
      data: { pid: 222, cwd: '/test', startTime: Date.now(), status: 'active' },
    });

    // Rebuild from timestamp
    await projectionEngine.rebuildProjections(timestamp);

    // First session should exist (from before timestamp, but rebuild clears all)
    // Second session should exist
    const session2 = await queryHandlers.getSession('partial-session-2');
    assert.ok(session2);
  });

  it('should maintain version consistency', async () => {
    const sessionId = 'version-session';

    for (let i = 1; i <= 10; i++) {
      const event = await eventStore.appendEvent({
        aggregateType: 'Session',
        aggregateId: sessionId,
        eventType: i === 1 ? 'SessionCreated' : 'SessionUpdated',
        data:
          i === 1
            ? { pid: 777, cwd: '/test', startTime: Date.now(), status: 'active' }
            : { currentTask: `ver-${i}`, lastHeartbeat: Date.now() },
      });

      await projectionEngine.projectEvent(event);

      const session = await queryHandlers.getSession(sessionId);
      assert.strictEqual(session.version, i);
    }
  });
});
