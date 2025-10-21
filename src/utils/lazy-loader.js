/**
 * Lazy Module Loader
 * Defers module loading until actually needed, improving startup time
 */
import { logger } from './logger.js';

export class LazyLoader {
  constructor() {
    this.modules = new Map();
  }

  /**
   * Register a module for lazy loading
   * @param {string} name - Module identifier
   * @param {function} importFn - Function that returns import() promise
   */
  register(name, importFn) {
    if (this.modules.has(name)) {
      throw new Error(`Module ${name} already registered`);
    }

    this.modules.set(name, {
      importFn,
      module: null,
      loading: null,
      loadTime: null
    });
  }

  /**
   * Get a lazy-loaded module
   * @param {string} name - Module identifier
   * @returns {Promise<any>} The loaded module
   */
  async get(name) {
    const entry = this.modules.get(name);
    if (!entry) {
      throw new Error(`Module ${name} not registered`);
    }

    // Already loaded
    if (entry.module) {
      return entry.module;
    }

    // Currently loading
    if (entry.loading) {
      return entry.loading;
    }

    // Start loading
    const startTime = Date.now();
    entry.loading = entry.importFn()
      .then(module => {
        entry.module = module;
        entry.loading = null;
        entry.loadTime = Date.now() - startTime;
        logger.debug(`Lazy loaded ${name} in ${entry.loadTime}ms`);
        return module;
      })
      .catch(error => {
        entry.loading = null;
        logger.error(`Failed to lazy load ${name}:`, error);
        throw error;
      });

    return entry.loading;
  }

  /**
   * Check if module is loaded
   */
  isLoaded(name) {
    const entry = this.modules.get(name);
    return entry && entry.module !== null;
  }

  /**
   * Get loading statistics
   */
  getStats() {
    const stats = {
      total: this.modules.size,
      loaded: 0,
      loading: 0,
      pending: 0,
      totalLoadTime: 0
    };

    for (const entry of this.modules.values()) {
      if (entry.module) {
        stats.loaded++;
        stats.totalLoadTime += entry.loadTime || 0;
      } else if (entry.loading) {
        stats.loading++;
      } else {
        stats.pending++;
      }
    }

    return stats;
  }

  /**
   * Preload modules in background
   */
  async preload(names) {
    const promises = names.map(name => this.get(name).catch(err => {
      logger.warn(`Preload failed for ${name}:`, err.message);
    }));

    await Promise.allSettled(promises);
  }

  /**
   * Clear loaded modules (for testing/dev)
   */
  clear() {
    for (const entry of this.modules.values()) {
      entry.module = null;
      entry.loading = null;
      entry.loadTime = null;
    }
  }
}

/**
 * Create a simple lazy module wrapper
 */
export function createLazyModule(importFn) {
  let module = null;
  let loading = null;

  return {
    async get() {
      if (module) return module;
      if (loading) return loading;

      loading = importFn().then(m => {
        module = m;
        loading = null;
        return m;
      });

      return loading;
    },

    isLoaded() {
      return module !== null;
    }
  };
}

// Global lazy loader instance
export const globalLazyLoader = new LazyLoader();

export default LazyLoader;
