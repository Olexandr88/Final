import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabasePool } from '../src/utils/database-pool.js';
import fs from 'fs';
import path from 'path';

const TEST_DB_PATH = path.join(process.cwd(), '.test-data', 'pool-test.db');

describe('DatabasePool', () => {
  let pool;

  before(() => {
    // Ensure test directory exists
    const dir = path.dirname(TEST_DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Remove test database if it exists
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    // Create pool
    pool = new DatabasePool(TEST_DB_PATH, {
      poolSize: 5,
      enableWAL: true,
    });
  });

  after(async () => {
    // Cleanup pool
    await pool.cleanup();

    // Remove test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  it('should initialize with correct pool size', () => {
    const stats = pool.getStats();
    assert.strictEqual(stats.poolSize, 5);
    assert.strictEqual(stats.available, 5);
    assert.strictEqual(stats.active, 0);
  });

  it('should execute database operations', async () => {
    const result = await pool.execute((db) => {
      db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
      const stmt = db.prepare('INSERT INTO test (name) VALUES (?)');
      return stmt.run('Test Name').lastInsertRowid;
    });

    assert.strictEqual(typeof result, 'number');
    assert.ok(result > 0);
  });

  it('should handle multiple concurrent operations', async () => {
    const operations = [];

    for (let i = 0; i < 10; i++) {
      operations.push(
        pool.execute((db) => {
          const stmt = db.prepare('INSERT INTO test (name) VALUES (?)');
          return stmt.run(`User ${i}`).lastInsertRowid;
        })
      );
    }

    const results = await Promise.all(operations);
    assert.strictEqual(results.length, 10);

    // Verify all operations succeeded
    const count = await pool.execute((db) => {
      return db.prepare('SELECT COUNT(*) as count FROM test').get().count;
    });

    assert.strictEqual(count, 11); // 1 from previous test + 10 from this test
  });

  it('should reuse connections from pool', async () => {
    const statsBefore = pool.getStats();

    await pool.execute((db) => {
      db.prepare('SELECT * FROM test').all();
    });

    const statsAfter = pool.getStats();

    // Pool size should remain the same
    assert.strictEqual(statsAfter.poolSize, statsBefore.poolSize);
    // Connection should be returned to available pool
    assert.strictEqual(statsAfter.available, statsBefore.available);
  });

  it('should track statistics correctly', async () => {
    const statsBefore = pool.getStats();

    await pool.execute((db) => {
      db.prepare('SELECT * FROM test').all();
    });

    const statsAfter = pool.getStats();

    // Should have acquired and released at least once
    assert.ok(statsAfter.totalAcquired > statsBefore.totalAcquired);
    assert.ok(statsAfter.totalReleased > statsBefore.totalReleased);
  });

  it('should handle errors gracefully', async () => {
    await assert.rejects(
      async () => {
        await pool.execute((db) => {
          db.prepare('SELECT * FROM nonexistent_table').all();
        });
      },
      (error) => {
        // Should throw an error (either Error or SqliteError)
        return error instanceof Error;
      }
    );

    // Pool should still be healthy after error
    assert.ok(pool.isHealthy());
  });

  it('should timeout when pool is exhausted', async () => {
    const smallPool = new DatabasePool(TEST_DB_PATH, {
      poolSize: 2,
      maxWaitTime: 1000,
    });

    try {
      // Acquire all connections and hold them
      const conn1 = await smallPool.getConnection();
      const conn2 = await smallPool.getConnection();

      // Try to acquire another - should timeout
      await assert.rejects(
        async () => {
          await smallPool.execute(() => {
            // This should timeout
          });
        },
        {
          message: /timeout/i,
        }
      );

      // Release connections
      smallPool.releaseConnection(conn1);
      smallPool.releaseConnection(conn2);
    } finally {
      await smallPool.cleanup();
    }
  });

  it('should report health status correctly', () => {
    assert.strictEqual(pool.isHealthy(), true);

    const stats = pool.getStats();
    assert.strictEqual(stats.available + stats.active, stats.poolSize);
  });
});
