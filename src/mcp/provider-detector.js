/**
 * MCP Provider Auto-Detection Tool
 * Identifies available LLM providers and their configurations
 */

import { config } from 'dotenv';
import { ClaudeClient } from '../claude-client.js';
import { OllamaClient } from '../clients/ollama-client.js';

config();

/**
 * Provider detector class
 */
export class ProviderDetector {
  constructor(options = {}) {
    this.timeout = options.timeout || 5000;
    this.providers = {
      claude: {
        name: 'claude',
        displayName: 'Anthropic Claude',
        envVar: 'ANTHROPIC_API_KEY',
        capabilities: ['chat', 'analysis', 'code_generation', 'reasoning', 'vision'],
        models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307']
      },
      ollama: {
        name: 'ollama',
        displayName: 'Ollama (Local)',
        envVar: null,
        endpoint: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        capabilities: ['chat', 'code_generation', 'embeddings'],
        models: [] // Dynamically detected
      },
      jules: {
        name: 'jules',
        displayName: 'Jules API',
        envVar: 'JULES_API_KEY',
        endpoint: process.env.JULES_API_URL || 'https://api.jules.ai',
        capabilities: ['chat', 'task_automation', 'workflow'],
        models: ['jules-1']
      },
      openai: {
        name: 'openai',
        displayName: 'OpenAI',
        envVar: 'OPENAI_API_KEY',
        capabilities: ['chat', 'code_generation', 'vision', 'tts', 'embeddings'],
        models: ['gpt-4', 'gpt-3.5-turbo', 'gpt-4-turbo']
      },
      perplexity: {
        name: 'perplexity',
        displayName: 'Perplexity AI',
        envVar: 'PERPLEXITY_API_KEY',
        endpoint: 'https://api.perplexity.ai',
        capabilities: ['chat', 'search', 'citations'],
        models: ['llama-3.1-sonar-large-128k-online', 'llama-3.1-sonar-small-128k-online']
      }
    };
  }

  /**
   * Detect all available providers
   * @param {Object} options - Detection options
   * @param {boolean} options.includeHealth - Include health checks
   * @param {boolean} options.includeModels - Include available models
   * @returns {Promise<Object>} Provider detection results
   */
  async detectProviders(options = {}) {
    const {
      includeHealth = false,
      includeModels = false
    } = options;

    const results = {
      timestamp: new Date().toISOString(),
      providers: [],
      summary: {
        total: 0,
        available: 0,
        configured: 0,
        healthy: 0
      }
    };

    // Detect each provider
    for (const [key, provider] of Object.entries(this.providers)) {
      const detection = await this._detectProvider(provider, {
        includeHealth,
        includeModels
      });

      results.providers.push(detection);
      results.summary.total++;

      if (detection.available) results.summary.available++;
      if (detection.configured) results.summary.configured++;
      if (detection.healthy) results.summary.healthy++;
    }

    return results;
  }

  /**
   * Detect a specific provider
   * @private
   * @param {Object} provider - Provider configuration
   * @param {Object} options - Detection options
   * @returns {Promise<Object>} Detection result
   */
  async _detectProvider(provider, options = {}) {
    const result = {
      name: provider.name,
      displayName: provider.displayName,
      available: false,
      configured: false,
      healthy: false,
      capabilities: provider.capabilities,
      models: provider.models || [],
      endpoint: provider.endpoint || null,
      error: null,
      metadata: {}
    };

    try {
      // Check configuration
      result.configured = this._isConfigured(provider);

      // Check availability based on provider type
      if (provider.name === 'claude') {
        result.available = await this._checkClaude(result, options);
      } else if (provider.name === 'ollama') {
        result.available = await this._checkOllama(result, options);
      } else if (provider.name === 'jules') {
        result.available = await this._checkJules(result, options);
      } else if (provider.name === 'openai') {
        result.available = await this._checkOpenAI(result, options);
      } else if (provider.name === 'perplexity') {
        result.available = await this._checkPerplexity(result, options);
      }

      // Health is true if both configured and available
      result.healthy = result.configured && result.available;

    } catch (error) {
      result.error = error.message;
      result.available = false;
      result.healthy = false;
    }

    return result;
  }

  /**
   * Check if provider is configured
   * @private
   * @param {Object} provider - Provider configuration
   * @returns {boolean} Configuration status
   */
  _isConfigured(provider) {
    if (!provider.envVar) {
      // Providers without API keys (like Ollama) are always "configured"
      return true;
    }

    const value = process.env[provider.envVar];
    return !!(value && value.trim() && !value.includes('your-') && value !== '');
  }

