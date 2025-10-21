#!/usr/bin/env node
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';

/**
 * Session Discovery Service
 *
 * Enables multiple Claude Code sessions to discover and communicate with each other
 * via the AI Bridge WebSocket hub. Each session announces itself and receives
 * announcements from other sessions.
 *
 * Features:
 * - Automatic session discovery
 * - Heartbeat-based health monitoring
 * - Inter-session messaging
 * - Session capability broadcasting
 * - Presence awareness
 */
export class SessionDiscoveryService extends EventEmitter {
  constructor({
    bridgeUrl = 'ws://localhost:65028',
    sessionId = null,
    sessionName = null,
    capabilities = [],
    metadata = {},
    heartbeatInterval = 10000, // 10 seconds
    staleThreshold = 30000, // 30 seconds
    logger = console,
  } = {}) {
    super();

    this.bridgeUrl = bridgeUrl;
    this.sessionId = sessionId || randomUUID();
    this.sessionName = sessionName || `Session-${this.sessionId.slice(0, 8)}`;
    this.capabilities = capabilities;
    this.metadata = {
      ...metadata,
      pid: process.pid,
      cwd: process.cwd(),
      nodeVersion: process.version,
      platform: process.platform,
      startTime: Date.now(),
      userName: process.env.USER || process.env.USERNAME || 'unknown',
    };

    this.heartbeatInterval = heartbeatInterval;
    this.staleThreshold = staleThreshold;
    this.logger = logger;

    // State
    this.ws = null;
    this.connected = false;
    this.registeredWithBridge = false;
    this.sessions = new Map(); // sessionId -> sessionInfo
    this.heartbeatTimer = null;
    this.cleanupTimer = null;

    // Statistics
    this.stats = {
      messagesReceived: 0,
      messagesSent: 0,
      sessionsDiscovered: 0,
      sessionsDeparted: 0,
      errors: 0,
    };
  }

