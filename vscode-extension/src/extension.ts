/**
 * LLM Framework Companion - VS Code Extension
 * Main entry point connecting to AI Bridge WebSocket server
 */

import * as vscode from 'vscode';
import { AIBridgeClient } from './aiBridgeClient';
import { AgentsTreeProvider } from './agentsTreeProvider';
import { ChatPanelProvider } from './chatPanelProvider';
import * as commands from './commands';

let aiBridgeClient: AIBridgeClient | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;
let agentsTreeProvider: AgentsTreeProvider | undefined;
let chatPanelProvider: ChatPanelProvider | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log('LLM Framework Companion extension is now active');

  // Initialize AI Bridge client
  const config = vscode.workspace.getConfiguration('llmFramework');
  const bridgeUrl = config.get<string>('aiBridgeUrl', 'ws://localhost:65028');
  const autoConnect = config.get<boolean>('autoConnect', true);

  aiBridgeClient = new AIBridgeClient(bridgeUrl);

  // Initialize status bar
  if (config.get<boolean>('showStatusBar', true)) {
    statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    statusBarItem.command = 'llmFramework.connectBridge';
    context.subscriptions.push(statusBarItem);
    updateStatusBar('disconnected', 0);
  }

  // Initialize Agents Tree View
  agentsTreeProvider = new AgentsTreeProvider(aiBridgeClient);
  vscode.window.registerTreeDataProvider('llmAgents', agentsTreeProvider);

  // Initialize Chat Panel
  chatPanelProvider = new ChatPanelProvider(context.extensionUri, aiBridgeClient);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('llmFramework.explainCode', () =>
      commands.explainCode(aiBridgeClient!)
    ),
    vscode.commands.registerCommand('llmFramework.refactorCode', () =>
      commands.refactorCode(aiBridgeClient!)
    ),
    vscode.commands.registerCommand('llmFramework.generateTests', () =>
      commands.generateTests(aiBridgeClient!)
    ),
    vscode.commands.registerCommand('llmFramework.askAgent', () =>
      commands.askAgent(aiBridgeClient!, chatPanelProvider!)
    ),
    vscode.commands.registerCommand('llmFramework.connectBridge', () =>
      connectToBridge()
    ),
    vscode.commands.registerCommand('llmFramework.disconnectBridge', () =>
      disconnectFromBridge()
    ),
    vscode.commands.registerCommand('llmFramework.refreshAgents', () =>
      agentsTreeProvider?.refresh()
    )
  );

  // Register webview provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('llmChat', chatPanelProvider)
  );

  // Listen to connection events
  aiBridgeClient.on('connected', () => {
    updateStatusBar('connected', 0);
    agentsTreeProvider?.refresh();
    vscode.window.showInformationMessage('Connected to AI Bridge');
  });

  aiBridgeClient.on('disconnected', () => {
    updateStatusBar('disconnected', 0);
    agentsTreeProvider?.refresh();
  });

  aiBridgeClient.on('agents-updated', (count: number) => {
    updateStatusBar('connected', count);
    agentsTreeProvider?.refresh();
  });

  aiBridgeClient.on('error', (error: Error) => {
    vscode.window.showErrorMessage(`AI Bridge error: ${error.message}`);
  });

  // Auto-connect if enabled
  if (autoConnect) {
    setTimeout(() => connectToBridge(), 1000);
  }
}

export function deactivate() {
  if (aiBridgeClient) {
    aiBridgeClient.disconnect();
  }
  if (statusBarItem) {
    statusBarItem.dispose();
  }
}

async function connectToBridge() {
  if (!aiBridgeClient) {
    return;
  }

  try {
    updateStatusBar('connecting', 0);
    await aiBridgeClient.connect();
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to connect to AI Bridge: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    updateStatusBar('disconnected', 0);
  }
}

function disconnectFromBridge() {
  if (aiBridgeClient) {
    aiBridgeClient.disconnect();
  }
}

function updateStatusBar(
  status: 'connected' | 'disconnected' | 'connecting',
  agentCount: number
) {
  if (!statusBarItem) {
    return;
  }

  switch (status) {
    case 'connected':
      statusBarItem.text = `$(check) LLM (${agentCount} agents)`;
      statusBarItem.tooltip = `Connected to AI Bridge - ${agentCount} agents available`;
      statusBarItem.backgroundColor = undefined;
      break;
    case 'connecting':
      statusBarItem.text = `$(sync~spin) LLM Connecting...`;
      statusBarItem.tooltip = 'Connecting to AI Bridge...';
      statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
      );
      break;
    case 'disconnected':
      statusBarItem.text = `$(x) LLM Disconnected`;
      statusBarItem.tooltip = 'Click to connect to AI Bridge';
      statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.errorBackground'
      );
      break;
  }

  statusBarItem.show();
}
