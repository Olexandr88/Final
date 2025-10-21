# ORM Layer Integration Plan for LLM Framework

## Executive Summary

This document outlines a comprehensive strategy to integrate an Object-Relational Mapping (ORM) layer into the LLM Framework project, abstracting SQLite database interactions while maintaining the existing DatabasePool performance optimizations.

**Recommended ORM**: **Prisma** (with TypeORM as alternative for specific use cases)

**Migration Timeline**: 4-6 weeks (incremental rollout)

**Risk Level**: Medium (mitigated by backward compatibility layer)

---

## 1. ORM Evaluation

### Current Database Architecture

**Database System**: SQLite 3 (better-sqlite3 driver)
**Connection Pattern**: Custom DatabasePool with 10-15 connections
**Current Features**:
- WAL mode for concurrency
- Connection pooling with acquire/release pattern
- Prepared statements for performance
- Manual SQL with string concatenation (security risk)
- Synchronous operations mixed with async

**Tables**:
1. `sessions` - Active session tracking (7 columns)
2. `locks` - Resource lock management (5 columns + FK)
3. `selections` - Browser text selection storage (6 columns)

### ORM Comparison Matrix

| Feature | Prisma | Sequelize | TypeORM |
|---------|--------|-----------|---------|
| **SQLite Support** | ✅ Excellent | ✅ Good | ✅ Good |
| **Connection Pooling** | ⚠️ Limited (better-sqlite3 driver) | ✅ Built-in | ✅ Built-in |
| **Type Safety** | ✅✅ Best-in-class | ⚠️ Runtime only | ✅ Good (TS decorators) |
| **Migration System** | ✅ Automatic + Manual | ✅ Manual | ✅ Manual |
| **Query Performance** | ✅ Optimized queries | ⚠️ Can be slow | ⚠️ Can generate inefficient queries |
| **Learning Curve** | ⚠️ Medium (new concepts) | ✅ Easy (familiar patterns) | ⚠️ Medium (decorators) |
| **Bundle Size** | ⚠️ Large (includes CLI) | ✅ Moderate | ✅ Moderate |
| **better-sqlite3 Integration** | ⚠️ Custom driver needed | ✅ Via dialect | ✅ Via driver |
| **Active Record Pattern** | ❌ No (Data Mapper only) | ✅ Yes | ✅ Yes (ActiveRecord + DataMapper) |
| **Raw SQL Escape Hatch** | ✅ $queryRaw | ✅ sequelize.query() | ✅ manager.query() |
| **Validation** | ⚠️ External (zod) | ✅ Built-in | ✅ class-validator integration |
| **Transaction Support** | ✅ Excellent | ✅ Good | ✅ Good |
| **Community** | 🔥 Rapidly growing | ✅ Mature/stable | ✅ Large |

### Recommendation: **Prisma** (Primary) + **TypeORM** (Fallback)

**Why Prisma**:
1. **Type Safety**: Auto-generated TypeScript types from schema
2. **Developer Experience**: Intuitive schema language, excellent VSCode support
3. **Migration Safety**: Automatic migration generation with review step
4. **Query Optimization**: Generates efficient SQL with query analysis tools
5. **Future-Proof**: Modern architecture, growing ecosystem

**Why NOT Sequelize**:
- Older codebase with legacy patterns
- Weaker type safety (runtime types only)
- Migration system less robust than Prisma

**Why NOT TypeORM (as primary)**:
- Decorator-based approach may conflict with existing code structure
- Can generate inefficient queries for complex joins
- Less intuitive for team members unfamiliar with decorators

**TypeORM Use Case** (Specialized):
- If custom connection pooling proves incompatible with Prisma
- For advanced features like multi-database support (PostgreSQL migration)
- When ActiveRecord pattern is preferred for specific modules

---

## 2. Schema Design

### Prisma Schema Definition

**File**: `prisma/schema.prisma`

```prisma
// Prisma schema for LLM Framework
generator client {
  provider = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

// Session management
model Session {
  id            String   @id @default(uuid())
  pid           Int
  startTime     Int      @map("start_time")
  lastHeartbeat Int      @map("last_heartbeat")
  status        String   @default("active")
  currentTask   String?  @map("current_task")
  cwd           String?

  locks         Lock[]

  @@index([status], name: "idx_sessions_status")
  @@map("sessions")
}

// Resource locks
model Lock {
  id           Int      @id @default(autoincrement())
  resourcePath String   @map("resource_path")
  sessionId    String   @map("session_id")
  acquiredAt   Int      @map("acquired_at")
  lockType     String   @map("lock_type")

  session      Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([resourcePath], name: "idx_locks_resource")
  @@index([sessionId], name: "idx_locks_session")
  @@map("locks")
}

// Browser text selections
model Selection {
  id           Int      @id @default(autoincrement())
  url          String
  title        String?
  selectedText String   @map("selected_text")
  source       String   @default("browser")
  createdAt    DateTime @default(now()) @map("created_at")

  @@index([createdAt(sort: Desc)], name: "idx_selections_created_at")
  @@index([url], name: "idx_selections_url")
  @@index([source], name: "idx_selections_source")
  @@map("selections")
}
```

