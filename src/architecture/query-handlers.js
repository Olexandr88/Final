import { DatabasePool } from '../utils/database-pool.js';
import path from 'path';

/**
 * Query Handlers (Read Side of CQRS)
 * Handle queries against optimized read models (projections)
 * @module query-handlers
 */
export class QueryHandlers {
  constructor(dbPath = null) {
    const archDir = path.join(process.cwd(), '.architecture');
    this.dbPath = dbPath || path.join(archDir, 'read-models.db');

    this.pool = new DatabasePool(this.dbPath, {
      poolSize: 10,
      enableWAL: true,
    });

    this._initReadModels();
  }

  _initReadModels() {
    const conn = this.pool.db;

    // Session read model (denormalized for fast queries)
    conn.exec(`
      CREATE TABLE IF NOT EXISTS session_view (
        session_id TEXT PRIMARY KEY,
        pid INTEGER NOT NULL,
        start_time INTEGER NOT NULL,
        last_heartbeat INTEGER NOT NULL,
        status TEXT NOT NULL,
        current_task TEXT,
        cwd TEXT,
        version INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_session_view_status
        ON session_view(status);

      CREATE INDEX IF NOT EXISTS idx_session_view_heartbeat
        ON session_view(last_heartbeat);
    `);

    // Lock read model
    conn.exec(`
      CREATE TABLE IF NOT EXISTS lock_view (
        lock_id TEXT PRIMARY KEY,
        resource_path TEXT NOT NULL,
        session_id TEXT NOT NULL,
        lock_type TEXT NOT NULL,
        acquired_at INTEGER NOT NULL,
        released_at INTEGER,
        status TEXT NOT NULL,
        version INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_lock_view_resource
        ON lock_view(resource_path);

      CREATE INDEX IF NOT EXISTS idx_lock_view_session
        ON lock_view(session_id);

      CREATE INDEX IF NOT EXISTS idx_lock_view_status
        ON lock_view(status);
    `);
  }

  /**
   * Query: Get session by ID
   * @param {string} sessionId - Session identifier
   * @returns {Promise<Object|null>} Session data
   */
  async getSession(sessionId) {
    return await this.pool.execute(async (conn) => {
      const stmt = conn.prepare(`
        SELECT * FROM session_view WHERE session_id = ?
      `);

      return stmt.get(sessionId) || null;
    });
  }

  /**
   * Query: List active sessions
   * @returns {Promise<Array>} Array of active sessions
   */
  async listActiveSessions() {
    return await this.pool.execute(async (conn) => {
      const stmt = conn.prepare(`
        SELECT * FROM session_view
        WHERE status = 'active'
        ORDER BY start_time DESC
      `);

      return stmt.all();
    });
  }

  /**
   * Query: Get lock information
   * @param {string} resourcePath - Resource path
   * @returns {Promise<Object|null>} Lock data
   */
  async getLockInfo(resourcePath) {
    return await this.pool.execute(async (conn) => {
      const stmt = conn.prepare(`
        SELECT * FROM lock_view
        WHERE resource_path = ? AND status = 'active'
        ORDER BY acquired_at DESC
        LIMIT 1
      `);

      return stmt.get(resourcePath) || null;
    });
  }

  /**
   * Query: List locks for a session
   * @param {string} sessionId - Session identifier
   * @returns {Promise<Array>} Array of locks
   */
  async getSessionLocks(sessionId) {
    return await this.pool.execute(async (conn) => {
      const stmt = conn.prepare(`
        SELECT * FROM lock_view
        WHERE session_id = ? AND status = 'active'
        ORDER BY acquired_at DESC
      `);

      return stmt.all(sessionId);
    });
  }

  /**
   * Query: Get stale sessions (no heartbeat for threshold)
   * @param {number} thresholdMs - Heartbeat threshold in milliseconds
   * @returns {Promise<Array>} Array of stale sessions
   */
  async getStaleSessions(thresholdMs = 30000) {
    return await this.pool.execute(async (conn) => {
      const cutoff = Date.now() - thresholdMs;

      const stmt = conn.prepare(`
        SELECT * FROM session_view
        WHERE status = 'active' AND last_heartbeat < ?
      `);

      return stmt.all(cutoff);
    });
  }

  async cleanup() {
    await this.pool.cleanup();
  }
}
