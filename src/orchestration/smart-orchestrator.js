/**
 * Smart Orchestrator - AI-powered agent orchestration
 * Uses MCP tools to intelligently plan and execute tasks
 * @module orchestration/smart-orchestrator
 */

import { logger } from '../utils/logger.js';
import { MCPAwareAgent } from '../agents/mcp-aware-agent.js';
import { AgentRegistry } from '../registry/agent-registry.js';

export class SmartOrchestrator {
  constructor() {
    this.registry = new AgentRegistry();
    this.activeExecutions = new Map();
    this.sessionId = null;
  }

  /**
   * Initialize orchestrator
   */
  async initialize() {
    try {
      logger.info('Initializing Smart Orchestrator');

      // Initialize MCP client for planning
      this.plannerAgent = new MCPAwareAgent({
        id: 'orchestrator-planner',
        mcpTools: ['rube', 'sequential-thinking', 'memory']
      });

      await this.plannerAgent.connect();

      logger.info('Smart Orchestrator initialized');

    } catch (error) {
      logger.error('Failed to initialize orchestrator', { error: error.message });
      throw error;
    }
  }

  /**
   * Plan task execution using AI
   */
  async planExecution(taskDescription, options = {}) {
    try {
      logger.info('Planning task execution', { task: taskDescription, options });

      const {
        difficulty = 'medium',
        parallel = true,
        knownFields = ''
      } = options;

      // Step 1: Use sequential thinking for complex analysis
      const thinking = await this._thinkAboutTask(taskDescription, difficulty);

      // Step 2: Search for appropriate tools using Rube
      const toolSearch = await this.plannerAgent.executeWithMCP('search_tools', {
        use_case: taskDescription,
        known_fields: knownFields,
        session: { generate_id: true }
      });

      this.sessionId = toolSearch.session_id;

      // Step 3: Create execution plan if task is complex
      let executionPlan;
      if (difficulty === 'hard' || difficulty === 'medium') {
        executionPlan = await this.plannerAgent.executeWithMCP('create_plan', {
          use_case: taskDescription,
          difficulty,
          known_fields: knownFields,
          primary_tool_slugs: toolSearch.primary_tools || [],
          related_tool_slugs: toolSearch.related_tools || [],
          reasoning: toolSearch.reasoning || '',
          session_id: this.sessionId
        });
      }

      // Step 4: Determine required agents
      const requiredAgents = this._determineRequiredAgents(
        toolSearch,
        executionPlan,
        thinking
      );

      // Step 5: Create execution steps
      const steps = this._createExecutionSteps(
        taskDescription,
        toolSearch,
        executionPlan,
        requiredAgents,
        parallel
      );

      const plan = {
        id: `plan-${Date.now()}`,
        task: taskDescription,
        difficulty,
        parallel,
        sessionId: this.sessionId,
        thinking: thinking.summary,
        agents: requiredAgents,
        steps,
        estimatedTime: this._estimateExecutionTime(steps),
        createdAt: new Date()
      };

      logger.info('Execution plan created', {
        planId: plan.id,
        agents: plan.agents.length,
        steps: plan.steps.length,
        estimatedTime: plan.estimatedTime
      });

      return plan;

    } catch (error) {
      logger.error('Failed to create execution plan', { error: error.message });
      throw error;
    }
  }

  /**
   * Use sequential thinking to analyze task
   */
  async _thinkAboutTask(taskDescription, difficulty) {
    try {
      const thoughts = [];
      let currentThought = 1;
      const totalThoughts = difficulty === 'hard' ? 10 : difficulty === 'medium' ? 5 : 3;
      let nextThoughtNeeded = true;

      while (nextThoughtNeeded && currentThought <= totalThoughts) {
        const thinkingPrompt = currentThought === 1
          ? `Analyze this task: "${taskDescription}". What are the key requirements and challenges?`
          : `Based on previous analysis, what's the next important consideration?`;

        const result = await this.plannerAgent.executeWithMCP('think', {
          thought: thinkingPrompt,
          thoughtNumber: currentThought,
          totalThoughts,
          nextThoughtNeeded: currentThought < totalThoughts
        });

        thoughts.push(result);
        currentThought++;
        nextThoughtNeeded = result.nextThoughtNeeded !== false;
      }

      return {
        thoughts,
        summary: thoughts.map(t => t.thought).join(' → ')
      };

    } catch (error) {
      logger.warn('Sequential thinking failed, using simple analysis', {
        error: error.message
      });

      return {
        thoughts: [],
        summary: `Simple analysis for: ${taskDescription}`
      };
    }
  }

