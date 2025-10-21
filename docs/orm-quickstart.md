# ORM Integration - Quick Start Guide

## 5-Minute Setup

### Step 1: Install Prisma

```bash
npm install prisma @prisma/client
npm install -D prisma
```

### Step 2: Initialize Prisma

```bash
npx prisma init --datasource-provider sqlite
```

This creates:
- `prisma/schema.prisma` - Database schema
- `.env` - Environment variables (add DATABASE_URL)

### Step 3: Configure Database URL

Edit `.env`:

```bash
DATABASE_URL="file:./data/llm-framework.db"
```

### Step 4: Use Existing Schema

Copy the provided schema (already created at `C:\Users\scarm\prisma\schema.prisma`):

```bash
# Schema is ready - no changes needed
```

### Step 5: Generate Prisma Client

```bash
npx prisma generate
```

This creates TypeScript types and the Prisma client.

### Step 6: Test Installation

```bash
node examples/orm-migration-demo.js
```

Expected output:
```
=== Example 1: Simple CRUD Operations ===
Raw SQL Insert: 2.1ms
Prisma ORM Insert: 3.8ms
ORM Overhead: +81%
```

---

## Running Benchmarks

### Full Performance Test

```bash
node scripts/benchmark-orm-performance.js
```

Expected runtime: 30-60 seconds

Expected output:
```
==========================================
  ORM Performance Benchmark Summary
==========================================

Environment:
  Node.js:    v18.20.0
  SQLite:     3.45.0
  Database:   data/benchmark.db
  WAL Mode:   wal

✓ Simple Insert: +85% overhead (threshold: 100%)
✓ Complex Query: +92% overhead (threshold: 100%)
✓ Search Query: +67% overhead (threshold: 100%)
✓ Bulk Insert: +43% overhead (threshold: 75%)
✓ Transaction: +78% overhead (threshold: 100%)

==========================================
VERDICT: ORM performance acceptable ✓
==========================================
```

---

## Gradual Rollout

### Phase 1: SelectionStore (Week 1)

Enable ORM for SelectionStore only:

```bash
# .env
ENABLE_ORM=true
ORM_SELECTION_STORE=true
ORM_SESSION_MANAGER=false
ORM_LOCK_MANAGER=false
```

Restart and monitor:

```bash
npm run system:restart
npm run health:check
```

### Phase 2: SessionManager (Week 2)

```bash
# .env
ENABLE_ORM=true
ORM_SELECTION_STORE=true
ORM_SESSION_MANAGER=true
ORM_LOCK_MANAGER=false
```

### Phase 3: LockManager (Week 3)

```bash
# .env
ENABLE_ORM=true
ORM_SELECTION_STORE=true
ORM_SESSION_MANAGER=true
ORM_LOCK_MANAGER=true
```

### Phase 4: Full Rollout (Week 4)

Remove module flags (all modules use ORM):

```bash
# .env
ENABLE_ORM=true
```

---

## Percentage-Based Rollout (A/B Testing)

Gradually increase ORM usage:

```bash
# 10% of requests use ORM
ENABLE_ORM=true
ORM_ROLLOUT_PERCENTAGE=10

# Monitor for 24 hours, then increase
ORM_ROLLOUT_PERCENTAGE=25

# Continue increasing: 50, 75, 100
```

---

## Rollback Procedure

If issues detected:

```bash
# 1. Immediate rollback
export ENABLE_ORM=false

# 2. Restart services
npm run system:restart

# 3. Verify health
npm run health:check

# 4. Check logs
npm run log:errors
```

---

## Debug Mode

Enable verbose logging:

```bash
# .env
ENABLE_ORM=true
ORM_DEBUG=true
PRISMA_LOG_LEVEL=info
```

View logs:

```bash
tail -f logs/combined.log | grep -i prisma
```

---

## Database Migrations

### Create Migration

```bash
npx prisma migrate dev --name add_user_table
```

### Apply Migrations (Production)

```bash
npx prisma migrate deploy
```

### Reset Database (Development Only)

```bash
npx prisma migrate reset
```

---

## Database GUI

Open Prisma Studio (web-based DB viewer):

```bash
npx prisma studio
```

Opens at `http://localhost:5555`

Features:
- View all tables
- Edit data
- Run queries
- Schema visualization

---

## Common Issues

### Issue: "PrismaClient not found"

**Solution**:
```bash
npx prisma generate
```

### Issue: "Can't reach database server"

**Solution**:
Check DATABASE_URL in `.env`:
```bash
echo $DATABASE_URL
# Should output: file:./data/llm-framework.db
```

### Issue: "Migration failed"

