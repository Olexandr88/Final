import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { QueryHandlers } from '../../src/architecture/query-handlers.js';
import { DatabasePool } from '../../src/utils/database-pool.js';
import fs from 'fs';
import path from 'path';

describe('Query Handlers - CQRS Architecture', () => {
  let queryHandlers;
  const testDbPath = path.join(process.cwd(), '.architecture', 'query-test.db');

  before(async () => {
    queryHandlers = new QueryHandlers(testDbPath);

    // Insert test data directly into read models
    const conn = queryHandlers.pool.db;

    conn
      .prepare(
        `
      INSERT INTO session_view (session_id, pid, start_time, last_heartbeat, status, current_task, cwd, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run('session-1', 100, Date.now() - 5000, Date.now(), 'active', 'task1', '/path1', 1);

    conn
      .prepare(
        `
      INSERT INTO session_view (session_id, pid, start_time, last_heartbeat, status, current_task, cwd, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        'session-2',
        200,
        Date.now() - 10000,
        Date.now() - 40000,
        'active',
        'task2',
        '/path2',
        2
      );

    conn
      .prepare(
        `
      INSERT INTO session_view (session_id, pid, start_time, last_heartbeat, status, current_task, cwd, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run('session-3', 300, Date.now() - 15000, Date.now(), 'inactive', 'task3', '/path3', 3);

    conn
      .prepare(
        `
      INSERT INTO lock_view (lock_id, resource_path, session_id, lock_type, acquired_at, status, version)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run('lock-1', '/resource1', 'session-1', 'write', Date.now() - 1000, 'active', 1);

    conn
      .prepare(
        `
      INSERT INTO lock_view (lock_id, resource_path, session_id, lock_type, acquired_at, status, version)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run('lock-2', '/resource2', 'session-1', 'read', Date.now() - 2000, 'active', 1);

    conn
      .prepare(
        `
      INSERT INTO lock_view (lock_id, resource_path, session_id, lock_type, acquired_at, released_at, status, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        'lock-3',
        '/resource3',
        'session-2',
        'write',
        Date.now() - 5000,
        Date.now() - 1000,
        'released',
        2
      );
  });

  after(async () => {
    await queryHandlers.cleanup();
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
      if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
    } catch (err) {
      // Ignore
    }
  });

  it('should query session by ID', async () => {
    const session = await queryHandlers.getSession('session-1');

    assert.ok(session);
    assert.strictEqual(session.session_id, 'session-1');
    assert.strictEqual(session.pid, 100);
    assert.strictEqual(session.status, 'active');
    assert.strictEqual(session.current_task, 'task1');
  });

  it('should return null for non-existent session', async () => {
    const session = await queryHandlers.getSession('non-existent');
    assert.strictEqual(session, null);
  });

  it('should list all active sessions', async () => {
    const sessions = await queryHandlers.listActiveSessions();

    assert.strictEqual(sessions.length, 2);
    assert.ok(sessions.every((s) => s.status === 'active'));
    assert.ok(sessions.find((s) => s.session_id === 'session-1'));
    assert.ok(sessions.find((s) => s.session_id === 'session-2'));
  });

  it('should query lock information by resource path', async () => {
    const lock = await queryHandlers.getLockInfo('/resource1');

    assert.ok(lock);
    assert.strictEqual(lock.lock_id, 'lock-1');
    assert.strictEqual(lock.resource_path, '/resource1');
    assert.strictEqual(lock.session_id, 'session-1');
    assert.strictEqual(lock.lock_type, 'write');
    assert.strictEqual(lock.status, 'active');
  });

  it('should return null for unlocked resource', async () => {
    const lock = await queryHandlers.getLockInfo('/non-existent-resource');
    assert.strictEqual(lock, null);
  });

  it('should return null for released lock', async () => {
    const lock = await queryHandlers.getLockInfo('/resource3');
    assert.strictEqual(lock, null); // Status is 'released', not 'active'
  });

  it('should list all locks for a session', async () => {
    const locks = await queryHandlers.getSessionLocks('session-1');

    assert.strictEqual(locks.length, 2);
    assert.ok(locks.every((l) => l.session_id === 'session-1'));
    assert.ok(locks.every((l) => l.status === 'active'));
    assert.ok(locks.find((l) => l.resource_path === '/resource1'));
    assert.ok(locks.find((l) => l.resource_path === '/resource2'));
  });

  it('should return empty array for session with no active locks', async () => {
    const locks = await queryHandlers.getSessionLocks('session-3');
    assert.strictEqual(locks.length, 0);
  });

  it('should detect stale sessions', async () => {
    const staleSessions = await queryHandlers.getStaleSessions(30000); // 30 seconds

    assert.ok(staleSessions.length > 0);
    assert.ok(staleSessions.find((s) => s.session_id === 'session-2'));
  });

  it('should not include fresh sessions in stale query', async () => {
    const staleSessions = await queryHandlers.getStaleSessions(30000);

    const freshSession = staleSessions.find((s) => s.session_id === 'session-1');
    assert.strictEqual(freshSession, undefined);
  });

  it('should handle concurrent queries efficiently', async () => {
    const promises = [];

    for (let i = 0; i < 20; i++) {
      promises.push(queryHandlers.getSession('session-1'));
      promises.push(queryHandlers.listActiveSessions());
      promises.push(queryHandlers.getLockInfo('/resource1'));
    }

    const results = await Promise.all(promises);
    assert.strictEqual(results.length, 60);
  });

  it('should order active sessions by start time descending', async () => {
    const sessions = await queryHandlers.listActiveSessions();

    for (let i = 0; i < sessions.length - 1; i++) {
      assert.ok(sessions[i].start_time >= sessions[i + 1].start_time);
    }
  });

  it('should order session locks by acquired time descending', async () => {
    const locks = await queryHandlers.getSessionLocks('session-1');

    for (let i = 0; i < locks.length - 1; i++) {
      assert.ok(locks[i].acquired_at >= locks[i + 1].acquired_at);
    }
  });

  it('should provide fast read access', async () => {
    const start = Date.now();

    for (let i = 0; i < 100; i++) {
      await queryHandlers.getSession('session-1');
    }

    const duration = Date.now() - start;
    const avgTime = duration / 100;

    // Should average < 5ms per query
    assert.ok(avgTime < 5, `Average query time ${avgTime}ms should be < 5ms`);
  });
});
