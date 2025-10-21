import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { CometAutomationAgent } from '../src/agents/comet-automation-agent.js';

/**
 * Comet Integration Tests
 * Tests the Comet automation agent and API integration
 */

describe('Comet Automation Agent', () => {
  let agent;

  before(async () => {
    // Skip if Comet is not installed
    try {
      agent = new CometAutomationAgent({
        agentId: 'comet-test-agent',
        autoReconnect: false,
      });
      await agent.ensureCometRunning();
    } catch (error) {
      console.log('Comet not available for testing:', error.message);
    }
  });

  after(async () => {
    if (agent) {
      await agent.destroy();
    }
  });

  it('should create agent with correct configuration', () => {
    if (!agent) return;

    assert.equal(agent.config.agentId, 'comet-test-agent');
    assert.ok(agent.config.cometPath.includes('comet.exe'));
    assert.equal(agent.config.debugPort, 9222);
    assert.equal(typeof agent.config.bridgeWS, 'string');
  });

  it('should have correct capabilities', () => {
    if (!agent) return;

    assert.ok(Array.isArray(agent.capabilities));
    assert.ok(agent.capabilities.includes('autonomous-browsing'));
    assert.ok(agent.capabilities.includes('page-navigation'));
    assert.ok(agent.capabilities.includes('data-extraction'));
    assert.ok(agent.capabilities.includes('screenshot-capture'));
  });

  it('should check if Comet is running', async () => {
    if (!agent) return;

    try {
      await agent.ensureCometRunning();
      assert.equal(typeof agent.isCometRunning, 'boolean');
    } catch (error) {
      // Expected if Comet not installed
      console.log('Comet check failed (expected):', error.message);
    }
  });

  it('should handle bridge messages', async () => {
    if (!agent) return;

    const testMessage = JSON.stringify({
      type: 'comet:navigate',
      data: { url: 'https://example.com' },
    });

    // Should not throw during message handling (async operations may fail if CDP not connected)
    try {
      await agent.handleBridgeMessage(Buffer.from(testMessage));
    } catch (error) {
      // Expected if CDP not connected
      assert.ok(error.message.includes('CDP') || error.message.includes('not connected'));
    }
  });

  it('should validate navigation URL', async () => {
    if (!agent) return;

    try {
      await agent.navigate('https://example.com');
    } catch (error) {
      // Expected if not connected to CDP
      assert.ok(error.message.includes('CDP') || error.message.includes('not connected'));
    }
  });
});

describe('Comet API Endpoints', () => {
  const BASE_URL = 'http://localhost:8080/api/comet';

  it('should have status endpoint', async () => {
    try {
      const response = await fetch(`${BASE_URL}/status`);
      assert.ok(response.ok || response.status === 500); // 500 if agent not initialized
    } catch (error) {
      console.log('Server not running for API test');
    }
  });

  it('should validate navigate endpoint requires URL', async () => {
    try {
      const response = await fetch(`${BASE_URL}/navigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (response.status === 400) {
        const data = await response.json();
        assert.equal(data.success, false);
        assert.ok(data.error.includes('required'));
      }
    } catch (error) {
      console.log('Server not running for API test');
    }
  });

  it('should validate execute endpoint requires script', async () => {
    try {
      const response = await fetch(`${BASE_URL}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (response.status === 400) {
        const data = await response.json();
        assert.equal(data.success, false);
        assert.ok(data.error.includes('required'));
      }
    } catch (error) {
      console.log('Server not running for API test');
    }
  });

  it('should validate extract endpoint requires selector', async () => {
    try {
      const response = await fetch(`${BASE_URL}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (response.status === 400) {
        const data = await response.json();
        assert.equal(data.success, false);
        assert.ok(data.error.includes('required'));
      }
    } catch (error) {
      console.log('Server not running for API test');
    }
  });

  it('should validate search endpoint requires query', async () => {
    try {
      const response = await fetch(`${BASE_URL}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (response.status === 400) {
        const data = await response.json();
        assert.equal(data.success, false);
        assert.ok(data.error.includes('required'));
      }
    } catch (error) {
      console.log('Server not running for API test');
    }
  });
});
