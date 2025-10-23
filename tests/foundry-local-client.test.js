/**
 * Foundry Local Client Tests
 * Unit tests for FoundryLocalClient with mocking
 * @module foundry-local-client.test
 */

import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { FoundryLocalClient } from '../src/clients/foundry-local-client.js';

// Mock FoundryLocalManager
const mockManager = {
  isServiceRunning: () => true,
  init: async (model) => ({
    id: `${model}-optimized`,
    name: model,
    size: '2.5GB',
    hardware: 'npu',
  }),
  listCachedModels: async () => [
    { id: 'phi-3.5-mini-npu', name: 'phi-3.5-mini', hardware: 'npu' },
    { id: 'phi-3.5-mini-gpu', name: 'phi-3.5-mini', hardware: 'gpu' },
  ],
  getModelInfo: async (model) => ({
    id: `${model}-optimized`,
    name: model,
    size: '2.5GB',
    hardware: 'npu',
  }),
  cleanup: async () => {},
  endpoint: 'http://localhost:5272',
  apiKey: 'local',
};

// Mock OpenAI client
const mockOpenAI = {
  chat: {
    completions: {
      create: async (params) => {
        if (params.stream) {
          // Mock streaming response
          return (async function* () {
            yield {
              choices: [{ delta: { content: 'Hello' } }],
            };
            yield {
              choices: [{ delta: { content: ' World' } }],
            };
          })();
        } else {
          // Mock non-streaming response
          return {
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'Hello World',
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
            },
          };
        }
      },
    },
  },
};

describe('FoundryLocalClient', () => {
  let client;

  before(() => {
    // Mock the foundry-local-sdk module
    mock.module('foundry-local-sdk', {
      namedExports: {
        FoundryLocalManager: function () {
          return mockManager;
        },
      },
    });

    // Mock OpenAI module
    mock.module('openai', {
      defaultExport: function () {
        return mockOpenAI;
      },
    });

    client = new FoundryLocalClient();
  });

  after(async () => {
    if (client) {
      await client.cleanup();
    }
  });

  it('should initialize with default model', async () => {
    const result = await client.initialize();

    assert.strictEqual(result.success, true);
    assert.ok(result.modelInfo);
    assert.strictEqual(result.modelInfo.hardware, 'npu');
    assert.strictEqual(client.initialized, true);
  });

  it('should initialize with custom model', async () => {
    const result = await client.initialize('phi-3.5-mini');

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.modelAlias, 'phi-3.5-mini');
  });

  it('should cache model info after initialization', async () => {
    await client.initialize('phi-3.5-mini');
    const cacheSize = client.modelCache.size;

    // Initialize again with same model
    await client.initialize('phi-3.5-mini');

    // Cache size should not increase
    assert.strictEqual(client.modelCache.size, cacheSize);
  });

  it('should list cached models', async () => {
    const models = await client.listCachedModels();

    assert.ok(Array.isArray(models));
    assert.strictEqual(models.length, 2);
    assert.strictEqual(models[0].name, 'phi-3.5-mini');
  });

  it('should get model info', async () => {
    const info = await client.getModelInfo('phi-3.5-mini');

    assert.ok(info);
    assert.strictEqual(info.name, 'phi-3.5-mini');
    assert.strictEqual(info.hardware, 'npu');
  });

  it('should check if service is running', () => {
    const isRunning = client.isServiceRunning();
    assert.strictEqual(isRunning, true);
  });

  it('should handle streaming chat', async () => {
    await client.initialize();

    const result = await client.chat(
      [{ role: 'user', content: 'Hello' }],
      { stream: true }
    );

    assert.strictEqual(result.success, true);
    assert.ok(result.stream);
    assert.strictEqual(result.streaming, true);

    // Consume stream
    let fullResponse = '';
    for await (const chunk of result.stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullResponse += content;
      }
    }

    assert.strictEqual(fullResponse, 'Hello World');
  });

  it('should handle non-streaming chat', async () => {
    await client.initialize();

    const result = await client.chat(
      [{ role: 'user', content: 'Hello' }],
      { stream: false }
    );

    assert.strictEqual(result.success, true);
    assert.ok(result.response);
    assert.strictEqual(result.streaming, false);
    assert.strictEqual(result.response.choices[0].message.content, 'Hello World');
    assert.strictEqual(result.response.usage.total_tokens, 15);
  });

  it('should auto-initialize on first chat', async () => {
    const freshClient = new FoundryLocalClient();

    // Mock the modules again for fresh client
    freshClient.manager = mockManager;

    const result = await freshClient.chat([{ role: 'user', content: 'Test' }], {
      stream: false,
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(freshClient.initialized, true);
  });

  it('should cleanup properly', async () => {
    await client.cleanup();

    assert.strictEqual(client.initialized, false);
    assert.strictEqual(client.modelCache.size, 0);
  });
});
