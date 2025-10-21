/**
 * Agent Registry - Marketplace for discovering and spawning specialized agents
 * @module registry/agent-registry
 */

import { logger } from '../utils/logger.js';
import { MCPAwareAgent } from '../agents/mcp-aware-agent.js';
import { EventEmitter } from 'events';

export class AgentRegistry extends EventEmitter {
  constructor() {
    super();

    this.agents = new Map();
    this.agentDefinitions = this._initializeAgentDefinitions();
    this.activeAgents = new Map();
  }

  /**
   * Initialize agent definitions (marketplace)
   */
  _initializeAgentDefinitions() {
    return {
      'code-reviewer': {
        name: 'Code Reviewer',
        description: 'Reviews code, suggests improvements, enforces best practices',
        capabilities: ['review', 'suggest', 'lint', 'approve'],
        mcpTools: ['github', 'filesystem', 'git-workflow', 'code-quality'],
        cost: 'low',
        estimatedDuration: 2000,
        specialization: 'code-quality',
        requiredSkills: ['static-analysis', 'code-patterns', 'security-review']
      },
      'deployment-specialist': {
        name: 'Deployment Specialist',
        description: 'Handles deployments, CI/CD, rollbacks, and monitoring',
        capabilities: ['deploy', 'rollback', 'monitor', 'ci-cd'],
        mcpTools: ['github', 'git-workflow', 'rube', 'chrome'],
        cost: 'medium',
        estimatedDuration: 5000,
        specialization: 'devops',
        requiredSkills: ['kubernetes', 'docker', 'ci-cd', 'monitoring']
      },
      'data-analyst': {
        name: 'Data Analyst',
        description: 'Analyzes data, runs queries, generates insights and visualizations',
        capabilities: ['query', 'visualize', 'insights', 'reporting'],
        mcpTools: ['sqlite', 'filesystem', 'rube'],
        cost: 'low',
        estimatedDuration: 3000,
        specialization: 'data-analysis',
        requiredSkills: ['sql', 'data-processing', 'visualization']
      },
      'ui-tester': {
        name: 'UI Tester',
        description: 'Tests UI, takes screenshots, performs visual regression testing',
        capabilities: ['test-ui', 'screenshot', 'visual-regression', 'accessibility'],
        mcpTools: ['chrome', 'puppeteer', 'filesystem'],
        cost: 'medium',
        estimatedDuration: 4000,
        specialization: 'ui-testing',
        requiredSkills: ['browser-automation', 'visual-testing', 'accessibility']
      },
      'integration-specialist': {
        name: 'Integration Specialist',
        description: 'Integrates with external services and APIs (500+ apps via Composio)',
        capabilities: ['integrate', 'api-call', 'webhook', 'sync'],
        mcpTools: ['rube', 'memory', 'filesystem'],
        cost: 'high',
        estimatedDuration: 3000,
        specialization: 'integrations',
        requiredSkills: ['api-design', 'webhooks', 'oauth', 'data-mapping']
      },
      'knowledge-manager': {
        name: 'Knowledge Manager',
        description: 'Manages knowledge graph, memory, and cross-agent learning',
        capabilities: ['remember', 'search', 'relate', 'learn'],
        mcpTools: ['memory', 'filesystem', 'sequential-thinking'],
        cost: 'low',
        estimatedDuration: 2000,
        specialization: 'knowledge-management',
        requiredSkills: ['graph-databases', 'knowledge-graphs', 'semantic-search']
      },
      'bug-fixer': {
        name: 'Bug Fixer',
        description: 'Debugs issues, proposes fixes, runs tests to verify',
        capabilities: ['debug', 'fix', 'test', 'verify'],
        mcpTools: ['github', 'filesystem', 'git-workflow', 'sequential-thinking'],
        cost: 'medium',
        estimatedDuration: 6000,
        specialization: 'debugging',
        requiredSkills: ['debugging', 'root-cause-analysis', 'testing']
      },
      'doc-writer': {
        name: 'Documentation Writer',
        description: 'Writes technical documentation, API docs, and guides',
        capabilities: ['document', 'explain', 'diagram', 'tutorial'],
        mcpTools: ['github', 'filesystem', 'rube'],
        cost: 'low',
        estimatedDuration: 4000,
        specialization: 'documentation',
        requiredSkills: ['technical-writing', 'markdown', 'api-documentation']
      },
      'perf-optimizer': {
        name: 'Performance Optimizer',
        description: 'Optimizes performance, profiles code, reduces resource usage',
        capabilities: ['profile', 'optimize', 'benchmark', 'analyze'],
        mcpTools: ['chrome', 'filesystem', 'sequential-thinking', 'rube'],
        cost: 'high',
        estimatedDuration: 8000,
        specialization: 'performance',
        requiredSkills: ['profiling', 'optimization', 'benchmarking']
      },
      'security-auditor': {
        name: 'Security Auditor',
        description: 'Audits security, finds vulnerabilities, suggests fixes',
        capabilities: ['audit', 'scan', 'report', 'remediate'],
        mcpTools: ['github', 'filesystem', 'code-quality', 'rube'],
        cost: 'medium',
        estimatedDuration: 7000,
        specialization: 'security',
        requiredSkills: ['security-analysis', 'vulnerability-scanning', 'compliance']
      },
      'general-purpose': {
        name: 'General Purpose Agent',
        description: 'Handles general tasks without specific specialization',
        capabilities: ['execute', 'coordinate', 'communicate'],
        mcpTools: ['rube', 'filesystem', 'memory'],
        cost: 'low',
        estimatedDuration: 3000,
        specialization: 'general',
        requiredSkills: ['task-execution', 'coordination']
      }
    };
  }

