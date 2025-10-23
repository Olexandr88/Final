-- Developer Platform Database Schema
-- SQLite schema for blog, events, learning paths, communities

-- =====================================================
-- BLOG & NEWS SYSTEM
-- =====================================================

CREATE TABLE IF NOT EXISTS blog_posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  excerpt TEXT,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('news', 'tutorial', 'announcement', 'case-study', 'technical')),
  tags TEXT, -- JSON array
  featured_image TEXT,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'archived')),
  view_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  published_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS blog_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  content TEXT NOT NULL,
  parent_id TEXT, -- For threaded comments
  like_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (post_id) REFERENCES blog_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES blog_comments(id) ON DELETE CASCADE
);

-- =====================================================
-- EVENTS SYSTEM
-- =====================================================

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  short_description TEXT,
  event_type TEXT NOT NULL CHECK(event_type IN ('webinar', 'conference', 'workshop', 'meetup', 'hackathon')),
  location TEXT, -- JSON: {type: 'online'|'hybrid'|'physical', address, platform}
  start_time INTEGER NOT NULL,
  end_time INTEGER NOT NULL,
  timezone TEXT DEFAULT 'UTC',
  organizer_id TEXT NOT NULL,
  organizer_name TEXT NOT NULL,
  featured_image TEXT,
  max_attendees INTEGER,
  current_attendees INTEGER DEFAULT 0,
  tags TEXT, -- JSON array
  registration_url TEXT,
  meeting_link TEXT,
  status TEXT DEFAULT 'upcoming' CHECK(status IN ('upcoming', 'ongoing', 'completed', 'cancelled')),
  featured BOOLEAN DEFAULT FALSE,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS event_registrations (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  registration_status TEXT DEFAULT 'registered' CHECK(registration_status IN ('registered', 'attended', 'cancelled', 'no-show')),
  attended BOOLEAN DEFAULT FALSE,
  registered_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  UNIQUE(event_id, user_id)
);

-- =====================================================
-- LEARNING PATHS SYSTEM
-- =====================================================

CREATE TABLE IF NOT EXISTS learning_paths (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('ai', 'azure', 'copilot', 'devops', 'security', 'web-dev', 'mobile', 'data-science')),
  difficulty TEXT NOT NULL CHECK(difficulty IN ('beginner', 'intermediate', 'advanced')),
  estimated_hours INTEGER NOT NULL,
  featured_image TEXT,
  tags TEXT, -- JSON array
  prerequisites TEXT, -- JSON array of prerequisite path IDs
  enrollment_count INTEGER DEFAULT 0,
  completion_count INTEGER DEFAULT 0,
  rating REAL DEFAULT 0.0,
  rating_count INTEGER DEFAULT 0,
  featured BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'published' CHECK(status IN ('draft', 'published', 'archived')),
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS learning_modules (
  id TEXT PRIMARY KEY,
  path_id TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL,
  content TEXT NOT NULL,
  module_type TEXT NOT NULL CHECK(module_type IN ('video', 'article', 'interactive', 'quiz', 'project')),
  estimated_minutes INTEGER NOT NULL,
  order_index INTEGER NOT NULL,
  resources TEXT, -- JSON array of links/materials
  quiz_data TEXT, -- JSON quiz questions/answers
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (path_id) REFERENCES learning_paths(id) ON DELETE CASCADE,
  UNIQUE(path_id, slug)
);

CREATE TABLE IF NOT EXISTS learning_progress (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  path_id TEXT NOT NULL,
  module_id TEXT,
  status TEXT DEFAULT 'in_progress' CHECK(status IN ('not_started', 'in_progress', 'completed')),
  progress_percentage INTEGER DEFAULT 0,
  started_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  completed_at INTEGER,
  last_accessed_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (path_id) REFERENCES learning_paths(id) ON DELETE CASCADE,
  FOREIGN KEY (module_id) REFERENCES learning_modules(id) ON DELETE CASCADE,
  UNIQUE(user_id, path_id, module_id)
);

-- =====================================================
-- COMMUNITIES SYSTEM
-- =====================================================

