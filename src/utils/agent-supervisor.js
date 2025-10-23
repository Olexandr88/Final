#!/usr/bin/env node
/**
 * Agent Supervisor - Auto-restart and health monitoring for A2A agents
 * Watches agent processes and restarts them on critical failures
 */

import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { AGENTS, NETWORK } from '../config/cpu-optimized-constants.js';

export class AgentSupervisor extends EventEmitter {
  constructor({ logger = console } = {}) {
    super();
    this.logger = logger;
    this.agents = new Map(); // agentId -> { process, config, restarts, lastRestart, health }
    this.restartCounts = new Map(); // agentId -> count (resets after window)
  }

  /**
   * Register and start an agent with supervision
   * @param {object} config - Agent configuration
   * @returns {string} agentId
   */
  startAgent(config) {
    const {
      id,
      command,
      args = [],
      env = {},
      cwd = process.cwd(),
      autoRestart = true,
      maxRestarts = AGENTS.MAX_RESTART_ATTEMPTS,
      restartDelay = AGENTS.RESTART_BACKOFF_BASE_MS,
    } = config;

    if (!id || !command) {
      throw new Error('Agent config must include id and command');
    }

    if (this.agents.has(id)) {
      this.logger.warn(`[Supervisor] Agent ${id} already running`);
      return id;
    }

    const agentConfig = {
      id,
      command,
      args,
      env: { ...process.env, ...env },
      cwd,
      autoRestart,
      maxRestarts,
      restartDelay,
    };

    this._spawnAgent(agentConfig);
    this.logger.log(`[Supervisor] Started agent ${id}`);

    return id;
  }

