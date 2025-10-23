/**
 * Developer Platform Database Initialization
 * SQLite with FTS5 full-text search, WAL mode, and comprehensive schema
 * @module developer-platform/database/init
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { logger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Developer Platform Database Manager
 * Singleton pattern for database connection
 */
class DeveloperPlatformDatabase {
  constructor() {
    this.db = null;
    this.dbPath = process.env.DEVELOPER_PLATFORM_DB_PATH || join(process.cwd(), 'data', 'developer-platform.db');
    this.schemaPath = join(__dirname, 'schema.sql');
  }

  /**
   * Initialize database with schema
   * @returns {Database} SQLite database instance
   */
  initialize() {
    if (this.db) {
      logger.warn('Database already initialized');
      return this.db;
    }

    try {
      // Ensure data directory exists
      const dataDir = dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        logger.info('Created data directory', { path: dataDir });
      }

      // Open database
      this.db = new Database(this.dbPath);
      logger.info('Database opened', { path: this.dbPath });

      // Enable WAL mode for better concurrency
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');

      // Load and execute schema
      if (fs.existsSync(this.schemaPath)) {
        const schema = fs.readFileSync(this.schemaPath, 'utf-8');
        this.db.exec(schema);
        logger.info('Database schema initialized', {
          tables: this.getTableNames().length,
        });
      } else {
        logger.error('Schema file not found', { path: this.schemaPath });
        throw new Error(`Schema file not found: ${this.schemaPath}`);
      }

      return this.db;
    } catch (error) {
      logger.error('Failed to initialize database', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Get database instance (initialize if needed)
   * @returns {Database} SQLite database instance
   */
  getDatabase() {
    if (!this.db) {
      this.initialize();
    }
    return this.db;
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      try {
        this.db.close();
        this.db = null;
        logger.info('Database connection closed');
      } catch (error) {
        logger.error('Failed to close database', { error: error.message });
      }
    }
  }

  /**
   * Get list of all tables
   * @returns {string[]} Array of table names
   */
  getTableNames() {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const tables = this.db
      .prepare(
        `SELECT name FROM sqlite_master 
         WHERE type='table' AND name NOT LIKE 'sqlite_%' 
         ORDER BY name`
      )
      .all()
      .map((row) => row.name);

    return tables;
  }

  /**
   * Get table schema
   * @param {string} tableName - Table name
   * @returns {Array} Table schema
   */
  getTableSchema(tableName) {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return this.db.prepare(`PRAGMA table_info(${tableName})`).all();
  }

  /**
   * Get database statistics
   * @returns {Object} Statistics
   */
  getStatistics() {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const stats = {
      tables: {},
      totalRecords: 0,
    };

    const tables = this.getTableNames();

    for (const table of tables) {
      // Skip FTS tables in count (they're virtual)
      if (table.endsWith('_fts')) continue;

      try {
        const count = this.db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
        stats.tables[table] = count.count;
        stats.totalRecords += count.count;
      } catch (error) {
        logger.error(`Failed to get count for table ${table}`, { error: error.message });
        stats.tables[table] = -1;
      }
    }

    return stats;
  }

  /**
   * Health check
   * @returns {Object} Health status
   */
  healthCheck() {
    try {
      if (!this.db) {
        return {
          status: 'error',
          message: 'Database not initialized',
        };
      }

      // Test query
      this.db.prepare('SELECT 1').get();

      const stats = this.getStatistics();

      return {
        status: 'healthy',
        database: {
          path: this.dbPath,
          mode: this.db.pragma('journal_mode', { simple: true }),
          foreignKeys: this.db.pragma('foreign_keys', { simple: true }),
        },
        statistics: stats,
      };
    } catch (error) {
      logger.error('Health check failed', { error: error.message });
      return {
        status: 'error',
        message: error.message,
      };
    }
  }

  /**
   * Vacuum database (optimize)
   */
  vacuum() {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      this.db.exec('VACUUM');
      logger.info('Database vacuumed successfully');
    } catch (error) {
      logger.error('Failed to vacuum database', { error: error.message });
      throw error;
    }
  }
}

// Singleton instance
const database = new DeveloperPlatformDatabase();

export default database;
