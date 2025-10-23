/**
 * Docker Manager - Business logic and event emission for Docker operations
 * @module docker-manager
 */

import EventEmitter from 'events';
import { DockerClient } from './docker-client.js';
import { logger } from '../utils/logger.js';
import { LRUCache } from 'lru-cache';

/**
 * Docker Manager class - Manages Docker operations with polling and event emission
 * @extends EventEmitter
 */
export class DockerManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.client = new DockerClient(options.docker);
    this.pollIntervalContainers = options.pollIntervalContainers || 2000; // 2 seconds
    this.pollIntervalStats = options.pollIntervalStats || 1000; // 1 second
    this.cacheTTL = options.cacheTTL || 300000; // 5 minutes

    // LRU Cache for container data
    this.cache = new LRUCache({
      max: 500,
      ttl: this.cacheTTL,
      updateAgeOnGet: true
    });

    // State tracking
    this.isRunning = false;
    this.containers = new Map();
    this.statsCollectors = new Map();
    this.pollTimers = {
      containers: null,
      stats: null
    };

    // Bind methods
    this._pollContainers = this._pollContainers.bind(this);
    this._pollStats = this._pollStats.bind(this);
  }

  /**
   * Start the Docker manager (polling and event emission)
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isRunning) {
      logger.warn('Docker Manager already running');
      return;
    }

    try {
      // Check Docker availability
      const available = await this.client.ping();
      if (!available) {
        throw new Error('Docker daemon not available');
      }

      this.isRunning = true;
      logger.info('Docker Manager started');

      // Initial container list
      await this._pollContainers();

      // Start polling
      this.pollTimers.containers = setInterval(this._pollContainers, this.pollIntervalContainers);
      this.pollTimers.stats = setInterval(this._pollStats, this.pollIntervalStats);

      this.emit('manager:started');
    } catch (error) {
      logger.error('Failed to start Docker Manager', { error: error.message });
      throw error;
    }
  }

  /**
   * Stop the Docker manager
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isRunning) {
      logger.warn('Docker Manager not running');
      return;
    }

    try {
      this.isRunning = false;

      // Clear polling timers
      if (this.pollTimers.containers) {
        clearInterval(this.pollTimers.containers);
        this.pollTimers.containers = null;
      }

      if (this.pollTimers.stats) {
        clearInterval(this.pollTimers.stats);
        this.pollTimers.stats = null;
      }

      // Clear stats collectors
      this.statsCollectors.clear();

      logger.info('Docker Manager stopped');
      this.emit('manager:stopped');
    } catch (error) {
      logger.error('Failed to stop Docker Manager', { error: error.message });
      throw error;
    }
  }

  /**
   * Poll containers and detect changes
   * @private
   * @returns {Promise<void>}
   */
  async _pollContainers() {
    try {
      const currentContainers = await this.client.listContainers({ all: true });
      const currentIds = new Set(currentContainers.map(c => c.id));
      const previousIds = new Set(this.containers.keys());

      // Detect new containers
      for (const container of currentContainers) {
        const previous = this.containers.get(container.id);

        if (!previous) {
          // New container discovered
          this.containers.set(container.id, container);
          this.cache.set(`container:${container.id}`, container);
          this.emit('container:discovered', container);
          logger.debug('Container discovered', { id: container.id, name: container.name });
        } else {
          // Check for state changes
          if (previous.state !== container.state) {
            this._emitStateChange(previous, container);
          }

          // Update container data
          this.containers.set(container.id, container);
          this.cache.set(`container:${container.id}`, container);
        }
      }

      // Detect removed containers
      for (const id of previousIds) {
        if (!currentIds.has(id)) {
          const removed = this.containers.get(id);
          this.containers.delete(id);
          this.cache.delete(`container:${id}`);
          this.emit('container:removed', removed);
          logger.debug('Container removed', { id, name: removed?.name });

          // Stop stats collection for removed container
          if (this.statsCollectors.has(id)) {
            this.statsCollectors.delete(id);
          }
        }
      }
    } catch (error) {
      logger.error('Failed to poll containers', { error: error.message });
      this.emit('error', error);
    }
  }

  /**
   * Emit state change events
   * @private
   * @param {Object} previous - Previous container state
   * @param {Object} current - Current container state
   */
  _emitStateChange(previous, current) {
    const transitions = {
      'created->running': 'container:started',
      'paused->running': 'container:unpaused',
      'running->paused': 'container:paused',
      'running->exited': 'container:stopped',
      'exited->running': 'container:restarted'
    };

    const transition = `${previous.state}->${current.state}`;
    const event = transitions[transition];

    if (event) {
      this.emit(event, current);
      logger.debug('Container state change', {
        id: current.id,
        name: current.name,
        from: previous.state,
        to: current.state
      });
    }
  }

  /**
   * Poll stats for all running containers
   * @private
   * @returns {Promise<void>}
   */
  async _pollStats() {
    try {
      const runningContainers = Array.from(this.containers.values())
        .filter(c => c.state === 'running');

      // Collect stats in parallel (limited concurrency)
      const concurrency = 10;
      for (let i = 0; i < runningContainers.length; i += concurrency) {
        const batch = runningContainers.slice(i, i + concurrency);
        await Promise.all(
          batch.map(container => this._collectStats(container.id))
        );
      }
    } catch (error) {
      logger.error('Failed to poll stats', { error: error.message });
      this.emit('error', error);
    }
  }

  /**
   * Collect stats for a single container
   * @private
   * @param {string} id - Container ID
   * @returns {Promise<void>}
   */
  async _collectStats(id) {
    try {
      const rawStats = await this.client.getContainerStats(id);
      const stats = this._parseStats(rawStats);

      // Emit stats event
      this.emit('container:stats', { id, stats });

      // Cache stats
      this.cache.set(`stats:${id}`, stats);
    } catch (error) {
      // Container might have stopped during stats collection
      if (error.statusCode !== 404) {
        logger.error('Failed to collect stats', { id, error: error.message });
      }
    }
  }

  /**
   * Parse raw Docker stats into usable format
   * @private
   * @param {Object} raw - Raw stats from Docker API
   * @returns {Object} Parsed stats
   */
  _parseStats(raw) {
    // CPU stats
    const cpuDelta = raw.cpu_stats.cpu_usage.total_usage -
                     (raw.precpu_stats.cpu_usage?.total_usage || 0);
    const systemDelta = raw.cpu_stats.system_cpu_usage -
                        (raw.precpu_stats.system_cpu_usage || 0);
    const cpuPercent = systemDelta > 0
      ? (cpuDelta / systemDelta) * raw.cpu_stats.online_cpus * 100
      : 0;

    // Memory stats
    const memUsage = raw.memory_stats.usage || 0;
    const memLimit = raw.memory_stats.limit || 1;
    const memPercent = (memUsage / memLimit) * 100;

    // Network stats
    const networks = raw.networks || {};
    let rxBytes = 0;
    let txBytes = 0;
    for (const net of Object.values(networks)) {
      rxBytes += net.rx_bytes || 0;
      txBytes += net.tx_bytes || 0;
    }

    // Block I/O stats
    const blkio = raw.blkio_stats.io_service_bytes_recursive || [];
    let ioRead = 0;
    let ioWrite = 0;
    for (const stat of blkio) {
      if (stat.op === 'Read') ioRead += stat.value;
      if (stat.op === 'Write') ioWrite += stat.value;
    }

    return {
      timestamp: new Date().toISOString(),
      cpu: {
        percent: cpuPercent.toFixed(2),
        usage: raw.cpu_stats.cpu_usage.total_usage
      },
      memory: {
        usage: memUsage,
        limit: memLimit,
        percent: memPercent.toFixed(2),
        usageMB: (memUsage / 1024 / 1024).toFixed(2)
      },
      network: {
        rxBytes,
        txBytes,
        rxMB: (rxBytes / 1024 / 1024).toFixed(2),
        txMB: (txBytes / 1024 / 1024).toFixed(2)
      },
      blockIO: {
        read: ioRead,
        write: ioWrite,
        readMB: (ioRead / 1024 / 1024).toFixed(2),
        writeMB: (ioWrite / 1024 / 1024).toFixed(2)
      }
    };
  }

  /**
   * Get current container list
   * @returns {Array} Array of containers
   */
  getContainers() {
    return Array.from(this.containers.values());
  }

  /**
   * Get container by ID (with cache)
   * @param {string} id - Container ID
   * @returns {Promise<Object>} Container details
   */
  async getContainer(id) {
    // Check cache first
    const cached = this.cache.get(`container:${id}`);
    if (cached) {
      return cached;
    }

    // Fetch from Docker
    try {
      const container = await this.client.inspectContainer(id);
      this.cache.set(`container:${id}`, container);
      return container;
    } catch (error) {
      logger.error('Failed to get container', { id, error: error.message });
      throw error;
    }
  }

  /**
   * Get cached stats for container
   * @param {string} id - Container ID
   * @returns {Object|null} Stats or null if not cached
   */
  getStats(id) {
    return this.cache.get(`stats:${id}`) || null;
  }

  /**
   * Start a container
   * @param {string} id - Container ID
   * @returns {Promise<void>}
   */
  async startContainer(id) {
    try {
      await this.client.startContainer(id);
      logger.info('Container start requested', { id });

      // Force immediate poll to update state
      await this._pollContainers();
    } catch (error) {
      logger.error('Failed to start container', { id, error: error.message });
      throw error;
    }
  }

  /**
   * Stop a container
   * @param {string} id - Container ID
   * @returns {Promise<void>}
   */
  async stopContainer(id) {
    try {
      await this.client.stopContainer(id);
      logger.info('Container stop requested', { id });

      // Force immediate poll to update state
      await this._pollContainers();
    } catch (error) {
      logger.error('Failed to stop container', { id, error: error.message });
      throw error;
    }
  }

  /**
   * Restart a container
   * @param {string} id - Container ID
   * @returns {Promise<void>}
   */
  async restartContainer(id) {
    try {
      await this.client.restartContainer(id);
      logger.info('Container restart requested', { id });

      // Force immediate poll to update state
      await this._pollContainers();
    } catch (error) {
      logger.error('Failed to restart container', { id, error: error.message });
      throw error;
    }
  }

  /**
   * Remove a container
   * @param {string} id - Container ID
   * @param {Object} options - Remove options
   * @returns {Promise<void>}
   */
  async removeContainer(id, options = { force: false }) {
    try {
      await this.client.removeContainer(id, options);
      logger.info('Container remove requested', { id, options });

      // Force immediate poll to update state
      await this._pollContainers();
    } catch (error) {
      logger.error('Failed to remove container', { id, error: error.message });
      throw error;
    }
  }

  /**
   * Get container logs
   * @param {string} id - Container ID
   * @param {Object} options - Log options
   * @returns {Promise<Stream>} Log stream
   */
  async getContainerLogs(id, options) {
    try {
      return await this.client.getContainerLogs(id, options);
    } catch (error) {
      logger.error('Failed to get container logs', { id, error: error.message });
      throw error;
    }
  }

  /**
   * Get Docker system information
   * @returns {Promise<Object>} System info
   */
  async getSystemInfo() {
    try {
      // Check cache first
      const cached = this.cache.get('system:info');
      if (cached) {
        return cached;
      }

      const info = await this.client.getInfo();
      this.cache.set('system:info', info);
      return info;
    } catch (error) {
      logger.error('Failed to get system info', { error: error.message });
      throw error;
    }
  }

  /**
   * List all images
   * @returns {Promise<Array>} Array of images
   */
  async listImages() {
    try {
      return await this.client.listImages();
    } catch (error) {
      logger.error('Failed to list images', { error: error.message });
      throw error;
    }
  }

  /**
   * List all volumes
   * @returns {Promise<Array>} Array of volumes
   */
  async listVolumes() {
    try {
      return await this.client.listVolumes();
    } catch (error) {
      logger.error('Failed to list volumes', { error: error.message });
      throw error;
    }
  }

  /**
   * List all networks
   * @returns {Promise<Array>} Array of networks
   */
  async listNetworks() {
    try {
      return await this.client.listNetworks();
    } catch (error) {
      logger.error('Failed to list networks', { error: error.message });
      throw error;
    }
  }
}

export default DockerManager;
