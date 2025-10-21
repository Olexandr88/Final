/**
 * Vibe Coding Hooks System
 * Automated pre/post tool use actions, validation, and notifications
 */

import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class Hook {
  constructor(config) {
    this.name = config.name;
    this.event = config.event;
    this.action = config.action;
    this.enabled = config.enabled !== false;
    this.async = config.async || false;
    this.timeout = config.timeout || 30000;
    this.filter = config.filter;
  }

  shouldRun(context) {
    if (!this.enabled) return false;
    if (!this.filter) return true;

    if (typeof this.filter === 'function') {
      return this.filter(context);
    }

    return true;
  }

  async execute(context) {
    if (typeof this.action === 'function') {
      return await this.action(context);
    }

    if (typeof this.action === 'string') {
      const { stdout, stderr } = await execAsync(this.action, { timeout: this.timeout });
      return { stdout, stderr };
    }

    throw new Error('Hook action must be a function or shell command string');
  }
}

export class HooksSystem extends EventEmitter {
  constructor() {
    super();
    this.hooks = new Map();
    this.hooksByEvent = new Map();
  }

  registerHook(config) {
    const hook = new Hook(config);
    this.hooks.set(hook.name, hook);

    if (!this.hooksByEvent.has(hook.event)) {
      this.hooksByEvent.set(hook.event, []);
    }
    this.hooksByEvent.get(hook.event).push(hook);

    this.emit('hook:registered', hook);
    return hook;
  }

  unregisterHook(name) {
    const hook = this.hooks.get(name);
    if (!hook) return false;

    const eventHooks = this.hooksByEvent.get(hook.event);
    if (eventHooks) {
      const index = eventHooks.indexOf(hook);
      if (index !== -1) {
        eventHooks.splice(index, 1);
      }
    }

    this.hooks.delete(name);
    this.emit('hook:unregistered', hook);
    return true;
  }

  async trigger(event, context = {}) {
    const hooks = this.hooksByEvent.get(event) || [];
    const results = [];

    for (const hook of hooks) {
      if (!hook.shouldRun(context)) {
        continue;
      }

      try {
        this.emit('hook:executing', { hook, context });

        const result = await hook.execute(context);

        results.push({
          hook: hook.name,
          success: true,
          result
        });

        this.emit('hook:executed', { hook, context, result });
      } catch (error) {
        results.push({
          hook: hook.name,
          success: false,
          error: error.message
        });

        this.emit('hook:error', { hook, context, error });
      }
    }

    return results;
  }

  enableHook(name) {
    const hook = this.hooks.get(name);
    if (hook) {
      hook.enabled = true;
      this.emit('hook:enabled', hook);
      return true;
    }
    return false;
  }

  disableHook(name) {
    const hook = this.hooks.get(name);
    if (hook) {
      hook.enabled = false;
      this.emit('hook:disabled', hook);
      return true;
    }
    return false;
  }

  listHooks() {
    return Array.from(this.hooks.values()).map(h => ({
      name: h.name,
      event: h.event,
      enabled: h.enabled,
      async: h.async
    }));
  }

  createDefaultHooks() {
    this.registerHook({
      name: 'auto-format',
      event: 'post-edit',
      action: async (context) => {
        if (context.filePath?.endsWith('.js') || context.filePath?.endsWith('.ts')) {
          return await execAsync(`prettier --write "${context.filePath}"`);
        }
      },
      filter: (context) => context.filePath && !context.filePath.includes('node_modules')
    });

    this.registerHook({
      name: 'auto-test',
      event: 'post-edit',
      action: async (context) => {
        if (context.filePath?.includes('/src/')) {
          return await execAsync('npm test');
        }
      },
      enabled: false
    });

    this.registerHook({
      name: 'block-unsafe-delete',
      event: 'pre-bash',
      action: async (context) => {
        const dangerousPatterns = [/rm\s+-rf\s+\//, /del\s+\/s/, /rmdir\s+\/s/];

        if (dangerousPatterns.some(p => p.test(context.command))) {
          throw new Error('Blocked unsafe deletion command');
        }
      }
    });

    this.registerHook({
      name: 'log-commands',
      event: 'pre-bash',
      action: async (context) => {
        console.log(`[HOOK] Executing command: ${context.command}`);
      }
    });

    this.registerHook({
      name: 'validate-commit',
      event: 'pre-commit',
      action: async (context) => {
        const { stdout } = await execAsync('git diff --cached --name-only');
        const files = stdout.trim().split('\n').filter(Boolean);

        const hasSecrets = files.some(f => f === '.env' || f.includes('credentials'));
        if (hasSecrets) {
          throw new Error('Blocked commit with potential secrets');
        }
      }
    });

    this.registerHook({
      name: 'run-linter',
      event: 'pre-commit',
      action: async () => {
        return await execAsync('npm run lint');
      },
      enabled: false
    });

    return this.listHooks();
  }
}

export default HooksSystem;
