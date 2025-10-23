

# Microsoft Learn Training Catalog Integration - User Guide

## Overview

The Microsoft Learn Training Catalog Integration provides seamless access to Microsoft's extensive training library directly within the LLM Multi-Provider Framework. This integration enables AI-powered recommendations, automated catalog synchronization, and intelligent progress tracking.

## Features

### Core Capabilities

- **Automated Catalog Sync**: Bi-daily synchronization with Microsoft Learn API (2 AM and 2 PM)
- **AI-Powered Recommendations**: Context-aware training suggestions based on your tech stack
- **Full-Text Search**: Fast SQLite FTS5 search across modules, paths, and certifications
- **Progress Tracking**: Monitor your learning journey across all Microsoft Learn content
- **Advanced Filtering**: Multi-dimensional filtering by level, product, role, and subject
- **Electron UI**: Beautiful, responsive interface for browsing the training catalog

### Technical Highlights

- **Performance**: <120ms average API latency, >75% cache hit ratio
- **Scalability**: Batch processing with 100 items/transaction, handles 10K+ modules
- **Reliability**: Exponential backoff retry logic, automatic error recovery
- **Integration**: WebSocket connection to AI Bridge for multi-agent coordination

---

## Quick Start

### Prerequisites

- Node.js 18+ installed
- LLM Framework server running
- AI Bridge active on port 65028
- Internet connection for initial sync

### Installation

```bash
# 1. Run deployment script
bash scripts/deploy-training-catalog.sh

# 2. Verify services
npm run training:status

# 3. Open Electron app
npm run start
# Navigate to Training Catalog in the UI
```

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────┐
│                   Electron UI Layer                      │
│  (training-catalog.html, CSS, JS)                       │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│                  Express API Layer                       │
│  (training-routes.js, training-controller.js)           │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────┼────────────────────────────────────────┐
│                │    Service Layer                        │
│  ┌─────────────▼──────────────┐  ┌───────────────────┐ │
│  │  TrainingSyncService       │  │  AI Bridge        │ │
│  │  (Cron: 2 AM, 2 PM daily)  │◄─┤  (Port 65028)     │ │
│  └─────────────┬──────────────┘  └───────────────────┘ │
└────────────────┼────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│            Integration Layer                             │
│  ┌────────────────────────────────────────────────────┐ │
│  │  MicrosoftLearnClient (API Wrapper)                │ │
│  │  - Retry logic (3 attempts, exponential backoff)  │ │
│  │  - 12-hour cache (node-cache)                      │ │
│  │  - Request timeout (30s)                           │ │
│  └────────────────────────────────────────────────────┘ │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│              Data Layer                                  │
│  ┌────────────────────────────────────────────────────┐ │
│  │  TrainingCatalogRepository (SQLite + better-sqlite3)│ │
│  │  - 10 tables (modules, paths, certs, exams, etc.) │ │
│  │  - FTS5 full-text search                           │ │
│  │  - Prepared statements (SQL injection safe)        │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                 │
                 ▼
        ┌────────────────────┐
        │  Microsoft Learn   │
        │  Catalog API       │
        │  (Public, No Auth) │
        └────────────────────┘
