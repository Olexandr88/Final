import { BaseAgent } from './base-agent.js';
import { logger } from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Developer Agent - Code Implementation
 * Specializes in:
 * - Feature implementation
 * - Code writing
 * - Refactoring
 * - Bug fixes
 * - Integration
 */
export class DeveloperAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      clientId: config.clientId || 'developer-agent',
      role: 'developer',
      labels: ['development', 'coding', 'implementation', 'refactoring'],
      intents: ['code.implement', 'code.refactor', 'code.fix', 'task.assign'],
      toolPermissions: {
        file_read: true,
        file_write: true,
        code_analysis: true,
        command_exec: true,
        git_operations: true,
        test_execution: true,
      },
      ...config,
    });

    this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    this.model = config.model || 'deepseek-r1:1.5b';
    this.workspace = config.workspace || '.multi-claude/shared';
  }

  async handleMessage(message) {
    logger.info(`Developer Agent received: ${message.intent}`);

    try {
      switch (message.intent) {
        case 'task.assign':
          await this.handleTaskAssignment(message.payload);
          break;
        case 'code.implement':
          await this.implementCode(message.payload);
          break;
        case 'code.refactor':
          await this.refactorCode(message.payload);
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
        payload: { error: error.message },
      });
    }
  }

  async handleTaskAssignment(payload) {
    logger.info(`📋 Task assigned: ${payload.description}`);

    // Check for architecture plan
    const architecturePlan = await this.findArchitecturePlan();

    const prompt = `You are an expert software developer. Implement this feature:

TASK: ${payload.description}

SUCCESS CRITERIA:
${payload.criteria?.map((c) => `- ${c}`).join('\n') || 'Complete implementation'}

${architecturePlan ? `ARCHITECTURE PLAN:\n${architecturePlan}\n` : ''}

Provide:
1. Complete, working code implementation
2. Inline documentation
3. Error handling
4. Configuration options
5. Usage examples

Write production-ready code with best practices.`;

    const response = await this.queryOllama(prompt);

    const filename = `implementation-${Date.now()}.md`;
    const filepath = path.join(this.workspace, filename);

    await fs.mkdir(this.workspace, { recursive: true });
    await fs.writeFile(filepath, response);

    logger.info(`✅ Implementation created: ${filename}`);

    this.send({
      intent: 'task.complete',
      to: 'coordinator',
      payload: {
        agent: this.config.clientId,
        task: payload.description,
        deliverable: filepath,
        summary: response.substring(0, 200),
      },
    });
  }

  async implementCode(payload) {
    const prompt = `Implement the following feature:

${payload.description}

${payload.requirements ? `Requirements:\n${payload.requirements.join('\n')}` : ''}

Provide complete, working code with:
1. Main implementation
2. Error handling
3. Documentation
4. Configuration
5. Usage examples`;

    const response = await this.queryOllama(prompt);

    const filename = `code-${Date.now()}.md`;
    const filepath = path.join(this.workspace, filename);

    await fs.mkdir(this.workspace, { recursive: true });
    await fs.writeFile(filepath, response);

    logger.info(`✅ Code implemented: ${filename}`);

    this.send({
      intent: 'code.complete',
      to: payload.requester || 'coordinator',
      payload: {
        type: 'implementation',
        deliverable: filepath,
      },
    });
  }

  async refactorCode(payload) {
    const prompt = `Refactor this code:

${payload.code}

Goals: ${payload.goals?.join(', ') || 'Improve code quality'}

Provide refactored code with explanations.`;

    const response = await this.queryOllama(prompt);

    this.send({
      intent: 'code.complete',
      to: payload.requester || 'coordinator',
      payload: {
        type: 'refactor',
        result: response,
      },
    });
  }

  async findArchitecturePlan() {
    try {
      const files = await fs.readdir(this.workspace);
      const archFiles = files.filter((f) => f.startsWith('architecture-'));

      if (archFiles.length > 0) {
        const latest = archFiles.sort().reverse()[0];
        const content = await fs.readFile(path.join(this.workspace, latest), 'utf-8');
        return content.substring(0, 2000); // First 2000 chars
      }
    } catch (error) {
      logger.warn('No architecture plan found');
    }
    return null;
  }

  async queryOllama(prompt) {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: prompt,
          stream: false,
        }),
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

  send(message) {
    if (this.isConnected && this.ws) {
      this.ws.send(
        JSON.stringify({
          from: this.config.clientId,
          timestamp: Date.now(),
          ...message,
        })
      );
    } else {
      this.messageQueue.push(message);
    }
  }
}

// Auto-start if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new DeveloperAgent();
  agent.connect().catch(console.error);

  process.on('SIGINT', () => {
    logger.info('Shutting down Developer Agent...');
    agent.disconnect();
    process.exit(0);
  });
}
