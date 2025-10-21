/**
 * Secure Tool Executor
 * Enhanced tool executor with comprehensive security layers
 * Integrates: sandboxing, input validation, rate limiting, audit logging
 */

import { ToolExecutor } from './tool-executor.js';
import { CommandSandbox } from '../security/command-sandbox.js';
import { InputValidator, inputValidator } from '../security/input-validator.js';
import { RateLimiter } from '../security/rate-limiter.js';
import { AuditLogger, auditLogger } from '../security/audit-logger.js';
import { CredentialManager, credentialManager } from '../security/credential-manager.js';
import { logger } from '../utils/logger.js';
import { randomUUID } from 'crypto';

/**
 * Secure Tool Executor with full security integration
 */
export class SecureToolExecutor extends ToolExecutor {
  constructor(agentId, permissions = {}) {
    super(agentId, permissions);

    // Initialize security layers
    this.sandbox = new CommandSandbox({
      workingDirectory: process.cwd(),
      allowedPaths: [process.cwd()],
      timeout: 30000,
      allowedCommands: ['npm', 'node', 'git', 'ls', 'dir', 'echo', 'cat', 'type'],
    });

    this.rateLimiter = new RateLimiter({
      maxRequestsPerMinute: 30,
      maxRequestsPerHour: 500,
      maxConcurrentExecutions: 3,
    });

    this.validator = inputValidator;

    // Listen to sandbox security events
    this.sandbox.on('securityViolation', (event) => {
      this._handleSecurityViolation(event);
    });

    logger.info(`SecureToolExecutor initialized for ${this.agentId}`, {
      toolCount: this.tools.size,
    });
  }

