/**
 * A2A MCP CLI Test Suite
 * @module tests/a2a-mcp-cli
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MCPAwareAgent } from '../src/agents/mcp-aware-agent.js';
import { SmartOrchestrator } from '../src/orchestration/smart-orchestrator.js';
import { MemorySyncManager } from '../src/memory/memory-sync-manager.js';
import { AgentRegistry } from '../src/registry/agent-registry.js';
import { WorkflowEngine } from '../src/workflows/workflow-engine.js';
import { AutonomousHealer } from '../src/optimization/autonomous-healer.js';

describe('A2A MCP CLI System', () => {
  describe('MCPAwareAgent', () => {
    let agent;

    before(async () => {
      agent = new MCPAwareAgent({
        id: 'test-agent',
        mcpTools: ['rube', 'memory', 'github']
      });
    });

    after(async () => {
      if (agent && agent.disconnect) {
        await agent.disconnect();
      }
    });

    it('should initialize with MCP tools', async () => {
      assert.ok(agent);
      assert.strictEqual(agent.id, 'test-agent');
      assert.deepStrictEqual(agent.availableMCPTools, ['rube', 'memory', 'github']);
    });

    it('should connect and initialize MCP clients', async () => {
      await agent.connect();
      assert.ok(agent.mcpClients);
      assert.ok(agent.mcpClients.rube);
      assert.ok(agent.mcpClients.memory);
      assert.ok(agent.mcpClients.github);
    });

    it('should have correct capabilities for each tool', () => {
      const tools = agent.getAvailableTools();
      assert.ok(tools.rube);
      assert.ok(tools.memory);
      assert.ok(tools.github);
    });

    it('should check capability availability', () => {
      assert.strictEqual(agent.hasCapability('rube', 'searchTools'), true);
      assert.strictEqual(agent.hasCapability('memory', 'createEntities'), true);
      assert.strictEqual(agent.hasCapability('unknown', 'test'), false);
    });

    it('should execute MCP tool with intent', async () => {
      const result = await agent.executeWithMCP('search_tools', {
        use_case: 'test task',
        known_fields: ''
      });

      assert.ok(result);
      assert.strictEqual(result.success, true);
    });

    it('should handle unknown intent', async () => {
      await assert.rejects(
        async () => {
          await agent.executeWithMCP('unknown_intent', {});
        },
        {
          message: 'Unknown intent: unknown_intent'
        }
      );
    });
  });

  describe('SmartOrchestrator', () => {
    let orchestrator;

    before(async () => {
      orchestrator = new SmartOrchestrator();
      await orchestrator.initialize();
    });

    it('should initialize successfully', () => {
      assert.ok(orchestrator);
      assert.ok(orchestrator.plannerAgent);
      assert.ok(orchestrator.registry);
    });

    it('should create execution plan for simple task', async () => {
      const plan = await orchestrator.planExecution('Create a new feature', {
        difficulty: 'easy',
        parallel: false
      });

      assert.ok(plan);
      assert.ok(plan.id);
      assert.strictEqual(plan.task, 'Create a new feature');
      assert.strictEqual(plan.difficulty, 'easy');
      assert.ok(plan.steps);
      assert.ok(plan.agents);
    });

    it('should create execution plan for complex task', async () => {
      const plan = await orchestrator.planExecution('Build and deploy full-stack application', {
        difficulty: 'hard',
        parallel: true
      });

      assert.ok(plan);
      assert.strictEqual(plan.difficulty, 'hard');
      assert.strictEqual(plan.parallel, true);
      assert.ok(plan.thinking);
    });

    it('should spawn agents for plan', async () => {
      const plan = {
        id: 'test-plan',
        agents: [
          { type: 'general-purpose', mcpTools: ['rube'], role: 'Test agent' }
        ],
        sessionId: 'test-session'
      };

      const agents = await orchestrator.spawnAgents(plan);

      assert.ok(agents);
      assert.strictEqual(agents.length, 1);
      assert.strictEqual(agents[0].type, 'general-purpose');
    });
  });

  describe('MemorySyncManager', () => {
    let memorySync;

    before(async () => {
      memorySync = new MemorySyncManager();

      // Mock MCP Memory client
      const mockMemoryClient = {
        createEntities: async (params) => ({ success: true }),
        searchNodes: async (params) => ([]),
        readGraph: async () => ({ entities: [], relations: [] })
      };

      await memorySync.initialize(mockMemoryClient);
    });

    it('should initialize successfully', () => {
      assert.ok(memorySync);
      assert.ok(memorySync.mcpMemoryClient);
    });

    it('should sync knowledge across agents', async () => {
      const result = await memorySync.syncAcrossAgents('test-session', {
        task: 'Complete feature',
        result: 'Success',
        insights: 'Learned XYZ'
      });

      assert.ok(result);
      assert.strictEqual(result.success, true);
      assert.ok(result.entitiesCreated > 0);
    });

    it('should search memory', async () => {
      const results = await memorySync.search('test', { limit: 5 });
      assert.ok(Array.isArray(results));
    });

    it('should get stats', () => {
      const stats = memorySync.getStats();
      assert.ok(stats);
      assert.ok(typeof stats.cachedEntities === 'number');
      assert.ok(typeof stats.queueSize === 'number');
    });
  });

  describe('AgentRegistry', () => {
    let registry;

    before(() => {
      registry = new AgentRegistry();
    });

    it('should have predefined agent definitions', () => {
      const marketplace = registry.getMarketplace();
      assert.ok(marketplace);
      assert.ok(marketplace.length > 0);

      const codeReviewer = marketplace.find(a => a.type === 'code-reviewer');
      assert.ok(codeReviewer);
      assert.strictEqual(codeReviewer.name, 'Code Reviewer');
      assert.ok(codeReviewer.capabilities.includes('review'));
    });

    it('should spawn agent', async () => {
      const agent = await registry.spawn('general-purpose', {
        mcpTools: ['rube']
      });

      assert.ok(agent);
      assert.ok(agent.id);
      assert.strictEqual(agent.type, 'general-purpose');
      assert.strictEqual(agent.status, 'active');
    });

    it('should list active agents', async () => {
      const agents = await registry.listAll();
      assert.ok(Array.isArray(agents));
      assert.ok(agents.length > 0);
    });

    it('should filter agents by type', async () => {
      const agents = await registry.listAll('general-purpose');
      assert.ok(Array.isArray(agents));
      agents.forEach(agent => {
        assert.strictEqual(agent.type, 'general-purpose');
      });
    });

    it('should find best agent for task', async () => {
      const match = await registry.getAgentFor('Review code and suggest improvements');
      assert.ok(match);
      assert.strictEqual(match.agentType, 'code-reviewer');
      assert.ok(match.score > 0);
    });

    it('should get registry stats', () => {
      const stats = registry.getStats();
      assert.ok(stats);
      assert.ok(stats.totalDefinitions > 0);
      assert.ok(stats.activeAgents >= 0);
    });
  });

  describe('WorkflowEngine', () => {
    let engine;

    before(() => {
      engine = new WorkflowEngine();
    });

    it('should have predefined workflows', () => {
      const workflows = engine.listWorkflows();
      assert.ok(workflows);
      assert.ok(workflows.length > 0);

      const featureDev = workflows.find(w => w.name === 'feature-development');
      assert.ok(featureDev);
      assert.ok(featureDev.description);
      assert.ok(featureDev.steps.length > 0);
    });

    it('should get workflow definition', () => {
      const workflow = engine.getWorkflow('bug-fix');
      assert.ok(workflow);
      assert.strictEqual(workflow.name, 'Bug Fix');
      assert.ok(workflow.steps);
    });

    it('should run workflow', async () => {
      const result = await engine.run('data-analysis', {
        tableName: 'test_table',
        sqlQuery: 'SELECT * FROM test_table LIMIT 10',
        outputPath: './test-results.json'
      });

      assert.ok(result);
      assert.strictEqual(result.workflow, 'data-analysis');
      assert.ok(result.steps);
    });

    it('should get active workflows', () => {
      const active = engine.getActiveWorkflows();
      assert.ok(Array.isArray(active));
    });

    it('should add custom workflow', () => {
      engine.addWorkflow('custom-test', {
        name: 'Custom Test',
        description: 'Custom workflow for testing',
        mcpTools: ['rube'],
        steps: [
          {
            name: 'Test step',
            mcp: 'rube',
            tool: 'searchTools',
            parallel: false,
            getParams: () => ({})
          }
        ]
      });

      const workflow = engine.getWorkflow('custom-test');
      assert.ok(workflow);
      assert.strictEqual(workflow.name, 'Custom Test');
    });
  });

  describe('AutonomousHealer', () => {
    let healer;

    before(async () => {
      healer = new AutonomousHealer();
      await healer.initialize();
    });

    it('should initialize successfully', () => {
      assert.ok(healer);
      assert.ok(healer.agent);
      assert.strictEqual(healer.autoFixEnabled, true);
    });

    it('should detect issues', async () => {
      const issues = await healer.detectIssues();
      assert.ok(Array.isArray(issues));
    });

    it('should categorize issues by severity', async () => {
      const issues = await healer.detectIssues();

      issues.forEach(issue => {
        assert.ok(['critical', 'high', 'medium', 'low'].includes(issue.severity));
        assert.ok(issue.type);
        assert.ok(issue.description);
        assert.ok(issue.component);
      });
    });

    it('should get healer stats', () => {
      const stats = healer.getStats();
      assert.ok(stats);
      assert.ok(typeof stats.knownPatterns === 'number');
      assert.strictEqual(stats.autoFixEnabled, true);
    });

    it('should enable/disable auto-fix', () => {
      healer.setAutoFix(false);
      assert.strictEqual(healer.autoFixEnabled, false);

      healer.setAutoFix(true);
      assert.strictEqual(healer.autoFixEnabled, true);
    });

    it('should fix issues when auto-fix enabled', async () => {
      const mockIssues = [
        {
          id: 'test-issue-1',
          type: 'performance',
          severity: 'medium',
          component: 'rendering',
          description: 'Test performance issue',
          suggestedFix: 'Test fix'
        }
      ];

      const result = await healer.fixAll(mockIssues);
      assert.ok(result);
      assert.ok(typeof result.fixed === 'number');
      assert.ok(typeof result.failed === 'number');
      assert.strictEqual(result.total, mockIssues.length);
    });
  });

  describe('Integration Tests', () => {
    it('should orchestrate task with multiple agents', async () => {
      const orchestrator = new SmartOrchestrator();
      await orchestrator.initialize();

      const result = await orchestrator.executeTask('Analyze code and create report', {
        difficulty: 'medium',
        parallel: true
      });

      assert.ok(result);
      assert.strictEqual(result.status, 'completed');
      assert.ok(result.agentsUsed);
      assert.ok(result.duration);
    });

    it('should sync memory and execute workflow', async () => {
      const memorySync = new MemorySyncManager();
      const mockMemoryClient = {
        createEntities: async () => ({ success: true }),
        searchNodes: async () => ([]),
        readGraph: async () => ({ entities: [], relations: [] })
      };
      await memorySync.initialize(mockMemoryClient);

      const engine = new WorkflowEngine();

      // Sync knowledge
      await memorySync.syncAcrossAgents('integration-test', {
        task: 'Run workflow',
        workflow: 'data-analysis'
      });

      // Run workflow
      const result = await engine.run('data-analysis', {
        tableName: 'users',
        sqlQuery: 'SELECT COUNT(*) FROM users',
        outputPath: './user-count.json'
      });

      assert.ok(result);
      assert.strictEqual(result.status, 'completed');
    });
  });
});
