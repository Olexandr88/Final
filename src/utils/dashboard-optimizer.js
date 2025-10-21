/**
 * Dashboard Optimization Utilities
 * Client-side performance improvements for A2A dashboard
 */

/**
 * Visibility Detection for Reduced Updates
 * Pauses expensive operations when dashboard is not visible
 */
export class VisibilityOptimizer {
  constructor(onVisibilityChange) {
    this.isVisible = !document.hidden;
    this.callbacks = new Set();

    if (onVisibilityChange) {
      this.callbacks.add(onVisibilityChange);
    }

    // Listen for visibility changes
    document.addEventListener('visibilitychange', () => {
      this.isVisible = !document.hidden;
      this._notifyCallbacks();
    });
  }

  /**
   * Register callback for visibility changes
   */
  onChange(callback) {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback); // Unsubscribe function
  }

  /**
   * Notify all callbacks
   */
  _notifyCallbacks() {
    this.callbacks.forEach((cb) => {
      try {
        cb(this.isVisible);
      } catch (error) {
        console.error('Visibility callback error:', error);
      }
    });
  }

  /**
   * Execute function only when visible
   */
  runWhenVisible(fn) {
    if (this.isVisible) {
      fn();
    }
  }
}

/**
 * Adaptive Update Rate Manager
 * Adjusts update frequency based on visibility and activity
 */
export class AdaptiveUpdateManager {
  constructor(options = {}) {
    this.options = {
      normalInterval: options.normalInterval || 5000,
      reducedInterval: options.reducedInterval || 30000,
      idleThreshold: options.idleThreshold || 60000, // 1 minute
      ...options,
    };

    this.isVisible = true;
    this.isIdle = false;
    this.lastActivity = Date.now();
    this.currentInterval = this.options.normalInterval;
    this.intervalId = null;
    this.updateCallback = null;

    // Setup visibility detection
    this.visibilityOptimizer = new VisibilityOptimizer((visible) => {
      this.isVisible = visible;
      this._adjustInterval();
    });

    // Setup idle detection
    this._setupIdleDetection();
  }

  /**
   * Start automatic updates
   */
  start(callback) {
    this.updateCallback = callback;
    this._scheduleUpdate();
  }

  /**
   * Stop automatic updates
   */
  stop() {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Schedule next update
   */
  _scheduleUpdate() {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
    }

    this.intervalId = setTimeout(() => {
      if (this.updateCallback) {
        this.updateCallback();
      }
      this._scheduleUpdate();
    }, this.currentInterval);
  }

  /**
   * Adjust update interval based on visibility and idle state
   */
  _adjustInterval() {
    let newInterval;

    if (!this.isVisible || this.isIdle) {
      newInterval = this.options.reducedInterval;
    } else {
      newInterval = this.options.normalInterval;
    }

    if (newInterval !== this.currentInterval) {
      this.currentInterval = newInterval;
      console.log(`[AdaptiveUpdate] Interval adjusted to ${newInterval}ms`);

      // Reschedule with new interval
      if (this.intervalId) {
        this.stop();
        this._scheduleUpdate();
      }
    }
  }

  /**
   * Setup idle detection
   */
  _setupIdleDetection() {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];

    const resetIdle = () => {
      this.lastActivity = Date.now();
      if (this.isIdle) {
        this.isIdle = false;
        this._adjustInterval();
      }
    };

    events.forEach((event) => {
      document.addEventListener(event, resetIdle, { passive: true });
    });

    // Check for idle state every 10 seconds
    setInterval(() => {
      const timeSinceActivity = Date.now() - this.lastActivity;
      const wasIdle = this.isIdle;

      this.isIdle = timeSinceActivity > this.options.idleThreshold;

      if (wasIdle !== this.isIdle) {
        this._adjustInterval();
      }
    }, 10000);
  }

  /**
   * Force immediate update
   */
  forceUpdate() {
    if (this.updateCallback) {
      this.updateCallback();
    }
  }
}

/**
 * DOM Update Batcher
 * Batches DOM updates to reduce reflows/repaints
 */
export class DOMUpdateBatcher {
  constructor() {
    this.pendingUpdates = [];
    this.scheduled = false;
  }

  /**
   * Schedule DOM update
   */
  schedule(updateFn) {
    this.pendingUpdates.push(updateFn);

    if (!this.scheduled) {
      this.scheduled = true;
      requestAnimationFrame(() => this._flush());
    }
  }

  /**
   * Flush all pending updates
   */
  _flush() {
    const updates = this.pendingUpdates.splice(0);
    this.scheduled = false;

    updates.forEach((updateFn) => {
      try {
        updateFn();
      } catch (error) {
        console.error('DOM update error:', error);
      }
    });
  }

  /**
   * Clear pending updates
   */
  clear() {
    this.pendingUpdates = [];
    this.scheduled = false;
  }
}

/**
 * Virtual Scrolling Helper
 * Renders only visible items in long lists
 */
export class VirtualScrollList {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      itemHeight: options.itemHeight || 50,
      bufferSize: options.bufferSize || 5,
      renderItem: options.renderItem || ((item) => item.toString()),
      ...options,
    };

    this.items = [];
    this.visibleStart = 0;
    this.visibleEnd = 0;

    this._setupScroll();
  }

  /**
   * Set items to display
   */
  setItems(items) {
    this.items = items;
    this._render();
  }

  /**
   * Setup scroll listener
   */
  _setupScroll() {
    this.container.addEventListener(
      'scroll',
      () => {
        this._render();
      },
      { passive: true }
    );
  }

  /**
   * Render visible items
   */
  _render() {
    const scrollTop = this.container.scrollTop;
    const containerHeight = this.container.clientHeight;

    // Calculate visible range with buffer
    const start = Math.max(
      0,
      Math.floor(scrollTop / this.options.itemHeight) - this.options.bufferSize
    );
    const end = Math.min(
      this.items.length,
      Math.ceil((scrollTop + containerHeight) / this.options.itemHeight) + this.options.bufferSize
    );

    // Only update if range changed
    if (start === this.visibleStart && end === this.visibleEnd) {
      return;
    }

    this.visibleStart = start;
    this.visibleEnd = end;

    // Create container with proper height
    const totalHeight = this.items.length * this.options.itemHeight;
    const offsetY = start * this.options.itemHeight;

    const html = `
      <div style="height: ${totalHeight}px; position: relative;">
        <div style="transform: translateY(${offsetY}px);">
          ${this.items
            .slice(start, end)
            .map((item) => this.options.renderItem(item))
            .join('')}
        </div>
      </div>
    `;

    this.container.innerHTML = html;
  }
}

/**
 * Export injection script for dashboard HTML
 */
export function injectDashboardOptimizations() {
  return `
<script>
// Adaptive update manager for stats
const updateManager = new AdaptiveUpdateManager({
  normalInterval: 5000,
  reducedInterval: 30000,
  idleThreshold: 60000
});

// DOM update batcher
const domBatcher = new DOMUpdateBatcher();

// Example: Batch log updates
function addLog(message) {
  domBatcher.schedule(() => {
    const logElement = document.createElement('div');
    logElement.textContent = message;
    document.getElementById('logs').appendChild(logElement);
  });
}

// Start adaptive updates
updateManager.start(() => {
  // Fetch stats only when visible and not idle
  fetchStats();
});
</script>
  `.trim();
}

export default {
  VisibilityOptimizer,
  AdaptiveUpdateManager,
  DOMUpdateBatcher,
  VirtualScrollList,
  injectDashboardOptimizations,
};
