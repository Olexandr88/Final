import { BaseAgent } from './base-agent.js';
import { logger } from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Architect Agent - System Design & Architecture
 * Specializes in:
 * - System architecture design
 * - Component design
 * - API design
 * - Technical specifications
 * - Architecture documentation
 */
export class ArchitectAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      clientId: config.clientId || 'architect-agent',
      role: 'architect',
      labels: ['architecture', 'design', 'system-design', 'planning'],
      intents: ['design.system', 'design.api', 'design.component', 'plan.architecture'],
      toolPermissions: {
        file_read: true,
        file_write: true,
        code_analysis: true,
        command_exec: false,
        git_operations: false,
        test_execution: false
      },
      ...config
    });

    // Ollama configuration
    this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    this.model = config.model || 'deepseek-r1:1.5b';

    // Workspace for deliverables
    this.workspace = config.workspace || '.multi-claude/shared';
  }

  /**
   * Handle incoming messages
   */
  async handleMessage(message) {
    logger.info(`Architect Agent received: ${message.intent}`);

    try {
      switch (message.intent) {
        case 'task.assign':
          await this.handleTaskAssignment(message.payload);
          break;
        case 'design.system':
          await this.designSystem(message.payload);
          break;
        case 'design.api':
          await this.designAPI(message.payload);
          break;
        case 'ping':
          this.send({ intent: 'pong', to: message.from });
          break;
        default:
          logger.warn(`Unknown intent: ${message.intent}`);
      }
    } catch (error) {
      logger.error('Error handling message:', error);
      this.send({
        intent: 'error',
        to: message.from,
        payload: { error: error.message }
      });
    }
  }

  /**
   * Handle task assignment from coordinator
   */
  async handleTaskAssignment(payload) {
    logger.info(`📋 Task assigned: ${payload.description}`);

    const response = await this.queryOllama(this.buildTaskPrompt(payload));

    // Write deliverable to workspace
    const filename = `architecture-${Date.now()}.md`;
    const filepath = path.join(this.workspace, filename);

    await fs.mkdir(this.workspace, { recursive: true });
    await fs.writeFile(filepath, response);

    logger.info(`✅ Architecture document created: ${filename}`);

    // Notify completion
    this.send({
      intent: 'task.complete',
      to: 'coordinator',
      payload: {
        agent: this.config.clientId,
        task: payload.description,
        deliverable: filepath,
        summary: response.substring(0, 200)
      }
    });
  }

  /**
   * Design a system architecture
   */
  async designSystem(payload) {
    const prompt = `You are a senior software architect. Design a system architecture for:

${payload.description}

Requirements:
${payload.requirements?.map(r => `- ${r}`).join('\n') || 'See description'}

Provide:
1. High-level architecture diagram (text/ASCII)
2. Component breakdown
3. Technology stack recommendations
4. API contracts
5. Data flow
6. Scalability considerations
7. Security considerations`;

    const response = await this.queryOllama(prompt);

    const filename = `architecture-${Date.now()}.md`;
    const filepath = path.join(this.workspace, filename);

    await fs.mkdir(this.workspace, { recursive: true });
    await fs.writeFile(filepath, response);

    logger.info(`✅ Architecture designed: ${filename}`);

    this.send({
      intent: 'design.complete',
      to: payload.requester || 'coordinator',
      payload: {
        type: 'system',
        deliverable: filepath,
        summary: response.substring(0, 200)
      }
    });
  }

  /**
   * Design an API
   */
  async designAPI(payload) {
    const prompt = `You are a senior API architect. Design an API for:

${payload.description}

Provide:
1. RESTful endpoints with HTTP methods
2. Request/response schemas
3. Authentication strategy
4. Rate limiting approach
5. Error handling
6. API versioning strategy`;

    const response = await this.queryOllama(prompt);

    const filename = `api-design-${Date.now()}.md`;
    const filepath = path.join(this.workspace, filename);

    await fs.mkdir(this.workspace, { recursive: true });
    await fs.writeFile(filepath, response);

    logger.info(`✅ API designed: ${filename}`);

    this.send({
      intent: 'design.complete',
      to: payload.requester || 'coordinator',
      payload: {
        type: 'api',
        deliverable: filepath
      }
    });
  }

  /**
   * Query Ollama LLM
   */
  async queryOllama(prompt) {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: prompt,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.response;
    } catch (error) {
      logger.error('Ollama query failed:', error);
      return `Error querying LLM: ${error.message}`;
    }
  }

  /**
   * Build task prompt
   */
  buildTaskPrompt(task) {
    return `You are an expert software architect. Complete this task:

TASK: ${task.description}

SUCCESS CRITERIA:
${task.criteria?.map(c => `- ${c}`).join('\n') || 'Complete the task successfully'}

PRIORITY: ${task.priority || 'medium'}
ESTIMATED TIME: ${task.estimatedTime || 'unknown'}

Provide a comprehensive architecture document with:
1. System overview
2. Component design
3. Technology recommendations
4. Implementation plan
5. Scalability considerations
6. Security considerations

Be detailed and specific.`;
  }

  /**
   * Send message via AI Bridge
   */
  send(message) {
    if (this.isConnected && this.ws) {
      this.ws.send(JSON.stringify({
        from: this.config.clientId,
        timestamp: Date.now(),
        ...message
      }));
    } else {
      logger.warn('Not connected, queueing message');
      this.messageQueue.push(message);
    }
  }
}

// Auto-start if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new ArchitectAgent();
  agent.connect().catch(console.error);

  process.on('SIGINT', () => {
    logger.info('Shutting down Architect Agent...');
    agent.disconnect();
    process.exit(0);
  });
}
