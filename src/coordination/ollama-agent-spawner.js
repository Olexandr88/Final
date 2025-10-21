#!/usr/bin/env node
/**
 * Ollama Agent Spawner - Spawns and manages autonomous Ollama agents
 * Integrates with Meta-Agent Factory and AI Bridge
 * Includes file-based locking to prevent AI session conflicts
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const LOCK_DIR = path.join(PROJECT_ROOT, '.agent-locks');
const AGENTS_DIR = path.join(PROJECT_ROOT, 'src', 'agents');
const DEFAULT_OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

const fetchApi = globalThis.fetch ?? fetch;
if (!globalThis.fetch) {
  globalThis.fetch = fetchApi;
}

/**
 * Ollama Agent Spawner
 * Handles spawning, tracking, and lifecycle management of autonomous Ollama agents
 */
export class OllamaAgentSpawner {
  constructor() {
    this.spawnedAgents = new Map(); // agentId -> { process, config, lockFile }
    this.initialized = false;
    this.modelReadiness = new Map(); // model -> readiness promise
  }

  /**
   * Initialize spawner (create lock directory)
   */
  async initialize() {
    if (this.initialized) return;

    try {
      await fs.mkdir(LOCK_DIR, { recursive: true });
      logger.info('✅ Ollama Agent Spawner initialized', { lockDir: LOCK_DIR });
      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize Ollama Agent Spawner', { error: error.message });
      throw error;
    }
  }

