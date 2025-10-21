import { randomUUID } from 'node:crypto';
import { setInterval as setIntervalTimer, clearInterval as clearIntervalTimer } from 'node:timers';
import { BroadcastChannel } from 'node:worker_threads';
import { logger } from './logger.js';

/**
 * Coordinates concurrency across multiple Ollama agents running on the same host.
 * Uses BroadcastChannel to share global inflight counts and enforces a cluster-wide
 * concurrency limit so agents do not overwhelm a single Ollama instance.
 */
export class OllamaClusterCoordinator {
  constructor({
    clusterId = process.env.OLLAMA_CLUSTER_ID || 'default',
    maxGlobalConcurrency = Number(process.env.OLLAMA_GLOBAL_MAX_CONCURRENCY || '4'),
    broadcastInterval = Number(process.env.OLLAMA_SYNC_BROADCAST_INTERVAL_MS || '4000'),
    stalePeerTimeout = Number(process.env.OLLAMA_SYNC_STALE_TIMEOUT_MS || '15000'),
  } = {}) {
    this.clusterId = clusterId;
    this.maxGlobalConcurrency = Math.max(1, maxGlobalConcurrency || 1);
    this.broadcastInterval = broadcastInterval;
    this.stalePeerTimeout = stalePeerTimeout;
    this.agentId = `${clusterId}-${process.pid}-${randomUUID().slice(0, 8)}`;
    this.localInflight = 0;
    this.peerStates = new Map(); // agentId -> { inflight, lastSeen }
    this.waiters = new Set(); // pending acquire requests
    this.isDisposed = false;
    this.supported = typeof BroadcastChannel === 'function';

    if (!this.supported) {
      logger.warn(
        '[OllamaSync] BroadcastChannel not supported on this Node.js version. Falling back to local concurrency only.'
      );
      return;
    }

    this.channelName = `ollama-cluster-sync::${this.clusterId}`;
    this.channel = new BroadcastChannel(this.channelName);
    this.channel.onmessage = ({ data }) => this.#handleMessage(data);

    // Track our own state so totals remain accurate
    this.peerStates.set(this.agentId, { inflight: this.localInflight, lastSeen: Date.now() });

    this.broadcastTimer = setIntervalTimer(() => {
      this.#prunePeers();
      this.#broadcastState();
    }, this.broadcastInterval);
    this.broadcastTimer.unref?.();

    // Send initial hello so existing peers share their state
    this.#broadcast({ type: 'hello', agentId: this.agentId, timestamp: Date.now() });
    this.#broadcastState();
  }

  getTotalInflight() {
    this.#prunePeers();
    let total = this.localInflight;
    for (const [agentId, info] of this.peerStates) {
      if (agentId === this.agentId) continue;
      total += info.inflight || 0;
    }
    return total;
  }

  getLocalInflight() {
    return this.localInflight;
  }

  getMaxConcurrency() {
    return this.maxGlobalConcurrency;
  }

  getWaiterCount() {
    return this.waiters.size;
  }

  getPeerCount() {
    let peers = this.peerStates.size;
    if (this.peerStates.has(this.agentId)) {
      peers -= 1;
    }
    return Math.max(0, peers);
  }

  getStats() {
    return {
      clusterId: this.clusterId,
      agentId: this.agentId,
      totalInflight: this.getTotalInflight(),
      localInflight: this.getLocalInflight(),
      maxConcurrency: this.getMaxConcurrency(),
      waiters: this.getWaiterCount(),
      peers: this.getPeerCount(),
    };
  }

  async acquire(meta = {}) {
    if (this.isDisposed) {
      throw new Error('OllamaClusterCoordinator has been disposed');
    }

    if (!this.supported) {
      this.localInflight++;
      return () => this.release(meta);
    }

    return new Promise((resolve) => {
      const attempt = () => {
        if (this.getTotalInflight() < this.maxGlobalConcurrency) {
          this.localInflight++;
          this.peerStates.set(this.agentId, { inflight: this.localInflight, lastSeen: Date.now() });
          this.#broadcastState();
          resolve(() => this.release(meta));
          return true;
        }
        return false;
      };

      if (!attempt()) {
        const waiter = { resolve, meta, createdAt: Date.now() };
        this.waiters.add(waiter);
      }
    });
  }

  release(meta = {}) {
    if (this.localInflight > 0) {
      this.localInflight--;
    }

    if (!this.supported) {
      return;
    }

    this.peerStates.set(this.agentId, { inflight: this.localInflight, lastSeen: Date.now() });
    this.#broadcastState();
    this.#drainWaiters();
  }

  #drainWaiters() {
    if (!this.waiters.size || this.isDisposed || !this.supported) {
      return;
    }

    for (const waiter of Array.from(this.waiters)) {
      if (this.getTotalInflight() >= this.maxGlobalConcurrency) {
        break;
      }
      this.waiters.delete(waiter);
      this.localInflight++;
      this.peerStates.set(this.agentId, { inflight: this.localInflight, lastSeen: Date.now() });
      this.#broadcastState();
      waiter.resolve(() => this.release(waiter.meta));
    }
  }

  #handleMessage(data) {
    if (!data || typeof data !== 'object') return;
    const { type, agentId, inflight, timestamp } = data;
    if (!agentId || agentId === this.agentId) return;

    switch (type) {
      case 'hello':
        this.#broadcastState();
        break;
      case 'state':
        this.peerStates.set(agentId, {
          inflight: typeof inflight === 'number' ? inflight : 0,
          lastSeen: timestamp || Date.now(),
        });
        this.#drainWaiters();
        break;
      case 'goodbye':
        this.peerStates.delete(agentId);
        this.#drainWaiters();
        break;
      default:
        break;
    }
  }

  #prunePeers() {
    const now = Date.now();
    for (const [agentId, info] of this.peerStates) {
      if (agentId === this.agentId) continue;
      if (!info || now - info.lastSeen > this.stalePeerTimeout) {
        this.peerStates.delete(agentId);
      }
    }
  }

  #broadcastState() {
    this.#broadcast({
      type: 'state',
      agentId: this.agentId,
      inflight: this.localInflight,
      timestamp: Date.now(),
    });
  }

  #broadcast(message) {
    if (!this.supported || this.isDisposed) return;
    try {
      this.channel.postMessage(message);
    } catch (error) {
      logger.debug('[OllamaSync] broadcast failed', { error: error.message });
    }
  }

  shutdown() {
    if (this.isDisposed) return;
    this.isDisposed = true;

    if (this.supported) {
      try {
        this.#broadcast({ type: 'goodbye', agentId: this.agentId, timestamp: Date.now() });
      } catch {}
      try {
        this.channel.close();
      } catch {}
      if (this.broadcastTimer) {
        clearIntervalTimer(this.broadcastTimer);
      }
    }
    for (const waiter of this.waiters) {
      try {
        waiter.resolve(() => {});
      } catch {}
    }
    this.waiters.clear();
    this.localInflight = 0;
    this.peerStates.clear();
  }
}
