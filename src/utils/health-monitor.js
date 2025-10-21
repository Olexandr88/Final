/**
 * Health Monitoring System for A2A Agents
 * Tracks agent health, performance, and reliability metrics
 */

export class HealthMonitor {
  constructor() {
    this.agents = new Map();
    this.metrics = new Map();
    this.alerts = [];
  }

  /**
   * Register an agent for monitoring
   */
  registerAgent(agentId, config = {}) {
    this.agents.set(agentId, {
      id: agentId,
      status: 'unknown',
      lastHeartbeat: null,
      startTime: Date.now(),
      restartCount: 0,
      errorCount: 0,
      requestCount: 0,
      successCount: 0,
      avgResponseTime: 0,
      config: {
        heartbeatInterval: config.heartbeatInterval || 30000,
        healthCheckTimeout: config.healthCheckTimeout || 10000,
        maxErrors: config.maxErrors || 10,
        ...config,
      },
    });
  }

  /**
   * Update agent heartbeat
   */
  heartbeat(agentId, metadata = {}) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      this.registerAgent(agentId);
      return;
    }

    agent.lastHeartbeat = Date.now();
    agent.status = 'healthy';

    // Update metrics from metadata
    if (metadata.errorCount !== undefined) agent.errorCount = metadata.errorCount;
    if (metadata.requestCount !== undefined) agent.requestCount = metadata.requestCount;
    if (metadata.successCount !== undefined) agent.successCount = metadata.successCount;
    if (metadata.avgResponseTime !== undefined) agent.avgResponseTime = metadata.avgResponseTime;
  }

  /**
   * Record agent error
   */
  recordError(agentId, error) {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.errorCount++;

    // Check error threshold
    if (agent.errorCount >= agent.config.maxErrors) {
      this.addAlert(agentId, 'high_error_rate', `Agent has ${agent.errorCount} errors`);
      agent.status = 'degraded';
    }
  }

  /**
   * Record successful request
   */
  recordSuccess(agentId, responseTime) {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.requestCount++;
    agent.successCount++;

    // Update rolling average response time
    const alpha = 0.2; // Smoothing factor
    agent.avgResponseTime = agent.avgResponseTime * (1 - alpha) + responseTime * alpha;
  }

  /**
   * Check health of all agents
   */
  checkHealth() {
    const now = Date.now();
    const health = {};

    for (const [agentId, agent] of this.agents) {
      const timeSinceHeartbeat = agent.lastHeartbeat ? now - agent.lastHeartbeat : Infinity;

      let status = 'healthy';
      if (!agent.lastHeartbeat) {
        status = 'unknown';
      } else if (timeSinceHeartbeat > agent.config.healthCheckTimeout * 2) {
        status = 'unhealthy';
        this.addAlert(
          agentId,
          'heartbeat_timeout',
          `No heartbeat for ${Math.round(timeSinceHeartbeat / 1000)}s`
        );
      } else if (timeSinceHeartbeat > agent.config.healthCheckTimeout) {
        status = 'warning';
      }

      agent.status = status;

      health[agentId] = {
        status,
        uptime: now - agent.startTime,
        lastHeartbeat: agent.lastHeartbeat,
        timeSinceHeartbeat,
        errorCount: agent.errorCount,
        requestCount: agent.requestCount,
        successRate:
          agent.requestCount > 0 ? ((agent.successCount / agent.requestCount) * 100).toFixed(2) : 0,
        avgResponseTime: Math.round(agent.avgResponseTime),
      };
    }

    return health;
  }

  /**
   * Get agent statistics
   */
  getStats(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return null;

    return {
      id: agent.id,
      status: agent.status,
      uptime: Date.now() - agent.startTime,
      restartCount: agent.restartCount,
      errorCount: agent.errorCount,
      requestCount: agent.requestCount,
      successCount: agent.successCount,
      successRate:
        agent.requestCount > 0 ? ((agent.successCount / agent.requestCount) * 100).toFixed(2) : 0,
      avgResponseTime: Math.round(agent.avgResponseTime),
      lastHeartbeat: agent.lastHeartbeat,
    };
  }

  /**
   * Add health alert
   */
  addAlert(agentId, type, message) {
    const alert = {
      agentId,
      type,
      message,
      timestamp: Date.now(),
    };

    this.alerts.push(alert);

    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts.shift();
    }

    return alert;
  }

  /**
   * Get recent alerts
   */
  getAlerts(limit = 10) {
    return this.alerts.slice(-limit);
  }

  /**
   * Clear alerts for an agent
   */
  clearAlerts(agentId) {
    this.alerts = this.alerts.filter((alert) => alert.agentId !== agentId);
  }

  /**
   * Reset agent statistics
   */
  resetStats(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.errorCount = 0;
    agent.requestCount = 0;
    agent.successCount = 0;
    agent.avgResponseTime = 0;
    this.clearAlerts(agentId);
  }
}

export default HealthMonitor;