  /**
   * Determine which agents are needed
   */
  _determineRequiredAgents(toolSearch, executionPlan, thinking) {
    const agents = [];
    const toolsNeeded = new Set();

    // Collect all tools from search results
    if (toolSearch.primary_tools) {
      toolSearch.primary_tools.forEach(tool => toolsNeeded.add(tool));
    }
    if (toolSearch.related_tools) {
      toolSearch.related_tools.forEach(tool => toolsNeeded.add(tool));
    }

    // Analyze tools and map to agent types
    const toolToAgentMap = {
      github: 'code-reviewer',
      filesystem: 'file-manager',
      sqlite: 'data-analyst',
      chrome: 'ui-tester',
      rube: 'integration-specialist',
      memory: 'knowledge-manager'
    };

    const agentTypes = new Set();

    for (const tool of toolsNeeded) {
      const toolLower = tool.toLowerCase();

      for (const [toolKey, agentType] of Object.entries(toolToAgentMap)) {
        if (toolLower.includes(toolKey)) {
          agentTypes.add(agentType);
        }
      }
    }

    // Ensure at least one agent
    if (agentTypes.size === 0) {
      agentTypes.add('general-purpose');
    }

    agentTypes.forEach(type => {
      agents.push({
        type,
        mcpTools: this._getToolsForAgentType(type, Array.from(toolsNeeded)),
        role: this._getRoleDescription(type)
      });
    });

    return agents;
  }

  /**
   * Get MCP tools for specific agent type
   */
  _getToolsForAgentType(agentType, availableTools) {
    const toolMappings = {
      'code-reviewer': ['github', 'filesystem', 'git-workflow'],
      'deployment-specialist': ['github', 'git-workflow', 'rube'],
      'data-analyst': ['sqlite', 'filesystem', 'rube'],
      'ui-tester': ['chrome', 'puppeteer', 'filesystem'],
      'integration-specialist': ['rube', 'memory'],
      'knowledge-manager': ['memory', 'filesystem'],
      'file-manager': ['filesystem'],
      'general-purpose': ['rube', 'filesystem', 'memory']
    };

    return toolMappings[agentType] || ['rube'];
  }

  /**
   * Get role description for agent type
   */
  _getRoleDescription(agentType) {
    const roles = {
      'code-reviewer': 'Reviews code, suggests improvements',
      'deployment-specialist': 'Handles deployments and CI/CD',
      'data-analyst': 'Analyzes data and runs queries',
      'ui-tester': 'Tests UI and takes screenshots',
      'integration-specialist': 'Integrates with external services',
      'knowledge-manager': 'Manages knowledge graph and memory',
      'file-manager': 'Handles file operations',
      'general-purpose': 'Handles general tasks'
    };

    return roles[agentType] || 'General task execution';
  }

  /**
   * Create execution steps from plan
   */
  _createExecutionSteps(task, toolSearch, executionPlan, agents, parallel) {
    const steps = [];

    if (executionPlan && executionPlan.workflow_steps) {
      // Use AI-generated workflow steps
      executionPlan.workflow_steps.forEach((step, i) => {
        steps.push({
          id: `step-${i + 1}`,
          name: step.description || step.name || `Step ${i + 1}`,
          agentType: agents[i % agents.length]?.type || 'general-purpose',
          mcpTools: step.tools || [],
          parallel: step.allow_parallel !== false && parallel,
          dependencies: step.dependencies || [],
          estimatedDuration: step.estimated_duration || 1000
        });
      });
    } else {
      // Create simple steps based on agents
      agents.forEach((agent, i) => {
        steps.push({
          id: `step-${i + 1}`,
          name: `Execute ${agent.type} task`,
          agentType: agent.type,
          mcpTools: agent.mcpTools,
          parallel: parallel && i > 0,
          dependencies: i > 0 ? [`step-${i}`] : [],
          estimatedDuration: 2000
        });
      });
    }

    return steps;
  }

  /**
   * Estimate execution time
   */
  _estimateExecutionTime(steps) {
    // Calculate time considering parallel execution
    let maxParallelTime = 0;
    let sequentialTime = 0;

    let currentBatch = [];

    for (const step of steps) {
      if (step.parallel && currentBatch.length > 0) {
        currentBatch.push(step);
      } else {
        // Process previous batch
        if (currentBatch.length > 0) {
          const batchTime = Math.max(...currentBatch.map(s => s.estimatedDuration));
          maxParallelTime += batchTime;
          currentBatch = [];
        }

        if (step.parallel) {
          currentBatch.push(step);
        } else {
          sequentialTime += step.estimatedDuration;
        }
      }
    }

    // Process final batch
    if (currentBatch.length > 0) {
      const batchTime = Math.max(...currentBatch.map(s => s.estimatedDuration));
      maxParallelTime += batchTime;
    }

    return sequentialTime + maxParallelTime;
  }