**Solution**:
```bash
# Check migration status
npx prisma migrate status

# Resolve manually
npx prisma migrate resolve --applied 20250120000000_migration_name
```

### Issue: Performance degradation

**Solution**:
1. Check logs: `npm run log:analyze`
2. Run benchmark: `node scripts/benchmark-orm-performance.js`
3. Use hybrid approach (raw SQL for hot paths)
4. Rollback if needed: `ENABLE_ORM=false`

---

## Useful Commands

```bash
# Show current feature flag status
node -e "import('./src/config/feature-flags.js').then(m => console.log(m.getFeatureFlagStatus()))"

# Count database records
npx prisma db execute --stdin <<< "SELECT COUNT(*) FROM sessions;"

# Introspect existing database
npx prisma db pull

# Validate schema
npx prisma validate

# Format schema file
npx prisma format
```

---

## Code Examples

### Simple Query

```javascript
import { prisma } from './src/database/prisma-client.js';

// Get all active sessions
const sessions = await prisma.session.findMany({
  where: { status: 'active' },
  include: { locks: true }
});

console.log(`Active sessions: ${sessions.length}`);
```

### Create Record

```javascript
const session = await prisma.session.create({
  data: {
    id: 'new-session',
    pid: process.pid,
    startTime: Date.now(),
    lastHeartbeat: Date.now(),
    status: 'active',
    cwd: process.cwd()
  }
});
```

### Update Record

```javascript
await prisma.session.update({
  where: { id: 'session-id' },
  data: { lastHeartbeat: Date.now() }
});
```

### Delete Record

```javascript
await prisma.session.delete({
  where: { id: 'session-id' }
});
```

### Transaction

```javascript
await prisma.$transaction([
  prisma.session.update({
    where: { id: 'session-1' },
    data: { status: 'inactive' }
  }),
  prisma.lock.deleteMany({
    where: { sessionId: 'session-1' }
  })
]);
```

### Raw SQL (Escape Hatch)

```javascript
// For complex queries ORM can't handle
const result = await prisma.$queryRaw`
  SELECT s.*, COUNT(l.id) as lock_count
  FROM sessions s
  LEFT JOIN locks l ON s.id = l.session_id
  GROUP BY s.id
  HAVING lock_count > 5
`;
```

---

## PostgreSQL Migration (Future)

When ready to migrate to PostgreSQL:

### Step 1: Update Schema

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Session {
  id            String   @id @default(uuid()) @db.Uuid
  startTime     DateTime @default(now()) @db.Timestamptz
  // ... rest of fields
}
```

### Step 2: Update .env

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/llm_framework"
```

### Step 3: Migrate

```bash
npx prisma migrate dev --name switch_to_postgresql
```

### Step 4: Deploy

```bash
npx prisma migrate deploy
```

**Zero application code changes required!**

---

## Performance Tuning

### Enable Query Logging

```javascript
// src/database/prisma-client.js
const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'warn', emit: 'event' },
    { level: 'error', emit: 'event' }
  ]
});

prisma.$on('query', (e) => {
  console.log('Query:', e.query);
  console.log('Duration:', e.duration + 'ms');
});
```

### Use Select (Fetch Only Needed Fields)

```javascript
// BAD: Fetches all fields
const session = await prisma.session.findUnique({
  where: { id: 'session-1' }
});

// GOOD: Fetches only needed fields
const session = await prisma.session.findUnique({
  where: { id: 'session-1' },
  select: { id: true, status: true }
});
```

### Batch Queries

```javascript
// BAD: N+1 queries
for (const id of sessionIds) {
  const session = await prisma.session.findUnique({ where: { id } });
}

// GOOD: Single query
const sessions = await prisma.session.findMany({
  where: { id: { in: sessionIds } }
});
```

---

## Next Steps

1. Run examples: `node examples/orm-migration-demo.js`
2. Run benchmarks: `node scripts/benchmark-orm-performance.js`
3. Read full plan: `docs/orm-integration-plan.md`
4. Enable for one module: `ORM_SELECTION_STORE=true`
5. Monitor for 48 hours
6. Gradually enable other modules

---

## Support Resources

- Full Documentation: `docs/orm-integration-plan.md`
- Examples: `examples/orm-migration-demo.js`
- Benchmark: `scripts/benchmark-orm-performance.js`
- Prisma Docs: https://www.prisma.io/docs
- SQLite Docs: https://www.sqlite.org/docs.html

---

**Ready to start?**

```bash
npm install prisma @prisma/client
npx prisma generate
node examples/orm-migration-demo.js
```

**Questions?** Review `docs/orm-integration-plan.md` for detailed answers.
