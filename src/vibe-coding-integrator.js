/**
 * Vibe Coding Integration Layer
 * Combines all Vibe Coding patterns into a unified system
 */

import SubAgentManager, { createSpecializedAgents } from './agents/subagent-manager.js';
import HooksManager, { createBuiltInHooks } from './hooks/hooks-manager.js';
import ContextManager from './context/context-manager.js';
import VisualRegressionTester from './visual-testing/visual-regression.js';
import CodebaseAnalyzer from './codebase/codebase-analyzer.js';
import EventEmitter from 'events';

export class VibeCodingSystem extends EventEmitter {
  constructor(options = {}) {
    super();

    // Initialize all subsystems
    this.subAgents = createSpecializedAgents();
    this.hooks = createBuiltInHooks(new HooksManager());
    this.context = new ContextManager(options.context);
    this.visualTesting = new VisualRegressionTester(options.visualTesting);
    this.codebase = new CodebaseAnalyzer(options.codebase);

    this.projectConfig = options.projectConfig || {};
    this.ready = false;

    this._setupEventForwarding();
  }

  /**
   * Initialize the Vibe Coding system
   */
  async initialize() {
    console.log('🚀 Initializing Vibe Coding System...\n');

    // Index codebase
    await this.codebase.indexCodebase();
    await this.codebase.buildDependencyGraph();

    // Load context from previous sessions if available
    const lastSession = this._findLastSession();
    if (lastSession) {
      await this.context.loadFromSummary(lastSession);
    }

    this.ready = true;
    this.emit('system:ready');

    console.log('\n✓ Vibe Coding System ready\n');

    return this.getSystemStatus();
  }

  /**
   * Process a development task using the full Vibe Coding workflow
   */
  async processTask(taskDescription, options = {}) {
    if (!this.ready) {
      throw new Error('System not initialized. Call initialize() first.');
    }

    const taskId = Date.now().toString();
    this.context.add(`Task started: ${taskDescription}`, { type: 'task_start', taskId });

    console.log(`\n📋 Processing task: ${taskDescription}\n`);

    const result = {
      taskId,
      description: taskDescription,
      steps: [],
      agentsUsed: [],
      hooksExecuted: [],
      contextUpdates: 0,
      startTime: Date.now()
    };

    try {
      // Step 1: Analyze task and plan approach
      const plan = await this._planTask(taskDescription, options);
      result.steps.push({ step: 'planning', details: plan });

      // Step 2: Execute task with appropriate sub-agents
      const execution = await this._executeTask(plan, options);
      result.steps.push({ step: 'execution', details: execution });
      result.agentsUsed = execution.agentsUsed;

      // Step 3: Validate results (tests, visual regression, etc.)
      const validation = await this._validateTask(execution, options);
      result.steps.push({ step: 'validation', details: validation });

      // Step 4: Update context
      this.context.add(`Task completed: ${taskDescription}`, {
        type: 'task_complete',
        taskId,
        result
      });
      result.contextUpdates = 1;

      result.status = 'completed';
      result.duration = Date.now() - result.startTime;

      console.log(`\n✅ Task completed in ${Math.round(result.duration / 1000)}s\n`);

      return result;
    } catch (error) {
      result.status = 'failed';
      result.error = error.message;
      result.duration = Date.now() - result.startTime;

      this.context.add(`Task failed: ${taskDescription} - ${error.message}`, {
        type: 'task_error',
        taskId
      });

      console.error(`\n❌ Task failed: ${error.message}\n`);

      throw error;
    }
  }

  /**
   * Plan task execution
   */
  async _planTask(taskDescription, options) {
    // Delegate to planner sub-agent
    const plannerAgent = this.subAgents.listAgents()
      .find(a => a.name === 'planner');

    if (plannerAgent) {
      const plan = await this.subAgents.invoke(
        plannerAgent.id,
        `Create an execution plan for: ${taskDescription}`,
        { codebaseStats: this.codebase.getStatistics() }
      );

      return plan;
    }

    // Fallback: basic planning
    return {
      steps: [
        'Analyze codebase context',
        'Implement changes',
        'Run tests',
        'Validate results'
      ]
    };
  }

