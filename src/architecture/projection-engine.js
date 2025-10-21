import { EventStore } from './event-store.js';
import { QueryHandlers } from './query-handlers.js';

/**
 * Projection Engine
 * Rebuilds read models from event stream
 * @module projection-engine
 */
export class ProjectionEngine {
  constructor(eventStore, queryHandlers) {
    this.eventStore = eventStore || new EventStore();
    this.queryHandlers = queryHandlers || new QueryHandlers();
    this.projections = new Map();

    this._registerProjections();
  }

  _registerProjections() {
    // Session projection
    this.projections.set('SessionView', {
      events: ['SessionCreated', 'SessionUpdated', 'SessionTerminated'],
      handler: async (event) => {
        await this.queryHandlers.pool.execute(async (conn) => {
          switch (event.eventType) {
            case 'SessionCreated':
              conn
                .prepare(
                  `
                INSERT INTO session_view (
                  session_id, pid, start_time, last_heartbeat, status, cwd, version
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
              `
                )
                .run(
                  event.aggregateId,
                  event.data.pid,
                  event.data.startTime,
                  event.data.startTime,
                  event.data.status,
                  event.data.cwd,
                  event.version
                );
              break;

            case 'SessionUpdated':
              conn
                .prepare(
                  `
                UPDATE session_view
                SET current_task = ?, last_heartbeat = ?, version = ?
                WHERE session_id = ?
              `
                )
                .run(
                  event.data.currentTask,
                  event.data.lastHeartbeat,
                  event.version,
                  event.aggregateId
                );
              break;

            case 'SessionTerminated':
              conn
                .prepare(
                  `
                UPDATE session_view
                SET status = 'terminated', version = ?
                WHERE session_id = ?
              `
                )
                .run(event.version, event.aggregateId);
              break;
          }
        });
      },
    });

    // Lock projection
    this.projections.set('LockView', {
      events: ['LockAcquired', 'LockReleased'],
      handler: async (event) => {
        await this.queryHandlers.pool.execute(async (conn) => {
          switch (event.eventType) {
            case 'LockAcquired':
              conn
                .prepare(
                  `
                INSERT INTO lock_view (
                  lock_id, resource_path, session_id, lock_type, acquired_at, status, version
                ) VALUES (?, ?, ?, ?, ?, 'active', ?)
              `
                )
                .run(
                  event.aggregateId,
                  event.data.resourcePath,
                  event.data.sessionId,
                  event.data.lockType,
                  event.data.acquiredAt,
                  event.version
                );
              break;

            case 'LockReleased':
              conn
                .prepare(
                  `
                UPDATE lock_view
                SET status = 'released', released_at = ?, version = ?
                WHERE lock_id = ?
              `
                )
                .run(event.data.releasedAt, event.version, event.aggregateId);
              break;
          }
        });
      },
    });
  }

  /**
   * Project a single event to all interested projections
   * @param {Object} event - Domain event
   */
  async projectEvent(event) {
    for (const [name, projection] of this.projections.entries()) {
      if (projection.events.includes(event.eventType)) {
        try {
          await projection.handler(event);
        } catch (error) {
          console.error(`Projection ${name} failed:`, error);
        }
      }
    }
  }

  /**
   * Rebuild all projections from event store
   * @param {number} fromTimestamp - Start from timestamp
   */
  async rebuildProjections(fromTimestamp = 0) {
    console.log(`[ProjectionEngine] Rebuilding projections from timestamp ${fromTimestamp}...`);

    // Clear existing read models
    await this.queryHandlers.pool.execute(async (conn) => {
      conn.exec('DELETE FROM session_view');
      conn.exec('DELETE FROM lock_view');
    });

    // Replay all events
    let eventCount = 0;
    await this.eventStore.replayEvents(async (event) => {
      await this.projectEvent(event);
      eventCount++;

      if (eventCount % 1000 === 0) {
        console.log(`[ProjectionEngine] Processed ${eventCount} events...`);
      }
    }, fromTimestamp);

    console.log(`[ProjectionEngine] Rebuild complete. Processed ${eventCount} events.`);
  }
}
