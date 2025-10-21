#!/usr/bin/env node

/**
 * Database Pool Performance Demo
 *
 * Demonstrates the performance improvement from using connection pooling
 * vs. creating new database connections for each operation.
 */

import { DatabasePool } from '../src/utils/database-pool.js';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DEMO_DB_PATH = path.join(process.cwd(), '.demo-data', 'pool-demo.db');
const NUM_OPERATIONS = 100;

// Ensure demo directory exists
fs.mkdirSync(path.dirname(DEMO_DB_PATH), { recursive: true });

// Clean up previous demo database
if (fs.existsSync(DEMO_DB_PATH)) {
  fs.unlinkSync(DEMO_DB_PATH);
}

console.log('🚀 Database Connection Pool Performance Demo\n');
console.log(`Running ${NUM_OPERATIONS} insert operations...\n`);

// ============================================================================
// BENCHMARK 1: Without Pool (Direct Database Creation)
// ============================================================================

async function benchmarkWithoutPool() {
  console.log('📊 Benchmark 1: WITHOUT Connection Pool');
  console.log('----------------------------------------');

  const startTime = Date.now();

  // Create and initialize database
  const db = new Database(DEMO_DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.close();

  // Perform operations (creating new connection each time)
  const operations = [];
  for (let i = 0; i < NUM_OPERATIONS; i++) {
    operations.push(
      new Promise((resolve) => {
        const conn = new Database(DEMO_DB_PATH);
        const stmt = conn.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
        const result = stmt.run(`User ${i}`, `user${i}@example.com`);
        conn.close();
        resolve(result.lastInsertRowid);
      })
    );
  }

  await Promise.all(operations);

  const endTime = Date.now();
  const duration = endTime - startTime;

  console.log(`✅ Completed ${NUM_OPERATIONS} operations`);
  console.log(`⏱️  Total time: ${duration}ms`);
  console.log(`📈 Average per operation: ${(duration / NUM_OPERATIONS).toFixed(2)}ms`);
  console.log(`🔄 Connections created: ${NUM_OPERATIONS} (one per operation)\n`);

  return duration;
}

// ============================================================================
// BENCHMARK 2: With Connection Pool
// ============================================================================

async function benchmarkWithPool() {
  console.log('📊 Benchmark 2: WITH Connection Pool');
  console.log('----------------------------------------');

  // Clean database for fair comparison
  if (fs.existsSync(DEMO_DB_PATH)) {
    fs.unlinkSync(DEMO_DB_PATH);
  }

  const startTime = Date.now();

  // Create pool and initialize
  const pool = new DatabasePool(DEMO_DB_PATH, {
    poolSize: 10,
    enableWAL: true
  });

  await pool.execute((db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });

  // Perform operations (reusing connections from pool)
  const operations = [];
  for (let i = 0; i < NUM_OPERATIONS; i++) {
    operations.push(
      pool.execute((db) => {
        const stmt = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
        return stmt.run(`User ${i}`, `user${i}@example.com`).lastInsertRowid;
      })
    );
  }

  await Promise.all(operations);

  const endTime = Date.now();
  const duration = endTime - startTime;

  const stats = pool.getStats();

  console.log(`✅ Completed ${NUM_OPERATIONS} operations`);
  console.log(`⏱️  Total time: ${duration}ms`);
  console.log(`📈 Average per operation: ${(duration / NUM_OPERATIONS).toFixed(2)}ms`);
  console.log(`🔄 Pool size: ${stats.poolSize}`);
  console.log(`📊 Connection reuse: ${stats.totalAcquired} acquisitions / ${stats.totalCreated} created`);
  console.log(`🎯 Peak concurrent: ${stats.peakActive} connections`);
  console.log(`✨ Utilization: ${stats.utilization}\n`);

  // Cleanup
  await pool.cleanup();

  return duration;
}

// ============================================================================
// BENCHMARK 3: Pool Statistics Demo
// ============================================================================

async function demonstratePoolStatistics() {
  console.log('📊 Benchmark 3: Pool Statistics & Monitoring');
  console.log('----------------------------------------');

  const pool = new DatabasePool(DEMO_DB_PATH, {
    poolSize: 5,
    enableWAL: true
  });

  console.log('Initial pool state:');
  console.log(pool.getStats());
  console.log();

  // Simulate varying load
  console.log('Simulating varying load patterns...\n');

  // Phase 1: Light load (2 concurrent operations)
  console.log('Phase 1: Light load (2 concurrent ops)');
  await Promise.all([
    pool.execute((db) => db.prepare('SELECT COUNT(*) as count FROM users').get()),
    pool.execute((db) => db.prepare('SELECT COUNT(*) as count FROM users').get())
  ]);
  console.log('Stats:', pool.getStats());
  console.log();

  // Phase 2: Medium load (5 concurrent operations - fills pool)
  console.log('Phase 2: Medium load (5 concurrent ops - fills pool)');
  await Promise.all([
    pool.execute((db) => db.prepare('SELECT * FROM users LIMIT 10').all()),
    pool.execute((db) => db.prepare('SELECT * FROM users LIMIT 10').all()),
    pool.execute((db) => db.prepare('SELECT * FROM users LIMIT 10').all()),
    pool.execute((db) => db.prepare('SELECT * FROM users LIMIT 10').all()),
    pool.execute((db) => db.prepare('SELECT * FROM users LIMIT 10').all())
  ]);
  console.log('Stats:', pool.getStats());
  console.log();

  // Phase 3: Heavy load (10 concurrent operations - queuing occurs)
  console.log('Phase 3: Heavy load (10 concurrent ops - requests queued)');
  const startHeavy = Date.now();
  await Promise.all(
    Array.from({ length: 10 }, () =>
      pool.execute((db) => db.prepare('SELECT * FROM users LIMIT 20').all())
    )
  );
  const heavyDuration = Date.now() - startHeavy;
  console.log(`Completed in ${heavyDuration}ms`);
  console.log('Stats:', pool.getStats());
  console.log();

  // Health check
  console.log(`Pool health: ${pool.isHealthy() ? '✅ Healthy' : '❌ Unhealthy'}`);
  console.log();

  // Cleanup
  await pool.cleanup();
}

// ============================================================================
// RUN BENCHMARKS
// ============================================================================

async function runAllBenchmarks() {
  try {
    // Run benchmarks
    const timeWithoutPool = await benchmarkWithoutPool();
    const timeWithPool = await benchmarkWithPool();
    await demonstratePoolStatistics();

    // Summary
    console.log('═'.repeat(60));
    console.log('📊 PERFORMANCE COMPARISON SUMMARY');
    console.log('═'.repeat(60));
    console.log();
    console.log(`Operations: ${NUM_OPERATIONS} concurrent inserts`);
    console.log();
    console.log(`WITHOUT Pool: ${timeWithoutPool}ms`);
    console.log(`WITH Pool:    ${timeWithPool}ms`);
    console.log();

    const improvement = ((timeWithoutPool - timeWithPool) / timeWithoutPool * 100).toFixed(1);
    const speedup = (timeWithoutPool / timeWithPool).toFixed(1);

    console.log(`⚡ Performance Improvement: ${improvement}% faster`);
    console.log(`🚀 Speedup Factor: ${speedup}x`);
    console.log();

    // Recommendations
    console.log('💡 RECOMMENDATIONS:');
    console.log('  • Use connection pooling for all database operations');
    console.log('  • Set pool size based on concurrent load (typically 5-20)');
    console.log('  • Monitor pool statistics in production');
    console.log('  • Enable WAL mode for better concurrency');
    console.log();

    // Cleanup demo database
    if (fs.existsSync(DEMO_DB_PATH)) {
      fs.unlinkSync(DEMO_DB_PATH);
      console.log('✅ Demo database cleaned up');
    }

  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the demo
runAllBenchmarks();
