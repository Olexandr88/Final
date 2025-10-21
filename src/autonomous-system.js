#!/usr/bin/env node
/**
 * Unified Autonomous System
 * Coordinates multiple AI agents with session locking to prevent conflicts
 * Provides real code execution capabilities via Ollama
 */

import { spawn } from 'child_process';
import { SessionLockManager } from './coordination/session-lock-manager.js';
import { logger } from './utils/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class AutonomousSystem {
  constructor(config = {}) {
    this.sessionId = config.sessionId || `auto-session-${randomUUID()}`;
    this.lockManager = new SessionLockManager(this.sessionId);
    this.processes = new Map();
    this.config = {
      bridgeUrl: process.env.BRIDGE_WS || 'ws://localhost:65028',
      ollamaModel: process.env.OLLAMA_MODEL || 'llama3.1',
      ...config,
    };
  }

  /**
   * Initialize the autonomous system
   */
  async initialize() {
    logger.info('🚀 Initializing Autonomous System', {
      sessionId: this.sessionId,
    });

    try {
      // Initialize lock manager
      await this.lockManager.initialize();

      // Acquire system-level lock
      const systemLockAcquired = await this.lockManager.acquireLock('autonomous-system', {
        timeout: 60000,
      });

      if (!systemLockAcquired) {
        throw new Error('Another autonomous system is already running');
      }

      logger.info('✅ Autonomous System initialized', {
        sessionId: this.sessionId,
      });

      return true;
    } catch (error) {
      logger.error('Failed to initialize autonomous system', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Start AI Bridge
   */
  async startBridge() {
    return this.lockManager.withLock('ai-bridge', async () => {
      logger.info('🌉 Starting AI Bridge...');

      const bridgeProcess = spawn('node', [path.join(__dirname, 'ai-bridge.js')], {
        env: { ...process.env },
        stdio: 'inherit',
      });

      this.processes.set('ai-bridge', bridgeProcess);

      // Wait for bridge to be ready
      await this._sleep(3000);

      logger.info('✅ AI Bridge started');

      return bridgeProcess;
    });
  }

  /**
   * Start Meta-Agent Factory
   */
  async startMetaAgentFactory() {
    return this.lockManager.withLock('meta-agent-factory', async () => {
      logger.info('🏭 Starting Meta-Agent Factory...');

      const factoryProcess = spawn(
        'node',
        [path.join(__dirname, 'agents', 'meta-agent-factory.js')],
        {
          env: { ...process.env, BRIDGE_WS: this.config.bridgeUrl },
          stdio: 'inherit',
        }
      );

      this.processes.set('meta-agent-factory', factoryProcess);

      // Wait for factory to be ready
      await this._sleep(2000);

      logger.info('✅ Meta-Agent Factory started');

      return factoryProcess;
    });
  }

  /**
   * Start Autonomous Ollama Agent
   */
  async startOllamaAgent() {
    return this.lockManager.withLock('ollama-agent', async () => {
      logger.info('🤖 Starting Autonomous Ollama Agent...');

      const ollamaProcess = spawn(
        'node',
        [path.join(__dirname, 'agents', 'autonomous-ollama-agent.js')],
        {
          env: {
            ...process.env,
            BRIDGE_WS: this.config.bridgeUrl,
            OLLAMA_MODEL: this.config.ollamaModel,
          },
          stdio: 'inherit',
        }
      );

      this.processes.set('ollama-agent', ollamaProcess);

      // Wait for agent to be ready
      await this._sleep(2000);

      logger.info('✅ Autonomous Ollama Agent started', {
        model: this.config.ollamaModel,
      });

      return ollamaProcess;
    });
  }

  /**
   * Execute autonomous task with lock coordination
   * @param {Object} task - Task configuration
   * @returns {Promise<Object>} Task result
   */
  async executeTask(task) {
    const { name, description, files = [], operations = [] } = task;

    logger.info('📋 Executing autonomous task', {
      name,
      description,
      fileCount: files.length,
      operationCount: operations.length,
    });

    // Acquire locks for all files
    const fileLocks = [];
    for (const file of files) {
      const locked = await this.lockManager.acquireLock(`file:${file}`, {
        timeout: 30000,
      });

      if (!locked) {
        // Release any locks we acquired
        for (const lockedFile of fileLocks) {
          await this.lockManager.releaseLock(`file:${lockedFile}`);
        }
        throw new Error(`Failed to acquire lock on file: ${file}`);
      }

      fileLocks.push(file);
    }

    try {
      // Execute task via AI Bridge message
      const result = await this._sendTaskToOllama(task);

      logger.info('✅ Autonomous task completed', {
        name,
        success: result.success,
      });

      return result;
    } finally {
      // Release all file locks
      for (const file of fileLocks) {
        await this.lockManager.releaseLock(`file:${file}`);
      }
    }
  }

  /**
   * Send task to Ollama agent via AI Bridge
   * @private
   */
  async _sendTaskToOllama(task) {
    // In a real implementation, this would use the AI Bridge HTTP API
    // or WebSocket client to send the task to the Ollama agent

    logger.info('📨 Sending task to Ollama agent', {
      task: task.name,
    });

    // Placeholder - would use actual HTTP/WS client
    return {
      success: true,
      task: task.name,
      message: 'Task sent to Ollama agent (implement HTTP client)',
    };
  }

  /**
   * Start all components
   */
  async startAll() {
    logger.info('🚀 Starting all autonomous system components...');

    try {
      // Start in order: Bridge → Factory → Ollama
      await this.startBridge();
      await this.startMetaAgentFactory();
      await this.startOllamaAgent();

      logger.info('✅ All autonomous system components started');

      return true;
    } catch (error) {
      logger.error('Failed to start all components', {
        error: error.message,
      });

      await this.shutdown();
      throw error;
    }
  }

  /**
   * Shutdown all components
   */
  async shutdown() {
    logger.info('🛑 Shutting down autonomous system...');

    // Kill all processes
    for (const [name, process] of this.processes) {
      logger.info(`Terminating ${name}...`);
      process.kill('SIGTERM');
    }

    this.processes.clear();

    // Release all locks
    await this.lockManager.releaseAll();

    logger.info('✅ Autonomous system shut down complete');
  }

  /**
   * Check if another session is using a resource
   * @param {string} resourcePath - Resource to check
   * @returns {Promise<Object|null>} Lock info or null
   */
  async checkResourceLock(resourcePath) {
    return await this.lockManager.isLocked(resourcePath);
  }

  /**
   * Sleep utility
   * @private
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get system status
   */
  getStatus() {
    return {
      sessionId: this.sessionId,
      processes: Array.from(this.processes.keys()),
      activeLocks: this.lockManager.locks.size,
      bridgeUrl: this.config.bridgeUrl,
      ollamaModel: this.config.ollamaModel,
    };
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  const system = new AutonomousSystem();

  async function main() {
    try {
      await system.initialize();
      await system.startAll();

      logger.info('\n' + '='.repeat(60));
      logger.info('🎯 AUTONOMOUS SYSTEM RUNNING');
      logger.info('='.repeat(60));
      logger.info(`Session ID: ${system.sessionId}`);
      logger.info(`Bridge URL: ${system.config.bridgeUrl}`);
      logger.info(`Ollama Model: ${system.config.ollamaModel}`);
      logger.info('='.repeat(60) + '\n');

      // Handle shutdown
      process.on('SIGINT', async () => {
        logger.info('\n👋 Received SIGINT, shutting down...');
        await system.shutdown();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        logger.info('\n👋 Received SIGTERM, shutting down...');
        await system.shutdown();
        process.exit(0);
      });
    } catch (error) {
      logger.error('Autonomous system startup failed', {
        error: error.message,
        stack: error.stack,
      });
      process.exit(1);
    }
  }

  main();
}

export default AutonomousSystem;
