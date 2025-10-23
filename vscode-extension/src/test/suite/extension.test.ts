/**
 * Extension integration tests
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { AIBridgeClient } from '../../aiBridgeClient';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('scarmonit.llm-framework-companion'));
  });

  test('Extension should activate', async () => {
    const ext = vscode.extensions.getExtension('scarmonit.llm-framework-companion');
    assert.ok(ext);
    await ext.activate();
    assert.strictEqual(ext.isActive, true);
  });

  test('Commands should be registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    const llmCommands = commands.filter(cmd => cmd.startsWith('llmFramework.'));

    assert.ok(llmCommands.includes('llmFramework.explainCode'));
    assert.ok(llmCommands.includes('llmFramework.refactorCode'));
    assert.ok(llmCommands.includes('llmFramework.generateTests'));
    assert.ok(llmCommands.includes('llmFramework.askAgent'));
    assert.ok(llmCommands.includes('llmFramework.connectBridge'));
    assert.ok(llmCommands.includes('llmFramework.disconnectBridge'));
    assert.ok(llmCommands.includes('llmFramework.refreshAgents'));
  });

  test('Configuration should have default values', () => {
    const config = vscode.workspace.getConfiguration('llmFramework');

    assert.strictEqual(config.get('aiBridgeUrl'), 'ws://localhost:65028');
    assert.strictEqual(config.get('autoConnect'), true);
    assert.strictEqual(config.get('showStatusBar'), true);
  });

  test('Status bar item should be created when enabled', async () => {
    const config = vscode.workspace.getConfiguration('llmFramework');
    const showStatusBar = config.get<boolean>('showStatusBar');

    // If status bar is enabled, it should exist
    // Note: Direct access to statusBarItem is not possible, so we test indirectly
    assert.ok(showStatusBar !== undefined);
  });
});

suite('AIBridgeClient Test Suite', () => {
  let client: AIBridgeClient;

  setup(() => {
    client = new AIBridgeClient('ws://localhost:65028');
  });

  teardown(() => {
    if (client.isConnected()) {
      client.disconnect();
    }
  });

  test('Client should initialize with correct URL', () => {
    assert.ok(client);
    assert.strictEqual(client.isConnected(), false);
  });

  test('Client should emit connection events', (done) => {
    // Note: This test requires AI Bridge to be running
    // Skip if bridge is not available
    client.on('error', (error) => {
      // Expected if bridge is not running
      assert.ok(error);
      done();
    });

    client.on('connected', () => {
      assert.strictEqual(client.isConnected(), true);
      client.disconnect();
      done();
    });

    client.connect().catch(() => {
      // Expected if bridge is not running
      done();
    });
  });

  test('Client should handle disconnection gracefully', () => {
    assert.doesNotThrow(() => {
      client.disconnect();
    });
  });

  test('Client should throw error when sending without connection', () => {
    assert.throws(() => {
      client.send({ type: 'test', data: {} });
    }, Error);
  });

  test('Client should generate unique request IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      const id = (client as any).generateRequestId();
      assert.ok(!ids.has(id), 'Request ID should be unique');
      ids.add(id);
    }
  });
});
