import { DatabasePool } from '../utils/database-pool.js';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';

/**
 * Event Store - Immutable append-only log for all domain events
 * Enables event sourcing, audit trails, and temporal queries
 * @module event-store
 */
export class EventStore {
  constructor(dbPath = null) {
    const archDir = path.join(process.cwd(), '.architecture');
    if (!fs.existsSync(archDir)) {
      fs.mkdirSync(archDir, { recursive: true });
    }

    this.dbPath = dbPath || path.join(archDir, 'event-store.db');
    this.pool = new DatabasePool(this.dbPath, {
      poolSize: 5,
      enableWAL: true,
      pragmas: {
        'synchronous': 'NORMAL',
        'cache_size': -64000, // 64MB cache
        'temp_store': 'MEMORY'
      }
    });

    this._initSchema();
  }

  _initSchema() {
    this.pool.execute(conn => {
      // Events table - append-only, immutable
      conn.exec(`
        CREATE TABLE IF NOT EXISTS events (
          event_id TEXT PRIMARY KEY,
          aggregate_type TEXT NOT NULL,
          aggregate_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          event_data TEXT NOT NULL,
          metadata TEXT,
          timestamp INTEGER NOT NULL,
          version INTEGER NOT NULL,
          causation_id TEXT,
          correlation_id TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_events_aggregate
          ON events(aggregate_type, aggregate_id, version);

        CREATE INDEX IF NOT EXISTS idx_events_type
          ON events(event_type);

        CREATE INDEX IF NOT EXISTS idx_events_timestamp
          ON events(timestamp);

        CREATE INDEX IF NOT EXISTS idx_events_correlation
          ON events(correlation_id) WHERE correlation_id IS NOT NULL;
      `);

      // Snapshots for performance (optional optimization)
      conn.exec(`
        CREATE TABLE IF NOT EXISTS snapshots (
          aggregate_type TEXT NOT NULL,
          aggregate_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          state TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          PRIMARY KEY (aggregate_type, aggregate_id)
        );

        CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp
          ON snapshots(timestamp);
      `);
    });
  }

