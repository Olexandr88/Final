/**
 * Dashboard Performance Optimizer
 * Optimizes dashboard rendering, network calls, and resource usage
 */

export class DashboardOptimizer {
  constructor() {
    this.metrics = {
      renderTime: [],
      networkCalls: 0,
      cacheHits: 0,
      cacheMisses: 0,
      memoryUsage: [],
    };

    this.cache = new Map();
    this.lastUpdate = 0;
    this.updateThrottle = 1000; // 1 second minimum between updates
  }

  /**
   * Optimize DOM updates using batch rendering
   */
  batchDOMUpdates(updates) {
    requestAnimationFrame(() => {
      const fragment = document.createDocumentFragment();
      updates.forEach((update) => {
        fragment.appendChild(update);
      });
      return fragment;
    });
  }

  /**
   * Throttle expensive operations
   */
  throttle(func, delay = 1000) {
    let timeout = null;
    let lastExecution = 0;

    return function (...args) {
      const now = Date.now();
      const timeSinceLastExec = now - lastExecution;

      clearTimeout(timeout);

      if (timeSinceLastExec >= delay) {
        func.apply(this, args);
        lastExecution = now;
      } else {
        timeout = setTimeout(() => {
          func.apply(this, args);
          lastExecution = Date.now();
        }, delay - timeSinceLastExec);
      }
    };
  }

  /**
   * Debounce rapid successive calls
   */
  debounce(func, delay = 300) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), delay);
    };
  }

  /**
   * Cache API responses with TTL
   */
  cacheResponse(key, value, ttl = 5000) {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl,
    });
  }

  getCachedResponse(key) {
    const cached = this.cache.get(key);
    if (!cached) {
      this.metrics.cacheMisses++;
      return null;
    }

    const age = Date.now() - cached.timestamp;
    if (age > cached.ttl) {
      this.cache.delete(key);
      this.metrics.cacheMisses++;
      return null;
    }

    this.metrics.cacheHits++;
    return cached.value;
  }

  /**
   * Virtual scrolling for long lists
   */
  virtualScroll(container, items, itemHeight = 50, visibleCount = 10) {
    const totalHeight = items.length * itemHeight;
    const startIndex = Math.floor(container.scrollTop / itemHeight);
    const endIndex = Math.min(startIndex + visibleCount, items.length);

    const visibleItems = items.slice(startIndex, endIndex);
    const offsetY = startIndex * itemHeight;

    return {
      visibleItems,
      offsetY,
      totalHeight,
    };
  }

  /**
   * Optimize canvas rendering
   */
  optimizeCanvas(canvas, ctx, drawFunc) {
    // Use requestAnimationFrame for smooth rendering
    let animationId = null;
    let dirty = true;

    const render = () => {
      if (dirty) {
        drawFunc(ctx);
        dirty = false;
      }
      animationId = requestAnimationFrame(render);
    };

    const markDirty = () => {
      dirty = true;
    };

    render();

    return {
      markDirty,
      stop: () => cancelAnimationFrame(animationId),
    };
  }

  /**
   * Lazy load images and resources
   */
  lazyLoad(elements, options = {}) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const element = entry.target;
          const src = element.dataset.src;
          if (src) {
            element.src = src;
            observer.unobserve(element);
          }
        }
      });
    }, options);

    elements.forEach((el) => observer.observe(el));
    return observer;
  }

  /**
   * Get optimization metrics
   */
  getMetrics() {
    const cacheTotal = this.metrics.cacheHits + this.metrics.cacheMisses;
    const hitRate = cacheTotal > 0 ? ((this.metrics.cacheHits / cacheTotal) * 100).toFixed(2) : 0;

    return {
      ...this.metrics,
      cacheHitRate: `${hitRate}%`,
      cacheSize: this.cache.size,
      avgRenderTime:
        this.metrics.renderTime.length > 0
          ? (
              this.metrics.renderTime.reduce((a, b) => a + b, 0) / this.metrics.renderTime.length
            ).toFixed(2)
          : 0,
    };
  }

  /**
   * Measure performance of operations
   */
  measurePerf(name, func) {
    const start = performance.now();
    const result = func();
    const duration = performance.now() - start;

    this.metrics.renderTime.push(duration);
    if (this.metrics.renderTime.length > 100) {
      this.metrics.renderTime.shift();
    }

    return { result, duration };
  }

  /**
   * Cleanup expired cache entries
   */
  cleanupCache() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Monitor memory usage
   */
  monitorMemory() {
    if (performance.memory) {
      this.metrics.memoryUsage.push({
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        timestamp: Date.now(),
      });

      // Keep only last 100 measurements
      if (this.metrics.memoryUsage.length > 100) {
        this.metrics.memoryUsage.shift();
      }
    }
  }
}

export default DashboardOptimizer;
