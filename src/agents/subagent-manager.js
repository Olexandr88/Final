/**
 * Sub-Agent Management System
 * Implements the Vibe Coding pattern for specialized AI assistants
 */

import EventEmitter from 'events';
import { v4 as uuidv4 } from 'uuid';

export class SubAgentManager extends EventEmitter {
  constructor() {
    super();
    this.agents = new Map();
    this.activeAgents = new Map();
    this.contextWindows = new Map();
    this.CONTEXT_WINDOW_SIZE = 100000; // 100k tokens per agent
  }

  /**
   * Create and register a sub-agent
   * @param {Object} config - Agent configuration
   * @param {string} config.name - Agent identifier
   * @param {string} config.expertise - Domain of specialization
   * @param {string} config.systemPrompt - Custom prompt for agent behavior
   * @param {string[]} config.tools - Available tools for this agent
   */
  createAgent(config) {
    const { name, expertise, systemPrompt, tools = [] } = config;

    const agentId = uuidv4();
    const agent = {
      id: agentId,
      name,
      expertise,
      systemPrompt,
      tools,
      contextWindow: [],
      tokenCount: 0,
      createdAt: Date.now(),
      status: 'idle'
    };

    this.agents.set(agentId, agent);
    this.contextWindows.set(agentId, []);

    this.emit('agent:created', { agentId, name, expertise });

    return agentId;
  }

  /**
   * Invoke a sub-agent for a task
   * @param {string} agentId - Agent identifier
   * @param {string} prompt - Task prompt
   * @param {Object} context - Additional context
   */
  async invoke(agentId, prompt, context = {}) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    agent.status = 'active';
    this.activeAgents.set(agentId, Date.now());

    const taskId = uuidv4();
    const task = {
      id: taskId,
      agentId,
      prompt,
      context,
      startedAt: Date.now(),
      status: 'running'
    };

    this.emit('task:started', { taskId, agentId, prompt });

    try {
      // Prepare enhanced prompt with agent's system context
      const enhancedPrompt = this._enhancePrompt(agent, prompt, context);

      // Execute task (integrate with actual AI backend)
      const result = await this._executeTask(agent, enhancedPrompt);

      // Update context window
      this._updateContext(agentId, prompt, result);

      task.status = 'completed';
      task.completedAt = Date.now();
      task.result = result;

      this.emit('task:completed', { taskId, agentId, result });

      return result;
    } catch (error) {
      task.status = 'failed';
      task.error = error.message;

      this.emit('task:failed', { taskId, agentId, error: error.message });

      throw error;
    } finally {
      agent.status = 'idle';
      this.activeAgents.delete(agentId);
    }
  }

  /**
   * Delegate task to appropriate sub-agent based on domain
   */
  async delegate(task, domain) {
    const matchingAgents = Array.from(this.agents.values())
      .filter(agent => agent.expertise.toLowerCase().includes(domain.toLowerCase()));

    if (matchingAgents.length === 0) {
      throw new Error(`No agent found for domain: ${domain}`);
    }

    // Use first matching agent
    const agent = matchingAgents[0];
    return this.invoke(agent.id, task);
  }

  /**
   * Enhance prompt with agent's system context
   */
  _enhancePrompt(agent, prompt, context) {
    return {
      system: agent.systemPrompt,
      user: prompt,
      context: {
        ...context,
        expertise: agent.expertise,
        availableTools: agent.tools,
        contextWindow: this.contextWindows.get(agent.id).slice(-10) // Last 10 interactions
      }
    };
  }

  /**
   * Execute task (placeholder for actual AI integration)
   */
  async _executeTask(agent, enhancedPrompt) {
    // This would integrate with Claude API, Ollama, etc.
    // For now, return a mock response
    return {
      agentId: agent.id,
      expertise: agent.expertise,
      response: `Task processed by ${agent.name}`,
      timestamp: Date.now()
    };
  }

  /**
   * Update agent's context window
   */
  _updateContext(agentId, prompt, result) {
    const context = this.contextWindows.get(agentId);
    context.push({
      prompt,
      result,
      timestamp: Date.now()
    });

    // Maintain context window size
    if (context.length > 50) {
      context.shift();
    }
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId) {
    return this.agents.get(agentId);
  }

  /**
   * List all agents
   */
  listAgents() {
    return Array.from(this.agents.values());
  }

  /**
   * Get agent statistics
   */
  getStats(agentId) {
    const agent = this.agents.get(agentId);
    const context = this.contextWindows.get(agentId);

    return {
      id: agent.id,
      name: agent.name,
      expertise: agent.expertise,
      status: agent.status,
      totalInteractions: context.length,
      createdAt: agent.createdAt,
      isActive: this.activeAgents.has(agentId)
    };
  }

  /**
   * Clear agent context
   */
  clearContext(agentId) {
    this.contextWindows.set(agentId, []);
    this.emit('context:cleared', { agentId });
  }

  /**
   * Remove agent
   */
  removeAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    this.agents.delete(agentId);
    this.contextWindows.delete(agentId);
    this.activeAgents.delete(agentId);

    this.emit('agent:removed', { agentId, name: agent.name });

    return true;
  }
}

/**
 * Create specialized sub-agents based on Vibe Coding patterns
 */
export function createSpecializedAgents() {
  const manager = new SubAgentManager();

  // Code Reviewer Agent
  manager.createAgent({
    name: 'code-reviewer',
    expertise: 'code review, security, best practices',
    systemPrompt: 'You are a senior code reviewer. Analyze code for quality, ' +
      'security vulnerabilities, performance issues, and adherence to best practices. ' +
      'Provide detailed, actionable feedback.',
    tools: ['read', 'grep', 'glob', 'bash']
  });

  // Planner Agent
  manager.createAgent({
    name: 'planner',
    expertise: 'architecture, planning, design',
    systemPrompt: 'You are a technical architect. Break down complex requirements into clear, actionable steps. Design scalable, maintainable solutions.',
    tools: ['read', 'glob', 'grep']
  });

  // UI Designer Agent
  manager.createAgent({
    name: 'ui-designer',
    expertise: 'UI/UX, frontend, design',
    systemPrompt: 'You are a UI/UX specialist. Create beautiful, accessible user interfaces. Follow design best practices and modern patterns.',
    tools: ['read', 'write', 'edit', 'bash']
  });

  // Test Writer Agent
  manager.createAgent({
    name: 'test-writer',
    expertise: 'testing, TDD, quality assurance',
    systemPrompt: 'You are a testing specialist. Write comprehensive test suites with high coverage. Follow TDD principles.',
    tools: ['read', 'write', 'edit', 'bash']
  });

  // Documentation Agent
  manager.createAgent({
    name: 'documentation-writer',
    expertise: 'documentation, technical writing',
    systemPrompt: 'You are a technical documentation specialist. Create clear, concise documentation for code, APIs, and systems.',
    tools: ['read', 'write', 'glob', 'grep']
  });

  // Debugging Agent
  manager.createAgent({
    name: 'debugger',
    expertise: 'debugging, troubleshooting, error analysis',
    systemPrompt: 'You are a debugging specialist. Analyze errors, trace issues, and provide solutions. Use systematic debugging approaches.',
    tools: ['read', 'grep', 'bash', 'edit']
  });

  return manager;
}

export default SubAgentManager;