### TypeORM Schema (Alternative)

**File**: `src/entities/Session.entity.ts`

```typescript
import { Entity, PrimaryColumn, Column, Index, OneToMany } from 'typeorm';
import { Lock } from './Lock.entity';

@Entity('sessions')
@Index('idx_sessions_status', ['status'])
export class Session {
  @PrimaryColumn('text')
  id: string;

  @Column('integer')
  pid: number;

  @Column('integer', { name: 'start_time' })
  startTime: number;

  @Column('integer', { name: 'last_heartbeat' })
  lastHeartbeat: number;

  @Column('text', { default: 'active' })
  status: string;

  @Column('text', { nullable: true, name: 'current_task' })
  currentTask: string | null;

  @Column('text', { nullable: true })
  cwd: string | null;

  @OneToMany(() => Lock, lock => lock.session, { cascade: true })
  locks: Lock[];
}
```

**File**: `src/entities/Lock.entity.ts`

```typescript
import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { Session } from './Session.entity';

@Entity('locks')
@Index('idx_locks_resource', ['resourcePath'])
@Index('idx_locks_session', ['sessionId'])
export class Lock {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('text', { name: 'resource_path' })
  resourcePath: string;

  @Column('text', { name: 'session_id' })
  sessionId: string;

  @Column('integer', { name: 'acquired_at' })
  acquiredAt: number;

  @Column('text', { name: 'lock_type' })
  lockType: string;

  @ManyToOne(() => Session, session => session.locks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: Session;
}
```

---

## 3. Migration Strategy

### Phase 1: Setup & Parallel Infrastructure (Week 1-2)

**Goal**: Install ORM without breaking existing code

**Tasks**:
1. Install Prisma dependencies
   ```bash
   npm install prisma @prisma/client
   npm install -D prisma
   ```

2. Initialize Prisma
   ```bash
   npx prisma init --datasource-provider sqlite
   ```

3. Create schema matching existing tables
   - Copy schema from section 2
   - Verify column mappings

4. Generate Prisma Client
   ```bash
   npx prisma generate
   ```

5. Create introspection script to verify schema matches existing DB
   ```bash
   npx prisma db pull --schema=./prisma/schema-temp.prisma
   ```

6. Create adapter layer for DatabasePool + Prisma coexistence
   ```javascript
   // src/database/prisma-pool-adapter.js
   import { PrismaClient } from '@prisma/client';
   import { PrismaSQLite } from '@prisma/adapter-sqlite';
   import { DatabasePool } from '../utils/database-pool.js';

   export class PrismaPoolAdapter {
     constructor(dbPath, poolOptions = {}) {
       this.pool = new DatabasePool(dbPath, poolOptions);

       // Create Prisma client with custom driver adapter
       const adapter = new PrismaSQLite(this.pool);
       this.prisma = new PrismaClient({ adapter });
     }

     async execute(fn) {
       return this.pool.execute((db) => fn(this.prisma));
     }

     async cleanup() {
       await this.prisma.$disconnect();
       await this.pool.cleanup();
     }
   }
   ```

**Deliverable**: ORM installed, schema defined, can run in parallel with existing code

---

### Phase 2: Incremental Module Migration (Week 2-4)

**Goal**: Migrate low-risk modules first, validate performance

**Migration Order** (from lowest to highest risk):

#### 2.1 SelectionStore (Low Risk)
- Standalone module
- No complex relations
- High read/write volume (good for benchmarking)

**Before** (`src/selection-store.js`):
```javascript
export async function saveSelection({ url, title, selected_text, source = 'browser' }) {
  return pool.execute((db) => {
    const insertStmt = db.prepare(`
      INSERT INTO selections (url, title, selected_text, source)
      VALUES (@url, @title, @selected_text, @source)
    `);
    const result = insertStmt.run({ url, title, selected_text, source });
    return result.lastInsertRowid;
  });
}
```

**After** (`src/selection-store-orm.js`):
```javascript
import { prisma } from './database/prisma-client.js';

export async function saveSelection({ url, title, selected_text, source = 'browser' }) {
  const selection = await prisma.selection.create({
    data: {
      url: url.slice(0, 2048),
      title: title ? title.slice(0, 512) : null,
      selectedText: selected_text.slice(0, 100000),
      source: source.slice(0, 64)
    }
  });
  return selection.id;
}

export async function getLatestSelections(limit = 10) {
  return prisma.selection.findMany({
    take: Math.min(limit, 1000),
    orderBy: { createdAt: 'desc' }
  });
}

export async function searchSelections(query, limit = 50) {
  return prisma.selection.findMany({
    where: {
      OR: [
        { selectedText: { contains: query } },
        { title: { contains: query } },
        { url: { contains: query } }
      ]
    },
    take: Math.min(limit, 1000),
    orderBy: { createdAt: 'desc' }
  });
}
```