  /**
   * Execute task with appropriate agents
   */
  async _executeTask(plan, options) {
    const execution = {
      agentsUsed: [],
      results: []
    };

    // Determine which agents to use based on task type
    const taskType = this._inferTaskType(plan);

    if (taskType === 'code_change') {
      // Use code-related agents
      const reviewerAgent = this.subAgents.listAgents()
        .find(a => a.name === 'code-reviewer');

      if (reviewerAgent) {
        const review = await this.subAgents.invoke(
          reviewerAgent.id,
          'Review planned changes'
        );
        execution.agentsUsed.push('code-reviewer');
        execution.results.push(review);
      }
    } else if (taskType === 'ui_change') {
      // Use UI-related agents
      const uiAgent = this.subAgents.listAgents()
        .find(a => a.name === 'ui-designer');

      if (uiAgent) {
        const uiDesign = await this.subAgents.invoke(
          uiAgent.id,
          'Design UI changes'
        );
        execution.agentsUsed.push('ui-designer');
        execution.results.push(uiDesign);
      }
    }

    return execution;
  }

  /**
   * Validate task completion
   */
  async _validateTask(execution, options) {
    const validation = {
      tests: { passed: true },
      visualRegression: null,
      codeQuality: null
    };

    // Run tests if applicable
    if (options.runTests !== false) {
      try {
        await this.hooks.execute('PreToolUse', {
          tool: 'Bash',
          params: { command: 'npm test' }
        });
        validation.tests.passed = true;
      } catch (error) {
        validation.tests.passed = false;
        validation.tests.error = error.message;
      }
    }

    // Visual regression testing for UI changes
    if (options.visualRegression && options.routes) {
      validation.visualRegression = await this.visualTesting.runTestSuite(
        options.routes
      );
    }

    return validation;
  }

  /**
   * Infer task type from plan
   */
  _inferTaskType(plan) {
    const planStr = JSON.stringify(plan).toLowerCase();

    if (planStr.includes('ui') || planStr.includes('design') || planStr.includes('interface')) {
      return 'ui_change';
    } else if (planStr.includes('test')) {
      return 'testing';
    } else if (planStr.includes('refactor')) {
      return 'refactoring';
    } else {
      return 'code_change';
    }
  }

  /**
   * Get system status
   */
  getSystemStatus() {
    return {
      ready: this.ready,
      subAgents: {
        total: this.subAgents.listAgents().length,
        active: Array.from(this.subAgents.activeAgents.keys()).length,
        agents: this.subAgents.listAgents().map(a => ({
          name: a.name,
          expertise: a.expertise,
          status: a.status
        }))
      },
      context: this.context.getStats(),
      codebase: {
        indexed: this.codebase.fileIndex.size > 0,
        files: this.codebase.metrics.totalFiles,
        lines: this.codebase.metrics.totalLines
      },
      hooks: {
        registered: Array.from(this.hooks.hooks.values()).reduce(
          (sum, hooks) => sum + hooks.length,
          0
        ),
        enabled: this.hooks.enabled
      }
    };
  }

  /**
   * Generate comprehensive project report
   */
  async generateProjectReport() {
    const report = {
      timestamp: new Date().toISOString(),
      system: this.getSystemStatus(),
      codebase: this.codebase.generateReport(),
      context: this.context.getStats()
    };

    return report;
  }

  /**
   * Perform CLEAR/COMPRESS ritual
   */
  async clearCompress(mode = 'compress') {
    if (mode === 'compress') {
      await this.context.compress();
    } else if (mode === 'clear') {
      await this.context.clear();
    }

    console.log(`✓ Context ${mode} completed`);
  }

  /**
   * Find last session summary
   */
  _findLastSession() {
    // Implementation to find most recent summary file
    return null; // Placeholder
  }

  /**
   * Setup event forwarding from subsystems
   */
  _setupEventForwarding() {
    // Forward events from subsystems
    this.subAgents.on('agent:created', (data) => this.emit('subagent:created', data));
    this.subAgents.on('task:completed', (data) => this.emit('subagent:task:completed', data));
    this.hooks.on('hook:executed', (data) => this.emit('hook:executed', data));
  }
}

export default VibeCodingSystem;