  /**
   * Append event to store (Command -> Event)
   * @param {Object} event - Domain event
   * @returns {Promise<Object>} Stored event with metadata
   */
  async appendEvent(event) {
    return await this.pool.execute(async (conn) => {
      const eventId = event.eventId || randomUUID();
      const timestamp = event.timestamp || Date.now();

      // Get next version for this aggregate
      const currentVersion = conn.prepare(`
        SELECT COALESCE(MAX(version), 0) as version
        FROM events
        WHERE aggregate_type = ? AND aggregate_id = ?
      `).get(event.aggregateType, event.aggregateId);

      const nextVersion = (currentVersion?.version || 0) + 1;

      const stmt = conn.prepare(`
        INSERT INTO events (
          event_id, aggregate_type, aggregate_id, event_type,
          event_data, metadata, timestamp, version,
          causation_id, correlation_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        eventId,
        event.aggregateType,
        event.aggregateId,
        event.eventType,
        JSON.stringify(event.data),
        JSON.stringify(event.metadata || {}),
        timestamp,
        nextVersion,
        event.causationId || null,
        event.correlationId || null
      );

      return {
        ...event,
        eventId,
        timestamp,
        version: nextVersion
      };
    });
  }

  /**
   * Get event stream for an aggregate
   * @param {string} aggregateType - Type of aggregate (e.g., 'Session')
   * @param {string} aggregateId - Aggregate identifier
   * @param {number} fromVersion - Start from version (default: 0)
   * @returns {Promise<Array>} Array of events
   */
  async getEventStream(aggregateType, aggregateId, fromVersion = 0) {
    return await this.pool.execute(async (conn) => {
      const stmt = conn.prepare(`
        SELECT event_id, aggregate_type, aggregate_id, event_type,
               event_data, metadata, timestamp, version,
               causation_id, correlation_id
        FROM events
        WHERE aggregate_type = ? AND aggregate_id = ? AND version > ?
        ORDER BY version ASC
      `);

      const rows = stmt.all(aggregateType, aggregateId, fromVersion);

      return rows.map(row => ({
        eventId: row.event_id,
        aggregateType: row.aggregate_type,
        aggregateId: row.aggregate_id,
        eventType: row.event_type,
        data: JSON.parse(row.event_data),
        metadata: JSON.parse(row.metadata || '{}'),
        timestamp: row.timestamp,
        version: row.version,
        causationId: row.causation_id,
        correlationId: row.correlation_id
      }));
    });
  }

  /**
   * Get all events by type (for projections)
   * @param {string} eventType - Type of event
   * @param {number} limit - Max events to return
   * @returns {Promise<Array>} Array of events
   */
  async getEventsByType(eventType, limit = 1000) {
    return await this.pool.execute(async (conn) => {
      const stmt = conn.prepare(`
        SELECT * FROM events
        WHERE event_type = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `);

      const rows = stmt.all(eventType, limit);

      return rows.map(row => ({
        eventId: row.event_id,
        aggregateType: row.aggregate_type,
        aggregateId: row.aggregate_id,
        eventType: row.event_type,
        data: JSON.parse(row.event_data),
        metadata: JSON.parse(row.metadata || '{}'),
        timestamp: row.timestamp,
        version: row.version
      }));
    });
  }

  /**
   * Get events by correlation ID (for debugging workflows)
   * @param {string} correlationId - Correlation identifier
   * @returns {Promise<Array>} Array of correlated events
   */
  async getEventsByCorrelation(correlationId) {
    return await this.pool.execute(async (conn) => {
      const stmt = conn.prepare(`
        SELECT * FROM events
        WHERE correlation_id = ?
        ORDER BY timestamp ASC
      `);

      const rows = stmt.all(correlationId);

      return rows.map(row => ({
        eventId: row.event_id,
        aggregateType: row.aggregate_type,
        aggregateId: row.aggregate_id,
        eventType: row.event_type,
        data: JSON.parse(row.event_data),
        timestamp: row.timestamp,
        version: row.version
      }));
    });
  }

  /**
   * Save snapshot for performance optimization
   * @param {string} aggregateType - Aggregate type
   * @param {string} aggregateId - Aggregate ID
   * @param {number} version - Version of snapshot
   * @param {Object} state - Current state
   */
  async saveSnapshot(aggregateType, aggregateId, version, state) {
    await this.pool.execute(async (conn) => {
      const stmt = conn.prepare(`
        INSERT OR REPLACE INTO snapshots (
          aggregate_type, aggregate_id, version, state, timestamp
        ) VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run(
        aggregateType,
        aggregateId,
        version,
        JSON.stringify(state),
        Date.now()
      );
    });
  }

  /**
   * Load snapshot if available
   * @param {string} aggregateType - Aggregate type
   * @param {string} aggregateId - Aggregate ID
   * @returns {Promise<Object|null>} Snapshot or null
   */
  async loadSnapshot(aggregateType, aggregateId) {
    return await this.pool.execute(async (conn) => {
      const stmt = conn.prepare(`
        SELECT version, state, timestamp
        FROM snapshots
        WHERE aggregate_type = ? AND aggregate_id = ?
      `);

      const row = stmt.get(aggregateType, aggregateId);

      if (!row) return null;

      return {
        version: row.version,
        state: JSON.parse(row.state),
        timestamp: row.timestamp
      };
    });
  }

  /**
   * Get event store statistics
   * @returns {Promise<Object>} Statistics
   */
  async getStats() {
    return await this.pool.execute(async (conn) => {
      const eventCount = conn.prepare('SELECT COUNT(*) as count FROM events').get();
      const snapshotCount = conn.prepare('SELECT COUNT(*) as count FROM snapshots').get();

      const aggregateCounts = conn.prepare(`
        SELECT aggregate_type, COUNT(*) as count
        FROM events
        GROUP BY aggregate_type
      `).all();

      const recentEvents = conn.prepare(`
        SELECT event_type, COUNT(*) as count
        FROM events
        WHERE timestamp > ?
        GROUP BY event_type
      `).all(Date.now() - 3600000); // Last hour

      return {
        totalEvents: eventCount.count,
        totalSnapshots: snapshotCount.count,
        aggregateCounts: aggregateCounts.reduce((acc, row) => {
          acc[row.aggregate_type] = row.count;
          return acc;
        }, {}),
        recentEventTypes: recentEvents.reduce((acc, row) => {
          acc[row.event_type] = row.count;
          return acc;
        }, {}),
        poolStats: this.pool.getStats()
      };
    });
  }

  /**
   * Replay events (for rebuilding projections)
   * @param {Function} handler - Event handler function
   * @param {number} fromTimestamp - Start from timestamp
   */
  async replayEvents(handler, fromTimestamp = 0) {
    await this.pool.execute(async (conn) => {
      const stmt = conn.prepare(`
        SELECT * FROM events
        WHERE timestamp >= ?
        ORDER BY timestamp ASC, version ASC
      `);

      const rows = stmt.all(fromTimestamp);

      for (const row of rows) {
        const event = {
          eventId: row.event_id,
          aggregateType: row.aggregate_type,
          aggregateId: row.aggregate_id,
          eventType: row.event_type,
          data: JSON.parse(row.event_data),
          metadata: JSON.parse(row.metadata || '{}'),
          timestamp: row.timestamp,
          version: row.version
        };

        await handler(event);
      }
    });
  }

  async cleanup() {
    await this.pool.cleanup();
  }
}