**Performance Comparison**:
```javascript
// benchmark/selection-store-benchmark.js
import Benchmark from 'benchmark';
import * as rawSQL from '../src/selection-store.js';
import * as ormSQL from '../src/selection-store-orm.js';

const suite = new Benchmark.Suite();

suite
  .add('Raw SQL Insert', async () => {
    await rawSQL.saveSelection({
      url: 'https://example.com',
      title: 'Test',
      selected_text: 'Sample text'.repeat(100),
      source: 'benchmark'
    });
  })
  .add('Prisma ORM Insert', async () => {
    await ormSQL.saveSelection({
      url: 'https://example.com',
      title: 'Test',
      selected_text: 'Sample text'.repeat(100),
      source: 'benchmark'
    });
  })
  .add('Raw SQL Search', async () => {
    await rawSQL.searchSelections('example', 50);
  })
  .add('Prisma ORM Search', async () => {
    await ormSQL.searchSelections('example', 50);
  })
  .on('cycle', event => console.log(String(event.target)))
  .on('complete', function() {
    console.log('Fastest is ' + this.filter('fastest').map('name'));
  })
  .run({ async: true });
```

**Acceptance Criteria**:
- ORM performance within 20% of raw SQL
- All existing tests pass
- No functional regressions

---

#### 2.2 Session Manager (Medium Risk)
- Core coordination component
- Foreign key relationships with locks
- Requires transaction support

**Before** (`src/session-manager.js`):
```javascript
register() {
  this.sessionId = uuidv4();
  const now = Date.now();

  const stmt = this.db.prepare(`
    INSERT INTO sessions (id, pid, start_time, last_heartbeat, status, cwd)
    VALUES (?, ?, ?, ?, 'active', ?)
  `);
  stmt.run(this.sessionId, process.pid, now, now, process.cwd());

  this.heartbeatInterval = setInterval(() => this.heartbeat(), 5000);
  return this.sessionId;
}
```

**After** (`src/session-manager-orm.js`):
```javascript
import { prisma } from './database/prisma-client.js';
import { v4 as uuidv4 } from 'uuid';

async register() {
  this.sessionId = uuidv4();
  const now = Date.now();

  await prisma.session.create({
    data: {
      id: this.sessionId,
      pid: process.pid,
      startTime: now,
      lastHeartbeat: now,
      status: 'active',
      cwd: process.cwd()
    }
  });

  this.heartbeatInterval = setInterval(() => this.heartbeat(), 5000);
  return this.sessionId;
}

async heartbeat() {
  if (!this.sessionId) return;

  await prisma.$transaction([
    // Update heartbeat
    prisma.session.update({
      where: { id: this.sessionId },
      data: { lastHeartbeat: Date.now() }
    }),

    // Cleanup stale sessions
    prisma.session.updateMany({
      where: {
        lastHeartbeat: { lt: Date.now() - 30000 },
        status: 'active'
      },
      data: { status: 'stale' }
    }),

    // Release locks from stale sessions
    prisma.lock.deleteMany({
      where: {
        session: {
          status: 'stale'
        }
      }
    })
  ]);
}
```

**Transaction Pattern**:
```javascript
// Complex multi-step operation
async killSession(sessionId) {
  return prisma.$transaction(async (tx) => {
    // Delete all locks first
    await tx.lock.deleteMany({
      where: { sessionId }
    });

    // Update session status
    await tx.session.update({
      where: { id: sessionId },
      data: { status: 'killed' }
    });

    // Get PID for process termination
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      select: { pid: true }
    });

    if (session) {
      try {
        process.kill(session.pid, 'SIGTERM');
        return true;
      } catch (err) {
        return false;
      }
    }
    return false;
  });
}
```

---

#### 2.3 Lock Manager (High Risk)
- Critical for concurrency control
- Performance-sensitive (sub-100ms latency required)
- Complex query patterns

**Hybrid Approach** (ORM + Raw SQL for hot paths):

