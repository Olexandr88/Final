// examples/orm-migration-demo.js
// Demonstrates ORM integration patterns for LLM Framework

import { PrismaClient } from '@prisma/client';
import Database from 'better-sqlite3';
import { performance } from 'perf_hooks';

/**
 * Example 1: Simple CRUD Operations
 * Compares raw SQL vs Prisma ORM for basic operations
 */
async function example1_SimpleCRUD() {
  console.log('\n=== Example 1: Simple CRUD Operations ===\n');

  // Setup
  const prisma = new PrismaClient({ datasource: { url: 'file:./data/demo.db' } });
  const db = new Database('./data/demo.db');

  // Raw SQL Insert
  console.log('Raw SQL Insert:');
  const start1 = performance.now();
  const stmt = db.prepare(`
    INSERT INTO sessions (id, pid, start_time, last_heartbeat, status, cwd)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result1 = stmt.run('session-raw-1', process.pid, Date.now(), Date.now(), 'active', process.cwd());
  const duration1 = performance.now() - start1;
  console.log(`  Inserted row ID: ${result1.lastInsertRowid} in ${duration1.toFixed(2)}ms`);

  // Prisma ORM Insert
  console.log('\nPrisma ORM Insert:');
  const start2 = performance.now();
  const session = await prisma.session.create({
    data: {
      id: 'session-orm-1',
      pid: process.pid,
      startTime: Date.now(),
      lastHeartbeat: Date.now(),
      status: 'active',
      cwd: process.cwd()
    }
  });
  const duration2 = performance.now() - start2;
  console.log(`  Inserted session: ${session.id} in ${duration2.toFixed(2)}ms`);

  // Performance Comparison
  const overhead = ((duration2 - duration1) / duration1 * 100).toFixed(1);
  console.log(`\n  ORM Overhead: +${overhead}%`);

  // Cleanup
  await prisma.$disconnect();
  db.close();
}

/**
 * Example 2: Complex Queries with Relations
 * Shows JOIN operations and relation loading
 */
async function example2_ComplexQueries() {
  console.log('\n=== Example 2: Complex Queries with Relations ===\n');

  const prisma = new PrismaClient({ datasource: { url: 'file:./data/demo.db' } });
  const db = new Database('./data/demo.db');

  // Setup test data
  await prisma.session.create({
    data: {
      id: 'session-complex',
      pid: process.pid,
      startTime: Date.now(),
      lastHeartbeat: Date.now(),
      status: 'active',
      cwd: process.cwd(),
      locks: {
        create: [
          { resourcePath: '/file1.js', lockType: 'write', acquiredAt: Date.now() },
          { resourcePath: '/file2.js', lockType: 'read', acquiredAt: Date.now() }
        ]
      }
    }
  });

  // Raw SQL (manual JOIN)
  console.log('Raw SQL (manual JOIN):');
  const start1 = performance.now();
  const sessionRaw = db.prepare('SELECT * FROM sessions WHERE id = ?').get('session-complex');
  const locksRaw = db.prepare('SELECT * FROM locks WHERE session_id = ?').all(sessionRaw.id);
  const resultRaw = { ...sessionRaw, locks: locksRaw };
  const duration1 = performance.now() - start1;
  console.log(`  Session: ${resultRaw.id} with ${resultRaw.locks.length} locks`);
  console.log(`  Duration: ${duration1.toFixed(2)}ms`);

  // Prisma ORM (automatic JOIN)
  console.log('\nPrisma ORM (automatic relation loading):');
  const start2 = performance.now();
  const sessionORM = await prisma.session.findUnique({
    where: { id: 'session-complex' },
    include: { locks: true }
  });
  const duration2 = performance.now() - start2;
  console.log(`  Session: ${sessionORM.id} with ${sessionORM.locks.length} locks`);
  console.log(`  Duration: ${duration2.toFixed(2)}ms`);

  console.log(`\n  ORM Overhead: +${((duration2 - duration1) / duration1 * 100).toFixed(1)}%`);

  // Type Safety Demonstration
  console.log('\nType Safety:');
  console.log('  Raw SQL: No compile-time checks');
  console.log('  Prisma ORM: Full TypeScript IntelliSense');
  console.log(`    sessionORM.id: ${typeof sessionORM.id} (known at compile time)`);
  console.log(`    sessionORM.locks[0].lockType: ${sessionORM.locks[0].lockType} (autocomplete available)`);

  await prisma.$disconnect();
  db.close();
}

/**
 * Example 3: Transactions
 * Demonstrates atomic multi-step operations
 */
async function example3_Transactions() {
  console.log('\n=== Example 3: Transactions ===\n');

  const prisma = new PrismaClient({ datasource: { url: 'file:./data/demo.db' } });
  const db = new Database('./data/demo.db');

  // Raw SQL Transaction
  console.log('Raw SQL Transaction:');
  const start1 = performance.now();
  db.prepare('BEGIN TRANSACTION').run();
  try {
    db.prepare(`
      UPDATE sessions SET status = 'stale'
      WHERE last_heartbeat < ?
    `).run(Date.now() - 30000);

    db.prepare(`
      DELETE FROM locks
      WHERE session_id IN (SELECT id FROM sessions WHERE status = 'stale')
    `).run();

    db.prepare('COMMIT').run();
    const duration1 = performance.now() - start1;
    console.log(`  Transaction completed in ${duration1.toFixed(2)}ms`);
  } catch (err) {
    db.prepare('ROLLBACK').run();
    console.error('  Transaction failed, rolled back');
  }

  // Prisma ORM Transaction
  console.log('\nPrisma ORM Transaction:');
  const start2 = performance.now();
  try {
    await prisma.$transaction([
      prisma.session.updateMany({
        where: { lastHeartbeat: { lt: Date.now() - 30000 } },
        data: { status: 'stale' }
      }),
      prisma.lock.deleteMany({
        where: {
          session: { status: 'stale' }
        }
      })
    ]);
    const duration2 = performance.now() - start2;
    console.log(`  Transaction completed in ${duration2.toFixed(2)}ms`);
  } catch (err) {
    console.error('  Transaction failed (auto-rollback)');
  }

  console.log('\nTransaction Safety:');
  console.log('  Raw SQL: Manual BEGIN/COMMIT/ROLLBACK');
  console.log('  Prisma ORM: Automatic rollback on error');

  await prisma.$disconnect();
  db.close();
}

/**
 * Example 4: Bulk Operations
 * Compares bulk insert/update performance
 */
async function example4_BulkOperations() {
  console.log('\n=== Example 4: Bulk Operations ===\n');

  const prisma = new PrismaClient({ datasource: { url: 'file:./data/demo.db' } });
  const db = new Database('./data/demo.db');

  const COUNT = 100;
  const testData = Array(COUNT).fill(null).map((_, i) => ({
    id: `bulk-${i}`,
    pid: process.pid,
    startTime: Date.now(),
    lastHeartbeat: Date.now(),
    status: 'active',
    cwd: process.cwd()
  }));

  // Raw SQL Bulk Insert
  console.log(`Raw SQL Bulk Insert (${COUNT} rows):`);
  const start1 = performance.now();
  const insertStmt = db.prepare(`
    INSERT INTO sessions (id, pid, start_time, last_heartbeat, status, cwd)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction((sessions) => {
    for (const session of sessions) {
      insertStmt.run(session.id, session.pid, session.startTime, session.lastHeartbeat, session.status, session.cwd);
    }
  });
  insertMany(testData);
  const duration1 = performance.now() - start1;
  console.log(`  Duration: ${duration1.toFixed(2)}ms (${(duration1 / COUNT).toFixed(2)}ms per row)`);

  // Prisma ORM Bulk Insert
  console.log(`\nPrisma ORM Bulk Insert (${COUNT} rows):`);
  const start2 = performance.now();
  const result = await prisma.session.createMany({
    data: testData.map(d => ({
      id: `${d.id}-orm`,
      pid: d.pid,
      startTime: d.startTime,
      lastHeartbeat: d.lastHeartbeat,
      status: d.status,
      cwd: d.cwd
    })),
    skipDuplicates: true
  });
  const duration2 = performance.now() - start2;
  console.log(`  Duration: ${duration2.toFixed(2)}ms (${(duration2 / COUNT).toFixed(2)}ms per row)`);
  console.log(`  Rows inserted: ${result.count}`);

  console.log(`\n  ORM Overhead: +${((duration2 - duration1) / duration1 * 100).toFixed(1)}%`);

  await prisma.$disconnect();
  db.close();
}

/**
 * Example 5: Hybrid Approach
 * Uses ORM for most operations, raw SQL for performance-critical paths
 */
async function example5_HybridApproach() {
  console.log('\n=== Example 5: Hybrid Approach (ORM + Raw SQL) ===\n');

  const prisma = new PrismaClient({
    datasource: { url: 'file:./data/demo.db' },
    log: ['query'] // Show generated SQL
  });

  // Standard ORM operation
  console.log('Standard ORM Operation:');
  const session = await prisma.session.findFirst({
    where: { status: 'active' },
    include: { locks: true }
  });
  console.log(`  Found session: ${session?.id || 'none'}`);

  // Raw SQL for performance-critical operation
  console.log('\nPerformance-Critical Operation (raw SQL):');
  const start = performance.now();
  const result = await prisma.$executeRaw`
    INSERT INTO locks (resource_path, session_id, acquired_at, lock_type)
    SELECT ${'/critical-file.js'}, ${session.id}, ${Date.now()}, ${'write'}
    WHERE NOT EXISTS (
      SELECT 1 FROM locks
      WHERE resource_path = ${'/critical-file.js'}
      AND lock_type = 'write'
    )
  `;
  const duration = performance.now() - start;
  console.log(`  Lock acquired in ${duration.toFixed(2)}ms (rows affected: ${result})`);

  // Query raw for complex analysis
  console.log('\nComplex Analysis Query (raw SQL):');
  const stats = await prisma.$queryRaw`
    SELECT
      s.status,
      COUNT(DISTINCT s.id) as session_count,
      COUNT(l.id) as lock_count
    FROM sessions s
    LEFT JOIN locks l ON s.id = l.session_id
    GROUP BY s.status
  `;
  console.log('  Statistics:', stats);

  console.log('\nHybrid Pattern Benefits:');
  console.log('  - Use ORM for 90% of operations (type safety, relations)');
  console.log('  - Use raw SQL for 10% (complex queries, performance-critical)');
  console.log('  - Best of both worlds!');

  await prisma.$disconnect();
}

/**
 * Example 6: Migration Compatibility Layer
 * Shows how to maintain backward compatibility during migration
 */
async function example6_CompatibilityLayer() {
  console.log('\n=== Example 6: Migration Compatibility Layer ===\n');

  // Feature flag system
  const USE_ORM = process.env.ENABLE_ORM === 'true';

  // Abstraction factory
  function getSessionManager() {
    if (USE_ORM) {
      return {
        async register() {
          const prisma = new PrismaClient({ datasource: { url: 'file:./data/demo.db' } });
          const session = await prisma.session.create({
            data: {
              id: `session-${Date.now()}`,
              pid: process.pid,
              startTime: Date.now(),
              lastHeartbeat: Date.now(),
              status: 'active',
              cwd: process.cwd()
            }
          });
          await prisma.$disconnect();
          return session.id;
        }
      };
    } else {
      return {
        register() {
          const db = new Database('./data/demo.db');
          const id = `session-${Date.now()}`;
          db.prepare(`
            INSERT INTO sessions (id, pid, start_time, last_heartbeat, status, cwd)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(id, process.pid, Date.now(), Date.now(), 'active', process.cwd());
          db.close();
          return id;
        }
      };
    }
  }

  // Usage (same interface, different implementation)
  console.log(`Using implementation: ${USE_ORM ? 'Prisma ORM' : 'Raw SQL'}`);
  const manager = getSessionManager();
  const sessionId = await manager.register();
  console.log(`  Registered session: ${sessionId}`);

  console.log('\nCompatibility Benefits:');
  console.log('  - Zero-downtime migration');
  console.log('  - Easy rollback (just toggle flag)');
  console.log('  - A/B testing in production');
}

/**
 * Run all examples
 */
async function runAllExamples() {
  console.log('=============================================');
  console.log('  ORM Migration Demo - LLM Framework');
  console.log('=============================================');

  try {
    await example1_SimpleCRUD();
    await example2_ComplexQueries();
    await example3_Transactions();
    await example4_BulkOperations();
    await example5_HybridApproach();
    await example6_CompatibilityLayer();

    console.log('\n=============================================');
    console.log('  All examples completed successfully!');
    console.log('=============================================\n');
  } catch (error) {
    console.error('\n❌ Example failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples();
}

export {
  example1_SimpleCRUD,
  example2_ComplexQueries,
  example3_Transactions,
  example4_BulkOperations,
  example5_HybridApproach,
  example6_CompatibilityLayer
};
