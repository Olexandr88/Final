import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs-extra';

/**
 * Sub-Agent Manager - Specialized AI assistants for particular tasks
 * Implements vibe coding pattern from the guide
 */
export class SubAgentManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.agents = new Map();
    this.agentRegistry = new Map();
    this.agentConfigPath = options.configPath || path.join(process.cwd(), '.agents');
    this.contextWindow = options.contextWindow || 100000; // 100k tokens per agent
    this.loadAgentDefinitions();
  }

  /**
   * Load agent definitions from config directory
   */
  async loadAgentDefinitions() {
    await fs.ensureDir(this.agentConfigPath);

    // Default specialized agents
    const defaultAgents = [
      {
        id: 'code-reviewer',
        name: 'Code Reviewer',
        description: 'Expert code review specialist for quality, security, and best practices',
        systemPrompt: `You are a code review specialist. Analyze code for:
- Security vulnerabilities
- Performance issues
- Best practices violations
- Code quality and maintainability
- Test coverage
Provide detailed, actionable feedback.`,
        tools: ['Read', 'Grep', 'Glob', 'Bash'],
        expertise: ['security', 'quality', 'testing']
      },
      {
        id: 'planner',
        name: 'Planner',
        description: 'High-level task planning and architecture specialist',
        systemPrompt: `You are a planning specialist. Break down complex tasks into:
- Clear, actionable steps
- Dependency identification
- Risk assessment
- Resource estimation
Provide comprehensive implementation plans.`,
        tools: ['Read', 'Grep', 'Glob'],
        expertise: ['architecture', 'planning']
      },
      {
        id: 'ui-designer',
        name: 'UI Designer',
        description: 'Frontend UI/UX specialist',
        systemPrompt: `You are a UI/UX specialist. Focus on:
- Visual design consistency
- Accessibility standards
- Responsive layouts
- User experience optimization
- Component architecture
Generate beautiful, functional interfaces.`,
        tools: ['Read', 'Write', 'Edit', 'Bash'],
        expertise: ['frontend', 'design', 'accessibility']
      },
      {
        id: 'test-writer',
        name: 'Test Writer',
        description: 'Comprehensive test suite specialist',
        systemPrompt: `You are a testing specialist. Create:
- Unit tests with high coverage
- Integration tests
- Edge case coverage
- Test-driven development approach
Ensure code reliability and correctness.`,
        tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep'],
        expertise: ['testing', 'quality']
      },
      {
        id: 'documentation-writer',
        name: 'Documentation Writer',
        description: 'Technical documentation specialist',
        systemPrompt: `You are a documentation specialist. Write:
- Clear, comprehensive docs
- API references
- Usage examples
- Architecture diagrams
- Setup instructions
Make code accessible and maintainable.`,
        tools: ['Read', 'Write', 'Edit', 'Grep'],
        expertise: ['documentation', 'communication']
      }
    ];

    // Register default agents
    for (const agent of defaultAgents) {
      this.agentRegistry.set(agent.id, agent);
    }

    // Load custom agents from config
    const customConfigPath = path.join(this.agentConfigPath, 'custom.json');
    if (await fs.pathExists(customConfigPath)) {
      const custom = await fs.readJson(customConfigPath);
      for (const agent of custom.agents || []) {
        this.agentRegistry.set(agent.id, agent);
      }
    }
  }

  /**
   * Create a new sub-agent
   */
  async createAgent(config) {
    const { id, name, description, systemPrompt, tools, expertise } = config;

    const agent = {
      id,
      name,
      description,
      systemPrompt,
      tools: tools || [],
      expertise: expertise || [],
      contextWindow: this.contextWindow,
      created: new Date(),
      messageHistory: []
    };

    this.agentRegistry.set(id, agent);
    await this.saveAgentDefinitions();

    this.emit('agent-created', { agentId: id, agent });
    return agent;
  }

  /**
   * Invoke a sub-agent for a task
   */
  async invokeAgent(agentId, task, context = {}) {
    const agentDef = this.agentRegistry.get(agentId);
    if (!agentDef) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Create agent instance if not exists
    if (!this.agents.has(agentId)) {
      const agent = {
        ...agentDef,
        instance: this.createAgentInstance(agentDef),
        activeTask: null,
        messageHistory: []
      };
      this.agents.set(agentId, agent);
    }

    const agent = this.agents.get(agentId);

    // Build refined prompt (main agent mediates)
    const refinedPrompt = this.refinePrompt(task, agentDef, context);

    // Execute task
    const result = await this.executeAgentTask(agent, refinedPrompt, context);

    // Summarize output (main agent filters)
    const summary = this.summarizeOutput(result, agentDef);

    this.emit('agent-completed', { agentId, task, result: summary });

    return {
      agentId,
      raw: result,
      summary,
      timestamp: new Date()
    };
  }

  /**
   * Refine user prompt before sending to sub-agent
   * Main agent adds context and constraints
   */
  refinePrompt(task, agentDef, context) {
    const refinements = [];

    // Add agent expertise context
    if (agentDef.expertise?.length > 0) {
      refinements.push(`Focus on: ${agentDef.expertise.join(', ')}`);
    }

    // Add available tools
    if (agentDef.tools?.length > 0) {
      refinements.push(`Available tools: ${agentDef.tools.join(', ')}`);
    }

    // Add project context
    if (context.projectInfo) {
      refinements.push(`Project: ${context.projectInfo}`);
    }

    // Add constraints
    if (context.constraints) {
      refinements.push(`Constraints: ${context.constraints}`);
    }

    return {
      systemPrompt: agentDef.systemPrompt,
      task,
      refinements,
      context
    };
  }

  /**
   * Summarize sub-agent output (with optional filtering)
   * WARNING: Main agent may "beautify" critical feedback
   */
  summarizeOutput(result, agentDef) {
    // For critical agents (code-reviewer, security), preserve raw output
    const criticalAgents = ['code-reviewer', 'security-specialist'];

    if (criticalAgents.includes(agentDef.id)) {
      // Return unfiltered for critical review
      return {
        type: 'unfiltered',
        content: result,
        warning: 'Critical review - unfiltered output'
      };
    }

    // For other agents, provide cleaned summary
    return {
      type: 'summarized',
      content: this.extractKeySummary(result),
      fullDetails: result
    };
  }

  /**
   * Extract key summary from detailed output
   */
  extractKeySummary(result) {
    // Simple extraction - in production, use LLM to summarize
    if (typeof result === 'string') {
      const lines = result.split('\n');
      return {
        headline: lines[0],
        keyPoints: lines.slice(1, 6),
        fullLength: lines.length
      };
    }
    return result;
  }

  /**
   * Create agent instance
   */
  createAgentInstance(agentDef) {
    return {
      id: agentDef.id,
      name: agentDef.name,
      systemPrompt: agentDef.systemPrompt,
      tools: agentDef.tools,
      contextWindow: agentDef.contextWindow
    };
  }

  /**
   * Execute agent task
   */
  async executeAgentTask(agent, refinedPrompt, context) {
    // Store message in agent's context
    agent.messageHistory.push({
      timestamp: new Date(),
      prompt: refinedPrompt,
      context
    });

    // Trim history to fit context window
    this.trimContextHistory(agent);

    // Execute task (integrate with actual LLM here)
    const result = await this.callAgentLLM(agent, refinedPrompt);

    return result;
  }

  /**
   * Trim context history to fit window
   */
  trimContextHistory(agent) {
    // Simple token estimation
    const avgTokensPerMessage = 1000;
    const maxMessages = Math.floor(agent.contextWindow / avgTokensPerMessage);

    if (agent.messageHistory.length > maxMessages) {
      agent.messageHistory = agent.messageHistory.slice(-maxMessages);
    }
  }

  /**
   * Call LLM for agent (placeholder - integrate with actual LLM)
   */
  async callAgentLLM(agent, refinedPrompt) {
    // This would integrate with Anthropic SDK, Ollama, etc.
    // For now, return structured response
    return {
      agent: agent.name,
      task: refinedPrompt.task,
      response: `[${agent.name} processing task: ${refinedPrompt.task}]`,
      refinements: refinedPrompt.refinements
    };
  }

  /**
   * List all available agents
   */
  listAgents() {
    return Array.from(this.agentRegistry.values());
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId) {
    return this.agentRegistry.get(agentId);
  }

  /**
   * Match task to best agent
   */
  matchAgent(task, keywords = []) {
    const agents = this.listAgents();
    let bestMatch = null;
    let highestScore = 0;

    for (const agent of agents) {
      let score = 0;

      // Match keywords to expertise
      for (const keyword of keywords) {
        if (agent.expertise?.includes(keyword.toLowerCase())) {
          score += 2;
        }
        if (agent.description?.toLowerCase().includes(keyword.toLowerCase())) {
          score += 1;
        }
      }

      // Match task description
      if (agent.description && task.toLowerCase().includes(agent.description.toLowerCase())) {
        score += 1;
      }

      if (score > highestScore) {
        highestScore = score;
        bestMatch = agent;
      }
    }

    return bestMatch;
  }

  /**
   * Save agent definitions to config
   */
  async saveAgentDefinitions() {
    const customAgents = Array.from(this.agentRegistry.values())
      .filter(agent => !['code-reviewer', 'planner', 'ui-designer', 'test-writer', 'documentation-writer'].includes(agent.id));

    if (customAgents.length > 0) {
      const configPath = path.join(this.agentConfigPath, 'custom.json');
      await fs.writeJson(configPath, { agents: customAgents }, { spaces: 2 });
    }
  }

  /**
   * Remove agent
   */
  async removeAgent(agentId) {
    this.agentRegistry.delete(agentId);
    this.agents.delete(agentId);
    await this.saveAgentDefinitions();
    this.emit('agent-removed', { agentId });
  }

  /**
   * Spawn multiple agents in parallel
   */
  async parallelInvoke(tasks) {
    const results = await Promise.all(
      tasks.map(({ agentId, task, context }) =>
        this.invokeAgent(agentId, task, context)
      )
    );
    return results;
  }
}

export default SubAgentManager;
