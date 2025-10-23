/**
 * Integration tests for Ably Transport Layer
 * Tests real Ably connections and message handling
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import AblyTransport from '../../src/mcp/ably-transport.js';

describe('Ably Transport Integration Tests', () => {
  let transport;
  const testChannel = 'test-channel';

  before(async () => {
    // Check if ABLY_API_KEY is set
    if (!process.env.ABLY_API_KEY) {
      throw new Error('ABLY_API_KEY environment variable is required for integration tests');
    }

    transport = new AblyTransport({
      channelPrefix: 'test-mcp'
    });
  });

  after(async () => {
    if (transport && transport.connected) {
      await transport.disconnect();
    }
  });

  it('should create transport instance', () => {
    assert.ok(transport, 'Transport instance created');
    assert.strictEqual(transport.connected, false, 'Transport not connected initially');
  });

  it('should connect to Ably successfully', async () => {
    await transport.connect();
    assert.strictEqual(transport.connected, true, 'Transport connected');
    assert.ok(transport.client, 'Ably client initialized');
  });

  it('should get or create a channel', () => {
    const channel = transport.getChannel(testChannel);
    assert.ok(channel, 'Channel created');
    assert.strictEqual(transport.channels.size, 1, 'Channel stored in registry');
  });

  it('should publish and receive messages', async () => {
    let receivedMessage = null;

    // Subscribe to test channel
    const unsubscribe = transport.subscribe(testChannel, 'test.event', (data) => {
      receivedMessage = data;
    });

    // Wait a bit for subscription to establish
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Publish test message
    const testData = { foo: 'bar', timestamp: Date.now() };
    await transport.publish(testChannel, 'test.event', testData);

    // Wait for message delivery
    await new Promise(resolve => setTimeout(resolve, 2000));

    assert.ok(receivedMessage, 'Message received');
    assert.strictEqual(receivedMessage.data.foo, 'bar', 'Message data matches');

    // Cleanup
    unsubscribe();
  });

  it('should handle disconnections gracefully', async () => {
    await transport.disconnect();

    const health = transport.getHealth();
    assert.strictEqual(health.connected, false, 'Transport disconnected');
    assert.strictEqual(transport.channels.size, 0, 'Channels cleared');
  });

  it('should provide health status', async () => {
    await transport.connect();

    const health = transport.getHealth();
    assert.ok(health, 'Health status available');
    assert.strictEqual(health.connected, true, 'Health shows connected');
    assert.ok(Array.isArray(health.channels), 'Health includes channels array');
  });
});
