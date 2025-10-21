/**
 * Hooks System for Automation
 * Implements the Vibe Coding pattern for event-driven automation
 */

import EventEmitter from 'events';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

export class HooksManager extends EventEmitter {
  constructor() {
    super();
    this.hooks = new Map();
    this.hookHistory = [];
    this.enabled = true;
  }

  /**
   * Register a hook
   * @param {string} event - Event name (PreToolUse, PostToolUse, etc.)
   * @param {string} name - Hook name
   * @param {Function} handler - Hook handler function
   * @param {Object} options - Hook options
   */
  register(event, name, handler, options = {}) {
    if (!this.hooks.has(event)) {
      this.hooks.set(event, []);
    }

    const hook = {
      name,
      handler,
      event,
      enabled: true,
      priority: options.priority || 0,
      async: options.async !== false,
      createdAt: Date.now()
    };

    this.hooks.get(event).push(hook);

    // Sort by priority (higher priority runs first)
    this.hooks.get(event).sort((a, b) => b.priority - a.priority);

    this.emit('hook:registered', { event, name });
  }

  /**
   * Execute hooks for an event
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  async execute(event, data) {
    if (!this.enabled) return data;

    const hooks = this.hooks.get(event) || [];
    const activeHooks = hooks.filter(h => h.enabled);

    if (activeHooks.length === 0) return data;

    this.emit('hooks:executing', { event, count: activeHooks.length });

    let result = data;

    for (const hook of activeHooks) {
      const startTime = Date.now();

      try {
        if (hook.async) {
          result = await hook.handler(result, { event, hookName: hook.name });
        } else {
          result = hook.handler(result, { event, hookName: hook.name });
        }

        const duration = Date.now() - startTime;

        this.hookHistory.push({
          event,
          hookName: hook.name,
          status: 'success',
          duration,
          timestamp: Date.now()
        });

        this.emit('hook:executed', { event, hookName: hook.name, duration });
      } catch (error) {
        const duration = Date.now() - startTime;

        this.hookHistory.push({
          event,
          hookName: hook.name,
          status: 'error',
          error: error.message,
          duration,
          timestamp: Date.now()
        });

        this.emit('hook:error', { event, hookName: hook.name, error: error.message });

        // Continue with other hooks unless the hook throws a critical error
        if (error.critical) {
          throw error;
        }
      }
    }

    // Maintain history size
    if (this.hookHistory.length > 1000) {
      this.hookHistory.shift();
    }

    return result;
  }

  /**
   * Enable/disable a specific hook
   */
  toggleHook(event, name, enabled) {
    const hooks = this.hooks.get(event);
    if (!hooks) return false;

    const hook = hooks.find(h => h.name === name);
    if (!hook) return false;

    hook.enabled = enabled;
    this.emit('hook:toggled', { event, name, enabled });

    return true;
  }

  /**
   * Remove a hook
   */
  unregister(event, name) {
    const hooks = this.hooks.get(event);
    if (!hooks) return false;

    const index = hooks.findIndex(h => h.name === name);
    if (index === -1) return false;

    hooks.splice(index, 1);
    this.emit('hook:unregistered', { event, name });

    return true;
  }

  /**
   * Get all hooks for an event
   */
  getHooks(event) {
    return this.hooks.get(event) || [];
  }

  /**
   * Get hook history
   */
  getHistory(limit = 100) {
    return this.hookHistory.slice(-limit);
  }

  /**
   * Clear hook history
   */
  clearHistory() {
    this.hookHistory = [];
    this.emit('history:cleared');
  }

  /**
   * Enable/disable all hooks
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    this.emit('hooks:toggled', { enabled });
  }
}

/**
 * Built-in hooks based on Vibe Coding patterns
 */
export function createBuiltInHooks(manager) {

  // Auto-formatting hook
  manager.register('PostToolUse', 'auto-format', async (data) => {
    if (data.tool !== 'Edit' && data.tool !== 'Write') return data;

    const filePath = data.params?.file_path;
    if (!filePath) return data;

    // Determine file type and run formatter
    const ext = path.extname(filePath);

    try {
      if (['.js', '.jsx', '.ts', '.tsx', '.json'].includes(ext)) {
        execSync(`npx prettier --write "${filePath}"`, { stdio: 'ignore' });
        console.log(`✓ Formatted: ${filePath}`);
      } else if (['.py'].includes(ext)) {
        execSync(`black "${filePath}"`, { stdio: 'ignore' });
        console.log(`✓ Formatted: ${filePath}`);
      }
    } catch (error) {
      console.warn(`Warning: Could not format ${filePath}: ${error.message}`);
    }

    return data;
  }, { priority: 10 });

  // Logging hook
  manager.register('PreToolUse', 'command-logger', async (data) => {
    if (data.tool === 'Bash') {
      const logFile = path.join(process.cwd(), '.claude', 'command-log.txt');
      const logEntry = `[${new Date().toISOString()}] ${data.params?.command}\n`;

      try {
        await fs.promises.mkdir(path.dirname(logFile), { recursive: true });
        await fs.promises.appendFile(logFile, logEntry);
      } catch (error) {
        // Silent failure
      }
    }
    return data;
  }, { priority: 5 });

  // Blocking unsafe actions hook
  manager.register('PreToolUse', 'safety-guard', (data) => {
    if (data.tool === 'Bash') {
      const command = data.params?.command || '';

      // Block dangerous commands
      const dangerousPatterns = [
        /rm\s+-rf\s+\/(?!tmp|var\/tmp)/,  // Block rm -rf / (except /tmp)
        /sudo\s+rm\s+-rf/,                 // Block sudo rm -rf
        /:\(\)\s*{\s*:\|:&\s*};:/,        // Fork bombs
        /dd\s+if=.*of=\/dev\/(sd|hd)/     // Disk wiping
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(command)) {
          const error = new Error(`Blocked unsafe command: ${command}`);
          error.critical = true;
          throw error;
        }
      }
    }
    return data;
  }, { priority: 100 }); // Highest priority

  // Notification hook
  manager.register('TaskComplete', 'notification', async (data) => {
    const duration = data.duration || 0;

    // Only notify for long-running tasks (> 5 minutes)
    if (duration > 300000) {
      console.log(`\n🔔 Task completed: ${data.taskName || 'Unknown'} (${Math.round(duration / 1000)}s)\n`);
    }

    return data;
  }, { priority: 0 });

  // Test runner hook
  manager.register('PostToolUse', 'auto-test', async (data) => {
    if (data.tool !== 'Edit' && data.tool !== 'Write') return data;

    const filePath = data.params?.file_path;
    if (!filePath || !filePath.includes('/src/')) return data;

    // Run tests after modifying source files
    try {
      console.log('Running tests...');
      execSync('npm test', {
        stdio: 'inherit',
        timeout: 30000,
        cwd: process.cwd()
      });
      console.log('✓ Tests passed');
    } catch (error) {
      console.warn('⚠ Tests failed - review changes');
    }

    return data;
  }, { async: true, priority: 5 });

  return manager;
}

/**
 * Load hooks from configuration file
 */
export async function loadHooksFromConfig(manager, configPath) {
  try {
    const configContent = await fs.promises.readFile(configPath, 'utf-8');
    const config = JSON.parse(configContent);

    for (const hook of config.hooks || []) {
      const handler = new Function('data', 'context', hook.code);
      manager.register(hook.event, hook.name, handler, hook.options || {});
    }

    return true;
  } catch (error) {
    console.error(`Failed to load hooks config: ${error.message}`);
    return false;
  }
}

export default HooksManager;