  /**
   * Execute tool with full security checks
   * @param {string} toolName - Tool name
   * @param {Object} params - Tool parameters
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Execution result
   */
  async executeTool(toolName, params = {}, context = {}) {
    const executionId = randomUUID();
    const startTime = Date.now();

    logger.info(`Secure tool execution started: ${toolName}`, {
      agentId: this.agentId,
      executionId,
    });

    // Step 1: Rate Limiting
    const rateLimitCheck = this.rateLimiter.checkLimit(this.agentId, toolName);
    if (!rateLimitCheck.allowed) {
      logger.warn('Rate limit exceeded', {
        agentId: this.agentId,
        tool: toolName,
        reason: rateLimitCheck.reason,
      });

      await auditLogger.logEvent({
        type: 'RATE_LIMIT_EXCEEDED',
        severity: 'MEDIUM',
        agentId: this.agentId,
        operation: toolName,
        result: 'DENIED',
        details: rateLimitCheck,
      });

      return {
        success: false,
        tool: toolName,
        error: rateLimitCheck.reason,
        executionId,
        duration: Date.now() - startTime,
      };
    }

    // Step 2: Input Validation
    let validatedParams;
    try {
      validatedParams = this._validateInput(toolName, params);
    } catch (error) {
      logger.error('Input validation failed', {
        agentId: this.agentId,
        tool: toolName,
        error: error.message,
      });

      await auditLogger.logEvent({
        type: 'INPUT_VALIDATION_FAILED',
        severity: 'HIGH',
        agentId: this.agentId,
        operation: toolName,
        resource: JSON.stringify(params),
        result: 'DENIED',
        details: { error: error.message },
      });

      return {
        success: false,
        tool: toolName,
        error: error.message,
        executionId,
        duration: Date.now() - startTime,
      };
    }

    // Step 3: Permission Check (default-deny)
    if (!this._hasPermissionSecure(toolName)) {
      logger.error('Permission denied', {
        agentId: this.agentId,
        tool: toolName,
      });

      await auditLogger.logEvent({
        type: 'PERMISSION_DENIED',
        severity: 'HIGH',
        agentId: this.agentId,
        operation: toolName,
        result: 'DENIED',
        details: { permissions: this.permissions },
      });

      return {
        success: false,
        tool: toolName,
        error: `Permission denied: ${toolName}`,
        executionId,
        duration: Date.now() - startTime,
      };
    }

    // Step 4: Record execution start
    this.rateLimiter.startExecution(this.agentId);

    try {
      // Step 5: Execute with appropriate security layer
      let result;

      if (toolName === 'bash' || toolName === 'npm') {
        // Execute through sandbox
        result = await this._executeInSandbox(toolName, validatedParams, context, executionId);
      } else {
        // Execute tool directly (non-command tools)
        result = await this._executeToolSecurely(toolName, validatedParams, context, executionId);
      }

      // Step 6: Redact secrets from output
      result = this._redactSecrets(result);

      const duration = Date.now() - startTime;

      // Step 7: Log successful execution
      await auditLogger.logEvent({
        type: 'TOOL_EXECUTED',
        severity: 'INFO',
        agentId: this.agentId,
        operation: toolName,
        resource: JSON.stringify(validatedParams),
        result: 'SUCCESS',
        details: { duration, executionId },
      });

      logger.info(`Secure tool execution successful: ${toolName}`, {
        agentId: this.agentId,
        executionId,
        duration,
      });

      return {
        success: true,
        tool: toolName,
        result,
        executionId,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Secure tool execution failed', {
        agentId: this.agentId,
        tool: toolName,
        error: error.message,
        executionId,
      });

      await auditLogger.logEvent({
        type: 'TOOL_EXECUTION_FAILED',
        severity: error.severity || 'MEDIUM',
        agentId: this.agentId,
        operation: toolName,
        result: 'FAILED',
        details: {
          error: error.message,
          duration,
          executionId,
        },
      });

      return {
        success: false,
        tool: toolName,
        error: error.message,
        executionId,
        duration,
      };
    } finally {
      this.rateLimiter.endExecution(this.agentId);
    }
  }

  /**
   * Validate input based on tool type
   * @private
   */
  _validateInput(toolName, params) {
    if (toolName === 'bash' || toolName === 'npm') {
      return this.validator.validateCommand(params);
    } else if (toolName.startsWith('file_') || ['read', 'write', 'edit'].includes(toolName)) {
      return this.validator.validateFileOperation(params);
    } else if (toolName.startsWith('git_')) {
      return this.validator.validateGitOperation(params);
    }
    return params; // No validation for other tools (should add schemas)
  }

  /**
   * Check permission with default-DENY policy
   * @private
   */
  _hasPermissionSecure(toolName) {
    // Default-DENY (secure default)
    if (!this.permissions || Object.keys(this.permissions).length === 0) {
      logger.warn('No permissions configured - denying access', {
        agentId: this.agentId,
        tool: toolName,
      });
      return false; // SECURE DEFAULT
    }

    const permissionMap = {
      read: 'file_read',
      write: 'file_write',
      edit: 'file_write',
      glob: 'file_read',
      grep: 'file_read',
      bash: 'command_exec',
      npm: 'command_exec',
      git_status: 'git_operations',
      git_diff: 'git_operations',
      git_commit: 'git_operations',
      analyze_code: 'code_analysis',
      run_tests: 'test_execution',
    };

    const requiredPermission = permissionMap[toolName];
    if (!requiredPermission) {
      logger.warn('Unknown tool - denying access', {
        agentId: this.agentId,
        tool: toolName,
      });
      return false;
    }

    return this.permissions[requiredPermission] === true;
  }

  /**
   * Execute command in sandbox
   * @private
   */
  async _executeInSandbox(toolName, params, context, executionId) {
    const command = toolName === 'npm' ? `npm ${params.command || ''}` : params.command;

    return await this.sandbox.executeCommand(command, { executionId });
  }

  /**
   * Execute tool securely (non-command tools)
   * @private
   */
  async _executeToolSecurely(toolName, params, context, executionId) {
    if (!this.tools.has(toolName)) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    const handler = this.tools.get(toolName);

    return await handler(params, {
      agentId: this.agentId,
      executionId,
      ...context,
    });
  }

  /**
   * Redact secrets from result
   * @private
   */
  _redactSecrets(result) {
    if (!result) return result;
    const redacted = JSON.parse(JSON.stringify(result));
    const redactDeep = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map((item) => redactDeep(item));
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string') {
          obj[k] = credentialManager.redactSecrets(v);
        } else if (typeof v === 'object' && v !== null) {
          obj[k] = redactDeep(v);
        }
      }
      return obj;
    };
    if (redacted.stdout) redacted.stdout = credentialManager.redactSecrets(redacted.stdout);
    if (redacted.stderr) redacted.stderr = credentialManager.redactSecrets(redacted.stderr);
    if (redacted.content) redacted.content = credentialManager.redactSecrets(redacted.content);
    if (redacted.error) {
      if (typeof redacted.error === 'string') {
        redacted.error = credentialManager.redactSecrets(redacted.error);
      } else if (typeof redacted.error === 'object') {
        if (redacted.error.message)
          redacted.error.message = credentialManager.redactSecrets(redacted.error.message);
        if (redacted.error.stack)
          redacted.error.stack = credentialManager.redactSecrets(redacted.error.stack);
      }
    }
    return redactDeep(redacted);
  }

  /**
   * Handle security violation
   * @private
   */
  async _handleSecurityViolation(event) {
    logger.error('Security violation detected', {
      agentId: this.agentId,
      event,
    });

    await auditLogger.logEvent({
      type: 'SECURITY_VIOLATION',
      severity: event.severity || 'CRITICAL',
      agentId: this.agentId,
      operation: 'command_execution',
      resource: event.command,
      result: 'DENIED',
      details: event,
    });

    this.emit('securityViolation', event);
  }

  /**
   * Get available tools with permission info
   */
  getAvailableTools() {
    const tools = [];

    for (const [name] of this.tools) {
      tools.push({
        name,
        hasPermission: this._hasPermissionSecure(name),
      });
    }

    return tools;
  }

  /**
   * Get security stats
   */
  getSecurityStats() {
    return {
      agentId: this.agentId,
      rateLimitStats: this.rateLimiter.getStats(this.agentId),
      metrics: this.metrics,
      toolCount: this.tools.size,
    };
  }
}

export default SecureToolExecutor;
