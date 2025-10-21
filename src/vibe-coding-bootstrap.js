#!/usr/bin/env node

/**
 * Vibe Coding Bootstrap
 * Auto-initializes Vibe Coder's Compass for every Claude Code session
 */

import { ClaudeMemory } from './vibe-coding/ClaudeMemory.js';
import { ProductionValidator } from './vibe-coding/ProductionValidator.js';
import { WorkflowOrchestrator } from './vibe-coding/WorkflowOrchestrator.js';
import { SubAgentOrchestrator } from './vibe-coding/SubAgentOrchestrator.js';
import { HooksSystem } from './vibe-coding/hooks-system.js';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

const CONFIG_PATH = join(
  process.env.HOME || process.env.USERPROFILE,
  '.claude',
  'vibe-coding-config.json'
);

/**
 * Global Vibe Coding System Instance
 */
export class VibeCodeSystem {
  constructor() {
    this.config = null;
    this.memory = null;
    this.validator = null;
    this.workflow = null;
    this.agents = null;
    this.hooks = null;
    this.initialized = false;
  }

  async loadConfig() {
    if (existsSync(CONFIG_PATH)) {
      const content = await readFile(CONFIG_PATH, 'utf-8');
      this.config = JSON.parse(content).vibeCoding;
    } else {
      // Default config
      this.config = {
        enabled: true,
        autoLoad: true,
        components: {
          claudeMemory: { enabled: true, autoInit: true },
          productionValidator: { enabled: true, runOnCommit: true },
          workflowOrchestrator: { enabled: true },
          subAgents: { enabled: true, autoRegister: [] },
          hooks: { enabled: true, autoFormat: true },
        },
      };
    }
    return this.config;
  }

  async init(projectPath = process.cwd()) {
    if (!this.config) {
      await this.loadConfig();
    }

    if (!this.config.enabled) {
      return { enabled: false };
    }

    const results = {
      enabled: true,
      components: {},
    };

    // Initialize CLAUDE.md Memory
    if (this.config.components.claudeMemory?.enabled) {
      this.memory = new ClaudeMemory({ projectRoot: projectPath });
      if (this.config.components.claudeMemory.autoInit) {
        try {
          await this.memory.init(projectPath);
        } catch (e) {
          // Already exists, that's fine
        }
      }
      results.components.claudeMemory = 'initialized';
    }

    // Initialize Production Validator
    if (this.config.components.productionValidator?.enabled) {
      this.validator = new ProductionValidator({ logger: console });
      results.components.productionValidator = 'initialized';
    }

    // Initialize Workflow Orchestrator
    if (this.config.components.workflowOrchestrator?.enabled) {
      this.workflow = new WorkflowOrchestrator({
        projectRoot: projectPath,
        logger: console,
      });
      results.components.workflowOrchestrator = 'initialized';
    }

    // Initialize Sub-Agents
    if (this.config.components.subAgents?.enabled) {
      this.agents = new SubAgentOrchestrator({ logger: console });

      // Auto-register default agents
      const defaultAgents = this.config.components.subAgents.autoRegister || [];
      for (const agentType of defaultAgents) {
        this._registerDefaultAgent(agentType);
      }

      results.components.subAgents = `initialized (${defaultAgents.length} agents)`;
    }

    // Initialize Hooks (optional - skip if fails)
    if (this.config.components.hooks?.enabled) {
      try {
        this.hooks = new HooksSystem();
        results.components.hooks = 'initialized';
      } catch (e) {
        results.components.hooks = 'skipped (not critical)';
      }
    }

    this.initialized = true;
    return results;
  }

  _registerDefaultAgent(type) {
    const agentConfigs = {
      'api-researcher': {
        name: 'api-researcher',
        expertise: 'REST API documentation and specification research',
        systemPrompt: 'Expert in finding and documenting REST API specifications',
        tools: ['read', 'websearch', 'webfetch'],
        readonly: true,
      },
      'db-schema-designer': {
        name: 'db-schema-designer',
        expertise: 'Database architecture, normalization, performance',
        systemPrompt: 'Expert database architect focused on normalization and performance',
        tools: ['read', 'write'],
        readonly: false,
      },
      'test-writer': {
        name: 'test-writer',
        expertise: 'TDD, test coverage, edge case identification',
        systemPrompt: 'Testing expert who writes comprehensive test suites',
        tools: ['read', 'write'],
        readonly: false,
      },
      'code-reviewer': {
        name: 'code-reviewer',
        expertise: 'Code quality, security vulnerabilities, performance',
        systemPrompt: 'Strict code reviewer providing honest, critical feedback',
        tools: ['read', 'grep', 'glob'],
        readonly: true,
      },
      'security-auditor': {
        name: 'security-auditor',
        expertise: 'Security vulnerabilities, defensive coding',
        systemPrompt: 'Security expert identifying vulnerabilities and recommending fixes',
        tools: ['read', 'grep', 'bash'],
        readonly: true,
      },
    };

    const config = agentConfigs[type];
    if (config && this.agents) {
      this.agents.registerAgent(config);
    }
  }

  async validateBeforeCommit(files = []) {
    if (!this.validator || !this.config.components.productionValidator?.runOnCommit) {
      return { skipped: true };
    }

    const results = await this.validator.validate({
      rootDir: process.cwd(),
      files,
    });

    const minScore = this.config.components.productionValidator.minScore || 80;

    return {
      passed: results.passed,
      score: results.score || 100,
      minScore,
      canCommit: (results.score || 100) >= minScore,
      results,
    };
  }

  async runWorkflow(task, requirements = []) {
    if (!this.workflow) {
      throw new Error('Workflow orchestrator not initialized');
    }

    return this.workflow.runFullWorkflow(task, requirements);
  }

  async delegateToAgent(agentName, task, options = {}) {
    if (!this.agents) {
      throw new Error('Sub-agents not initialized');
    }

    return this.agents.invokeAgent(agentName, task, options);
  }

  getStatus() {
    return {
      initialized: this.initialized,
      config: this.config,
      components: {
        memory: !!this.memory,
        validator: !!this.validator,
        workflow: !!this.workflow,
        agents: !!this.agents,
        hooks: !!this.hooks,
      },
    };
  }
}

// Global instance
export const vibeCode = new VibeCodeSystem();

// Auto-initialize if imported
if (process.env.VIBE_CODING_AUTO_INIT !== 'false') {
  vibeCode
    .init()
    .then((results) => {
      if (results.enabled) {
        console.log('🚀 Vibe Coding System initialized');
        console.log('Components:', Object.keys(results.components).join(', '));
      }
    })
    .catch((err) => {
      console.error('Failed to initialize Vibe Coding:', err.message);
    });
}

export default vibeCode;
