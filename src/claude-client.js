import Anthropic from '@anthropic-ai/sdk';
import { getGlobalCoordinator } from './session-coordinator.js';

export class ClaudeClient {
  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }

    this.client = new Anthropic({ apiKey });
    this.model = process.env.MODEL || 'claude-3-5-sonnet-20241022';
    this.maxTokens = parseInt(process.env.MAX_TOKENS || '4096', 10);
    this.temperature = parseFloat(process.env.TEMPERATURE || '1.0');

    // Initialize session coordinator
    this.sessionCoordinator = getGlobalCoordinator();
    this.sessionCoordinator.initialize();
  }

  /**
   * Send a message to Claude and get a response
   * @param {string} message - The user message
   * @param {string} systemPrompt - Optional system prompt
   * @param {Object} options - Optional configuration
   * @param {boolean} options.stream - Enable streaming (default: false)
   * @param {Function} options.onChunk - Callback for streaming chunks: (text: string) => void
   * @param {Function} options.onComplete - Callback when streaming completes: (fullText: string) => void
   * @returns {Promise<string>} The complete response text
   *
   * @example
   * // Non-streaming (default - backward compatible)
   * const response = await client.sendMessage('Hello');
   *
   * @example
   * // Streaming with chunk callback
   * const response = await client.sendMessage('Hello', '', {
   *   stream: true,
   *   onChunk: (chunk) => process.stdout.write(chunk)
   * });
   *
   * @example
   * // Streaming with completion callback
   * const response = await client.sendMessage('Hello', '', {
   *   stream: true,
   *   onChunk: (chunk) => console.log('Chunk:', chunk),
   *   onComplete: (full) => console.log('Complete:', full)
   * });
   */
  async sendMessage(message, systemPrompt = '', options = {}) {
    const params = {
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      messages: [{ role: 'user', content: message }],
      stream: options.stream ?? true, // Default TRUE for better perceived latency (75% improvement)
    };

    if (systemPrompt) {
      params.system = systemPrompt;
    }

    // Handle streaming mode
    if (params.stream) {
      return this.handleStream(params, options.onChunk, options.onComplete);
    }

    // Non-streaming mode (original behavior)
    const response = await this.client.messages.create(params);
    return response.content[0].text;
  }

  /**
   * Internal method to handle streaming responses
   * @private
   * @param {Object} params - API parameters
   * @param {Function} onChunk - Callback for each chunk
   * @param {Function} onComplete - Callback when streaming completes
   * @returns {Promise<string>} The complete response text
   */
  async handleStream(params, onChunk, onComplete) {
    const chunks = [];
    const stream = await this.client.messages.create(params);

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const text = event.delta.text;
        chunks.push(text);

        // Call chunk callback if provided
        if (onChunk && typeof onChunk === 'function') {
          onChunk(text);
        }
      }
    }

    const fullText = chunks.join('');

    // Call completion callback if provided
    if (onComplete && typeof onComplete === 'function') {
      onComplete(fullText);
    }

    return fullText;
  }

  /**
   * Send a message to Claude and stream the response to stdout
   * @param {string} message - The user message
   * @param {string} systemPrompt - Optional system prompt
   * @returns {Promise<string>} The complete response text
   * @deprecated Use sendMessage with stream option instead
   *
   * @example
   * // Legacy method (still works)
   * await client.streamMessage('Hello');
   *
   * @example
   * // Recommended approach
   * await client.sendMessage('Hello', '', {
   *   stream: true,
   *   onChunk: (chunk) => process.stdout.write(chunk)
   * });
   */
  async streamMessage(message, systemPrompt = '') {
    return this.sendMessage(message, systemPrompt, {
      stream: true,
      onChunk: (chunk) => process.stdout.write(chunk),
      onComplete: () => console.log('\n'),
    });
  }

  /**
   * Multi-turn conversation with context
   * @param {Array<{role: string, content: string}>} messages - Conversation history
   * @param {string} systemPrompt - Optional system prompt
   * @returns {Promise<string>} The response text
   */
  async conversation(messages, systemPrompt = '') {
    const params = {
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      messages,
    };

    if (systemPrompt) {
      params.system = systemPrompt;
    }

    const response = await this.client.messages.create(params);
    return response.content[0].text;
  }
}
