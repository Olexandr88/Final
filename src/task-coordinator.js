/**
 * Multi-Session Task Coordinator
 * Enables Claude sessions to discover, claim, and collaborate on tasks
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { pathToFileURL } from 'node:url';

export class TaskCoordinator extends EventEmitter {
  constructor(bridgeUrl = 'ws://localhost:65028', sessionId = null) {
    super();
    this.bridgeUrl = bridgeUrl;
    this.sessionId = sessionId || `task-coord-${Date.now()}`;
    this.ws = null;
    this.connected = false;
    this.tasks = new Map(); // taskId -> task object
    this.claimedTasks = new Set(); // taskIds claimed by this session
    this.capabilities = ['task-coordination', 'collaborative-execution'];
  }

  /**
   * Connect to AI Bridge
   */
  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.bridgeUrl);

      this.ws.on('open', () => {
        console.log(`[TaskCoord] Connected to bridge as ${this.sessionId}`);
        this.connected = true;

        // Register with bridge
        this.send({
          type: 'register',
          clientId: this.sessionId,
          role: 'task-coordinator',
          capabilities: this.capabilities,
          intents: ['task.*', 'session.*'],
        });

        // Announce presence
        this.broadcast({
          intent: 'session.announce',
          payload: {
            sessionId: this.sessionId,
            sessionName: 'Task-Coordinator',
            capabilities: this.capabilities,
            metadata: {
              purpose: 'Multi-session task coordination',
              cwd: process.cwd(),
              platform: process.platform,
              startTime: Date.now(),
            },
            heartbeat: true,
          },
        });

        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          this.handleMessage(message);
        } catch (error) {
          console.error('[TaskCoord] Message parse error:', error);
        }
      });

      this.ws.on('error', (error) => {
        console.error('[TaskCoord] WebSocket error:', error);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log('[TaskCoord] Disconnected from bridge');
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
    const { type, intent, payload, from } = message;

    // Ignore our own messages
    if (from === this.sessionId) return;

    switch (intent) {
      case 'task.create':
        this.handleTaskCreate(payload, from);
        break;
      case 'task.claim':
        this.handleTaskClaim(payload, from);
        break;
      case 'task.complete':
        this.handleTaskComplete(payload, from);
        break;
      case 'task.query':
        this.handleTaskQuery(payload, from);
        break;
      case 'task.collaborate':
        this.handleCollaboration(payload, from);
        break;
      case 'session.announce':
        this.handleSessionAnnounce(payload, from);
        break;
    }

    this.emit('message', message);
  }

  /**
   * Create a new task for coordination
   */
  createTask(task) {
    const taskId = task.id || `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const taskObj = {
      id: taskId,
      title: task.title,
      description: task.description,
      type: task.type || 'general',
      priority: task.priority || 'normal',
      status: 'available',
      createdBy: this.sessionId,
      createdAt: Date.now(),
      claimedBy: null,
      claimedAt: null,
      completedAt: null,
      result: null,
      collaborators: [],
      metadata: task.metadata || {},
    };

    this.tasks.set(taskId, taskObj);

    // Broadcast task to all sessions
    this.broadcast({
      intent: 'task.create',
      payload: {
        task: taskObj,
        announcement: `New task available: ${task.title}`,
      },
    });

    console.log(`[TaskCoord] Created task: ${taskId} - "${task.title}"`);
    return taskObj;
  }

  /**
   * Claim a task
   */
  claimTask(taskId, capabilities = []) {
    const task = this.tasks.get(taskId);

    if (!task) {
      console.log(`[TaskCoord] Task ${taskId} not found`);
      return false;
    }

    if (task.status !== 'available') {
      console.log(`[TaskCoord] Task ${taskId} not available (status: ${task.status})`);
      return false;
    }

    task.status = 'claimed';
    task.claimedBy = this.sessionId;
    task.claimedAt = Date.now();
    this.claimedTasks.add(taskId);

    // Broadcast claim
    this.broadcast({
      intent: 'task.claim',
      payload: {
        taskId,
        claimedBy: this.sessionId,
        capabilities,
        timestamp: Date.now(),
      },
    });

    console.log(`[TaskCoord] Claimed task: ${taskId}`);
    this.emit('task.claimed', task);
    return true;
  }

  /**
   * Complete a task
   */
  completeTask(taskId, result) {
    const task = this.tasks.get(taskId);

    if (!task || task.claimedBy !== this.sessionId) {
      console.log(`[TaskCoord] Cannot complete task ${taskId} (not claimed by us)`);
      return false;
    }

    task.status = 'completed';
    task.completedAt = Date.now();
    task.result = result;
    this.claimedTasks.delete(taskId);

    // Broadcast completion
    this.broadcast({
      intent: 'task.complete',
      payload: {
        taskId,
        completedBy: this.sessionId,
        result,
        duration: task.completedAt - task.claimedAt,
        timestamp: Date.now(),
      },
    });

    console.log(`[TaskCoord] Completed task: ${taskId}`);
    this.emit('task.completed', task);
    return true;
  }

  /**
   * Request collaboration on a task
   */
  requestCollaboration(taskId, role, message) {
    const task = this.tasks.get(taskId);

    if (!task) {
      console.log(`[TaskCoord] Task ${taskId} not found`);
      return false;
    }

    this.broadcast({
      intent: 'task.collaborate',
      payload: {
        taskId,
        requestedBy: this.sessionId,
        role,
        message,
        timestamp: Date.now(),
      },
    });

    console.log(`[TaskCoord] Requested collaboration on task: ${taskId}`);
    return true;
  }

  /**
   * Query available tasks
   */
  queryTasks(filter = {}) {
    const availableTasks = Array.from(this.tasks.values()).filter((task) => {
      if (filter.status && task.status !== filter.status) return false;
      if (filter.type && task.type !== filter.type) return false;
      if (filter.priority && task.priority !== filter.priority) return false;
      return true;
    });

    return availableTasks;
  }

  /**
   * Handle task creation from other sessions
   */
  handleTaskCreate(payload, from) {
    const { task } = payload;
    if (!this.tasks.has(task.id)) {
      this.tasks.set(task.id, task);
      console.log(`[TaskCoord] Discovered task from ${from}: ${task.title}`);
      this.emit('task.available', task);
    }
  }

  /**
   * Handle task claim from other sessions
   */
  handleTaskClaim(payload, from) {
    const { taskId, claimedBy } = payload;
    const task = this.tasks.get(taskId);

    if (task && task.status === 'available') {
      task.status = 'claimed';
      task.claimedBy = claimedBy;
      task.claimedAt = Date.now();
      console.log(`[TaskCoord] Task ${taskId} claimed by ${from}`);
      this.emit('task.claimed.other', task);
    }
  }

  /**
   * Handle task completion from other sessions
   */
  handleTaskComplete(payload, from) {
    const { taskId, result } = payload;
    const task = this.tasks.get(taskId);

    if (task) {
      task.status = 'completed';
      task.completedAt = Date.now();
      task.result = result;
      console.log(`[TaskCoord] Task ${taskId} completed by ${from}`);
      this.emit('task.completed.other', task);
    }
  }

  /**
   * Handle task query
   */
  handleTaskQuery(payload, from) {
    const availableTasks = this.queryTasks({ status: 'available' });

    if (availableTasks.length > 0) {
      this.broadcast({
        intent: 'task.query.response',
        payload: {
          respondingTo: from,
          tasks: availableTasks.slice(0, 10), // Send max 10 tasks
          totalAvailable: availableTasks.length,
        },
      });
    }
  }

  /**
   * Handle collaboration request
   */
  handleCollaboration(payload, from) {
    const { taskId, role, message } = payload;
    console.log(`[TaskCoord] Collaboration request on ${taskId} from ${from}: ${message}`);
    this.emit('collaboration.request', { taskId, from, role, message });
  }

  /**
   * Handle session announcement
   */
  handleSessionAnnounce(payload, from) {
    const { capabilities, sessionName } = payload;
    console.log(
      `[TaskCoord] Session discovered: ${sessionName || from} with capabilities: ${capabilities?.join(', ')}`
    );
    this.emit('session.discovered', { from, ...payload });
  }

  /**
   * Get task statistics
   */
  getStats() {
    const tasks = Array.from(this.tasks.values());
    return {
      total: tasks.length,
      available: tasks.filter((t) => t.status === 'available').length,
      claimed: tasks.filter((t) => t.status === 'claimed').length,
      completed: tasks.filter((t) => t.status === 'completed').length,
      claimedByUs: this.claimedTasks.size,
      createdByUs: tasks.filter((t) => t.createdBy === this.sessionId).length,
    };
  }

  /**
   * Disconnect from bridge
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.connected = false;
    }
  }
}

// Example usage
const isRunDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isRunDirectly) {
  const coordinator = new TaskCoordinator();

  // Set up event listeners
  coordinator.on('task.available', (task) => {
    console.log(`🆕 New task available: ${task.title}`);
  });

  coordinator.on('task.claimed', (task) => {
    console.log(`✅ We claimed task: ${task.title}`);
  });

  coordinator.on('task.completed', (task) => {
    console.log(`🎉 We completed task: ${task.title}`);
  });

  coordinator.on('session.discovered', (session) => {
    console.log(`👋 Discovered session: ${session.sessionName}`);
  });

  // Connect and create example tasks
  coordinator.connect().then(() => {
    console.log('✓ Connected to AI Bridge');
    console.log('Creating example tasks...\n');

    // Create task 1
    coordinator.createTask({
      title: 'Analyze codebase performance',
      description: 'Review src/ directory for performance bottlenecks',
      type: 'analysis',
      priority: 'high',
      metadata: {
        estimatedTime: '10 minutes',
        requiredCapabilities: ['code-analysis', 'performance-profiling'],
      },
    });

    // Create task 2
    coordinator.createTask({
      title: 'Generate test suite',
      description: 'Create comprehensive tests for AI Bridge',
      type: 'testing',
      priority: 'medium',
      metadata: {
        estimatedTime: '15 minutes',
        requiredCapabilities: ['test-generation', 'node-js'],
      },
    });

    // Create task 3
    coordinator.createTask({
      title: 'Update documentation',
      description: 'Add task coordination examples to README',
      type: 'documentation',
      priority: 'low',
      metadata: {
        estimatedTime: '5 minutes',
        requiredCapabilities: ['documentation', 'markdown'],
      },
    });

    console.log('\n📊 Task Stats:', coordinator.getStats());
    console.log('\n🔍 Monitoring for other sessions and task claims...\n');
  });
}
