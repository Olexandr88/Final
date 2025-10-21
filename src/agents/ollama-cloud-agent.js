/**
 * Ollama Cloud Agent
 * Extends BaseAgent to provide cloud-hosted Ollama model access
 * Integrates with A2A Bridge for distributed AI orchestration
 */

import { BaseAgent } from './base-agent.js';
import { OllamaCloudClient } from '../clients/ollama-cloud-client.js';
import { logger } from '../utils/logger.js';

export class OllamaCloudAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      clientId: config.clientId || 'ollama-cloud-agent',
      role: 'ai-assistant',
      labels: ['ollama', 'cloud', 'llm', 'ai'],
      tools: ['conversation', 'analysis', 'reasoning', 'streaming'],
      intents: [
        'ai.query',
        'ai.analyze',
        'ai.converse',
        'ai.stream',
        'agent.health',
        'cloud.status',
      ],
      ...config,
    });

    // Initialize cloud client
    this.cloudClient = new OllamaCloudClient({
      endpoint: config.cloudEndpoint || process.env.OLLAMA_CLOUD_ENDPOINT,
      apiKey: config.cloudApiKey || process.env.OLLAMA_CLOUD_API_KEY,
      model: config.cloudModel || process.env.OLLAMA_CLOUD_MODEL,
      fallbackToLocal: config.fallbackToLocal !== false,
      streamingEnabled: config.streamingEnabled !== false,
    });

    // Fallback configuration
    this.fallbackEnabled = config.fallbackToLocal !== false;
    this.localFallbackClient = null;

    // Conversation history (per session)
    this.conversations = new Map();

    // Performance metrics
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      fallbackRequests: 0,
      averageLatency: 0,
      totalLatency: 0,
    };

    logger.info('OllamaCloudAgent initialized', {
      clientId: this.config.clientId,
      cloudEndpoint: this.cloudClient.config.endpoint,
      fallbackEnabled: this.fallbackEnabled,
    });

    // Monitor cloud client health
    this.cloudClient.on('health', (status) => {
      this.emit('cloudHealth', status);
    });
  }

  /**
   * Handle intent-based messages from A2A Bridge
   * @override
   */
  async handleIntent(envelope) {
    const { intent, payload, from, id } = envelope;

    logger.info(`Handling intent: ${intent}`, {
      from,
      messageId: id,
    });

    try {
      switch (intent) {
        case 'ai.query':
        case 'ai.analyze':
        case 'ai.converse':
          return await this._handleGeneration(envelope);

        case 'ai.stream':
          return await this._handleStreamGeneration(envelope);

        case 'agent.health':
          return await this._handleHealthCheck(envelope);

        case 'cloud.status':
          return await this._handleCloudStatus(envelope);

        default:
          return await super.handleIntent(envelope);
      }
    } catch (error) {
      logger.error(`Intent handling failed: ${intent}`, {
        error: error.message,
        from,
        messageId: id,
      });

      this.sendResponse(envelope, {
        status: 'error',
        error: error.message,
        agent: this.config.clientId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Handle text generation (non-streaming)
   * @private
   */
  async _handleGeneration(envelope) {
    const { payload, from, id } = envelope;
    const startTime = Date.now();

    this.metrics.totalRequests++;

    try {
      // Extract prompt from various payload formats
      const prompt = payload.message || payload.query || payload.prompt || payload.question;

      if (!prompt) {
        throw new Error('No prompt provided in payload');
      }

      logger.info('Processing generation request', {
        from,
        promptLength: prompt.length,
        provider: 'cloud',
      });

      // Try cloud first
      let result;
      try {
        result = await this.cloudClient.generate({
          prompt,
          temperature: payload.temperature,
          top_p: payload.top_p,
          top_k: payload.top_k,
          num_predict: payload.max_tokens || payload.num_predict,
          model: payload.model,
        });

        this.metrics.successfulRequests++;
      } catch (cloudError) {
        logger.warn('Cloud generation failed, attempting fallback', {
          error: cloudError.message,
        });

        if (this.fallbackEnabled) {
          result = await this._fallbackToLocal(prompt, payload);
          this.metrics.fallbackRequests++;
        } else {
          throw cloudError;
        }
      }

      const latency = Date.now() - startTime;
      this.metrics.totalLatency += latency;
      this.metrics.averageLatency = this.metrics.totalLatency / this.metrics.successfulRequests;

      logger.info('Generation completed', {
        provider: result.provider,
        latency,
        responseLength: result.response?.length,
      });

      // Send response back through bridge
      this.sendResponse(envelope, {
        status: 'success',
        response: result.response,
        model: result.model,
        provider: result.provider,
        endpoint: result.endpoint,
        latency,
        agent: this.config.clientId,
        timestamp: new Date().toISOString(),
        metadata: {
          total_duration: result.total_duration,
          eval_count: result.eval_count,
          prompt_eval_count: result.prompt_eval_count,
        },
      });
    } catch (error) {
      this.metrics.failedRequests++;

      logger.error('Generation request failed', {
        error: error.message,
        from,
        messageId: id,
      });

      this.sendResponse(envelope, {
        status: 'error',
        error: error.message,
        agent: this.config.clientId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Handle streaming generation
   * @private
   */
  async _handleStreamGeneration(envelope) {
    const { payload, from, id } = envelope;

    this.metrics.totalRequests++;

    try {
      const prompt = payload.message || payload.query || payload.prompt;

      if (!prompt) {
        throw new Error('No prompt provided in payload');
      }

      logger.info('Processing streaming request', {
        from,
        promptLength: prompt.length,
      });

      // Send initial acknowledgment
      this.send({
        type: 'stream_start',
        to: from,
        correlationId: id,
        from: this.config.clientId,
        timestamp: new Date().toISOString(),
      });

      // Stream tokens
      let fullResponse = '';
      const result = await this.cloudClient.generateStream(
        {
          prompt,
          temperature: payload.temperature,
          model: payload.model,
        },
        (token) => {
          fullResponse += token;

          // Send each token through bridge
          this.send({
            type: 'stream_token',
            to: from,
            correlationId: id,
            from: this.config.clientId,
            payload: {
              token,
              accumulated: fullResponse,
            },
            timestamp: new Date().toISOString(),
          });
        }
      );

      this.metrics.successfulRequests++;

      // Send completion
      this.send({
        type: 'stream_complete',
        to: from,
        correlationId: id,
        from: this.config.clientId,
        payload: {
          response: fullResponse,
          provider: result.provider,
          streaming: result.streaming,
        },
        timestamp: new Date().toISOString(),
      });

      logger.info('Streaming completed', {
        responseLength: fullResponse.length,
        provider: result.provider,
      });
    } catch (error) {
      this.metrics.failedRequests++;

      logger.error('Streaming request failed', {
        error: error.message,
        from,
      });

      // Send error through streaming channel
      this.send({
        type: 'stream_error',
        to: from,
        correlationId: id,
        from: this.config.clientId,
        payload: {
          error: error.message,
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Handle health check requests
   * @private
   */
  async _handleHealthCheck(envelope) {
    const cloudHealth = await this.cloudClient.healthCheck();
    const agentStatus = this.getStatus();

    this.sendResponse(envelope, {
      status: 'ok',
      agent: {
        ...agentStatus,
        metrics: this.metrics,
      },
      cloud: cloudHealth,
      fallbackEnabled: this.fallbackEnabled,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle cloud status requests
   * @private
   */
  async _handleCloudStatus(envelope) {
    const health = this.cloudClient.getHealth();

    this.sendResponse(envelope, {
      status: health.status,
      health,
      metrics: this.metrics,
      endpoint: this.cloudClient.config.endpoint,
      model: this.cloudClient.config.model,
      fallbackEnabled: this.fallbackEnabled,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Fallback to local Ollama instance
   * @private
   */
  async _fallbackToLocal(prompt, options = {}) {
    logger.info('Falling back to local Ollama instance');

    // Import local agent dynamically to avoid circular dependencies
    if (!this.localFallbackClient) {
      const { default: fetch } = await import('node-fetch');
      this.localFallbackClient = { fetch };
    }

    const localEndpoint = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

    try {
      const response = await this.localFallbackClient.fetch(`${localEndpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.model || process.env.OLLAMA_MODEL || 'llama2',
          prompt,
          stream: false,
          options: {
            temperature: options.temperature || 0.7,
            top_p: options.top_p || 0.9,
            num_predict: options.num_predict || 512,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Local Ollama failed: ${response.status}`);
      }

      const result = await response.json();

      return {
        success: true,
        response: result.response,
        model: result.model,
        provider: 'ollama-local-fallback',
        endpoint: localEndpoint,
        ...result,
      };
    } catch (error) {
      logger.error('Local fallback failed', { error: error.message });
      throw new Error(`Both cloud and local Ollama failed: ${error.message}`);
    }
  }

  /**
   * Get agent metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      cloudHealth: this.cloudClient.getHealth(),
    };
  }

  /**
   * Cleanup resources
   * @override
   */
  async disconnect() {
    await this.cloudClient.close();
    await super.disconnect();

    logger.info('OllamaCloudAgent disconnected');
  }
}

export default OllamaCloudAgent;
