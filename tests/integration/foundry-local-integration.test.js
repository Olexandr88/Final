/**
 * Foundry Local Integration Tests
 * Real integration tests with Foundry Local service
 * Tests skip automatically if service is not running
 * @module foundry-local-integration.test
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FoundryLocalClient } from '../../src/clients/foundry-local-client.js';

/**
 * Check if Foundry Local service is available
 * @returns {Object} Test configuration with skip flag
 */
const skipIfServiceUnavailable = () => {
  const client = new FoundryLocalClient();
  const isRunning = client.isServiceRunning();

  if (!isRunning) {
    console.warn(
      '⚠️  Foundry Local service not running - skipping integration tests'
    );
    console.warn(
      '   To run these tests, start Foundry Local service first.'
    );
  }

  return { skip: !isRunning };
};

describe('Foundry Local Integration Tests', skipIfServiceUnavailable(), () => {
  let client;

  before(async () => {
    client = new FoundryLocalClient({
      defaultModel: 'phi-3.5-mini',
      modelTTL: 600000,
    });
  });

  after(async () => {
    if (client) {
      await client.cleanup();
    }
  });

  it('should initialize with real service', async () => {
    const result = await client.initialize('phi-3.5-mini');

    assert.strictEqual(result.success, true);
    assert.ok(result.modelInfo);
    assert.ok(result.endpoint);
    assert.strictEqual(client.initialized, true);

    console.log('✓ Initialized model:', result.modelInfo);
  });

  it('should send streaming chat request', async () => {
    const result = await client.chat(
      [{ role: 'user', content: 'Count from 1 to 3' }],
      {
        stream: true,
        max_tokens: 50,
      }
    );

    assert.strictEqual(result.success, true);
    assert.ok(result.stream);
    assert.strictEqual(result.streaming, true);

    let fullResponse = '';
    let chunkCount = 0;

    for await (const chunk of result.stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullResponse += content;
        chunkCount++;
      }
    }

    assert.ok(fullResponse.length > 0);
    assert.ok(chunkCount > 0);

    console.log('✓ Received response in', chunkCount, 'chunks');
    console.log('✓ Response:', fullResponse.substring(0, 100));
  });

  it('should send non-streaming chat request', async () => {
    const result = await client.chat(
      [{ role: 'user', content: 'Say hello' }],
      {
        stream: false,
        max_tokens: 20,
      }
    );

    assert.strictEqual(result.success, true);
    assert.ok(result.response);
    assert.strictEqual(result.streaming, false);

    const content = result.response.choices[0]?.message?.content;
    assert.ok(content);
    assert.ok(content.length > 0);

    console.log('✓ Response:', content);
  });

  it('should handle conversation history', async () => {
    const messages = [
      { role: 'user', content: 'My name is Alice' },
      { role: 'assistant', content: 'Hello Alice! Nice to meet you.' },
      { role: 'user', content: 'What is my name?' },
    ];

    const result = await client.chat(messages, {
      stream: false,
      max_tokens: 30,
    });

    assert.strictEqual(result.success, true);

    const content = result.response.choices[0]?.message?.content;
    assert.ok(content);

    // Response should reference the name "Alice"
    console.log('✓ Conversation response:', content);
  });

  it('should list cached models', async () => {
    const models = await client.listCachedModels();

    assert.ok(Array.isArray(models));
    console.log('✓ Found', models.length, 'cached models');

    if (models.length > 0) {
      console.log('  Models:', models.map((m) => m.id || m.name).join(', '));
    }
  });

  it('should get model info', async () => {
    const info = await client.getModelInfo('phi-3.5-mini');

    assert.ok(info);
    console.log('✓ Model info:', info);
  });

  it('should handle concurrent requests', async () => {
    const promises = [
      client.chat([{ role: 'user', content: 'Say 1' }], { stream: false, max_tokens: 10 }),
      client.chat([{ role: 'user', content: 'Say 2' }], { stream: false, max_tokens: 10 }),
    ];

    const results = await Promise.all(promises);

    assert.strictEqual(results.length, 2);
    results.forEach((result) => {
      assert.strictEqual(result.success, true);
      assert.ok(result.response.choices[0]?.message?.content);
    });

    console.log('✓ Concurrent requests completed successfully');
  });
});