CREATE TABLE IF NOT EXISTS communities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  icon TEXT,
  banner_image TEXT,
  member_count INTEGER DEFAULT 0,
  post_count INTEGER DEFAULT 0,
  tags TEXT, -- JSON array
  external_link TEXT,
  platform_type TEXT CHECK(platform_type IN ('internal', 'discord', 'slack', 'teams', 'external')),
  featured BOOLEAN DEFAULT FALSE,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS community_members (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  role TEXT DEFAULT 'member' CHECK(role IN ('member', 'moderator', 'admin')),
  joined_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE,
  UNIQUE(community_id, user_id)
);

CREATE TABLE IF NOT EXISTS community_posts (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  post_type TEXT DEFAULT 'discussion' CHECK(post_type IN ('discussion', 'question', 'announcement', 'poll')),
  tags TEXT, -- JSON array
  like_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  pinned BOOLEAN DEFAULT FALSE,
  locked BOOLEAN DEFAULT FALSE,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE
);

-- =====================================================
-- PRODUCT SHOWCASE SYSTEM
-- =====================================================

CREATE TABLE IF NOT EXISTS featured_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('microsoft-365', 'azure', 'visual-studio', 'windows', 'github', 'ai-tools')),
  icon TEXT,
  banner_image TEXT,
  product_url TEXT NOT NULL,
  documentation_url TEXT,
  tags TEXT, -- JSON array
  featured_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS technology_hubs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  hub_type TEXT NOT NULL CHECK(hub_type IN ('ai', 'apis', 'devex', 'gaming', 'cloud', 'data')),
  icon TEXT,
  banner_image TEXT,
  content TEXT, -- Rich content/HTML
  resources TEXT, -- JSON array of resources
  featured_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- =====================================================
-- INDEXES
-- =====================================================

-- Blog indexes
CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON blog_posts(category);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_author ON blog_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_blog_comments_post ON blog_comments(post_id);

-- Events indexes
CREATE INDEX IF NOT EXISTS idx_events_start_time ON events(start_time);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_event_registrations_user ON event_registrations(user_id);

-- Learning paths indexes
CREATE INDEX IF NOT EXISTS idx_learning_paths_category ON learning_paths(category);
CREATE INDEX IF NOT EXISTS idx_learning_paths_difficulty ON learning_paths(difficulty);
CREATE INDEX IF NOT EXISTS idx_learning_modules_path ON learning_modules(path_id, order_index);
CREATE INDEX IF NOT EXISTS idx_learning_progress_user ON learning_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_progress_path ON learning_progress(path_id);

-- Communities indexes
CREATE INDEX IF NOT EXISTS idx_communities_category ON communities(category);
CREATE INDEX IF NOT EXISTS idx_community_members_user ON community_members(user_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_community ON community_posts(community_id, created_at DESC);

-- Products indexes
CREATE INDEX IF NOT EXISTS idx_featured_products_category ON featured_products(category);
CREATE INDEX IF NOT EXISTS idx_technology_hubs_type ON technology_hubs(hub_type);

-- =====================================================
-- FULL-TEXT SEARCH (FTS5)
-- =====================================================

CREATE VIRTUAL TABLE IF NOT EXISTS blog_posts_fts USING fts5(
  title, content, excerpt, author_name, tags,
  content=blog_posts, content_rowid=rowid
);

CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
  title, description, tags,
  content=events, content_rowid=rowid
);

CREATE VIRTUAL TABLE IF NOT EXISTS learning_paths_fts USING fts5(
  title, description, tags,
  content=learning_paths, content_rowid=rowid
);

CREATE VIRTUAL TABLE IF NOT EXISTS communities_fts USING fts5(
  name, description, tags,
  content=communities, content_rowid=rowid
);

