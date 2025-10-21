#!/usr/bin/env node
import SessionDiscoveryService from './session-discovery.js';
import SessionCoordinator from './session-coordinator.js';

/**
 * Session-Aware Integration
 *
 * Automatically enables session discovery and coordination for any Claude Code session.
 * This module provides a unified interface for session awareness, discovery, and communication.
 *
 * Usage:
 *   import { sessionAware } from './session-aware-integration.js';
 *
 *   const aware = await sessionAware.init();
 *   const sessions = aware.discover().getSessions();
 *   aware.sendToSession(sessionId, { message: 'Hello!' });
 */
class SessionAwareIntegration {
  constructor() {
    this.discovery = null;
    this.coordinator = null;
    this.initialized = false;
    this.autoAnnounce = true;
    this.logger = console;
  }

  /**
   * Initialize session awareness
   * @param {Object} options Configuration options
   * @returns {SessionAwareIntegration} This instance for chaining
   */
  async init({
    bridgeUrl = process.env.AI_BRIDGE_URL || 'ws://localhost:65028',
    sessionName = null,
    capabilities = [],
    metadata = {},
    autoAnnounce = true,
    useCoordinator = true,
    logger = console,
  } = {}) {
    if (this.initialized) {
      return this;
    }

    this.logger = logger;
    this.autoAnnounce = autoAnnounce;

    // Initialize session coordinator (for locking)
    if (useCoordinator) {
      this.coordinator = new SessionCoordinator();
      const coordinatorSessionId = this.coordinator.initialize();
      this.logger.log(
        `[SessionAware] Session Coordinator initialized: ${coordinatorSessionId.slice(0, 8)}`
      );
    }

    // Initialize session discovery
    this.discovery = new SessionDiscoveryService({
      bridgeUrl,
      sessionId: this.coordinator?.getCurrentSessionId() || null,
      sessionName: sessionName || this._generateSessionName(),
      capabilities: [...capabilities, 'session-aware'],
      metadata: {
        ...metadata,
        sessionAware: true,
        version: '1.0.0',
      },
      logger: this.logger,
    });

    // Set up event handlers
    this._setupEventHandlers();

    // Connect to bridge
    try {
      await this.discovery.connect();
      this.logger.log('[SessionAware] Connected to AI Bridge');
      this.initialized = true;
    } catch (error) {
      this.logger.error('[SessionAware] Failed to connect to AI Bridge:', error.message);
      throw error;
    }

    return this;
  }

  /**
   * Set up event handlers for session discovery
   */
  _setupEventHandlers() {
    this.discovery.on('sessionDiscovered', (session) => {
      this.logger.log(
        `[SessionAware] Discovered session: ${session.sessionName} (${session.sessionId.slice(0, 8)})`
      );

      // Auto-announce if enabled
      if (this.autoAnnounce) {
        this.sendToSession(session.sessionId, {
          type: 'greeting',
          message: `Hello from ${this.discovery.sessionName}!`,
          timestamp: new Date().toISOString(),
        });
      }
    });

    this.discovery.on('sessionDeparted', (session) => {
      this.logger.log(`[SessionAware] Session departed: ${session.sessionName}`);
    });

    this.discovery.on('sessionMessage', ({ from, fromSession, payload }) => {
      this.logger.log(`[SessionAware] Message from ${fromSession?.sessionName || from}:`, payload);
    });

    this.discovery.on('error', (error) => {
      this.logger.error('[SessionAware] Error:', error.message);
    });
  }

  /**
   * Generate a unique session name based on context
   */
  _generateSessionName() {
    const cwd = process.cwd();
    const projectName = cwd.split(/[\\/]/).pop();
    const timestamp = new Date().toISOString().slice(11, 19).replace(/:/g, '-');
    return `${projectName}-${timestamp}`;
  }

  /**
   * Get the discovery service
   */
  discover() {
    this._ensureInitialized();
    return this.discovery;
  }

  /**
   * Get the coordinator
   */
  coordinate() {
    this._ensureInitialized();
    return this.coordinator;
  }

  /**
   * Get all discovered sessions
   */
  getSessions() {
    this._ensureInitialized();
    return this.discovery.getSessions();
  }

