#!/usr/bin/env node
/**
 * Workflow Coordinator - Orchestrates multi-agent workflows
 * Manages complex task pipelines with dependency resolution
 */

import WebSocket from 'ws';
import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';

dotenv.config();

const BRIDGE_WS = process.env.BRIDGE_WS || 'ws://localhost:65028';
const AGENT_ID = 'workflow-coordinator';

class WorkflowCoordinator {
  constructor() {
    this.agentId = AGENT_ID;
    this.ws = null;
    this.workflows = new Map();
    this.agentCapabilities = new Map();
  }

  async connect() {
    logger.info(`🎯 ${this.agentId} connecting...`);
    this.ws = new WebSocket(BRIDGE_WS);

    await new Promise((resolve, reject) => {
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
    });

    this.ws.send(
      JSON.stringify({
        type: 'register',
        clientId: this.agentId,
        role: 'Workflow Orchestrator',
        labels: ['coordinator', 'orchestrator', 'workflow-manager'],
        tools: ['workflow_orchestration', 'dependency_resolution', 'task_routing'],
        intents: [
          'workflow.create',
          'workflow.execute',
          'workflow.status',
          'workflow.cancel',
          'agent.discover',
        ],
        maxConcurrentTasks: 20,
      })
    );

    await new Promise((r) => this.ws.once('message', r));
    logger.info(`✅ ${this.agentId} ready\n`);

    this.setupHandlers();
    await this.discoverAgents();
  }

  setupHandlers() {
    this.ws.on('message', async (data) => {
      const msg = JSON.parse(data.toString());
      if (Array.isArray(msg) && msg[0] === 'env') {
        await this.handleEnvelope(msg[1]);
      }
    });

    this.ws.on('close', () => {
      logger.info('🔌 Disconnected - reconnecting...');
      setTimeout(() => this.connect(), 5000);
    });

    this.ws.on('error', (err) => {
      logger.error('❌ WebSocket error:', err.message);
    });

    setInterval(() => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 60000);
  }

  async handleEnvelope(envelope) {
    const { from, intent, payload, id } = envelope;

    logger.info(`\n📨 Processing request: ${intent} from ${from}`);

    try {
      let result;

      switch (intent) {
        case 'workflow.create':
          result = await this.createWorkflow(payload);
          break;
        case 'workflow.execute':
          result = await this.executeWorkflow(payload);
          break;
        case 'workflow.status':
          result = this.getWorkflowStatus(payload);
          break;
        case 'workflow.cancel':
          result = await this.cancelWorkflow(payload);
          break;
        case 'agent.discover':
          result = await this.discoverAgents();
          break;
        default:
          result = { error: 'Unknown intent' };
      }

      this.ws.send(
        JSON.stringify({
          type: 'envelope',
          envelope: {
            from: this.agentId,
            to: from,
            intent: `${intent}.result`,
            replyTo: id,
            payload: result,
          },
        })
      );
    } catch (error) {
      logger.error('❌ Error processing task:', error.message);
      this.ws.send(
        JSON.stringify({
          type: 'envelope',
          envelope: {
            from: this.agentId,
            to: from,
            intent: 'workflow.error',
            replyTo: id,
            payload: { error: error.message },
          },
        })
      );
    }
  }

  /**
   * Discover available agents and their capabilities
   */
  async discoverAgents() {
    logger.info('🔍 Discovering available agents...');

    // Query meta-agent-factory for available agents
    const discoveryId = `discovery-${Date.now()}`;

    this.ws.send(
      JSON.stringify({
        type: 'envelope',
        envelope: {
          id: discoveryId,
          from: this.agentId,
          to: 'meta-agent-factory',
          intent: 'agent.list',
          payload: {},
        },
      })
    );

    // Store known agent capabilities
    this.agentCapabilities.set('data-proc-workflow-1', {
      type: 'data-processor',
      capabilities: ['json_transform', 'csv_parse', 'data_validation'],
    });

    this.agentCapabilities.set('test-gen-workflow-1', {
      type: 'test-generator',
      capabilities: ['unit_test_gen', 'integration_test_gen', 'e2e_test_gen'],
    });

    this.agentCapabilities.set('deploy-workflow-1', {
      type: 'deployment-agent',
      capabilities: ['docker_build', 'k8s_deploy', 'ci_cd_trigger'],
    });

    this.agentCapabilities.set('refactor-workflow-1', {
      type: 'refactoring-agent',
      capabilities: ['extract_method', 'rename_variable', 'optimize_imports'],
    });

    this.agentCapabilities.set('api-test-workflow-1', {
      type: 'api-tester',
      capabilities: ['rest_test', 'graphql_test', 'load_test'],
    });

    logger.info(`✓ Discovered ${this.agentCapabilities.size} agents\n`);

    return {
      agents: Array.from(this.agentCapabilities.entries()).map(([name, info]) => ({
        name,
        ...info,
      })),
    };
  }

