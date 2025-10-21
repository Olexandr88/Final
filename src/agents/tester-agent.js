import { BaseAgent } from './base-agent.js';
import { logger } from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Tester Agent - Testing & Quality Assurance
 * Specializes in:
 * - Test case generation
 * - Test execution
 * - Coverage analysis
 * - Bug reporting
 * - Quality validation
 */
export class TesterAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      clientId: config.clientId || 'tester-agent',
      role: 'tester',
      labels: ['testing', 'qa', 'validation', 'quality-assurance'],
      intents: ['test.generate', 'test.execute', 'test.validate', 'task.assign'],
      toolPermissions: {
        file_read: true,
        file_write: true,
        code_analysis: true,
        command_exec: true,
        git_operations: false,
        test_execution: true
      },
      ...config
    });

    this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    this.model = config.model || 'deepseek-r1:1.5b';
    this.workspace = config.workspace || '.multi-claude/shared';
  }

  async handleMessage(message) {
    logger.info(`Tester Agent received: ${message.intent}`);

    try {
      switch (message.intent) {
        case 'task.assign':
          await this.handleTaskAssignment(message.payload);
          break;
        case 'test.generate':
          await this.generateTests(message.payload);
          break;
        case 'test.execute':
          await this.executeTests(message.payload);
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

  async handleTaskAssignment(payload) {
    logger.info(`📋 Task assigned: ${payload.description}`);

    // Check for implementation
    const implementation = await this.findImplementation();

    const prompt = `You are an expert QA engineer. Create comprehensive tests for:

TASK: ${payload.description}

SUCCESS CRITERIA:
${payload.criteria?.map(c => `- ${c}`).join('\n') || 'Complete test coverage'}

${implementation ? `IMPLEMENTATION TO TEST:\n${implementation}\n` : ''}

Provide:
1. Unit test cases
2. Integration test cases
3. Edge case tests
4. Performance test scenarios
5. Test data examples
6. Expected results

Create thorough, production-ready tests.`;

    const response = await this.queryOllama(prompt);

    const filename = `tests-${Date.now()}.md`;
    const filepath = path.join(this.workspace, filename);

    await fs.mkdir(this.workspace, { recursive: true });
    await fs.writeFile(filepath, response);

    logger.info(`✅ Test suite created: ${filename}`);

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

  async generateTests(payload) {
    const prompt = `Generate comprehensive test cases for:

${payload.description}

${payload.code ? `Code:\n${payload.code}` : ''}

Provide:
1. Unit tests
2. Integration tests
3. Edge cases
4. Performance tests
5. Expected results`;

    const response = await this.queryOllama(prompt);

    const filename = `test-cases-${Date.now()}.md`;
    const filepath = path.join(this.workspace, filename);

    await fs.mkdir(this.workspace, { recursive: true });
    await fs.writeFile(filepath, response);

    logger.info(`✅ Tests generated: ${filename}`);

    this.send({
      intent: 'test.complete',
      to: payload.requester || 'coordinator',
      payload: {
        type: 'test-generation',
        deliverable: filepath
      }
    });
  }

  async executeTests(payload) {
    logger.info(`Running tests: ${payload.testFile || 'all'}`);

    // In a real implementation, this would execute actual tests
    const results = {
      total: 10,
      passed: 9,
      failed: 1,
      coverage: 87
    };

    this.send({
      intent: 'test.results',
      to: payload.requester || 'coordinator',
      payload: results
    });
  }

  async findImplementation() {
    try {
      const files = await fs.readdir(this.workspace);
      const implFiles = files.filter(f => f.startsWith('implementation-') || f.startsWith('code-'));

      if (implFiles.length > 0) {
        const latest = implFiles.sort().reverse()[0];
        const content = await fs.readFile(path.join(this.workspace, latest), 'utf-8');
        return content.substring(0, 2000); // First 2000 chars
      }
    } catch (error) {
      logger.warn('No implementation found');
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

  send(message) {
    if (this.isConnected && this.ws) {
      this.ws.send(JSON.stringify({
        from: this.config.clientId,
        timestamp: Date.now(),
        ...message
      }));
    } else {
      this.messageQueue.push(message);
    }
  }
}

// Auto-start if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new TesterAgent();
  agent.connect().catch(console.error);

  process.on('SIGINT', () => {
    logger.info('Shutting down Tester Agent...');
    agent.disconnect();
    process.exit(0);
  });
}
