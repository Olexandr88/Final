#!/usr/bin/env node
/**
 * Meta-Agent Factory - Self-Evolving Agent Creation System
 * This agent can generate, spawn, and manage new specialized agents autonomously
 */

import WebSocket from 'ws';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import path from 'path';
import { logger } from '../utils/logger.js';

dotenv.config();

const BRIDGE_WS = process.env.BRIDGE_WS || 'ws://localhost:65028';
const AGENTS_DIR = path.join(process.cwd(), 'src', 'agents');

class MetaAgentFactory {
  constructor() {
    this.ws = null;
    this.agentId = 'meta-agent-factory';
    this.spawnedAgents = new Map(); // Track agents we've created
    this.agentTemplates = this.initializeTemplates();
  }

  initializeTemplates() {
    return {
      'data-processor': {
        description: 'Processes and transforms data',
        capabilities: ['json_transform', 'csv_parse', 'data_validation'],
        intents: ['data.process', 'data.transform', 'data.validate']
      },
      'security-scanner': {
        description: 'Scans for security vulnerabilities',
        capabilities: ['sql_injection_check', 'xss_detection', 'dependency_audit'],
        intents: ['security.scan', 'security.audit', 'security.report']
      },
      'performance-monitor': {
        description: 'Monitors system and code performance',
        capabilities: ['profile_code', 'memory_analysis', 'benchmark'],
        intents: ['perf.monitor', 'perf.analyze', 'perf.report']
      },
      'test-generator': {
        description: 'Generates automated tests',
        capabilities: ['unit_test_gen', 'integration_test_gen', 'e2e_test_gen'],
        intents: ['test.generate', 'test.run', 'test.report']
      },
      'doc-generator': {
        description: 'Generates documentation',
        capabilities: ['api_docs', 'readme_gen', 'code_comments'],
        intents: ['doc.generate', 'doc.update', 'doc.publish']
      },
      'deployment-agent': {
        description: 'Handles deployment tasks',
        capabilities: ['docker_build', 'k8s_deploy', 'ci_cd_trigger'],
        intents: ['deploy.start', 'deploy.rollback', 'deploy.status']
      },
      'refactoring-agent': {
        description: 'Refactors code for better quality',
        capabilities: ['extract_method', 'rename_variable', 'optimize_imports'],
        intents: ['refactor.suggest', 'refactor.apply', 'refactor.verify']
      },
      'api-tester': {
        description: 'Tests API endpoints',
        capabilities: ['rest_test', 'graphql_test', 'load_test'],
        intents: ['api.test', 'api.validate', 'api.report']
      }
    };
  }

