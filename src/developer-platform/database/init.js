/**
 * Developer Platform Database Initialization
 * @module developer-platform/database/init
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { logger } from '../../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * DeveloperPlatformDatabase class manages SQLite connection and initialization
 * Implements singleton pattern for database access
 */
class DeveloperPlatformDatabase {
  /**
   * Create a new DeveloperPlatformDatabase instance
   * @param {string} dbPath - Path to SQLite database file
   */
  constructor(dbPath = path.join(process.cwd(), 'data', 'developer-platform.db')) {
    this.dbPath = dbPath;
    this.db = null;
    this.initialized = false;
  }

  /**
   * Initialize database connection and schema
   * @returns {Database} SQLite database instance
   * @throws {Error} If initialization fails
   */
  initialize() {
    if (this.initialized) {
      logger.debug('Database already initialized', { dbPath: this.dbPath });
      return this.db;
    }

    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        logger.info('Created data directory', { dataDir });
      }

      // Open database connection
      this.db = new Database(this.dbPath, {
        verbose: (msg) => logger.debug('SQLite:', { message: msg }),
      });

      // Enable WAL mode for better concurrency
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('temp_store = MEMORY');
      this.db.pragma('mmap_size = 30000000000');

      logger.info('Database connection opened', {
        dbPath: this.dbPath,
        journalMode: this.db.pragma('journal_mode', { simple: true }),
        foreignKeys: this.db.pragma('foreign_keys', { simple: true }),
      });

      // Read and execute schema
      const schemaPath = path.join(__dirname, 'schema.sql');
      if (!fs.existsSync(schemaPath)) {
        throw new Error(`Schema file not found: ${schemaPath}`);
      }

      const schema = fs.readFileSync(schemaPath, 'utf-8');

      // Execute entire schema at once (better-sqlite3 handles multiple statements)
      try {
        this.db.exec(schema);
      } catch (error) {
        logger.error('Failed to execute schema', {
          error: error.message,
        });
        throw error;
      }

      this.initialized = true;
      logger.info('Developer platform database initialized successfully', {
        dbPath: this.dbPath,
        tables: this.getTableNames(),
      });

      return this.db;
    } catch (error) {
      logger.error('Failed to initialize developer platform database', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Get database instance (initializes if needed)
   * @returns {Database} SQLite database instance
   */
  getDatabase() {
    if (!this.initialized) {
      this.initialize();
    }
    return this.db;
  }

  /**
   * Get list of all table names in database
   * @returns {string[]} Array of table names
   */
  getTableNames() {
    if (!this.db) {
      return [];
    }
    const tables = this.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      )
      .all();
    return tables.map((t) => t.name);
  }

  /**
   * Run database health check
   * @returns {Object} Health check results
   */
  healthCheck() {
    try {
      if (!this.db) {
        return { status: 'error', message: 'Database not initialized' };
      }

      // Test basic query
      const result = this.db.prepare('SELECT 1 as test').get();

      // Get database stats
      const stats = {
        tables: this.getTableNames(),
        size: fs.statSync(this.dbPath).size,
        blogPostCount: this.db
          .prepare('SELECT COUNT(*) as count FROM blog_posts')
          .get().count,
        eventsCount: this.db
          .prepare('SELECT COUNT(*) as count FROM events')
          .get().count,
        learningPathsCount: this.db
          .prepare('SELECT COUNT(*) as count FROM learning_paths')
          .get().count,
        communitiesCount: this.db
          .prepare('SELECT COUNT(*) as count FROM communities')
          .get().count,
      };

      return {
        status: 'healthy',
        message: 'Database operational',
        stats,
      };
    } catch (error) {
      logger.error('Database health check failed', { error: error.message });
      return {
        status: 'error',
        message: error.message,
      };
    }
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      try {
        this.db.close();
        this.initialized = false;
        logger.info('Developer platform database closed');
      } catch (error) {
        logger.error('Failed to close database', { error: error.message });
        throw error;
      }
    }
  }

  /**
   * Reset database (DROP ALL TABLES - USE WITH CAUTION)
   * @returns {boolean} Success status
   */
  reset() {
    try {
      const tables = this.getTableNames();
      this.db.transaction(() => {
        // Drop all tables
        for (const table of tables) {
          this.db.exec(`DROP TABLE IF EXISTS ${table}`);
        }
        // Drop FTS tables
        this.db.exec('DROP TABLE IF EXISTS blog_posts_fts');
        this.db.exec('DROP TABLE IF EXISTS events_fts');
        this.db.exec('DROP TABLE IF EXISTS learning_paths_fts');
        this.db.exec('DROP TABLE IF EXISTS communities_fts');
      })();

      this.initialized = false;
      logger.warn('Database reset - all tables dropped');

      // Reinitialize
      this.initialize();

      return true;
    } catch (error) {
      logger.error('Database reset failed', { error: error.message });
      return false;
    }
  }
}

// Singleton instance
const database = new DeveloperPlatformDatabase();

export default database;
export { DeveloperPlatformDatabase };
