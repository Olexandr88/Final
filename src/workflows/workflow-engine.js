/**
 * Workflow Engine - Predefined workflow templates with MCP tools
 * @module workflows/workflow-engine
 */

import { logger } from '../utils/logger.js';
import { MCPAwareAgent } from '../agents/mcp-aware-agent.js';

export class WorkflowEngine {
  constructor() {
    this.workflows = this._initializeWorkflows();
    this.activeWorkflows = new Map();
  }

  /**
   * Initialize predefined workflows
   */
  _initializeWorkflows() {
    return {
      'feature-development': {
        name: 'Feature Development',
        description: 'Complete feature development workflow from branch to PR',
        mcpTools: ['github', 'git-workflow', 'filesystem', 'rube', 'chrome'],
        steps: [
          {
            name: 'Create feature branch',
            mcp: 'git-workflow',
            tool: 'create_branch',
            parallel: false,
            getParams: (context) => ({
              branch: `feature/${context.featureName || 'new-feature'}`,
              checkout: true,
              fetch: true
            })
          },
          {
            name: 'Search for required tools',
            mcp: 'rube',
            tool: 'searchTools',
            parallel: false,
            getParams: (context) => ({
              use_case: context.description || 'Feature development',
              known_fields: context.knownFields || '',
              session: { generate_id: true }
            })
          },
          {
            name: 'Execute implementation in parallel',
            mcp: 'rube',
            tool: 'multiExecute',
            parallel: true,
            getParams: (context, prevResults) => {
              const tools = prevResults[1]?.primary_tools || [];
              return {
                tools: tools.map(slug => ({
                  tool_slug: slug,
                  arguments: context.toolArgs || {}
                })),
                sync_response_to_workbench: true,
                session_id: prevResults[1]?.session_id
              };
            }
          },
          {
            name: 'Create pull request',
            mcp: 'github',
            tool: 'createPullRequest',
            parallel: false,
            getParams: (context) => ({
              owner: context.owner || 'Scarmonit',
              repo: context.repo || 'LLM',
              title: context.title || 'New feature',
              head: `feature/${context.featureName || 'new-feature'}`,
              base: 'main',
              body: context.description || 'Feature implementation',
              draft: context.draft || false
            })
          },
          {
            name: 'Take screenshot for verification',
            mcp: 'chrome',
            tool: 'takeScreenshot',
            parallel: false,
            getParams: (context) => ({
              name: `feature-${context.featureName || 'new'}-screenshot`,
              fullPage: true
            }),
            optional: true
          }
        ]
      },
      'bug-fix': {
        name: 'Bug Fix',
        description: 'Systematic bug fixing workflow with analysis and verification',
        mcpTools: ['sequential-thinking', 'github', 'filesystem', 'git-workflow'],
        steps: [
          {
            name: 'Analyze bug with sequential thinking',
            mcp: 'sequential-thinking',
            tool: 'think',
            parallel: false,
            getParams: (context) => ({
              thought: `Analyze this bug: ${context.bugDescription}`,
              thoughtNumber: 1,
              totalThoughts: 5,
              nextThoughtNeeded: true
            })
          },
          {
            name: 'Search codebase for bug location',
            mcp: 'github',
            tool: 'searchCode',
            parallel: false,
            getParams: (context) => ({
              query: context.searchQuery || context.bugDescription,
              sort: 'indexed',
              order: 'desc'
            })
          },
          {
            name: 'Create fix branch',
            mcp: 'git-workflow',
            tool: 'create_branch',
            parallel: false,
            getParams: (context) => ({
              branch: `fix/${context.bugId || 'bug-fix'}`,
              checkout: true
            })
          },
          {
            name: 'Edit files to fix bug',
            mcp: 'filesystem',
            tool: 'editFile',
            parallel: true,
            getParams: (context) => ({
              path: context.filePath,
              edits: context.edits || [],
              dryRun: false
            })
          },
          {
            name: 'Create pull request with fix',
            mcp: 'github',
            tool: 'createPullRequest',
            parallel: false,
            getParams: (context, prevResults) => ({
              owner: context.owner || 'Scarmonit',
              repo: context.repo || 'LLM',
              title: `Fix: ${context.bugDescription}`,
              head: `fix/${context.bugId || 'bug-fix'}`,
              base: 'main',
              body: `Fixes bug:\n\n${context.bugDescription}\n\nAnalysis:\n${prevResults[0]?.summary || 'N/A'}`
            })
          }
        ]
      },
      'deployment': {
        name: 'Deployment',
        description: 'Automated deployment workflow with health checks',
        mcpTools: ['github', 'git-workflow', 'rube', 'chrome'],
        steps: [
          {
            name: 'Check git status',
            mcp: 'git-workflow',
            tool: 'checkStatus',
            parallel: false,
            getParams: () => ({
              includeStagedDiff: true
            })
          },
          {
            name: 'Analyze recent commits',
            mcp: 'git-workflow',
            tool: 'analyzeCommits',
            parallel: false,
            getParams: () => ({
              count: 10,
              includeStats: true
            })
          },
          {
            name: 'Execute deployment via Rube',
            mcp: 'rube',
            tool: 'multiExecute',
            parallel: false,
            getParams: (context) => ({
              tools: [{
                tool_slug: context.deployTool || 'GITHUB_CREATE_DEPLOYMENT',
                arguments: context.deployArgs || {}
              }],
              sync_response_to_workbench: false
            })
          },
          {
            name: 'Performance trace',
            mcp: 'chrome',
            tool: 'performanceStartTrace',
            parallel: false,
            getParams: () => ({
              reload: true,
              autoStop: true
            })
          },
          {
            name: 'Create release tag',
            mcp: 'git-workflow',
            tool: 'tagRelease',
            parallel: false,
            getParams: (context) => ({
              tag: context.version || `v${new Date().toISOString().split('T')[0]}`,
              message: context.releaseNotes || 'Automated release',
              push: true
            })
          }
        ]
      },
      'code-review': {
        name: 'Code Review',
        description: 'Comprehensive code review workflow',
        mcpTools: ['github', 'code-quality', 'sequential-thinking', 'memory'],
        steps: [
          {
            name: 'Get pull request details',
            mcp: 'github',
            tool: 'pull_request_read',
            parallel: false,
            getParams: (context) => ({
              owner: context.owner || 'Scarmonit',
              repo: context.repo || 'LLM',
              pullNumber: context.prNumber,
              method: 'get'
            })
          },
          {
            name: 'Get PR diff',
            mcp: 'github',
            tool: 'pull_request_read',
            parallel: false,
            getParams: (context) => ({
              owner: context.owner || 'Scarmonit',
              repo: context.repo || 'LLM',
              pullNumber: context.prNumber,
              method: 'get_diff'
            })
          },
          {
            name: 'Analyze code with sequential thinking',
            mcp: 'sequential-thinking',
            tool: 'think',
            parallel: false,
            getParams: (context, prevResults) => ({
              thought: `Review this code change: ${JSON.stringify(prevResults[1])}`,
              thoughtNumber: 1,
              totalThoughts: 7,
              nextThoughtNeeded: true
            })
          },
          {
            name: 'Store review in memory',
            mcp: 'memory',
            tool: 'createEntities',
            parallel: false,
            getParams: (context, prevResults) => ({
              entities: [{
                name: `review-${context.prNumber}`,
                entityType: 'CodeReview',
                observations: [
                  `PR #${context.prNumber}`,
                  `Analysis: ${prevResults[2]?.summary || 'Complete'}`,
                  `Timestamp: ${new Date().toISOString()}`
                ]
              }]
            })
          },
          {
            name: 'Create review comment',
            mcp: 'github',
            tool: 'pull_request_review_write',
            parallel: false,
            getParams: (context, prevResults) => ({
              owner: context.owner || 'Scarmonit',
              repo: context.repo || 'LLM',
              pullNumber: context.prNumber,
              method: 'create',
              body: context.reviewComment || 'Code review completed',
              event: context.approvalStatus || 'COMMENT'
            })
          }
        ]
      },
      'data-analysis': {
        name: 'Data Analysis',
        description: 'Query database and generate insights',
        mcpTools: ['sqlite', 'rube', 'filesystem'],
        steps: [
          {
            name: 'List database tables',
            mcp: 'sqlite',
            tool: 'listTables',
            parallel: false,
            getParams: () => ({})
          },
          {
            name: 'Describe target table',
            mcp: 'sqlite',
            tool: 'describeTable',
            parallel: false,
            getParams: (context) => ({
              table_name: context.tableName
            })
          },
          {
            name: 'Execute analysis query',
            mcp: 'sqlite',
            tool: 'readQuery',
            parallel: false,
            getParams: (context) => ({
              query: context.sqlQuery
            })
          },
          {
            name: 'Write results to file',
            mcp: 'filesystem',
            tool: 'writeFile',
            parallel: false,
            getParams: (context, prevResults) => ({
              path: context.outputPath || './analysis-results.json',
              content: JSON.stringify(prevResults[2], null, 2)
            })
          }
        ]
      },
      'ui-testing': {
        name: 'UI Testing',
        description: 'Automated UI testing with screenshots and performance',
        mcpTools: ['chrome', 'puppeteer', 'filesystem'],
        steps: [
          {
            name: 'Navigate to page',
            mcp: 'chrome',
            tool: 'navigate',
            parallel: false,
            getParams: (context) => ({
              url: context.url,
              timeout: 30000
            })
          },
          {
            name: 'Take snapshot',
            mcp: 'chrome',
            tool: 'takeSnapshot',
            parallel: false,
            getParams: () => ({})
          },
          {
            name: 'Take screenshot',
            mcp: 'chrome',
            tool: 'takeScreenshot',
            parallel: true,
            getParams: (context) => ({
              name: `ui-test-${Date.now()}`,
              fullPage: true,
              format: 'png'
            })
          },
          {
            name: 'Performance trace',
            mcp: 'chrome',
            tool: 'performanceStartTrace',
            parallel: false,
            getParams: () => ({
              reload: false,
              autoStop: true
            })
          }
        ]
      }
    };
  }

