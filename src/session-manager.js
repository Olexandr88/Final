import { DatabasePool } from './utils/database-pool.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

class SessionManager {
  constructor(dbPath = null) {
    const sessionDir = path.join(process.cwd(), '.claude-sessions');
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true }); // Keep sync for constructor
    }

    this.dbPath = dbPath || path.join(sessionDir, 'sessions.db');

    // Initialize database pool
    this.pool = new DatabasePool(this.dbPath, {
      poolSize: 10,
      enableWAL: true
    });

    // Keep a reference to a connection for backwards compatibility
    // This will be used for synchronous operations
    this._primaryConn = null;

    this.sessionId = null;
    this.heartbeatInterval = null;

    this._initDatabase();
  }

  /**
   * Get the primary connection (for backwards compatibility)
   * @returns {Promise<Database>} Database connection
   */
  async _getPrimaryConnection() {
    if (!this._primaryConn) {
      this._primaryConn = await this.pool.getConnection();
    }
    return this._primaryConn;
  }

  /**
   * Synchronous database access (backwards compatible)
   * WARNING: This creates a temporary connection for sync operations
   */
  get db() {
    if (!this._syncConn) {
      // Create a dedicated synchronous connection - using dynamic import wrapped in sync getter
      // Note: This is intentionally sync for backward compatibility
      const Database = require('better-sqlite3');
      this._syncConn = new Database(this.dbPath);
      this._syncConn.pragma('journal_mode = WAL');
    }
    return this._syncConn;
  }

  _initDatabase() {
    // Create sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        pid INTEGER NOT NULL,
        start_time INTEGER NOT NULL,
        last_heartbeat INTEGER NOT NULL,
        status TEXT DEFAULT 'active',
        current_task TEXT,
        cwd TEXT
      )
    `);

    // Create locks table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS locks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resource_path TEXT NOT NULL,
        session_id TEXT NOT NULL,
        acquired_at INTEGER NOT NULL,
        lock_type TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `);

    // Create index for faster lookups
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_locks_resource ON locks(resource_path);
      CREATE INDEX IF NOT EXISTS idx_locks_session ON locks(session_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
    `);
  }

  register() {
    this.sessionId = uuidv4();
    const now = Date.now();
    const pid = process.pid;
    const cwd = process.cwd();

    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, pid, start_time, last_heartbeat, status, cwd)
      VALUES (?, ?, ?, ?, 'active', ?)
    `);

    stmt.run(this.sessionId, pid, now, now, cwd);

    // Start heartbeat
    this.heartbeatInterval = setInterval(() => this.heartbeat(), 5000);

    // Cleanup on exit
    process.on('exit', () => this.cleanup());
    process.on('SIGINT', () => {
      this.cleanup();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      this.cleanup();
      process.exit(0);
    });

    return this.sessionId;
  }

  heartbeat() {
    if (!this.sessionId) return;

    const now = Date.now();
    const stmt = this.db.prepare(`
      UPDATE sessions
      SET last_heartbeat = ?
      WHERE id = ?
    `);

    stmt.run(now, this.sessionId);
    this._cleanupStaleSessions();
  }

  _cleanupStaleSessions() {
    const staleThreshold = Date.now() - 30000; // 30 seconds

    // Find stale sessions
    const staleSessions = this.db.prepare(`
      SELECT id FROM sessions
      WHERE last_heartbeat < ? AND status = 'active'
    `).all(staleThreshold);

    // Mark as stale and release their locks
    for (const session of staleSessions) {
      this.db.prepare(`UPDATE sessions SET status = 'stale' WHERE id = ?`).run(session.id);
      this.db.prepare(`DELETE FROM locks WHERE session_id = ?`).run(session.id);
    }
  }

  updateTask(task) {
    if (!this.sessionId) return;

    const stmt = this.db.prepare(`
      UPDATE sessions
      SET current_task = ?
      WHERE id = ?
    `);

    stmt.run(task, this.sessionId);
  }

  listActiveSessions() {
    this._cleanupStaleSessions();

    const sessions = this.db.prepare(`
      SELECT id, pid, start_time, last_heartbeat, current_task, cwd
      FROM sessions
      WHERE status = 'active'
      ORDER BY start_time DESC
    `).all();

    return sessions.map(s => ({
      ...s,
      isCurrentSession: s.id === this.sessionId,
      uptime: Date.now() - s.start_time,
      lastHeartbeatAge: Date.now() - s.last_heartbeat
    }));
  }

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

  killSession(sessionId) {
    // Release all locks
    this.db.prepare(`DELETE FROM locks WHERE session_id = ?`).run(sessionId);

    // Mark as killed
    this.db.prepare(`UPDATE sessions SET status = 'killed' WHERE id = ?`).run(sessionId);

    // Try to kill the process
    const session = this.db.prepare(`SELECT pid FROM sessions WHERE id = ?`).get(sessionId);
    if (session) {
      try {
        process.kill(session.pid, 'SIGTERM');
        return true;
      } catch (err) {
        // Process may already be dead
        return false;
      }
    }
    return false;
  }

  async cleanup() {
    if (!this.sessionId) return;

    try {
      // Clear heartbeat
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }

      // Release all locks
      if (this._syncConn && this._syncConn.open) {
        this._syncConn.prepare(`DELETE FROM locks WHERE session_id = ?`).run(this.sessionId);

        // Mark as inactive
        this._syncConn.prepare(`UPDATE sessions SET status = 'inactive' WHERE id = ?`).run(this.sessionId);

        // Close sync connection
        this._syncConn.close();
        this._syncConn = null;
      }

      // Release primary connection if acquired
      if (this._primaryConn) {
        this.pool.releaseConnection(this._primaryConn);
        this._primaryConn = null;
      }

      // Cleanup pool
      await this.pool.cleanup();
    } catch (err) {
      // Ignore errors during cleanup
    }
  }

  getCurrentSessionId() {
    return this.sessionId;
  }
}

export default SessionManager;
