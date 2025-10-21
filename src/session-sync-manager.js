#!/usr/bin/env node
import { EventEmitter } from 'node:events';
import SessionDiscoveryService from './session-discovery.js';
import { watch } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

/**
 * Session Sync Manager
 *
 * Keeps multiple Claude Code sessions in sync by:
 * - Broadcasting file changes
 * - Sharing state updates
 * - Coordinating tasks
 * - Preventing conflicts
 */
export class SessionSyncManager extends EventEmitter {
  constructor({
    sessionName = null,
    watchDirectories = ['.'],
    syncInterval = 5000,
    bridgeUrl = 'ws://localhost:65028',
    logger = console,
  } = {}) {
    super();

    this.sessionName = sessionName || `Sync-${process.pid}`;
    this.watchDirectories = watchDirectories;
    this.syncInterval = syncInterval;
    this.logger = logger;

    // State
    this.sharedState = new Map(); // key -> { value, version, timestamp, owner }
    this.fileHashes = new Map(); // filepath -> hash
    this.watchers = [];
    this.syncTimer = null;

    // Session discovery
    this.discovery = new SessionDiscoveryService({
      sessionName: this.sessionName,
      capabilities: ['sync', 'state-sharing', 'file-watching'],
      bridgeUrl,
      metadata: {
        syncEnabled: true,
        watchDirs: this.watchDirectories,
      },
    });

    this._setupDiscoveryHandlers();
  }

  /**
   * Initialize sync manager
   */
  async init() {
    // Connect to bridge
    await this.discovery.connect();
    this.logger.log(`[Sync] Connected as ${this.sessionName}`);

    // Start file watching
    this._startFileWatching();

    // Start periodic sync
    this._startPeriodicSync();

    // Request state from other sessions
    this._requestStateSync();

    return this;
  }

  /**
   * Set up discovery event handlers
   */
  _setupDiscoveryHandlers() {
    this.discovery.on('sessionDiscovered', (session) => {
      this.logger.log(`[Sync] Discovered session: ${session.sessionName}`);

      // Request their state
      this.discovery.sendToSession(session.sessionId, {
        type: 'sync.request_state',
        requestedBy: this.sessionName,
        timestamp: Date.now(),
      });
    });

    this.discovery.on('sessionMessage', ({ fromSession, payload }) => {
      this._handleSyncMessage(fromSession, payload);
    });
  }

  /**
   * Handle sync messages from other sessions
   */
  _handleSyncMessage(fromSession, payload) {
    switch (payload.type) {
      case 'sync.state_update':
        this._handleStateUpdate(fromSession, payload);
        break;

      case 'sync.file_changed':
        this._handleFileChange(fromSession, payload);
        break;

      case 'sync.request_state':
        this._sendStateSnapshot(fromSession.sessionId);
        break;

      case 'sync.state_snapshot':
        this._mergeStateSnapshot(fromSession, payload);
        break;

      case 'sync.task_claim':
        this._handleTaskClaim(fromSession, payload);
        break;

      case 'sync.task_complete':
        this._handleTaskComplete(fromSession, payload);
        break;

      default:
        this.emit('syncMessage', { fromSession, payload });
    }
  }

  /**
   * Set shared state value
   */
  setState(key, value) {
    const version = (this.sharedState.get(key)?.version || 0) + 1;
    const stateEntry = {
      value,
      version,
      timestamp: Date.now(),
      owner: this.sessionName,
    };

    this.sharedState.set(key, stateEntry);

    // Broadcast to other sessions
    this.discovery.broadcast({
      type: 'sync.state_update',
      key,
      ...stateEntry,
    });

    this.emit('stateChanged', { key, value, version });
    return stateEntry;
  }

  /**
   * Get shared state value
   */
  getState(key) {
    return this.sharedState.get(key)?.value;
  }

  /**
   * Get all shared state
   */
  getAllState() {
    const state = {};
    for (const [key, entry] of this.sharedState.entries()) {
      state[key] = entry.value;
    }
    return state;
  }

  /**
   * Handle state update from another session
   */
  _handleStateUpdate(fromSession, payload) {
    const { key, value, version, timestamp } = payload;

    const current = this.sharedState.get(key);

    // Only update if newer version or no current value
    if (
      !current ||
      version > current.version ||
      (version === current.version && timestamp > current.timestamp)
    ) {
      this.sharedState.set(key, {
        value,
        version,
        timestamp,
        owner: fromSession.sessionName,
      });

      this.logger.log(`[Sync] State updated: ${key} = ${JSON.stringify(value).slice(0, 50)}`);
      this.emit('stateChanged', { key, value, version, remote: true });
    }
  }

  /**
   * Send state snapshot to a session
   */
  _sendStateSnapshot(targetSessionId) {
    const snapshot = {};
    for (const [key, entry] of this.sharedState.entries()) {
      snapshot[key] = entry;
    }

    this.discovery.sendToSession(targetSessionId, {
      type: 'sync.state_snapshot',
      snapshot,
      sessionName: this.sessionName,
      timestamp: Date.now(),
    });
  }

  /**
   * Merge state snapshot from another session
   */
  _mergeStateSnapshot(fromSession, payload) {
    const { snapshot } = payload;

    for (const [key, entry] of Object.entries(snapshot)) {
      const current = this.sharedState.get(key);

      if (
        !current ||
        entry.version > current.version ||
        (entry.version === current.version && entry.timestamp > current.timestamp)
      ) {
        this.sharedState.set(key, entry);
      }
    }

    this.logger.log(
      `[Sync] Merged state from ${fromSession.sessionName} (${Object.keys(snapshot).length} keys)`
    );
  }

