/**
 * Rate Limiting Layer
 * Prevents resource exhaustion and abuse
 */

import { logger } from '../utils/logger.js';

export class RateLimiter {
  constructor(config = {}) {
    this.config = {
      maxRequestsPerMinute: config.maxRequestsPerMinute || 60,
      maxRequestsPerHour: config.maxRequestsPerHour || 1000,
      maxConcurrentExecutions: config.maxConcurrentExecutions || 5,
      cooldownPeriod: config.cooldownPeriod || 60000, // 1 minute
      ...config
    };

    // Track requests per agent
    this.agentRequests = new Map();
    this.concurrentExecutions = new Map();
    this.blockedAgents = new Set();
  }

  /**
   * Check if request is allowed
   * @param {string} agentId - Agent identifier
   * @param {string} operation - Operation type
   * @returns {Object} Result with allowed status
   */
  checkLimit(agentId, operation = 'default') {
    const now = Date.now();

    // Check if agent is blocked
    if (this.blockedAgents.has(agentId)) {
      return {
        allowed: false,
        reason: 'Agent temporarily blocked',
        retryAfter: this.config.cooldownPeriod
      };
    }

    // Initialize agent tracking
    if (!this.agentRequests.has(agentId)) {
      this.agentRequests.set(agentId, {
        minuteWindow: [],
        hourWindow: [],
        violations: 0
      });
    }

    const agentData = this.agentRequests.get(agentId);

    // Clean old entries
    agentData.minuteWindow = agentData.minuteWindow.filter(
      ts => now - ts < 60000
    );
    agentData.hourWindow = agentData.hourWindow.filter(
      ts => now - ts < 3600000
    );

    // Check minute limit
    if (agentData.minuteWindow.length >= this.config.maxRequestsPerMinute) {
      logger.warn('Rate limit exceeded: per-minute', {
        agentId,
        count: agentData.minuteWindow.length
      });

      this._recordViolation(agentId);

      return {
        allowed: false,
        reason: 'Rate limit exceeded (per minute)',
        limit: this.config.maxRequestsPerMinute,
        retryAfter: 60000
      };
    }

    // Check hour limit
    if (agentData.hourWindow.length >= this.config.maxRequestsPerHour) {
      logger.warn('Rate limit exceeded: per-hour', {
        agentId,
        count: agentData.hourWindow.length
      });

      this._recordViolation(agentId);

      return {
        allowed: false,
        reason: 'Rate limit exceeded (per hour)',
        limit: this.config.maxRequestsPerHour,
        retryAfter: 3600000
      };
    }

    // Check concurrent executions
    const concurrent = this.concurrentExecutions.get(agentId) || 0;
    if (concurrent >= this.config.maxConcurrentExecutions) {
      logger.warn('Concurrent execution limit exceeded', {
        agentId,
        concurrent
      });

      return {
        allowed: false,
        reason: 'Too many concurrent executions',
        limit: this.config.maxConcurrentExecutions
      };
    }

    // Record request
    agentData.minuteWindow.push(now);
    agentData.hourWindow.push(now);

    return { allowed: true };
  }

  /**
   * Record start of execution
   * @param {string} agentId - Agent identifier
   */
  startExecution(agentId) {
    const current = this.concurrentExecutions.get(agentId) || 0;
    this.concurrentExecutions.set(agentId, current + 1);
  }

  /**
   * Record end of execution
   * @param {string} agentId - Agent identifier
   */
  endExecution(agentId) {
    const current = this.concurrentExecutions.get(agentId) || 0;
    this.concurrentExecutions.set(agentId, Math.max(0, current - 1));
  }

  /**
   * Record rate limit violation
   * @private
   */
  _recordViolation(agentId) {
    const agentData = this.agentRequests.get(agentId);
    agentData.violations++;

    // Block agent after 3 violations
    if (agentData.violations >= 3) {
      logger.error('Agent blocked due to repeated violations', { agentId });
      this.blockedAgents.add(agentId);

      // Unblock after cooldown
      setTimeout(() => {
        this.blockedAgents.delete(agentId);
        agentData.violations = 0;
        logger.info('Agent unblocked', { agentId });
      }, this.config.cooldownPeriod);
    }
  }

  /**
   * Get current stats for agent
   * @param {string} agentId - Agent identifier
   * @returns {Object} Stats
   */
  getStats(agentId) {
    const data = this.agentRequests.get(agentId);
    if (!data) {
      return {
        requestsLastMinute: 0,
        requestsLastHour: 0,
        concurrentExecutions: 0,
        violations: 0,
        blocked: false
      };
    }

    return {
      requestsLastMinute: data.minuteWindow.length,
      requestsLastHour: data.hourWindow.length,
      concurrentExecutions: this.concurrentExecutions.get(agentId) || 0,
      violations: data.violations,
      blocked: this.blockedAgents.has(agentId)
    };
  }
}