  async connect() {
    logger.info('🏭 Meta-Agent Factory connecting...');
    this.ws = new WebSocket(BRIDGE_WS);

    await new Promise((resolve, reject) => {
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
    });

    this.ws.send(JSON.stringify({
      type: 'register',
      clientId: this.agentId,
      role: 'meta-agent',
      labels: ['factory', 'self-evolving', 'agent-creator'],
      tools: ['generate_agent', 'spawn_agent', 'manage_lifecycle'],
      intents: ['agent.create', 'agent.spawn', 'agent.list', 'agent.kill'],
      maxConcurrentTasks: 10
    }));

    await new Promise(r => this.ws.once('message', r));
    logger.info('✅ Meta-Agent Factory ready');
    logger.info(`📋 Available agent templates: ${Object.keys(this.agentTemplates).join(', ')}\n`);

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
      logger.info('🔌 Meta-Agent disconnected - reconnecting...');
      setTimeout(() => this.connect(), 5000);
    });

    this.ws.on('error', (err) => {
      logger.error('❌ WebSocket error:', err.message);
    });

    // Heartbeat
    setInterval(() => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 60000);
  }

  async handleEnvelope(envelope) {
    const { from, intent, payload, id } = envelope;

    logger.info(`\n📨 Received request from ${from}: ${intent}`);

    try {
      let result;

      switch (intent) {
        case 'agent.create':
          result = await this.createAgent(payload);
          break;
        case 'agent.spawn':
          result = await this.spawnAgent(payload);
          break;
        case 'agent.list':
          result = this.listSpawnedAgents();
          break;
        case 'agent.kill':
          result = await this.killAgent(payload);
          break;
        default:
          result = { error: 'Unknown intent', supportedIntents: ['agent.create', 'agent.spawn', 'agent.list', 'agent.kill'] };
      }

      // Send response
      this.ws.send(JSON.stringify({
        type: 'envelope',
        envelope: {
          from: this.agentId,
          to: from,
          intent: `${intent}.result`,
          replyTo: id,
          payload: result
        }
      }));

    } catch (error) {
      logger.error('❌ Error handling request:', error.message);
      this.ws.send(JSON.stringify({
        type: 'envelope',
        envelope: {
          from: this.agentId,
          to: from,
          intent: 'agent.error',
          replyTo: id,
          payload: { error: error.message }
        }
      }));
    }
  }

  async createAgent(payload) {
    const { type, name, customCapabilities } = payload;

    logger.info(`🔨 Creating new agent: ${name || type}`);

    if (!this.agentTemplates[type]) {
      throw new Error(`Unknown agent type: ${type}. Available: ${Object.keys(this.agentTemplates).join(', ')}`);
    }

    const template = this.agentTemplates[type];
    const agentName = name || `${type}-${Date.now()}`;
    const agentCode = this.generateAgentCode(agentName, template, customCapabilities);

    // Write agent file
    const agentFilePath = path.join(AGENTS_DIR, `${agentName}.js`);
    await fs.writeFile(agentFilePath, agentCode);

    logger.info(`✅ Agent created: ${agentFilePath}`);

    return {
      success: true,
      agentName,
      agentType: type,
      filePath: agentFilePath,
      capabilities: template.capabilities,
      intents: template.intents
    };
  }

  generateAgentCode(agentName, template, customCapabilities = []) {
    const capabilities = [...template.capabilities, ...customCapabilities];
    const intents = template.intents;

    return `#!/usr/bin/env node
/**
 * ${agentName} - Auto-generated by Meta-Agent Factory
 * Description: ${template.description}
 * Generated: ${new Date().toISOString()}
 */

import WebSocket from 'ws';
import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';

dotenv.config();

const BRIDGE_WS = process.env.BRIDGE_WS || 'ws://localhost:65028';
const AGENT_ID = '${agentName}';

class ${agentName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}Agent {
  constructor() {
    this.agentId = AGENT_ID;
    this.ws = null;
    this.capabilities = ${JSON.stringify(capabilities)};
    this.intents = ${JSON.stringify(intents)};
  }

  async connect() {
    logger.info(\`🤖 \${this.agentId} connecting...\`);
    this.ws = new WebSocket(BRIDGE_WS);

    await new Promise((resolve, reject) => {
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
    });

    this.ws.send(JSON.stringify({
      type: 'register',
      clientId: this.agentId,
      role: '${template.description}',
      labels: ['auto-generated', 'specialized', '${agentName}'],
      tools: this.capabilities,
      intents: this.intents,
      maxConcurrentTasks: 3
    }));

    await new Promise(r => this.ws.once('message', r));
    logger.info(\`✅ \${this.agentId} ready\\n\`);

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

    logger.info(\`\\n📨 Processing request: \${intent}\`);

    try {
      // Auto-generated agent logic
      const result = await this.processTask(intent, payload);

      this.ws.send(JSON.stringify({
        type: 'envelope',
        envelope: {
          from: this.agentId,
          to: from,
          intent: \`\${intent}.result\`,
          replyTo: id,
          payload: result
        }
      }));

    } catch (error) {
      logger.error('❌ Error processing task:', error.message);
      this.ws.send(JSON.stringify({
        type: 'envelope',
        envelope: {
          from: this.agentId,
          to: from,
          intent: 'agent.error',
          replyTo: id,
          payload: { error: error.message }
        }
      }));
    }
  }

  async processTask(intent, payload) {
    logger.info(\`🔧 Processing: \${intent}\`);

    // Specialized task processing based on capabilities
    const result = {
      agent: this.agentId,
      intent,
      status: 'completed',
      timestamp: new Date().toISOString(),
      payload,
      capabilities: this.capabilities,
      message: \`Task processed by auto-generated agent\`
    };

    return result;
  }
}

// Start agent
const agent = new ${agentName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}Agent();
agent.connect().catch(err => {
  logger.error('❌ Failed to connect:', err.message);
  process.exit(1);
});

process.on('SIGINT', () => {
  logger.info('\\n👋 Shutting down ${agentName}...');
  process.exit(0);
});
`;
  }

  async spawnAgent(payload) {
    const { agentName, type } = payload;

    logger.info(`🚀 Spawning agent: ${agentName || type}`);

    // First create if doesn't exist
    let agentFile;
    if (agentName) {
      agentFile = path.join(AGENTS_DIR, `${agentName}.js`);
      const exists = await fs.access(agentFile).then(() => true).catch(() => false);
      if (!exists) {
        await this.createAgent({ type, name: agentName });
      }
    } else {
      const createResult = await this.createAgent({ type });
      agentFile = createResult.filePath;
    }

    // Spawn the agent process
    const agentProcess = spawn('node', [agentFile], {
      env: { ...process.env, BRIDGE_WS },
      stdio: 'pipe',
      shell: true
    });

    const agentId = path.basename(agentFile, '.js');
    this.spawnedAgents.set(agentId, {
      process: agentProcess,
      file: agentFile,
      spawnedAt: new Date().toISOString(),
      pid: agentProcess.pid
    });

    logger.info(`✅ Agent spawned: ${agentId} (PID: ${agentProcess.pid})`);

    // Capture output
    agentProcess.stdout.on('data', (data) => {
      logger.info(`[${agentId}] ${data.toString().trim()}`);
    });

    agentProcess.stderr.on('data', (data) => {
      logger.error(`[${agentId}] ${data.toString().trim()}`);
    });

    agentProcess.on('exit', (code) => {
      logger.info(`[${agentId}] Exited with code ${code}`);
      this.spawnedAgents.delete(agentId);
    });

    return {
      success: true,
      agentId,
      pid: agentProcess.pid,
      file: agentFile,
      spawnedAt: this.spawnedAgents.get(agentId).spawnedAt
    };
  }

  listSpawnedAgents() {
    const agents = Array.from(this.spawnedAgents.entries()).map(([id, info]) => ({
      agentId: id,
      pid: info.pid,
      file: info.file,
      spawnedAt: info.spawnedAt,
      uptime: Math.floor((Date.now() - new Date(info.spawnedAt).getTime()) / 1000)
    }));

    logger.info(`📋 Currently running ${agents.length} spawned agents`);

    return {
      count: agents.length,
      agents,
      availableTemplates: Object.keys(this.agentTemplates)
    };
  }

  async killAgent(payload) {
    const { agentId } = payload;

    const agentInfo = this.spawnedAgents.get(agentId);
    if (!agentInfo) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    logger.info(`🔪 Killing agent: ${agentId} (PID: ${agentInfo.pid})`);

    agentInfo.process.kill('SIGTERM');
    this.spawnedAgents.delete(agentId);

    return {
      success: true,
      agentId,
      message: `Agent ${agentId} terminated`
    };
  }
}

// Start Meta-Agent Factory
const factory = new MetaAgentFactory();
factory.connect().catch(err => {
  logger.error('❌ Failed to connect:', err.message);
  process.exit(1);
});

process.on('SIGINT', async () => {
  logger.info('\n👋 Shutting down Meta-Agent Factory...');

  // Kill all spawned agents
  for (const [agentId, info] of factory.spawnedAgents) {
    logger.info(`  Terminating ${agentId}...`);
    info.process.kill('SIGTERM');
  }

  process.exit(0);
});
