import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SessionManagerCQRS } from '../../src/architecture/session-manager-cqrs.js';
import fs from 'fs';
import path from 'path';

describe('Session Manager CQRS - End-to-End', () => {
  let sessionManager;

  after(async () => {
    if (sessionManager) {
      await sessionManager.cleanup();
    }

    // Cleanup test databases
    const archDir = path.join(process.cwd(), '.architecture');
    try {
      if (fs.existsSync(archDir)) {
        const files = fs.readdirSync(archDir);
        files.forEach((file) => {
          if (file.startsWith('event-store') || file.startsWith('read-models')) {
            const filePath = path.join(archDir, file);
            try {
              fs.unlinkSync(filePath);
            } catch (err) {
              // Ignore
            }
          }
        });
      }
    } catch (err) {
      // Ignore
    }
  });

  it('should register a session (Command → Event → Projection → Query)', async () => {
    sessionManager = new SessionManagerCQRS();
    const sessionId = await sessionManager.register();

    assert.ok(sessionId, 'Session ID should be returned');

    // Query the session
    const sessionInfo = await sessionManager.getSessionInfo();
    assert.ok(sessionInfo);
    assert.strictEqual(sessionInfo.session_id, sessionId);
    assert.strictEqual(sessionInfo.pid, process.pid);
  });

  it('should update session task', async () => {
    sessionManager = new SessionManagerCQRS();
    await sessionManager.register();

    await sessionManager.updateTask('test task');

    const sessionInfo = await sessionManager.getSessionInfo();
    assert.strictEqual(sessionInfo.current_task, 'test task');
  });

  it('should list active sessions', async () => {
    sessionManager = new SessionManagerCQRS();
    await sessionManager.register();

    const sessions = await sessionManager.listActiveSessions();
    assert.ok(sessions.length > 0);
    assert.ok(sessions.find((s) => s.isCurrentSession));
  });

  it('should acquire and release locks', async () => {
    sessionManager = new SessionManagerCQRS();
    await sessionManager.register();

    const lockId = await sessionManager.acquireLock('/test/resource', 'write');
    assert.ok(lockId);

    // Verify lock exists
    const lockInfo = await sessionManager.getLockInfo('/test/resource');
    assert.ok(lockInfo);
    assert.strictEqual(lockInfo.resource_path, '/test/resource');

    // Release lock
    await sessionManager.releaseLock(lockId);

    // Verify lock is released
    const releasedLock = await sessionManager.getLockInfo('/test/resource');
    assert.strictEqual(releasedLock, null);
  });

  it('should get session with locks', async () => {
    sessionManager = new SessionManagerCQRS();
    await sessionManager.register();

    await sessionManager.acquireLock('/resource1', 'write');
    await sessionManager.acquireLock('/resource2', 'read');

    const sessionInfo = await sessionManager.getSessionInfo();
    assert.ok(sessionInfo.locks);
    assert.strictEqual(sessionInfo.locks.length, 2);
  });

  it('should reject lock acquisition without active session', async () => {
    sessionManager = new SessionManagerCQRS();
    // Don't register session

    await assert.rejects(async () => {
      await sessionManager.acquireLock('/test', 'write');
    }, /No active session/);
  });

  it('should provide event store statistics', async () => {
    sessionManager = new SessionManagerCQRS();
    await sessionManager.register();
    await sessionManager.updateTask('stats test');

    const stats = await sessionManager.getEventStoreStats();
    assert.ok(stats.totalEvents > 0);
    assert.ok(stats.aggregateCounts);
  });

  it('should support heartbeat mechanism', async () => {
    sessionManager = new SessionManagerCQRS();
    await sessionManager.register();

    const initialInfo = await sessionManager.getSessionInfo();
    const initialHeartbeat = initialInfo.last_heartbeat;

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Manual heartbeat
    await sessionManager.heartbeat();

    const updatedInfo = await sessionManager.getSessionInfo();
    assert.ok(updatedInfo.last_heartbeat >= initialHeartbeat);
  });

  it('should cleanup session and release locks on cleanup', async () => {
    sessionManager = new SessionManagerCQRS();
    const sessionId = await sessionManager.register();

    await sessionManager.acquireLock('/cleanup-resource', 'write');

    // Verify lock exists
    const lockBefore = await sessionManager.getLockInfo('/cleanup-resource');
    assert.ok(lockBefore);

    // Cleanup
    await sessionManager.cleanup();

    // Create new session manager to query
    const queryManager = new SessionManagerCQRS();
    await queryManager.register();

    // Lock should be released
    const lockAfter = await queryManager.getLockInfo('/cleanup-resource');
    assert.strictEqual(lockAfter, null);

    await queryManager.cleanup();
  });

  it('should maintain consistency across commands and queries', async () => {
    sessionManager = new SessionManagerCQRS();
    await sessionManager.register();

    // Perform multiple operations
    await sessionManager.updateTask('task1');
    const lock1 = await sessionManager.acquireLock('/res1', 'write');
    await sessionManager.updateTask('task2');
    const lock2 = await sessionManager.acquireLock('/res2', 'read');

    // Query session
    const sessionInfo = await sessionManager.getSessionInfo();
    assert.strictEqual(sessionInfo.current_task, 'task2');
    assert.strictEqual(sessionInfo.locks.length, 2);

    // Release one lock
    await sessionManager.releaseLock(lock1);

    // Verify only one lock remains
    const updatedInfo = await sessionManager.getSessionInfo();
    assert.strictEqual(updatedInfo.locks.length, 1);
  });

  it('should support projection rebuild', async () => {
    sessionManager = new SessionManagerCQRS();
    await sessionManager.register();
    await sessionManager.updateTask('rebuild test');

    // Rebuild projections
    await sessionManager.rebuildProjections();

    // Verify session still exists and is correct
    const sessionInfo = await sessionManager.getSessionInfo();
    assert.ok(sessionInfo);
    assert.strictEqual(sessionInfo.current_task, 'rebuild test');
  });

  it('should handle high concurrency', async () => {
    sessionManager = new SessionManagerCQRS();
    await sessionManager.register();

    const promises = [];

    // Concurrent updates
    for (let i = 0; i < 20; i++) {
      promises.push(sessionManager.updateTask(`concurrent-${i}`));
    }

    await Promise.all(promises);

    const sessionInfo = await sessionManager.getSessionInfo();
    assert.ok(sessionInfo.current_task.startsWith('concurrent-'));
  });

  it('should provide current session ID', async () => {
    sessionManager = new SessionManagerCQRS();
    const sessionId = await sessionManager.register();

    assert.strictEqual(sessionManager.getCurrentSessionId(), sessionId);
  });
});
