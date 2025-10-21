import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs-extra';

/**
 * Hooks Manager - Automation hooks for Claude Code workflow
 * PreToolUse, PostToolUse, and Notification hooks
 */
export class HooksManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.hooksPath = options.hooksPath || path.join(process.cwd(), '.claude', 'hooks');
    this.hooks = {
      preToolUse: [],
      postToolUse: [],
      notification: [],
      subagentStart: [],
      subagentStop: []
    };
    this.enabled = options.enabled !== false;
    this.loadHooks();
  }

  /**
   * Load hooks from configuration
   */
  async loadHooks() {
    await fs.ensureDir(this.hooksPath);

    const hookTypes = Object.keys(this.hooks);

    for (const hookType of hookTypes) {
      const hookFile = path.join(this.hooksPath, `${hookType}.json`);

      if (await fs.pathExists(hookFile)) {
        try {
          const config = await fs.readJson(hookFile);
          this.hooks[hookType] = config.hooks || [];
        } catch (err) {
          console.error(`Failed to load ${hookType} hooks:`, err.message);
        }
      }
    }
  }

  /**
   * Register a new hook
   */
  async registerHook(hookType, hook) {
    if (!this.hooks[hookType]) {
      throw new Error(`Invalid hook type: ${hookType}`);
    }

    const hookConfig = {
      id: hook.id || `${hookType}-${Date.now()}`,
      name: hook.name,
      description: hook.description,
      condition: hook.condition, // Optional condition to execute
      action: hook.action, // Shell command or function
      async: hook.async || false,
      priority: hook.priority || 0,
      enabled: hook.enabled !== false
    };

    this.hooks[hookType].push(hookConfig);
    await this.saveHooks(hookType);

    this.emit('hook-registered', { hookType, hook: hookConfig });

    return hookConfig;
  }

  /**
   * Execute PreToolUse hooks
   * Can block unsafe actions
   */
  async executePreToolUse(tool, args, context = {}) {
    if (!this.enabled) return { allowed: true };

    const results = [];

    for (const hook of this.hooks.preToolUse.filter(h => h.enabled)) {
      // Check condition
      if (hook.condition && !this.evaluateCondition(hook.condition, { tool, args, context })) {
        continue;
      }

      try {
        const result = await this.executeHook(hook, { tool, args, context });
        results.push({ hook: hook.name, result });

        // If hook blocks action
        if (result.blocked) {
          return {
            allowed: false,
            reason: result.reason || `Blocked by hook: ${hook.name}`,
            hook: hook.name
          };
        }
      } catch (err) {
        console.error(`PreToolUse hook ${hook.name} failed:`, err.message);
        results.push({ hook: hook.name, error: err.message });
      }
    }

    return { allowed: true, results };
  }

  /**
   * Execute PostToolUse hooks
   * Auto-formatting, validation, etc.
   */
  async executePostToolUse(tool, args, result, context = {}) {
    if (!this.enabled) return { results: [] };

    const results = [];

    for (const hook of this.hooks.postToolUse.filter(h => h.enabled)) {
      if (hook.condition && !this.evaluateCondition(hook.condition, { tool, args, result, context })) {
        continue;
      }

      try {
        const hookResult = await this.executeHook(hook, { tool, args, result, context });
        results.push({ hook: hook.name, result: hookResult });
      } catch (err) {
        console.error(`PostToolUse hook ${hook.name} failed:`, err.message);
        results.push({ hook: hook.name, error: err.message });
      }
    }

    return { results };
  }

  /**
   * Execute Notification hooks
   */
  async executeNotification(event, data = {}) {
    if (!this.enabled) return;

    for (const hook of this.hooks.notification.filter(h => h.enabled)) {
      if (hook.condition && !this.evaluateCondition(hook.condition, { event, data })) {
        continue;
      }

      try {
        await this.executeHook(hook, { event, data });
      } catch (err) {
        console.error(`Notification hook ${hook.name} failed:`, err.message);
      }
    }
  }

  /**
   * Execute hook action
   */
  async executeHook(hook, payload) {
    const { action, async } = hook;

    // Shell command
    if (typeof action === 'string') {
      return this.executeShellHook(action, payload, async);
    }

    // JavaScript function
    if (typeof action === 'function') {
      return async ? action(payload) : await action(payload);
    }

    throw new Error(`Invalid hook action type: ${typeof action}`);
  }

  /**
   * Execute shell command hook
   */
  executeShellHook(command, payload, isAsync) {
    return new Promise((resolve, reject) => {
      // Replace placeholders in command
      const processedCommand = this.processCommand(command, payload);

      const child = spawn(processedCommand, {
        shell: true,
        cwd: process.cwd(),
        env: { ...process.env, HOOK_PAYLOAD: JSON.stringify(payload) }
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', data => {
        stdout += data.toString();
      });

      child.stderr.on('data', data => {
        stderr += data.toString();
      });

      child.on('close', code => {
        if (code === 0) {
          resolve({ stdout, stderr, exitCode: code });
        } else {
          reject(new Error(`Hook exited with code ${code}: ${stderr}`));
        }
      });

      child.on('error', err => {
        reject(err);
      });

      // For async hooks, don't wait
      if (isAsync) {
        resolve({ async: true, pid: child.pid });
      }
    });
  }

  /**
   * Process command with payload substitution
   */
  processCommand(command, payload) {
    let processed = command;

    // Replace placeholders like {tool}, {args}, etc.
    const replacements = {
      tool: payload.tool,
      args: JSON.stringify(payload.args),
      result: JSON.stringify(payload.result),
      event: payload.event
    };

    for (const [key, value] of Object.entries(replacements)) {
      if (value !== undefined) {
        processed = processed.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
      }
    }

    return processed;
  }

  /**
   * Evaluate hook condition
   */
  evaluateCondition(condition, context) {
    // Simple condition evaluation
    // In production, use safer evaluation like vm2 or expressions

    try {
      // Check for simple conditions
      if (typeof condition === 'string') {
        // File pattern match
        if (condition.startsWith('tool:')) {
          const toolName = condition.substring(5);
          return context.tool === toolName;
        }

        // Event match
        if (condition.startsWith('event:')) {
          const eventName = condition.substring(6);
          return context.event === eventName;
        }

        // File extension
        if (condition.startsWith('ext:')) {
          const ext = condition.substring(4);
          const filePath = context.args?.file_path || context.args?.path || '';
          return filePath.endsWith(ext);
        }
      }

      // Function condition
      if (typeof condition === 'function') {
        return condition(context);
      }

      return true;
    } catch (err) {
      console.error('Condition evaluation error:', err.message);
      return false;
    }
  }

  /**
   * Save hooks configuration
   */
  async saveHooks(hookType) {
    const hookFile = path.join(this.hooksPath, `${hookType}.json`);
    await fs.writeJson(hookFile, { hooks: this.hooks[hookType] }, { spaces: 2 });
  }

  /**
   * Remove hook
   */
  async removeHook(hookType, hookId) {
    if (!this.hooks[hookType]) {
      throw new Error(`Invalid hook type: ${hookType}`);
    }

    this.hooks[hookType] = this.hooks[hookType].filter(h => h.id !== hookId);
    await this.saveHooks(hookType);

    this.emit('hook-removed', { hookType, hookId });
  }

  /**
   * Enable/disable hook
   */
  async setHookEnabled(hookType, hookId, enabled) {
    const hook = this.hooks[hookType]?.find(h => h.id === hookId);
    if (!hook) {
      throw new Error(`Hook ${hookId} not found in ${hookType}`);
    }

    hook.enabled = enabled;
    await this.saveHooks(hookType);

    this.emit('hook-toggled', { hookType, hookId, enabled });
  }

  /**
   * List hooks by type
   */
  listHooks(hookType) {
    if (hookType) {
      return this.hooks[hookType] || [];
    }
    return this.hooks;
  }

  /**
   * Create default hooks
   */
  async createDefaultHooks() {
    // Auto-formatting hook
    await this.registerHook('postToolUse', {
      name: 'Auto-format JavaScript',
      description: 'Run Prettier on edited JavaScript files',
      condition: 'tool:Edit',
      action: 'npx prettier --write {args.file_path}',
      async: true
    });

    // Logging hook
    await this.registerHook('postToolUse', {
      name: 'Log tool usage',
      description: 'Log all tool executions',
      action: 'echo "[$(date)] Tool: {tool}, Args: {args}" >> .claude/logs/tool-usage.log',
      async: true
    });

    // Block dangerous commands
    await this.registerHook('preToolUse', {
      name: 'Block rm -rf',
      description: 'Prevent dangerous file deletions',
      condition: 'tool:Bash',
      action: (payload) => {
        const cmd = payload.args?.command || '';
        if (cmd.includes('rm -rf') || cmd.includes('del /f')) {
          return { blocked: true, reason: 'Dangerous deletion command blocked' };
        }
        return { blocked: false };
      }
    });

    // Notification on task completion
    await this.registerHook('notification', {
      name: 'Task complete notification',
      description: 'Notify when tasks complete',
      condition: 'event:task-complete',
      action: 'echo "Task completed: {event}" | wall',
      async: true
    });

    console.log('Default hooks created');
  }

  /**
   * Execute subagent start hooks
   */
  async executeSubagentStart(agentId, task) {
    return this.executeHooks('subagentStart', { agentId, task });
  }

  /**
   * Execute subagent stop hooks
   */
  async executeSubagentStop(agentId, result) {
    return this.executeHooks('subagentStop', { agentId, result });
  }

  /**
   * Generic hook execution helper
   */
  async executeHooks(hookType, payload) {
    if (!this.enabled) return { results: [] };

    const results = [];

    for (const hook of this.hooks[hookType]?.filter(h => h.enabled) || []) {
      if (hook.condition && !this.evaluateCondition(hook.condition, payload)) {
        continue;
      }

      try {
        const result = await this.executeHook(hook, payload);
        results.push({ hook: hook.name, result });
      } catch (err) {
        console.error(`${hookType} hook ${hook.name} failed:`, err.message);
        results.push({ hook: hook.name, error: err.message });
      }
    }

    return { results };
  }
}

export default HooksManager;
