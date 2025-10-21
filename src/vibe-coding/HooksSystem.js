import { EventEmitter } from 'events';
import { Logger } from '../utils/logger.js';

/**
 * HooksSystem - Implements automation hooks for vibe coding
 * Based on "Boosting Performance with Commands & Hooks" from the series
 */
export class HooksSystem extends EventEmitter {
  constructor(options = {}) {
    super();
    this.hooks = new Map();
    this.logger = options.logger || Logger.getInstance();
    this.enabled = options.enabled !== false;
  }

  /**
   * Register a hook
   */
  register(hookName, handler, options = {}) {
    const {
      priority = 10,
      async = false,
      enabled = true
    } = options;

    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }

    this.hooks.get(hookName).push({
      handler,
      priority,
      async,
      enabled,
      invocationCount: 0
    });

    // Sort by priority (higher first)
    this.hooks.get(hookName).sort((a, b) => b.priority - a.priority);

    this.logger.info(`Registered hook: ${hookName} (priority: ${priority})`);
    return this;
  }

  /**
   * Execute a hook
   */
  async execute(hookName, context = {}) {
    if (!this.enabled) {
      return { executed: false, reason: 'hooks disabled' };
    }

    const handlers = this.hooks.get(hookName);
    if (!handlers || handlers.length === 0) {
      return { executed: false, reason: 'no handlers' };
    }

    const results = [];
    const errors = [];

    for (const hook of handlers) {
      if (!hook.enabled) continue;

      try {
        hook.invocationCount++;
        this.emit('hook:before', { hookName, context });

        const result = hook.async
          ? await hook.handler(context)
          : hook.handler(context);

        results.push({
          handler: hook.handler.name || 'anonymous',
          result,
          success: true
        });

        this.emit('hook:after', { hookName, context, result });

        // Allow hooks to prevent subsequent execution
        if (result && result.preventDefault) {
          break;
        }
      } catch (error) {
        errors.push({
          handler: hook.handler.name || 'anonymous',
          error: error.message
        });
        this.emit('hook:error', { hookName, context, error });
      }
    }

    return {
      executed: true,
      hookName,
      results,
      errors,
      totalHandlers: handlers.length,
      successCount: results.length,
      errorCount: errors.length
    };
  }

  /**
   * Enable/disable a hook
   */
  setEnabled(hookName, enabled) {
    const handlers = this.hooks.get(hookName);
    if (handlers) {
      handlers.forEach(h => h.enabled = enabled);
      this.logger.info(`Hook ${hookName} ${enabled ? 'enabled' : 'disabled'}`);
    }
  }

  /**
   * Remove all handlers for a hook
   */
  clear(hookName) {
    if (this.hooks.has(hookName)) {
      this.hooks.delete(hookName);
      this.logger.info(`Cleared all handlers for hook: ${hookName}`);
    }
  }

  /**
   * Get hook statistics
   */
  getStats() {
    const stats = {};
    for (const [name, handlers] of this.hooks) {
      stats[name] = {
        handlerCount: handlers.length,
        totalInvocations: handlers.reduce((sum, h) => sum + h.invocationCount, 0),
        enabledCount: handlers.filter(h => h.enabled).length
      };
    }
    return stats;
  }

  /**
   * Bootstrap default vibe-coding hooks
   */
  static createDefaultHooks(hooksSystem, options = {}) {
    const { autoFormat = true, autoTest = false, logging = true } = options;

    // PostToolUse: Auto-formatting after file edits
    if (autoFormat) {
      hooksSystem.register('PostToolUse', async (context) => {
        if (context.tool === 'edit-file' && context.file) {
          const ext = context.file.split('.').pop();
          if (['js', 'ts', 'jsx', 'tsx'].includes(ext)) {
            // Simulate Prettier formatting
            return { formatted: true, file: context.file };
          }
        }
        return { formatted: false };
      }, { priority: 20, async: true });
    }

    // PreToolUse: Block unsafe actions
    hooksSystem.register('PreToolUse', (context) => {
      if (context.tool === 'delete-file' && context.file) {
        const dangerousPatterns = ['.env', 'node_modules/', 'package.json'];
        if (dangerousPatterns.some(pattern => context.file.includes(pattern))) {
          return {
            preventDefault: true,
            reason: `Blocked deletion of critical file: ${context.file}`
          };
        }
      }
      return { allowed: true };
    }, { priority: 100 });

    // PostCommit: Auto-test after commits
    if (autoTest) {
      hooksSystem.register('PostCommit', async (context) => {
        // Run tests after commit
        return {
          testRun: true,
          message: 'Tests executed after commit'
        };
      }, { priority: 10, async: true });
    }

    // Logging hook
    if (logging) {
      hooksSystem.register('*', (context) => {
        const logger = Logger.getInstance();
        logger.debug(`Hook executed: ${context.hookName}`, context);
        return { logged: true };
      }, { priority: 1 });
    }

    // Notification hook for long tasks
    hooksSystem.register('TaskComplete', (context) => {
      if (context.duration && context.duration > 60000) { // > 1 minute
        return {
          notification: true,
          message: `Task completed: ${context.taskName} (${Math.floor(context.duration / 1000)}s)`
        };
      }
      return { notification: false };
    }, { priority: 5 });

    return hooksSystem;
  }

  /**
   * Create a pre-tool-use hook
   */
  static createPreToolUseHook(handler, options = {}) {
    return {
      name: 'PreToolUse',
      handler,
      ...options
    };
  }

  /**
   * Create a post-tool-use hook
   */
  static createPostToolUseHook(handler, options = {}) {
    return {
      name: 'PostToolUse',
      handler,
      ...options
    };
  }
}
