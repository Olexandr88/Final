import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { CometAutomationAgent } from '../src/agents/comet-automation-agent.js';

/**
 * Comet Automation Agent Tests
 * Tests CDP connection, browser automation, and AI Bridge integration
 */

describe('Comet Automation Agent', () => {
  let agent;

  before(async () => {
    // Create agent instance
    agent = new CometAutomationAgent({
      autoReconnect: false, // Disable for tests
      debugPort: 9223, // Use different port to avoid conflicts
    });
  });

  after(async () => {
    // Cleanup - only if connections exist
    if (agent && agent.cdpConnection && typeof agent.cdpConnection.close === 'function') {
      await agent.destroy();
    }
  });

  it('should initialize with correct configuration', () => {
    assert.ok(agent.config.cometPath);
    assert.strictEqual(agent.config.debugPort, 9223);
    assert.strictEqual(agent.config.autoReconnect, false);
    assert.ok(Array.isArray(agent.capabilities));
    assert.strictEqual(agent.capabilities.length, 6);
  });

  it('should have required capabilities', () => {
    const expectedCapabilities = [
      'autonomous-browsing',
      'page-navigation',
      'dom-interaction',
      'data-extraction',
      'screenshot-capture',
      'network-monitoring',
    ];

    expectedCapabilities.forEach((capability) => {
      assert.ok(agent.capabilities.includes(capability), `Missing capability: ${capability}`);
    });
  });

  it('should construct CDP commands correctly', async () => {
    // Mock CDP connection
    agent.cdpConnection = {
      send: (data) => {
        const command = JSON.parse(data);
        assert.ok(command.id);
        assert.strictEqual(command.method, 'Page.navigate');
        assert.deepEqual(command.params, { url: 'https://example.com' });
      },
      on: () => {},
      removeListener: () => {},
    };

    // This will timeout, but we're testing the command structure
    try {
      await Promise.race([
        agent.sendCDPCommand('Page.navigate', { url: 'https://example.com' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 100)),
      ]);
    } catch (error) {
      assert.strictEqual(error.message, 'timeout');
    }
  });

  it('should format bridge messages correctly', () => {
    // Mock bridge connection
    let sentMessage = null;
    agent.bridgeConnection = {
      send: (data) => {
        sentMessage = JSON.parse(data);
      },
    };
    agent.isConnected = true;

    agent.sendToBridge({
      type: 'test:message',
      data: { foo: 'bar' },
    });

    assert.ok(sentMessage);
    assert.strictEqual(sentMessage.type, 'test:message');
    assert.deepEqual(sentMessage.data, { foo: 'bar' });
    assert.ok(sentMessage.metadata);
    assert.strictEqual(sentMessage.metadata.agentId, agent.config.agentId);
    assert.ok(sentMessage.metadata.timestamp);
  });

  it('should handle bridge disconnection gracefully', () => {
    agent.isConnected = true;
    agent.bridgeConnection = null;

    // Should not throw
    agent.sendToBridge({ type: 'test', data: {} });

    assert.strictEqual(agent.isConnected, true);
  });

  it('should emit events on lifecycle changes', async () => {
    let eventsFired = 0;

    const readyPromise = new Promise((resolve) => {
      agent.on('ready', () => {
        eventsFired++;
        resolve();
      });
    });

    const destroyedPromise = new Promise((resolve) => {
      agent.on('destroyed', () => {
        eventsFired++;
        resolve();
      });
    });

    agent.emit('ready');
    await readyPromise;

    agent.emit('destroyed');
    await destroyedPromise;

    assert.strictEqual(eventsFired, 2);
  });
});

describe('Comet API Integration', () => {
  it('should export CometAutomationAgent class', () => {
    assert.strictEqual(typeof CometAutomationAgent, 'function');
  });

  it('should create agent instance with custom config', () => {
    const customAgent = new CometAutomationAgent({
      debugPort: 9999,
      agentId: 'custom-agent',
      autoReconnect: false,
    });

    assert.strictEqual(customAgent.config.debugPort, 9999);
    assert.strictEqual(customAgent.config.agentId, 'custom-agent');
    assert.strictEqual(customAgent.config.autoReconnect, false);
  });

  it('should use default config values', () => {
    const defaultAgent = new CometAutomationAgent();

    assert.strictEqual(defaultAgent.config.debugPort, 9222);
    assert.strictEqual(defaultAgent.config.agentId, 'comet-assistant-1');
    assert.strictEqual(defaultAgent.config.autoReconnect, true);
    assert.strictEqual(defaultAgent.config.reconnectDelay, 5000);
  });
});
