/**
 * Security Audit Logging
 * Comprehensive logging of all security-relevant events
 */

import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';

export class AuditLogger {
  constructor(config = {}) {
    this.config = {
      auditLogPath: config.auditLogPath || path.join(process.cwd(), 'logs', 'audit.jsonl'),
      retentionDays: config.retentionDays || 90,
      encryptLogs: config.encryptLogs || false,
      ...config,
    };

    this.buffer = [];
    this.flushInterval = setInterval(() => this.flush(), 5000);
  }

  /**
   * Log security event
   * @param {Object} event - Security event
   */
  async logEvent(event) {
    const auditEntry = {
      timestamp: new Date().toISOString(),
      eventType: event.type,
      severity: event.severity || 'INFO',
      agentId: event.agentId,
      operation: event.operation,
      resource: event.resource,
      result: event.result,
      details: event.details,
      ip: event.ip,
      userAgent: event.userAgent,
    };

    this.buffer.push(auditEntry);

    // Immediate flush for critical events
    if (event.severity === 'CRITICAL') {
      await this.flush();
    }

    logger.info('Audit event logged', {
      type: event.type,
      severity: event.severity,
    });
  }

  /**
   * Flush buffer to disk
   */
  async flush() {
    if (this.buffer.length === 0) return;

    const entries = [...this.buffer];
    this.buffer = [];

    try {
      const data = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';

      // Ensure directory exists
      const dir = path.dirname(this.config.auditLogPath);
      await fs.mkdir(dir, { recursive: true });

      await fs.appendFile(this.config.auditLogPath, data, 'utf8');

      logger.debug(`Flushed ${entries.length} audit entries`);
    } catch (error) {
      logger.error('Failed to flush audit log', {
        error: error.message,
      });
      // Put entries back in buffer
      this.buffer.unshift(...entries);
    }
  }

  /**
   * Query audit log
   * @param {Object} criteria - Search criteria
   * @returns {Array<Object>} Matching entries
   */
  async query(criteria = {}) {
    try {
      const data = await fs.readFile(this.config.auditLogPath, 'utf8');
      const lines = data.split('\n').filter(Boolean);

      let results = lines.map((line) => JSON.parse(line));

      // Filter by criteria
      if (criteria.agentId) {
        results = results.filter((e) => e.agentId === criteria.agentId);
      }

      if (criteria.eventType) {
        results = results.filter((e) => e.eventType === criteria.eventType);
      }

      if (criteria.severity) {
        results = results.filter((e) => e.severity === criteria.severity);
      }

      if (criteria.startDate) {
        results = results.filter((e) => new Date(e.timestamp) >= new Date(criteria.startDate));
      }

      if (criteria.endDate) {
        results = results.filter((e) => new Date(e.timestamp) <= new Date(criteria.endDate));
      }

      return results;
    } catch (error) {
      logger.error('Failed to query audit log', {
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Cleanup
   */
  async destroy() {
    clearInterval(this.flushInterval);
    await this.flush();
  }
}

export const auditLogger = new AuditLogger();
