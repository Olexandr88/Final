import WebSocket from 'ws';
import { EventEmitter } from 'events';

/**
 * A2A Adapter for JavaScript/Node.js applications
 * Connects to the A2A hub and enables agent communication
 */
export class A2AAdapter extends EventEmitter {
  constructor(agentId, hubUrl = 'ws://localhost:4567') {
    super();
    this.agentId = agentId;
    this.hubUrl = hubUrl;
    this.ws = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000;
  }

  /**
   * Connect to the A2A hub
   */
  async connect(capabilities = []) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.hubUrl);

      this.ws.on('open', () => {
        this.connected = true;
        this.reconnectAttempts = 0;

        // Register with hub
        this.send({
          type: 'register',
          agent_id: this.agentId,
          capabilities
        });

        this.emit('connected');
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          this.emit('error', new Error(`Failed to parse message: ${error.message}`));
        }
      });

      this.ws.on('close', () => {
        this.connected = false;
        this.emit('disconnected');
        this.attemptReconnect(capabilities);
      });

      this.ws.on('error', (error) => {
        this.emit('error', error);
        reject(error);
      });
    });
  }

  /**
   * Attempt to reconnect to the hub
   */
  attemptReconnect(capabilities) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        this.connect(capabilities).catch(() => {
          // Connection failed, will retry
        });
      }, this.reconnectDelay * this.reconnectAttempts);
    }
  }

  /**
   * Handle incoming messages from the hub
   */
  handleMessage(message) {
    const { type } = message;

    switch (type) {
      case 'registration_confirmed':
        this.emit('registered', message);
        break;
      case 'pong':
        this.emit('pong');
        break;
      case 'query':
      case 'task':
      case 'message':
        this.emit('message', message);
        break;
      case 'collaboration_request':
        this.emit('collaboration', message);
        break;
      case 'broadcast':
        this.emit('broadcast', message);
        break;
      default:
        this.emit('unknown', message);
    }
  }

  /**
   * Send a message through the hub
   */
  send(message) {
    if (!this.connected || !this.ws) {
      throw new Error('Not connected to A2A hub');
    }

    this.ws.send(JSON.stringify({
      ...message,
      from: this.agentId,
      timestamp: new Date().toISOString()
    }));
  }

  /**
   * Send a message to a specific agent
   */
  sendTo(targetAgent, payload) {
    this.send({
      type: 'message',
      to: targetAgent,
      payload
    });
  }

  /**
   * Broadcast a message to all agents
   */
  broadcast(message) {
    this.send({
      type: 'broadcast',
      message
    });
  }

  /**
   * Request collaboration from multiple agents
   */
  requestCollaboration(agents, task) {
    this.send({
      type: 'collaborative-task',
      agents,
      task
    });
  }

  /**
   * Send a ping to the hub
   */
  ping() {
    this.send({ type: 'ping' });
  }

  /**
   * Disconnect from the hub
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
  }
}
