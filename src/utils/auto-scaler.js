/**
 * Auto-Scaler for AI Bridge
 * Dynamically adjusts resources based on load
 */

export class AutoScaler {
  constructor({
    minClients = 0,
    maxClients = 100,
    targetLatency = 100,
    scaleUpThreshold = 0.8,
    scaleDownThreshold = 0.3,
    checkInterval = 30000,
    logger = console,
  } = {}) {
    this.minClients = minClients;
    this.maxClients = maxClients;
    this.targetLatency = targetLatency;
    this.scaleUpThreshold = scaleUpThreshold;
    this.scaleDownThreshold = scaleDownThreshold;
    this.checkInterval = checkInterval;
    this.logger = logger;

    this.currentCapacity = maxClients;
    this.metrics = {
      latencyHistory: [],
      loadHistory: [],
      scaleEvents: [],
    };

    this.monitorInterval = null;
  }

  start(bridge) {
    this.bridge = bridge;

    this.monitorInterval = setInterval(() => {
      this.checkAndScale();
    }, this.checkInterval);

    this.logger.log('[AutoScaler] Started');
  }

  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  checkAndScale() {
    const stats = this.bridge.getStats();
    const currentLoad = stats.connectedClients / this.currentCapacity;
    const avgLatency = this.calculateAverageLatency();

    this.metrics.loadHistory.push(currentLoad);
    this.metrics.latencyHistory.push(avgLatency);

    if (this.metrics.loadHistory.length > 100) {
      this.metrics.loadHistory.shift();
      this.metrics.latencyHistory.shift();
    }

    if (currentLoad > this.scaleUpThreshold) {
      this.scaleUp();
    } else if (currentLoad < this.scaleDownThreshold) {
      this.scaleDown();
    }
  }

  scaleUp() {
    const newCapacity = Math.min(this.maxClients, Math.floor(this.currentCapacity * 1.5));
    if (newCapacity === this.currentCapacity) return;

    this.currentCapacity = newCapacity;
    this.logger.log('[AutoScaler] Scaled UP to ' + this.currentCapacity);
  }

  scaleDown() {
    const newCapacity = Math.max(this.minClients, Math.floor(this.currentCapacity * 0.75));
    if (newCapacity === this.currentCapacity) return;

    this.currentCapacity = newCapacity;
    this.logger.log('[AutoScaler] Scaled DOWN to ' + this.currentCapacity);
  }

  calculateAverageLatency() {
    if (!this.bridge) return 0;
    const clients = this.bridge.listClients();
    if (clients.length === 0) return 0;
    const totalLatency = clients.reduce((sum, c) => sum + (c.avgLatency || 0), 0);
    return totalLatency / clients.length;
  }

  getMetrics() {
    return {
      currentCapacity: this.currentCapacity,
      maxCapacity: this.maxClients,
      scaleEvents: this.metrics.scaleEvents.slice(-10),
    };
  }
}
