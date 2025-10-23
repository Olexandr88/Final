-- Marketplace Database Schema
-- SQLite schema for LLM Framework marketplace

-- ============================================================================
-- Packages Table: Stores marketplace items (MCP servers, agents, templates)
-- ============================================================================
CREATE TABLE IF NOT EXISTS packages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  category TEXT NOT NULL,
  author TEXT NOT NULL,
  description TEXT NOT NULL,
  homepage TEXT,
  repository TEXT,
  license TEXT,
  tags TEXT, -- JSON array
  screenshots TEXT, -- JSON array of URLs
  documentation TEXT, -- URL to documentation
  install_command TEXT NOT NULL,
  install_type TEXT NOT NULL, -- npm, git, local, url
  downloads INTEGER DEFAULT 0,
  rating REAL DEFAULT 0.0,
  rating_count INTEGER DEFAULT 0,
  featured BOOLEAN DEFAULT FALSE,
  verified BOOLEAN DEFAULT FALSE,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),

  CHECK (install_type IN ('npm', 'git', 'local', 'url')),
  CHECK (category IN ('mcp-servers', 'ai-agents', 'workflow-templates', 'tools-utilities'))
);

-- ============================================================================
-- Installations Table: Tracks installed packages on this system
-- ============================================================================
CREATE TABLE IF NOT EXISTS installations (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL,
  version TEXT NOT NULL,
  installed_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  install_path TEXT,
  status TEXT NOT NULL DEFAULT 'installed', -- installed, pending, failed, uninstalled
  error_message TEXT,
  config TEXT, -- JSON configuration

  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
  CHECK (status IN ('installed', 'pending', 'failed', 'uninstalled'))
);

-- ============================================================================
-- Ratings Table: User ratings and reviews for packages
-- ============================================================================
CREATE TABLE IF NOT EXISTS ratings (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
  review TEXT,
  helpful_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),

  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
  UNIQUE(package_id, user_id)
);

-- ============================================================================
-- Download Stats Table: Track download history for analytics
-- ============================================================================
CREATE TABLE IF NOT EXISTS download_stats (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL,
  downloaded_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  user_agent TEXT,
  ip_address TEXT,
  version TEXT,

  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE
);

-- ============================================================================
-- Package Dependencies Table: Track dependencies between packages
-- ============================================================================
CREATE TABLE IF NOT EXISTS package_dependencies (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL,
  dependency_id TEXT NOT NULL,
  dependency_version TEXT,
  required BOOLEAN DEFAULT TRUE,

  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
  FOREIGN KEY (dependency_id) REFERENCES packages(id) ON DELETE CASCADE,
  UNIQUE(package_id, dependency_id)
);

-- ============================================================================
-- Indexes for Performance Optimization
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_packages_category ON packages(category);
CREATE INDEX IF NOT EXISTS idx_packages_rating ON packages(rating DESC);
CREATE INDEX IF NOT EXISTS idx_packages_downloads ON packages(downloads DESC);
CREATE INDEX IF NOT EXISTS idx_packages_featured ON packages(featured) WHERE featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_packages_verified ON packages(verified) WHERE verified = TRUE;
CREATE INDEX IF NOT EXISTS idx_packages_created ON packages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_installations_package ON installations(package_id);
CREATE INDEX IF NOT EXISTS idx_installations_status ON installations(status);
CREATE INDEX IF NOT EXISTS idx_ratings_package ON ratings(package_id);
CREATE INDEX IF NOT EXISTS idx_download_stats_package ON download_stats(package_id);
CREATE INDEX IF NOT EXISTS idx_download_stats_date ON download_stats(downloaded_at);

-- ============================================================================
-- Full-Text Search: Enable FTS5 for package search
-- ============================================================================
CREATE VIRTUAL TABLE IF NOT EXISTS packages_fts USING fts5(
  name,
  description,
  tags,
  author,
  content=packages,
  content_rowid=rowid
);

-- Trigger to keep FTS index in sync with packages table
CREATE TRIGGER IF NOT EXISTS packages_fts_insert AFTER INSERT ON packages BEGIN
  INSERT INTO packages_fts(rowid, name, description, tags, author)
  VALUES (NEW.rowid, NEW.name, NEW.description, NEW.tags, NEW.author);
END;

CREATE TRIGGER IF NOT EXISTS packages_fts_update AFTER UPDATE ON packages BEGIN
  UPDATE packages_fts
  SET name = NEW.name,
      description = NEW.description,
      tags = NEW.tags,
      author = NEW.author
  WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS packages_fts_delete AFTER DELETE ON packages BEGIN
  DELETE FROM packages_fts WHERE rowid = OLD.rowid;
END;

-- ============================================================================
-- Views for Common Queries
-- ============================================================================

-- Popular packages view
CREATE VIEW IF NOT EXISTS popular_packages AS
SELECT
  p.*,
  COALESCE(i.install_count, 0) as install_count
FROM packages p
LEFT JOIN (
  SELECT package_id, COUNT(*) as install_count
  FROM installations
  WHERE status = 'installed'
  GROUP BY package_id
) i ON p.id = i.package_id
ORDER BY p.downloads DESC, p.rating DESC;

-- Featured packages view
CREATE VIEW IF NOT EXISTS featured_packages AS
SELECT * FROM packages
WHERE featured = TRUE
ORDER BY downloads DESC, rating DESC;

-- Recently updated packages view
CREATE VIEW IF NOT EXISTS recent_packages AS
SELECT * FROM packages
ORDER BY updated_at DESC
LIMIT 50;
