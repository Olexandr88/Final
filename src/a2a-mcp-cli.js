#!/usr/bin/env node

/**
 * A2A MCP CLI - Comprehensive command-line interface for A2A MCP system
 * Integrates all MCP tools with intelligent agent orchestration
 * @module a2a-mcp-cli
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { logger } from './utils/logger.js';
import { MCPAwareAgent } from './agents/mcp-aware-agent.js';
import { SmartOrchestrator } from './orchestration/smart-orchestrator.js';
import { MemorySyncManager } from './memory/memory-sync-manager.js';
import { AgentRegistry } from './registry/agent-registry.js';
import { WorkflowEngine } from './workflows/workflow-engine.js';
import { AutonomousHealer } from './optimization/autonomous-healer.js';

const program = new Command();

program
  .name('a2a-mcp')
  .description('A2A MCP System - Autonomous Multi-Agent Orchestration')
  .version('1.0.0');

/**
 * Agent Management Commands
 */
program
  .command('agent:spawn')
  .description('Spawn a new agent with MCP capabilities')
  .option('-t, --type <type>', 'Agent type (code-reviewer, deployment-specialist, data-analyst)')
  .option('-c, --capabilities <capabilities...>', 'Required capabilities')
  .option('--mcp-tools <tools...>', 'MCP tools to enable')
  .action(async (options) => {
    const spinner = ora('Spawning agent...').start();

    try {
      const registry = new AgentRegistry();

      let agentType = options.type;

      if (!agentType) {
        spinner.stop();
        const answers = await inquirer.prompt([
          {
            type: 'list',
            name: 'agentType',
            message: 'Select agent type:',
            choices: [
              { name: '🔍 Code Reviewer', value: 'code-reviewer' },
              { name: '🚀 Deployment Specialist', value: 'deployment-specialist' },
              { name: '📊 Data Analyst', value: 'data-analyst' },
              { name: '🔧 Bug Fixer', value: 'bug-fixer' },
              { name: '📝 Documentation Writer', value: 'doc-writer' },
              { name: '⚡ Performance Optimizer', value: 'perf-optimizer' }
            ]
          }
        ]);
        agentType = answers.agentType;
        spinner.start();
      }

      const agent = await registry.spawn(agentType, {
        mcpTools: options.mcpTools || 'auto',
        capabilities: options.capabilities || []
      });

      spinner.succeed(chalk.green(`Agent spawned: ${agent.id}`));
      console.log(chalk.cyan('\nAgent Details:'));
      console.log(chalk.white(`  ID: ${agent.id}`));
      console.log(chalk.white(`  Type: ${agentType}`));
      console.log(chalk.white(`  Capabilities: ${agent.capabilities.join(', ')}`));
      console.log(chalk.white(`  MCP Tools: ${agent.mcpTools.join(', ')}`));
      console.log(chalk.white(`  Status: ${agent.status}`));

    } catch (error) {
      spinner.fail(chalk.red('Failed to spawn agent'));
      logger.error('Agent spawn failed', { error: error.message });
      process.exit(1);
    }
  });

program
  .command('agent:list')
  .description('List all active agents')
  .option('-f, --filter <type>', 'Filter by agent type')
  .action(async (options) => {
    const spinner = ora('Fetching agents...').start();

    try {
      const registry = new AgentRegistry();
      const agents = await registry.listAll(options.filter);

      spinner.stop();

      console.log(chalk.cyan(`\n📋 Active Agents (${agents.length}):\n`));

      agents.forEach(agent => {
        const status = agent.status === 'active'
          ? chalk.green('●')
          : agent.status === 'idle'
          ? chalk.yellow('●')
          : chalk.red('●');

        console.log(`${status} ${chalk.white(agent.id)} - ${chalk.cyan(agent.type)}`);
        console.log(chalk.gray(`   Capabilities: ${agent.capabilities.join(', ')}`));
        console.log(chalk.gray(`   Uptime: ${agent.uptime}`));
        console.log();
      });

    } catch (error) {
      spinner.fail(chalk.red('Failed to list agents'));
      logger.error('Agent list failed', { error: error.message });
      process.exit(1);
    }
  });