```

### Database Schema

**Core Tables:**
- `training_modules`: Module content and metadata
- `training_paths`: Learning path aggregations
- `training_certifications`: Certification information
- `training_exams`: Exam details

**Relationships:**
- `module_products`: Module-to-product mappings (many-to-many)
- `module_roles`: Module-to-role mappings
- `module_subjects`: Module-to-subject mappings
- `path_modules`: Path-to-module associations with sequence

**User Data:**
- `user_progress`: Progress tracking (0-100%)
- `sync_metadata`: Sync history and error logs

---

## API Reference

### REST Endpoints

#### GET /api/training/catalog

Retrieve training catalog with filters.

**Query Parameters:**
- `search` (string): Full-text search query
- `level` (string): `beginner`, `intermediate`, `advanced`
- `product` (string): `azure`, `github`, `dynamics-365`, etc.
- `role` (string): `developer`, `administrator`, `ai-engineer`, etc.
- `subject` (string): `app-development`, `ai`, `automation`, etc.
- `page` (number): Page number (default: 1)
- `limit` (number): Results per page (default: 50, max: 100)

**Example:**
```bash
curl "http://localhost:3000/api/training/catalog?level=beginner&product=azure&limit=10"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "uid": "module-uid-123",
      "title": "Introduction to Azure",
      "description": "Learn Azure basics...",
      "level": "beginner",
      "duration_minutes": 120,
      "url": "https://learn.microsoft.com/...",
      "products": ["azure"],
      "roles": ["developer"],
      "subjects": ["app-development"]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "hasMore": true
  }
}
```

#### GET /api/training/catalog/:uid

Get detailed module information.

**Example:**
```bash
curl "http://localhost:3000/api/training/catalog/module-uid-123"
```

#### GET /api/training/search

Full-text search across modules.

**Query Parameters:**
- `q` (string, required): Search query (min 2 chars)
- `limit` (number): Results limit (default: 50)
- `offset` (number): Results offset (default: 0)

**Example:**
```bash
curl "http://localhost:3000/api/training/search?q=machine+learning&limit=20"
```

#### POST /api/training/recommendations

Get AI-powered training recommendations.

**Request Body:**
```json
{
  "userId": "user-123",
  "skills": ["javascript", "azure", "ai"],
  "preferences": {
    "level": "intermediate",
    "limit": 10
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "recommendations": [...],
    "inProgress": [...]
  }
}
```

#### POST /api/training/progress

Track user progress for a module.

**Request Body:**
```json
{
  "userId": "user-123",
  "contentUid": "module-uid-123",
  "contentType": "module",
  "progressPercent": 75
}
```

#### POST /api/training/sync/trigger

Manually trigger catalog synchronization.

**Request Body:**
```json
{
  "syncType": "INCREMENTAL"  // or "FULL"
}
```

#### GET /api/training/sync/status

Get current sync status.

**Response:**
```json
{
  "success": true,
  "data": {
    "isRunning": true,
    "isSyncing": false,
    "cronSchedule": "0 2,14 * * *",
    "lastSync": {
      "type": "FULL",
      "timestamp": "2025-01-15T02:00:00.000Z",
      "itemsSynced": 5432
    },
    "cacheStats": {
      "keys": 15,
      "hits": 230,
      "misses": 45,
      "hitRate": "83.64%"
    }
  }
}
```

---

## Configuration

### Environment Variables

Add to `.env`:

```bash
# Training Catalog Configuration
TRAINING_DB_PATH=./data/training-catalog.db
TRAINING_SYNC_CRON=0 2,14 * * *  # 2 AM and 2 PM daily
TRAINING_SYNC_LOCALE=en-us

# AI Bridge Configuration
AI_BRIDGE_URL=ws://localhost:65028
```

### Sync Schedule

Modify cron schedule:

```javascript
// In src/services/training-sync-service.js
const CRON_SCHEDULE = '0 */6 * * *';  // Every 6 hours
```

### Cache TTL

Adjust cache duration:

```javascript
// In src/integrations/microsoft-learn-client.js
const CACHE_TTL = 6 * 60 * 60;  // 6 hours
```

---

## Usage Examples

### Electron UI

1. Launch Electron app: `npm run start`
2. Navigate to **Training Catalog** section
3. Use filters to narrow results:
   - **Level**: Beginner, Intermediate, Advanced
   - **Product**: Azure, GitHub, Dynamics 365, etc.
   - **Role**: Developer, Administrator, AI Engineer, etc.
   - **Subject**: App Development, AI, Security, etc.
4. Click on a module card to view details
5. Click "Get Recommendations" for AI-powered suggestions

### Programmatic Access

**Example: Search for Azure AI modules**

```javascript
import { TrainingCatalogRepository } from './src/database/training-catalog-repository.js';

const repo = new TrainingCatalogRepository();

const modules = repo.searchModules({
  query: 'artificial intelligence',
  product: 'azure',
  level: 'intermediate',
  limit: 10,
});

console.log(`Found ${modules.length} modules`);
modules.forEach(m => {
  console.log(`- ${m.title} (${m.duration_minutes}min)`);
});

repo.close();
```

**Example: Trigger sync and monitor progress**

```javascript
import { TrainingSyncService } from './src/services/training-sync-service.js';

const sync = new TrainingSyncService();

async function runSync() {
  console.log('Starting FULL sync...');

  const result = await sync.triggerManualSync('FULL');

  if (result.success) {
    console.log('✓ Sync completed');
    console.log(`  Duration: ${result.duration}`);
    console.log(`  Items: ${result.itemsSynced}`);
    console.log(`  Breakdown:`, result.breakdown);
  } else {
    console.error('✗ Sync failed:', result.error);
  }

  sync.shutdown();
}

