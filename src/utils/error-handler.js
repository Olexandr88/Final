/**
 * Centralized Error Handler
 * Provides error classification, recovery strategies, and reporting
 */

import { logger } from './logger.js';

export const ErrorTypes = {
  NETWORK: 'NETWORK',
  TIMEOUT: 'TIMEOUT',
  VALIDATION: 'VALIDATION',
  AUTHENTICATION: 'AUTHENTICATION',
  RESOURCE: 'RESOURCE',
  UNKNOWN: 'UNKNOWN'
};

export const ErrorSeverity = {
  CRITICAL: 'CRITICAL',  // System cannot continue
  HIGH: 'HIGH',          // Major functionality impaired
  MEDIUM: 'MEDIUM',      // Degraded performance
  LOW: 'LOW'             // Minor issue, system operational
};

export class AppError extends Error {
  constructor(message, type = ErrorTypes.UNKNOWN, severity = ErrorSeverity.MEDIUM, metadata = {}) {
    super(message);
    this.name = 'AppError';
    this.type = type;
    this.severity = severity;
    this.metadata = metadata;
    this.timestamp = new Date().toISOString();
    this.recoverable = true;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      severity: this.severity,
      metadata: this.metadata,
      timestamp: this.timestamp,
      recoverable: this.recoverable,
      stack: this.stack
    };
  }
}

export class ErrorHandler {
  constructor() {
    this.errors = [];
    this.maxErrors = 1000;
    this.errorCounts = new Map(); // Track error frequency
    this.recoveryStrategies = new Map();
    this.listeners = [];

    // Register default recovery strategies
    this._registerDefaultStrategies();
  }

  _registerDefaultStrategies() {
    // Network errors: Retry with exponential backoff
    this.registerRecoveryStrategy(ErrorTypes.NETWORK, async (error, context) => {
      const maxRetries = context.maxRetries || 3;
      const baseDelay = context.baseDelay || 1000;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          logger.info(`Retry attempt ${attempt}/${maxRetries} for network error`);
          const delay = baseDelay * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));

          if (context.retryCallback) {
            await context.retryCallback();
            logger.info('Recovery successful');
            return { success: true, attempt };
          }
        } catch (retryError) {
          if (attempt === maxRetries) {
            logger.error('All retry attempts failed', { error: retryError.message });
            return { success: false, attempt, error: retryError };
          }
        }
      }
      return { success: false };
    });

    // Timeout errors: Increase timeout and retry once
    this.registerRecoveryStrategy(ErrorTypes.TIMEOUT, async (error, context) => {
      logger.warn('Timeout detected, retrying with increased timeout');
      const increasedTimeout = (context.timeout || 5000) * 2;

      if (context.retryCallback) {
        try {
          await context.retryCallback({ timeout: increasedTimeout });
          return { success: true };
        } catch (retryError) {
          return { success: false, error: retryError };
        }
      }
      return { success: false };
    });

    // Validation errors: No automatic recovery
    this.registerRecoveryStrategy(ErrorTypes.VALIDATION, async (error, context) => {
      logger.error('Validation error cannot be auto-recovered', { error: error.message });
      return { success: false, reason: 'Validation errors require manual intervention' };
    });
  }

  registerRecoveryStrategy(errorType, strategyFn) {
    this.recoveryStrategies.set(errorType, strategyFn);
  }

  addListener(callback) {
    this.listeners.push(callback);
  }

  removeListener(callback) {
    this.listeners = this.listeners.filter(l => l !== callback);
  }

  async handle(error, context = {}) {
    // Classify error
    const appError = error instanceof AppError
      ? error
      : this._classifyError(error);

    // Store error
    this.errors.push(appError);
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    // Track frequency
    const errorKey = `${appError.type}:${appError.message}`;
    this.errorCounts.set(errorKey, (this.errorCounts.get(errorKey) || 0) + 1);

    // Log error
    logger.error(appError.message, {
      type: appError.type,
      severity: appError.severity,
      metadata: appError.metadata
    });

    // Notify listeners
    this.listeners.forEach(listener => {
      try {
        listener(appError);
      } catch (err) {
        logger.error('Error in error handler listener', { error: err.message });
      }
    });

    // Attempt recovery if strategy exists
    if (appError.recoverable && this.recoveryStrategies.has(appError.type)) {
      try {
        const strategy = this.recoveryStrategies.get(appError.type);
        const result = await strategy(appError, context);

        if (result.success) {
          logger.info('Error recovered successfully', { type: appError.type });
        }

        return { error: appError, recovered: result.success, result };
      } catch (recoveryError) {
        logger.error('Recovery strategy failed', { error: recoveryError.message });
        return { error: appError, recovered: false, recoveryError };
      }
    }

    return { error: appError, recovered: false };
  }

  _classifyError(error) {
    let type = ErrorTypes.UNKNOWN;
    let severity = ErrorSeverity.MEDIUM;

    const message = error.message?.toLowerCase() || '';

    // Network errors
    if (message.includes('econnrefused') || message.includes('network') ||
        message.includes('fetch failed') || message.includes('socket')) {
      type = ErrorTypes.NETWORK;
      severity = ErrorSeverity.HIGH;
    }
    // Timeout errors
    else if (message.includes('timeout') || message.includes('timed out')) {
      type = ErrorTypes.TIMEOUT;
      severity = ErrorSeverity.MEDIUM;
    }
    // Validation errors
    else if (message.includes('validation') || message.includes('invalid')) {
      type = ErrorTypes.VALIDATION;
      severity = ErrorSeverity.LOW;
    }
    // Authentication errors
    else if (message.includes('unauthorized') || message.includes('authentication')) {
      type = ErrorTypes.AUTHENTICATION;
      severity = ErrorSeverity.HIGH;
    }
    // Resource errors
    else if (message.includes('memory') || message.includes('space') ||
             message.includes('limit')) {
      type = ErrorTypes.RESOURCE;
      severity = ErrorSeverity.CRITICAL;
    }

    return new AppError(error.message, type, severity, {
      originalError: error.name,
      stack: error.stack
    });
  }

  getErrors(filter = {}) {
    let results = [...this.errors];

    if (filter.type) {
      results = results.filter(e => e.type === filter.type);
    }

    if (filter.severity) {
      results = results.filter(e => e.severity === filter.severity);
    }

    if (filter.since) {
      const sinceTime = new Date(filter.since).getTime();
      results = results.filter(e => new Date(e.timestamp).getTime() >= sinceTime);
    }

    return results;
  }

  getStats() {
    const typeCounts = {};
    const severityCounts = {};

    for (const error of this.errors) {
      typeCounts[error.type] = (typeCounts[error.type] || 0) + 1;
      severityCounts[error.severity] = (severityCounts[error.severity] || 0) + 1;
    }

    const mostFrequent = Array.from(this.errorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key, count]) => ({ error: key, count }));

    return {
      total: this.errors.length,
      byType: typeCounts,
      bySeverity: severityCounts,
      mostFrequent,
      recentErrors: this.errors.slice(-10)
    };
  }

  clear() {
    this.errors = [];
    this.errorCounts.clear();
  }
}

export const errorHandler = new ErrorHandler();

export default ErrorHandler;
