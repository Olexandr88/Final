/**
 * Vibe Coding Sub-Agent Manager
 * Manages specialized AI assistants with custom prompts and tool access
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

export class SubAgent {
  constructor(config) {
    this.id = config.id || uuidv4();
    this.name = config.name;
    this.expertise = config.expertise;
    this.systemPrompt = config.systemPrompt;
    this.tools = config.tools || [];
    this.contextWindow = config.contextWindow || 100000;
    this.context = [];
    this.active = false;
  }

  addContext(message) {
    this.context.push({
      timestamp: Date.now(),
      ...message,
    });

    if (this.context.length > this.contextWindow / 1000) {
      this.context.shift();
    }
  }

  getContext() {
    return this.context;
  }

  clearContext() {
    this.context = [];
  }

  canUseTool(toolName) {
    return this.tools.includes(toolName) || this.tools.includes('*');
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      expertise: this.expertise,
      systemPrompt: this.systemPrompt,
      tools: this.tools,
      contextWindow: this.contextWindow,
      active: this.active,
    };
  }
}

export class SubAgentManager extends EventEmitter {
  constructor() {
    super();
    this.agents = new Map();
    this.activeAgents = new Set();
  }

  createAgent(config) {
    const agent = new SubAgent(config);
    this.agents.set(agent.id, agent);
    this.emit('agent:created', agent);
    return agent;
  }

  getAgent(id) {
    return this.agents.get(id);
  }

  getAgentByName(name) {
    for (const agent of this.agents.values()) {
      if (agent.name === name) {
        return agent;
      }
    }
    return null;
  }

  listAgents() {
    return Array.from(this.agents.values()).map((a) => a.toJSON());
  }

  deleteAgent(id) {
    const agent = this.agents.get(id);
    if (agent) {
      this.deactivateAgent(id);
      this.agents.delete(id);
      this.emit('agent:deleted', agent);
      return true;
    }
    return false;
  }

  activateAgent(id) {
    const agent = this.agents.get(id);
    if (agent) {
      agent.active = true;
      this.activeAgents.add(id);
      this.emit('agent:activated', agent);
      return true;
    }
    return false;
  }

  deactivateAgent(id) {
    const agent = this.agents.get(id);
    if (agent) {
      agent.active = false;
      this.activeAgents.delete(id);
      this.emit('agent:deactivated', agent);
      return true;
    }
    return false;
  }

  async delegateTask(agentId, task) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (!agent.active) {
      this.activateAgent(agentId);
    }

    agent.addContext({
      role: 'user',
      content: task,
    });

    this.emit('task:delegated', { agent, task });

    return {
      agentId: agent.id,
      agentName: agent.name,
      task,
      timestamp: Date.now(),
    };
  }

  async processAgentResponse(agentId, response) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    agent.addContext({
      role: 'assistant',
      content: response,
    });

    this.emit('response:received', { agent, response });

    return response;
  }

  getActiveAgents() {
    return Array.from(this.activeAgents)
      .map((id) => this.agents.get(id))
      .filter(Boolean)
      .map((a) => a.toJSON());
  }

  createDefaultAgents() {
    const defaults = [
      {
        name: 'code-reviewer',
        expertise: 'Code review, quality analysis, security scanning',
        systemPrompt:
          'You are an expert code reviewer. Analyze code for bugs, security issues, performance problems, and best practices violations. Be thorough and specific.',
        tools: ['read', 'grep', 'bash'],
      },
      {
        name: 'ui-designer',
        expertise: 'UI/UX design, frontend development, visual design',
        systemPrompt:
          'You are a UI/UX expert. Design beautiful, accessible, and user-friendly interfaces following modern design principles.',
        tools: ['read', 'write', 'edit', 'bash'],
      },
      {
        name: 'test-writer',
        expertise: 'Test design, TDD, test automation',
        systemPrompt:
          'You are a testing specialist. Write comprehensive, maintainable tests with high coverage. Follow TDD principles.',
        tools: ['read', 'write', 'edit', 'bash'],
      },
      {
        name: 'planner',
        expertise: 'Project planning, architecture design, task breakdown',
        systemPrompt:
          'You are a technical architect. Break down complex tasks into manageable steps, design system architecture, and plan implementations.',
        tools: ['read', 'grep'],
      },
      {
        name: 'debugger',
        expertise: 'Debugging, error analysis, troubleshooting',
        systemPrompt:
          'You are a debugging expert. Systematically identify and fix bugs through root cause analysis and testing.',
        tools: ['read', 'grep', 'bash', 'edit'],
      },
    ];

    defaults.forEach((config) => this.createAgent(config));
    return this.listAgents();
  }
}

export default SubAgentManager;
