import { EventEmitter } from 'events';
import { Logger } from '../utils/logger.js';

/**
 * SubAgentOrchestrator - Manages specialized AI sub-agents for vibe coding
 * Based on "Vibe Coding with Claude Code" series
 */
export class SubAgentOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.agents = new Map();
    this.activeAgents = new Set();
    this.logger = options.logger || Logger.getInstance();
    this.maxConcurrent = options.maxConcurrent || 10;
    this.contextWindowSize = options.contextWindowSize || 100000;
  }

  /**
   * Register a specialized sub-agent
   */
  registerAgent(config) {
    const {
      name,
      expertise,
      systemPrompt,
      tools = [],
      contextWindow = this.contextWindowSize,
      autoInvoke = false
    } = config;

    if (this.agents.has(name)) {
      throw new Error(`Agent ${name} already registered`);
    }

    this.agents.set(name, {
      name,
      expertise,
      systemPrompt,
      tools,
      contextWindow,
      autoInvoke,
      context: [],
      invocationCount: 0,
      lastInvoked: null
    });

    this.logger.info(`Registered sub-agent: ${name} (${expertise})`);
    return this;
  }

  /**
   * Invoke a sub-agent with a task
   */
  async invokeAgent(agentName, task, options = {}) {
    const agent = this.agents.get(agentName);
    if (!agent) {
      throw new Error(`Agent ${agentName} not found`);
    }

    // Check concurrent limit
    if (this.activeAgents.size >= this.maxConcurrent) {
      this.logger.warn(`Max concurrent agents reached (${this.maxConcurrent}), queuing task`);
      await this._waitForSlot();
    }

    this.activeAgents.add(agentName);
    agent.invocationCount++;
    agent.lastInvoked = Date.now();

    try {
      this.emit('agent:started', { agent: agentName, task });

      // Simulate agent processing
      const result = await this._processAgentTask(agent, task, options);

      this.emit('agent:completed', { agent: agentName, task, result });
      return result;
    } catch (error) {
      this.emit('agent:error', { agent: agentName, task, error });
      throw error;
    } finally {
      this.activeAgents.delete(agentName);
    }
  }

  /**
   * Invoke multiple agents in parallel
   */
  async invokeParallel(tasks) {
    const promises = tasks.map(({ agent, task, options }) =>
      this.invokeAgent(agent, task, options).catch(err => ({
        error: err,
        agent
      }))
    );

    return Promise.all(promises);
  }

  /**
   * Auto-select and invoke appropriate agent based on task
   */
  async autoInvoke(task, context = {}) {
    const matchedAgents = Array.from(this.agents.values())
      .filter(agent => agent.autoInvoke)
      .filter(agent => this._matchesExpertise(agent, task));

    if (matchedAgents.length === 0) {
      this.logger.warn('No matching agent found for auto-invocation');
      return null;
    }

    // Use agent with most relevant expertise
    const selectedAgent = matchedAgents[0];
    return this.invokeAgent(selectedAgent.name, task, { context });
  }

  /**
   * Get agent statistics
   */
  getStats() {
    const stats = {};
    for (const [name, agent] of this.agents) {
      stats[name] = {
        invocationCount: agent.invocationCount,
        lastInvoked: agent.lastInvoked,
        contextSize: agent.context.length,
        isActive: this.activeAgents.has(name)
      };
    }
    return stats;
  }

  /**
   * Clear agent context (implements context reset ritual)
   */
  clearContext(agentName) {
    const agent = this.agents.get(agentName);
    if (agent) {
      agent.context = [];
      this.logger.info(`Cleared context for agent: ${agentName}`);
    }
  }

  /**
   * Clear all agent contexts
   */
  clearAllContexts() {
    for (const agent of this.agents.values()) {
      agent.context = [];
    }
    this.logger.info('Cleared all agent contexts');
  }

  /**
   * Process agent task (internal)
   */
  async _processAgentTask(agent, task, options) {
    // Add task to context
    agent.context.push({ task, timestamp: Date.now() });

    // Trim context if exceeds window
    if (agent.context.length > agent.contextWindow / 1000) {
      agent.context = agent.context.slice(-Math.floor(agent.contextWindow / 1000));
    }

    // Simulate processing with agent's tools and expertise
    return {
      agent: agent.name,
      task,
      result: `Processed by ${agent.name}: ${agent.expertise}`,
      timestamp: Date.now(),
      contextUsed: agent.context.length
    };
  }

  /**
   * Check if agent expertise matches task
   */
  _matchesExpertise(agent, task) {
    const taskLower = task.toLowerCase();
    const expertiseLower = agent.expertise.toLowerCase();
    const keywords = expertiseLower.split(/[,\s]+/);
    return keywords.some(keyword => taskLower.includes(keyword));
  }

  /**
   * Wait for available agent slot
   */
  async _waitForSlot() {
    return new Promise(resolve => {
      const checkSlot = () => {
        if (this.activeAgents.size < this.maxConcurrent) {
          resolve();
        } else {
          setTimeout(checkSlot, 100);
        }
      };
      checkSlot();
    });
  }

  /**
   * Bootstrap default vibe-coding agents
   */
  static createDefaultAgents(orchestrator) {
    // Code reviewer sub-agent
    orchestrator.registerAgent({
      name: 'code-reviewer',
      expertise: 'code review, quality analysis, best practices, security',
      systemPrompt: 'You are a code review expert. Analyze code for quality, security, and best practices. Be thorough and critical.',
      tools: ['read-file', 'analyze-code', 'security-scan'],
      autoInvoke: true
    });

    // UI designer sub-agent
    orchestrator.registerAgent({
      name: 'ui-designer',
      expertise: 'UI design, UX principles, visual design, accessibility',
      systemPrompt: 'You are a UI/UX design expert. Focus on aesthetics, usability, and accessibility.',
      tools: ['read-file', 'screenshot', 'css-analyze'],
      autoInvoke: true
    });

    // Planner sub-agent
    orchestrator.registerAgent({
      name: 'planner',
      expertise: 'architecture, planning, task breakdown, system design',
      systemPrompt: 'You are a software architect. Break down complex tasks into manageable steps.',
      tools: ['read-file', 'analyze-structure'],
      autoInvoke: true
    });

    // Testing specialist sub-agent
    orchestrator.registerAgent({
      name: 'test-specialist',
      expertise: 'testing, TDD, unit tests, integration tests',
      systemPrompt: 'You are a testing expert. Write comprehensive tests using TDD principles.',
      tools: ['read-file', 'write-file', 'run-tests'],
      autoInvoke: true
    });

    // Documentation writer sub-agent
    orchestrator.registerAgent({
      name: 'docs-writer',
      expertise: 'documentation, technical writing, API docs',
      systemPrompt: 'You are a technical documentation expert. Write clear, comprehensive documentation.',
      tools: ['read-file', 'write-file'],
      autoInvoke: false
    });

    return orchestrator;
  }
}
