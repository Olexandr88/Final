#!/usr/bin/env node
/**
 * Deployment Orchestrator - Advanced deployment workflow execution
 * Coordinates deploy-workflow-1 and refactor-workflow-1 for complete CI/CD
 */

import WebSocket from 'ws';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';

dotenv.config();

const BRIDGE_WS = process.env.BRIDGE_WS || 'ws://localhost:65028';
const AGENT_ID = 'deployment-orchestrator';

class DeploymentOrchestrator {
  constructor() {
    this.agentId = AGENT_ID;
    this.ws = null;
    this.activeDeployments = new Map();
    this.deploymentHistory = [];
  }

  async connect() {
    logger.info(`🚢 ${this.agentId} connecting...`);
    this.ws = new WebSocket(BRIDGE_WS);

    await new Promise((resolve, reject) => {
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
    });

    this.ws.send(
      JSON.stringify({
        type: 'register',
        clientId: this.agentId,
        role: 'Deployment Orchestration Master',
        labels: ['deployment', 'ci-cd', 'orchestrator', 'production'],
        tools: ['pipeline_execution', 'rollback_management', 'health_monitoring'],
        intents: [
          'pipeline.execute',
          'pipeline.status',
          'deployment.rollback',
          'deployment.validate',
          'refactor.coordinate',
        ],
        maxConcurrentTasks: 5,
      })
    );

    await new Promise((r) => this.ws.once('message', r));
    logger.info(`✅ ${this.agentId} ready\n`);

    this.setupHandlers();
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

    logger.info(`\n📨 Processing: ${intent} from ${from}`);

    try {
      let result;

      switch (intent) {
        case 'pipeline.execute':
          result = await this.executePipeline(payload);
          break;
        case 'pipeline.status':
          result = this.getPipelineStatus(payload);
          break;
        case 'deployment.rollback':
          result = await this.rollback(payload);
          break;
        case 'deployment.validate':
          result = await this.validateDeployment(payload);
          break;
        case 'refactor.coordinate':
          result = await this.coordinateRefactoring(payload);
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
      logger.error('❌ Error:', error.message);
      this.ws.send(
        JSON.stringify({
          type: 'envelope',
          envelope: {
            from: this.agentId,
            to: from,
            intent: 'deployment.error',
            replyTo: id,
            payload: { error: error.message, stack: error.stack },
          },
        })
      );
    }
  }

  /**
   * Execute complete CI/CD pipeline
   */
  async executePipeline(payload) {
    const { pipelineFile, environment = 'staging' } = payload;

    logger.info(`🚀 Executing pipeline: ${pipelineFile || 'default'} → ${environment}`);

    const deploymentId = `deploy-${Date.now()}`;
    const deployment = {
      deploymentId,
      environment,
      startedAt: new Date().toISOString(),
      status: 'running',
      steps: [],
    };

    this.activeDeployments.set(deploymentId, deployment);

    try {
      // Load pipeline definition
      let pipeline;
      if (pipelineFile) {
        const pipelinePath = path.join(process.cwd(), pipelineFile);
        const content = await fs.readFile(pipelinePath, 'utf-8');
        pipeline = JSON.parse(content);
      } else {
        // Default pipeline
        pipeline = this.getDefaultPipeline(environment);
      }

      logger.info(`📋 Pipeline: ${pipeline.name} (${pipeline.steps.length} steps)`);

      // Execute pipeline steps
      for (let i = 0; i < pipeline.steps.length; i++) {
        const step = pipeline.steps[i];

        logger.info(`\n  Step ${i + 1}/${pipeline.steps.length}: ${step.name}`);

        const stepResult = await this.executeStep(step, deployment.steps);

        deployment.steps.push({
          stepIndex: i,
          name: step.name,
          ...stepResult,
        });

        if (stepResult.status !== 'success') {
          throw new Error(`Step "${step.name}" failed: ${stepResult.error}`);
        }
      }

      deployment.status = 'completed';
      deployment.completedAt = new Date().toISOString();

      logger.info(`\n✅ Pipeline completed: ${pipeline.name}\n`);

      this.deploymentHistory.push(deployment);

      return {
        success: true,
        deploymentId,
        environment,
        status: 'completed',
        steps: deployment.steps.length,
        duration: Date.now() - new Date(deployment.startedAt).getTime(),
      };
    } catch (error) {
      deployment.status = 'failed';
      deployment.error = error.message;
      deployment.failedAt = new Date().toISOString();

      logger.error(`\n❌ Pipeline failed: ${error.message}\n`);

      // Attempt rollback if configured
      if (payload.rollbackOnFailure !== false) {
        logger.info('🔄 Initiating automatic rollback...');
        await this.rollback({ deploymentId, reason: error.message });
      }

      return {
        success: false,
        deploymentId,
        status: 'failed',
        error: error.message,
      };
    }
  }

  /**
   * Execute a single pipeline step
   */
  async executeStep(step, previousSteps) {
    const startTime = Date.now();

    // Check dependencies
    if (step.dependsOn) {
      const depResults = previousSteps.filter((s) => step.dependsOn.includes(s.stepIndex));

      if (depResults.some((r) => r.status !== 'success')) {
        return {
          status: 'skipped',
          reason: 'Dependency failed',
        };
      }
    }

    return new Promise((resolve) => {
      const stepId = `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const timeout = step.timeout || 60000;

      // Timeout handler
      const timeoutHandle = setTimeout(() => {
        this.ws.removeListener('message', messageHandler);
        resolve({
          status: 'timeout',
          error: `Step timed out after ${timeout}ms`,
          duration: Date.now() - startTime,
        });
      }, timeout);

      // Send to target agent
      this.ws.send(
        JSON.stringify({
          type: 'envelope',
          envelope: {
            id: stepId,
            from: this.agentId,
            to: step.agent,
            intent: step.intent,
            payload: {
              ...step.payload,
              previousSteps: step.dependsOn
                ? previousSteps.filter((s) => step.dependsOn.includes(s.stepIndex))
                : [],
            },
          },
        })
      );

      // Wait for response
      const messageHandler = (data) => {
        const msg = JSON.parse(data.toString());
        if (Array.isArray(msg) && msg[0] === 'env') {
          const envelope = msg[1];
          if (envelope.replyTo === stepId) {
            clearTimeout(timeoutHandle);
            this.ws.removeListener('message', messageHandler);

            resolve({
              status: 'success',
              result: envelope.payload,
              duration: Date.now() - startTime,
              agent: step.agent,
            });
          }
        }
      };

      this.ws.on('message', messageHandler);
    });
  }

  /**
   * Get default deployment pipeline
   */
  getDefaultPipeline(environment) {
    return {
      name: `Default ${environment} Deployment`,
      steps: [
        {
          name: 'code-analysis',
          agent: 'refactor-workflow-1',
          intent: 'refactor.analyze',
          payload: {
            files: ['src/'],
            metrics: ['complexity', 'maintainability'],
          },
        },
        {
          name: 'deployment',
          agent: 'deploy-workflow-1',
          intent: 'deploy.start',
          payload: {
            environment,
            version: 'latest',
            strategy: 'rolling',
          },
          dependsOn: [0],
        },
        {
          name: 'validation',
          agent: 'api-test-workflow-1',
          intent: 'api.validate',
          payload: {
            environment,
            healthCheck: true,
          },
          dependsOn: [1],
        },
      ],
    };
  }

  /**
   * Coordinate refactoring workflow
   */
  async coordinateRefactoring(payload) {
    const { target, patterns, autoApply = false } = payload;

    logger.info(`🔧 Coordinating refactoring: ${target}`);

    const refactorId = `refactor-${Date.now()}`;

    // Step 1: Analyze code
    const analysisResult = await this.sendToAgent('refactor-workflow-1', 'refactor.analyze', {
      target,
      patterns,
    });

    // Step 2: Generate suggestions
    const suggestionsResult = await this.sendToAgent('refactor-workflow-1', 'refactor.suggest', {
      target,
      patterns,
      analysisResult,
    });

    // Step 3: Auto-apply if enabled
    let applyResult = null;
    if (autoApply) {
      applyResult = await this.sendToAgent('refactor-workflow-1', 'refactor.apply', {
        suggestions: suggestionsResult.suggestions,
      });
    }

    return {
      success: true,
      refactorId,
      analysis: analysisResult,
      suggestions: suggestionsResult,
      applied: applyResult,
      autoApplied: autoApply,
    };
  }

  /**
   * Rollback deployment
   */
  async rollback(payload) {
    const { deploymentId, reason } = payload;

    logger.info(`🔄 Rolling back deployment: ${deploymentId}`);

    const deployment = this.activeDeployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    // Send rollback command
    const rollbackResult = await this.sendToAgent('deploy-workflow-1', 'deploy.rollback', {
      deploymentId,
      environment: deployment.environment,
      reason,
    });

    deployment.status = 'rolled-back';
    deployment.rollbackAt = new Date().toISOString();
    deployment.rollbackReason = reason;

    logger.info(`✅ Rollback completed\n`);

    return {
      success: true,
      deploymentId,
      status: 'rolled-back',
      rollbackResult,
    };
  }

  /**
   * Validate deployment
   */
  async validateDeployment(payload) {
    const { environment, comprehensive = false } = payload;

    logger.info(`🔍 Validating deployment: ${environment}`);

    // Health check
    const healthResult = await this.sendToAgent('deploy-workflow-1', 'deploy.status', {
      environment,
    });

    // API validation
    const apiResult = await this.sendToAgent('api-test-workflow-1', 'api.validate', {
      environment,
      comprehensive,
    });

    const isHealthy = healthResult.status === 'healthy' && apiResult.passed;

    return {
      success: true,
      environment,
      healthy: isHealthy,
      healthCheck: healthResult,
      apiValidation: apiResult,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get pipeline status
   */
  getPipelineStatus(payload) {
    const { deploymentId } = payload;

    const deployment = this.activeDeployments.get(deploymentId);
    if (!deployment) {
      // Check history
      const historical = this.deploymentHistory.find((d) => d.deploymentId === deploymentId);
      if (historical) {
        return {
          found: true,
          ...historical,
          historical: true,
        };
      }
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    return {
      found: true,
      deploymentId,
      status: deployment.status,
      environment: deployment.environment,
      startedAt: deployment.startedAt,
      completedAt: deployment.completedAt,
      steps: deployment.steps.length,
      currentStep: deployment.steps[deployment.steps.length - 1]?.name,
    };
  }

  /**
   * Send message to agent and wait for response
   */
  async sendToAgent(agent, intent, payload) {
    return new Promise((resolve, reject) => {
      const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const timeout = setTimeout(() => {
        this.ws.removeListener('message', handler);
        reject(new Error('Agent response timeout'));
      }, 30000);

      this.ws.send(
        JSON.stringify({
          type: 'envelope',
          envelope: {
            id: messageId,
            from: this.agentId,
            to: agent,
            intent,
            payload,
          },
        })
      );

      const handler = (data) => {
        const msg = JSON.parse(data.toString());
        if (Array.isArray(msg) && msg[0] === 'env') {
          const envelope = msg[1];
          if (envelope.replyTo === messageId) {
            clearTimeout(timeout);
            this.ws.removeListener('message', handler);
            resolve(envelope.payload);
          }
        }
      };

      this.ws.on('message', handler);
    });
  }
}

// Start orchestrator
const orchestrator = new DeploymentOrchestrator();
orchestrator.connect().catch((err) => {
  logger.error('❌ Failed to connect:', err.message);
  process.exit(1);
});

process.on('SIGINT', () => {
  logger.info('\n👋 Shutting down deployment-orchestrator...');
  process.exit(0);
});
