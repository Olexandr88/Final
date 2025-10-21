import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventStore } from '../../src/architecture/event-store.js';
import fs from 'fs';
import path from 'path';

describe('Event Store - CQRS Architecture', () => {
  let eventStore;
  const testDbPath = path.join(process.cwd(), '.architecture', 'event-store-test.db');

  before(async () => {
    eventStore = new EventStore(testDbPath);
  });

  after(async () => {
    await eventStore.cleanup();
    // Cleanup test database
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
      if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  it('should append event to store', async () => {
    const event = {
      aggregateType: 'Session',
      aggregateId: 'test-session-1',
      eventType: 'SessionCreated',
      data: {
        pid: process.pid,
        cwd: process.cwd(),
        startTime: Date.now()
      },
      metadata: {
        commandType: 'CreateSession',
        userId: 'test-user'
      }
    };

    const stored = await eventStore.appendEvent(event);

    assert.ok(stored.eventId, 'Event should have an ID');
    assert.strictEqual(stored.aggregateType, 'Session');
    assert.strictEqual(stored.version, 1);
    assert.ok(stored.timestamp, 'Event should have timestamp');
  });

  it('should increment version for same aggregate', async () => {
    const aggregateId = 'test-session-2';

    const event1 = await eventStore.appendEvent({
      aggregateType: 'Session',
      aggregateId,
      eventType: 'SessionCreated',
      data: { pid: 123 }
    });

    const event2 = await eventStore.appendEvent({
      aggregateType: 'Session',
      aggregateId,
      eventType: 'SessionUpdated',
      data: { currentTask: 'testing' }
    });

    assert.strictEqual(event1.version, 1);
    assert.strictEqual(event2.version, 2);
  });

  it('should retrieve event stream for aggregate', async () => {
    const aggregateId = 'test-session-3';

    await eventStore.appendEvent({
      aggregateType: 'Session',
      aggregateId,
      eventType: 'SessionCreated',
      data: { pid: 456 }
    });

    await eventStore.appendEvent({
      aggregateType: 'Session',
      aggregateId,
      eventType: 'SessionUpdated',
      data: { currentTask: 'task1' }
    });

    await eventStore.appendEvent({
      aggregateType: 'Session',
      aggregateId,
      eventType: 'SessionUpdated',
      data: { currentTask: 'task2' }
    });

    const stream = await eventStore.getEventStream('Session', aggregateId);

    assert.strictEqual(stream.length, 3);
    assert.strictEqual(stream[0].eventType, 'SessionCreated');
    assert.strictEqual(stream[1].eventType, 'SessionUpdated');
    assert.strictEqual(stream[2].version, 3);
  });

  it('should retrieve events from specific version', async () => {
    const aggregateId = 'test-session-4';

    for (let i = 1; i <= 5; i++) {
      await eventStore.appendEvent({
        aggregateType: 'Session',
        aggregateId,
        eventType: 'SessionUpdated',
        data: { counter: i }
      });
    }

    const stream = await eventStore.getEventStream('Session', aggregateId, 3);

    assert.strictEqual(stream.length, 2);
    assert.strictEqual(stream[0].data.counter, 4);
    assert.strictEqual(stream[1].data.counter, 5);
  });

  it('should retrieve events by type', async () => {
    await eventStore.appendEvent({
      aggregateType: 'Session',
      aggregateId: 'session-5',
      eventType: 'SessionCreated',
      data: { pid: 789 }
    });

    await eventStore.appendEvent({
      aggregateType: 'Lock',
      aggregateId: 'lock-1',
      eventType: 'LockAcquired',
      data: { resourcePath: '/test/resource' }
    });

    const sessionEvents = await eventStore.getEventsByType('SessionCreated');
    const lockEvents = await eventStore.getEventsByType('LockAcquired');

    assert.ok(sessionEvents.length > 0);
    assert.ok(lockEvents.length > 0);
    assert.strictEqual(sessionEvents[0].eventType, 'SessionCreated');
    assert.strictEqual(lockEvents[0].eventType, 'LockAcquired');
  });

  it('should retrieve events by correlation ID', async () => {
    const correlationId = 'test-correlation-' + Date.now();

    await eventStore.appendEvent({
      aggregateType: 'Session',
      aggregateId: 'session-6',
      eventType: 'SessionCreated',
      data: { pid: 999 },
      correlationId
    });

    await eventStore.appendEvent({
      aggregateType: 'Lock',
      aggregateId: 'lock-2',
      eventType: 'LockAcquired',
      data: { resourcePath: '/test' },
      correlationId
    });

    const correlated = await eventStore.getEventsByCorrelation(correlationId);

    assert.strictEqual(correlated.length, 2);
    assert.strictEqual(correlated[0].aggregateType, 'Session');
    assert.strictEqual(correlated[1].aggregateType, 'Lock');
  });

  it('should save and load snapshots', async () => {
    const aggregateId = 'session-snapshot-1';

    const state = {
      pid: 111,
      cwd: '/test/path',
      startTime: Date.now(),
      currentTask: 'snapshot test'
    };

    await eventStore.saveSnapshot('Session', aggregateId, 10, state);

    const snapshot = await eventStore.loadSnapshot('Session', aggregateId);

    assert.ok(snapshot, 'Snapshot should exist');
    assert.strictEqual(snapshot.version, 10);
    assert.deepStrictEqual(snapshot.state, state);
    assert.ok(snapshot.timestamp);
  });

  it('should return null for non-existent snapshot', async () => {
    const snapshot = await eventStore.loadSnapshot('Session', 'non-existent-id');
    assert.strictEqual(snapshot, null);
  });

  it('should provide accurate statistics', async () => {
    const stats = await eventStore.getStats();

    assert.ok(stats.totalEvents > 0);
    assert.ok(stats.totalSnapshots >= 0);
    assert.ok(typeof stats.aggregateCounts === 'object');
    assert.ok(stats.poolStats);
  });

  it('should replay events with handler', async () => {
    const aggregateId = 'replay-session';
    const startTime = Date.now();

    await eventStore.appendEvent({
      aggregateType: 'Session',
      aggregateId,
      eventType: 'SessionCreated',
      data: { pid: 222 }
    });

    await eventStore.appendEvent({
      aggregateType: 'Session',
      aggregateId,
      eventType: 'SessionUpdated',
      data: { currentTask: 'replay test' }
    });

    const replayed = [];
    await eventStore.replayEvents(async (event) => {
      if (event.timestamp >= startTime) {
        replayed.push(event);
      }
    }, startTime);

    assert.ok(replayed.length >= 2);
    assert.strictEqual(replayed[0].eventType, 'SessionCreated');
  });

  it('should handle concurrent event appends', async () => {
    const aggregateId = 'concurrent-session';
    const promises = [];

    for (let i = 0; i < 10; i++) {
      promises.push(
        eventStore.appendEvent({
          aggregateType: 'Session',
          aggregateId,
          eventType: 'SessionUpdated',
          data: { counter: i }
        })
      );
    }

    const results = await Promise.all(promises);
    const versions = results.map(r => r.version).sort((a, b) => a - b);

    // Should have sequential versions
    assert.strictEqual(versions[0], 1);
    assert.strictEqual(versions[9], 10);
  });

  it('should preserve event immutability', async () => {
    const event = await eventStore.appendEvent({
      aggregateType: 'Session',
      aggregateId: 'immutable-test',
      eventType: 'SessionCreated',
      data: { pid: 333 }
    });

    const stream = await eventStore.getEventStream('Session', 'immutable-test');
    const retrieved = stream[0];

    // Verify all fields match
    assert.strictEqual(retrieved.eventId, event.eventId);
    assert.strictEqual(retrieved.aggregateType, event.aggregateType);
    assert.strictEqual(retrieved.aggregateId, event.aggregateId);
    assert.strictEqual(retrieved.eventType, event.eventType);
    assert.deepStrictEqual(retrieved.data, event.data);
  });
});
