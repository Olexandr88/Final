/**
 * Tree view provider for connected agents
 */

import * as vscode from 'vscode';
import { AIBridgeClient, AgentInfo } from './aiBridgeClient';

export class AgentsTreeProvider implements vscode.TreeDataProvider<AgentTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<AgentTreeItem | undefined | null | void> =
    new vscode.EventEmitter<AgentTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<AgentTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  constructor(private client: AIBridgeClient) {
    // Listen to agent updates
    client.on('agents-updated', () => {
      this.refresh();
    });
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: AgentTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: AgentTreeItem): Thenable<AgentTreeItem[]> {
    if (!this.client.isConnected()) {
      return Promise.resolve([]);
    }

    if (element) {
      // Return agent details as children
      return Promise.resolve(this.getAgentDetails(element.agent));
    } else {
      // Return top-level agents
      const agents = this.client.getAgents();
      return Promise.resolve(
        agents.map(agent => new AgentTreeItem(agent, vscode.TreeItemCollapsibleState.Collapsed))
      );
    }
  }

  private getAgentDetails(agent: AgentInfo): AgentTreeItem[] {
    const details: AgentTreeItem[] = [];

    details.push(
      new AgentTreeItem(
        {
          id: 'status',
          status: agent.status,
          capabilities: []
        },
        vscode.TreeItemCollapsibleState.None,
        `Status: ${agent.status}`
      )
    );

    if (agent.version) {
      details.push(
        new AgentTreeItem(
          {
            id: 'version',
            status: 'info',
            capabilities: []
          },
          vscode.TreeItemCollapsibleState.None,
          `Version: ${agent.version}`
        )
      );
    }

    if (agent.capabilities && agent.capabilities.length > 0) {
      details.push(
        new AgentTreeItem(
          {
            id: 'capabilities',
            status: 'info',
            capabilities: agent.capabilities
          },
          vscode.TreeItemCollapsibleState.None,
          `Capabilities: ${agent.capabilities.join(', ')}`
        )
      );
    }

    return details;
  }
}

class AgentTreeItem extends vscode.TreeItem {
  constructor(
    public readonly agent: AgentInfo,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    label?: string
  ) {
    super(label || agent.id, collapsibleState);

    this.tooltip = this.getTooltip();
    this.iconPath = this.getIcon();
    this.contextValue = 'agent';
  }

  private getTooltip(): string {
    if (this.label?.toString().startsWith('Status:')) {
      return this.agent.status;
    }
    if (this.label?.toString().startsWith('Version:')) {
      return `Agent version: ${this.agent.version}`;
    }
    if (this.label?.toString().startsWith('Capabilities:')) {
      return `Available capabilities: ${this.agent.capabilities.join(', ')}`;
    }

    return `Agent: ${this.agent.id}\nStatus: ${this.agent.status}\nCapabilities: ${this.agent.capabilities.join(', ')}`;
  }

  private getIcon(): vscode.ThemeIcon {
    if (this.label?.toString().startsWith('Status:')) {
      return this.agent.status === 'active'
        ? new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'))
        : new vscode.ThemeIcon('circle-outline');
    }
    if (this.label?.toString().startsWith('Version:')) {
      return new vscode.ThemeIcon('tag');
    }
    if (this.label?.toString().startsWith('Capabilities:')) {
      return new vscode.ThemeIcon('tools');
    }

    // Agent icons based on type
    if (this.agent.id.includes('claude')) {
      return new vscode.ThemeIcon('sparkle');
    }
    if (this.agent.id.includes('ollama')) {
      return new vscode.ThemeIcon('circuit-board');
    }
    if (this.agent.id.includes('jules')) {
      return new vscode.ThemeIcon('robot');
    }

    return new vscode.ThemeIcon('symbol-misc');
  }
}
