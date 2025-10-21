#!/usr/bin/env node
/**
 * Autonomous Coordinator
 * Unified system that coordinates multiple AI sessions, agents, and tools
 * Uses file-based locking to prevent conflicts between multiple Claude sessions
 *
 * Architecture:
 * - SessionLockManager: Prevents AI session conflicts
 * - FileLockManager: Prevents file-level write conflicts
 * - Meta-Agent Factory: Creates and spawns specialized agents
 * - AI Bridge: Central WebSocket hub for agent coordination
 * - AutonomousOllamaAgent: Local LLM with real tool execution
 */

import { SessionLockManager } from './session-lock-manager.js';
import { FileLockManager } from './file-lock-manager.js';
import { logger } from '../utils/logger.js';
import { spawn } from 'child_process';
import path from 'path';
import { randomUUID } from 'crypto';

export class AutonomousCoordinator {
  constructor(options = {}) {
    this.sessionId = options.sessionId || `coordinator-${randomUUID()}`;
    this.sessionLockManager = new SessionLockManager(this.sessionId);
    this.fileLockManager = new FileLockManager();

    this.processes = new Map(); // Track spawned processes
    this.activeOperations = new Set(); // Track ongoing operations

    this.config = {
      bridgeUrl: options.bridgeUrl || 'ws://localhost:65028',
      bridgeHttpPort: options.bridgeHttpPort || 65029,
      autoStartBridge: options.autoStartBridge !== false,
      autoStartMetaFactory: options.autoStartMetaFactory !== false,
      ...options,
    };

    logger.info('Autonomous Coordinator initializing', {
      sessionId: this.sessionId,
      config: this.config,
    });
  }