/**
 * Task Orchestration Commands
 */
program
  .command('task:execute')
  .description('Execute a task using smart agent orchestration')
  .argument('<description>', 'Task description')
  .option('-p, --plan', 'Generate execution plan without executing')
  .option('--parallel', 'Enable parallel execution where possible')
  .option('--difficulty <level>', 'Task difficulty (easy, medium, hard)', 'medium')
  .action(async (description, options) => {
    const spinner = ora('Analyzing task...').start();

    try {
      const orchestrator = new SmartOrchestrator();

      spinner.text = 'Creating execution plan...';
      const plan = await orchestrator.planExecution(description, {
        difficulty: options.difficulty,
        parallel: options.parallel !== false
      });

      if (options.plan) {
        spinner.stop();
        console.log(chalk.cyan('\n📋 Execution Plan:\n'));
        console.log(chalk.white(`Task: ${description}`));
        console.log(chalk.white(`Difficulty: ${plan.difficulty}`));
        console.log(chalk.white(`Estimated Time: ${plan.estimatedTime}`));
        console.log(chalk.white(`Agents Required: ${plan.agents.length}`));
        console.log();

        plan.steps.forEach((step, i) => {
          console.log(chalk.cyan(`Step ${i + 1}: ${step.description}`));
          console.log(chalk.gray(`  Agent: ${step.agentType}`));
          console.log(chalk.gray(`  MCP Tools: ${step.mcpTools.join(', ')}`));
          console.log(chalk.gray(`  Parallel: ${step.parallel ? 'Yes' : 'No'}`));
          console.log();
        });

        return;
      }

      spinner.text = 'Spawning agents...';
      const agents = await orchestrator.spawnAgents(plan);

      spinner.text = 'Executing task...';
      const result = await orchestrator.execute(plan, agents);

      spinner.succeed(chalk.green('Task completed successfully'));

      console.log(chalk.cyan('\n✅ Execution Summary:\n'));
      console.log(chalk.white(`Duration: ${result.duration}ms`));
      console.log(chalk.white(`Steps Completed: ${result.stepsCompleted}/${result.totalSteps}`));
      console.log(chalk.white(`Agents Used: ${result.agentsUsed.length}`));
      console.log();

      if (result.outputs && result.outputs.length > 0) {
        console.log(chalk.cyan('📤 Outputs:\n'));
        result.outputs.forEach((output, i) => {
          console.log(chalk.white(`${i + 1}. ${output.description}`));
          console.log(chalk.gray(`   ${output.value}`));
          console.log();
        });
      }

    } catch (error) {
      spinner.fail(chalk.red('Task execution failed'));
      logger.error('Task execution error', { error: error.message });
      console.error(chalk.red(`\nError: ${error.message}`));
      process.exit(1);
    }
  });

/**
 * Memory Management Commands
 */
program
  .command('memory:sync')
  .description('Synchronize memory across all agents')
  .option('-s, --session <id>', 'Session ID to sync')
  .option('-a, --all', 'Sync all sessions')
  .action(async (options) => {
    const spinner = ora('Synchronizing memory...').start();

    try {
      const memorySync = new MemorySyncManager();

      const result = await memorySync.syncAll({
        sessionId: options.session,
        all: options.all
      });

      spinner.succeed(chalk.green('Memory synchronized'));

      console.log(chalk.cyan('\n💾 Sync Summary:\n'));
      console.log(chalk.white(`Sessions Synced: ${result.sessionsSynced}`));
      console.log(chalk.white(`Agents Updated: ${result.agentsUpdated}`));
      console.log(chalk.white(`Knowledge Items: ${result.knowledgeItems}`));
      console.log(chalk.white(`Duration: ${result.duration}ms`));

    } catch (error) {
      spinner.fail(chalk.red('Memory sync failed'));
      logger.error('Memory sync error', { error: error.message });
      process.exit(1);
    }
  });