  /**
   * Run workflow
   */
  async run(workflowName, context = {}) {
    const startTime = Date.now();

    try {
      const workflow = this.workflows[workflowName];

      if (!workflow) {
        throw new Error(`Unknown workflow: ${workflowName}`);
      }

      logger.info('Running workflow', {
        workflow: workflowName,
        steps: workflow.steps.length,
        context
      });

      const workflowId = `workflow-${Date.now()}`;

      this.activeWorkflows.set(workflowId, {
        name: workflowName,
        startTime,
        status: 'running',
        currentStep: 0
      });

      // Initialize MCP agent with required tools
      const agent = new MCPAwareAgent({
        id: `workflow-agent-${workflowId}`,
        mcpTools: workflow.mcpTools
      });

      await agent.connect();

      const stepResults = [];
      const prevResults = [];

      // Execute steps
      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];

        try {
          const stepStartTime = Date.now();

          logger.debug('Executing workflow step', {
            workflowId,
            stepIndex: i,
            stepName: step.name
          });

          // Get step parameters
          const params = step.getParams(context, prevResults);

          // Execute step
          const result = await agent.executeMCPTool(step.mcp, step.tool, params);

          const stepDuration = Date.now() - stepStartTime;

          stepResults.push({
            name: step.name,
            status: 'success',
            duration: stepDuration,
            output: result?.message || 'Step completed'
          });

          prevResults.push(result);

        } catch (error) {
          const stepDuration = Date.now() - stepStartTime;

          logger.error('Workflow step failed', {
            workflowId,
            step: step.name,
            error: error.message
          });

          if (step.optional) {
            stepResults.push({
              name: step.name,
              status: 'skipped',
              duration: stepDuration,
              output: `Skipped (optional): ${error.message}`
            });
            prevResults.push(null);
          } else {
            stepResults.push({
              name: step.name,
              status: 'failed',
              duration: stepDuration,
              output: error.message
            });

            throw error;
          }
        }
      }

