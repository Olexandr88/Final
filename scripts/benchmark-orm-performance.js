#!/usr/bin/env node
// scripts/benchmark-orm-performance.js
// Comprehensive performance comparison: Raw SQL vs Prisma ORM
// Version: 2.0 - Updated for BigInt timestamp support

import Database from 'better-sqlite3';
import { PrismaClient } from '@prisma/client';
import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const BENCHMARK_DB_PATH = path.join(__dirname, '..', 'data', 'benchmark.db');
const ITERATIONS = {
  simple: 1000,
  complex: 500,
  bulk: 100,
};

// Color output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

class ORMBenchmark {
  constructor() {
    this.results = {};
    this.db = null;
    this.prisma = null;
  }

  async setup() {
    console.log(`${colors.cyan}Setting up benchmark environment...${colors.reset}\n`);

    // Remove old benchmark DB
    if (fs.existsSync(BENCHMARK_DB_PATH)) {
      fs.unlinkSync(BENCHMARK_DB_PATH);
    }

    // Ensure data directory exists
    fs.mkdirSync(path.dirname(BENCHMARK_DB_PATH), { recursive: true });

    // Initialize raw SQL connection
    this.db = new Database(BENCHMARK_DB_PATH);
    this.db.pragma('journal_mode = WAL');

    // Create tables with BIGINT for timestamps
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        pid INTEGER NOT NULL,
        start_time BIGINT NOT NULL,
        last_heartbeat BIGINT NOT NULL,
        status TEXT DEFAULT 'active',
        current_task TEXT,
        cwd TEXT
      );

