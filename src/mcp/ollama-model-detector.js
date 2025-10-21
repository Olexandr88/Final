/**
 * Ollama Model Auto-Detection
 * Discovers available Ollama models and their capabilities
 */

import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';

export class OllamaModelDetector {
  constructor(config) {
    this.config = config;
    this.cachedModels = null;
    this.lastDetection = null;
    this.cacheTTL = config.cache?.ttl || 300000; // 5 minutes default
  }

  /**
   * Initialize detector - run initial model detection
   */
  async initialize() {
    try {
      await this.detectModels();
      logger.info('Ollama Model Detector initialized', {
        modelsFound: this.cachedModels?.length || 0,
      });
    } catch (error) {
      logger.warn('Initial model detection failed', { error: error.message });
    }
  }

  /**
   * Detect all available Ollama models
   * @param {boolean} force - Force refresh cache
   * @returns {Promise<Array>} List of models with capabilities
   */
  async detectModels(force = false) {
    // Check cache
    if (!force && this.cachedModels && this._isCacheValid()) {
      logger.debug('Returning cached models', { count: this.cachedModels.length });
      return this.cachedModels;
    }

    try {
      const response = await fetch(`${this.config.ollama.endpoint}/api/tags`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000,
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const models = data.models || [];

      // Enhance models with capability detection
      const enhancedModels = await Promise.all(
        models.map((model) => this._enhanceModelInfo(model))
      );

      // Update cache
      this.cachedModels = enhancedModels;
      this.lastDetection = Date.now();

      logger.info('Models detected', {
        count: enhancedModels.length,
        models: enhancedModels.map((m) => m.name),
      });

      return enhancedModels;
    } catch (error) {
      logger.error('Model detection failed', { error: error.message });

      // Return cached models if available
      if (this.cachedModels) {
        logger.warn('Returning stale cached models');
        return this.cachedModels;
      }

      throw error;
    }
  }

  /**
   * Get detailed info about a specific model
   * @param {string} modelName - Model name
   * @returns {Promise<Object>} Model details
   */
  async getModelInfo(modelName) {
    try {
      const response = await fetch(`${this.config.ollama.endpoint}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName }),
        timeout: 5000,
      });

      if (!response.ok) {
        throw new Error(`Failed to get model info: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      logger.error('Get model info failed', { model: modelName, error: error.message });
      return null;
    }
  }

  /**
   * Enhance model with capability detection
   * @private
   */
  async _enhanceModelInfo(model) {
    const enhanced = { ...model };

    // Detect capabilities based on model name and family
    enhanced.capabilities = this._detectCapabilities(model);

    // Try to get detailed info (non-blocking)
    try {
      const details = await this.getModelInfo(model.name);
      if (details) {
        enhanced.details = {
          family: details.details?.family,
          format: details.details?.format,
          parameter_size: details.details?.parameter_size,
          quantization_level: details.details?.quantization_level,
          template: details.template,
        };
      }
    } catch (error) {
      // Non-critical - continue without details
      logger.debug('Could not fetch model details', { model: model.name });
    }

    return enhanced;
  }

  /**
   * Detect model capabilities from name/metadata
   * @private
   */
  _detectCapabilities(model) {
    const capabilities = {
      chat: true, // All models support chat
      completion: true, // All models support completion
      embedding: false,
      vision: false,
      code: false,
      instruct: false,
    };

    const name = model.name.toLowerCase();

    // Code-specialized models
    if (name.includes('code') || name.includes('codellama') || name.includes('starcoder')) {
      capabilities.code = true;
      capabilities.instruct = true;
    }

    // Instruction-tuned models
    if (name.includes('instruct') || name.includes('chat')) {
      capabilities.instruct = true;
    }

    // Embedding models
    if (name.includes('embed') || name.includes('nomic')) {
      capabilities.embedding = true;
      capabilities.chat = false;
      capabilities.completion = false;
    }

    // Vision models
    if (name.includes('vision') || name.includes('llava')) {
      capabilities.vision = true;
    }

    return capabilities;
  }

  /**
   * Check if cache is still valid
   * @private
   */
  _isCacheValid() {
    if (!this.lastDetection) return false;
    return Date.now() - this.lastDetection < this.cacheTTL;
  }

  /**
   * Clear model cache
   */
  clearCache() {
    this.cachedModels = null;
    this.lastDetection = null;
    logger.debug('Model cache cleared');
  }
}

export default OllamaModelDetector;
