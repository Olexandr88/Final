/**
 * Parallel Workflow Runner
 * Execute multiple workflows concurrently for maximum productivity
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const WORKSPACE = '.multi-claude/shared';
const LOG_DIR = 'logs/workflows';

await fs.mkdir(LOG_DIR, { recursive: true });

class ParallelWorkflowRunner {
  constructor() {
    this.workflows = [];
    this.results = [];
    this.startTime = Date.now();
  }

  addWorkflow(name, command, args = []) {
    this.workflows.push({ name, command, args });
  }

  async run() {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║         PARALLEL WORKFLOW RUNNER                              ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`🚀 Starting ${this.workflows.length} workflows in parallel...`);
    console.log('');

    const promises = this.workflows.map((workflow, idx) => {
      return this.executeWorkflow(workflow, idx);
    });

    const results = await Promise.allSettled(promises);

    const elapsed = Date.now() - this.startTime;
    const elapsedSeconds = (elapsed / 1000).toFixed(1);

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ ALL WORKFLOWS COMPLETE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log(`⏱️  Total Time: ${elapsedSeconds}s`);
    console.log(`📊 Success: ${results.filter(r => r.status === 'fulfilled').length}/${results.length}`);
    console.log(`❌ Failed: ${results.filter(r => r.status === 'rejected').length}/${results.length}`);
    console.log('');

    // Summary table
    console.log('WORKFLOW SUMMARY:');
    console.log('');
    results.forEach((result, idx) => {
      const workflow = this.workflows[idx];
      const status = result.status === 'fulfilled' ? '✅' : '❌';
      const duration = result.value?.duration || 'N/A';
      console.log(`  ${status} ${workflow.name} (${duration}s)`);
    });

    console.log('');
    console.log(`📂 Deliverables: ${WORKSPACE}/`);
    console.log(`📝 Logs: ${LOG_DIR}/`);
    console.log('');

    return results;
  }

  async executeWorkflow(workflow, idx) {
    const logFile = path.join(LOG_DIR, `${workflow.name.replace(/\s+/g, '-')}-${Date.now()}.log`);
    const logStream = await fs.open(logFile, 'w');

    console.log(`  [${idx + 1}/${this.workflows.length}] 🚀 ${workflow.name}`);

    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const process = spawn(workflow.command, workflow.args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      process.stdout.on('data', async (data) => {
        await logStream.write(data);
      });

      process.stderr.on('data', async (data) => {
        await logStream.write(data);
      });

      process.on('close', async (code) => {
        await logStream.close();

        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(1);

        if (code === 0) {
          console.log(`  [${idx + 1}/${this.workflows.length}] ✅ ${workflow.name} (${duration}s)`);
          resolve({ name: workflow.name, duration, code });
        } else {
          console.log(`  [${idx + 1}/${this.workflows.length}] ❌ ${workflow.name} failed (${duration}s)`);
          reject(new Error(`${workflow.name} failed with code ${code}`));
        }
      });

      process.on('error', async (error) => {
        await logStream.close();
        console.log(`  [${idx + 1}/${this.workflows.length}] ❌ ${workflow.name} error: ${error.message}`);
        reject(error);
      });
    });
  }
}

// ========== PRE-DEFINED WORKFLOW BATCHES ==========

const batches = {
  // Backend Stack
  async backend() {
    const runner = new ParallelWorkflowRunner();
    runner.addWorkflow('API Gateway', 'node', ['scripts/workflow-templates.js', 'microservice', 'API Gateway']);
    runner.addWorkflow('Auth Service', 'node', ['scripts/workflow-templates.js', 'authService', 'Auth Service']);
    runner.addWorkflow('Background Workers', 'node', ['scripts/workflow-templates.js', 'workerSystem', 'Job Queue']);
    await runner.run();
  },

  // Frontend Stack
  async frontend() {
    const runner = new ParallelWorkflowRunner();
    runner.addWorkflow('Admin Dashboard', 'node', ['scripts/workflow-templates.js', 'dashboard', 'Admin Dashboard']);
    runner.addWorkflow('User Dashboard', 'node', ['scripts/workflow-templates.js', 'dashboard', 'User Dashboard']);
    runner.addWorkflow('Analytics Dashboard', 'node', ['scripts/workflow-templates.js', 'dashboard', 'Analytics Dashboard']);
    await runner.run();
  },

  // Data Stack
  async data() {
    const runner = new ParallelWorkflowRunner();
    runner.addWorkflow('Search Engine', 'node', ['scripts/workflow-templates.js', 'searchEngine', 'Product Search']);
    runner.addWorkflow('Cache Layer', 'node', ['scripts/workflow-templates.js', 'cacheLayer', 'Redis Cache']);
    runner.addWorkflow('Data Sync', 'node', ['scripts/workflow-templates.js', 'dataSyncService', 'Data Sync']);
    await runner.run();
  },

  // Infrastructure Stack
  async infra() {
    const runner = new ParallelWorkflowRunner();
    runner.addWorkflow('File Pipeline', 'node', ['scripts/workflow-templates.js', 'filePipeline', 'Upload Pipeline']);
    runner.addWorkflow('Event Bus', 'node', ['scripts/workflow-templates.js', 'eventDriven', 'Event System']);
    runner.addWorkflow('CLI Tools', 'node', ['scripts/workflow-templates.js', 'cliTool', 'Deploy CLI']);
    await runner.run();
  },

  // Full Stack (all at once!)
  async fullstack() {
    const runner = new ParallelWorkflowRunner();

    // Backend
    runner.addWorkflow('API Gateway', 'node', ['scripts/workflow-templates.js', 'microservice', 'API Gateway']);
    runner.addWorkflow('Auth Service', 'node', ['scripts/workflow-templates.js', 'authService', 'Auth Service']);
    runner.addWorkflow('Background Workers', 'node', ['scripts/workflow-templates.js', 'workerSystem', 'Job Queue']);

    // Frontend
    runner.addWorkflow('Admin Dashboard', 'node', ['scripts/workflow-templates.js', 'dashboard', 'Admin Dashboard']);
    runner.addWorkflow('User Dashboard', 'node', ['scripts/workflow-templates.js', 'dashboard', 'User Dashboard']);

    // Data
    runner.addWorkflow('Search Engine', 'node', ['scripts/workflow-templates.js', 'searchEngine', 'Product Search']);
    runner.addWorkflow('Cache Layer', 'node', ['scripts/workflow-templates.js', 'cacheLayer', 'Redis Cache']);

    // Infrastructure
    runner.addWorkflow('File Pipeline', 'node', ['scripts/workflow-templates.js', 'filePipeline', 'Upload Pipeline']);
    runner.addWorkflow('Event Bus', 'node', ['scripts/workflow-templates.js', 'eventDriven', 'Event System']);

    await runner.run();
  },

  // Custom batch from command line
  async custom() {
    const runner = new ParallelWorkflowRunner();

    // Parse command line args: name:template:customName
    const workflows = process.argv.slice(3);

    workflows.forEach(spec => {
      const [name, template, customName] = spec.split(':');
      runner.addWorkflow(
        name,
        'node',
        ['scripts/workflow-templates.js', template, customName || name]
      );
    });

    await runner.run();
  }
};

// ========== CLI EXECUTION ==========

const batchName = process.argv[2];

if (!batchName || !batches[batchName]) {
  console.log('');
  console.log('Parallel Workflow Runner');
  console.log('');
  console.log('Execute multiple workflows concurrently for maximum productivity');
  console.log('');
  console.log('Usage: node scripts/parallel-workflow-runner.js <batch>');
  console.log('');
  console.log('Available batches:');
  console.log('  backend    - API Gateway, Auth Service, Background Workers');
  console.log('  frontend   - Admin, User, Analytics Dashboards');
  console.log('  data       - Search Engine, Cache Layer, Data Sync');
  console.log('  infra      - File Pipeline, Event Bus, CLI Tools');
  console.log('  fullstack  - Complete stack (9 workflows in parallel!)');
  console.log('  custom     - Custom workflows from command line');
  console.log('');
  console.log('Examples:');
  console.log('  npm run multi-agent:parallel backend');
  console.log('  npm run multi-agent:parallel frontend');
  console.log('  npm run multi-agent:parallel fullstack');
  console.log('');
  console.log('Custom workflows:');
  console.log('  npm run multi-agent:parallel custom "Payment:microservice:Payment Service" "Billing:microservice:Billing Service"');
  console.log('');
  process.exit(1);
}

await batches[batchName]();
