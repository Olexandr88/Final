# LLM Marketplace

## Overview

The LLM Marketplace is a comprehensive package management system for MCP (Model Context Protocol) servers, AI agents, workflow templates, and development tools. Inspired by the Microsoft Marketplace, it provides a unified interface for discovering, installing, rating, and managing extensions for the LLM Framework.

## Features

### Core Capabilities

- **Package Discovery**: Browse and search thousands of packages across multiple categories
- **Full-Text Search**: Powered by SQLite FTS5 for fast and accurate results
- **Installation Management**: Install packages from NPM, Git repositories, local paths, or URLs
- **Rating System**: Rate packages from 1-5 stars and leave reviews
- **AI Bridge Integration**: Real-time notifications to agents via WebSocket (port 65028)
- **Electron UI**: Beautiful desktop interface for browsing and managing packages
- **REST API**: Complete HTTP API for programmatic access

### Categories

- 📧 **MCP Servers**: Model Context Protocol servers that extend AI capabilities
- 🤖 **AI Agents**: Autonomous agents for specialized tasks
- ⚙️ **Workflow Templates**: Pre-built workflows for common automation patterns
- 🛠️ **Tools & Utilities**: Development tools and utilities

## Architecture

### Components

```
marketplace/
├── database/           # SQLite database layer
│   ├── schema.sql     # Database schema with FTS5
│   └── init.js        # Database initialization
├── api/               # REST API routes
│   └── routes.js      # Express routes
├── services/          # Business logic
│   ├── marketplace-service.js  # Core marketplace operations
│   └── installation-service.js # Package installation
├── ui/                # Electron UI
│   ├── marketplace-window.js  # Window management
│   ├── preload.js            # IPC bridge
│   └── index.html            # Main UI
├── server.js          # Express server
├── ai-bridge-adapter.js  # AI Bridge integration
└── manifest.json      # Configuration

```

### Technology Stack

- **Database**: SQLite with better-sqlite3, WAL mode, FTS5 full-text search
- **Backend**: Express 5.x REST API
- **Frontend**: Electron with native HTML/CSS/JS
- **WebSocket**: ws library for AI Bridge communication
- **Integration**: AI Bridge on port 65028 (WS) / 65029 (HTTP)

## Installation

### Prerequisites

- Node.js 18+
- LLM Framework installed
- AI Bridge running (optional but recommended)

### Setup

1. **Start Marketplace Server**:

```bash
npm run marketplace:start
```

Server will start on port 65030 by default.

2. **Open Marketplace UI** (Electron):

```bash
npm run marketplace:ui
```

3. **Access REST API**:

```
http://localhost:65030/marketplace
```

## REST API

### Endpoints

#### Search Packages
```
GET /marketplace/search?q=<query>&category=<category>&rating=<min>&sort=<field>
```

**Query Parameters**:
- `q`: Search query
- `category`: Filter by category (mcp-servers, ai-agents, workflow-templates, tools-utilities)
- `rating`: Minimum rating filter
- `featured`: true/false
- `verified`: true/false
- `sort`: relevance, rating, downloads, newest, updated
- `page`: Page number (default: 1)
- `limit`: Results per page (default: 20)

**Response**:
```json
{
  "success": true,
  "data": {
    "packages": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "totalPages": 8
    }
  }
}
```

#### Get Package Details
```
GET /marketplace/package/:id?includeRatings=true
```

#### Get Featured Packages
```
GET /marketplace/featured?limit=10
```

#### Get Recent Packages
```
GET /marketplace/recent?limit=20
```

#### Get Installed Packages
```
GET /marketplace/installed?status=installed
```

#### Install Package
```
POST /marketplace/install
Content-Type: application/json

{
  "packageId": "mcp-server-example",
  "version": "1.0.0",
  "config": {}
}
```

#### Uninstall Package
```
POST /marketplace/uninstall
Content-Type: application/json

{
  "packageId": "mcp-server-example"
}
```

#### Rate Package
```
POST /marketplace/rate
Content-Type: application/json

{
  "packageId": "mcp-server-example",
  "userId": "user-123",
  "rating": 5,
  "review": "Excellent package!"
}
```

#### Get Package Statistics
```
GET /marketplace/stats/:id
```

## Database Schema

### Tables

#### packages
Stores marketplace items (MCP servers, agents, templates).

**Columns**:
- `id` TEXT PRIMARY KEY
- `name` TEXT
- `version` TEXT
- `category` TEXT (mcp-servers, ai-agents, workflow-templates, tools-utilities)
- `author` TEXT
- `description` TEXT
- `homepage` TEXT
- `repository` TEXT
- `license` TEXT
- `tags` TEXT (JSON array)
- `screenshots` TEXT (JSON array)
- `install_command` TEXT
- `install_type` TEXT (npm, git, local, url)
- `downloads` INTEGER
- `rating` REAL
- `rating_count` INTEGER
- `featured` BOOLEAN
- `verified` BOOLEAN
- `created_at` INTEGER
- `updated_at` INTEGER

#### installations
Tracks installed packages on the local system.

**Columns**:
- `id` TEXT PRIMARY KEY
- `package_id` TEXT FOREIGN KEY
- `version` TEXT
- `installed_at` INTEGER
- `install_path` TEXT
- `status` TEXT (installed, pending, failed, uninstalled)
- `error_message` TEXT
- `config` TEXT (JSON)

#### ratings
User ratings and reviews for packages.

**Columns**:
- `id` TEXT PRIMARY KEY
- `package_id` TEXT FOREIGN KEY
- `user_id` TEXT
- `rating` INTEGER (1-5)
- `review` TEXT
- `helpful_count` INTEGER
- `created_at` INTEGER
- `updated_at` INTEGER

