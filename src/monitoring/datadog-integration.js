/**
 * Datadog Integration
 * Publishes metrics to Datadog via StatsD
 * @module datadog-integration
 */

import { StatsD } from 'hot-shots';
import { logger } from '../utils/logger.js';

export class DatadogIntegration {
  constructor(config = {}) {
    this.config = {
      host: config.host || process.env.DATADOG_HOST || 'localhost',
      port: config.port || process.env.DATADOG_PORT || 8125,
      prefix: config.prefix || 'mcp.orchestrator.',
      globalTags: config.globalTags || [],
      ...config
    };

    this.statsd = new StatsD({
      host: this.config.host,
      port: this.config.port,
      prefix: this.config.prefix,
      globalTags: this.config.globalTags,
      errorHandler: (error) => {
        logger.error('Datadog StatsD error', { error: error.message });
      }
    });

    logger.info('Datadog integration initialized', {
      host: this.config.host,
      port: this.config.port,
      prefix: this.config.prefix
    });
  }

  /**
   * Publish a metric
   */
  publishMetric(metric, value, tags = []) {
    try {
      this.statsd.gauge(metric, value, tags);
      logger.debug('Metric published', { metric, value, tags });
    } catch (error) {
      logger.error('Failed to publish metric', {
        error: error.message,
        metric,
        value
      });
    }
  }

  /**
   * Increment a counter
   */
  increment(metric, value = 1, tags = []) {
    try {
      this.statsd.increment(metric, value, tags);
    } catch (error) {
      logger.error('Failed to increment counter', {
        error: error.message,
        metric
      });
    }
  }

  /**
   * Decrement a counter
   */
  decrement(metric, value = 1, tags = []) {
    try {
      this.statsd.decrement(metric, value, tags);
    } catch (error) {
      logger.error('Failed to decrement counter', {
        error: error.message,
        metric
      });
    }
  }

  /**
   * Record a timing
   */
  timing(metric, duration, tags = []) {
    try {
      this.statsd.timing(metric, duration, tags);
    } catch (error) {
      logger.error('Failed to record timing', {
        error: error.message,
        metric,
        duration
      });
    }
  }

  /**
   * Record a histogram value
   */
  histogram(metric, value, tags = []) {
    try {
      this.statsd.histogram(metric, value, tags);
    } catch (error) {
      logger.error('Failed to record histogram', {
        error: error.message,
        metric,
        value
      });
    }
  }

  /**
   * Publish health metrics
   */
  publishHealth(healthData) {
    try {
      // Agent metrics
      this.publishMetric('agents.total', healthData.agents.total);
      this.publishMetric('agents.active', healthData.agents.active);
      this.publishMetric('agents.inactive', healthData.agents.inactive);

      // Transport metrics
      if (healthData.transport.websocket) {
        this.publishMetric(
          'transport.websocket.clients',
          healthData.transport.websocket.clients
        );
      }

      if (healthData.transport.ably) {
        this.publishMetric(
          'transport.ably.connected',
          healthData.transport.ably.connected ? 1 : 0
        );
      }

      // Orchestrator metrics
      if (healthData.metrics) {
        this.publishMetric('messages.processed', healthData.metrics.messagesProcessed);
        this.publishMetric('approvals.requested', healthData.metrics.approvalsRequested);
        this.publishMetric('approvals.granted', healthData.metrics.approvalsGranted);
        this.publishMetric('approvals.denied', healthData.metrics.approvalsDenied);
      }

      logger.debug('Health metrics published to Datadog');
    } catch (error) {
      logger.error('Failed to publish health metrics', {
        error: error.message
      });
    }
  }

  /**
   * Close StatsD connection
   */
  close() {
    try {
      this.statsd.close();
      logger.info('Datadog integration closed');
    } catch (error) {
      logger.error('Failed to close Datadog integration', {
        error: error.message
      });
    }
  }
}

export default DatadogIntegration;
