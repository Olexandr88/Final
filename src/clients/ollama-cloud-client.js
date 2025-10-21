/**
 * Ollama Cloud Client
 * Provides unified interface for remote Ollama instances (cloud/self-hosted)
 * Supports HTTP API and WebSocket streaming with automatic fallback
 */

import fetch from 'node-fetch';
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { CircuitBreaker } from '../utils/circuit-breaker.js';

export class OllamaCloudClient extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      endpoint: config.endpoint || process.env.OLLAMA_CLOUD_ENDPOINT || 'http://localhost:11434',
      apiKey: config.apiKey || process.env.OLLAMA_CLOUD_API_KEY,
      model: config.model || process.env.OLLAMA_CLOUD_MODEL || 'llama3',
      timeout: config.timeout || 30000,
      retries: config.retries || 2,
      streamingEnabled: config.streamingEnabled !== false,
      healthCheckInterval: config.healthCheckInterval || 60000,
      fallbackToLocal: config.fallbackToLocal !== false,
      ...config,
    };

    // Circuit breaker for fault tolerance
    this.circuitBreaker = new CircuitBreaker({
      threshold: 3,
      timeout: 60000,
      resetTimeout: 30000,
    });

    // Health tracking
    this.health = {
      status: 'unknown',
      lastCheck: null,
      lastSuccess: null,
      lastFailure: null,
      latency: null,
      consecutiveFailures: 0,
    };

    // WebSocket connection for streaming
    this.ws = null;
    this.wsReconnectAttempts = 0;
    this.wsMaxReconnectAttempts = 5;

    // Start health monitoring
    this.startHealthMonitoring();

    logger.info('OllamaCloudClient initialized', {
      endpoint: this.config.endpoint,
      model: this.config.model,
      streaming: this.config.streamingEnabled,
    });
  }

  /**
   * Generate text completion (non-streaming)
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Generation result
   */
  async generate(options = {}) {
    const startTime = Date.now();

    try {
      // Check circuit breaker
      if (!this.circuitBreaker.canExecute()) {
        throw new Error('Circuit breaker open - cloud endpoint unavailable');
      }

      const payload = {
        model: options.model || this.config.model,
        prompt: options.prompt || '',
        stream: false,
        options: {
          temperature: options.temperature || 0.7,
          top_p: options.top_p || 0.9,
          top_k: options.top_k || 40,
          num_predict: options.num_predict || 512,
          num_ctx: options.num_ctx || 4096,
          ...options.modelOptions,
        },
      };

      const response = await this._makeRequest('/api/generate', {
        method: 'POST',
        body: JSON.stringify(payload),
        timeout: this.config.timeout,
      });

      const result = await response.json();

      // Update health metrics
      this.health.latency = Date.now() - startTime;
      this.health.lastSuccess = new Date().toISOString();
      this.health.status = 'healthy';
      this.health.consecutiveFailures = 0;
      this.circuitBreaker.recordSuccess();

      logger.debug('Cloud generation successful', {
        model: payload.model,
        latency: this.health.latency,
        responseLength: result.response?.length,
      });

      return {
        success: true,
        response: result.response,
        model: result.model,
        context: result.context,
        created_at: result.created_at,
        done: result.done,
        total_duration: result.total_duration,
        load_duration: result.load_duration,
        prompt_eval_count: result.prompt_eval_count,
        prompt_eval_duration: result.prompt_eval_duration,
        eval_count: result.eval_count,
        eval_duration: result.eval_duration,
        provider: 'ollama-cloud',
        endpoint: this.config.endpoint,
      };
    } catch (error) {
      // Update health metrics
      this.health.consecutiveFailures++;
      this.health.lastFailure = new Date().toISOString();
      this.health.status = 'unhealthy';
      this.circuitBreaker.recordFailure();

      logger.error('Cloud generation failed', {
        error: error.message,
        consecutiveFailures: this.health.consecutiveFailures,
      });

      throw error;
    }
  }

  /**
   * Generate text with streaming (WebSocket or SSE)
   * @param {Object} options - Generation options
   * @param {Function} onToken - Callback for each token
   * @returns {Promise<Object>} Final result
   */
  async generateStream(options = {}, onToken) {
    if (!this.config.streamingEnabled) {
      logger.warn('Streaming disabled, falling back to non-streaming');
      return await this.generate(options);
    }

    const startTime = Date.now();

    try {
      // Check circuit breaker
      if (!this.circuitBreaker.canExecute()) {
        throw new Error('Circuit breaker open - cloud endpoint unavailable');
      }

      const payload = {
        model: options.model || this.config.model,
        prompt: options.prompt || '',
        stream: true,
        options: {
          temperature: options.temperature || 0.7,
          top_p: options.top_p || 0.9,
          top_k: options.top_k || 40,
          num_predict: options.num_predict || 512,
          num_ctx: options.num_ctx || 4096,
          ...options.modelOptions,
        },
      };

      // Try WebSocket first, fall back to HTTP streaming
      if (this._supportsWebSocket()) {
        return await this._generateStreamWS(payload, onToken, startTime);
      } else {
        return await this._generateStreamHTTP(payload, onToken, startTime);
      }
    } catch (error) {
      this.health.consecutiveFailures++;
      this.health.lastFailure = new Date().toISOString();
      this.health.status = 'unhealthy';
      this.circuitBreaker.recordFailure();

      logger.error('Streaming generation failed', {
        error: error.message,
        consecutiveFailures: this.health.consecutiveFailures,
      });

      throw error;
    }
  }

  /**
   * Stream via WebSocket
   * @private
   */
  async _generateStreamWS(payload, onToken, startTime) {
    return new Promise((resolve, reject) => {
      const wsEndpoint = this.config.endpoint.replace(/^http/, 'ws') + '/api/generate/stream';
      const ws = new WebSocket(wsEndpoint, {
        headers: this._getHeaders(),
      });

      let fullResponse = '';
      let finalResult = null;

      ws.on('open', () => {
        ws.send(JSON.stringify(payload));
      });

      ws.on('message', (data) => {
        try {
          const chunk = JSON.parse(data.toString());

          if (chunk.response) {
            fullResponse += chunk.response;
            if (onToken) {
              onToken(chunk.response);
            }
          }

          if (chunk.done) {
            finalResult = chunk;
            ws.close();
          }
        } catch (error) {
          logger.error('WebSocket message parse error', { error: error.message });
        }
      });

      ws.on('close', () => {
        this.health.latency = Date.now() - startTime;
        this.health.lastSuccess = new Date().toISOString();
        this.health.status = 'healthy';
        this.health.consecutiveFailures = 0;
        this.circuitBreaker.recordSuccess();

        resolve({
          success: true,
          response: fullResponse,
          ...finalResult,
          provider: 'ollama-cloud',
          endpoint: this.config.endpoint,
          streaming: 'websocket',
        });
      });

      ws.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Stream via HTTP (SSE-like)
   * @private
   */
  async _generateStreamHTTP(payload, onToken, startTime) {
    const response = await this._makeRequest('/api/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    let fullResponse = '';
    let finalResult = null;

    // Read stream chunk by chunk
    for await (const chunk of response.body) {
      const lines = chunk
        .toString()
        .split('\n')
        .filter((line) => line.trim());

      for (const line of lines) {
        try {
          const data = JSON.parse(line);

          if (data.response) {
            fullResponse += data.response;
            if (onToken) {
              onToken(data.response);
            }
          }

          if (data.done) {
            finalResult = data;
          }
        } catch (error) {
          logger.debug('Stream chunk parse error', { error: error.message });
        }
      }
    }

    this.health.latency = Date.now() - startTime;
    this.health.lastSuccess = new Date().toISOString();
    this.health.status = 'healthy';
    this.health.consecutiveFailures = 0;
    this.circuitBreaker.recordSuccess();

    return {
      success: true,
      response: fullResponse,
      ...finalResult,
      provider: 'ollama-cloud',
      endpoint: this.config.endpoint,
      streaming: 'http',
    };
  }

  /**
   * Health check - ping the cloud endpoint
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    const startTime = Date.now();
    this.health.lastCheck = new Date().toISOString();

    try {
      const response = await this._makeRequest('/api/tags', {
        method: 'GET',
        timeout: 5000,
      });

      const data = await response.json();
      const latency = Date.now() - startTime;

      this.health.status = 'healthy';
      this.health.latency = latency;
      this.health.lastSuccess = new Date().toISOString();
      this.health.consecutiveFailures = 0;

      logger.debug('Health check passed', {
        latency,
        models: data.models?.length || 0,
      });

      return {
        status: 'healthy',
        latency,
        available: true,
        models: data.models || [],
        endpoint: this.config.endpoint,
      };
    } catch (error) {
      this.health.status = 'unhealthy';
      this.health.lastFailure = new Date().toISOString();
      this.health.consecutiveFailures++;

      logger.warn('Health check failed', {
        error: error.message,
        consecutiveFailures: this.health.consecutiveFailures,
      });

      return {
        status: 'unhealthy',
        available: false,
        error: error.message,
        endpoint: this.config.endpoint,
      };
    }
  }

  /**
   * Get current health status
   * @returns {Object} Health status
   */
  getHealth() {
    return { ...this.health };
  }

  /**
   * Start automatic health monitoring
   * @private
   */
  startHealthMonitoring() {
    // Initial health check
    this.healthCheck().catch((error) => {
      logger.debug('Initial health check failed', { error: error.message });
    });

    // Periodic health checks
    this.healthCheckTimer = setInterval(() => {
      this.healthCheck().catch((error) => {
        logger.debug('Periodic health check failed', { error: error.message });
      });
    }, this.config.healthCheckInterval);
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Make HTTP request with retries
   * @private
   */
  async _makeRequest(path, options = {}) {
    const url = `${this.config.endpoint}${path}`;
    const requestOptions = {
      method: options.method || 'GET',
      headers: this._getHeaders(),
      ...options,
    };

    // Add timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || this.config.timeout);
    requestOptions.signal = controller.signal;

    let lastError;
    const maxRetries = options.retries !== undefined ? options.retries : this.config.retries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, requestOptions);
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
      } catch (error) {
        lastError = error;

        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          logger.debug(`Request failed, retrying in ${delay}ms`, {
            attempt: attempt + 1,
            maxRetries,
            error: error.message,
          });
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    clearTimeout(timeoutId);
    throw lastError;
  }

  /**
   * Get request headers
   * @private
   */
  _getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'OllamaCloudClient/1.0',
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }

  /**
   * Check if WebSocket streaming is supported
   * @private
   */
  _supportsWebSocket() {
    // Check if endpoint supports WebSocket upgrade
    return this.config.endpoint.startsWith('http') && this.config.streamingEnabled;
  }

  /**
   * Cleanup resources
   */
  async close() {
    this.stopHealthMonitoring();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    logger.info('OllamaCloudClient closed');
  }
}

export default OllamaCloudClient;
