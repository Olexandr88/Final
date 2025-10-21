import { EventStore } from './event-store.js';
import { randomUUID } from 'crypto';

/**
 * Command Handlers (Write Side of CQRS)
 * Handle commands, validate business rules, emit events
 * @module command-handlers
 */
export class CommandHandlers {
  constructor(eventStore) {
    this.eventStore = eventStore || new EventStore();
  }

  /**
   * Handle CreateSession command
   * @param {Object} command - Command data
   * @returns {Promise<string>} Session ID
   */
  async handleCreateSession(command) {
    const sessionId = command.sessionId || randomUUID();
    const correlationId = command.correlationId || randomUUID();

    // Business rule: Validate required fields
    if (!command.pid) {
      throw new Error('PID is required for session creation');
    }

    // Emit SessionCreated event
    await this.eventStore.appendEvent({
      aggregateType: 'Session',
      aggregateId: sessionId,
      eventType: 'SessionCreated',
      data: {
        pid: command.pid,
        cwd: command.cwd || process.cwd(),
        startTime: Date.now(),
        status: 'active',
      },
      metadata: {
        commandType: 'CreateSession',
        userId: command.userId || 'system',
      },
      correlationId,
    });

    return sessionId;
  }

  /**
   * Handle UpdateSession command
   * @param {Object} command - Command data
   */
  async handleUpdateSession(command) {
    if (!command.sessionId) {
      throw new Error('Session ID is required');
    }

    // Load existing events to validate session exists
    const events = await this.eventStore.getEventStream('Session', command.sessionId);
    if (events.length === 0) {
      throw new Error(`Session ${command.sessionId} not found`);
    }

    // Emit SessionUpdated event
    await this.eventStore.appendEvent({
      aggregateType: 'Session',
      aggregateId: command.sessionId,
      eventType: 'SessionUpdated',
      data: {
        currentTask: command.currentTask,
        lastHeartbeat: Date.now(),
      },
      metadata: {
        commandType: 'UpdateSession',
      },
      correlationId: command.correlationId,
    });
  }

  /**
   * Handle AcquireLock command
   * @param {Object} command - Command data
   * @returns {Promise<string>} Lock ID
   */
  async handleAcquireLock(command) {
    if (!command.sessionId || !command.resourcePath) {
      throw new Error('Session ID and resource path are required');
    }

    const lockId = randomUUID();

    // Emit LockAcquired event
    await this.eventStore.appendEvent({
      aggregateType: 'Lock',
      aggregateId: lockId,
      eventType: 'LockAcquired',
      data: {
        sessionId: command.sessionId,
        resourcePath: command.resourcePath,
        lockType: command.lockType || 'write',
        acquiredAt: Date.now(),
      },
      metadata: {
        commandType: 'AcquireLock',
      },
      correlationId: command.correlationId,
    });

    return lockId;
  }

  /**
   * Handle ReleaseLock command
   * @param {Object} command - Command data
   */
  async handleReleaseLock(command) {
    if (!command.lockId) {
      throw new Error('Lock ID is required');
    }

    // Load existing events
    const events = await this.eventStore.getEventStream('Lock', command.lockId);
    if (events.length === 0) {
      throw new Error(`Lock ${command.lockId} not found`);
    }

    // Emit LockReleased event
    await this.eventStore.appendEvent({
      aggregateType: 'Lock',
      aggregateId: command.lockId,
      eventType: 'LockReleased',
      data: {
        releasedAt: Date.now(),
      },
      metadata: {
        commandType: 'ReleaseLock',
      },
      correlationId: command.correlationId,
    });
  }

  /**
   * Handle TerminateSession command
   * @param {Object} command - Command data
   */
  async handleTerminateSession(command) {
    if (!command.sessionId) {
      throw new Error('Session ID is required');
    }

    // Emit SessionTerminated event
    await this.eventStore.appendEvent({
      aggregateType: 'Session',
      aggregateId: command.sessionId,
      eventType: 'SessionTerminated',
      data: {
        reason: command.reason || 'manual',
        terminatedAt: Date.now(),
      },
      metadata: {
        commandType: 'TerminateSession',
      },
      correlationId: command.correlationId,
    });
  }
}
