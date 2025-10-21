import { ClaudeClient } from './claude-client.js';
import { A2AAdapter } from './a2a-adapter.js';

/**
 * Claude Agent with A2A integration
 * Allows Claude to communicate with other agents via the A2A hub
 */
export class ClaudeA2AAgent {
  constructor(agentId = 'claude-agent', hubUrl = 'ws://localhost:4567') {
    this.agentId = agentId;
    this.claude = new ClaudeClient();
    this.a2a = new A2AAdapter(agentId, hubUrl);
    this.conversationHistory = [];

    // Set up A2A event handlers
    this.setupA2AHandlers();
  }

  /**
   * Set up A2A message handlers
   */
  setupA2AHandlers() {
    this.a2a.on('connected', () => {
      console.log(`[${this.agentId}] Connected to A2A hub`);
    });

    this.a2a.on('registered', (message) => {
      console.log(`[${this.agentId}] Registered with hub:`, message);
    });

    this.a2a.on('message', async (message) => {
      console.log(`[${this.agentId}] Received message:`, message);
      await this.handleIncomingMessage(message);
    });

    this.a2a.on('collaboration', async (message) => {
      console.log(`[${this.agentId}] Collaboration request:`, message);
      await this.handleCollaboration(message);
    });

    this.a2a.on('broadcast', (message) => {
      console.log(`[${this.agentId}] Broadcast received:`, message);
    });

    this.a2a.on('error', (error) => {
      console.error(`[${this.agentId}] A2A Error:`, error.message);
    });

    this.a2a.on('disconnected', () => {
      console.log(`[${this.agentId}] Disconnected from A2A hub`);
    });
  }

  /**
   * Connect to the A2A hub
   */
  async connect() {
    const capabilities = [
      'natural-language-processing',
      'code-generation',
      'analysis',
      'reasoning',
      'conversation'
    ];

    await this.a2a.connect(capabilities);
  }

  /**
   * Handle incoming messages from other agents
   */
  async handleIncomingMessage(message) {
    const { from, payload } = message;

    try {
      // Process the message with Claude
      const systemPrompt = `You are an AI agent (${this.agentId}) receiving ` +
        `a message from another agent (${from}). Respond appropriately to their request.`;
      const response = await this.claude.sendMessage(
        JSON.stringify(payload),
        systemPrompt
      );

      // Send response back to the requesting agent
      this.a2a.sendTo(from, {
        status: 'success',
        response
      });

    } catch (error) {
      this.a2a.sendTo(from, {
        status: 'error',
        error: error.message
      });
    }
  }

  /**
   * Handle collaboration requests
   */
  async handleCollaboration(message) {
    const { collaboration_id, task } = message;

    try {
      // Analyze the task with Claude
      const analysis = await this.claude.sendMessage(
        `Analyze this collaborative task: ${task}`,
        `You are participating in a multi-agent collaboration (ID: ${collaboration_id}). Provide your analysis and contribution.`
      );

      // Broadcast contribution to collaboration
      this.a2a.broadcast({
        type: 'collaboration_contribution',
        collaboration_id,
        agent_id: this.agentId,
        contribution: analysis
      });

    } catch (error) {
      console.error(`[${this.agentId}] Collaboration error:`, error.message);
    }
  }

  /**
   * Send a task to another agent
   */
  async sendTaskTo(targetAgent, task) {
    return new Promise((resolve, reject) => {
      // Set up one-time listener for response
      const responseHandler = (message) => {
        if (message.from === targetAgent) {
          this.a2a.off('message', responseHandler);
          resolve(message.payload);
        }
      };

      this.a2a.on('message', responseHandler);

      // Send the task
      this.a2a.sendTo(targetAgent, { task });

      // Timeout after 30 seconds
      setTimeout(() => {
        this.a2a.off('message', responseHandler);
        reject(new Error('Task timeout'));
      }, 30000);
    });
  }

  /**
   * Request collaboration from multiple agents
   */
  async collaborate(agents, task) {
    this.a2a.requestCollaboration(agents, task);
  }

  /**
   * Send a message to Claude and share result with other agents
   */
  async processAndShare(message, shareWith = []) {
    const response = await this.claude.sendMessage(message);

    // Share result with specified agents
    for (const agent of shareWith) {
      this.a2a.sendTo(agent, {
        original_message: message,
        claude_response: response
      });
    }

    return response;
  }

  /**
   * Disconnect from A2A hub
   */
  disconnect() {
    this.a2a.disconnect();
  }
}
