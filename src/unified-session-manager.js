/**
 * Unified Session Manager
 * Central coordinator for all Claude sessions and agents
 * Provides visibility, control, and orchestration across the entire system
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';

export class UnifiedSessionManager extends EventEmitter {
  constructor(bridgeUrl = 'ws://localhost:65028', httpUrl = 'http://localhost:65029') {
    super();
    this.bridgeUrl = bridgeUrl;
    this.httpUrl = httpUrl;
    this.ws = null;
    this.connected = false;
    this.sessionId = `unified-manager-${Date.now()}`;

    // State tracking
    this.sessions = new Map(); // sessionId -> session info
    this.agents = new Map(); // agentId -> agent info
    this.messages = []; // Message history
    this.tasks = new Map(); // taskId -> task info

    // Statistics
    this.stats = {
      totalSessions: 0,
      totalAgents: 0,
      totalMessages: 0,
      totalTasks: 0,
      uptime: 0,
      startTime: Date.now(),
    };
  }

  /**
   * Connect to AI Bridge
   */
  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.bridgeUrl);

      this.ws.on('open', () => {
        console.log(`[UnifiedManager] Connected as ${this.sessionId}`);
        this.connected = true;

        // Register
        this.send({
          type: 'register',
          clientId: this.sessionId,
          role: 'unified-manager',
          capabilities: ['session-management', 'orchestration', 'monitoring'],
          intents: ['*'], // Listen to everything
        });

        // Announce presence
        this.broadcast({
          intent: 'session.announce',
          payload: {
            sessionId: this.sessionId,
            sessionName: 'Unified-Session-Manager',
            capabilities: ['monitoring', 'orchestration', 'coordination'],
            metadata: {
              purpose: 'Central session and agent coordination',
              features: ['session-discovery', 'task-tracking', 'message-routing'],
              startTime: this.stats.startTime,
            },
          },
        });

        // Start periodic updates
        this.startMonitoring();

        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          this.handleMessage(message);
        } catch (error) {
          console.error('[UnifiedManager] Parse error:', error);
        }
      });

      this.ws.on('error', (error) => {
        console.error('[UnifiedManager] WebSocket error:', error);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log('[UnifiedManager] Disconnected');
        this.connected = false;
      });
    });
  }

  /**
   * Send message to bridge
   */
  send(message) {
    if (this.connected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast to all sessions
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
    const { type, intent, payload, from, timestamp } = message;

    // Track message
    this.messages.push({
      timestamp: timestamp || Date.now(),
      from,
      intent,
      payload,
    });
    this.stats.totalMessages++;

    // Keep only last 1000 messages
    if (this.messages.length > 1000) {
      this.messages = this.messages.slice(-1000);
    }

    // Ignore our own messages
    if (from === this.sessionId) return;

    // Handle different message types
    switch (intent) {
      case 'session.announce':
        this.handleSessionAnnounce(payload, from);
        break;
      case 'task.create':
        this.handleTaskCreate(payload, from);
        break;
      case 'task.claim':
        this.handleTaskClaim(payload, from);
        break;
      case 'task.complete':
        this.handleTaskComplete(payload, from);
        break;
    }

    this.emit('message', message);
  }

  /**
   * Handle session announcement
   */
  handleSessionAnnounce(payload, from) {
    const { sessionId, sessionName, capabilities, metadata } = payload;

    if (!this.sessions.has(sessionId || from)) {
      this.stats.totalSessions++;
    }

    this.sessions.set(sessionId || from, {
      id: sessionId || from,
      name: sessionName,
      capabilities: capabilities || [],
      metadata: metadata || {},
      firstSeen: this.sessions.get(sessionId || from)?.firstSeen || Date.now(),
      lastSeen: Date.now(),
    });

    console.log(`[UnifiedManager] Session discovered: ${sessionName || sessionId || from}`);
    this.emit('session.discovered', this.sessions.get(sessionId || from));
  }

  /**
   * Handle task creation
   */
  handleTaskCreate(payload, from) {
    const { task } = payload;
    if (task) {
      this.tasks.set(task.id, {
        ...task,
        discoveredAt: Date.now(),
      });
      this.stats.totalTasks++;
      console.log(`[UnifiedManager] Task discovered: ${task.title} (${task.id})`);
      this.emit('task.created', task);
    }
  }

  /**
   * Handle task claim
   */
  handleTaskClaim(payload, from) {
    const { taskId, claimedBy } = payload;
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'claimed';
      task.claimedBy = claimedBy;
      task.claimedAt = Date.now();
      console.log(`[UnifiedManager] Task claimed: ${task.title} by ${claimedBy}`);
      this.emit('task.claimed', task);
    }
  }

  /**
   * Handle task completion
   */
  handleTaskComplete(payload, from) {
    const { taskId, result } = payload;
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'completed';
      task.result = result;
      task.completedAt = Date.now();
      console.log(`[UnifiedManager] Task completed: ${task.title}`);
      this.emit('task.completed', task);
    }
  }

  /**
   * Start monitoring
   */
  startMonitoring() {
    // Update stats every 10 seconds
    setInterval(() => {
      this.updateStats();
    }, 10000);

    // Fetch agents every 15 seconds
    setInterval(() => {
      this.fetchAgents();
    }, 15000);

    // Initial fetch
    setTimeout(() => this.fetchAgents(), 1000);
  }

  /**
   * Update statistics
   */
  updateStats() {
    this.stats.uptime = Date.now() - this.stats.startTime;

    const stats = {
      uptime: Math.floor(this.stats.uptime / 1000),
      sessions: this.sessions.size,
      agents: this.agents.size,
      messages: this.stats.totalMessages,
      tasks: {
        total: this.tasks.size,
        available: Array.from(this.tasks.values()).filter((t) => t.status === 'available').length,
        claimed: Array.from(this.tasks.values()).filter((t) => t.status === 'claimed').length,
        completed: Array.from(this.tasks.values()).filter((t) => t.status === 'completed').length,
      },
    };

    this.emit('stats.update', stats);
    return stats;
  }

  /**
   * Fetch agents from HTTP API
   */
  async fetchAgents() {
    try {
      // Use dynamic import for node-fetch
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(`${this.httpUrl}/agents`);
      const data = await response.json();

      if (data.agents) {
        data.agents.forEach((agent) => {
          this.agents.set(agent.id, agent);
        });
        this.stats.totalAgents = data.agents.length;
      }
    } catch (error) {
      // Silently ignore - we get updates via WebSocket anyway
    }
  }

  /**
   * Get system overview
   */
  getOverview() {
    return {
      uptime: Math.floor(this.stats.uptime / 1000),
      sessions: Array.from(this.sessions.values()),
      agents: Array.from(this.agents.values()),
      tasks: Array.from(this.tasks.values()),
      recentMessages: this.messages.slice(-20),
      stats: this.updateStats(),
    };
  }

  /**
   * Get active sessions
   */
  getActiveSessions() {
    const now = Date.now();
    const activeThreshold = 60000; // 1 minute

    return Array.from(this.sessions.values())
      .filter((s) => now - s.lastSeen < activeThreshold)
      .map((s) => ({
        id: s.id,
        name: s.name,
        capabilities: s.capabilities,
        lastSeen: s.lastSeen,
        age: now - s.firstSeen,
      }));
  }

  /**
   * Get task summary
   */
  getTaskSummary() {
    const tasks = Array.from(this.tasks.values());

    return {
      total: tasks.length,
      byStatus: {
        available: tasks.filter((t) => t.status === 'available').length,
        claimed: tasks.filter((t) => t.status === 'claimed').length,
        completed: tasks.filter((t) => t.status === 'completed').length,
      },
      byPriority: {
        high: tasks.filter((t) => t.priority === 'high').length,
        medium: tasks.filter((t) => t.priority === 'medium').length,
        low: tasks.filter((t) => t.priority === 'low').length,
      },
      byType: tasks.reduce((acc, t) => {
        acc[t.type] = (acc[t.type] || 0) + 1;
        return acc;
      }, {}),
    };
  }

  /**
   * Send command to specific session
   */
  sendCommand(sessionId, command, payload) {
    this.send({
      type: 'direct',
      to: sessionId,
      intent: `command.${command}`,
      payload,
    });
  }

  /**
   * Broadcast announcement
   */
  announceToAll(message) {
    this.broadcast({
      intent: 'system.announcement',
      payload: {
        from: 'Unified-Manager',
        message,
        timestamp: Date.now(),
      },
    });
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
  const manager = new UnifiedSessionManager();

  // Event listeners
  manager.on('session.discovered', (session) => {
    console.log(`\n📡 Session: ${session.name} (${session.id})`);
    console.log(`   Capabilities: ${session.capabilities.join(', ')}`);
  });

  manager.on('task.created', (task) => {
    console.log(`\n📋 Task Created: "${task.title}"`);
    console.log(`   Type: ${task.type}, Priority: ${task.priority}`);
  });

  manager.on('task.claimed', (task) => {
    console.log(`\n✅ Task Claimed: "${task.title}" by ${task.claimedBy}`);
  });

  manager.on('task.completed', (task) => {
    console.log(`\n✨ Task Completed: "${task.title}"`);
  });

  manager.on('stats.update', (stats) => {
    console.log(`\n📊 System Stats:`);
    console.log(`   Uptime: ${stats.uptime}s`);
    console.log(`   Sessions: ${stats.sessions}`);
    console.log(`   Agents: ${stats.agents}`);
    console.log(`   Messages: ${stats.messages}`);
    console.log(
      `   Tasks: ${stats.tasks.total} (${stats.tasks.available} available, ${stats.tasks.claimed} claimed, ${stats.tasks.completed} completed)`
    );
  });

  // Connect
  manager
    .connect()
    .then(() => {
      console.log('✓ Unified Session Manager Connected');
      console.log(`✓ Session ID: ${manager.sessionId}`);
      console.log('\n🔍 Monitoring all sessions, agents, and tasks...\n');

      // Periodic overview
      setInterval(() => {
        const overview = manager.getOverview();
        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`System Overview (${new Date().toLocaleTimeString()})`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`Active Sessions: ${manager.getActiveSessions().length}`);
        console.log(`Total Agents: ${overview.agents.length}`);
        console.log(`Total Tasks: ${overview.tasks.length}`);
        console.log(`Recent Messages: ${overview.recentMessages.length}`);

        const taskSummary = manager.getTaskSummary();
        console.log(`\nTask Summary:`);
        console.log(`  Available: ${taskSummary.byStatus.available}`);
        console.log(`  Claimed: ${taskSummary.byStatus.claimed}`);
        console.log(`  Completed: ${taskSummary.byStatus.completed}`);
      }, 30000);

      process.on('SIGINT', () => {
        console.log('\n\n👋 Shutting down Unified Manager...');
        manager.disconnect();
        process.exit(0);
      });
    })
    .catch((error) => {
      console.error('Failed to connect:', error);
      process.exit(1);
    });
}