      CREATE TABLE IF NOT EXISTS locks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resource_path TEXT NOT NULL,
        session_id TEXT NOT NULL,
        acquired_at BIGINT NOT NULL,
        lock_type TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE TABLE IF NOT EXISTS selections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        title TEXT,
        selected_text TEXT NOT NULL,
        source TEXT DEFAULT 'browser',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
      CREATE INDEX IF NOT EXISTS idx_sessions_heartbeat ON sessions(last_heartbeat);
      CREATE INDEX IF NOT EXISTS idx_sessions_status_heartbeat ON sessions(status, last_heartbeat);
      CREATE INDEX IF NOT EXISTS idx_locks_resource ON locks(resource_path);
      CREATE INDEX IF NOT EXISTS idx_locks_session ON locks(session_id);
      CREATE INDEX IF NOT EXISTS idx_locks_resource_type ON locks(resource_path, lock_type);
      CREATE INDEX IF NOT EXISTS idx_locks_session_time ON locks(session_id, acquired_at);
      CREATE INDEX IF NOT EXISTS idx_selections_created_at ON selections(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_selections_url ON selections(url);
      CREATE INDEX IF NOT EXISTS idx_selections_source ON selections(source);
      CREATE INDEX IF NOT EXISTS idx_selections_source_time ON selections(source, created_at DESC);
    `);

    // Initialize Prisma client
    this.prisma = new PrismaClient({
      datasources: { db: { url: `file:${BENCHMARK_DB_PATH}` } },
      log: [], // Disable logging for benchmarks
    });

    console.log(`${colors.green}✓ Database initialized with optimized schema${colors.reset}`);
    console.log(`${colors.green}✓ Prisma client connected${colors.reset}\n`);
  }

  async benchmark(name, fn, iterations = 1000) {
    const times = [];

    // Warmup (5% of iterations)
    const warmup = Math.ceil(iterations * 0.05);
    for (let i = 0; i < warmup; i++) {
      await fn();
    }

    // Actual benchmark
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await fn();
      const duration = performance.now() - start;
      times.push(duration);
    }

    // Calculate statistics
    const sorted = times.sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];

    return {
      name,
      iterations,
      avg,
      median,
      p95,
      p99,
      min,
      max,
    };
  }

  async runSimpleInsertBenchmarks() {
    console.log(`${colors.blue}=== Simple Insert Operations ===${colors.reset}\n`);

    let counter = 0;

    // Raw SQL Insert
    const rawResult = await this.benchmark(
      'Raw SQL Insert (Session)',
      () => {
        this.db
          .prepare(
            `
          INSERT INTO sessions (id, pid, start_time, last_heartbeat, status, cwd)
          VALUES (?, ?, ?, ?, ?, ?)
        `
          )
          .run(
            `raw-session-${counter++}`,
            process.pid,
            BigInt(Date.now()),
            BigInt(Date.now()),
            'active',
            process.cwd()
          );
      },
      ITERATIONS.simple
    );

    // Prisma ORM Insert
    counter = 0;
    const ormResult = await this.benchmark(
      'Prisma ORM Insert (Session)',
      async () => {
        await this.prisma.session.create({
          data: {
            id: `orm-session-${counter++}`,
            pid: process.pid,
            startTime: BigInt(Date.now()),
            lastHeartbeat: BigInt(Date.now()),
            status: 'active',
            cwd: process.cwd(),
          },
        });
      },
      ITERATIONS.simple
    );

    this.results.simpleInsert = { raw: rawResult, orm: ormResult };
    this.printComparison('Simple Insert', rawResult, ormResult);
  }

  async runComplexQueryBenchmarks() {
    console.log(`${colors.blue}=== Complex Query Operations (with Relations) ===${colors.reset}\n`);

    // Setup test data
    const testSessionId = 'complex-test-session';
    this.db
      .prepare(
        `
      INSERT OR REPLACE INTO sessions (id, pid, start_time, last_heartbeat, status, cwd)
      VALUES (?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        testSessionId,
        process.pid,
        BigInt(Date.now()),
        BigInt(Date.now()),
        'active',
        process.cwd()
      );

    for (let i = 0; i < 10; i++) {
      this.db
        .prepare(
          `
        INSERT INTO locks (resource_path, session_id, acquired_at, lock_type)
        VALUES (?, ?, ?, ?)
      `
        )
        .run(`/file-${i}.js`, testSessionId, BigInt(Date.now()), 'read');
    }

    // Raw SQL Query (manual JOIN)
    const rawResult = await this.benchmark(
      'Raw SQL Query (Session + Locks)',
      () => {
        const session = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(testSessionId);
        const locks = this.db
          .prepare('SELECT * FROM locks WHERE session_id = ?')
          .all(testSessionId);
        return { ...session, locks };
      },
      ITERATIONS.complex
    );

    // Prisma ORM Query (automatic JOIN)
    const ormResult = await this.benchmark(
      'Prisma ORM Query (Session + Locks)',
      async () => {
        return this.prisma.session.findUnique({
          where: { id: testSessionId },
          include: { locks: true },
        });
      },
      ITERATIONS.complex
    );

    this.results.complexQuery = { raw: rawResult, orm: ormResult };
    this.printComparison('Complex Query', rawResult, ormResult);
  }

  async runSearchBenchmarks() {
    console.log(`${colors.blue}=== Search Operations ===${colors.reset}\n`);

    // Setup test data (100 selections)
    for (let i = 0; i < 100; i++) {
      this.db
        .prepare(
          `
        INSERT INTO selections (url, title, selected_text, source)
        VALUES (?, ?, ?, ?)
      `
        )
        .run(
          `https://example.com/page-${i}`,
          `Test Page ${i}`,
          `This is test content number ${i} with some searchable keywords`,
          'benchmark'
        );
    }

    // Raw SQL Search
    const rawResult = await this.benchmark(
      'Raw SQL Search (LIKE query)',
      () => {
        return this.db
          .prepare(
            `
          SELECT * FROM selections
          WHERE selected_text LIKE ? OR title LIKE ? OR url LIKE ?
          ORDER BY created_at DESC
          LIMIT 50
        `
          )
          .all('%test%', '%test%', '%test%');
      },
      ITERATIONS.complex
    );

    // Prisma ORM Search
    const ormResult = await this.benchmark(
      'Prisma ORM Search (contains filter)',
      async () => {
        return this.prisma.selection.findMany({
          where: {
            OR: [
              { selectedText: { contains: 'test' } },
              { title: { contains: 'test' } },
              { url: { contains: 'test' } },
            ],
          },
          take: 50,
          orderBy: { createdAt: 'desc' },
        });
      },
      ITERATIONS.complex
    );

    this.results.search = { raw: rawResult, orm: ormResult };
    this.printComparison('Search Query', rawResult, ormResult);
  }

