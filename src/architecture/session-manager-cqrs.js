import { EventStore } from './event-store.js';
import { CommandHandlers } from './command-handlers.js';
import { QueryHandlers } from './query-handlers.js';
import { ProjectionEngine } from './projection-engine.js';

/**
 * Session Manager with CQRS Pattern
 * Backward-compatible facade over event-sourced architecture
 * @module session-manager-cqrs
 */
export class SessionManagerCQRS {
  constructor() {
    this.eventStore = new EventStore();
    this.commandHandlers = new CommandHandlers(this.eventStore);
    this.queryHandlers = new QueryHandlers();
    this.projectionEngine = new ProjectionEngine(this.eventStore, this.queryHandlers);

    this.sessionId = null;
    this.heartbeatInterval = null;
  }

  /**
   * Register a new session (Command)
   * @returns {Promise<string>} Session ID
   */
  async register() {
    this.sessionId = await this.commandHandlers.handleCreateSession({
      pid: process.pid,
      cwd: process.cwd()
    });

    // Project event to read model
    const events = await this.eventStore.getEventStream('Session', this.sessionId);
    for (const event of events) {
      await this.projectionEngine.projectEvent(event);
    }

    // Start heartbeat
    this.heartbeatInterval = setInterval(() => this.heartbeat(), 5000);

    // Cleanup on exit
    process.on('exit', () => this.cleanup());
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });

    return this.sessionId;
  }

  /**
   * Update session heartbeat (Command)
   */
  async heartbeat() {
    if (!this.sessionId) return;

    await this.commandHandlers.handleUpdateSession({
      sessionId: this.sessionId,
      currentTask: null
    });

    // Project event
    const version = await this._getLastVersion('Session', this.sessionId);
    const events = await this.eventStore.getEventStream('Session', this.sessionId, version - 1);
    for (const event of events) {
      await this.projectionEngine.projectEvent(event);
    }
  }

  /**
   * Update current task (Command)
   * @param {string} task - Task description
   */
  async updateTask(task) {
    if (!this.sessionId) return;

    await this.commandHandlers.handleUpdateSession({
      sessionId: this.sessionId,
      currentTask: task
    });

    const version = await this._getLastVersion('Session', this.sessionId);
    const events = await this.eventStore.getEventStream('Session', this.sessionId, version - 1);
    for (const event of events) {
      await this.projectionEngine.projectEvent(event);
    }
  }

  /**
   * List active sessions (Query)
   * @returns {Promise<Array>} Array of sessions
   */
  async listActiveSessions() {
    const sessions = await this.queryHandlers.listActiveSessions();

    return sessions.map(s => ({
      id: s.session_id,
      pid: s.pid,
      start_time: s.start_time,
      last_heartbeat: s.last_heartbeat,
      current_task: s.current_task,
      cwd: s.cwd,
      isCurrentSession: s.session_id === this.sessionId,
      uptime: Date.now() - s.start_time,
      lastHeartbeatAge: Date.now() - s.last_heartbeat
    }));
  }

  /**
   * Get session information (Query)
   * @param {string} sessionId - Session identifier
   * @returns {Promise<Object|null>} Session data
   */
  async getSessionInfo(sessionId = null) {
    const targetId = sessionId || this.sessionId;
    if (!targetId) return null;

    const session = await this.queryHandlers.getSession(targetId);
    if (!session) return null;

    const locks = await this.queryHandlers.getSessionLocks(targetId);

    return {
      ...session,
      locks: locks.map(l => ({
        resource_path: l.resource_path,
        lock_type: l.lock_type,
        acquired_at: l.acquired_at
      }))
    };
  }

  /**
   * Get lock information (Query)
   * @param {string} resourcePath - Resource path
   * @returns {Promise<Object|null>} Lock data
   */
  async getLockInfo(resourcePath) {
    return await this.queryHandlers.getLockInfo(resourcePath);
  }

  /**
   * Acquire lock (Command)
   * @param {string} resourcePath - Resource path
   * @param {string} lockType - Lock type ('read' or 'write')
   * @returns {Promise<string>} Lock ID
   */
  async acquireLock(resourcePath, lockType = 'write') {
    if (!this.sessionId) {
      throw new Error('No active session');
    }

    const lockId = await this.commandHandlers.handleAcquireLock({
      sessionId: this.sessionId,
      resourcePath,
      lockType
    });

    // Project event
    const events = await this.eventStore.getEventStream('Lock', lockId);
    for (const event of events) {
      await this.projectionEngine.projectEvent(event);
    }

    return lockId;
  }

  /**
   * Release lock (Command)
   * @param {string} lockId - Lock identifier
   */
  async releaseLock(lockId) {
    await this.commandHandlers.handleReleaseLock({ lockId });

    // Project event
    const version = await this._getLastVersion('Lock', lockId);
    const events = await this.eventStore.getEventStream('Lock', lockId, version - 1);
    for (const event of events) {
      await this.projectionEngine.projectEvent(event);
    }
  }

  /**
   * Cleanup session (Command)
   */
  async cleanup() {
    if (!this.sessionId) return;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Release all locks
    const locks = await this.queryHandlers.getSessionLocks(this.sessionId);
    for (const lock of locks) {
      if (lock.status === 'active') {
        await this.releaseLock(lock.lock_id);
      }
    }

    // Terminate session
    await this.commandHandlers.handleTerminateSession({
      sessionId: this.sessionId,
      reason: 'cleanup'
    });

    const version = await this._getLastVersion('Session', this.sessionId);
    const events = await this.eventStore.getEventStream('Session', this.sessionId, version - 1);
    for (const event of events) {
      await this.projectionEngine.projectEvent(event);
    }

    await this.eventStore.cleanup();
    await this.queryHandlers.cleanup();
  }

  async _getLastVersion(aggregateType, aggregateId) {
    const events = await this.eventStore.getEventStream(aggregateType, aggregateId);
    return events.length > 0 ? events[events.length - 1].version : 0;
  }

  getCurrentSessionId() {
    return this.sessionId;
  }

  /**
   * Get event store statistics
   * @returns {Promise<Object>} Statistics
   */
  async getEventStoreStats() {
    return await this.eventStore.getStats();
  }

  /**
   * Rebuild all projections (admin operation)
   */
  async rebuildProjections() {
    await this.projectionEngine.rebuildProjections();
  }
}

export default SessionManagerCQRS;