  /**
   * Check if an agent is locked (busy with another AI session)
   * @param {string} agentId - Agent identifier
   * @returns {Promise<boolean>} True if locked
   */
  async isAgentLocked(agentId) {
    const lockFile = path.join(LOCK_DIR, `${agentId}.lock`);

    try {
      const stat = await fs.stat(lockFile);

      // Check if lock is stale (older than 5 minutes)
      const lockAge = Date.now() - stat.mtimeMs;
      if (lockAge > 5 * 60 * 1000) {
        logger.warn(`Stale lock detected for ${agentId}, removing`, { lockAge });
        await fs.unlink(lockFile);
        return false;
      }

      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false; // No lock file = not locked
      }
      throw error;
    }
  }

  /**
   * Acquire lock for an agent
   * @param {string} agentId - Agent identifier
   * @param {string} sessionId - AI session identifier
   * @returns {Promise<string>} Lock file path
   */
  async acquireLock(agentId, sessionId) {
    await this.initialize();

    const lockFile = path.join(LOCK_DIR, `${agentId}.lock`);

    // Check if already locked
    if (await this.isAgentLocked(agentId)) {
      const lockContent = await fs.readFile(lockFile, 'utf-8');
      throw new Error(`Agent ${agentId} is locked by session: ${lockContent}`);
    }

    // Acquire lock
    await fs.writeFile(lockFile, sessionId, 'utf-8');
    logger.info(`🔒 Lock acquired for ${agentId}`, { sessionId, lockFile });

    return lockFile;
  }

  /**
   * Release lock for an agent
   * @param {string} agentId - Agent identifier
   */
  async releaseLock(agentId) {
    const lockFile = path.join(LOCK_DIR, `${agentId}.lock`);

    try {
      await fs.unlink(lockFile);
      logger.info(`🔓 Lock released for ${agentId}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error(`Failed to release lock for ${agentId}`, { error: error.message });
      }
    }
  }

  /**
   * Wait for Ollama service and requested model to become available.
   * @param {string} model - Model name to validate.
   */
  async ensureOllamaReady(model) {
    if (!model) {
      model = process.env.OLLAMA_MODEL || 'llama2';
    }

    if (!this.modelReadiness.has(model)) {
      this.modelReadiness.set(model, this._checkOllamaReadiness(model));
    }

    return this.modelReadiness.get(model);
  }

  async _checkOllamaReadiness(model) {
    const maxAttempts = parseInt(process.env.OLLAMA_BOOT_ATTEMPTS || '5', 10);
    const baseDelay = parseInt(process.env.OLLAMA_BOOT_DELAY || '2000', 10);
    const ollamaUrl = process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_URL;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const tags = await this._fetchOllamaTags(ollamaUrl);
      if (tags) {
        const modelExists = (tags.models || []).some(
          (entry) => entry.name === model || entry.name === `${model}:latest`
        );
        if (!modelExists) {
          logger.error(`?? Ollama model "${model}" is not available.`);
          logger.info('   • Install the model locally:');
          logger.info(`     ollama pull ${model}`);
          throw new Error(
            `Ollama model "${model}" not found. Pull it with "ollama pull ${model}".`
          );
        }

        logger.info(`? Ollama service ready with model "${model}"`);
        return true;
      }

      const delay = baseDelay * attempt;
      logger.warn(
        `??  Ollama service not reachable (attempt ${attempt}/${maxAttempts}). Retrying in ${(delay / 1000).toFixed(1)}s...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    throw new Error(
      `Ollama service at ${ollamaUrl} is not reachable after ${maxAttempts} attempts.`
    );
  }

  async _fetchOllamaTags(ollamaUrl) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      const response = await fetchApi(`${ollamaUrl}/api/tags`, { signal: controller.signal });
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Spawn a new autonomous Ollama agent
   * @param {Object} config - Agent configuration
   * @returns {Promise<Object>} Spawned agent info
   */
  async spawnAgent(config = {}) {
    await this.initialize();

    const {
      agentId = `ollama-agent-${Date.now()}`,
      model = process.env.OLLAMA_MODEL || 'llama3.1:8b',
      bridgeUrl = process.env.BRIDGE_WS || 'ws://localhost:65028',
      sessionId = `session-${Date.now()}`,
      intents = [
        'code.analyze',
        'code.fix',
        'code.refactor',
        'file.read',
        'file.write',
        'command.execute',
        'test.run',
      ],
    } = config;

    await this.ensureOllamaReady(model);

    // Check if agent is already locked
    if (this.spawnedAgents.has(agentId)) {
      throw new Error(`Agent ${agentId} is already running`);
    }

    if (await this.isAgentLocked(agentId)) {
      throw new Error(`Agent ${agentId} is already locked by another session`);
    }

    // Acquire lock
    const lockFile = await this.acquireLock(agentId, sessionId);

    try {
      // Spawn agent process
      const agentScript = path.join(AGENTS_DIR, 'autonomous-ollama-agent.js');

      logger.info(`🚀 Spawning Ollama agent: ${agentId}`, {
        model,
        bridgeUrl,
        agentScript,
      });

      const agentProcess = spawn('node', [agentScript], {
        env: {
          ...process.env,
          AGENT_ID: agentId,
          OLLAMA_MODEL: model,
          BRIDGE_WS: bridgeUrl,
          AGENT_INTENTS: JSON.stringify(intents),
          SESSION_ID: sessionId,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });

      // Track spawned agent
      this.spawnedAgents.set(agentId, {
        process: agentProcess,
        config: {
          agentId,
          model,
          bridgeUrl,
          intents,
          sessionId,
        },
        lockFile,
        spawnedAt: new Date().toISOString(),
        status: 'starting',
      });

      // Handle process output
      agentProcess.stdout.on('data', (data) => {
        logger.info(`[${agentId}] ${data.toString().trim()}`);
      });

      agentProcess.stderr.on('data', (data) => {
        logger.error(`[${agentId}] ${data.toString().trim()}`);
      });

      // Handle process exit
      agentProcess.on('exit', async (code, signal) => {
        logger.info(`Agent ${agentId} exited`, { code, signal });

        // Release lock and remove from tracking
        await this.releaseLock(agentId);
        this.spawnedAgents.delete(agentId);
      });

      agentProcess.on('error', async (error) => {
        logger.error(`Agent ${agentId} error`, { error: error.message });

        // Release lock and remove from tracking
        await this.releaseLock(agentId);
        this.spawnedAgents.delete(agentId);
      });

      // Wait for agent to connect (give it 5 seconds)
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const agentInfo = this.spawnedAgents.get(agentId);
      if (agentInfo) {
        agentInfo.status = 'running';
      }

      logger.info(`✅ Agent ${agentId} spawned successfully`);

      return {
        success: true,
        agentId,
        model,
        bridgeUrl,
        intents,
        sessionId,
        lockFile,
        pid: agentProcess.pid,
        status: 'running',
      };
    } catch (error) {
      // Release lock on failure
      await this.releaseLock(agentId);
      throw error;
    }
  }

  /**
   * Spawn a pool of Ollama agents that share the same configuration.
   * @param {Object} config - Pool configuration (count, baseId, model, etc.).
   * @returns {Promise<Array<Object>>} Pool spawn results
   */
  async spawnAgentPool(config = {}) {
    const {
      count = 1,
      baseId = config.agentId || config.baseId,
      staggerMs = parseInt(process.env.OLLAMA_POOL_STAGGER || '500', 10),
      ...singleConfig
    } = config;

    if (count < 1) {
      throw new Error('Pool size must be at least 1');
    }

    const results = [];
    for (let index = 0; index < count; index++) {
      if (index > 0 && staggerMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, staggerMs));
      }
      const derivedId = baseId ? `${baseId}-${index + 1}` : undefined;
      const spawnResult = await this.spawnAgent({
        ...singleConfig,
        agentId: derivedId,
      });
      results.push(spawnResult);
    }

    return results;
  }

  /**
   * Kill a spawned agent
   * @param {string} agentId - Agent identifier
   */
  async killAgent(agentId) {
    const agentInfo = this.spawnedAgents.get(agentId);

    if (!agentInfo) {
      throw new Error(`Agent ${agentId} not found in spawned agents`);
    }

    logger.info(`🔪 Killing agent: ${agentId}`);

    try {
      // Kill process
      agentInfo.process.kill('SIGTERM');

      // Wait for process to exit
      await new Promise((resolve) => {
        agentInfo.process.once('exit', resolve);

        // Force kill after 5 seconds
        setTimeout(() => {
          if (!agentInfo.process.killed) {
            agentInfo.process.kill('SIGKILL');
          }
          resolve();
        }, 5000);
      });

      // Release lock
      await this.releaseLock(agentId);

      // Remove from tracking
      this.spawnedAgents.delete(agentId);

      logger.info(`✅ Agent ${agentId} killed successfully`);

      return {
        success: true,
        agentId,
        message: 'Agent killed successfully',
      };
    } catch (error) {
      logger.error(`Failed to kill agent ${agentId}`, { error: error.message });
      throw error;
    }
  }

  /**
   * List all spawned agents
   * @returns {Array<Object>} Agent list
   */
  listAgents() {
    const agents = [];

    for (const [agentId, info] of this.spawnedAgents.entries()) {
      agents.push({
        agentId,
        model: info.config.model,
        status: info.status,
        sessionId: info.config.sessionId,
        spawnedAt: info.spawnedAt,
        pid: info.process.pid,
        lockFile: info.lockFile,
      });
    }

    return agents;
  }

  /**
   * Kill all spawned agents
   */
  async killAll() {
    logger.info('🔪 Killing all spawned agents');

    const killPromises = [];

    for (const agentId of this.spawnedAgents.keys()) {
      killPromises.push(
        this.killAgent(agentId).catch((err) => {
          logger.error(`Failed to kill agent ${agentId}`, { error: err.message });
        })
      );
    }

    await Promise.all(killPromises);

    logger.info('✅ All agents killed');
  }

  /**
   * Clean up stale locks
   */
  async cleanupStaleLocks() {
    await this.initialize();

    try {
      const files = await fs.readdir(LOCK_DIR);
      let cleaned = 0;

      for (const file of files) {
        if (!file.endsWith('.lock')) continue;

        const lockFile = path.join(LOCK_DIR, file);
        const stat = await fs.stat(lockFile);
        const lockAge = Date.now() - stat.mtimeMs;

        // Remove locks older than 5 minutes
        if (lockAge > 5 * 60 * 1000) {
          await fs.unlink(lockFile);
          cleaned++;
          logger.info(`🧹 Cleaned stale lock: ${file}`, { lockAge });
        }
      }

      if (cleaned > 0) {
        logger.info(`✅ Cleaned ${cleaned} stale locks`);
      }
    } catch (error) {
      logger.error('Failed to cleanup stale locks', { error: error.message });
    }
  }
}

