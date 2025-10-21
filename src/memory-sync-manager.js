/**
 * Memory Sync Manager
 * Distributed memory synchronization across all Claude sessions
 * Allows sessions to share knowledge, context, and learned information
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';

export class MemorySyncManager extends EventEmitter {
  constructor(bridgeUrl = 'ws://localhost:65028', sessionId = null) {
    super();
    this.bridgeUrl = bridgeUrl;
    this.sessionId = sessionId || `memory-sync-${Date.now()}`;
    this.ws = null;
    this.connected = false;

    // Memory stores
    this.sharedMemory = new Map(); // key -> { value, timestamp, source, version }
    this.sessionMemories = new Map(); // sessionId -> Map of memories
    this.memoryLog = []; // History of all memory operations
    this.syncState = new Map(); // Track sync state per session

    // Configuration
    this.memoryDir = path.join(process.cwd(), '.memory-sync');
    this.syncInterval = 5000; // Sync every 5 seconds
    this.maxMemoryAge = 3600000; // 1 hour
  }

  /**
   * Connect to AI Bridge
   */
  async connect() {
    // Ensure memory directory exists
    await this.ensureMemoryDir();

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.bridgeUrl);

      this.ws.on('open', () => {
        console.log(`[MemorySync] Connected as ${this.sessionId}`);
        this.connected = true;

        // Register
        this.send({
          type: 'register',
          clientId: this.sessionId,
          role: 'memory-sync-manager',
          capabilities: ['memory-sync', 'knowledge-sharing', 'context-distribution'],
          intents: ['memory.*', 'sync.*', 'session.*'],
        });

        // Announce presence
        this.broadcast({
          intent: 'session.announce',
          payload: {
            sessionId: this.sessionId,
            sessionName: 'Memory-Sync-Manager',
            capabilities: ['memory-sync', 'knowledge-sharing'],
            metadata: {
              purpose: 'Distributed memory synchronization',
              features: ['shared-memory', 'session-memory', 'auto-sync'],
              syncInterval: this.syncInterval,
            },
          },
        });

        // Load persisted memory
        this.loadPersistedMemory().then(() => {
          // Start sync loop
          this.startSyncLoop();
          resolve();
        });
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          this.handleMessage(message);
        } catch (error) {
          console.error('[MemorySync] Parse error:', error);
        }
      });

      this.ws.on('error', (error) => {
        console.error('[MemorySync] WebSocket error:', error);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log('[MemorySync] Disconnected');
        this.connected = false;
      });
    });
  }

  /**
   * Send message
   */
  send(message) {
    if (this.connected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast message
   */
  broadcast(envelope) {
    this.send({
      type: 'broadcast',
      ...envelope,
    });
  }

  /**
   * Handle incoming messages
   */
  handleMessage(message) {
    const { intent, payload, from } = message;

    // Ignore own messages
    if (from === this.sessionId) return;

    switch (intent) {
      case 'memory.set':
        this.handleMemorySet(payload, from);
        break;
      case 'memory.get':
        this.handleMemoryGet(payload, from);
        break;
      case 'memory.sync':
        this.handleMemorySync(payload, from);
        break;
      case 'memory.request':
        this.handleMemoryRequest(payload, from);
        break;
      case 'session.announce':
        this.handleSessionAnnounce(payload, from);
        break;
    }

    this.emit('message', message);
  }

  /**
   * Set shared memory
   */
  setMemory(key, value, metadata = {}) {
    const memoryEntry = {
      key,
      value,
      timestamp: Date.now(),
      source: this.sessionId,
      version: (this.sharedMemory.get(key)?.version || 0) + 1,
      metadata,
    };

    this.sharedMemory.set(key, memoryEntry);
    this.memoryLog.push({ action: 'set', ...memoryEntry });

    // Broadcast to all sessions
    this.broadcast({
      intent: 'memory.set',
      payload: memoryEntry,
    });

    console.log(`[MemorySync] Set: ${key} = ${JSON.stringify(value).slice(0, 100)}`);
    this.emit('memory.set', memoryEntry);

    // Persist
    this.persistMemory();

    return memoryEntry;
  }

  /**
   * Get shared memory
   */
  getMemory(key) {
    const entry = this.sharedMemory.get(key);
    if (entry) {
      // Check if expired
      if (Date.now() - entry.timestamp > this.maxMemoryAge) {
        this.sharedMemory.delete(key);
        return null;
      }
      return entry.value;
    }
    return null;
  }

  /**
   * Handle memory set from other session
   */
  handleMemorySet(payload, from) {
    const { key, value, timestamp, version, metadata } = payload;
    const existing = this.sharedMemory.get(key);

    // Only accept if newer version
    if (!existing || version > existing.version) {
      this.sharedMemory.set(key, {
        key,
        value,
        timestamp,
        source: from,
        version,
        metadata,
      });

      console.log(`[MemorySync] Received from ${from}: ${key}`);
      this.emit('memory.received', { key, value, from });

      // Persist
      this.persistMemory();
    }
  }

  /**
   * Handle memory get request
   */
  handleMemoryGet(payload, from) {
    const { key } = payload;
    const entry = this.sharedMemory.get(key);

    if (entry) {
      this.send({
        type: 'direct',
        to: from,
        intent: 'memory.response',
        payload: entry,
      });
    }
  }

  /**
   * Handle memory sync
   */
  handleMemorySync(payload, from) {
    const { memories } = payload;

    if (memories && Array.isArray(memories)) {
      memories.forEach((entry) => {
        this.handleMemorySet(entry, from);
      });
      console.log(`[MemorySync] Synced ${memories.length} memories from ${from}`);
    }
  }

  /**
   * Handle memory request
   */
  handleMemoryRequest(payload, from) {
    // Send all our memories to requesting session
    const allMemories = Array.from(this.sharedMemory.values());

    this.send({
      type: 'direct',
      to: from,
      intent: 'memory.sync',
      payload: {
        memories: allMemories,
        count: allMemories.length,
      },
    });

    console.log(`[MemorySync] Sent ${allMemories.length} memories to ${from}`);
  }

  /**
   * Handle session announce
   */
  handleSessionAnnounce(payload, from) {
    const { sessionId, sessionName } = payload;

    // Track this session
    if (!this.syncState.has(sessionId || from)) {
      this.syncState.set(sessionId || from, {
        lastSync: 0,
        memoriesShared: 0,
      });

      // Send our memories to new session
      setTimeout(() => {
        this.syncToSession(sessionId || from);
      }, 2000);
    }
  }

  /**
   * Sync memories to specific session
   */
  syncToSession(sessionId) {
    const allMemories = Array.from(this.sharedMemory.values());

    this.send({
      type: 'direct',
      to: sessionId,
      intent: 'memory.sync',
      payload: {
        memories: allMemories,
        count: allMemories.length,
      },
    });

    const state = this.syncState.get(sessionId);
    if (state) {
      state.lastSync = Date.now();
      state.memoriesShared = allMemories.length;
    }

    console.log(`[MemorySync] Synced ${allMemories.length} memories to ${sessionId}`);
  }

  /**
   * Start sync loop
   */
  startSyncLoop() {
    setInterval(() => {
      this.broadcastSync();
      this.cleanExpiredMemories();
    }, this.syncInterval);
  }

  /**
   * Broadcast sync to all sessions
   */
  broadcastSync() {
    const recentMemories = Array.from(this.sharedMemory.values()).filter(
      (m) => Date.now() - m.timestamp < this.syncInterval * 2
    );

    if (recentMemories.length > 0) {
      this.broadcast({
        intent: 'memory.sync',
        payload: {
          memories: recentMemories,
          count: recentMemories.length,
          timestamp: Date.now(),
        },
      });
    }
  }

  /**
   * Clean expired memories
   */
  cleanExpiredMemories() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.sharedMemory.entries()) {
      if (now - entry.timestamp > this.maxMemoryAge) {
        this.sharedMemory.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[MemorySync] Cleaned ${cleaned} expired memories`);
    }
  }

  /**
   * Ensure memory directory exists
   */
  async ensureMemoryDir() {
    try {
      await fs.mkdir(this.memoryDir, { recursive: true });
    } catch (error) {
      // Ignore if exists
    }
  }

  /**
   * Persist memory to disk
   */
  async persistMemory() {
    try {
      const memoryFile = path.join(this.memoryDir, 'shared-memory.json');
      const data = {
        timestamp: Date.now(),
        memories: Array.from(this.sharedMemory.entries()),
      };

      await fs.writeFile(memoryFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[MemorySync] Failed to persist:', error.message);
    }
  }

  /**
   * Load persisted memory
   */
  async loadPersistedMemory() {
    try {
      const memoryFile = path.join(this.memoryDir, 'shared-memory.json');
      const data = await fs.readFile(memoryFile, 'utf-8');
      const parsed = JSON.parse(data);

      if (parsed.memories) {
        for (const [key, entry] of parsed.memories) {
          // Only load if not expired
          if (Date.now() - entry.timestamp < this.maxMemoryAge) {
            this.sharedMemory.set(key, entry);
          }
        }
        console.log(`[MemorySync] Loaded ${this.sharedMemory.size} persisted memories`);
      }
    } catch (error) {
      // No persisted memory or error reading
      console.log('[MemorySync] No persisted memory found (starting fresh)');
    }
  }

  /**
   * Get memory stats
   */
  getStats() {
    return {
      totalMemories: this.sharedMemory.size,
      sessionStates: this.syncState.size,
      memoryLog: this.memoryLog.length,
      oldestMemory: this.getOldestMemory(),
      newestMemory: this.getNewestMemory(),
    };
  }

  /**
   * Get oldest memory
   */
  getOldestMemory() {
    let oldest = null;
    for (const entry of this.sharedMemory.values()) {
      if (!oldest || entry.timestamp < oldest.timestamp) {
        oldest = entry;
      }
    }
    return oldest;
  }

  /**
   * Get newest memory
   */
  getNewestMemory() {
    let newest = null;
    for (const entry of this.sharedMemory.values()) {
      if (!newest || entry.timestamp > newest.timestamp) {
        newest = entry;
      }
    }
    return newest;
  }

  /**
   * Disconnect
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.connected = false;
    }
  }
}

// CLI Runner
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  const manager = new MemorySyncManager();

  manager.on('memory.set', (entry) => {
    console.log(`✅ Memory Set: ${entry.key}`);
  });

  manager.on('memory.received', ({ key, from }) => {
    console.log(`📥 Memory Received: ${key} from ${from}`);
  });

  manager
    .connect()
    .then(() => {
      console.log('✓ Memory Sync Manager Connected');
      console.log(`✓ Session ID: ${manager.sessionId}`);
      console.log('\n🔄 Memory synchronization active...\n');

      // Example: Set some memories
      setTimeout(() => {
        manager.setMemory('system.status', 'operational', { type: 'system' });
        manager.setMemory('active.tasks', 3, { type: 'counter' });
        manager.setMemory('bridge.uptime', '60+ minutes', { type: 'status' });
      }, 2000);

      // Stats every 30 seconds
      setInterval(() => {
        const stats = manager.getStats();
        console.log(`\n📊 Memory Stats:`);
        console.log(`   Total Memories: ${stats.totalMemories}`);
        console.log(`   Synced Sessions: ${stats.sessionStates}`);
        console.log(`   Memory Log Size: ${stats.memoryLog}`);
      }, 30000);

      process.on('SIGINT', () => {
        console.log('\n\n👋 Shutting down Memory Sync...');
        manager.disconnect();
        process.exit(0);
      });
    })
    .catch((error) => {
      console.error('Failed to connect:', error);
      process.exit(1);
    });
}
