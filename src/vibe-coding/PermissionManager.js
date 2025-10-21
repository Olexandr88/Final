import { EventEmitter } from 'events';
import { Logger } from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * PermissionManager - Manages tool permissions and autonomous operation
 * Implements allowlist system from "The Vibe Coder's Compass"
 */
export class PermissionManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger || Logger.getInstance();
    this.allowlist = new Set(options.allowlist || []);
    this.denylist = new Set(options.denylist || []);
    this.dangerousMode = options.dangerousMode || false;
    this.auditLog = [];
    this.requestCount = 0;
    this.approvedCount = 0;
    this.deniedCount = 0;
  }

  /**
   * Check if tool requires permission
   */
  requiresPermission(toolName, action = null) {
    if (this.dangerousMode) {
      return false; // YOLO mode - skip all permissions
    }

    // Check denylist first
    if (this.denylist.has(toolName)) {
      return true;
    }

    // Check allowlist
    if (this.allowlist.has(toolName)) {
      return false;
    }

    // Check action-specific permission
    if (action && this.allowlist.has(`${toolName}:${action}`)) {
      return false;
    }

    // Default: require permission for unknown tools
    return true;
  }

  /**
   * Request permission to use a tool
   */
  async requestPermission(toolName, context = {}) {
    this.requestCount++;

    const request = {
      toolName,
      action: context.action,
      params: context.params,
      timestamp: Date.now(),
      requestId: this.requestCount
    };

    this.emit('permission:requested', request);

    // Check if already allowed
    if (!this.requiresPermission(toolName, context.action)) {
      this.approvedCount++;
      this._logAudit(request, 'auto-approved');
      return { approved: true, reason: 'allowlist' };
    }

    // Check safety rules
    const safetyCheck = await this._checkSafety(toolName, context);
    if (!safetyCheck.safe) {
      this.deniedCount++;
      this._logAudit(request, 'denied', safetyCheck.reason);
      this.emit('permission:denied', { request, reason: safetyCheck.reason });
      return { approved: false, reason: safetyCheck.reason };
    }

    // In autonomous mode, approve if passed safety check
    this.approvedCount++;
    this._logAudit(request, 'approved');
    this.emit('permission:approved', request);

    return { approved: true, reason: 'safety-check-passed' };
  }

  /**
   * Add tool to allowlist
   */
  allow(toolName, action = null) {
    const key = action ? `${toolName}:${action}` : toolName;
    this.allowlist.add(key);

    // Remove from denylist if present
    this.denylist.delete(key);

    this.logger.info(`Added to allowlist: ${key}`);
    this.emit('allowlist:updated', { tool: key, action: 'add' });
  }

  /**
   * Remove tool from allowlist
   */
  disallow(toolName, action = null) {
    const key = action ? `${toolName}:${action}` : toolName;
    this.allowlist.delete(key);

    this.logger.info(`Removed from allowlist: ${key}`);
    this.emit('allowlist:updated', { tool: key, action: 'remove' });
  }

  /**
   * Add tool to denylist (block permanently)
   */
  deny(toolName, action = null) {
    const key = action ? `${toolName}:${action}` : toolName;
    this.denylist.add(key);

    // Remove from allowlist if present
    this.allowlist.delete(key);

    this.logger.info(`Added to denylist: ${key}`);
    this.emit('denylist:updated', { tool: key, action: 'add' });
  }

  /**
   * Remove tool from denylist
   */
  undeny(toolName, action = null) {
    const key = action ? `${toolName}:${action}` : toolName;
    this.denylist.delete(key);

    this.logger.info(`Removed from denylist: ${key}`);
    this.emit('denylist:updated', { tool: key, action: 'remove' });
  }

  /**
   * Enable/disable dangerous mode (YOLO mode)
   */
  setDangerousMode(enabled) {
    this.dangerousMode = enabled;
    this.logger.warn(`Dangerous mode ${enabled ? 'ENABLED' : 'DISABLED'}`);
    this.emit('dangerous-mode:changed', { enabled });
  }

  /**
   * Get current allowlist
   */
  getAllowlist() {
    return Array.from(this.allowlist);
  }

  /**
   * Get current denylist
   */
  getDenylist() {
    return Array.from(this.denylist);
  }

  /**
   * Get permission statistics
   */
  getStats() {
    return {
      totalRequests: this.requestCount,
      approved: this.approvedCount,
      denied: this.deniedCount,
      approvalRate: this.requestCount > 0 ? (this.approvedCount / this.requestCount) * 100 : 0,
      allowlistSize: this.allowlist.size,
      denylistSize: this.denylist.size,
      dangerousMode: this.dangerousMode
    };
  }

  /**
   * Get audit log
   */
  getAuditLog(limit = 100) {
    return this.auditLog.slice(-limit);
  }

  /**
   * Export permissions configuration
   */
  async exportConfig(filepath) {
    const config = {
      allowlist: Array.from(this.allowlist),
      denylist: Array.from(this.denylist),
      dangerousMode: this.dangerousMode,
      exportedAt: new Date().toISOString()
    };

    await fs.writeFile(filepath, JSON.stringify(config, null, 2), 'utf-8');
    this.logger.info(`Permissions exported to: ${filepath}`);
    return filepath;
  }

  /**
   * Import permissions configuration
   */
  async importConfig(filepath) {
    const content = await fs.readFile(filepath, 'utf-8');
    const config = JSON.parse(content);

    this.allowlist = new Set(config.allowlist || []);
    this.denylist = new Set(config.denylist || []);
    this.dangerousMode = config.dangerousMode || false;

    this.logger.info(`Permissions imported from: ${filepath}`);
    this.emit('config:imported', { filepath });
  }

  /**
   * Safety check for tool usage
   */
  async _checkSafety(toolName, context) {
    // Block dangerous file operations
    if (toolName === 'delete-file' || toolName === 'rm') {
      const dangerousPatterns = [
        '.env',
        'node_modules',
        'package.json',
        'package-lock.json',
        '.git'
      ];

      const file = context.params?.file || context.params?.path || '';
      if (dangerousPatterns.some(pattern => file.includes(pattern))) {
        return {
          safe: false,
          reason: `Blocked deletion of critical file: ${file}`
        };
      }
    }

    // Block network operations to sensitive hosts
    if (toolName === 'http-request' || toolName === 'fetch') {
      const url = context.params?.url || '';
      const sensitiveHosts = ['localhost:22', 'localhost:3306', 'localhost:5432'];

      if (sensitiveHosts.some(host => url.includes(host))) {
        return {
          safe: false,
          reason: `Blocked request to sensitive host: ${url}`
        };
      }
    }

    // Block shell commands with dangerous patterns
    if (toolName === 'shell' || toolName === 'bash') {
      const command = context.params?.command || '';
      const dangerousCommands = ['rm -rf', 'dd if=', 'mkfs', ':(){:|:&};:'];

      if (dangerousCommands.some(cmd => command.includes(cmd))) {
        return {
          safe: false,
          reason: `Blocked dangerous shell command`
        };
      }
    }

    return { safe: true };
  }

  /**
   * Log audit entry
   */
  _logAudit(request, status, reason = null) {
    const entry = {
      requestId: request.requestId,
      toolName: request.toolName,
      action: request.action,
      status,
      reason,
      timestamp: request.timestamp
    };

    this.auditLog.push(entry);

    // Keep only last 10000 entries
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-10000);
    }
  }

  /**
   * Create permission manager with safe defaults
   */
  static createWithSafeDefaults() {
    const manager = new PermissionManager();

    // Auto-allow safe read-only operations
    manager.allow('read-file');
    manager.allow('list-directory');
    manager.allow('grep');
    manager.allow('find');

    // Auto-allow safe code operations
    manager.allow('lint');
    manager.allow('format');
    manager.allow('type-check');

    // Permanently block dangerous operations
    manager.deny('rm', 'recursive');
    manager.deny('delete-file', 'node_modules');
    manager.deny('delete-file', '.git');

    return manager;
  }
}
