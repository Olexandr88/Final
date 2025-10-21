/**
 * API Client for AI Bridge HTTP Interface
 * Provides programmatic access to the autonomous system
 */

import http from 'http';
import { logger } from '../utils/logger.js';

export class BridgeAPIClient {
  constructor(baseUrl = 'http://localhost:65029') {
    this.baseUrl = baseUrl;
  }

  /**
   * Send a message via HTTP API
   * @param {string} to - Target agent ID
   * @param {string} intent - Message intent
   * @param {Object} payload - Message payload
   * @returns {Promise<Object>} Response
   */
  async sendMessage(to, intent, payload) {
    return this._request('/api/send', {
      to,
      intent,
      payload,
    });
  }

  /**
   * Send batch messages
   * @param {Array<Object>} messages - Array of messages
   * @returns {Promise<Object>} Response
   */
  async sendBatch(messages) {
    return this._request('/api/send/batch', { messages });
  }

  /**
   * Create a specialized agent via Meta-Agent Factory
   * @param {string} type - Agent type (security-scanner, test-generator, etc.)
   * @param {string} name - Agent name
   * @returns {Promise<Object>} Response
   */
  async createAgent(type, name) {
    return this.sendMessage('meta-agent-factory', 'agent.create', {
      type,
      name,
    });
  }

  /**
   * Spawn a created agent
   * @param {string} agentName - Name of agent to spawn
   * @returns {Promise<Object>} Response
   */
  async spawnAgent(agentName) {
    return this.sendMessage('meta-agent-factory', 'agent.spawn', {
      agentName,
    });
  }

  /**
   * List spawned agents
   * @returns {Promise<Object>} Response
   */
  async listAgents() {
    return this.sendMessage('meta-agent-factory', 'agent.list', {});
  }

  /**
   * Send AI query to Ollama agent
   * @param {string} message - Message to send
   * @param {string} agentId - Target Ollama agent (optional)
   * @returns {Promise<Object>} Response
   */
  async queryOllama(message, agentId = 'ollama-agent-1') {
    return this.sendMessage(agentId, 'ai.query', { message });
  }

  /**
   * Get bridge health status
   * @returns {Promise<Object>} Health status
   */
  async getHealth() {
    return this._request('/health', null, 'GET');
  }

  /**
   * Get connected clients
   * @returns {Promise<Object>} Connected clients
   */
  async getClients() {
    return this._request('/api/clients', null, 'GET');
  }

  /**
   * Make HTTP request
   * @private
   */
  async _request(path, body = null, method = 'POST') {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const postData = body ? JSON.stringify(body) : null;

      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(postData && { 'Content-Length': Buffer.byteLength(postData) }),
        },
        timeout: 30000,
      };

      const req = http.request(url, options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${parsed.error || data}`));
            }
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });

      if (postData) {
        req.write(postData);
      }

      req.end();
    });
  }
}

export default BridgeAPIClient;