  /**
   * Spawn agents for execution
   */
  async spawnAgents(plan) {
    try {
      logger.info('Spawning agents for plan', {
        planId: plan.id,
        agentCount: plan.agents.length
      });

      const agents = await Promise.all(
        plan.agents.map(async (agentConfig) => {
          return await this.registry.spawn(agentConfig.type, {
            mcpTools: agentConfig.mcpTools,
            role: agentConfig.role,
            sessionId: plan.sessionId
          });
        })
      );

      logger.info('Agents spawned', {
        planId: plan.id,
        agents: agents.map(a => a.id)
      });

      return agents;

    } catch (error) {
      logger.error('Failed to spawn agents', { error: error.message });
      throw error;
    }
  }

  /**
   * Execute plan with agents
   */
  async execute(plan, agents) {
    try {
      const executionId = `exec-${Date.now()}`;
      const startTime = Date.now();

      logger.info('Starting plan execution', {
        executionId,
        planId: plan.id,
        steps: plan.steps.length
      });

      this.activeExecutions.set(executionId, {
        plan,
        agents,
        startTime,
        status: 'running'
      });

      const stepResults = [];
      const agentMap = new Map(agents.map(a => [a.type, a]));

      // Execute steps (respecting parallel/sequential)
      let currentBatch = [];

      for (const step of plan.steps) {
        if (step.parallel && currentBatch.length > 0) {
          currentBatch.push(step);
        } else {
          // Execute previous batch in parallel
          if (currentBatch.length > 0) {
            const batchResults = await this._executeStepBatch(
              currentBatch,
              agentMap,
              executionId
            );
            stepResults.push(...batchResults);
            currentBatch = [];
          }

          if (step.parallel) {
            currentBatch.push(step);
          } else {
            const result = await this._executeStep(step, agentMap, executionId);
            stepResults.push(result);
          }
        }
      }

      // Execute final batch
      if (currentBatch.length > 0) {
        const batchResults = await this._executeStepBatch(
          currentBatch,
          agentMap,
          executionId
        );
        stepResults.push(...batchResults);
      }

      const duration = Date.now() - startTime;

      const result = {
        executionId,
        planId: plan.id,
        status: 'completed',
        duration,
        stepsCompleted: stepResults.filter(r => r.status === 'success').length,
        totalSteps: plan.steps.length,
        agentsUsed: agents.map(a => a.id),
        outputs: stepResults.map(r => r.output).filter(Boolean)
      };

      this.activeExecutions.delete(executionId);

      logger.info('Plan execution completed', result);

      return result;

    } catch (error) {
      logger.error('Plan execution failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Execute single step
   */
  async _executeStep(step, agentMap, executionId) {
    const startTime = Date.now();

    try {
      logger.debug('Executing step', {
        executionId,
        stepId: step.id,
        stepName: step.name
      });

      const agent = agentMap.get(step.agentType);

      if (!agent) {
        throw new Error(`Agent not found for type: ${step.agentType}`);
      }

      // Execute step using agent
      const output = await agent.executeTask({
        name: step.name,
        mcpTools: step.mcpTools,
        sessionId: executionId
      });

      const duration = Date.now() - startTime;

      return {
        stepId: step.id,
        status: 'success',
        duration,
        output
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Step execution failed', {
        executionId,
        stepId: step.id,
        error: error.message
      });

      return {
        stepId: step.id,
        status: 'failed',
        duration,
        error: error.message
      };
    }
  }

  /**
   * Execute batch of steps in parallel
   */
  async _executeStepBatch(steps, agentMap, executionId) {
    logger.debug('Executing step batch in parallel', {
      executionId,
      batchSize: steps.length
    });

    const results = await Promise.all(
      steps.map(step => this._executeStep(step, agentMap, executionId))
    );

    return results;
  }

  /**
   * Execute task directly (convenience method)
   */
  async executeTask(taskDescription, options = {}) {
    await this.initialize();
    const plan = await this.planExecution(taskDescription, options);
    const agents = await this.spawnAgents(plan);
    return await this.execute(plan, agents);
  }
}