  /**
   * Connect to the AI Bridge and start discovery
   */
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.bridgeUrl);

        this.ws.on('open', () => {
          this.connected = true;
          this.logger.log(`[SessionDiscovery] Connected to AI Bridge at ${this.bridgeUrl}`);

          // Register with AI Bridge
          this._registerWithBridge();

          resolve();
        });

        this.ws.on('message', (data) => {
          this._handleMessage(data);
        });

        this.ws.on('error', (error) => {
          this.logger.error('[SessionDiscovery] WebSocket error:', error.message);
          this.stats.errors++;
          this.emit('error', error);
        });

        this.ws.on('close', () => {
          this.connected = false;
          this.registeredWithBridge = false;
          this.logger.log('[SessionDiscovery] Disconnected from AI Bridge');
          this.emit('disconnected');

          // Clear timers
          if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
          if (this.cleanupTimer) clearInterval(this.cleanupTimer);

          // Attempt reconnection after 5 seconds
          setTimeout(() => this.connect().catch(() => {}), 5000);
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          if (!this.connected) {
            reject(new Error('Connection timeout'));
          }
        }, 10000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Register this session with the AI Bridge
   */
  _registerWithBridge() {
    const registrationPayload = {
      type: 'register',
      clientId: this.sessionId,
      role: 'claude-session',
      labels: ['session-discovery', 'claude-code'],
      tools: this.capabilities,
      intents: ['session.announce', 'session.heartbeat', 'session.message', 'session.query'],
      maxConcurrentTasks: 5,
    };

    this.ws.send(JSON.stringify(registrationPayload));
    this.registeredWithBridge = true;

    // Start heartbeat and cleanup timers
    this._startHeartbeat();
    this._startCleanup();

    // Announce presence to all other sessions
    this._announcePresence();

    // Query for existing sessions
    this._queryExistingSessions();
  }

  /**
   * Start heartbeat timer to announce presence periodically
   */
  _startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    this.heartbeatTimer = setInterval(() => {
      if (this.connected && this.registeredWithBridge) {
        this._announcePresence();
      }
    }, this.heartbeatInterval);
  }

  /**
   * Start cleanup timer to remove stale sessions
   */
  _startCleanup() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);

    this.cleanupTimer = setInterval(() => {
      this._cleanupStaleSessions();
    }, this.staleThreshold);
  }

  /**
   * Announce this session's presence to all other sessions
   */
  _announcePresence() {
    const announcement = {
      type: 'envelope',
      envelope: {
        from: this.sessionId,
        intent: 'session.announce',
        timestamp: new Date().toISOString(),
        payload: {
          sessionId: this.sessionId,
          sessionName: this.sessionName,
          capabilities: this.capabilities,
          metadata: this.metadata,
          heartbeat: true,
        },
      },
    };

    this._send(announcement);
  }

  /**
   * Query for all existing sessions
   */
  _queryExistingSessions() {
    const query = {
      type: 'envelope',
      envelope: {
        from: this.sessionId,
        intent: 'session.query',
        timestamp: new Date().toISOString(),
        payload: {
          query: 'list_all_sessions',
          respondTo: this.sessionId,
        },
      },
    };

    this._send(query);
  }

  /**
   * Handle incoming WebSocket messages
   */
  _handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      this.stats.messagesReceived++;

      // Handle registration confirmation
      if (message.type === 'registered') {
        this.logger.log(`[SessionDiscovery] Registered with AI Bridge as ${message.clientId}`);
        this.emit('registered', message.client);
        return;
      }

      // Handle envelopes (messages from other sessions)
      if (message[0] === 'env') {
        const envelope = message[1];
        this._handleEnvelope(envelope);
        return;
      }
    } catch (error) {
      this.logger.error('[SessionDiscovery] Error parsing message:', error.message);
      this.stats.errors++;
    }
  }

  /**
   * Handle envelope messages from the bridge
   */
  _handleEnvelope(envelope) {
    const { intent, from, payload } = envelope;

    // Ignore messages from ourselves
    if (from === this.sessionId) return;

    switch (intent) {
      case 'session.announce':
        this._handleSessionAnnouncement(from, payload);
        break;

      case 'session.query':
        this._handleSessionQuery(from, payload);
        break;

      case 'session.message':
        this._handleSessionMessage(from, payload);
        break;

      case 'session.departed':
        this._handleSessionDeparture(from, payload);
        break;

      default:
        // Emit for custom handling
        this.emit('message', { from, intent, payload });
    }
  }

  /**
   * Handle session announcement (discovery)
   */
  _handleSessionAnnouncement(sessionId, payload) {
    const { sessionName, capabilities, metadata } = payload;

    const isNew = !this.sessions.has(sessionId);

    this.sessions.set(sessionId, {
      sessionId,
      sessionName,
      capabilities,
      metadata,
      lastSeen: Date.now(),
      discoveredAt: this.sessions.get(sessionId)?.discoveredAt || Date.now(),
    });

    if (isNew) {
      this.stats.sessionsDiscovered++;
      this.logger.log(
        `[SessionDiscovery] Discovered new session: ${sessionName} (${sessionId.slice(0, 8)})`
      );
      this.emit('sessionDiscovered', this.sessions.get(sessionId));
    } else {
      this.emit('sessionHeartbeat', this.sessions.get(sessionId));
    }
  }

  /**
   * Handle session query (respond with our info)
   */
  _handleSessionQuery(sessionId, payload) {
    if (payload.query === 'list_all_sessions' || payload.respondTo === this.sessionId) {
      // Respond with our announcement
      this._announcePresence();
    }
  }

  /**
   * Handle direct message from another session
   */
  _handleSessionMessage(sessionId, payload) {
    this.emit('sessionMessage', {
      from: sessionId,
      fromSession: this.sessions.get(sessionId),
      payload,
    });
  }

  /**
   * Handle session departure notification
   */
  _handleSessionDeparture(sessionId, payload) {
    if (this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId);
      this.sessions.delete(sessionId);
      this.stats.sessionsDeparted++;
      this.logger.log(`[SessionDiscovery] Session departed: ${session.sessionName}`);
      this.emit('sessionDeparted', session);
    }
  }

  /**
   * Remove stale sessions that haven't sent heartbeats
   */
  _cleanupStaleSessions() {
    const now = Date.now();
    const staleSessions = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastSeen > this.staleThreshold) {
        staleSessions.push(sessionId);
      }
    }

    staleSessions.forEach((sessionId) => {
      const session = this.sessions.get(sessionId);
      this.sessions.delete(sessionId);
      this.logger.log(`[SessionDiscovery] Removed stale session: ${session.sessionName}`);
      this.emit('sessionStale', session);
    });
  }

  /**
   * Send a message to a specific session
   */
  sendToSession(targetSessionId, payload) {
    const message = {
      type: 'envelope',
      envelope: {
        from: this.sessionId,
        to: targetSessionId,
        intent: 'session.message',
        timestamp: new Date().toISOString(),
        payload,
      },
    };

    this._send(message);
  }

  /**
   * Broadcast a message to all sessions
   */
  broadcast(payload) {
    const message = {
      type: 'envelope',
      envelope: {
        from: this.sessionId,
        intent: 'session.broadcast',
        timestamp: new Date().toISOString(),
        payload,
      },
    };

    this._send(message);
  }

  /**
   * Send message via WebSocket
   */
  _send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      this.stats.messagesSent++;
    } else {
      this.logger.warn('[SessionDiscovery] Cannot send message: not connected');
    }
  }

  /**
   * Get list of all discovered sessions
   */
  getSessions() {
    return Array.from(this.sessions.values()).map((session) => ({
      ...session,
      age: Date.now() - session.discoveredAt,
      lastSeenAgo: Date.now() - session.lastSeen,
      healthy: Date.now() - session.lastSeen < this.staleThreshold,
    }));
  }

  /**
   * Get info about a specific session
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeSessions: this.sessions.size,
      connected: this.connected,
      uptime: Date.now() - this.metadata.startTime,
    };
  }

  /**
   * Announce departure and disconnect
   */
  async disconnect() {
    if (this.connected) {
      // Announce departure
      const departure = {
        type: 'envelope',
        envelope: {
          from: this.sessionId,
          intent: 'session.departed',
          timestamp: new Date().toISOString(),
          payload: {
            sessionId: this.sessionId,
            sessionName: this.sessionName,
            reason: 'graceful_shutdown',
          },
        },
      };

      this._send(departure);

      // Give time for message to send
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Clear timers
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);

    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;
    this.registeredWithBridge = false;
    this.sessions.clear();

    this.logger.log('[SessionDiscovery] Disconnected and cleaned up');
  }
}

export default SessionDiscoveryService;
