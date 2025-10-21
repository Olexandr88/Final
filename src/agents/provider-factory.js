/**
 * Provider Factory
 * Intelligent provider selection for Ollama agents
 * Supports cloud, local, and hybrid configurations with automatic failover
 */

import { OllamaCloudAgent } from './ollama-cloud-agent.js';
import { logger } from '../utils/logger.js';
import { OllamaCloudClient } from '../clients/ollama-cloud-client.js';

export class ProviderFactory {
  constructor(config = {}) {
    this.config = {
      preferredProvider: config.preferredProvider || process.env.OLLAMA_PROVIDER || 'auto',
      fallbackEnabled: config.fallbackEnabled !== false,
      healthCheckInterval: config.healthCheckInterval || 30000,
      ...config,
    };

    this.providers = new Map();
    this.healthStatus = new Map();

    logger.info('ProviderFactory initialized', {
      preferredProvider: this.config.preferredProvider,
      fallbackEnabled: this.config.fallbackEnabled,
    });
  }

  /**
   * Create an agent instance based on configuration
   * @param {Object} agentConfig - Agent configuration
   * @returns {Promise<BaseAgent>} Agent instance
   */
  async createAgent(agentConfig = {}) {
    const provider = agentConfig.provider || this.config.preferredProvider;

    logger.info('Creating agent', { provider });

    switch (provider) {
      case 'cloud':
        return this._createCloudAgent(agentConfig);

      case 'local':
        return this._createLocalAgent(agentConfig);

      case 'auto':
      case 'hybrid':
        return await this._createAutoAgent(agentConfig);

      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Create cloud agent
   * @private
   */
  _createCloudAgent(config) {
    const agent = new OllamaCloudAgent({
      ...config,
      fallbackToLocal: this.config.fallbackEnabled,
    });

    this.providers.set('cloud', agent);
    return agent;
  }

  /**
   * Create local agent (import existing implementation)
   * @private
   */
  async _createLocalAgent(config) {
    try {
      // Dynamically import local agent to avoid circular dependencies
      const { default: LocalOllamaAgent } = await import('./a2a-ollama-agent.js');

      const agent = new LocalOllamaAgent({
        ...config,
        clientId: config.clientId || 'ollama-local-agent',
      });

      this.providers.set('local', agent);
      return agent;
    } catch (error) {
      logger.error('Failed to create local agent', { error: error.message });
      throw new Error(`Local agent creation failed: ${error.message}`);
    }
  }

  /**
   * Create auto-selecting agent (tries cloud, falls back to local)
   * @private
   */
  async _createAutoAgent(config) {
    // Check cloud health first
    const cloudHealthy = await this._checkCloudHealth();

    if (cloudHealthy) {
      logger.info('Cloud is healthy, using cloud agent');
      return this._createCloudAgent({
        ...config,
        fallbackToLocal: true,
      });
    } else {
      logger.info('Cloud unhealthy, falling back to local agent');
      return this._createLocalAgent(config);
    }
  }

  /**
   * Check if cloud provider is healthy
   * @private
   */
  async _checkCloudHealth() {
    try {
      const client = new OllamaCloudClient({
        endpoint: process.env.OLLAMA_CLOUD_ENDPOINT,
        apiKey: process.env.OLLAMA_CLOUD_API_KEY,
      });

      const health = await client.healthCheck();
      await client.close();

      this.healthStatus.set('cloud', {
        status: health.status,
        available: health.available,
        lastCheck: new Date().toISOString(),
      });

      return health.available;
    } catch (error) {
      logger.warn('Cloud health check failed', { error: error.message });

      this.healthStatus.set('cloud', {
        status: 'unhealthy',
        available: false,
        lastCheck: new Date().toISOString(),
        error: error.message,
      });

      return false;
    }
  }

  /**
   * Get all provider health statuses
   * @returns {Object} Health status map
   */
  getHealthStatus() {
    return Object.fromEntries(this.healthStatus);
  }

  /**
   * Get active providers
   * @returns {Array<string>} Provider names
   */
  getActiveProviders() {
    return Array.from(this.providers.keys());
  }

  /**
   * Switch provider for an existing agent
   * @param {string} currentProvider - Current provider name
   * @param {string} newProvider - New provider name
   * @returns {Promise<BaseAgent>} New agent instance
   */
  async switchProvider(currentProvider, newProvider) {
    logger.info('Switching provider', { from: currentProvider, to: newProvider });

    // Disconnect current agent
    const currentAgent = this.providers.get(currentProvider);
    if (currentAgent) {
      await currentAgent.disconnect();
      this.providers.delete(currentProvider);
    }

    // Create new agent
    return this.createAgent({ provider: newProvider });
  }

  /**
   * Cleanup all providers
   */
  async cleanup() {
    logger.info('Cleaning up all providers');

    for (const [name, agent] of this.providers.entries()) {
      try {
        await agent.disconnect();
        logger.debug(`Provider ${name} disconnected`);
      } catch (error) {
        logger.error(`Failed to disconnect provider ${name}`, {
          error: error.message,
        });
      }
    }

    this.providers.clear();
    this.healthStatus.clear();
  }
}

export default ProviderFactory;
