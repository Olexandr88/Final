/**
 * Bash/Command Execution Tools
 * Safe command execution with timeout and resource limits
 *
 * @module bash-tools
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../utils/logger.js';

const execAsync = promisify(exec);

/**
 * Execute shell command
 * @param {Object} params - Parameters
 * @param {string} params.command - Command to execute
 * @param {Array<string>} [params.args=[]] - Command arguments
 * @param {string} [params.cwd] - Working directory
 * @param {number} [params.timeout=30000] - Timeout in ms
 * @param {Object} [params.env={}] - Environment variables
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Command result
 */
export async function executeCommand(params, context) {
  const {
    command,
    args = [],
    cwd = process.cwd(),
    timeout = 30000,
    env = {},
    shell = true,
  } = params;

  const maxTimeout = 60000; // 1 minute max
  const actualTimeout = Math.min(timeout, maxTimeout);
  const startTime = Date.now();

  try {
    const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command;

    logger.info(`Executing command: ${fullCommand}`, {
      agentId: context.agentId,
      cwd,
    });

    const { stdout, stderr } = await execAsync(fullCommand, {
      cwd,
      timeout: actualTimeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB
      env: { ...process.env, ...env },
      shell,
    });

    const duration = Date.now() - startTime;

    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: 0,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    // Command failed but ran
    return {
      success: false,
      stdout: error.stdout?.trim() || '',
      stderr: error.stderr?.trim() || error.message,
      exitCode: error.code || 1,
      duration,
      error: error.message,
    };
  }
}

/**
 * Run npm command
 * @param {Object} params - Parameters
 * @param {string} params.command - NPM command (e.g., "install", "test")
 * @param {string} [params.cwd] - Working directory
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Command result
 */
export async function runNpmCommand(params, context) {
  const { command, cwd } = params;

  return executeCommand(
    {
      command: 'npm',
      args: command.split(' '),
      cwd,
      timeout: 120000, // 2 minutes for npm commands
    },
    context
  );
}

/**
 * Execute command in background (fire and forget)
 * @param {Object} params - Parameters
 * @param {string} params.command - Command to execute
 * @param {Array<string>} [params.args=[]] - Command arguments
 * @param {string} [params.cwd] - Working directory
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Process info
 */
export async function executeBackground(params, context) {
  const { command, args = [], cwd = process.cwd() } = params;

  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd,
      detached: true,
      stdio: 'ignore',
    });

    proc.on('spawn', () => {
      proc.unref(); // Allow parent to exit independently

      resolve({
        command,
        pid: proc.pid,
        detached: true,
        success: true,
      });
    });

    proc.on('error', (error) => {
      reject(new Error(`Failed to spawn command ${command}: ${error.message}`));
    });
  });
}
