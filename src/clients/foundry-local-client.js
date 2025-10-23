/**
 * Microsoft Foundry Local Client
 * OpenAI-compatible interface for Foundry Local (NPU/GPU-accelerated local AI)
 * @module foundry-local-client
 */

import { FoundryLocalManager } from 'foundry-local-sdk';
import OpenAI from 'openai';
import { logger } from '../utils/logger.js';
import { LLM } from '../config/constants.js';

const {
  DEFAULT_MODEL,
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_TOKENS,
  MODEL_TTL_MS,
  AUTO_START,
  HARDWARE_PREFERENCE,
  REQUEST_TIMEOUT_MS,
} = LLM.FOUNDRY_LOCAL;

/**
 * Foundry Local Client - wraps foundry-local-sdk with OpenAI-compatible API
 * Provides NPU/GPU-accelerated local inference with automatic hardware selection
 */
export class FoundryLocalClient {
  constructor(config = {}) {
    this.manager = null;
    this.openaiClient = null;
    this.currentModel = null;
    this.modelInfo = null;
    this.defaultModel = config.defaultModel || DEFAULT_MODEL;
    this.modelTTL = config.modelTTL || MODEL_TTL_MS;
    this.autoStart = config.autoStart !== undefined ? config.autoStart : AUTO_START;
    this.hardwarePreference = config.hardwarePreference || HARDWARE_PREFERENCE;
    this.timeout = config.timeout || REQUEST_TIMEOUT_MS;
    this.initialized = false;
    this.modelCache = new Map(); // Cache model info to avoid repeated init calls
    this.lastInitTime = null;
  }