```javascript
// src/lock-manager-orm.js
import { prisma } from './database/prisma-client.js';
import { Prisma } from '@prisma/client';

class LockManager {
  async acquireLock(resourcePath, lockType = 'write', timeout = 5000) {
    const sessionId = this.sessionManager.getCurrentSessionId();
    if (!sessionId) {
      throw new Error('Session not registered');
    }

    // Check existing lock (fast path with ORM)
    const existingLock = this.locks.get(resourcePath);
    if (existingLock?.type === 'write' || lockType === 'write') {
      return existingLock;
    }

    // Acquire lock (use raw SQL for performance-critical path)
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        // Use raw query for atomic lock acquisition
        const result = await prisma.$executeRaw`
          INSERT INTO locks (resource_path, session_id, acquired_at, lock_type)
          SELECT ${resourcePath}, ${sessionId}, ${Date.now()}, ${lockType}
          WHERE NOT EXISTS (
            SELECT 1 FROM locks
            WHERE resource_path = ${resourcePath}
            AND (lock_type = 'write' OR ${lockType} = 'write')
          )
        `;

        if (result > 0) {
          // Fetch the created lock with ORM for type safety
          const lock = await prisma.lock.findFirst({
            where: { resourcePath, sessionId },
            orderBy: { acquiredAt: 'desc' }
          });

          this.locks.set(resourcePath, lock);
          return lock;
        }
      } catch (err) {
        if (!err.message.includes('UNIQUE constraint')) {
          throw err;
        }
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Timeout - use ORM for diagnostics
    const lockHolder = await prisma.lock.findFirst({
      where: { resourcePath },
      include: { session: true },
      orderBy: { acquiredAt: 'desc' }
    });

    throw new Error(
      `Timeout acquiring lock for ${resourcePath}. ` +
      `Lock held by session: ${lockHolder?.session.id} (PID: ${lockHolder?.session.pid})`
    );
  }

  async releaseLock(resourcePath) {
    const sessionId = this.sessionManager.getCurrentSessionId();

    await prisma.lock.deleteMany({
      where: {
        resourcePath,
        sessionId
      }
    });

    this.locks.delete(resourcePath);
  }

  async getLockInfo(resourcePath) {
    return prisma.lock.findFirst({
      where: { resourcePath },
      include: {
        session: {
          select: { id: true, pid: true, status: true }
        }
      },
      orderBy: { acquiredAt: 'desc' }
    });
  }
}
```

---

### Phase 3: Integration Testing & Performance Validation (Week 4-5)

**Test Strategy**:

1. **Functional Parity Tests**
   ```javascript
   // tests/orm-migration/session-manager-parity.test.js
   import { describe, it, before, after } from 'node:test';
   import assert from 'node:assert/strict';
   import SessionManagerOld from '../src/session-manager.js';
   import SessionManagerORM from '../src/session-manager-orm.js';

   describe('SessionManager ORM Parity', () => {
     let oldManager, ormManager;

     before(async () => {
       oldManager = new SessionManagerOld(':memory:');
       ormManager = new SessionManagerORM(':memory:');
     });

     it('should register sessions identically', async () => {
       const id1 = oldManager.register();
       const id2 = await ormManager.register();

       const session1 = oldManager.getSessionInfo();
       const session2 = await ormManager.getSessionInfo();

       assert.equal(session1.pid, session2.pid);
       assert.equal(session1.status, session2.status);
     });

     after(async () => {
       await oldManager.cleanup();
       await ormManager.cleanup();
     });
   });
   ```

2. **Performance Benchmarks**
   ```javascript
   // benchmark/orm-performance-suite.js
   import { performance } from 'perf_hooks';

   async function benchmarkOperation(name, operation, iterations = 1000) {
     const start = performance.now();
     for (let i = 0; i < iterations; i++) {
       await operation();
     }
     const duration = performance.now() - start;
     const avg = duration / iterations;

     console.log(`${name}: ${avg.toFixed(2)}ms avg (${iterations} iterations)`);
     return avg;
   }

   // Run benchmarks
   const results = {
     raw: {
       insert: await benchmarkOperation('Raw SQL Insert', () => rawSQL.saveSelection(...)),
       query: await benchmarkOperation('Raw SQL Query', () => rawSQL.getLatestSelections(10)),
       search: await benchmarkOperation('Raw SQL Search', () => rawSQL.searchSelections('test'))
     },
     orm: {
       insert: await benchmarkOperation('ORM Insert', () => ormSQL.saveSelection(...)),
       query: await benchmarkOperation('ORM Query', () => ormSQL.getLatestSelections(10)),
       search: await benchmarkOperation('ORM Search', () => ormSQL.searchSelections('test'))
     }
   };

   // Performance regression check
   const threshold = 1.2; // 20% acceptable degradation
   for (const [operation, rawTime] of Object.entries(results.raw)) {
     const ormTime = results.orm[operation];
     const ratio = ormTime / rawTime;

     if (ratio > threshold) {
       console.error(`FAIL: ${operation} - ORM is ${((ratio - 1) * 100).toFixed(1)}% slower`);
       process.exit(1);
     } else {
       console.log(`PASS: ${operation} - ORM within ${((ratio - 1) * 100).toFixed(1)}% of raw SQL`);
     }
   }
   ```

