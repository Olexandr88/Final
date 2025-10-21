import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import RWLockManager from '../src/utils/rw-lock-manager.js';
import SessionManager from '../src/session-manager.js';
import fs from 'fs';
import path from 'path';

describe('RWLockManager', () => {
  let sessionManager;
  let rwLockManager;
  let testResource;

  before(async () => {
    // Initialize session manager
    sessionManager = new SessionManager();
    sessionManager.register();

    // Initialize RW lock manager
    rwLockManager = new RWLockManager(sessionManager);

    // Create test resource path
    testResource = path.resolve('./test-resource.txt');
  });

  after(async () => {
    // Cleanup
    await rwLockManager.releaseAllLocks();
    if (sessionManager) {
      await sessionManager.cleanup();
    }

    // Remove test resource if exists
    if (fs.existsSync(testResource)) {
      fs.unlinkSync(testResource);
    }
  });

  it('should acquire and release read lock', async () => {
    const lock = await rwLockManager.acquireRead(testResource);

    assert.ok(lock, 'Lock should be acquired');
    assert.strictEqual(lock.lockType, 'read', 'Lock type should be read');
    assert.strictEqual(lock.resourcePath, testResource, 'Resource path should match');

    await rwLockManager.releaseRead(testResource);

    const lockInfo = rwLockManager.getLockInfo(testResource);
    assert.strictEqual(lockInfo, null, 'Lock should be released');
  });

  it('should acquire and release write lock', async () => {
    const lock = await rwLockManager.acquireWrite(testResource);

    assert.ok(lock, 'Lock should be acquired');
    assert.strictEqual(lock.lockType, 'write', 'Lock type should be write');

    await rwLockManager.releaseWrite(testResource);

    const lockInfo = rwLockManager.getLockInfo(testResource);
    assert.strictEqual(lockInfo, null, 'Lock should be released');
  });

  it('should allow multiple concurrent readers', async () => {
    // Simulate multiple readers by acquiring read locks
    const lock1 = await rwLockManager.acquireRead(testResource);
    const lock2 = await rwLockManager.acquireRead(testResource);

    const lockInfo = rwLockManager.getLockInfo(testResource);
    assert.ok(lockInfo, 'Lock info should exist');
    assert.strictEqual(lockInfo.readerCount, 2, 'Should have 2 readers');

    await rwLockManager.releaseRead(testResource);
    await rwLockManager.releaseRead(testResource);
  });

  it('should execute function with read lock', async () => {
    let executed = false;

    const result = await rwLockManager.withReadLock(testResource, async () => {
      executed = true;
      return 'success';
    });

    assert.strictEqual(executed, true, 'Function should be executed');
    assert.strictEqual(result, 'success', 'Should return function result');

    const lockInfo = rwLockManager.getLockInfo(testResource);
    assert.strictEqual(lockInfo, null, 'Lock should be released after function');
  });

  it('should execute function with write lock', async () => {
    let executed = false;

    const result = await rwLockManager.withWriteLock(testResource, async () => {
      executed = true;
      return 'success';
    });

    assert.strictEqual(executed, true, 'Function should be executed');
    assert.strictEqual(result, 'success', 'Should return function result');

    const lockInfo = rwLockManager.getLockInfo(testResource);
    assert.strictEqual(lockInfo, null, 'Lock should be released after function');
  });

  it('should release lock even if function throws error', async () => {
    try {
      await rwLockManager.withWriteLock(testResource, async () => {
        throw new Error('Test error');
      });
      assert.fail('Should have thrown error');
    } catch (err) {
      assert.strictEqual(err.message, 'Test error', 'Should propagate error');
    }

    const lockInfo = rwLockManager.getLockInfo(testResource);
    assert.strictEqual(lockInfo, null, 'Lock should be released even after error');
  });

  it('should provide lock statistics', async () => {
    await rwLockManager.acquireRead(testResource);

    const stats = rwLockManager.getStats();

    assert.ok(stats, 'Stats should exist');
    assert.strictEqual(stats.totalLocks, 1, 'Should have 1 lock');
    assert.strictEqual(stats.totalReaders, 1, 'Should have 1 reader');

    await rwLockManager.releaseRead(testResource);
  });

  it('should list all locks for current session', async () => {
    await rwLockManager.acquireRead(testResource);

    const locks = rwLockManager.listLocks();

    assert.ok(Array.isArray(locks), 'Locks should be an array');
    assert.strictEqual(locks.length, 1, 'Should have 1 lock');
    assert.strictEqual(locks[0].lock_type, 'read', 'Lock type should be read');

    await rwLockManager.releaseRead(testResource);
  });

  it('should check if resource is locked', async () => {
    assert.strictEqual(
      rwLockManager.isLocked(testResource),
      false,
      'Should not be locked initially'
    );

    await rwLockManager.acquireRead(testResource);
    assert.strictEqual(
      rwLockManager.isLocked(testResource),
      true,
      'Should be locked after acquire'
    );

    await rwLockManager.releaseRead(testResource);
    assert.strictEqual(
      rwLockManager.isLocked(testResource),
      false,
      'Should not be locked after release'
    );
  });

  it('should release all locks', async () => {
    await rwLockManager.acquireRead(testResource);
    await rwLockManager.acquireRead(path.resolve('./test-resource2.txt'));

    await rwLockManager.releaseAllLocks();

    const locks = rwLockManager.listLocks();
    assert.strictEqual(locks.length, 0, 'All locks should be released');
  });

  it('should handle concurrent read operations', async () => {
    const results = [];

    // Execute multiple read operations concurrently
    const operations = Array.from({ length: 5 }, (_, i) =>
      rwLockManager.withReadLock(testResource, async () => {
        results.push(i);
        // Simulate some work
        await new Promise((resolve) => setTimeout(resolve, 10));
        return i;
      })
    );

    const completed = await Promise.all(operations);

    assert.strictEqual(completed.length, 5, 'All operations should complete');
    assert.strictEqual(results.length, 5, 'All operations should execute');
  });
});
