/**
 * WebSocket client for connecting to LLM Framework AI Bridge
 * Communicates with agents on port 65028
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';

export interface AgentInfo {
  id: string;
  capabilities: string[];
  version?: string;
  status: string;
  lastHeartbeat?: number;
}

export interface BridgeMessage {
  type: string;
  data: any;
  metadata?: {
    timestamp?: number;
    requestId?: string;
    targetAgent?: string;
  };
}

export class AIBridgeClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private agents: Map<string, AgentInfo> = new Map();
  private pendingRequests: Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  constructor(url: string) {
    super();
    this.url = url;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.on('open', () => {
          console.log('Connected to AI Bridge');
          this.reconnectAttempts = 0;
          this.emit('connected');

          // Register as VS Code client agent
          this.send({
            type: 'agent.register',
            data: {
              agentId: 'vscode-client',
              capabilities: {
                capabilities: [
                  'vscode-integration',
                  'code-completion',
                  'refactoring',
                  'test-generation'
                ],
                version: '1.0.0',
                transport: 'websocket'
              }
            }
          });

          // Request agent list
          this.requestAgentList();

          // Start heartbeat
          this.startHeartbeat();

          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          try {
            const message: BridgeMessage = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (error) {
            console.error('Failed to parse message:', error);
          }
        });

        this.ws.on('close', () => {
          console.log('Disconnected from AI Bridge');
          this.stopHeartbeat();
          this.emit('disconnected');

          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            setTimeout(() => {
              this.reconnectAttempts++;
              this.connect();
            }, this.reconnectDelay);
          }
        });

        this.ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          this.emit('error', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect(): void {
    this.stopHeartbeat();

    if (this.ws) {
      // Unregister from bridge
      this.send({
        type: 'agent.unregister',
        data: { agentId: 'vscode-client' }
      });

      this.ws.close();
      this.ws = null;
    }

    // Clear pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();

    this.emit('disconnected');
  }

  send(message: BridgeMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    this.ws.send(JSON.stringify(message));
  }

  async sendRequest(
    type: string,
    data: any,
    timeout: number = 30000
  ): Promise<any> {
    const requestId = this.generateRequestId();

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }, timeout);

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout: timeoutHandle
      });

      this.send({
        type,
        data,
        metadata: {
          requestId,
          timestamp: Date.now()
        }
      });
    });
  }

  getAgents(): AgentInfo[] {
    return Array.from(this.agents.values());
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private handleMessage(message: BridgeMessage): void {
    const { type, data, metadata } = message;

    // Handle response to pending request
    if (metadata?.requestId && this.pendingRequests.has(metadata.requestId)) {
      const pending = this.pendingRequests.get(metadata.requestId)!;
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(metadata.requestId);
      pending.resolve(data);
      return;
    }

    // Handle specific message types
    switch (type) {
      case 'agent.list':
        this.updateAgentList(data.agents || []);
        break;

      case 'agent.registered':
      case 'agent.unregistered':
        this.requestAgentList();
        break;

      case 'response':
        this.emit('response', data);
        break;

      case 'error':
        this.emit('agent-error', data);
        break;

      default:
        this.emit('message', message);
    }
  }

  private updateAgentList(agents: AgentInfo[]): void {
    this.agents.clear();
    agents.forEach(agent => {
      if (agent.id !== 'vscode-client') {
        this.agents.set(agent.id, agent);
      }
    });

    this.emit('agents-updated', this.agents.size);
  }

  private requestAgentList(): void {
    if (this.isConnected()) {
      this.send({
        type: 'agent.list-request',
        data: {}
      });
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected()) {
        this.send({
          type: 'agent.heartbeat',
          data: { agentId: 'vscode-client' }
        });
      }
    }, 15000); // Every 15 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