3. **Load Testing**
   ```javascript
   // tests/load/orm-concurrent-load.test.js
   import { describe, it } from 'node:test';
   import assert from 'node:assert/strict';

   describe('ORM Concurrent Load Test', () => {
     it('should handle 100 concurrent session registrations', async () => {
       const managers = Array(100).fill(null).map(() => new SessionManagerORM());

       const startTime = Date.now();
       const sessionIds = await Promise.all(
         managers.map(m => m.register())
       );
       const duration = Date.now() - startTime;

       assert.equal(sessionIds.length, 100);
       assert.equal(new Set(sessionIds).size, 100); // All unique
       assert.ok(duration < 5000, `Took too long: ${duration}ms`);

       // Cleanup
       await Promise.all(managers.map(m => m.cleanup()));
     });
   });
   ```

**Performance Targets** (must meet all):
- Single insert: <5ms (raw SQL: ~2ms)
- Simple query: <3ms (raw SQL: ~1ms)
- Search query: <15ms (raw SQL: ~8ms)
- 100 concurrent operations: <5 seconds total
- Memory overhead: <10MB additional

---

### Phase 4: Rollout & Backward Compatibility (Week 5-6)

**Feature Flag System**:

```javascript
// src/config/feature-flags.js
export const FEATURE_FLAGS = {
  USE_ORM: process.env.ENABLE_ORM === 'true' || false,
  ORM_MODULE_SELECTION_STORE: process.env.ORM_SELECTION_STORE === 'true',
  ORM_MODULE_SESSION_MANAGER: process.env.ORM_SESSION_MANAGER === 'true',
  ORM_MODULE_LOCK_MANAGER: process.env.ORM_LOCK_MANAGER === 'true'
};
```

**Compatibility Layer**:

```javascript
// src/database/db-abstraction.js
import { FEATURE_FLAGS } from '../config/feature-flags.js';

export function getSelectionStore() {
  if (FEATURE_FLAGS.ORM_MODULE_SELECTION_STORE) {
    return import('./selection-store-orm.js');
  }
  return import('./selection-store.js');
}

export function getSessionManager() {
  if (FEATURE_FLAGS.ORM_MODULE_SESSION_MANAGER) {
    return import('./session-manager-orm.js');
  }
  return import('./session-manager.js');
}

// Usage in application code
const SelectionStore = await getSelectionStore();
await SelectionStore.saveSelection({ ... });
```

**Gradual Rollout Plan**:

Week 5:
- Day 1-2: Enable ORM for SelectionStore only (10% traffic)
- Day 3-4: Monitor metrics, increase to 50% traffic
- Day 5: Full rollout for SelectionStore if metrics green

Week 6:
- Day 1-3: Enable SessionManager ORM (25% → 100%)
- Day 4-7: Enable LockManager ORM (25% → 100%)

**Rollback Plan**:
```bash
# Emergency rollback
export ENABLE_ORM=false
npm restart
```

---

## 4. Performance Comparison

### Estimated Benchmarks

Based on industry benchmarks and Prisma performance data:

| Operation | Raw SQL (better-sqlite3) | Prisma ORM | Overhead |
|-----------|-------------------------|------------|----------|
| **Simple Insert** | 2ms | 3-4ms | +50-100% |
| **Prepared Statement Insert** | 0.5ms | 1.5ms | +200% |
| **Single Row Select** | 1ms | 2ms | +100% |
| **Indexed Search (10 rows)** | 5ms | 7-10ms | +40-100% |
| **Complex Join (3 tables)** | 8ms | 12-15ms | +50-87% |
| **Bulk Insert (100 rows)** | 20ms | 25-35ms | +25-75% |
| **Transaction (5 operations)** | 10ms | 15-20ms | +50-100% |
| **Connection Acquisition** | <1ms (pooled) | <1ms (pooled) | ~0% |

**Why the overhead?**:
1. **Abstraction Layer**: ORM adds validation, type checking, query building
2. **Object Hydration**: Converting DB rows to JS objects
3. **Relation Resolution**: Lazy/eager loading of associations

**Mitigation Strategies**:
1. Use `prisma.$executeRaw` for hot paths (retains 90% of raw speed)
2. Enable Prisma query caching for repeated queries
3. Use `select` to fetch only needed fields
4. Batch operations with `createMany` / `updateMany`
5. Profile with `prisma.$queryRaw` debug logging

**Real-World Performance Test** (Recommended):

```javascript
// Run actual benchmark on target hardware
npm run benchmark:orm

// Expected output:
// ==========================================
// ORM Performance Benchmark Report
// ==========================================
// Environment: Node 18.20.0, SQLite 3.45.0
// Dataset: 10,000 selections, 100 sessions
// ==========================================
//
// SelectionStore.saveSelection (1000x):
//   Raw SQL:    2.1ms avg
//   Prisma ORM: 3.8ms avg
//   Overhead:   +81%   ✅ PASS (< 100%)
//
// SessionManager.register (1000x):
//   Raw SQL:    1.5ms avg
//   Prisma ORM: 2.9ms avg
//   Overhead:   +93%   ✅ PASS (< 100%)
//
// LockManager.acquireLock (1000x):
//   Raw SQL:    4.2ms avg
//   Prisma ORM: 5.1ms avg
//   Overhead:   +21%   ✅ PASS (< 50%)
//
// ==========================================
// VERDICT: ORM performance acceptable ✅
// ==========================================
```