#### download_stats
Download history for analytics.

**Columns**:
- `id` TEXT PRIMARY KEY
- `package_id` TEXT FOREIGN KEY
- `downloaded_at` INTEGER
- `user_agent` TEXT
- `ip_address` TEXT
- `version` TEXT

#### package_dependencies
Tracks dependencies between packages.

**Columns**:
- `id` TEXT PRIMARY KEY
- `package_id` TEXT FOREIGN KEY
- `dependency_id` TEXT FOREIGN KEY
- `dependency_version` TEXT
- `required` BOOLEAN

### Indexes

- Category, rating, downloads indexes for fast queries
- FTS5 full-text search index on name, description, tags, author

## AI Bridge Integration

The marketplace automatically connects to the AI Bridge WebSocket server (port 65028) and sends real-time notifications about marketplace events:

### Events

- `package.installed`: Package was installed
- `package.uninstalled`: Package was uninstalled
- `package.rated`: Package received a new rating
- `package.searched`: Search was performed

### Event Format

```json
{
  "type": "marketplace.event",
  "data": {
    "event": "package.installed",
    "packageId": "mcp-server-example",
    "version": "1.0.0",
    "installationId": "uuid-here",
    "timestamp": "2025-10-23T12:00:00.000Z"
  },
  "metadata": {
    "source": "marketplace-service"
  }
}
```

## Installation Types

### NPM Packages

```json
{
  "install_type": "npm",
  "install_command": "package-name"
}
```

Installs from npm registry. Supports version specifications.

### Git Repositories

```json
{
  "install_type": "git",
  "install_command": "https://github.com/user/repo.git"
}
```

Clones repository, installs dependencies automatically.

### Local Packages

```json
{
  "install_type": "local",
  "install_command": "/path/to/package"
}
```

Copies files from local filesystem.

### URL Packages

```json
{
  "install_type": "url",
  "install_command": "https://example.com/package.tar.gz"
}
```

Downloads and extracts tarball.

## Usage Examples

### JavaScript/Node.js

```javascript
import fetch from 'node-fetch';

// Search for MCP servers
const response = await fetch('http://localhost:65030/marketplace/search?category=mcp-servers');
const { data } = await response.json();
console.log(`Found ${data.packages.length} MCP servers`);

// Install a package
await fetch('http://localhost:65030/marketplace/install', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    packageId: 'mcp-server-filesystem',
    version: '1.0.0'
  })
});
```

### Electron UI

```javascript
// Search packages
const results = await window.marketplace.search('file system', {
  category: 'mcp-servers'
});

// Install package
await window.marketplace.install('mcp-server-filesystem', '1.0.0', {});

// Listen for events
window.marketplace.on('package-installed', (data) => {
  console.log('Package installed:', data);
});
```

## Configuration

### Environment Variables

```bash
# Marketplace server port
MARKETPLACE_PORT=65030

# Marketplace UI URL (for Electron)
MARKETPLACE_UI_URL=http://localhost:65030

# AI Bridge connection
AI_BRIDGE_WS_URL=ws://localhost:65028
AI_BRIDGE_HTTP_URL=http://localhost:65029

# Database path
MARKETPLACE_DB_PATH=./data/marketplace.db

# Installation base path
MARKETPLACE_INSTALL_PATH=./marketplace-packages
```

### Manifest Configuration

Edit `src/marketplace/manifest.json` to configure:

- Categories
- Rating system
- AI Bridge integration
- Search filters
- Package schema

## Testing

```bash
# Run marketplace tests
npm run test tests/marketplace/

# Test database
npm run test tests/marketplace/marketplace.test.js

# Manual API testing
curl http://localhost:65030/marketplace/featured
curl http://localhost:65030/marketplace/search?q=mcp
```

## Development

### Adding New Package Categories

1. Edit `src/marketplace/manifest.json`:
```json
{
  "categories": [
    {
      "id": "new-category",
      "name": "New Category",
      "description": "Description here",
      "icon": "🎯"
    }
  ]
}
```

2. Update database schema constraint in `schema.sql`
3. Update UI icons in `index.html`

### Adding New Installation Types

1. Edit `InstallationService` in `installation-service.js`
2. Add new `install<Type>()` method
3. Update manifest supported types
4. Add tests

### Extending API

1. Add routes in `api/routes.js`
2. Implement business logic in `services/marketplace-service.js`
3. Update documentation
4. Add tests

## Performance

### Optimizations

- **SQLite WAL mode**: Concurrent reads/writes
- **FTS5 full-text search**: Sub-second search across thousands of packages
- **Indexes**: Optimized for common query patterns
- **Caching**: In-memory caching for frequently accessed data
- **Pagination**: Efficient result limiting

### Benchmarks

- Search query: <50ms average
- Package install: 5-30s depending on size
- Database operations: <10ms average
- WebSocket latency: <5ms

## Troubleshooting

### Database Issues

```bash
# Check database health
curl http://localhost:65030/marketplace/health

# Inspect database
sqlite3 data/marketplace.db ".schema"
sqlite3 data/marketplace.db "SELECT * FROM packages LIMIT 5;"
```

### Installation Failures

- Check logs in Winston output
- Verify install command is correct
- Ensure dependencies are available
- Check filesystem permissions

### AI Bridge Connection

- Verify AI Bridge is running: `npm run start:bridge`
- Check port 65028 is not in use
- Review connection logs in marketplace server output

## Contributing

See main project CLAUDE.md for contribution guidelines.

## License

ISC License - See main project LICENSE file.

## Support

- GitHub Issues: https://github.com/Scarmonit/LLM/issues
- Email: scarmonit@gmail.com

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