  /**
   * Check Claude availability
   * @private
   */
  async _checkClaude(result, options) {
    if (!result.configured) return false;

    try {
      const client = new ClaudeClient();

      if (options.includeHealth) {
        // Simple health check - try to create a minimal request
        const testResponse = await Promise.race([
          client.sendMessage('ping', 'Respond with only "pong"', { stream: false }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Health check timeout')), this.timeout)
          )
        ]);

        result.metadata.healthCheck = 'passed';
        result.metadata.responseTime = Date.now();
      }

      result.metadata.model = client.model;
      result.metadata.maxTokens = client.maxTokens;

      return true;
    } catch (error) {
      result.error = `Claude check failed: ${error.message}`;
      return false;
    }
  }

  /**
   * Check Ollama availability
   * @private
   */
  async _checkOllama(result, options) {
    try {
      const client = new OllamaClient();

      // Check if Ollama is running
      const available = await client.isAvailable();
      if (!available) {
        result.error = 'Ollama service not running or unreachable';
        return false;
      }

      // Get available models
      if (options.includeModels) {
        const modelsResult = await client.listModels();
        if (modelsResult.success) {
          result.models = modelsResult.models.map(m => m.name);
          result.metadata.modelCount = result.models.length;
        }
      }

      result.metadata.baseUrl = client.baseUrl;
      result.metadata.defaultModel = client.model;

      if (options.includeHealth) {
        result.metadata.healthCheck = 'passed';
      }

      return true;
    } catch (error) {
      result.error = `Ollama check failed: ${error.message}`;
      return false;
    }
  }

  /**
   * Check Jules availability
   * @private
   */
  async _checkJules(result, options) {
    if (!result.configured) return false;

    try {
      const apiKey = process.env.JULES_API_KEY;
      const endpoint = process.env.JULES_API_URL || 'https://api.jules.ai';

      if (options.includeHealth) {
        const response = await fetch(`${endpoint}/health`, {
          headers: { 'Authorization': `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(this.timeout)
        });

        if (!response.ok) {
          result.error = `Jules API returned ${response.status}`;
          return false;
        }

        result.metadata.healthCheck = 'passed';
      }

      result.metadata.endpoint = endpoint;
      return true;
    } catch (error) {
      result.error = `Jules check failed: ${error.message}`;
      return false;
    }
  }

  /**
   * Check OpenAI availability
   * @private
   */
  async _checkOpenAI(result, options) {
    if (!result.configured) return false;

    try {
      const apiKey = process.env.OPENAI_API_KEY;

      if (options.includeHealth) {
        const response = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(this.timeout)
        });

        if (!response.ok) {
          result.error = `OpenAI API returned ${response.status}`;
          return false;
        }

        result.metadata.healthCheck = 'passed';
      }

      result.metadata.endpoint = 'https://api.openai.com';
      return true;
    } catch (error) {
      result.error = `OpenAI check failed: ${error.message}`;
      return false;
    }
  }

  /**
   * Check Perplexity availability
   * @private
   */
  async _checkPerplexity(result, options) {
    if (!result.configured) return false;

    try {
      const apiKey = process.env.PERPLEXITY_API_KEY;
      const endpoint = 'https://api.perplexity.ai';

      if (options.includeHealth) {
        // Perplexity uses chat completions endpoint
        const response = await fetch(`${endpoint}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'llama-3.1-sonar-small-128k-online',
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 1
          }),
          signal: AbortSignal.timeout(this.timeout)
        });

        if (!response.ok && response.status !== 429) { // 429 = rate limit, but means it's working
          result.error = `Perplexity API returned ${response.status}`;
          return false;
        }

        result.metadata.healthCheck = 'passed';
      }

      result.metadata.endpoint = endpoint;
      return true;
    } catch (error) {
      result.error = `Perplexity check failed: ${error.message}`;
      return false;
    }
  }

  /**
   * Get MCP tool definition
   * @returns {Object} MCP tool schema
   */
  static getToolDefinition() {
    return {
      name: 'detect_providers',
      description: 'Auto-detect available LLM providers and their configurations. Returns information about which providers (Claude, Ollama, Jules, OpenAI, Perplexity) are configured and available.',
      inputSchema: {
        type: 'object',
        properties: {
          includeHealth: {
            type: 'boolean',
            description: 'Include health check by making test requests to each provider',
            default: false
          },
          includeModels: {
            type: 'boolean',
            description: 'Include list of available models for each provider',
            default: false
          }
        }
      }
    };
  }

  /**
   * Execute the tool (for MCP server integration)
   * @param {Object} params - Tool parameters
   * @returns {Promise<Object>} Detection results
   */
  async executeTool(params = {}) {
    const {
      includeHealth = false,
      includeModels = false
    } = params;

    const results = await this.detectProviders({
      includeHealth,
      includeModels
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results, null, 2)
        }
      ]
    };
  }
}

/**
 * Standalone function for quick detection
 * @param {Object} options - Detection options
 * @returns {Promise<Object>} Detection results
 */
export async function detectProviders(options = {}) {
  const detector = new ProviderDetector();
  return detector.detectProviders(options);
}

export default ProviderDetector;