---

## 5. Code Examples

### Example 1: Complex Query with Relations

**Before (Raw SQL)**:
```javascript
getSessionInfo(sessionId) {
  const session = this.db.prepare(`
    SELECT * FROM sessions WHERE id = ?
  `).get(sessionId || this.sessionId);

  if (!session) return null;

  const locks = this.db.prepare(`
    SELECT resource_path, lock_type, acquired_at
    FROM locks
    WHERE session_id = ?
  `).all(session.id);

  return { ...session, locks };
}
```

**After (Prisma ORM)**:
```javascript
async getSessionInfo(sessionId) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId || this.sessionId },
    include: {
      locks: {
        select: {
          resourcePath: true,
          lockType: true,
          acquiredAt: true
        }
      }
    }
  });

  return session;
}
```

**Benefits**:
- Automatic JOIN handling
- Type-safe result (TypeScript knows structure)
- No manual object merging
- Single query (N+1 prevention)

---

### Example 2: Bulk Operations

**Before**:
```javascript
async cleanupStaleSessions() {
  const staleThreshold = Date.now() - 30000;

  const staleSessions = this.db.prepare(`
    SELECT id FROM sessions
    WHERE last_heartbeat < ? AND status = 'active'
  `).all(staleThreshold);

  for (const session of staleSessions) {
    this.db.prepare(`UPDATE sessions SET status = 'stale' WHERE id = ?`).run(session.id);
    this.db.prepare(`DELETE FROM locks WHERE session_id = ?`).run(session.id);
  }
}
```

**After**:
```javascript
async cleanupStaleSessions() {
  const staleThreshold = Date.now() - 30000;

  await prisma.$transaction([
    // Update sessions
    prisma.session.updateMany({
      where: {
        lastHeartbeat: { lt: staleThreshold },
        status: 'active'
      },
      data: { status: 'stale' }
    }),

    // Delete associated locks (cascade)
    prisma.lock.deleteMany({
      where: {
        session: {
          lastHeartbeat: { lt: staleThreshold }
        }
      }
    })
  ]);
}
```

**Benefits**:
- Single transaction (atomic)
- No N+1 queries (updateMany is a single SQL statement)
- Clearer intent

---

### Example 3: Migration to PostgreSQL (Future)

**Current Schema** (SQLite):
```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

**Future Schema** (PostgreSQL):
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Session {
  id            String   @id @default(uuid()) @db.Uuid
  pid           Int
  startTime     DateTime @default(now()) @db.Timestamptz
  lastHeartbeat DateTime @updatedAt @db.Timestamptz
  status        String   @default("active")
  currentTask   String?  @db.Text
  cwd           String?  @db.VarChar(512)

  locks         Lock[]

  @@index([status])
}
```

**Migration Command**:
```bash
# 1. Update .env
DATABASE_URL="postgresql://user:pass@localhost:5432/llm_framework"

# 2. Generate migration
npx prisma migrate dev --name switch_to_postgresql

# 3. No application code changes needed! (if using Prisma)
```

---

## 6. Backward Compatibility Strategy

### Dual-Mode Operation

**Pattern**: Run ORM and raw SQL in parallel during transition

```javascript
// src/database/dual-mode-session-manager.js
import SessionManagerOld from './session-manager.js';
import SessionManagerORM from './session-manager-orm.js';
import { logger } from './utils/logger.js';

export class DualModeSessionManager {
  constructor(dbPath) {
    this.oldManager = new SessionManagerOld(dbPath);
    this.ormManager = new SessionManagerORM(dbPath);
    this.useORM = process.env.ENABLE_ORM === 'true';
  }

  async register() {
    if (this.useORM) {
      try {
        const result = await this.ormManager.register();

        // Verify against old implementation (during transition)
        const oldResult = this.oldManager.register();
        if (result !== oldResult) {
          logger.warn('ORM/SQL mismatch in register()', { result, oldResult });
        }

        return result;
      } catch (error) {
        logger.error('ORM register() failed, falling back to SQL', { error });
        return this.oldManager.register();
      }
    }
    return this.oldManager.register();
  }

  async cleanup() {
    if (this.useORM) {
      await this.ormManager.cleanup();
    }
    await this.oldManager.cleanup();
  }
}
```

### Data Consistency Checks