// Singleton instance
export const ollamaAgentSpawner = new OllamaAgentSpawner();

// CLI usage
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  const command = process.argv[2];

  (async () => {
    await ollamaAgentSpawner.initialize();

    switch (command) {
      case 'spawn':
        const result = await ollamaAgentSpawner.spawnAgent({
          agentId: process.argv[3] || undefined,
          model: process.argv[4] || undefined,
        });
        console.log('Agent spawned:', result);
        break;

      case 'spawn-pool':
        const baseId = process.argv[3] || 'ollama-agent';
        const count = parseInt(process.argv[4] || '2', 10);
        if (Number.isNaN(count) || count < 1) {
          console.error('Usage: node ollama-agent-spawner.js spawn-pool <baseId> <count> [model]');
          process.exit(1);
        }
        const poolResult = await ollamaAgentSpawner.spawnAgentPool({
          baseId,
          count,
          model: process.argv[5] || undefined,
        });
        console.log('Agent pool spawned:', poolResult);
        break;

      case 'list':
        const agents = ollamaAgentSpawner.listAgents();
        console.log('Spawned agents:', agents);
        break;

      case 'kill':
        const agentId = process.argv[3];
        if (!agentId) {
          console.error('Usage: node ollama-agent-spawner.js kill <agentId>');
          process.exit(1);
        }
        await ollamaAgentSpawner.killAgent(agentId);
        console.log(`Agent ${agentId} killed`);
        process.exit(0);
        break;

      case 'kill-all':
        await ollamaAgentSpawner.killAll();
        console.log('All agents killed');
        process.exit(0);
        break;

      case 'cleanup':
        await ollamaAgentSpawner.cleanupStaleLocks();
        console.log('Stale locks cleaned up');
        process.exit(0);
        break;

      default:
        console.log('Usage:');
        console.log('  node ollama-agent-spawner.js spawn [agentId] [model]');
        console.log('  node ollama-agent-spawner.js spawn-pool <baseId> <count> [model]');
        console.log('  node ollama-agent-spawner.js list');
        console.log('  node ollama-agent-spawner.js kill <agentId>');
        console.log('  node ollama-agent-spawner.js kill-all');
        console.log('  node ollama-agent-spawner.js cleanup');
        process.exit(1);
    }
  })().catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}

export default ollamaAgentSpawner;
