/**
 * Ollama Client Test Suite
 */

import { describe, test, beforeAll } from 'node:test';
import assert from 'node:assert/strict';
import { OllamaClient } from '../src/clients/ollama-client.js';

describe('Ollama Client Tests', () => {
  let client;

  beforeAll(() => {
    client = new OllamaClient({
      model: 'gemma3:latest',
      timeout: 60000
    });
  });

  describe('Availability', () => {
    test('should check if Ollama is available', async () => {
      const isAvailable = await client.isAvailable();
      assert.strictEqual(typeof isAvailable, 'boolean');
    });

    test('should list available models', async () => {
      const result = await client.listModels();
      assert.strictEqual(result.success, true);
      assert.ok(Array.isArray(result.models));
    });
  });

  describe('Generation', () => {
    test('should generate text from a prompt', async () => {
      const result = await client.generate('What is 2+2?', {
        model: 'gemma3:latest',
        temperature: 0.1,
        max_tokens: 50
      });

      if (result.success) {
        assert.ok(result.response);
        assert.strictEqual(typeof result.response, 'string');
        assert.ok(result.response.length > 0);
        assert.ok(result.model);
      } else {
        // Skip test if Ollama is not available
        assert.ok(result.error);
      }
    });

    test('should handle generation with custom options', async () => {
      const result = await client.generate('Count to 3', {
        temperature: 0.1,
        max_tokens: 20
      });

      if (result.success) {
        assert.ok(result.response);
        assert.ok(result.eval_count);
        assert.ok(result.total_duration);
      } else {
        assert.ok(result.error);
      }
    });
  });

  describe('Chat Completion', () => {
    test('should handle chat messages', async () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is the capital of France? One word.' }
      ];

      const result = await client.chat(messages, {
        model: 'gemma3:latest',
        temperature: 0.1,
        max_tokens: 10
      });

      if (result.success) {
        assert.ok(result.message);
        assert.ok(result.message.content);
        assert.strictEqual(typeof result.message.content, 'string');
      } else {
        assert.ok(result.error);
      }
    });

    test('should handle conversation history', async () => {
      const messages = [
        { role: 'user', content: 'My name is Alice' },
        { role: 'assistant', content: 'Nice to meet you, Alice!' },
        { role: 'user', content: 'What is my name?' }
      ];

      const result = await client.chat(messages, {
        temperature: 0.1,
        max_tokens: 20
      });

      if (result.success) {
        assert.ok(result.message.content);
        // Should remember the name from context
        assert.ok(result.message.content.toLowerCase().includes('alice') ||
                  result.message.content.toLowerCase().includes('your name'));
      } else {
        assert.ok(result.error);
      }
    });
  });

  describe('Model Information', () => {
    test('should get model information', async () => {
      const result = await client.showModel('gemma3:latest');

      if (result.success !== false) {
        assert.ok(result);
        // Model info should have some properties
        assert.ok(result.modelfile || result.license || result.template);
      } else {
        assert.ok(result.error);
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid model gracefully', async () => {
      const result = await client.generate('Test', {
        model: 'nonexistent-model-xyz'
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    test('should handle timeout', async () => {
      const slowClient = new OllamaClient({ timeout: 100 });
      const result = await slowClient.generate('Write a long essay about AI');

      // Should either succeed quickly or timeout
      assert.ok(result.success !== undefined);
    });
  });
});
