// src/selection-store.js - ESM SQLite storage for selected text
import { DatabasePool } from './utils/database-pool.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.SELECTION_DB_PATH || path.join(process.cwd(), 'data', 'selections.db');

// Ensure data directory exists (top-level sync is acceptable)
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// Initialize database pool
const pool = new DatabasePool(DB_PATH, {
  poolSize: 15,
  enableWAL: true,
});

// Initialize schema with WAL mode for better concurrency
await pool.execute((db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS selections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      title TEXT,
      selected_text TEXT NOT NULL,
      source TEXT DEFAULT 'browser',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_selections_created_at ON selections(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_selections_url ON selections(url);
    CREATE INDEX IF NOT EXISTS idx_selections_source ON selections(source);
  `);
});

/**
 * Save a text selection to the database
 * @param {Object} selection - Selection data
 * @param {string} selection.url - Page URL
 * @param {string} selection.title - Page title
 * @param {string} selection.selected_text - Selected text content
 * @param {string} selection.source - Source identifier (browser, extension, etc.)
 * @returns {Promise<number>} ID of inserted row
 */
export async function saveSelection({ url, title, selected_text, source = 'browser' }) {
  return pool.execute((db) => {
    const insertStmt = db.prepare(`
      INSERT INTO selections (url, title, selected_text, source)
      VALUES (@url, @title, @selected_text, @source)
    `);

    const result = insertStmt.run({
      url: String(url).slice(0, 2048),
      title: title ? String(title).slice(0, 512) : null,
      selected_text: String(selected_text).slice(0, 100000),
      source: String(source).slice(0, 64),
    });
    return result.lastInsertRowid;
  });
}

/**
 * Get latest selections
 * @param {number} limit - Maximum number of results
 * @returns {Promise<Array>} Array of selection objects
 */
export async function getLatestSelections(limit = 10) {
  return pool.execute((db) => {
    const latestStmt = db.prepare(`
      SELECT id, url, title, selected_text, source, created_at
      FROM selections
      ORDER BY created_at DESC
      LIMIT @limit
    `);
    return latestStmt.all({ limit: Math.min(limit, 1000) });
  });
}

/**
 * Get total count of selections
 * @returns {Promise<number>} Total selection count
 */
export async function getSelectionCount() {
  return pool.execute((db) => {
    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM selections`);
    return countStmt.get().count;
  });
}

/**
 * Search selections by text content
 * @param {string} query - Search query
 * @param {number} limit - Maximum results
 * @returns {Promise<Array>} Matching selections
 */
export async function searchSelections(query, limit = 50) {
  return pool.execute((db) => {
    const searchStmt = db.prepare(`
      SELECT id, url, title, selected_text, source, created_at
      FROM selections
      WHERE selected_text LIKE @query OR title LIKE @query OR url LIKE @query
      ORDER BY created_at DESC
      LIMIT @limit
    `);
    return searchStmt.all({
      query: `%${query}%`,
      limit: Math.min(limit, 1000),
    });
  });
}

/**
 * Close database connection pool (for cleanup)
 */
export async function closeDatabase() {
  await pool.cleanup();
}

export default {
  saveSelection,
  getLatestSelections,
  getSelectionCount,
  searchSelections,
  closeDatabase,
};