      const duration = Date.now() - startTime;

      const result = {
        workflowId,
        workflow: workflowName,
        status: 'completed',
        duration,
        stepsCompleted: stepResults.filter(s => s.status === 'success').length,
        totalSteps: workflow.steps.length,
        steps: stepResults
      };

      this.activeWorkflows.delete(workflowId);

      logger.info('Workflow completed', result);

      return result;

    } catch (error) {
      logger.error('Workflow failed', {
        workflow: workflowName,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * List available workflows
   */
  listWorkflows() {
    return Object.entries(this.workflows).map(([name, workflow]) => ({
      name,
      description: workflow.description,
      steps: workflow.steps.map(s => s.name),
      mcpTools: workflow.mcpTools
    }));
  }

  /**
   * Get workflow definition
   */
  getWorkflow(name) {
    return this.workflows[name];
  }

  /**
   * Add custom workflow
   */
  addWorkflow(name, workflow) {
    this.workflows[name] = workflow;
    logger.info('Custom workflow added', { name });
  }

  /**
   * Get active workflows
   */
  getActiveWorkflows() {
    const active = [];

    for (const [id, data] of this.activeWorkflows.entries()) {
      active.push({
        id,
        name: data.name,
        status: data.status,
        currentStep: data.currentStep,
        duration: Date.now() - data.startTime
      });
    }

    return active;
  }
}