  async runBulkInsertBenchmarks() {
    console.log(`${colors.blue}=== Bulk Insert Operations ===${colors.reset}\n`);

    const BULK_SIZE = 100;

    // Raw SQL Bulk Insert
    const rawResult = await this.benchmark(
      `Raw SQL Bulk Insert (${BULK_SIZE} rows)`,
      () => {
        const insertStmt = this.db.prepare(`
          INSERT INTO selections (url, title, selected_text, source)
          VALUES (?, ?, ?, ?)
        `);

        const insertMany = this.db.transaction((data) => {
          for (const item of data) {
            insertStmt.run(item.url, item.title, item.text, item.source);
          }
        });

        const data = Array(BULK_SIZE)
          .fill(null)
          .map((_, i) => ({
            url: `https://bulk.com/${i}`,
            title: `Bulk ${i}`,
            text: `Bulk content ${i}`,
            source: 'benchmark',
          }));

        insertMany(data);
      },
      ITERATIONS.bulk
    );

    // Prisma ORM Bulk Insert
    const ormResult = await this.benchmark(
      `Prisma ORM Bulk Insert (${BULK_SIZE} rows)`,
      async () => {
        const data = Array(BULK_SIZE)
          .fill(null)
          .map((_, i) => ({
            url: `https://bulk-orm.com/${i}`,
            title: `Bulk ORM ${i}`,
            selectedText: `Bulk ORM content ${i}`,
            source: 'benchmark',
          }));

        await this.prisma.selection.createMany({
          data,
          skipDuplicates: true,
        });
      },
      ITERATIONS.bulk
    );

    this.results.bulkInsert = { raw: rawResult, orm: ormResult };
    this.printComparison(`Bulk Insert (${BULK_SIZE} rows)`, rawResult, ormResult);
  }

  async runTransactionBenchmarks() {
    console.log(`${colors.blue}=== Transaction Operations ===${colors.reset}\n`);

    const cutoffTime = BigInt(Date.now() - 30000);

    // Raw SQL Transaction
    const rawResult = await this.benchmark(
      'Raw SQL Transaction (Update + Delete)',
      () => {
        this.db.prepare('BEGIN TRANSACTION').run();
        try {
          this.db
            .prepare(
              `
            UPDATE sessions SET status = 'stale'
            WHERE last_heartbeat < ?
          `
            )
            .run(cutoffTime);

          this.db
            .prepare(
              `
            DELETE FROM locks WHERE session_id IN (
              SELECT id FROM sessions WHERE status = 'stale'
            )
          `
            )
            .run();

          this.db.prepare('COMMIT').run();
        } catch (err) {
          this.db.prepare('ROLLBACK').run();
          throw err;
        }
      },
      ITERATIONS.complex
    );

    // Prisma ORM Transaction
    const ormResult = await this.benchmark(
      'Prisma ORM Transaction (Update + Delete)',
      async () => {
        await this.prisma.$transaction([
          this.prisma.session.updateMany({
            where: { lastHeartbeat: { lt: cutoffTime } },
            data: { status: 'stale' },
          }),
          this.prisma.lock.deleteMany({
            where: { session: { status: 'stale' } },
          }),
        ]);
      },
      ITERATIONS.complex
    );

    this.results.transaction = { raw: rawResult, orm: ormResult };
    this.printComparison('Transaction', rawResult, ormResult);
  }

