/**
 * Resource Lifecycle Manager
 * Cycle 5 Optimization: Prevent memory leaks from timers and event listeners
 *
 * @module utils/resource-manager
 */

/**
 * Manages lifecycle of timers, intervals, and event listeners
 * Ensures proper cleanup to prevent memory leaks
 */
export class ResourceManager {
  constructor(name = 'unnamed') {
    this.name = name;
    this.resources = {
      timers: new Map(), // { id: { type, name, created } }
      listeners: new Map(), // { key: [{ emitter, event, handler }] }
      websockets: new Set(), // Set of WebSocket instances
      streams: new Set(), // Set of streams/file handles
    };
    this.stats = {
      timersCreated: 0,
      listenersAdded: 0,
      cleanupCount: 0,
      lastCleanup: null,
    };
  }

  /**
   * Register a setTimeout handle
   * @param {number} id - Timer ID from setTimeout
   * @param {string} name - Descriptive name for debugging
   * @returns {number} Timer ID
   */
  addTimeout(id, name = 'unnamed') {
    this.resources.timers.set(id, {
      type: 'timeout',
      name,
      created: Date.now(),
    });
    this.stats.timersCreated++;
    return id;
  }

  /**
   * Register a setInterval handle
   * @param {number} id - Interval ID from setInterval
   * @param {string} name - Descriptive name for debugging
   * @returns {number} Interval ID
   */
  addInterval(id, name = 'unnamed') {
    this.resources.timers.set(id, {
      type: 'interval',
      name,
      created: Date.now(),
    });
    this.stats.timersCreated++;
    return id;
  }

  /**
   * Register an event listener
   * @param {EventEmitter} emitter - Event emitter instance
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function
   */
  addListener(emitter, event, handler) {
    const key = `${emitter.constructor.name}:${event}`;

    if (!this.resources.listeners.has(key)) {
      this.resources.listeners.set(key, []);
    }

    this.resources.listeners.get(key).push({ emitter, event, handler });
    this.stats.listenersAdded++;
    emitter.on(event, handler);
  }

  /**
   * Register a WebSocket instance
   * @param {WebSocket} ws - WebSocket instance
   */
  addWebSocket(ws) {
    this.resources.websockets.add(ws);
  }

  /**
   * Register a stream or file handle
   * @param {Stream} stream - Stream instance
   */
  addStream(stream) {
    this.resources.streams.add(stream);
  }

  /**
   * Clear a specific timer
   * @param {number} id - Timer ID
   */
  clearTimer(id) {
    const timer = this.resources.timers.get(id);
    if (timer) {
      if (timer.type === 'interval') {
        clearInterval(id);
      } else {
        clearTimeout(id);
      }
      this.resources.timers.delete(id);
    }
  }

  /**
   * Remove a specific listener
   * @param {EventEmitter} emitter - Event emitter instance
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function
   */
  removeListener(emitter, event, handler) {
    const key = `${emitter.constructor.name}:${event}`;
    const listeners = this.resources.listeners.get(key);

    if (listeners) {
      const index = listeners.findIndex(
        (l) => l.emitter === emitter && l.event === event && l.handler === handler
      );

      if (index !== -1) {
        listeners.splice(index, 1);
        emitter.removeListener(event, handler);

        if (listeners.length === 0) {
          this.resources.listeners.delete(key);
        }
      }
    }
  }

  /**
   * Clean up all managed resources
   * @returns {Object} Cleanup statistics
   */
  cleanup() {
    const cleanupStats = {
      timersCleared: 0,
      listenersRemoved: 0,
      websocketsClosed: 0,
      streamsClosed: 0,
    };

    // Clear all timers
    this.resources.timers.forEach((timer, id) => {
      if (timer.type === 'interval') {
        clearInterval(id);
      } else {
        clearTimeout(id);
      }
      cleanupStats.timersCleared++;
    });
    this.resources.timers.clear();

    // Remove all listeners
    this.resources.listeners.forEach((listeners, key) => {
      listeners.forEach(({ emitter, event, handler }) => {
        try {
          emitter.removeListener(event, handler);
          cleanupStats.listenersRemoved++;
        } catch (error) {
          // Emitter might already be destroyed
        }
      });
    });
    this.resources.listeners.clear();

    // Close all WebSockets
    this.resources.websockets.forEach((ws) => {
      try {
        if (ws.readyState === 1 || ws.readyState === 0) {
          // OPEN or CONNECTING
          ws.close();
        }
        cleanupStats.websocketsClosed++;
      } catch (error) {
        // WebSocket might already be closed
      }
    });
    this.resources.websockets.clear();

    // Close all streams
    this.resources.streams.forEach((stream) => {
      try {
        if (stream.destroy) {
          stream.destroy();
        } else if (stream.close) {
          stream.close();
        }
        cleanupStats.streamsClosed++;
      } catch (error) {
        // Stream might already be closed
      }
    });
    this.resources.streams.clear();

    this.stats.cleanupCount++;
    this.stats.lastCleanup = Date.now();

    return cleanupStats;
  }

  /**
   * Get current resource statistics
   * @returns {Object} Resource stats
   */
  getStats() {
    return {
      name: this.name,
      activeTimers: this.resources.timers.size,
      activeListeners: Array.from(this.resources.listeners.values()).reduce(
        (sum, arr) => sum + arr.length,
        0
      ),
      activeWebSockets: this.resources.websockets.size,
      activeStreams: this.resources.streams.size,
      lifetime: {
        timersCreated: this.stats.timersCreated,
        listenersAdded: this.stats.listenersAdded,
        cleanupCount: this.stats.cleanupCount,
        lastCleanup: this.stats.lastCleanup,
      },
    };
  }

  /**
   * Check for potential leaks (resources that have been active too long)
   * @param {number} maxAge - Maximum age in milliseconds (default: 1 hour)
   * @returns {Array} List of potentially leaked resources
   */
  detectLeaks(maxAge = 3600000) {
    const now = Date.now();
    const potentialLeaks = [];

    this.resources.timers.forEach((timer, id) => {
      const age = now - timer.created;
      if (age > maxAge) {
        potentialLeaks.push({
          type: 'timer',
          id,
          name: timer.name,
          age,
          timerType: timer.type,
        });
      }
    });

    return potentialLeaks;
  }

  /**
   * Create a managed setTimeout
   * @param {Function} callback - Callback function
   * @param {number} delay - Delay in milliseconds
   * @param {string} name - Descriptive name
   * @returns {number} Timer ID
   */
  setTimeout(callback, delay, name = 'unnamed') {
    const id = setTimeout(callback, delay);
    return this.addTimeout(id, name);
  }

  /**
   * Create a managed setInterval
   * @param {Function} callback - Callback function
   * @param {number} interval - Interval in milliseconds
   * @param {string} name - Descriptive name
   * @returns {number} Interval ID
   */
  setInterval(callback, interval, name = 'unnamed') {
    const id = setInterval(callback, interval);
    return this.addInterval(id, name);
  }
}
