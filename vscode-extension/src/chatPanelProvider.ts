/**
 * Webview provider for chat panel
 */

import * as vscode from 'vscode';
import { AIBridgeClient } from './aiBridgeClient';

export class ChatPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'llmChat';
  private _view?: vscode.WebviewView;
  private messageHistory: Array<{ role: string; content: string }> = [];

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private client: AIBridgeClient
  ) {
    // Listen to responses from AI Bridge
    client.on('response', (data: any) => {
      this.addMessage('assistant', data.message || data.content || JSON.stringify(data));
    });
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(data => {
      switch (data.type) {
        case 'sendMessage':
          this.sendMessage(data.message);
          break;
        case 'clearHistory':
          this.clearHistory();
          break;
      }
    });
  }

  public async sendMessage(message: string, context?: any): Promise<void> {
    if (!this.client.isConnected()) {
      vscode.window.showWarningMessage('Not connected to AI Bridge');
      return;
    }

    // Add user message to history
    this.addMessage('user', message);

    try {
      // Send to AI Bridge
      await this.client.sendRequest('task.chat', {
        message,
        context,
        history: this.messageHistory.slice(-10) // Last 10 messages for context
      });
    } catch (error) {
      this.addMessage('error', `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private addMessage(role: string, content: string): void {
    this.messageHistory.push({ role, content });

    if (this._view) {
      this._view.webview.postMessage({
        type: 'addMessage',
        role,
        content
      });
    }
  }

  private clearHistory(): void {
    this.messageHistory = [];
    if (this._view) {
      this._view.webview.postMessage({ type: 'clearMessages' });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LLM Chat</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 10px;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    #messages {
      flex: 1;
      overflow-y: auto;
      margin-bottom: 10px;
      padding: 10px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
    }

    .message {
      margin-bottom: 12px;
      padding: 8px 12px;
      border-radius: 6px;
      max-width: 90%;
    }

    .message.user {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      margin-left: auto;
      text-align: right;
    }

    .message.assistant {
      background-color: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
    }

    .message.error {
      background-color: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      color: var(--vscode-errorForeground);
    }

    .message-role {
      font-size: 0.85em;
      opacity: 0.7;
      margin-bottom: 4px;
      font-weight: 600;
    }

    .input-container {
      display: flex;
      gap: 8px;
    }

    input {
      flex: 1;
      padding: 8px 12px;
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      font-family: inherit;
      font-size: inherit;
    }

    input:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }

    button {
      padding: 8px 16px;
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
    }

    button:hover {
      background-color: var(--vscode-button-hoverBackground);
    }

    button:active {
      background-color: var(--vscode-button-background);
    }

    .toolbar {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 8px;
    }

    .toolbar button {
      padding: 4px 12px;
      font-size: 0.9em;
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .toolbar button:hover {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button id="clearBtn">Clear History</button>
  </div>
  <div id="messages"></div>
  <div class="input-container">
    <input type="text" id="messageInput" placeholder="Ask the AI agent..." />
    <button id="sendBtn">Send</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const messagesDiv = document.getElementById('messages');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const clearBtn = document.getElementById('clearBtn');

    function addMessage(role, content) {
      const messageDiv = document.createElement('div');
      messageDiv.className = \`message \${role}\`;

      const roleDiv = document.createElement('div');
      roleDiv.className = 'message-role';
      roleDiv.textContent = role.charAt(0).toUpperCase() + role.slice(1);

      const contentDiv = document.createElement('div');
      contentDiv.className = 'message-content';
      contentDiv.textContent = content;

      messageDiv.appendChild(roleDiv);
      messageDiv.appendChild(contentDiv);
      messagesDiv.appendChild(messageDiv);

      // Scroll to bottom
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    function clearMessages() {
      messagesDiv.innerHTML = '';
    }

    function sendMessage() {
      const message = messageInput.value.trim();
      if (!message) return;

      vscode.postMessage({
        type: 'sendMessage',
        message
      });

      messageInput.value = '';
    }

    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    });

    clearBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'clearHistory' });
    });

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
        case 'addMessage':
          addMessage(message.role, message.content);
          break;
        case 'clearMessages':
          clearMessages();
          break;
      }
    });
  </script>
</body>
</html>`;
  }
}