  /**
   * Request state sync from all sessions
   */
  _requestStateSync() {
    this.discovery.broadcast({
      type: 'sync.request_state',
      requestedBy: this.sessionName,
      timestamp: Date.now(),
    });
  }

  /**
   * Start watching files for changes
   */
  _startFileWatching() {
    for (const dir of this.watchDirectories) {
      try {
        const watcher = watch(dir, { recursive: true }, (eventType, filename) => {
          if (filename) {
            this._handleFileSystemChange(eventType, path.join(dir, filename));
          }
        });

        this.watchers.push(watcher);
        this.logger.log(`[Sync] Watching directory: ${dir}`);
      } catch (error) {
        this.logger.error(`[Sync] Failed to watch ${dir}:`, error.message);
      }
    }
  }

  /**
   * Handle file system change
   */
  async _handleFileSystemChange(eventType, filepath) {
    try {
      // Ignore certain files
      if (this._shouldIgnoreFile(filepath)) return;

      // Get file stats and hash
      const stats = await stat(filepath);
      if (!stats.isFile()) return;

      const content = await readFile(filepath);
      const hash = createHash('sha256').update(content).digest('hex');

      const previousHash = this.fileHashes.get(filepath);

      // Only broadcast if hash changed
      if (hash !== previousHash) {
        this.fileHashes.set(filepath, hash);

        this.discovery.broadcast({
          type: 'sync.file_changed',
          filepath,
          hash,
          size: stats.size,
          mtime: stats.mtime.toISOString(),
          changedBy: this.sessionName,
          timestamp: Date.now(),
        });

        this.emit('fileChanged', { filepath, hash, eventType });
        this.logger.log(`[Sync] File changed: ${filepath}`);
      }
    } catch (error) {
      // File might have been deleted or is temporary
      if (error.code !== 'ENOENT') {
        this.logger.error(`[Sync] Error handling file change:`, error.message);
      }
    }
  }

  /**
   * Handle file change notification from another session
   */
  _handleFileChange(fromSession, payload) {
    const { filepath, hash } = payload;

    this.logger.log(`[Sync] ${fromSession.sessionName} changed ${filepath}`);
    this.emit('remoteFileChanged', { ...payload, fromSession });

    // Update our hash to prevent re-broadcasting
    this.fileHashes.set(filepath, hash);
  }

  /**
   * Should ignore file based on patterns
   */
  _shouldIgnoreFile(filepath) {
    const ignorePatterns = [
      /node_modules/,
      /\.git\//,
      /\.claude-sessions/,
      /\.env$/,
      /\.log$/,
      /~$/,
      /\.tmp$/,
      /\.swp$/,
    ];

    return ignorePatterns.some((pattern) => pattern.test(filepath));
  }

  /**
   * Claim a task (distributed task coordination)
   */
  async claimTask(taskId, taskData = {}) {
    const claim = {
      taskId,
      taskData,
      claimedBy: this.sessionName,
      timestamp: Date.now(),
    };

    this.setState(`task:${taskId}`, claim);

    this.discovery.broadcast({
      type: 'sync.task_claim',
      ...claim,
    });

    return claim;
  }

  /**
   * Mark task as complete
   */
  async completeTask(taskId, result = {}) {
    const completion = {
      taskId,
      result,
      completedBy: this.sessionName,
      timestamp: Date.now(),
    };

    this.setState(`task:${taskId}:completed`, completion);

    this.discovery.broadcast({
      type: 'sync.task_complete',
      ...completion,
    });

    return completion;
  }

  /**
   * Handle task claim from another session
   */
  _handleTaskClaim(fromSession, payload) {
    this.logger.log(`[Sync] ${fromSession.sessionName} claimed task: ${payload.taskId}`);
    this.emit('taskClaimed', { ...payload, fromSession });
  }

  /**
   * Handle task completion from another session
   */
  _handleTaskComplete(fromSession, payload) {
    this.logger.log(`[Sync] ${fromSession.sessionName} completed task: ${payload.taskId}`);
    this.emit('taskCompleted', { ...payload, fromSession });
  }

  /**
   * Start periodic sync heartbeat
   */
  _startPeriodicSync() {
    this.syncTimer = setInterval(() => {
      // Broadcast heartbeat with state summary
      this.discovery.broadcast({
        type: 'sync.heartbeat',
        sessionName: this.sessionName,
        stateKeys: Array.from(this.sharedState.keys()),
        fileCount: this.fileHashes.size,
        timestamp: Date.now(),
      });
    }, this.syncInterval);
  }

  /**
   * Get sync status
   */
  getStatus() {
    const sessions = this.discovery.getSessions();

    return {
      sessionName: this.sessionName,
      connectedSessions: sessions.length,
      sharedStateKeys: this.sharedState.size,
      watchedFiles: this.fileHashes.size,
      watchedDirs: this.watchDirectories.length,
      uptime: this.discovery.getStats().uptime,
    };
  }

  /**
   * Cleanup and disconnect
   */
  async cleanup() {
    // Stop sync timer
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    // Stop file watchers
    for (const watcher of this.watchers) {
      watcher.close();
    }

    // Disconnect discovery
    await this.discovery.disconnect();

    this.logger.log('[Sync] Cleanup complete');
  }
}

export default SessionSyncManager;