  /**
   * Initialize the complete autonomous system
   */
  async initialize() {
    try {
      logger.info('🚀 Initializing autonomous system...');

      // 1. Initialize session locking
      await this.sessionLockManager.initialize();
      logger.info('✅ Session lock manager ready');

      // 2. Acquire global coordination lock
      const coordLockAcquired = await this.sessionLockManager.acquireLock(
        'global:autonomous-coordination',
        { timeout: 60000, retries: 5 }
      );

      if (!coordLockAcquired) {
        logger.warn('⚠️  Another coordinator session is active. Running in follower mode.');
        this.isLeader = false;
      } else {
        logger.info('👑 This session is the leader coordinator');
        this.isLeader = true;
      }

      // 3. Start AI Bridge (if leader and auto-start enabled)
      if (this.isLeader && this.config.autoStartBridge) {
        await this.startAIBridge();
      }

      // 4. Start Meta-Agent Factory (if auto-start enabled)
      if (this.config.autoStartMetaFactory) {
        await this.startMetaAgentFactory();
      }

      logger.info('✅ Autonomous system initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize autonomous system', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Start the AI Bridge WebSocket hub
   */
  async startAIBridge() {
    const bridgeLockAcquired = await this.sessionLockManager.acquireLock('process:ai-bridge', {
      timeout: 5000,
    });

    if (!bridgeLockAcquired) {
      logger.info('AI Bridge already running in another session');
      return;
    }

    try {
      const bridgePath = path.join(process.cwd(), 'src', 'ai-bridge.js');

      const bridgeProcess = spawn('node', [bridgePath], {
        stdio: 'inherit',
        env: {
          ...process.env,
          PORT: this.config.bridgeHttpPort,
          WS_PORT: this.config.bridgeUrl.split(':').pop(),
        },
        detached: false,
      });

      this.processes.set('ai-bridge', {
        process: bridgeProcess,
        startedAt: Date.now(),
        type: 'infrastructure',
      });

      bridgeProcess.on('error', (error) => {
        logger.error('AI Bridge process error', { error: error.message });
      });

      bridgeProcess.on('exit', (code) => {
        logger.warn('AI Bridge process exited', { code });
        this.processes.delete('ai-bridge');
        this.sessionLockManager.releaseLock('process:ai-bridge');
      });

      // Wait for bridge to be ready
      await this._waitForBridgeReady();

      logger.info('✅ AI Bridge started successfully');
    } catch (error) {
      logger.error('Failed to start AI Bridge', { error: error.message });
      await this.sessionLockManager.releaseLock('process:ai-bridge');
      throw error;
    }
  }

  /**
   * Start the Meta-Agent Factory
   */
  async startMetaAgentFactory() {
    const factoryLockAcquired = await this.sessionLockManager.acquireLock(
      'process:meta-agent-factory',
      { timeout: 5000 }
    );

    if (!factoryLockAcquired) {
      logger.info('Meta-Agent Factory already running in another session');
      return;
    }

    try {
      const factoryPath = path.join(process.cwd(), 'src', 'agents', 'meta-agent-factory.js');

      const factoryProcess = spawn('node', [factoryPath], {
        stdio: 'inherit',
        env: process.env,
        detached: false,
      });

      this.processes.set('meta-agent-factory', {
        process: factoryProcess,
        startedAt: Date.now(),
        type: 'infrastructure',
      });

      factoryProcess.on('error', (error) => {
        logger.error('Meta-Agent Factory process error', { error: error.message });
      });

      factoryProcess.on('exit', (code) => {
        logger.warn('Meta-Agent Factory process exited', { code });
        this.processes.delete('meta-agent-factory');
        this.sessionLockManager.releaseLock('process:meta-agent-factory');
      });

      // Wait a bit for factory to connect to bridge
      await new Promise((resolve) => setTimeout(resolve, 2000));

      logger.info('✅ Meta-Agent Factory started successfully');
    } catch (error) {
      logger.error('Failed to start Meta-Agent Factory', { error: error.message });
      await this.sessionLockManager.releaseLock('process:meta-agent-factory');
      throw error;
    }
  }

  /**
   * Spawn an Autonomous Ollama Agent
   */
  async spawnAutonomousAgent(config = {}) {
    const agentId = config.agentId || `ollama-agent-${randomUUID().slice(0, 8)}`;

    const agentLockAcquired = await this.sessionLockManager.acquireLock(`process:${agentId}`, {
      timeout: 5000,
    });

    if (!agentLockAcquired) {
      logger.warn(`Agent ${agentId} already running`);
      return null;
    }

    try {
      const agentPath = path.join(process.cwd(), 'src', 'agents', 'autonomous-ollama-agent.js');

      const agentProcess = spawn('node', [agentPath], {
        stdio: 'inherit',
        env: {
          ...process.env,
          AGENT_ID: agentId,
          OLLAMA_MODEL: config.model || 'llama3.1',
          BRIDGE_WS: this.config.bridgeUrl,
        },
        detached: false,
      });

      this.processes.set(agentId, {
        process: agentProcess,
        startedAt: Date.now(),
        type: 'agent',
        config,
      });

      agentProcess.on('error', (error) => {
        logger.error(`Agent ${agentId} process error`, { error: error.message });
      });

      agentProcess.on('exit', (code) => {
        logger.info(`Agent ${agentId} process exited`, { code });
        this.processes.delete(agentId);
        this.sessionLockManager.releaseLock(`process:${agentId}`);
      });

      logger.info(`✅ Autonomous agent ${agentId} spawned`);
      return agentId;
    } catch (error) {
      logger.error(`Failed to spawn agent ${agentId}`, { error: error.message });
      await this.sessionLockManager.releaseLock(`process:${agentId}`);
      throw error;
    }
  }

  /**
   * Execute a file operation with automatic locking
   * @param {string} operation - Operation type (read, write, edit, etc.)
   * @param {string} filePath - Target file path
   * @param {Function} operationFn - Operation to perform
   * @returns {Promise<any>} Operation result
   */
  async executeFileOperation(operation, filePath, operationFn) {
    const operationId = `${operation}:${filePath}:${Date.now()}`;
    this.activeOperations.add(operationId);

    try {
      // Acquire session-level lock (across AI sessions)
      const sessionLockAcquired = await this.sessionLockManager.acquireLock(`file:${filePath}`, {
        timeout: 30000,
      });

      if (!sessionLockAcquired) {
        throw new Error(`Another AI session is working on ${filePath}`);
      }

      // Acquire file-level lock (across agents)
      const fileLockAcquired = await this.fileLockManager.acquireLock(
        this.sessionId,
        filePath,
        30000
      );

      if (!fileLockAcquired) {
        await this.sessionLockManager.releaseLock(`file:${filePath}`);
        throw new Error(`Another agent is working on ${filePath}`);
      }

      logger.info(`🔒 Acquired locks for ${operation} on ${filePath}`);

      // Execute the operation
      const result = await operationFn();

      logger.info(`✅ Completed ${operation} on ${filePath}`);
      return result;
    } finally {
      // Release locks in reverse order
      await this.fileLockManager.releaseLock(this.sessionId, filePath);
      await this.sessionLockManager.releaseLock(`file:${filePath}`);
      this.activeOperations.delete(operationId);
    }
  }

  /**
   * Wait for AI Bridge to be ready
   * @private
   */
  async _waitForBridgeReady() {
    const maxAttempts = 30;
    const delayMs = 1000;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const http = await import('http');
        const url = new URL(`http://localhost:${this.config.bridgeHttpPort}/health`);

        await new Promise((resolve, reject) => {
          const req = http.get(url, (res) => {
            if (res.statusCode === 200) {
              resolve();
            } else {
              reject(new Error(`Bridge not ready: ${res.statusCode}`));
            }
          });
          req.on('error', reject);
          req.setTimeout(1000);
        });

        return; // Bridge is ready
      } catch (error) {
        if (i < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    throw new Error('AI Bridge failed to start within timeout');
  }

  /**
   * Get system status
   */
  getStatus() {
    return {
      sessionId: this.sessionId,
      isLeader: this.isLeader,
      processes: Array.from(this.processes.entries()).map(([id, info]) => ({
        id,
        type: info.type,
        uptime: Date.now() - info.startedAt,
        config: info.config,
      })),
      activeOperations: Array.from(this.activeOperations),
      locks: {
        session: this.sessionLockManager.locks.size,
        file: this.fileLockManager.getStats(),
      },
    };
  }

  /**
   * Gracefully shutdown the coordinator
   */
  async shutdown() {
    logger.info('🛑 Shutting down autonomous coordinator...');

    // Kill all spawned processes
    for (const [id, info] of this.processes) {
      try {
        logger.info(`Stopping process: ${id}`);
        info.process.kill('SIGTERM');

        // Force kill after 5 seconds
        setTimeout(() => {
          if (!info.process.killed) {
            info.process.kill('SIGKILL');
          }
        }, 5000);
      } catch (error) {
        logger.error(`Error stopping ${id}`, { error: error.message });
      }
    }

    // Release all locks
    await this.sessionLockManager.releaseAll();
    await this.fileLockManager.releaseAllLocks(this.sessionId);

    logger.info('✅ Autonomous coordinator shutdown complete');
  }
}

// CLI Interface
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  const coordinator = new AutonomousCoordinator();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await coordinator.shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await coordinator.shutdown();
    process.exit(0);
  });

  // Start the coordinator
  coordinator
    .initialize()
    .then(() => {
      logger.info('\n🎯 Autonomous system ready!');
      logger.info('Status:', coordinator.getStatus());

      // Example: Spawn an autonomous agent
      if (process.argv.includes('--spawn-agent')) {
        return coordinator.spawnAutonomousAgent({
          model: 'llama3.1',
          agentId: 'demo-agent',
        });
      }
    })
    .then(() => {
      logger.info('\n✨ System running. Press Ctrl+C to shutdown.');
    })
    .catch((error) => {
      logger.error('Failed to start autonomous system', { error: error.message });
      process.exit(1);
    });
}

export default AutonomousCoordinator;