-- FTS triggers for blog_posts
CREATE TRIGGER IF NOT EXISTS blog_posts_fts_insert AFTER INSERT ON blog_posts BEGIN
  INSERT INTO blog_posts_fts(rowid, title, content, excerpt, author_name, tags)
  VALUES (new.rowid, new.title, new.content, new.excerpt, new.author_name, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS blog_posts_fts_delete AFTER DELETE ON blog_posts BEGIN
  DELETE FROM blog_posts_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER IF NOT EXISTS blog_posts_fts_update AFTER UPDATE ON blog_posts BEGIN
  DELETE FROM blog_posts_fts WHERE rowid = old.rowid;
  INSERT INTO blog_posts_fts(rowid, title, content, excerpt, author_name, tags)
  VALUES (new.rowid, new.title, new.content, new.excerpt, new.author_name, new.tags);
END;

-- FTS triggers for events
CREATE TRIGGER IF NOT EXISTS events_fts_insert AFTER INSERT ON events BEGIN
  INSERT INTO events_fts(rowid, title, description, tags)
  VALUES (new.rowid, new.title, new.description, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS events_fts_delete AFTER DELETE ON events BEGIN
  DELETE FROM events_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER IF NOT EXISTS events_fts_update AFTER UPDATE ON events BEGIN
  DELETE FROM events_fts WHERE rowid = old.rowid;
  INSERT INTO events_fts(rowid, title, description, tags)
  VALUES (new.rowid, new.title, new.description, new.tags);
END;

-- FTS triggers for learning_paths
CREATE TRIGGER IF NOT EXISTS learning_paths_fts_insert AFTER INSERT ON learning_paths BEGIN
  INSERT INTO learning_paths_fts(rowid, title, description, tags)
  VALUES (new.rowid, new.title, new.description, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS learning_paths_fts_delete AFTER DELETE ON learning_paths BEGIN
  DELETE FROM learning_paths_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER IF NOT EXISTS learning_paths_fts_update AFTER UPDATE ON learning_paths BEGIN
  DELETE FROM learning_paths_fts WHERE rowid = old.rowid;
  INSERT INTO learning_paths_fts(rowid, title, description, tags)
  VALUES (new.rowid, new.title, new.description, new.tags);
END;

-- FTS triggers for communities
CREATE TRIGGER IF NOT EXISTS communities_fts_insert AFTER INSERT ON communities BEGIN
  INSERT INTO communities_fts(rowid, name, description, tags)
  VALUES (new.rowid, new.name, new.description, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS communities_fts_delete AFTER DELETE ON communities BEGIN
  DELETE FROM communities_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER IF NOT EXISTS communities_fts_update AFTER UPDATE ON communities BEGIN
  DELETE FROM communities_fts WHERE rowid = old.rowid;
  INSERT INTO communities_fts(rowid, name, description, tags)
  VALUES (new.rowid, new.name, new.description, new.tags);
END;

-- =====================================================
-- VIEWS
-- =====================================================

CREATE VIEW IF NOT EXISTS blog_posts_with_stats AS
SELECT
  bp.*,
  COUNT(DISTINCT bc.id) as actual_comment_count
FROM blog_posts bp
LEFT JOIN blog_comments bc ON bp.id = bc.post_id
GROUP BY bp.id;

CREATE VIEW IF NOT EXISTS events_with_registrations AS
SELECT
  e.*,
  COUNT(DISTINCT er.id) as actual_registrations,
  SUM(CASE WHEN er.attended = 1 THEN 1 ELSE 0 END) as attendance_count
FROM events e
LEFT JOIN event_registrations er ON e.id = er.event_id
GROUP BY e.id;

CREATE VIEW IF NOT EXISTS learning_paths_with_stats AS
SELECT
  lp.*,
  COUNT(DISTINCT lm.id) as module_count,
  SUM(lm.estimated_minutes) as total_minutes,
  COUNT(DISTINCT lpr.user_id) as actual_enrollments,
  COUNT(DISTINCT CASE WHEN lpr.status = 'completed' THEN lpr.user_id END) as actual_completions
FROM learning_paths lp
LEFT JOIN learning_modules lm ON lp.id = lm.path_id
LEFT JOIN learning_progress lpr ON lp.id = lpr.path_id
GROUP BY lp.id;

CREATE VIEW IF NOT EXISTS communities_with_stats AS
SELECT
  c.*,
  COUNT(DISTINCT cm.user_id) as actual_members,
  COUNT(DISTINCT cp.id) as actual_posts
FROM communities c
LEFT JOIN community_members cm ON c.id = cm.community_id
LEFT JOIN community_posts cp ON c.id = cp.community_id
GROUP BY c.id;