  /**
   * Create a new workflow definition
   */
  async createWorkflow(payload) {
    const { workflowId, name, description, steps } = payload;

    logger.info(`🔨 Creating workflow: ${name}`);

    const workflow = {
      workflowId: workflowId || `workflow-${Date.now()}`,
      name,
      description,
      steps, // Array of { agent, intent, payload, dependsOn }
      status: 'created',
      createdAt: new Date().toISOString(),
      results: [],
    };

    this.workflows.set(workflow.workflowId, workflow);

    logger.info(`✓ Workflow created: ${workflow.workflowId}\n`);

    return {
      success: true,
      workflowId: workflow.workflowId,
      steps: workflow.steps.length,
    };
  }

  /**
   * Execute a workflow with dependency resolution
   */
  async executeWorkflow(payload) {
    const { workflowId } = payload;

    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    logger.info(`🚀 Executing workflow: ${workflow.name}`);

    workflow.status = 'running';
    workflow.startedAt = new Date().toISOString();

    try {
      // Execute steps with dependency resolution
      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];

        logger.info(`  Step ${i + 1}/${workflow.steps.length}: ${step.intent} → ${step.agent}`);

        // Check dependencies
        if (step.dependsOn) {
          const depResults = workflow.results.filter((r) => step.dependsOn.includes(r.stepIndex));

          if (depResults.some((r) => r.status !== 'success')) {
            throw new Error(`Dependency failed for step ${i + 1}`);
          }
        }

        // Execute step
        const stepResult = await this.executeStep(step, workflow.results);

        workflow.results.push({
          stepIndex: i,
          ...stepResult,
        });

        if (stepResult.status !== 'success') {
          throw new Error(`Step ${i + 1} failed: ${stepResult.error}`);
        }
      }

      workflow.status = 'completed';
      workflow.completedAt = new Date().toISOString();

      logger.info(`✅ Workflow completed: ${workflow.name}\n`);

      return {
        success: true,
        workflowId,
        status: 'completed',
        results: workflow.results,
      };
    } catch (error) {
      workflow.status = 'failed';
      workflow.error = error.message;
      workflow.failedAt = new Date().toISOString();

      logger.error(`❌ Workflow failed: ${error.message}\n`);

      return {
        success: false,
        workflowId,
        status: 'failed',
        error: error.message,
      };
    }
  }

  /**
   * Execute a single workflow step
   */
  async executeStep(step, previousResults) {
    return new Promise((resolve) => {
      const stepId = `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Merge previous results into payload if needed
      const enhancedPayload = {
        ...step.payload,
        previousResults: step.dependsOn
          ? previousResults.filter((r) => step.dependsOn.includes(r.stepIndex))
          : [],
      };

      // Send message to target agent
      this.ws.send(
        JSON.stringify({
          type: 'envelope',
          envelope: {
            id: stepId,
            from: this.agentId,
            to: step.agent,
            intent: step.intent,
            payload: enhancedPayload,
          },
        })
      );

      // Wait for response (with timeout)
      const timeout = setTimeout(() => {
        resolve({
          status: 'timeout',
          error: 'Step execution timed out',
        });
      }, 30000);

      const messageHandler = (data) => {
        const msg = JSON.parse(data.toString());
        if (Array.isArray(msg) && msg[0] === 'env') {
          const envelope = msg[1];
          if (envelope.replyTo === stepId) {
            clearTimeout(timeout);
            this.ws.removeListener('message', messageHandler);

            resolve({
              status: 'success',
              result: envelope.payload,
            });
          }
        }
      };

      this.ws.on('message', messageHandler);
    });
  }

  /**
   * Get workflow status
   */
  getWorkflowStatus(payload) {
    const { workflowId } = payload;

    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    return {
      workflowId,
      name: workflow.name,
      status: workflow.status,
      steps: workflow.steps.length,
      completedSteps: workflow.results.length,
      createdAt: workflow.createdAt,
      startedAt: workflow.startedAt,
      completedAt: workflow.completedAt,
      error: workflow.error,
    };
  }

  /**
   * Cancel running workflow
   */
  async cancelWorkflow(payload) {
    const { workflowId } = payload;

    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    if (workflow.status !== 'running') {
      throw new Error(`Cannot cancel workflow in status: ${workflow.status}`);
    }

    workflow.status = 'cancelled';
    workflow.cancelledAt = new Date().toISOString();

    logger.info(`🛑 Workflow cancelled: ${workflow.name}\n`);

    return {
      success: true,
      workflowId,
      status: 'cancelled',
    };
  }
}

// Start coordinator
const coordinator = new WorkflowCoordinator();
coordinator.connect().catch((err) => {
  logger.error('❌ Failed to connect:', err.message);
  process.exit(1);
});

process.on('SIGINT', () => {
  logger.info('\n👋 Shutting down workflow-coordinator...');
  process.exit(0);
});
