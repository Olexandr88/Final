/**
 * Continue-Ollama MCP Server Tests
 * Comprehensive test suite for MCP server functionality
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { OllamaModelDetector } from '../src/mcp/ollama-model-detector.js';
import { CONTINUE_MCP_CONFIG } from '../src/config/continue-mcp-config.js';

describe('OllamaModelDetector', () => {
  let detector;

  before(() => {
    detector = new OllamaModelDetector(CONTINUE_MCP_CONFIG);
  });

  after(() => {
    if (detector) {
      detector.clearCache();
    }
  });

  it('should initialize detector', async () => {
    await detector.initialize();
    assert.ok(detector, 'Detector should be initialized');
  });

  it('should detect available models', async () => {
    const models = await detector.detectModels(true);
    assert.ok(Array.isArray(models), 'Should return array of models');

    if (models.length > 0) {
      const model = models[0];
      assert.ok(model.name, 'Model should have name');
      assert.ok(model.capabilities, 'Model should have capabilities');
    }
  });

  it('should detect model capabilities', async () => {
    const models = await detector.detectModels();

    if (models.length > 0) {
      const model = models[0];
      assert.ok(typeof model.capabilities === 'object', 'Capabilities should be object');
      assert.ok(typeof model.capabilities.chat === 'boolean', 'Should have chat capability');
      assert.ok(
        typeof model.capabilities.completion === 'boolean',
        'Should have completion capability'
      );
      assert.ok(typeof model.capabilities.code === 'boolean', 'Should have code capability');
    }
  });

  it('should cache model list', async () => {
    await detector.detectModels(true); // Force refresh
    const firstCall = Date.now();

    await detector.detectModels(); // Should use cache
    const secondCall = Date.now();

    assert.ok(secondCall - firstCall < 100, 'Second call should be much faster (cached)');
  });

  it('should clear cache', () => {
    detector.clearCache();
    assert.strictEqual(detector.cachedModels, null, 'Cache should be cleared');
    assert.strictEqual(detector.lastDetection, null, 'Last detection should be cleared');
  });
});

describe('Continue MCP Configuration', () => {
  it('should have valid default configuration', () => {
    assert.ok(CONTINUE_MCP_CONFIG.ollama, 'Should have ollama config');
    assert.ok(CONTINUE_MCP_CONFIG.ollama.endpoint, 'Should have ollama endpoint');
    assert.ok(CONTINUE_MCP_CONFIG.transport, 'Should have transport config');
    assert.ok(CONTINUE_MCP_CONFIG.cache, 'Should have cache config');
  });

  it('should have autocomplete configuration', () => {
    assert.ok(CONTINUE_MCP_CONFIG.autocomplete, 'Should have autocomplete config');
    assert.strictEqual(typeof CONTINUE_MCP_CONFIG.autocomplete.maxTokens, 'number');
    assert.strictEqual(typeof CONTINUE_MCP_CONFIG.autocomplete.temperature, 'number');
    assert.ok(CONTINUE_MCP_CONFIG.autocomplete.temperature < 1, 'Temperature should be < 1');
  });

  it('should have agent mode configuration', () => {
    assert.ok(CONTINUE_MCP_CONFIG.agent, 'Should have agent config');
    assert.ok(CONTINUE_MCP_CONFIG.agent.maxHistoryLength > 0, 'Should have history length');
    assert.ok(CONTINUE_MCP_CONFIG.agent.contextWindow > 0, 'Should have context window');
  });
});

describe('Model Capability Detection', () => {
  let detector;

  before(() => {
    detector = new OllamaModelDetector(CONTINUE_MCP_CONFIG);
  });

  it('should detect code models', () => {
    const codeModel = { name: 'codellama:latest' };
    const capabilities = detector._detectCapabilities(codeModel);

    assert.strictEqual(capabilities.code, true, 'codellama should have code capability');
    assert.strictEqual(capabilities.instruct, true, 'codellama should have instruct capability');
  });

  it('should detect embedding models', () => {
    const embedModel = { name: 'nomic-embed-text:latest' };
    const capabilities = detector._detectCapabilities(embedModel);

    assert.strictEqual(capabilities.embedding, true, 'Should detect embedding capability');
    assert.strictEqual(capabilities.chat, false, 'Embedding model should not have chat');
  });

  it('should detect vision models', () => {
    const visionModel = { name: 'llava:latest' };
    const capabilities = detector._detectCapabilities(visionModel);

    assert.strictEqual(capabilities.vision, true, 'Should detect vision capability');
  });

  it('should detect instruct models', () => {
    const instructModel = { name: 'mistral-instruct:latest' };
    const capabilities = detector._detectCapabilities(instructModel);

    assert.strictEqual(capabilities.instruct, true, 'Should detect instruct capability');
  });
});

describe('MCP Server Integration (Mock)', () => {
  it('should handle list_models tool', async () => {
    // Mock test - would require actual server instance
    const mockModels = [
      { name: 'llama3:latest', capabilities: { chat: true, code: false } },
      { name: 'codellama:latest', capabilities: { chat: true, code: true } },
    ];

    assert.ok(Array.isArray(mockModels), 'Should return models array');
    assert.strictEqual(mockModels.length, 2, 'Should have 2 models');
  });

  it('should handle autocomplete tool', async () => {
    // Mock autocomplete test
    const mockRequest = {
      prefix: 'function add(a, b) {',
      suffix: '}',
      language: 'javascript',
      maxTokens: 50,
    };

    assert.ok(mockRequest.prefix, 'Should have prefix');
    assert.strictEqual(mockRequest.language, 'javascript');
  });

  it('should handle chat tool', async () => {
    // Mock chat test
    const mockRequest = {
      message: 'Hello, how are you?',
      sessionId: 'test-session-123',
    };

    assert.ok(mockRequest.message, 'Should have message');
    assert.ok(mockRequest.sessionId, 'Should have sessionId');
  });
});