  /**
   * Spawn agent process and attach handlers
   * @private
   */
  _spawnAgent(config) {
    const { id, command, args, env, cwd } = config;

    const proc = spawn(command, args, {
      env,
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      detached: false,
    });

    const agentData = {
      process: proc,
      config,
      restarts: 0,
      lastRestart: Date.now(),
      health: {
        status: 'starting',
        lastHeartbeat: Date.now(),
        pid: proc.pid,
      },
    };

    this.agents.set(id, agentData);

    // Attach process event handlers
    proc.stdout.on('data', (data) => {
      const msg = data.toString().trim();
      this.logger.log(`[${id}] ${msg}`);

      // Update heartbeat on output
      if (this.agents.has(id)) {
        this.agents.get(id).health.lastHeartbeat = Date.now();
        this.agents.get(id).health.status = 'healthy';
      }

      this.emit('agentLog', { id, message: msg });
    });

    proc.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      this.logger.error(`[${id}] ERROR: ${msg}`);

      if (this.agents.has(id)) {
        this.agents.get(id).health.lastError = msg;
      }

      this.emit('agentError', { id, error: msg });
    });

    proc.on('exit', (code, signal) => {
      this.logger.warn(`[Supervisor] Agent ${id} exited (code: ${code}, signal: ${signal})`);

      const agentData = this.agents.get(id);
      if (!agentData) return;

      this.agents.delete(id);
      this.emit('agentExit', { id, code, signal });

      // Auto-restart logic
      if (agentData.config.autoRestart && code !== 0) {
        this._handleRestart(id, agentData);
      }
    });

    proc.on('error', (error) => {
      this.logger.error(`[Supervisor] Agent ${id} process error:`, error.message);
      this.emit('agentProcessError', { id, error: error.message });
    });
  }

  /**
   * Handle agent restart with backoff
   * @private
   */
  _handleRestart(id, agentData) {
    const { config, restarts } = agentData;
    const { maxRestarts, restartDelay } = config;

    // Check restart window (reset counter if outside window)
    const now = Date.now();
    const timeSinceLastRestart = now - agentData.lastRestart;

    if (timeSinceLastRestart > AGENTS.RESTART_RESET_WINDOW_MS) {
      this.restartCounts.set(id, 0);
    }

    const currentRestarts = this.restartCounts.get(id) || 0;

    if (currentRestarts >= maxRestarts) {
      this.logger.error(
        `[Supervisor] Agent ${id} exceeded max restart attempts (${maxRestarts}). Stopping supervision.`
      );
      this.emit('agentFailed', { id, reason: 'max_restarts_exceeded' });
      return;
    }

    // Exponential backoff
    const delay = Math.min(
      restartDelay * Math.pow(2, currentRestarts),
      NETWORK.RECONNECT_MAX_DELAY_MS
    );

    this.logger.log(
      `[Supervisor] Restarting agent ${id} in ${delay}ms (attempt ${currentRestarts + 1}/${maxRestarts})`
    );

    this.restartCounts.set(id, currentRestarts + 1);

    setTimeout(() => {
      this._spawnAgent({
        ...config,
        restarts: currentRestarts + 1,
        lastRestart: Date.now(),
      });

      this.emit('agentRestarted', { id, attempt: currentRestarts + 1 });
    }, delay);
  }

  /**
   * Stop an agent gracefully
   * @param {string} id - Agent ID
   * @param {number} timeout - Graceful shutdown timeout (ms)
   * @returns {Promise<boolean>} True if stopped successfully
   */
  async stopAgent(id, timeout = AGENTS.GRACEFUL_SHUTDOWN_TIMEOUT_MS) {
    const agentData = this.agents.get(id);

    if (!agentData) {
      this.logger.warn(`[Supervisor] Agent ${id} not found`);
      return false;
    }

    const { process: proc } = agentData;

    // Disable auto-restart before killing
    agentData.config.autoRestart = false;

    return new Promise((resolve) => {
      const killTimeout = setTimeout(() => {
        this.logger.warn(`[Supervisor] Force killing agent ${id} (pid: ${proc.pid})`);
        proc.kill('SIGKILL');
        resolve(true);
      }, timeout);

      proc.once('exit', () => {
        clearTimeout(killTimeout);
        this.agents.delete(id);
        this.logger.log(`[Supervisor] Agent ${id} stopped gracefully`);
        resolve(true);
      });

      // Send SIGTERM first for graceful shutdown
      proc.kill('SIGTERM');
    });
  }

  /**
   * Stop all agents
   * @returns {Promise<void>}
   */
  async stopAll() {
    const stopPromises = Array.from(this.agents.keys()).map((id) => this.stopAgent(id));
    await Promise.allSettled(stopPromises);
    this.logger.log('[Supervisor] All agents stopped');
  }

  /**
   * Get agent health status
   * @param {string} id - Agent ID
   * @returns {object|null} Health status
   */
  getAgentHealth(id) {
    const agentData = this.agents.get(id);
    if (!agentData) return null;

    const { health } = agentData;
    const timeSinceHeartbeat = Date.now() - health.lastHeartbeat;

    let status = 'healthy';
    if (timeSinceHeartbeat > AGENTS.HEARTBEAT_WARNING_THRESHOLD_MS) {
      status = 'unhealthy';
    } else if (timeSinceHeartbeat > AGENTS.HEARTBEAT_HEALTHY_THRESHOLD_MS) {
      status = 'degraded';
    }

    return {
      ...health,
      status,
      timeSinceHeartbeat,
      restartCount: this.restartCounts.get(id) || 0,
    };
  }

  /**
   * Get all agent statuses
   * @returns {object} Map of agent statuses
   */
  getAllHealth() {
    const statuses = {};
    for (const id of this.agents.keys()) {
      statuses[id] = this.getAgentHealth(id);
    }
    return statuses;
  }

  /**
   * Check if agent is running
   * @param {string} id - Agent ID
   * @returns {boolean}
   */
  isRunning(id) {
    return this.agents.has(id);
  }

  /**
   * Get list of running agent IDs
   * @returns {string[]}
   */
  listAgents() {
    return Array.from(this.agents.keys());
  }
}

export default AgentSupervisor;