  /**
   * Spawn new agent
   */
  async spawn(agentType, config = {}) {
    try {
      const definition = this.agentDefinitions[agentType];

      if (!definition) {
        throw new Error(`Unknown agent type: ${agentType}`);
      }

      logger.info('Spawning agent', { agentType, config });

      const agentId = `${agentType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const agentConfig = {
        id: agentId,
        type: agentType,
        name: definition.name,
        description: definition.description,
        capabilities: definition.capabilities,
        mcpTools: config.mcpTools === 'auto' ? definition.mcpTools : (config.mcpTools || definition.mcpTools),
        cost: definition.cost,
        specialization: definition.specialization,
        role: config.role || definition.description,
        sessionId: config.sessionId || null
      };

      const agent = new MCPAwareAgent(agentConfig);
      await agent.connect();

      // Store agent
      this.activeAgents.set(agentId, {
        agent,
        config: agentConfig,
        spawnedAt: new Date(),
        status: 'idle',
        tasksCompleted: 0,
        uptime: 0
      });

      // Start uptime tracking
      this._trackAgentUptime(agentId);

      this.emit('agent_spawned', {
        agentId,
        agentType,
        config: agentConfig
      });

      logger.info('Agent spawned successfully', {
        agentId,
        agentType,
        mcpTools: agentConfig.mcpTools
      });

      return {
        id: agentId,
        type: agentType,
        ...agentConfig,
        status: 'active',
        agent
      };

    } catch (error) {
      logger.error('Failed to spawn agent', {
        agentType,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Track agent uptime
   */
  _trackAgentUptime(agentId) {
    const interval = setInterval(() => {
      const agentData = this.activeAgents.get(agentId);

      if (!agentData) {
        clearInterval(interval);
        return;
      }

      agentData.uptime = Date.now() - agentData.spawnedAt.getTime();
    }, 1000);
  }

  /**
   * List all active agents
   */
  async listAll(filterType = null) {
    const agents = [];

    for (const [id, data] of this.activeAgents.entries()) {
      if (filterType && data.config.type !== filterType) {
        continue;
      }

      agents.push({
        id,
        type: data.config.type,
        name: data.config.name,
        status: data.status,
        capabilities: data.config.capabilities,
        mcpTools: data.config.mcpTools,
        tasksCompleted: data.tasksCompleted,
        uptime: this._formatUptime(data.uptime),
        spawnedAt: data.spawnedAt
      });
    }

    return agents;
  }

  /**
   * Format uptime in human-readable format
   */
  _formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId) {
    const agentData = this.activeAgents.get(agentId);

    if (!agentData) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    return agentData.agent;
  }

  /**
   * Terminate agent
   */
  async terminate(agentId) {
    try {
      const agentData = this.activeAgents.get(agentId);

      if (!agentData) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      logger.info('Terminating agent', { agentId });

      // Disconnect agent
      if (agentData.agent.disconnect) {
        await agentData.agent.disconnect();
      }

      // Remove from registry
      this.activeAgents.delete(agentId);

      this.emit('agent_terminated', { agentId });

      logger.info('Agent terminated', { agentId });

    } catch (error) {
      logger.error('Failed to terminate agent', {
        agentId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Find best agent for task
   */
  async getAgentFor(task) {
    try {
      logger.debug('Finding best agent for task', { task });

      // Analyze task to determine required capabilities
      const requiredCapabilities = this._analyzeTaskRequirements(task);

      // Score each agent type
      const scores = new Map();

      for (const [type, definition] of Object.entries(this.agentDefinitions)) {
        const score = this._scoreAgentForTask(definition, requiredCapabilities);
        scores.set(type, score);
      }

      // Get highest scoring agent type
      let bestType = 'general-purpose';
      let bestScore = 0;

      for (const [type, score] of scores.entries()) {
        if (score > bestScore) {
          bestScore = score;
          bestType = type;
        }
      }

      logger.info('Best agent selected', {
        task,
        agentType: bestType,
        score: bestScore
      });

      return {
        agentType: bestType,
        score: bestScore,
        definition: this.agentDefinitions[bestType]
      };

    } catch (error) {
      logger.error('Failed to find agent for task', {
        task,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Analyze task to determine requirements
   */
  _analyzeTaskRequirements(task) {
    const taskLower = task.toLowerCase();
    const requirements = {
      capabilities: [],
      tools: [],
      keywords: []
    };

    // Capability keywords
    const capabilityMap = {
      review: ['review', 'check', 'audit', 'analyze'],
      deploy: ['deploy', 'release', 'publish', 'ship'],
      test: ['test', 'verify', 'validate'],
      debug: ['debug', 'fix', 'bug', 'error'],
      document: ['document', 'write', 'explain', 'guide'],
      optimize: ['optimize', 'improve', 'performance', 'speed'],
      integrate: ['integrate', 'connect', 'api', 'webhook'],
      query: ['query', 'search', 'find', 'data']
    };

    for (const [capability, keywords] of Object.entries(capabilityMap)) {
      for (const keyword of keywords) {
        if (taskLower.includes(keyword)) {
          requirements.capabilities.push(capability);
          requirements.keywords.push(keyword);
          break;
        }
      }
    }

    // Tool keywords
    if (taskLower.includes('github') || taskLower.includes('code') || taskLower.includes('pr')) {
      requirements.tools.push('github');
    }
    if (taskLower.includes('sql') || taskLower.includes('database') || taskLower.includes('query')) {
      requirements.tools.push('sqlite');
    }
    if (taskLower.includes('ui') || taskLower.includes('browser') || taskLower.includes('screenshot')) {
      requirements.tools.push('chrome');
    }

    return requirements;
  }

  /**
   * Score agent for task
   */
  _scoreAgentForTask(definition, requirements) {
    let score = 0;

    // Score based on capability matches
    for (const reqCap of requirements.capabilities) {
      if (definition.capabilities.includes(reqCap)) {
        score += 10;
      }
    }

    // Score based on tool matches
    for (const reqTool of requirements.tools) {
      if (definition.mcpTools.includes(reqTool)) {
        score += 5;
      }
    }

    // Penalty for high cost
    if (definition.cost === 'high') {
      score -= 2;
    } else if (definition.cost === 'low') {
      score += 1;
    }

    return score;
  }

  /**
   * Get agent definitions (marketplace)
   */
  getMarketplace() {
    return Object.entries(this.agentDefinitions).map(([type, definition]) => ({
      type,
      ...definition
    }));
  }

  /**
   * Get registry statistics
   */
  getStats() {
    const stats = {
      totalDefinitions: Object.keys(this.agentDefinitions).length,
      activeAgents: this.activeAgents.size,
      byType: {},
      totalTasksCompleted: 0
    };

    for (const [, data] of this.activeAgents.entries()) {
      const type = data.config.type;
      stats.byType[type] = (stats.byType[type] || 0) + 1;
      stats.totalTasksCompleted += data.tasksCompleted;
    }

    return stats;
  }
}
