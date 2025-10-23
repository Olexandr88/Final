/**
 * AI Integration for IDE
 * Connects Monaco editor to AI Bridge for intelligent code assistance
 * @module ide/features/ai-integration
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { logger } from '../../utils/logger.js';

/**
 * AI Integration Manager
 * Handles communication with AI Bridge for code completion, refactoring, and analysis
 */
export class AIIntegration extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      bridgeUrl: options.bridgeUrl || 'ws://localhost:65028',
      clientId: options.clientId || `ide-${Date.now()}`,
      reconnectDelay: options.reconnectDelay || 5000,
      requestTimeout: options.requestTimeout || 30000,
      enableCompletions: options.enableCompletions ?? true,
      enableDiagnostics: options.enableDiagnostics ?? true,
      enableRefactoring: options.enableRefactoring ?? true,
      enableDocGeneration: options.enableDocGeneration ?? true,
      completionDebounce: options.completionDebounce || 300,
      preferredProvider: options.preferredProvider || 'claude' // claude | ollama | jules
    };

    this.ws = null;
    this.connected = false;
    this.reconnecting = false;
    this.requestMap = new Map(); // requestId -> { resolve, reject, timeout }
    this.requestCounter = 0;

    this.stats = {
      completionsRequested: 0,
      completionsReceived: 0,
      diagnosticsRequested: 0,
      diagnosticsReceived: 0,
      refactoringsRequested: 0,
      refactoringsReceived: 0,
      docsGenerated: 0,
      errors: 0,
      avgResponseTime: 0
    };

    this.completionCache = new Map(); // cacheKey -> { suggestions, timestamp }
    this.cacheTTL = 60000; // 1 minute
  }

  /**
   * Connect to AI Bridge
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.connected) {
      logger.warn('[AI] Already connected to bridge');
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        logger.info('[AI] Connecting to AI Bridge', { url: this.options.bridgeUrl });

        this.ws = new WebSocket(this.options.bridgeUrl);

        this.ws.on('open', () => {
          this.connected = true;
          this.reconnecting = false;

          // Register with bridge
          this._send({
            type: 'register',
            data: {
              clientId: this.options.clientId,
              capabilities: [
                'code-completion',
                'code-analysis',
                'refactoring',
                'documentation'
              ],
              preferredProvider: this.options.preferredProvider
            }
          });

          this.emit('connected');
          logger.info('[AI] Connected to AI Bridge');
          resolve();
        });

        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            this._handleMessage(message);
          } catch (error) {
            logger.error('[AI] Failed to parse message', { error: error.message });
          }
        });

        this.ws.on('close', () => {
          this.connected = false;
          this.emit('disconnected');
          logger.warn('[AI] Disconnected from AI Bridge');

          if (!this.reconnecting) {
            this._reconnect();
          }
        });

        this.ws.on('error', (error) => {
          logger.error('[AI] WebSocket error', { error: error.message });
          this.emit('error', error);

          if (!this.connected) {
            reject(error);
          }
        });
      } catch (error) {
        logger.error('[AI] Connection failed', { error: error.message });
        reject(error);
      }
    });
  }

  /**
   * Reconnect to AI Bridge
   * @private
   */
  _reconnect() {
    if (this.reconnecting) return;

    this.reconnecting = true;
    logger.info('[AI] Reconnecting in', { delay: this.options.reconnectDelay });

    setTimeout(() => {
      this.connect().catch((error) => {
        logger.error('[AI] Reconnection failed', { error: error.message });
        this._reconnect();
      });
    }, this.options.reconnectDelay);
  }

  /**
   * Send message to AI Bridge
   * @private
   */
  _send(message) {
    if (!this.connected || !this.ws) {
      throw new Error('[AI] Not connected to bridge');
    }

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Handle incoming message from AI Bridge
   * @private
   */
  _handleMessage(message) {
    const { type, data, requestId } = message;

    // Handle response to a request
    if (requestId && this.requestMap.has(requestId)) {
      const { resolve, reject, timeout, startTime } = this.requestMap.get(requestId);

      clearTimeout(timeout);
      this.requestMap.delete(requestId);

      // Update response time stats
      const responseTime = Date.now() - startTime;
      this.stats.avgResponseTime =
        (this.stats.avgResponseTime * 0.9) + (responseTime * 0.1);

      if (type === 'error') {
        this.stats.errors++;
        reject(new Error(data.message || 'AI request failed'));
      } else {
        resolve(data);
      }

      return;
    }

    // Handle broadcast messages
    switch (type) {
      case 'agent-update':
        this.emit('agent-update', data);
        break;

      case 'diagnostics':
        this.emit('diagnostics', data);
        break;

      default:
        logger.debug('[AI] Unhandled message type', { type });
    }
  }

  /**
   * Make request to AI Bridge
   * @private
   */
  async _request(type, data) {
    if (!this.connected) {
      throw new Error('[AI] Not connected to bridge');
    }

    const requestId = `${this.options.clientId}-${++this.requestCounter}`;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.requestMap.delete(requestId);
        this.stats.errors++;
        reject(new Error('[AI] Request timeout'));
      }, this.options.requestTimeout);

      this.requestMap.set(requestId, { resolve, reject, timeout, startTime });

      this._send({
        type,
        data,
        requestId,
        metadata: {
          clientId: this.options.clientId,
          timestamp: Date.now()
        }
      });
    });
  }

  /**
   * Get code completions
   * @param {Object} context - Code context
   * @returns {Promise<Array>} Completion suggestions
   */
  async getCompletions(context) {
    if (!this.options.enableCompletions) {
      return [];
    }

    try {
      this.stats.completionsRequested++;

      // Check cache
      const cacheKey = this._getCacheKey(context);
      const cached = this._getFromCache(cacheKey);

      if (cached) {
        logger.debug('[AI] Using cached completions');
        return cached;
      }

      // Request from AI
      const result = await this._request('code-completion', {
        context: context.code,
        language: context.language,
        position: context.position,
        preferences: {
          provider: this.options.preferredProvider,
          maxSuggestions: 10
        }
      });

      const suggestions = result.suggestions || [];
      this.stats.completionsReceived++;

      // Cache results
      this._addToCache(cacheKey, suggestions);

      logger.debug('[AI] Received completions', { count: suggestions.length });
      return suggestions;
    } catch (error) {
      logger.error('[AI] Completion request failed', { error: error.message });
      this.stats.errors++;
      return [];
    }
  }

  /**
   * Get diagnostic suggestions (error fixes)
   * @param {Object} diagnostic - Error diagnostic
   * @returns {Promise<Object>} Fix suggestion
   */
  async suggestFix(diagnostic) {
    if (!this.options.enableDiagnostics) {
      return null;
    }

    try {
      this.stats.diagnosticsRequested++;

      const result = await this._request('suggest-fix', {
        diagnostic: {
          message: diagnostic.message,
          severity: diagnostic.severity,
          code: diagnostic.code,
          range: diagnostic.range
        },
        context: diagnostic.source,
        language: diagnostic.language
      });

      this.stats.diagnosticsReceived++;

      logger.debug('[AI] Received fix suggestion', { description: result.description });
      return result;
    } catch (error) {
      logger.error('[AI] Fix suggestion failed', { error: error.message });
      this.stats.errors++;
      return null;
    }
  }

  /**
   * Get refactoring suggestions
   * @param {Object} params - Refactoring parameters
   * @returns {Promise<Array>} Refactoring suggestions
   */
  async getRefactorings(params) {
    if (!this.options.enableRefactoring) {
      return [];
    }

    try {
      this.stats.refactoringsRequested++;

      const result = await this._request('refactor', {
        code: params.code,
        language: params.language,
        range: params.range,
        type: params.type || 'auto' // extract-function, extract-variable, rename, etc.
      });

      const suggestions = result.suggestions || [];
      this.stats.refactoringsReceived++;

      logger.debug('[AI] Received refactoring suggestions', { count: suggestions.length });
      return suggestions;
    } catch (error) {
      logger.error('[AI] Refactoring request failed', { error: error.message });
      this.stats.errors++;
      return [];
    }
  }

  /**
   * Generate documentation
   * @param {Object} params - Documentation parameters
   * @returns {Promise<string>} Generated documentation
   */
  async generateDocs(params) {
    if (!this.options.enableDocGeneration) {
      return '';
    }

    try {
      this.stats.docsGenerated++;

      const result = await this._request('generate-docs', {
        code: params.code,
        language: params.language,
        style: params.style || 'jsdoc', // jsdoc, sphinx, rustdoc, etc.
        includeExamples: params.includeExamples ?? true
      });

      logger.debug('[AI] Generated documentation', { length: result.documentation.length });
      return result.documentation;
    } catch (error) {
      logger.error('[AI] Documentation generation failed', { error: error.message });
      this.stats.errors++;
      return '';
    }
  }

  /**
   * Analyze code for issues
   * @param {Object} params - Analysis parameters
   * @returns {Promise<Array>} Issues found
   */
  async analyzeCode(params) {
    try {
      const result = await this._request('analyze-code', {
        code: params.code,
        language: params.language,
        checks: params.checks || ['security', 'performance', 'best-practices']
      });

      const issues = result.issues || [];
      logger.debug('[AI] Code analysis complete', { issues: issues.length });

      return issues;
    } catch (error) {
      logger.error('[AI] Code analysis failed', { error: error.message });
      this.stats.errors++;
      return [];
    }
  }

  /**
   * Generate cache key
   * @private
   */
  _getCacheKey(context) {
    const crypto = require('crypto');
    const content = JSON.stringify(context);
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Get from cache
   * @private
   */
  _getFromCache(key) {
    const entry = this.completionCache.get(key);

    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > this.cacheTTL) {
      this.completionCache.delete(key);
      return null;
    }

    return entry.suggestions;
  }

  /**
   * Add to cache
   * @private
   */
  _addToCache(key, suggestions) {
    this.completionCache.set(key, {
      suggestions,
      timestamp: Date.now()
    });

    // Limit cache size
    if (this.completionCache.size > 100) {
      const firstKey = this.completionCache.keys().next().value;
      this.completionCache.delete(firstKey);
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.completionCache.clear();
    logger.info('[AI] Cache cleared');
  }

  /**
   * Get statistics
   * @returns {Object} Stats
   */
  getStats() {
    return {
      ...this.stats,
      connected: this.connected,
      cacheSize: this.completionCache.size,
      pendingRequests: this.requestMap.size
    };
  }

  /**
   * Disconnect from AI Bridge
   */
  disconnect() {
    if (this.ws) {
      this.reconnecting = false;
      this.ws.close();
      this.ws = null;
      this.connected = false;

      // Reject all pending requests
      for (const [requestId, { reject, timeout }] of this.requestMap) {
        clearTimeout(timeout);
        reject(new Error('[AI] Disconnected'));
      }
      this.requestMap.clear();

      logger.info('[AI] Disconnected from AI Bridge');
    }
  }
}

export default AIIntegration;