```javascript
// scripts/verify-orm-consistency.js
import { prisma } from './src/database/prisma-client.js';
import SessionManager from './src/session-manager.js';

async function verifyDataConsistency() {
  const sqlManager = new SessionManager();

  // Compare counts
  const ormCount = await prisma.session.count();
  const sqlCount = sqlManager.db.prepare('SELECT COUNT(*) as count FROM sessions').get().count;

  if (ormCount !== sqlCount) {
    throw new Error(`Data mismatch: ORM=${ormCount}, SQL=${sqlCount}`);
  }

  // Compare actual data
  const ormSessions = await prisma.session.findMany();
  const sqlSessions = sqlManager.db.prepare('SELECT * FROM sessions').all();

  for (const ormSession of ormSessions) {
    const sqlSession = sqlSessions.find(s => s.id === ormSession.id);
    if (!sqlSession) {
      throw new Error(`Session ${ormSession.id} exists in ORM but not SQL`);
    }

    // Deep equality check
    assert.deepEqual(
      { ...ormSession, locks: undefined },
      sqlSession,
      `Session ${ormSession.id} data mismatch`
    );
  }

  console.log('✅ Data consistency verified');
}

verifyDataConsistency().catch(console.error);
```

### Rollback Procedure

1. **Detect Issues**:
   - Monitor error rates in production logs
   - Alert on performance degradation >20%
   - Check data consistency every 5 minutes

2. **Execute Rollback**:
   ```bash
   # Stop services
   npm run system:stop

   # Disable ORM
   export ENABLE_ORM=false
   echo "ENABLE_ORM=false" >> .env

   # Restart with old code
   npm run system:start

   # Verify rollback
   npm run health:check
   ```

3. **Post-Rollback Analysis**:
   ```javascript
   // scripts/analyze-orm-failure.js
   import { logger } from './src/utils/logger.js';

   async function analyzeFailure() {
     // Parse logs for errors
     const errors = await logger.query({
       level: 'error',
       from: new Date(Date.now() - 3600000), // Last hour
       until: new Date(),
       fields: ['message', 'meta'],
       limit: 1000
     });

     // Group by error type
     const errorTypes = {};
     for (const error of errors) {
       const type = error.message.split(':')[0];
       errorTypes[type] = (errorTypes[type] || 0) + 1;
     }

     console.log('Error Distribution:', errorTypes);

     // Identify root cause
     const ormErrors = errors.filter(e =>
       e.message.includes('Prisma') || e.meta?.orm === true
     );

     console.log(`ORM-specific errors: ${ormErrors.length}`);
     console.log('Sample errors:', ormErrors.slice(0, 5));
   }

   analyzeFailure();
   ```

---

## 7. Implementation Checklist

### Pre-Implementation
- [ ] Review and approve this design document
- [ ] Set up dedicated test environment (isolated SQLite DB)
- [ ] Create feature branch: `feat/orm-integration`
- [ ] Install dependencies: `npm install prisma @prisma/client`
- [ ] Initialize Prisma: `npx prisma init`

### Week 1-2: Setup
- [ ] Define Prisma schema matching existing tables
- [ ] Generate Prisma Client: `npx prisma generate`
- [ ] Introspect existing database: `npx prisma db pull`
- [ ] Create database abstraction layer (`src/database/db-abstraction.js`)
- [ ] Set up feature flags system
- [ ] Create benchmark harness (`benchmark/orm-performance-suite.js`)

### Week 2-3: SelectionStore Migration
- [ ] Implement `src/selection-store-orm.js` with Prisma
- [ ] Create parity tests (functional equivalence)
- [ ] Run performance benchmarks
- [ ] Enable in dev environment (feature flag)
- [ ] Monitor for 48 hours
- [ ] Full rollout if metrics green

### Week 3-4: SessionManager Migration
- [ ] Implement `src/session-manager-orm.js`
- [ ] Handle transactions for complex operations
- [ ] Test concurrent session registration (load test)
- [ ] Verify heartbeat/cleanup logic
- [ ] Gradual rollout (25% → 50% → 100%)

### Week 4-5: LockManager Migration
- [ ] Implement `src/lock-manager-orm.js`
- [ ] Use hybrid approach (ORM + raw SQL for critical paths)
- [ ] Test lock acquisition under contention
- [ ] Verify timeout and error handling
- [ ] Performance validation (<100ms lock acquisition)
- [ ] Gradual rollout

### Week 5-6: Validation & Cleanup
- [ ] Run full integration test suite
- [ ] Performance regression tests (all modules)
- [ ] Data consistency verification script
- [ ] Load testing (1000 concurrent operations)
- [ ] Remove feature flags (make ORM default)
- [ ] Delete old raw SQL implementations
- [ ] Update documentation

### Post-Implementation
- [ ] Monitor production metrics for 2 weeks
- [ ] Create runbook for ORM troubleshooting
- [ ] Train team on Prisma best practices
- [ ] Plan future migrations (PostgreSQL support)