  /**
   * Initialize Foundry Local with a specific model
   * @param {string} modelAlias - Model name (e.g., 'phi-3.5-mini')
   * @returns {Promise<Object>} Initialization result with modelInfo and endpoint
   */
  async initialize(modelAlias = this.defaultModel) {
    try {
      // Initialize manager if not already done
      if (!this.manager) {
        this.manager = new FoundryLocalManager();
        logger.info('FoundryLocalManager created', {
          defaultModel: this.defaultModel,
          modelTTL: this.modelTTL,
          hardwarePreference: this.hardwarePreference,
        });
      }

      // Check if service is running
      const serviceRunning = this.manager.isServiceRunning();
      if (!serviceRunning) {
        const errorMsg = 'Foundry Local service is not running. Please start the service first.';
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      // Check cache first (avoid re-initialization if model info is fresh)
      const now = Date.now();
      if (
        this.modelCache.has(modelAlias) &&
        this.lastInitTime &&
        now - this.lastInitTime < this.modelTTL
      ) {
        this.modelInfo = this.modelCache.get(modelAlias);
        logger.debug('Using cached model info', {
          model: modelAlias,
          cacheAge: now - this.lastInitTime,
        });
      } else {
        // Initialize model (downloads and loads into NPU/GPU/CPU)
        logger.info('Initializing Foundry Local model', { model: modelAlias });
        this.modelInfo = await this.manager.init(modelAlias, {
          hardware: this.hardwarePreference,
        });
        this.modelCache.set(modelAlias, this.modelInfo);
        this.lastInitTime = now;
        logger.info('Model initialized', {
          id: this.modelInfo.id,
          hardware: this.modelInfo.hardware || 'unknown',
          size: this.modelInfo.size || 'unknown',
        });
      }

      // Create OpenAI client pointing to Foundry Local endpoint
      this.openaiClient = new OpenAI({
        baseURL: this.manager.endpoint,
        apiKey: this.manager.apiKey || 'not-needed',
      });

      this.currentModel = modelAlias;
      this.initialized = true;

      return {
        success: true,
        modelInfo: this.modelInfo,
        endpoint: this.manager.endpoint,
        modelAlias: modelAlias,
      };
    } catch (error) {
      logger.error('Foundry Local initialization failed', {
        error: error.message,
        model: modelAlias,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send chat completion request (streaming or non-streaming)
   * @param {Array<Object>} messages - Chat messages in OpenAI format
   * @param {Object} options - Chat options (temperature, max_tokens, stream, etc.)
   * @returns {Promise<Object>} Chat completion response or stream
   */
  async chat(messages, options = {}) {
    try {
      // Auto-initialize if not done yet
      if (!this.initialized) {
        const initResult = await this.initialize(options.model || this.defaultModel);
        if (!initResult.success) {
          throw new Error(`Failed to initialize: ${initResult.error}`);
        }
      }

      // Re-initialize if model changed
      const requestedModel = options.model || this.defaultModel;
      if (requestedModel !== this.currentModel) {
        const initResult = await this.initialize(requestedModel);
        if (!initResult.success) {
          throw new Error(`Failed to switch model: ${initResult.error}`);
        }
      }

      const modelId = this.modelInfo.id;
      const stream = options.stream !== undefined ? options.stream : true;

      logger.debug('Sending chat request', {
        model: modelId,
        messageCount: messages.length,
        stream,
        temperature: options.temperature || DEFAULT_TEMPERATURE,
      });

      // Streaming response
      if (stream) {
        const streamResponse = await this.openaiClient.chat.completions.create({
          model: modelId,
          messages,
          stream: true,
          temperature: options.temperature || DEFAULT_TEMPERATURE,
          max_tokens: options.max_tokens || DEFAULT_MAX_TOKENS,
          top_p: options.top_p,
          frequency_penalty: options.frequency_penalty,
          presence_penalty: options.presence_penalty,
        });

        return {
          success: true,
          stream: streamResponse,
          model: modelId,
          modelAlias: requestedModel,
          streaming: true,
        };
      }

      // Non-streaming response
      const response = await this.openaiClient.chat.completions.create({
        model: modelId,
        messages,
        stream: false,
        temperature: options.temperature || DEFAULT_TEMPERATURE,
        max_tokens: options.max_tokens || DEFAULT_MAX_TOKENS,
        top_p: options.top_p,
        frequency_penalty: options.frequency_penalty,
        presence_penalty: options.presence_penalty,
      });

      logger.info('Chat completion received', {
        model: modelId,
        tokensUsed: response.usage?.total_tokens || 0,
        finishReason: response.choices[0]?.finish_reason,
      });

      return {
        success: true,
        response,
        model: modelId,
        modelAlias: requestedModel,
        streaming: false,
      };
    } catch (error) {
      logger.error('Chat request failed', {
        error: error.message,
        model: options.model || this.defaultModel,
      });
      throw error;
    }
  }

  /**
   * List all cached models in Foundry Local
   * @returns {Promise<Array>} List of cached models
   */
  async listCachedModels() {
    try {
      if (!this.manager) {
        this.manager = new FoundryLocalManager();
      }

      const models = await this.manager.listCachedModels();
      logger.debug('Listed cached models', { count: models.length });
      return models;
    } catch (error) {
      logger.error('Failed to list cached models', { error: error.message });
      throw error;
    }
  }

  /**
   * Get information about a specific model
   * @param {string} modelAlias - Model name
   * @returns {Promise<Object>} Model information
   */
  async getModelInfo(modelAlias) {
    try {
      if (!this.manager) {
        this.manager = new FoundryLocalManager();
      }

      const info = await this.manager.getModelInfo(modelAlias);
      return info;
    } catch (error) {
      logger.error('Failed to get model info', {
        error: error.message,
        model: modelAlias,
      });
      throw error;
    }
  }

  /**
   * Check if Foundry Local service is running
   * @returns {boolean} True if service is running
   */
  isServiceRunning() {
    try {
      if (!this.manager) {
        this.manager = new FoundryLocalManager();
      }
      return this.manager.isServiceRunning();
    } catch (error) {
      logger.warn('Failed to check service status', { error: error.message });
      return false;
    }
  }

  /**
   * Cleanup and release resources
   */
  async cleanup() {
    try {
      if (this.manager) {
        await this.manager.cleanup();
      }
      this.initialized = false;
      this.modelCache.clear();
      logger.info('FoundryLocalClient cleanup complete');
    } catch (error) {
      logger.error('Cleanup failed', { error: error.message });
    }
  }
}

export default FoundryLocalClient;