program
  .command('memory:search')
  .description('Search agent memory graph')
  .argument('<query>', 'Search query')
  .option('-t, --type <type>', 'Entity type filter')
  .option('-l, --limit <n>', 'Limit results', '10')
  .action(async (query, options) => {
    const spinner = ora('Searching memory...').start();

    try {
      const memorySync = new MemorySyncManager();
      const results = await memorySync.search(query, {
        type: options.type,
        limit: parseInt(options.limit)
      });

      spinner.stop();

      console.log(chalk.cyan(`\n🔍 Search Results (${results.length}):\n`));

      results.forEach((result, i) => {
        console.log(chalk.white(`${i + 1}. ${result.name} (${result.entityType})`));
        result.observations.forEach(obs => {
          console.log(chalk.gray(`   • ${obs}`));
        });
        console.log();
      });

    } catch (error) {
      spinner.fail(chalk.red('Memory search failed'));
      logger.error('Memory search error', { error: error.message });
      process.exit(1);
    }
  });

/**
 * Workflow Commands
 */
program
  .command('workflow:run')
  .description('Run a predefined workflow')
  .argument('<name>', 'Workflow name (feature-development, bug-fix, deployment)')
  .option('-c, --context <json>', 'Workflow context (JSON)')
  .action(async (name, options) => {
    const spinner = ora(`Running workflow: ${name}...`).start();

    try {
      const engine = new WorkflowEngine();

      const context = options.context ? JSON.parse(options.context) : {};

      const result = await engine.run(name, context);

      spinner.succeed(chalk.green('Workflow completed'));

      console.log(chalk.cyan('\n⚡ Workflow Summary:\n'));
      console.log(chalk.white(`Workflow: ${name}`));
      console.log(chalk.white(`Duration: ${result.duration}ms`));
      console.log(chalk.white(`Steps: ${result.stepsCompleted}/${result.totalSteps}`));
      console.log();

      result.steps.forEach(step => {
        const icon = step.status === 'success' ? '✅' : '❌';
        console.log(`${icon} ${chalk.white(step.name)} (${step.duration}ms)`);
        if (step.output) {
          console.log(chalk.gray(`   ${step.output}`));
        }
      });

    } catch (error) {
      spinner.fail(chalk.red('Workflow failed'));
      logger.error('Workflow execution error', { error: error.message });
      process.exit(1);
    }
  });

program
  .command('workflow:list')
  .description('List available workflows')
  .action(async () => {
    const engine = new WorkflowEngine();
    const workflows = engine.listWorkflows();

    console.log(chalk.cyan('\n📋 Available Workflows:\n'));

    workflows.forEach(workflow => {
      console.log(chalk.white(`${workflow.name}`));
      console.log(chalk.gray(`  ${workflow.description}`));
      console.log(chalk.gray(`  Steps: ${workflow.steps.length}`));
      console.log(chalk.gray(`  MCP Tools: ${workflow.mcpTools.join(', ')}`));
      console.log();
    });
  });

/**
 * System Health Commands
 */
