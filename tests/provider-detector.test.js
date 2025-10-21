/**
 * Tests for MCP Provider Detector
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ProviderDetector, detectProviders } from '../src/mcp/provider-detector.js';

describe('ProviderDetector', () => {
  let detector;

  before(() => {
    detector = new ProviderDetector();
  });

  describe('Tool Definition', () => {
    it('should return valid MCP tool definition', () => {
      const toolDef = ProviderDetector.getToolDefinition();

      assert.strictEqual(toolDef.name, 'detect_providers');
      assert.ok(toolDef.description);
      assert.strictEqual(toolDef.inputSchema.type, 'object');
      assert.ok(toolDef.inputSchema.properties.includeHealth);
      assert.ok(toolDef.inputSchema.properties.includeModels);
    });
  });

  describe('Provider Detection', () => {
    it('should detect all providers without health checks', async () => {
      const results = await detector.detectProviders({
        includeHealth: false,
        includeModels: false
      });

      assert.ok(results.timestamp);
      assert.ok(Array.isArray(results.providers));
      assert.ok(results.summary);
      assert.strictEqual(results.summary.total, 5); // claude, ollama, jules, openai, perplexity
    });

    it('should return provider structure for each provider', async () => {
      const results = await detector.detectProviders();

      for (const provider of results.providers) {
        assert.ok(provider.name);
        assert.ok(provider.displayName);
        assert.strictEqual(typeof provider.available, 'boolean');
        assert.strictEqual(typeof provider.configured, 'boolean');
        assert.strictEqual(typeof provider.healthy, 'boolean');
        assert.ok(Array.isArray(provider.capabilities));
        assert.ok(Array.isArray(provider.models));
      }
    });

    it('should detect Claude configuration correctly', async () => {
      const results = await detector.detectProviders();
      const claude = results.providers.find(p => p.name === 'claude');

      assert.ok(claude);
      assert.strictEqual(claude.displayName, 'Anthropic Claude');
      assert.ok(claude.capabilities.includes('chat'));
      assert.ok(claude.capabilities.includes('code_generation'));
    });

    it('should detect Ollama configuration correctly', async () => {
      const results = await detector.detectProviders();
      const ollama = results.providers.find(p => p.name === 'ollama');

      assert.ok(ollama);
      assert.strictEqual(ollama.displayName, 'Ollama (Local)');
      assert.ok(ollama.endpoint);
      assert.strictEqual(ollama.configured, true); // Always configured (no API key needed)
    });

    it('should handle unconfigured providers gracefully', async () => {
      const results = await detector.detectProviders();

      // Check that unconfigured providers are marked correctly
      const unconfigured = results.providers.filter(p => !p.configured);
      for (const provider of unconfigured) {
        assert.strictEqual(provider.available, false);
        assert.strictEqual(provider.healthy, false);
      }
    });

    it('should provide summary statistics', async () => {
      const results = await detector.detectProviders();

      assert.strictEqual(typeof results.summary.total, 'number');
      assert.strictEqual(typeof results.summary.available, 'number');
      assert.strictEqual(typeof results.summary.configured, 'number');
      assert.strictEqual(typeof results.summary.healthy, 'number');

      assert.ok(results.summary.total >= results.summary.available);
      assert.ok(results.summary.available >= results.summary.healthy);
    });
  });

  describe('Standalone Function', () => {
    it('should work as standalone function', async () => {
      const results = await detectProviders({
        includeHealth: false,
        includeModels: false
      });

      assert.ok(results.providers);
      assert.ok(results.summary);
      assert.ok(Array.isArray(results.providers));
    });
  });

  describe('MCP Tool Execution', () => {
    it('should execute as MCP tool', async () => {
      const result = await detector.executeTool({
        includeHealth: false,
        includeModels: false
      });

      assert.ok(result.content);
      assert.ok(Array.isArray(result.content));
      assert.strictEqual(result.content[0].type, 'text');

      const parsedResult = JSON.parse(result.content[0].text);
      assert.ok(parsedResult.providers);
      assert.ok(parsedResult.summary);
    });

    it('should handle default parameters', async () => {
      const result = await detector.executeTool();

      assert.ok(result.content);
      const parsedResult = JSON.parse(result.content[0].text);
      assert.ok(parsedResult.providers);
    });
  });

  describe('Provider-Specific Detection', () => {
    it('should detect Ollama availability if running', async () => {
      const results = await detector.detectProviders({
        includeHealth: false,
        includeModels: false
      });

      const ollama = results.providers.find(p => p.name === 'ollama');

      // Ollama availability depends on whether it's running
      // Test should pass regardless of whether it's available
      assert.ok(ollama);
      if (ollama.available) {
        assert.ok(ollama.metadata.baseUrl);
      } else {
        assert.ok(ollama.error);
      }
    });

    it('should include models when requested for Ollama', async () => {
      const results = await detector.detectProviders({
        includeHealth: false,
        includeModels: true
      });

      const ollama = results.providers.find(p => p.name === 'ollama');

      if (ollama.available) {
        // If Ollama is running, models should be populated
        assert.ok(Array.isArray(ollama.models));
      }
    });

    it('should handle provider errors gracefully', async () => {
      // Create detector with very short timeout to force errors
      const fastDetector = new ProviderDetector({ timeout: 1 });

      const results = await fastDetector.detectProviders({
        includeHealth: true,
        includeModels: false
      });

      // Should still return results even with errors
      assert.ok(results.providers);
      assert.ok(results.summary);
    });
  });

  describe('Configuration Detection', () => {
    it('should detect environment variables correctly', async () => {
      const results = await detector.detectProviders();

      // Claude configuration
      const claude = results.providers.find(p => p.name === 'claude');
      const hasClaudeKey = !!(process.env.ANTHROPIC_API_KEY &&
        process.env.ANTHROPIC_API_KEY.trim() &&
        !process.env.ANTHROPIC_API_KEY.includes('your-'));

      assert.strictEqual(claude.configured, hasClaudeKey);

      // Ollama is always configured (no API key)
      const ollama = results.providers.find(p => p.name === 'ollama');
      assert.strictEqual(ollama.configured, true);
    });
  });

  describe('Metadata Collection', () => {
    it('should collect metadata for available providers', async () => {
      const results = await detector.detectProviders({
        includeHealth: false,
        includeModels: false
      });

      for (const provider of results.providers) {
        if (provider.available) {
          assert.ok(provider.metadata);
          assert.strictEqual(typeof provider.metadata, 'object');
        }
      }
    });

    it('should include endpoint information when available', async () => {
      const results = await detector.detectProviders();

      const ollama = results.providers.find(p => p.name === 'ollama');
      assert.ok(ollama.endpoint);

      const jules = results.providers.find(p => p.name === 'jules');
      assert.ok(jules.endpoint);
    });
  });
});