  /**
   * Get session by ID or name
   */
  getSession(identifier) {
    this._ensureInitialized();
    const sessions = this.discovery.getSessions();

    // Try exact session ID match
    let session = this.discovery.getSession(identifier);
    if (session) return session;

    // Try partial session ID match
    session = sessions.find((s) => s.sessionId.startsWith(identifier));
    if (session) return session;

    // Try session name match
    session = sessions.find(
      (s) => s.sessionName === identifier || s.sessionName.includes(identifier)
    );
    return session;
  }

  /**
   * Send message to a specific session
   */
  sendToSession(sessionIdOrName, payload) {
    this._ensureInitialized();
    const session = this.getSession(sessionIdOrName);

    if (!session) {
      throw new Error(`Session not found: ${sessionIdOrName}`);
    }

    this.discovery.sendToSession(session.sessionId, payload);
    return true;
  }

  /**
   * Broadcast message to all sessions
   */
  broadcast(payload) {
    this._ensureInitialized();
    this.discovery.broadcast(payload);
    return this.discovery.getSessions().length;
  }

  /**
   * Request capability from another session
   * @param {string} capability Capability to request
   * @returns {Array} Sessions that have this capability
   */
  findCapability(capability) {
    this._ensureInitialized();
    const sessions = this.discovery.getSessions();
    return sessions.filter((s) => s.capabilities && s.capabilities.includes(capability));
  }

  /**
   * Coordinate file access with other sessions
   */
  async coordinateFileAccess(filePath, operation, operationType = 'write') {
    this._ensureInitialized();

    if (!this.coordinator) {
      throw new Error('Session coordinator not initialized. Set useCoordinator: true');
    }

    // Use coordinator's safe file operation
    return await this.coordinator.safeFileOperation(filePath, operation, operationType);
  }

  /**
   * Get statistics about session awareness
   */
  getStats() {
    this._ensureInitialized();
    return {
      discovery: this.discovery.getStats(),
      coordinator: this.coordinator
        ? {
            sessionId: this.coordinator.getCurrentSessionId(),
            sessions: this.coordinator.listSessions(),
            locks: this.coordinator.listLocks(),
          }
        : null,
    };
  }

  /**
   * Format session list as a table
   */
  formatSessionList() {
    this._ensureInitialized();
    const sessions = this.discovery.getSessions();

    if (sessions.length === 0) {
      return '\nNo active sessions discovered.\n';
    }

    let output = '\n=== Discovered Claude Code Sessions ===\n\n';

    sessions.forEach((session) => {
      const uptime = this._formatDuration(session.age);
      const lastSeen = this._formatDuration(session.lastSeenAgo);
      const status = session.healthy ? '●' : '○';

      output += `${status} ${session.sessionName}\n`;
      output += `  ID:          ${session.sessionId.slice(0, 8)}\n`;
      output += `  PID:         ${session.metadata?.pid || 'N/A'}\n`;
      output += `  Uptime:      ${uptime}\n`;
      output += `  Last Seen:   ${lastSeen} ago\n`;
      output += `  Working Dir: ${session.metadata?.cwd || 'N/A'}\n`;

      if (session.capabilities && session.capabilities.length > 0) {
        output += `  Capabilities: ${session.capabilities.join(', ')}\n`;
      }

      output += '\n';
    });

    return output;
  }

  /**
   * Format duration in human-readable form
   */
  _formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Ensure integration is initialized
   */
  _ensureInitialized() {
    if (!this.initialized) {
      throw new Error('SessionAwareIntegration not initialized. Call .init() first');
    }
  }

  /**
   * Cleanup and disconnect
   */
  async cleanup() {
    if (this.discovery) {
      await this.discovery.disconnect();
    }

    if (this.coordinator) {
      await this.coordinator.cleanup();
    }

    this.initialized = false;
  }
}

// Singleton instance for global use
let globalSessionAware = null;

/**
 * Get or create global session-aware instance
 * @param {Object} options Configuration options
 * @returns {Promise<SessionAwareIntegration>} Session-aware instance
 */
export async function getSessionAware(options = {}) {
  if (!globalSessionAware) {
    globalSessionAware = new SessionAwareIntegration();
    await globalSessionAware.init(options);
  }
  return globalSessionAware;
}

/**
 * Initialize session awareness (convenience function)
 */
export async function initSessionAwareness(options = {}) {
  return await getSessionAware(options);
}

// Export class and singleton
export { SessionAwareIntegration };
export const sessionAware = globalSessionAware || new SessionAwareIntegration();

export default SessionAwareIntegration;