program
  .command('health:check')
  .description('Run system health check and auto-heal issues')
  .option('--fix', 'Auto-fix detected issues')
  .action(async (options) => {
    const spinner = ora('Running health check...').start();

    try {
      const healer = new AutonomousHealer();
      const issues = await healer.detectIssues();

      spinner.stop();

      if (issues.length === 0) {
        console.log(chalk.green('\n✅ System is healthy!\n'));
        return;
      }

      console.log(chalk.yellow(`\n⚠️  Found ${issues.length} issues:\n`));

      issues.forEach((issue, i) => {
        const severity = issue.severity === 'critical'
          ? chalk.red('CRITICAL')
          : issue.severity === 'high'
          ? chalk.yellow('HIGH')
          : chalk.blue('MEDIUM');

        console.log(`${i + 1}. [${severity}] ${chalk.white(issue.description)}`);
        console.log(chalk.gray(`   Component: ${issue.component}`));
        console.log(chalk.gray(`   Impact: ${issue.impact}`));
        console.log();
      });

      if (options.fix) {
        const fixSpinner = ora('Auto-healing issues...').start();
        const results = await healer.fixAll(issues);
        fixSpinner.succeed(chalk.green('Auto-healing completed'));

        console.log(chalk.cyan('\n🔧 Fix Summary:\n'));
        console.log(chalk.white(`Issues Fixed: ${results.fixed}/${results.total}`));
        console.log(chalk.white(`Failed: ${results.failed}`));
        console.log(chalk.white(`Duration: ${results.duration}ms`));
      }

    } catch (error) {
      spinner.fail(chalk.red('Health check failed'));
      logger.error('Health check error', { error: error.message });
      process.exit(1);
    }
  });

/**
 * MCP Tools Direct Access
 */
program
  .command('mcp:exec')
  .description('Execute MCP tool directly')
  .argument('<server>', 'MCP server (rube, github, memory, chrome, filesystem)')
  .argument('<tool>', 'Tool name')
  .option('-a, --args <json>', 'Tool arguments (JSON)')
  .action(async (server, tool, options) => {
    const spinner = ora(`Executing ${server}/${tool}...`).start();

    try {
      const agent = new MCPAwareAgent({ mcpTools: [server] });
      await agent.connect();

      const args = options.args ? JSON.parse(options.args) : {};
      const result = await agent.executeMCPTool(server, tool, args);

      spinner.succeed(chalk.green('Tool executed successfully'));

      console.log(chalk.cyan('\n📤 Result:\n'));
      console.log(chalk.white(JSON.stringify(result, null, 2)));

    } catch (error) {
      spinner.fail(chalk.red('Tool execution failed'));
      logger.error('MCP tool error', { error: error.message });
      process.exit(1);
    }
  });

/**
 * Interactive Mode
 */
program
  .command('interactive')
  .alias('i')
  .description('Start interactive mode')
  .action(async () => {
    console.log(chalk.cyan('\n🤖 A2A MCP Interactive Mode\n'));

    const orchestrator = new SmartOrchestrator();
    await orchestrator.initialize();

    console.log(chalk.green('✅ System initialized\n'));

    while (true) {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: '🚀 Execute Task', value: 'task' },
            { name: '🤖 Spawn Agent', value: 'agent' },
            { name: '⚡ Run Workflow', value: 'workflow' },
            { name: '💾 Search Memory', value: 'memory' },
            { name: '🔧 Health Check', value: 'health' },
            { name: '❌ Exit', value: 'exit' }
          ]
        }
      ]);

      if (action === 'exit') {
        console.log(chalk.cyan('\n👋 Goodbye!\n'));
        break;
      }

      // Handle interactive actions
      try {
        switch (action) {
          case 'task':
            const { taskDesc } = await inquirer.prompt([
              { type: 'input', name: 'taskDesc', message: 'Task description:' }
            ]);
            const spinner = ora('Executing task...').start();
            const result = await orchestrator.executeTask(taskDesc);
            spinner.succeed(chalk.green('Task completed'));
            console.log(chalk.white(`\nResult: ${result.summary}\n`));
            break;

          case 'agent':
            // Agent spawn logic
            break;

          // ... other cases
        }
      } catch (error) {
        console.error(chalk.red(`\nError: ${error.message}\n`));
      }
    }
  });

// Error handler
program.exitOverride((err) => {
  if (err.code === 'commander.help' || err.code === 'commander.version') {
    process.exit(0);
  }
  if (err.code !== 'commander.helpDisplayed' && err.code !== 'commander.version') {
    logger.error('CLI error', { error: err.message });
  }
  process.exit(err.exitCode || 1);
});

program.parse();
