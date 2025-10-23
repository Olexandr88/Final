import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';
import path from 'path';
import fs from 'fs';

/**
 * Training Catalog Repository - SQLite data layer
 * @module training-catalog-repository
 */

const DB_PATH = process.env.TRAINING_DB_PATH || './data/training-catalog.db';
const BATCH_SIZE = 100;

export class TrainingCatalogRepository {
  constructor() {
    this._ensureDataDirectory();
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this._initializeSchema();
    logger.info('TrainingCatalogRepository initialized', { dbPath: DB_PATH });
  }

  /**
   * Ensure data directory exists
   * @private
   */
  _ensureDataDirectory() {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info('Created data directory', { path: dir });
    }
  }

  /**
   * Initialize database schema
   * @private
   */
  _initializeSchema() {
    const schema = `
      -- Core content tables
      CREATE TABLE IF NOT EXISTS training_modules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        duration_minutes INTEGER,
        level TEXT,
        locale TEXT DEFAULT 'en-us',
        last_modified TEXT,
        url TEXT,
        icon_url TEXT,
        popularity_score INTEGER DEFAULT 0,
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS training_paths (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        level TEXT,
        locale TEXT DEFAULT 'en-us',
        last_modified TEXT,
        url TEXT,
        icon_url TEXT,
        module_count INTEGER DEFAULT 0,
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS training_certifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        level TEXT,
        locale TEXT DEFAULT 'en-us',
        last_modified TEXT,
        url TEXT,
        icon_url TEXT,
        exam_uid TEXT,
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS training_exams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        url TEXT,
        certification_uid TEXT,
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Many-to-many relationship tables
      CREATE TABLE IF NOT EXISTS module_products (
        module_uid TEXT NOT NULL,
        product TEXT NOT NULL,
        PRIMARY KEY (module_uid, product),
        FOREIGN KEY (module_uid) REFERENCES training_modules(uid) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS module_roles (
        module_uid TEXT NOT NULL,
        role TEXT NOT NULL,
        PRIMARY KEY (module_uid, role),
        FOREIGN KEY (module_uid) REFERENCES training_modules(uid) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS module_subjects (
        module_uid TEXT NOT NULL,
        subject TEXT NOT NULL,
        PRIMARY KEY (module_uid, subject),
        FOREIGN KEY (module_uid) REFERENCES training_modules(uid) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS path_modules (
        path_uid TEXT NOT NULL,
        module_uid TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        PRIMARY KEY (path_uid, module_uid),
        FOREIGN KEY (path_uid) REFERENCES training_paths(uid) ON DELETE CASCADE,
        FOREIGN KEY (module_uid) REFERENCES training_modules(uid) ON DELETE CASCADE
      );

      -- User progress tracking
      CREATE TABLE IF NOT EXISTS user_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        content_uid TEXT NOT NULL,
        content_type TEXT NOT NULL CHECK(content_type IN ('module', 'path', 'certification')),
        progress_percent INTEGER DEFAULT 0 CHECK(progress_percent >= 0 AND progress_percent <= 100),
        started_at TEXT DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT,
        last_accessed TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, content_uid)
      );

      -- Sync metadata
      CREATE TABLE IF NOT EXISTS sync_metadata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_type TEXT NOT NULL CHECK(sync_type IN ('FULL', 'INCREMENTAL')),
        last_sync_timestamp TEXT NOT NULL,
        items_synced INTEGER DEFAULT 0,
        errors TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Full-text search indexes
      CREATE VIRTUAL TABLE IF NOT EXISTS modules_fts USING fts5(
        uid UNINDEXED,
        title,
        description,
        content=training_modules,
        content_rowid=id
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS paths_fts USING fts5(
        uid UNINDEXED,
        title,
        description,
        content=training_paths,
        content_rowid=id
      );

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_modules_level ON training_modules(level);
      CREATE INDEX IF NOT EXISTS idx_modules_locale ON training_modules(locale);
      CREATE INDEX IF NOT EXISTS idx_modules_popularity ON training_modules(popularity_score DESC);
      CREATE INDEX IF NOT EXISTS idx_modules_last_modified ON training_modules(last_modified);
      CREATE INDEX IF NOT EXISTS idx_paths_level ON training_paths(level);
      CREATE INDEX IF NOT EXISTS idx_user_progress_user_id ON user_progress(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_progress_content ON user_progress(content_uid, content_type);
    `;

    this.db.exec(schema);
    logger.info('Database schema initialized');
  }

  /**
   * Insert or update training modules in batch
   * @param {Array<Object>} modules - Modules to upsert
   * @returns {number} Number of modules inserted/updated
   */
  upsertModules(modules) {
    const stmt = this.db.prepare(`
      INSERT INTO training_modules (
        uid, title, description, duration_minutes, level, locale,
        last_modified, url, icon_url, popularity_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(uid) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        duration_minutes = excluded.duration_minutes,
        level = excluded.level,
        last_modified = excluded.last_modified,
        url = excluded.url,
        icon_url = excluded.icon_url,
        popularity_score = excluded.popularity_score,
        synced_at = CURRENT_TIMESTAMP
    `);

    const productStmt = this.db.prepare('INSERT OR IGNORE INTO module_products VALUES (?, ?)');
    const roleStmt = this.db.prepare('INSERT OR IGNORE INTO module_roles VALUES (?, ?)');
    const subjectStmt = this.db.prepare('INSERT OR IGNORE INTO module_subjects VALUES (?, ?)');

    const transaction = this.db.transaction((modulesBatch) => {
      for (const module of modulesBatch) {
        stmt.run(
          module.uid,
          module.title,
          module.description,
          module.duration_minutes,
          module.level,
          module.locale || 'en-us',
          module.last_modified,
          module.url,
          module.icon_url,
          module.popularity_score || 0
        );

        // Insert many-to-many relationships
        if (module.products) {
          module.products.forEach(product => productStmt.run(module.uid, product));
        }
        if (module.roles) {
          module.roles.forEach(role => roleStmt.run(module.uid, role));
        }
        if (module.subjects) {
          module.subjects.forEach(subject => subjectStmt.run(module.uid, subject));
        }
      }
    });

    let totalInserted = 0;
    for (let i = 0; i < modules.length; i += BATCH_SIZE) {
      const batch = modules.slice(i, i + BATCH_SIZE);
      transaction(batch);
      totalInserted += batch.length;
      logger.debug('Batch upserted', { type: 'modules', processed: totalInserted, total: modules.length });
    }

    logger.info('Modules upserted', { count: totalInserted });
    return totalInserted;
  }

  /**
   * Insert or update learning paths in batch
   * @param {Array<Object>} paths - Paths to upsert
   * @returns {number} Number of paths inserted/updated
   */
  upsertLearningPaths(paths) {
    const stmt = this.db.prepare(`
      INSERT INTO training_paths (
        uid, title, description, level, locale, last_modified, url, icon_url, module_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(uid) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        level = excluded.level,
        last_modified = excluded.last_modified,
        url = excluded.url,
        icon_url = excluded.icon_url,
        module_count = excluded.module_count,
        synced_at = CURRENT_TIMESTAMP
    `);

    const pathModuleStmt = this.db.prepare('INSERT OR REPLACE INTO path_modules VALUES (?, ?, ?)');

    const transaction = this.db.transaction((pathsBatch) => {
      for (const learningPath of pathsBatch) {
        stmt.run(
          learningPath.uid,
          learningPath.title,
          learningPath.description,
          learningPath.level,
          learningPath.locale || 'en-us',
          learningPath.last_modified,
          learningPath.url,
          learningPath.icon_url,
          learningPath.modules?.length || 0
        );

        if (learningPath.modules) {
          learningPath.modules.forEach((moduleUid, index) => {
            pathModuleStmt.run(learningPath.uid, moduleUid, index + 1);
          });
        }
      }
    });

    let totalInserted = 0;
    for (let i = 0; i < paths.length; i += BATCH_SIZE) {
      const batch = paths.slice(i, i + BATCH_SIZE);
      transaction(batch);
      totalInserted += batch.length;
      logger.debug('Batch upserted', { type: 'paths', processed: totalInserted, total: paths.length });
    }

    logger.info('Learning paths upserted', { count: totalInserted });
    return totalInserted;
  }

  /**
   * Search modules with full-text search and filters
   * @param {Object} criteria - Search criteria
   * @param {string} [criteria.query] - Full-text search query
   * @param {string} [criteria.level] - Filter by level
   * @param {string} [criteria.product] - Filter by product
   * @param {string} [criteria.role] - Filter by role
   * @param {string} [criteria.subject] - Filter by subject
   * @param {number} [criteria.limit=50] - Result limit
   * @param {number} [criteria.offset=0] - Result offset
   * @returns {Array<Object>} Matching modules
   */
  searchModules(criteria = {}) {
    const { query, level, product, role, subject, limit = 50, offset = 0 } = criteria;

    let sql = 'SELECT m.* FROM training_modules m';
    const params = [];
    const conditions = [];

    if (query) {
      sql += ' JOIN modules_fts fts ON m.uid = fts.uid';
      conditions.push('modules_fts MATCH ?');
      params.push(query);
    }

    if (product) {
      sql += ' JOIN module_products mp ON m.uid = mp.module_uid';
      conditions.push('mp.product = ?');
      params.push(product);
    }

    if (role) {
      sql += ' JOIN module_roles mr ON m.uid = mr.module_uid';
      conditions.push('mr.role = ?');
      params.push(role);
    }

    if (subject) {
      sql += ' JOIN module_subjects ms ON m.uid = ms.module_uid';
      conditions.push('ms.subject = ?');
      params.push(subject);
    }

    if (level) {
      conditions.push('m.level = ?');
      params.push(level);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY m.popularity_score DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const results = this.db.prepare(sql).all(...params);
    logger.debug('Module search executed', { criteria, resultCount: results.length });
    return results;
  }

  /**
   * Get module by UID with related data
   * @param {string} uid - Module UID
   * @returns {Object|null} Module with products, roles, subjects
   */
  getModuleByUid(uid) {
    const module = this.db.prepare('SELECT * FROM training_modules WHERE uid = ?').get(uid);
    if (!module) return null;

    module.products = this.db.prepare('SELECT product FROM module_products WHERE module_uid = ?')
      .all(uid).map(row => row.product);
    module.roles = this.db.prepare('SELECT role FROM module_roles WHERE module_uid = ?')
      .all(uid).map(row => row.role);
    module.subjects = this.db.prepare('SELECT subject FROM module_subjects WHERE module_uid = ?')
      .all(uid).map(row => row.subject);

    return module;
  }

  /**
   * Record sync metadata
   * @param {string} syncType - 'FULL' or 'INCREMENTAL'
   * @param {string} timestamp - ISO timestamp
   * @param {number} itemsSynced - Number of items synced
   * @param {string|null} errors - Error details if any
   */
  recordSyncMetadata(syncType, timestamp, itemsSynced, errors = null) {
    this.db.prepare(`
      INSERT INTO sync_metadata (sync_type, last_sync_timestamp, items_synced, errors)
      VALUES (?, ?, ?, ?)
    `).run(syncType, timestamp, itemsSynced, errors);

    logger.info('Sync metadata recorded', { syncType, timestamp, itemsSynced });
  }

  /**
   * Get last sync metadata
   * @param {string} [syncType] - Optional sync type filter
   * @returns {Object|null} Last sync record
   */
  getLastSyncMetadata(syncType = null) {
    const sql = syncType
      ? 'SELECT * FROM sync_metadata WHERE sync_type = ? ORDER BY created_at DESC LIMIT 1'
      : 'SELECT * FROM sync_metadata ORDER BY created_at DESC LIMIT 1';

    const params = syncType ? [syncType] : [];
    return this.db.prepare(sql).get(...params);
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
    logger.info('Database connection closed');
  }
}

export default TrainingCatalogRepository;