runSync();
```

---

## AI Agent Integration

The Training Assistant Agent connects to the AI Bridge for intelligent recommendations.

**Agent Capabilities:**
- `recommend_training`: Suggest modules based on user context
- `analyze_skills`: Extract skills from user progress
- `track_progress`: Update user progress data
- `suggest_path`: Recommend learning paths for goals

**Message Format:**

```javascript
{
  type: 'recommend_training',
  data: {
    requestId: 'req-123',
    userContext: {
      github_repos: [{ language: 'Python', topics: ['machine-learning'] }],
      local_projects: [{ tech_stack: ['react', 'typescript'] }],
      interests: ['ai', 'cloud']
    },
    preferences: {
      level: 'intermediate',
      limit: 10
    }
  }
}
```

---

## Troubleshooting

### Issue: Sync failing with network errors

**Solution:**
1. Check internet connection
2. Verify Microsoft Learn API is accessible:
   ```bash
   curl https://learn.microsoft.com/api/catalog/
   ```
3. Check retry logic is enabled (default: 3 attempts)

### Issue: Database locked errors

**Solution:**
1. Ensure WAL mode is enabled (default)
2. Check no other processes are holding locks:
   ```bash
   lsof | grep training-catalog.db
   ```
3. Close repository connections properly:
   ```javascript
   repository.close();
   ```

### Issue: Low cache hit rate

**Solution:**
1. Increase cache TTL (default: 12 hours)
2. Monitor cache stats:
   ```bash
   curl http://localhost:3000/api/training/sync/status
   ```
3. Pre-warm cache after sync:
   ```javascript
   await client.fetchAll();
   ```

### Issue: AI Bridge connection errors

**Solution:**
1. Verify AI Bridge is running:
   ```bash
   lsof -i :65028
   ```
2. Check WebSocket connectivity:
   ```bash
   wscat -c ws://localhost:65028
   ```
3. Review agent logs for connection errors

---

## Performance Optimization

### Query Optimization

**Use prepared statements** (already implemented):
```javascript
const stmt = db.prepare('SELECT * FROM training_modules WHERE level = ?');
const results = stmt.all('beginner');
```

**Index usage**:
- Level, locale, popularity, last_modified are indexed
- FTS5 tables for full-text search

**Batch operations**:
- Default batch size: 100 items/transaction
- Adjustable in repository configuration

### Cache Strategy

**Two-tier caching**:
1. **API Cache** (node-cache): 12-hour TTL, in-memory
2. **Database** (SQLite): Persistent, FTS5 indexed

**Cache warming**:
```bash
# After sync, warm cache with common queries
curl "http://localhost:3000/api/training/catalog?level=beginner"
curl "http://localhost:3000/api/training/catalog?product=azure"
```

### Sync Optimization

**Incremental sync** (after first FULL sync):
- Only fetches content updated since last sync
- Dramatically faster than FULL sync
- Runs automatically every 12 hours

**FULL sync** (initial or manual):
- Complete catalog refresh
- Use sparingly (first run, data corruption recovery)
- Expected duration: 2-5 minutes

---

## Security Considerations

### API Security

- **No authentication required**: Microsoft Learn API is public
- **Rate limiting**: Implemented with exponential backoff
- **Input validation**: All user inputs sanitized before SQL queries
- **SQL injection**: Prepared statements prevent injection attacks

### Data Privacy

- **User progress**: Stored locally, not transmitted to Microsoft
- **Anonymous tracking**: No PII required for recommendations
- **Cache security**: In-memory cache cleared on restart

---

## Testing

### Run Test Suite

```bash
# All tests
npm test

# Specific test file
npm test tests/microsoft-learn-client.test.js

# With coverage
npm run test:coverage
```

### Manual Testing

**Test API endpoints**:
```bash
# Health check
curl http://localhost:3000/api/training/health

# Catalog query
curl "http://localhost:3000/api/training/catalog?limit=5"

# Search
curl "http://localhost:3000/api/training/search?q=azure"

# Sync status
curl http://localhost:3000/api/training/sync/status
```

**Test database**:
```bash
sqlite3 ./data/training-catalog.db "SELECT COUNT(*) FROM training_modules;"
```

---

## Roadmap

### Planned Features

- [ ] **Offline mode**: Full catalog cache for air-gapped environments
- [ ] **Learning analytics**: Visualize progress, completion rates, time tracking
- [ ] **Social features**: Share paths, compare progress with peers
- [ ] **Custom paths**: Create personalized learning paths
- [ ] **Gamification**: Badges, streaks, leaderboards
- [ ] **Multi-language**: Support for non-English locales
- [ ] **Video integration**: Embed MS Learn videos in Electron UI
- [ ] **Certification tracker**: Prep tools, practice exams

---

## Support

### Documentation

- [Microsoft Learn API Docs](https://learn.microsoft.com/api/catalog/)
- [Project CLAUDE.md](../CLAUDE.md)
- [Implementation Plan](./microsoft-learn-implementation-plan.md)

### Issues

Report bugs or request features:
- GitHub Issues: https://github.com/Scarmonit/LLM/issues
- Label: `enhancement:training-catalog`

### Contributing

Contributions welcome! See CONTRIBUTING.md for guidelines.

---

## License

ISC License - see LICENSE file for details.

---

**Last Updated**: 2025-01-15
**Version**: 1.0.0
**Maintainer**: scarmonit (scarmonit@gmail.com)