  printComparison(name, rawResult, ormResult) {
    const overhead = ((ormResult.avg - rawResult.avg) / rawResult.avg) * 100;
    const isAcceptable = overhead < 100; // 100% overhead threshold

    console.log(`${name}:`);
    console.log(
      `  Raw SQL:    avg=${rawResult.avg.toFixed(2)}ms  median=${rawResult.median.toFixed(2)}ms  p95=${rawResult.p95.toFixed(2)}ms  p99=${rawResult.p99.toFixed(2)}ms`
    );
    console.log(
      `  Prisma ORM: avg=${ormResult.avg.toFixed(2)}ms  median=${ormResult.median.toFixed(2)}ms  p95=${ormResult.p95.toFixed(2)}ms  p99=${ormResult.p99.toFixed(2)}ms`
    );

    const statusColor = isAcceptable ? colors.green : colors.red;
    const status = isAcceptable ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${statusColor}Overhead: +${overhead.toFixed(1)}% ${status}${colors.reset}\n`);
  }

  printSummary() {
    console.log(`\n${colors.cyan}==========================================${colors.reset}`);
    console.log(`${colors.cyan}  ORM Performance Benchmark Summary${colors.reset}`);
    console.log(`${colors.cyan}==========================================${colors.reset}\n`);

    console.log(`Environment:`);
    console.log(`  Node.js:    ${process.version}`);
    console.log(`  SQLite:     ${this.db.prepare('SELECT sqlite_version()').pluck().get()}`);
    console.log(`  Database:   ${BENCHMARK_DB_PATH}`);
    console.log(`  WAL Mode:   ${this.db.pragma('journal_mode', { simple: true })}\n`);

    const categories = [
      { key: 'simpleInsert', name: 'Simple Insert', threshold: 100 },
      { key: 'complexQuery', name: 'Complex Query', threshold: 100 },
      { key: 'search', name: 'Search Query', threshold: 100 },
      { key: 'bulkInsert', name: 'Bulk Insert', threshold: 75 },
      { key: 'transaction', name: 'Transaction', threshold: 100 },
    ];

    let allPassed = true;

    for (const category of categories) {
      const result = this.results[category.key];
      if (!result) continue;

      const overhead = ((result.orm.avg - result.raw.avg) / result.raw.avg) * 100;
      const passed = overhead <= category.threshold;
      allPassed = allPassed && passed;

      const statusColor = passed ? colors.green : colors.red;
      const status = passed ? '✓' : '✗';

      console.log(`${statusColor}${status} ${category.name}:${colors.reset}`);
      console.log(
        `  Raw SQL:    ${result.raw.avg.toFixed(2)}ms avg (median: ${result.raw.median.toFixed(2)}ms, p95: ${result.raw.p95.toFixed(2)}ms)`
      );
      console.log(
        `  Prisma ORM: ${result.orm.avg.toFixed(2)}ms avg (median: ${result.orm.median.toFixed(2)}ms, p95: ${result.orm.p95.toFixed(2)}ms)`
      );
      console.log(`  Overhead:   +${overhead.toFixed(1)}% (threshold: ${category.threshold}%)\n`);
    }

    console.log(`${colors.cyan}==========================================${colors.reset}`);
    if (allPassed) {
      console.log(`${colors.green}VERDICT: ORM performance acceptable ✓${colors.reset}`);
      console.log(`${colors.green}All benchmarks within acceptable overhead${colors.reset}`);
    } else {
      console.log(`${colors.red}VERDICT: ORM performance issues detected ✗${colors.reset}`);
      console.log(`${colors.red}Some benchmarks exceeded overhead threshold${colors.reset}`);
    }
    console.log(`${colors.cyan}==========================================${colors.reset}\n`);

    return allPassed;
  }

  async cleanup() {
    console.log(`${colors.cyan}Cleaning up...${colors.reset}`);
    await this.prisma.$disconnect();
    this.db.close();
    console.log(`${colors.green}✓ Cleanup complete${colors.reset}\n`);
  }

  async run() {
    try {
      await this.setup();

      await this.runSimpleInsertBenchmarks();
      await this.runComplexQueryBenchmarks();
      await this.runSearchBenchmarks();
      await this.runBulkInsertBenchmarks();
      await this.runTransactionBenchmarks();

      const passed = this.printSummary();
      await this.cleanup();

      process.exit(passed ? 0 : 1);
    } catch (error) {
      console.error(`\n${colors.red}Benchmark failed:${colors.reset}`, error);
      if (this.prisma) await this.prisma.$disconnect();
      if (this.db) this.db.close();
      process.exit(1);
    }
  }
}

// Run benchmark
const benchmark = new ORMBenchmark();
benchmark.run();
