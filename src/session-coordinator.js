import SessionManager from './session-manager.js';
import LockManager from './lock-manager.js';
import RWLockManager from './utils/rw-lock-manager.js';
import path from 'path';

class SessionCoordinator {
  constructor(useRWLocks = true) {
    this.sessionManager = new SessionManager();
    // Use RWLockManager for better concurrent read performance
    // Fall back to LockManager for backward compatibility if needed
    this.lockManager = useRWLocks
      ? new RWLockManager(this.sessionManager)
      : new LockManager(this.sessionManager);
    this.useRWLocks = useRWLocks;
    this.initialized = false;
  }

  initialize() {
    if (this.initialized) return;

    const sessionId = this.sessionManager.register();
    this.initialized = true;

    // Log session info
    console.log(`[Session: ${sessionId.slice(0, 8)}] Registered`);

    return sessionId;
  }

  async safeFileOperation(filePath, operation, operationType = 'write') {
    if (!this.initialized) {
      this.initialize();
    }

    const absolutePath = path.resolve(filePath);

    try {
      // Use RWLock methods if available, otherwise fall back to legacy withLock
      if (this.useRWLocks) {
        const lockMethod = operationType === 'read'
          ? this.lockManager.withReadLock.bind(this.lockManager)
          : this.lockManager.withWriteLock.bind(this.lockManager);

        return await lockMethod(absolutePath, async () => {
          this.sessionManager.updateTask(`${operationType}: ${path.basename(filePath)}`);
          const result = await operation();
          this.sessionManager.updateTask(null);
          return result;
        });
      } else {
        // Legacy path for backward compatibility
        return await this.lockManager.withLock(absolutePath, operationType, async () => {
          this.sessionManager.updateTask(`${operationType}: ${path.basename(filePath)}`);
          const result = await operation();
          this.sessionManager.updateTask(null);
          return result;
        });
      }
    } catch (err) {
      console.error(`[Session] Failed to perform ${operationType} on ${filePath}:`, err.message);
      throw err;
    }
  }

  async safeRead(filePath, operation) {
    return this.safeFileOperation(filePath, operation, 'read');
  }

  async safeWrite(filePath, operation) {
    return this.safeFileOperation(filePath, operation, 'write');
  }

  async safeEdit(filePath, operation) {
    return this.safeFileOperation(filePath, operation, 'write');
  }

  listSessions() {
    if (!this.initialized) {
      this.initialize();
    }
    return this.sessionManager.listActiveSessions();
  }

  getSessionInfo(sessionId = null) {
    if (!this.initialized) {
      this.initialize();
    }
    return this.sessionManager.getSessionInfo(sessionId);
  }

  killSession(sessionId) {
    if (!this.initialized) {
      this.initialize();
    }
    return this.sessionManager.killSession(sessionId);
  }

  getCurrentSessionId() {
    if (!this.initialized) {
      this.initialize();
    }
    return this.sessionManager.getCurrentSessionId();
  }

  listLocks() {
    if (!this.initialized) {
      this.initialize();
    }
    return this.lockManager.listLocks();
  }

  getLockInfo(resourcePath) {
    if (!this.initialized) {
      this.initialize();
    }
    return this.lockManager.getLockInfo(resourcePath);
  }

  cleanup() {
    if (this.lockManager) {
      this.lockManager.releaseAllLocks();
    }
    if (this.sessionManager) {
      this.sessionManager.cleanup();
    }
  }

  /**
   * Get lock performance statistics (RWLock only)
   * @returns {Object|null} Performance metrics or null if using legacy locks
   */
  getLockStats() {
    if (this.useRWLocks && typeof this.lockManager.getStats === 'function') {
      return this.lockManager.getStats();
    }
    return null;
  }

  formatSessionList() {
    const sessions = this.listSessions();
    const currentSessionId = this.getCurrentSessionId();

    let output = '\n=== Active Claude Sessions ===\n\n';

    if (sessions.length === 0) {
      output += 'No active sessions found.\n';
      return output;
    }

    sessions.forEach(session => {
      const isCurrent = session.id === currentSessionId;
      const marker = isCurrent ? '→' : ' ';
      const uptime = Math.floor(session.uptime / 1000);
      const lastHeartbeat = Math.floor(session.lastHeartbeatAge / 1000);

      output += `${marker} Session: ${session.id.slice(0, 8)}\n`;
      output += `  PID: ${session.pid}\n`;
      output += `  Uptime: ${uptime}s\n`;
      output += `  Last Heartbeat: ${lastHeartbeat}s ago\n`;
      output += `  Working Dir: ${session.cwd}\n`;
      if (session.current_task) {
        output += `  Current Task: ${session.current_task}\n`;
      }
      output += '\n';
    });

    return output;
  }

  formatLockList() {
    const locks = this.listLocks();

    let output = '\n=== Current Session Locks ===\n\n';

    if (locks.length === 0) {
      output += 'No active locks.\n';
      return output;
    }

    locks.forEach(lock => {
      const age = Math.floor((Date.now() - lock.acquired_at) / 1000);
      output += `• ${lock.resource_path}\n`;
      output += `  Type: ${lock.lock_type}\n`;
      output += `  Held for: ${age}s\n\n`;
    });

    return output;
  }

  checkConflicts(filePath) {
    const absolutePath = path.resolve(filePath);
    const lockInfo = this.getLockInfo(absolutePath);

    if (!lockInfo) {
      return null; // No conflict
    }

    const currentSessionId = this.getCurrentSessionId();
    if (lockInfo.session_id === currentSessionId) {
      return null; // We own the lock
    }

    return {
      lockedBy: lockInfo.session_id,
      lockType: lockInfo.lock_type,
      pid: lockInfo.pid,
      age: Date.now() - lockInfo.acquired_at
    };
  }
}

// Singleton instance
let globalCoordinator = null;

function getGlobalCoordinator() {
  if (!globalCoordinator) {
    globalCoordinator = new SessionCoordinator();
  }
  return globalCoordinator;
}

export default SessionCoordinator;
export { getGlobalCoordinator };