---

## 8. Risk Mitigation

### Risk 1: Performance Degradation
**Likelihood**: Medium
**Impact**: High
**Mitigation**:
- Comprehensive benchmarking before rollout
- Performance budgets (max +20% overhead)
- Hybrid approach (raw SQL for hot paths)
- Caching layer for frequent queries
- Monitor P95/P99 latencies in production

### Risk 2: Data Inconsistency
**Likelihood**: Low
**Impact**: Critical
**Mitigation**:
- Dual-mode operation during transition
- Automated consistency checks every 5 minutes
- Transaction support for multi-step operations
- Rollback plan tested in staging

### Risk 3: Learning Curve
**Likelihood**: Medium
**Impact**: Medium
**Mitigation**:
- Prisma is more intuitive than raw SQL
- Excellent documentation and VSCode integration
- Code examples in this document
- Pair programming during implementation

### Risk 4: Library Lock-in
**Likelihood**: Low
**Impact**: Medium
**Mitigation**:
- Prisma has strong community (37k+ stars)
- Database abstraction layer enables swap
- TypeORM as fallback option
- PostgreSQL migration path proven

---

## 9. Success Metrics

**Technical Metrics**:
- Code reduction: -30% lines of code (less SQL strings)
- Type safety: 100% of database operations type-checked
- Test coverage: Maintain >90% coverage
- Performance: <20% overhead vs raw SQL
- Bugs: <5 ORM-related bugs in first 3 months

**Developer Experience**:
- Onboarding time: -50% for new developers (Prisma Studio + docs)
- Query debugging: -40% time (Prisma query logs)
- Schema changes: 5 minutes (vs 30 minutes manual SQL)

**Operational Metrics**:
- Zero downtime during migration
- No data loss or corruption
- Rollback capability maintained throughout

---

## 10. Future Enhancements

### Phase 2 (3-6 months post-ORM)
1. **PostgreSQL Migration**
   - Use Prisma's multi-provider support
   - Migrate high-volume tables first (selections)
   - Keep SQLite for local development

2. **Multi-Database Support**
   - Primary: PostgreSQL (production data)
   - Cache: Redis (hot data)
   - Logs: TimescaleDB (time-series)

3. **Advanced ORM Features**
   - Full-text search with Prisma extensions
   - Real-time subscriptions (Prisma Pulse)
   - Edge deployments (Prisma Accelerate)

### Phase 3 (6-12 months)
1. **GraphQL API Layer**
   - Auto-generate GraphQL schema from Prisma models
   - Use Nexus or Pothos for type-safe resolvers

2. **Admin Dashboard**
   - Prisma Studio for database visualization
   - Custom admin UI with real-time updates

3. **Microservices Architecture**
   - Shared Prisma schema across services
   - Event-driven sync with Prisma subscriptions

---

## Appendices

### A. Installation Commands

```bash
# Install Prisma
npm install prisma @prisma/client

# Development tools
npm install -D prisma

# Initialize Prisma
npx prisma init --datasource-provider sqlite

# Generate Prisma Client
npx prisma generate

# Create migration
npx prisma migrate dev --name init

# Introspect existing database
npx prisma db pull

# Reset database (dev only)
npx prisma migrate reset

# Open Prisma Studio (database GUI)
npx prisma studio
```

### B. Environment Variables

```bash
# .env.example
DATABASE_URL="file:./data/llm-framework.db"
ENABLE_ORM=false
ORM_SELECTION_STORE=false
ORM_SESSION_MANAGER=false
ORM_LOCK_MANAGER=false
PRISMA_LOG_LEVEL=info
```

### C. TypeScript Configuration (Optional)

```json
// tsconfig.json (if adding TypeScript)
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### D. Useful Prisma Commands

```bash
# Format schema
npx prisma format

# Validate schema
npx prisma validate

# Generate migration without applying
npx prisma migrate dev --create-only

# Deploy migrations to production
npx prisma migrate deploy

# Seed database
npx prisma db seed
```

---

## Conclusion

**Recommendation**: Proceed with Prisma ORM integration using incremental rollout strategy.

**Key Advantages**:
1. Type-safe database operations (prevent runtime errors)
2. Automatic migrations (reduce manual SQL)
3. Better developer experience (Prisma Studio, VSCode integration)
4. Future-proof architecture (PostgreSQL migration path)
5. Maintainable codebase (-30% code reduction)

**Timeline**: 6 weeks from approval to full production rollout

**Budget**: ~80 hours engineering time (2 developers × 4 weeks)

**Risk**: Medium (mitigated by feature flags, dual-mode operation, comprehensive testing)

**ROI**: High (faster development, fewer bugs, easier onboarding)

---

**Document Version**: 1.0
**Author**: Claude Code (DevOps Specialist)
**Date**: 2025-10-20
**Status**: Ready for Review
