#!/usr/bin/env node
/**
 * Ollama Client Integration
 * Provides a clean interface to interact with Ollama models
 */

import dotenv from 'dotenv';
dotenv.config();

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'llama3:latest';

export class OllamaClient {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || OLLAMA_BASE_URL;
    this.model = config.model || DEFAULT_MODEL;
    this.timeout = config.timeout || 60000;
  }

  /**
   * Generate a completion from Ollama
   * @param {string} prompt - The prompt to send
   * @param {object} options - Additional options
   * @returns {Promise<object>} The response
   */
  async generate(prompt, options = {}) {
    const model = options.model || this.model;
    const stream = options.stream || false;

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream,
          options: {
            temperature: options.temperature || 0.7,
            top_p: options.top_p || 0.9,
            top_k: options.top_k || 40,
            num_predict: options.max_tokens || 512,
            ...(options.system && { system: options.system }),
          },
        }),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      return {
        success: true,
        response: result.response,
        model: result.model,
        created_at: result.created_at,
        done: result.done,
        context: result.context,
        total_duration: result.total_duration,
        load_duration: result.load_duration,
        prompt_eval_duration: result.prompt_eval_duration,
        eval_duration: result.eval_duration,
        eval_count: result.eval_count,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        model,
      };
    }
  }

  /**
   * Chat completion with conversation history
   * @param {array} messages - Array of {role, content} messages
   * @param {object} options - Additional options
   * @returns {Promise<object>} The response
   */
  async chat(messages, options = {}) {
    const model = options.model || this.model;

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          options: {
            temperature: options.temperature || 0.7,
            top_p: options.top_p || 0.9,
            num_predict: options.max_tokens || 512,
          },
        }),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      return {
        success: true,
        message: result.message,
        model: result.model,
        created_at: result.created_at,
        done: result.done,
        total_duration: result.total_duration,
        eval_count: result.eval_count,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        model,
      };
    }
  }

  /**
   * List available models
   * @returns {Promise<object>} List of models
   */
  async listModels() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const result = await response.json();
      return {
        success: true,
        models: result.models || [],
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        models: [],
      };
    }
  }

  /**
   * Check if Ollama is available
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get model information
   * @param {string} modelName - Model name
   * @returns {Promise<object>}
   */
  async showModel(modelName) {
    try {
      const response = await fetch(`${this.baseUrl}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName || this.model }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Pull a model from Ollama library
   * @param {string} modelName - Model name to pull
   * @returns {Promise<object>}
   */
  async pullModel(modelName) {
    try {
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName }),
        signal: AbortSignal.timeout(300000), // 5 min timeout for downloads
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      return {
        success: true,
        message: `Model ${modelName} pulled successfully`,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

// Create default instance
export const ollama = new OllamaClient();

// Export for testing
export default OllamaClient;
