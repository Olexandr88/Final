import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { agents, AgentDescriptor, agentRegistry, ensureRequestId } from './agents.js';
import { toolRegistry } from './tools.js';
import { practicalToolRegistry } from './practical-tools.js';
import { createEnhancedAgent, createAgentEcosystem, ENHANCED_AGENT_TYPES } from './enhanced-agents.js';
import { createAdvancedAgent, createAdvancedEcosystem, ADVANCED_AGENT_TYPES } from './advanced-agents.js';
import { agentExecutor } from './agent-executor.js';
import { advancedToolRegistry } from './advanced-tools.js';
import { permissionManager } from './permissions.js';
import { agentMCPManager } from './agent-mcp-servers.js';
import { StreamHub } from './streaming.js';
import { setTimeout as sleep } from 'timers/promises';
import pino from 'pino';
import * as http from 'http';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import client, { Counter, Gauge, Registry } from 'prom-client';

// In-memory requests state
type RequestStatus = 'queued' | 'running' | 'done' | 'error' | 'canceled';

type RequestRecord = {
  id: string;
  agentId: string;
  capability: string;
  status: RequestStatus;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  error?: string;
  result?: unknown;
  idempotencyKey?: string;
  sessionId?: string;
};

type IdempotencyEntry = { requestId: string; expiresAt: number };

type QueueItem = { requestId: string; input: any };

const requests = new Map<string, RequestRecord>();
const idempotency = new Map<string, IdempotencyEntry>(); // idempotencyKey -> entry

const ENABLE_STREAMING = process.env.ENABLE_STREAMING !== 'false';
const STREAM_PORT = parseInt(process.env.STREAM_PORT || process.env.PORT || '8787', 10);
const STREAM_HOST = process.env.STREAM_HOST || '127.0.0.1';
const STREAM_TOKEN = process.env.STREAM_TOKEN;
let STREAM_VERBOSE = process.env.STREAM_VERBOSE === 'true';
const MAX_SUBS_PER_REQUEST = parseInt(process.env.MAX_SUBS_PER_REQUEST || '16', 10);
const CPU_CORES = os.cpus()?.length || 4;
// More aggressive default concurrency based on cores, with a sane floor
let MAX_CONCURRENCY = parseInt(process.env.MAX_CONCURRENCY || String(Math.max(32, CPU_CORES * 8)), 10);
const MAX_CONCURRENCY_MIN = parseInt(process.env.MAX_CONCURRENCY_MIN || '8', 10);
const MAX_CONCURRENCY_MAX = parseInt(process.env.MAX_CONCURRENCY_MAX || String(Math.max(64, CPU_CORES * 16)), 10);
const MAX_QUEUE_SIZE = parseInt(process.env.MAX_QUEUE_SIZE || '10000', 10);
const REQUEST_TTL_MS = parseInt(process.env.REQUEST_TTL_MS || String(5 * 60 * 1000), 10);
const IDEMP_TTL_MS = parseInt(process.env.IDEMP_TTL_MS || String(15 * 60 * 1000), 10);
const METRICS_PORT = parseInt(process.env.METRICS_PORT || '0', 10);
const METRICS_INTERVAL_MS = parseInt(process.env.METRICS_INTERVAL_MS || '10000', 10);
const LOG_LEVEL = process.env.LOG_LEVEL || 'warn';
const AUTOTUNE_ENABLED = process.env.AUTOTUNE_ENABLED !== 'false';
const AUTOTUNE_PERSIST = process.env.AUTOTUNE_PERSIST !== 'false';
const PERF_TUNING_PATH = process.env.PERF_TUNING_PATH || './data/perf-tuning.json';
const OPT_TUNE_INTERVAL_MS = parseInt(process.env.OPT_TUNE_INTERVAL_MS || '30000', 10);
const OPT_ALPHA = Number(process.env.OPT_ALPHA || '0.2');

const logger = pino({ level: LOG_LEVEL, base: { service: 'a2a-mcp-server' } });

// Load persisted tuning (if any)
if (AUTOTUNE_PERSIST) {
  try {
    const file = path.resolve(PERF_TUNING_PATH);
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as { maxConcurrency?: number };
      if (typeof data.maxConcurrency === 'number') {
        const persisted = Math.min(MAX_CONCURRENCY_MAX, Math.max(MAX_CONCURRENCY_MIN, Math.floor(data.maxConcurrency)));
        if (persisted && persisted !== MAX_CONCURRENCY) {
          MAX_CONCURRENCY = persisted;
          logger.warn({ MAX_CONCURRENCY }, 'autotune: loaded persisted concurrency');
        }
      }
    }
  } catch (e) {
    logger.warn({ err: (e as Error).message }, 'autotune: failed to load persisted tuning');
  }
}

const streamHub = ENABLE_STREAMING 
  ? new StreamHub(STREAM_PORT, STREAM_HOST, { token: STREAM_TOKEN, maxSubsPerRequest: MAX_SUBS_PER_REQUEST })
  : null;

function ok<T>(data: T) {
  return { ok: true, data };
}
function fail(message: string, code: string = 'ERR_BAD_REQUEST') {
  return { ok: false, error: { code, message } };
}

// Metrics
const registry: Registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });
const reqCreated = new Counter({ name: 'a2a_requests_created_total', help: 'Requests created', registers: [registry] });
const reqCompleted = new Counter({ name: 'a2a_requests_completed_total', help: 'Requests completed', labelNames: ['status'] as const, registers: [registry] });
const runningGauge = new Gauge({ name: 'a2a_running_jobs', help: 'Currently running jobs', registers: [registry] });
const queueGauge = new Gauge({ name: 'a2a_queue_size', help: 'Queue length', registers: [registry] });
const wsClients = new Gauge({ name: 'a2a_ws_clients', help: 'WebSocket client count', registers: [registry] });
const wsChannels = new Gauge({ name: 'a2a_ws_channels', help: 'WebSocket channel count', registers: [registry] });
const broadcasts = new Counter({ name: 'a2a_stream_broadcasts_total', help: 'Stream broadcasts', registers: [registry] });
const agentOps = new Counter({ name: 'a2a_agent_operations_total', help: 'Agent operations', labelNames: ['operation'] as const, registers: [registry] });
const totalAgents = new Gauge({ name: 'a2a_total_agents', help: 'Total deployed agents', registers: [registry] });
const enabledAgents = new Gauge({ name: 'a2a_enabled_agents', help: 'Enabled agents', registers: [registry] });
const ewmaExecGauge = new Gauge({ name: 'a2a_ewma_exec_ms', help: 'EWMA execution time (ms)', registers: [registry] });
const ewmaWaitGauge = new Gauge({ name: 'a2a_ewma_wait_ms', help: 'EWMA queue wait time (ms)', registers: [registry] });
const ewmaSuccessGauge = new Gauge({ name: 'a2a_ewma_success', help: 'EWMA success rate (0..1)', registers: [registry] });
const concurrencyGauge = new Gauge({ name: 'a2a_max_concurrency_current', help: 'Current max concurrency (autotuned)', registers: [registry] });

// Optimization EWMAs
let ewmaExecMs = 0; // avg execution time
let ewmaWaitMs = 0; // avg queue wait time
let ewmaSuccess = 1; // success rate (1 good, 0 bad)
function ewmaUpdate(prev: number, sample: number, alpha: number = OPT_ALPHA) {
  if (!Number.isFinite(prev)) return sample;
  return alpha * sample + (1 - alpha) * prev;
}

// Concurrency-limited queue (O(1) dequeue)
const queue: QueueItem[] = [];
let qHead = 0;
let running = 0;

function qSize() { return queue.length - qHead; }
function qPush(item: QueueItem) { queue.push(item); }
function qShift(): QueueItem | undefined {
  if (qHead >= queue.length) return undefined;
  const item = queue[qHead++];
  // Compact occasionally to avoid unbounded growth
  if (qHead > 1024 && qHead * 2 > queue.length) {
    queue.splice(0, qHead);
    qHead = 0;
  }
  return item;
}

function maybeStartNext() {
  while (running < MAX_CONCURRENCY && qSize() > 0) {
    const item = qShift()!;
    const r = requests.get(item.requestId);
    if (!r || r.status === 'canceled') continue;
    startJob(item.requestId, item.input);
  }
  queueGauge.set(qSize());
  runningGauge.set(running);
}

async function startJob(requestId: string, input: any) {
  running++;
  runningGauge.set(running);
  try {
    await runAgentJob(requestId, input);
  } catch (err: any) {
    const r = requests.get(requestId);
    if (r) {
      r.status = 'error';
      r.error = String(err?.message || err);
      r.updatedAt = Date.now();
      streamHub?.broadcast(requestId, {
        type: 'error',
        requestId,
        ts: Date.now(),
        message: r.error!,
      });
    }
  } finally {
    running = Math.max(0, running - 1);
    runningGauge.set(running);
    maybeStartNext();
  }
}

// TTL cleanup
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of idempotency) {
    if (entry.expiresAt <= now || !requests.has(entry.requestId)) {
      idempotency.delete(key);
    }
  }
  for (const [id, rec] of requests) {
    if ((rec.status === 'done' || rec.status === 'error' || rec.status === 'canceled') && now - rec.updatedAt > REQUEST_TTL_MS) {
      requests.delete(id);
    }
  }
}, Math.min(REQUEST_TTL_MS, 60_000));

// periodically sample ws counts and agent stats
setInterval(() => {
  try {
    if (streamHub) {
      wsClients.set(streamHub.clientCount());
      wsChannels.set(streamHub.channelCount());
    }
    queueGauge.set(qSize());
    runningGauge.set(running);
    
    // Update agent metrics
    const stats = agentRegistry.getStats();
    totalAgents.set(stats.total);
    enabledAgents.set(stats.enabled);

    // Update optimization gauges
    ewmaExecGauge.set(ewmaExecMs || 0);
    ewmaWaitGauge.set(ewmaWaitMs || 0);
    ewmaSuccessGauge.set(ewmaSuccess || 0);
    concurrencyGauge.set(MAX_CONCURRENCY);
  } catch {}
}, METRICS_INTERVAL_MS);

async function invokeAgentInternal({
  agentId,
  capability,
  input,
  idempotencyKey,
  sessionId,
}: {
  agentId: string;
  capability: string;
  input: any;
  idempotencyKey?: string;
  sessionId?: string;
}) {
  const a = agents[agentId];
  if (!a) return fail(`Unknown agent: ${agentId}`, 'ERR_NOT_FOUND');
  const cap = a.capabilities.find((c) => c.name === capability);
  if (!cap) return fail(`Agent ${agentId} missing capability '${capability}'`, 'ERR_NOT_FOUND');

  if (idempotencyKey && idempotency.has(idempotencyKey)) {
    const entry = idempotency.get(idempotencyKey)!;
    const rec = requests.get(entry.requestId);
    if (rec && entry.expiresAt > Date.now()) {
      return ok({
        requestId: entry.requestId,
        status: rec.status,
        streamUrl: streamHub ? streamHub.channelUrl(entry.requestId) : 'streaming disabled',
      });
    }
    // stale
    idempotency.delete(idempotencyKey);
  }

  const requestId = ensureRequestId();
  const rec: RequestRecord = {
    id: requestId,
    agentId,
    capability,
    status: 'queued',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sessionId,
  };
  requests.set(requestId, rec);
  if (idempotencyKey) idempotency.set(idempotencyKey, { requestId, expiresAt: Date.now() + IDEMP_TTL_MS });

  if (qSize() >= MAX_QUEUE_SIZE && running >= MAX_CONCURRENCY) {
    rec.status = 'error';
    rec.error = 'queue full';
    rec.updatedAt = Date.now();
    return fail('Queue is full', 'ERR_QUEUE_FULL');
  }

  qPush({ requestId, input });
  queueGauge.set(qSize());
  reqCreated.inc();
  logger.info({ requestId, agentId, capability }, 'request enqueued');
  maybeStartNext();

  const streamUrl = streamHub ? streamHub.channelUrl(requestId, STREAM_TOKEN) : 'streaming disabled';
  return ok({ requestId, status: rec.status, streamUrl });
}

const server = new Server(
  {
    name: 'a2a-mcp-server',
    version: '0.1.0',
  },
  {
    tools: {
      agent_control: {
        description: 'Unified agent control: list agents, invoke capabilities, manage sessions, cancel requests, handoff between agents, get status, deploy agents, and manage agent lifecycle',
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            action: {
              type: 'string',
              enum: ['list_agents', 'describe_agent', 'open_session', 'close_session', 'invoke_agent', 'cancel', 'get_status', 'handoff', 'deploy_agent', 'deploy_batch', 'update_agent', 'enable_agent', 'disable_agent', 'remove_agent', 'get_stats', 'generate_agents', 'filter_agents', 'create_enhanced_agent', 'create_agent_ecosystem', 'list_enhanced_types', 'create_advanced_agent', 'create_advanced_ecosystem', 'list_advanced_types', 'execute_practical_tool', 'execute_advanced_tool', 'list_practical_tools', 'list_advanced_tools', 'grant_permission', 'request_permission', 'approve_permission', 'revoke_permission', 'get_permissions', 'create_mcp_server', 'add_tool_to_agent', 'share_tool', 'connect_to_agent_mcp', 'execute_shared_tool', 'discover_tools', 'get_sharing_agreements']
            },
            // For describe_agent
            id: { type: 'string' },
            // For session management
            sessionId: { type: 'string' },
            // For invoke_agent
            agentId: { type: 'string' },
            capability: { type: 'string' },
            input: { type: 'object' },
            idempotencyKey: { type: 'string' },
            // For cancel/get_status
            requestId: { type: 'string' },
            // For handoff
            fromRequestId: { type: 'string' },
            toAgentId: { type: 'string' },
            payload: { type: 'object' },
            // For agent deployment
            agent: { type: 'object' },
            agents: { type: 'array' },
            updates: { type: 'object' },
            enabled: { type: 'boolean' },
            count: { type: 'number' },
            template: { type: 'object' },
            // For filtering
            filter: { type: 'object' },
            tags: { type: 'array' },
            category: { type: 'string' },
            search: { type: 'string' },
            // For permissions
            targetAgentId: { type: 'string' },
            permission: { type: 'string' },
            delegable: { type: 'boolean' },
            expiresIn: { type: 'number' },
            reason: { type: 'string' },
            grantId: { type: 'string' },
            // For enhanced agents
            agentType: { type: 'string' },
            useCase: { type: 'string' },
            agentConfig: { type: 'object' },
            // For practical tools
            toolName: { type: 'string' },
            toolCategory: { type: 'string' },
            toolParams: { type: 'object' },
            executionContext: { type: 'object' },
            // For MCP servers and tools
            mcpConfig: { type: 'object' },
            tool: { type: 'object' },
            providerAgentId: { type: 'string' },
            consumerAgentId: { type: 'string' },
            shareOptions: { type: 'object' },
            discoveryFilters: { type: 'object' }
          },
          required: ['action']
        },
        outputSchema: { type: 'object' },
        async handler(params: any) {
          const { action } = params;
          
          switch (action) {
            case 'list_agents': {
              const { filter } = params;
              const list = agentRegistry.list(filter);
              return ok({ agents: list });
            }
            
            case 'describe_agent': {
              const { id } = params;
              if (!id) return fail('id is required for describe_agent', 'ERR_BAD_REQUEST');
              const a = agents[id];
              if (!a) return fail(`Unknown agent: ${id}`, 'ERR_NOT_FOUND');
              return ok(a);
            }
            
            case 'open_session': {
              const { sessionId } = params;
              const sid = ensureRequestId(sessionId);
              return ok({ sessionId: sid });
            }
            
            case 'close_session': {
              return ok({ closed: true });
            }
            
            case 'invoke_agent': {
              const { agentId, capability, input, idempotencyKey, sessionId } = params;
              if (!agentId || !capability || !input) {
                return fail('agentId, capability, and input are required for invoke_agent', 'ERR_BAD_REQUEST');
              }
              return invokeAgentInternal({ agentId, capability, input, idempotencyKey, sessionId });
            }
            
            case 'cancel': {
              const { requestId } = params;
              if (!requestId) return fail('requestId is required for cancel', 'ERR_BAD_REQUEST');
              const r = requests.get(requestId);
              if (!r) return fail(`Unknown requestId ${requestId}`, 'ERR_NOT_FOUND');
              if (r.status === 'done' || r.status === 'error') return ok({ canceled: false });
              r.status = 'canceled';
              r.updatedAt = Date.now();
              streamHub?.broadcast(requestId, {
                type: 'error',
                requestId,
                ts: Date.now(),
                message: 'canceled',
              });
              reqCompleted.inc({ status: 'canceled' });
              logger.warn({ requestId }, 'request canceled');
              return ok({ canceled: true });
            }
            
            case 'get_status': {
              const { requestId } = params;
              if (!requestId) return fail('requestId is required for get_status', 'ERR_BAD_REQUEST');
              const r = requests.get(requestId);
              if (!r) return fail(`Unknown requestId ${requestId}`, 'ERR_NOT_FOUND');
              return ok(r);
            }
            
            case 'handoff': {
              const { fromRequestId, toAgentId, capability, payload } = params;
              if (!fromRequestId || !toAgentId || !capability || !payload) {
                return fail('fromRequestId, toAgentId, capability, and payload are required for handoff', 'ERR_BAD_REQUEST');
              }
              const parent = requests.get(fromRequestId);
              if (!parent) return fail(`Unknown fromRequestId ${fromRequestId}`, 'ERR_NOT_FOUND');
              return invokeAgentInternal({
                agentId: toAgentId,
                capability,
                input: payload,
                sessionId: parent.sessionId,
              });
            }
            
            case 'deploy_agent': {
              const { agent } = params;
              if (!agent) return fail('agent is required for deploy_agent', 'ERR_BAD_REQUEST');
              const success = agentRegistry.deploy(agent);
              return ok({ deployed: success, agentId: agent.id });
            }
            
            case 'deploy_batch': {
              const { agents: agentList } = params;
              if (!agentList || !Array.isArray(agentList)) {
                return fail('agents array is required for deploy_batch', 'ERR_BAD_REQUEST');
              }
              const result = agentRegistry.deployBatch(agentList);
              return ok(result);
            }
            
            case 'update_agent': {
              const { id, updates } = params;
              if (!id || !updates) {
                return fail('id and updates are required for update_agent', 'ERR_BAD_REQUEST');
              }
              const success = agentRegistry.update(id, updates);
              return ok({ updated: success, agentId: id });
            }
            
            case 'enable_agent': {
              const { id } = params;
              if (!id) return fail('id is required for enable_agent', 'ERR_BAD_REQUEST');
              const success = agentRegistry.setEnabled(id, true);
              return ok({ enabled: success, agentId: id });
            }
            
            case 'disable_agent': {
              const { id } = params;
              if (!id) return fail('id is required for disable_agent', 'ERR_BAD_REQUEST');
              const success = agentRegistry.setEnabled(id, false);
              return ok({ disabled: success, agentId: id });
            }
            
            case 'remove_agent': {
              const { id } = params;
              if (!id) return fail('id is required for remove_agent', 'ERR_BAD_REQUEST');
              const success = agentRegistry.remove(id);
              return ok({ removed: success, agentId: id });
            }
            
            case 'get_stats': {
              const stats = agentRegistry.getStats();
              return ok(stats);
            }
            
            case 'generate_agents': {
              const { count, template } = params;
              if (!count || count <= 0) {
                return fail('count > 0 is required for generate_agents', 'ERR_BAD_REQUEST');
              }
              const generated = agentRegistry.generateAgents(count, template);
              const result = agentRegistry.deployBatch(generated);
              return ok({ ...result, generated: generated.length });
            }
            
            case 'filter_agents': {
              const { tags, category, enabled, search } = params;
              const filter = { tags, category, enabled, search };
              const filtered = agentRegistry.list(filter);
              return ok({ agents: filtered, count: filtered.length });
            }
            
            case 'create_enhanced_agent': {
              const { agentType, agentConfig = {} } = params;
              if (!agentType) {
                return fail('agentType is required for create_enhanced_agent', 'ERR_BAD_REQUEST');
              }
              try {
                const agent = createEnhancedAgent(agentType, agentConfig);
                const success = agentRegistry.deploy(agent);
                agentOps.inc({ operation: 'create_enhanced' });
                return ok({ deployed: success, agent, agentId: agent.id });
              } catch (error) {
                return fail(`Failed to create enhanced agent: ${error instanceof Error ? error.message : String(error)}`, 'ERR_INTERNAL');
              }
            }
            
            case 'create_agent_ecosystem': {
              const { useCase } = params;
              if (!useCase) {
                return fail('useCase is required for create_agent_ecosystem', 'ERR_BAD_REQUEST');
              }
              try {
                const agents = createAgentEcosystem(useCase);
                const result = agentRegistry.deployBatch(agents);
                agentOps.inc({ operation: 'create_ecosystem' });
                return ok({ ...result, agents, useCase });
              } catch (error) {
                return fail(`Failed to create agent ecosystem: ${error instanceof Error ? error.message : String(error)}`, 'ERR_INTERNAL');
              }
            }
            
            case 'list_enhanced_types': {
              return ok({
                agentTypes: Object.values(ENHANCED_AGENT_TYPES),
                useCases: ['web-development', 'data-analysis', 'content-marketing', 'devops'],
                capabilities: {
                  [ENHANCED_AGENT_TYPES.WEB_SCRAPER]: ['Advanced web scraping with pagination', 'Data extraction', 'Export to multiple formats'],
                  [ENHANCED_AGENT_TYPES.CONTENT_WRITER]: ['SEO-optimized content generation', 'Multiple content types', 'Tone customization'],
                  [ENHANCED_AGENT_TYPES.DATA_ANALYST]: ['Comprehensive data analysis', 'Statistical insights', 'Visualization generation'],
                  [ENHANCED_AGENT_TYPES.API_TESTER]: ['API testing automation', 'Performance testing', 'Report generation'],
                  [ENHANCED_AGENT_TYPES.DEPLOY_MANAGER]: ['Multi-platform deployment', 'CI/CD automation', 'Health monitoring'],
                  [ENHANCED_AGENT_TYPES.SECURITY_SCANNER]: ['Vulnerability scanning', 'Compliance checking', 'Automated remediation']
                }
              });
            }
            
            case 'execute_practical_tool': {
              const { toolName, toolParams = {}, executionContext = {} } = params;
              if (!toolName) {
                return fail('toolName is required for execute_practical_tool', 'ERR_BAD_REQUEST');
              }
              try {
                const context = {
                  agentId: 'system',
                  requestId: ensureRequestId(),
                  workingDirectory: process.cwd(),
                  permissions: ['*'], // Full permissions for practical tools
                  limits: {
                    maxExecutionTime: 300000, // 5 minutes
                    maxFileSize: 50 * 1024 * 1024 // 50MB
                  },
                  ...executionContext
                };
                const result = await practicalToolRegistry.execute(toolName, toolParams, context);
                agentOps.inc({ operation: 'execute_tool' });
                return ok(result);
              } catch (error) {
                return fail(`Failed to execute practical tool: ${error instanceof Error ? error.message : String(error)}`, 'ERR_INTERNAL');
              }
            }
            
            case 'list_practical_tools': {
              const { toolCategory } = params;
              const tools = practicalToolRegistry.list(toolCategory);
              const categories = practicalToolRegistry.getCategories();
              return ok({ tools, categories, count: tools.length });
            }
            
            case 'create_advanced_agent': {
              const { agentType, agentConfig = {} } = params;
              if (!agentType) {
                return fail('agentType is required for create_advanced_agent', 'ERR_BAD_REQUEST');
              }
              try {
                const agent = createAdvancedAgent(agentType, agentConfig);
                const success = agentRegistry.deploy(agent);
                agentOps.inc({ operation: 'create_advanced' });
                return ok({ deployed: success, agent, agentId: agent.id });
              } catch (error) {
                return fail(`Failed to create advanced agent: ${error instanceof Error ? error.message : String(error)}`, 'ERR_INTERNAL');
              }
            }
            
            case 'create_advanced_ecosystem': {
              const { useCase } = params;
              if (!useCase) {
                return fail('useCase is required for create_advanced_ecosystem', 'ERR_BAD_REQUEST');
              }
              try {
                const agents = createAdvancedEcosystem(useCase);
                const result = agentRegistry.deployBatch(agents);
                agentOps.inc({ operation: 'create_advanced_ecosystem' });
                return ok({ ...result, agents, useCase });
              } catch (error) {
                return fail(`Failed to create advanced ecosystem: ${error instanceof Error ? error.message : String(error)}`, 'ERR_INTERNAL');
              }
            }
            
            case 'list_advanced_types': {
              return ok({
                agentTypes: Object.values(ADVANCED_AGENT_TYPES),
                useCases: ['full-stack-automation', 'business-automation', 'ml-operations', 'enterprise-integration'],
                capabilities: {
                  [ADVANCED_AGENT_TYPES.EMAIL_AUTOMATOR]: ['SMTP integration', 'Campaign tracking', 'Response processing', 'Automation rules'],
                  [ADVANCED_AGENT_TYPES.DATABASE_MANAGER]: ['Multi-DB support', 'Query optimization', 'Backup automation', 'Performance tuning'],
                  [ADVANCED_AGENT_TYPES.CLOUD_ORCHESTRATOR]: ['Multi-cloud deployment', 'Infrastructure as Code', 'Cost optimization', 'Auto-scaling'],
                  [ADVANCED_AGENT_TYPES.ML_PIPELINE_MANAGER]: ['End-to-end ML pipelines', 'Model training', 'Hyperparameter tuning', 'Deployment automation'],
                  [ADVANCED_AGENT_TYPES.WORKFLOW_ORCHESTRATOR]: ['Complex workflows', 'External integrations', 'Error handling', 'Parallel execution'],
                  [ADVANCED_AGENT_TYPES.REAL_TIME_MONITOR]: ['Real-time metrics', 'Intelligent alerting', 'Dashboard creation', 'Multi-channel notifications']
                }
              });
            }
            
            case 'execute_advanced_tool': {
              const { toolName, toolParams = {}, executionContext = {} } = params;
              if (!toolName) {
                return fail('toolName is required for execute_advanced_tool', 'ERR_BAD_REQUEST');
              }
              try {
                const context = {
                  agentId: 'system',
                  requestId: ensureRequestId(),
                  workingDirectory: process.cwd(),
                  permissions: ['*'], // Full permissions for advanced tools
                  limits: {
                    maxExecutionTime: 600000, // 10 minutes for advanced operations
                    maxFileSize: 100 * 1024 * 1024 // 100MB
                  },
                  ...executionContext
                };
                const result = await advancedToolRegistry.execute(toolName, toolParams, context);
                agentOps.inc({ operation: 'execute_advanced_tool' });
                return ok(result);
              } catch (error) {
                return fail(`Failed to execute advanced tool: ${error instanceof Error ? error.message : String(error)}`, 'ERR_INTERNAL');
              }
            }
            
            case 'list_advanced_tools': {
              const { toolCategory } = params;
              const tools = advancedToolRegistry.list(toolCategory);
              const categories = advancedToolRegistry.getCategories();
              return ok({ tools, categories, count: tools.length });
            }
            
            // Permission Management
            case 'grant_permission': {
              const { id, targetAgentId, permission, delegable, expiresIn, reason } = params;
              if (!id || !targetAgentId || !permission) {
                return fail('id, targetAgentId, and permission are required', 'ERR_BAD_REQUEST');
              }
              const result = await permissionManager.grantPermission(id, targetAgentId, permission, {
                delegable, expiresIn, reason
              });
              return ok(result);
            }
            
            case 'request_permission': {
              const { id, targetAgentId, permission, reason, expiresIn } = params;
              if (!id || !targetAgentId || !permission || !reason) {
                return fail('id, targetAgentId, permission, and reason are required', 'ERR_BAD_REQUEST');
              }
              const result = await permissionManager.requestPermission(id, targetAgentId, permission, reason, expiresIn);
              return ok(result);
            }
            
            case 'approve_permission': {
              const { id, requestId, reason } = params;
              if (!id || !requestId) {
                return fail('id and requestId are required', 'ERR_BAD_REQUEST');
              }
              const result = await permissionManager.approvePermissionRequest(id, requestId, reason);
              return ok(result);
            }
            
            case 'revoke_permission': {
              const { id, grantId, reason } = params;
              if (!id || !grantId) {
                return fail('id and grantId are required', 'ERR_BAD_REQUEST');
              }
              const result = permissionManager.revokePermission(id, grantId, reason);
              return ok(result);
            }
            
            case 'get_permissions': {
              const { id } = params;
              if (!id) return fail('id is required', 'ERR_BAD_REQUEST');
              const permissions = permissionManager.getAgentPermissions(id);
              const pendingRequests = permissionManager.getPendingRequests(id);
              return ok({ permissions, pendingRequests });
            }
            
            // MCP Server Management
            case 'create_mcp_server': {
              const { id, mcpConfig } = params;
              if (!id) return fail('id is required', 'ERR_BAD_REQUEST');
              const result = await agentMCPManager.createAgentMCPServer(id, mcpConfig || {});
              return ok(result);
            }
            
            case 'add_tool_to_agent': {
              const { id, tool } = params;
              if (!id || !tool) {
                return fail('id and tool are required', 'ERR_BAD_REQUEST');
              }
              const result = await agentMCPManager.addToolToAgent(id, tool);
              return ok(result);
            }
            
            case 'share_tool': {
              const { providerAgentId, consumerAgentId, toolName, shareOptions } = params;
              if (!providerAgentId || !consumerAgentId || !toolName) {
                return fail('providerAgentId, consumerAgentId, and toolName are required', 'ERR_BAD_REQUEST');
              }
              const result = await agentMCPManager.shareToolWithAgent(
                providerAgentId, consumerAgentId, toolName, shareOptions || {}
              );
              return ok(result);
            }
            
            case 'connect_to_agent_mcp': {
              const { id, targetAgentId } = params;
              if (!id || !targetAgentId) {
                return fail('id and targetAgentId are required', 'ERR_BAD_REQUEST');
              }
              const result = await agentMCPManager.connectToAgentMCP(id, targetAgentId);
              return ok(result);
            }
            
            case 'execute_shared_tool': {
              const { consumerAgentId, providerAgentId, toolName, toolParams } = params;
              if (!consumerAgentId || !providerAgentId || !toolName) {
                return fail('consumerAgentId, providerAgentId, and toolName are required', 'ERR_BAD_REQUEST');
              }
              const result = await agentMCPManager.executeSharedTool(
                consumerAgentId, providerAgentId, toolName, toolParams || {}
              );
              return ok(result);
            }
            
            case 'discover_tools': {
              const { discoveryFilters } = params;
              const tools = agentMCPManager.discoverTools(discoveryFilters || {});
              return ok({ tools, count: tools.length });
            }
            
            case 'get_sharing_agreements': {
              const { id } = params;
              if (!id) return fail('id is required', 'ERR_BAD_REQUEST');
              const agreements = agentMCPManager.getSharingAgreements(id);
              return ok(agreements);
            }
            
            default:
              return fail(`Unknown action: ${action}`, 'ERR_BAD_REQUEST');
          }
        },
      },
    },
  } as any
);

// Helper function to get permissions for an agent
function getAgentPermissions(agentId: string): string[] {
  const agent = agentRegistry.get(agentId);
  if (!agent) return ['file:read']; // Default minimal permissions
  
  // Grant permissions based on agent category
  switch (agent.category) {
    case 'web_automation':
      return ['network:http', 'file:write', 'file:read'];
    case 'content_creation':
      return ['file:write', 'file:read'];
    case 'data_processing':
      return ['file:read', 'file:write', 'data:process'];
    case 'testing':
      return ['network:http', 'file:write', 'file:read', 'system:read'];
    case 'devops':
      return ['*']; // DevOps agents need full permissions
    case 'security':
      return ['file:read', 'network:http', 'system:read'];
    case 'system':
      return ['system:read', 'system:execute', 'file:read'];
    case 'file_operations':
      return ['file:read', 'file:write', 'file:delete'];
    default:
      return ['file:read', 'file:write', 'network:http'];
  }
}

async function runAgentJob(requestId: string, input: any) {
  const r = requests.get(requestId)!;
  r.status = 'running';
  r.startedAt = Date.now();
  r.updatedAt = r.startedAt;
  streamHub?.broadcast(requestId, { type: 'start', requestId, ts: Date.now() });
  logger.info({ requestId, agentId: r.agentId, capability: r.capability }, 'agent job started');

  try {
    // Create execution context with permissions based on agent type
    const context = {
      agentId: r.agentId,
      requestId,
      workingDirectory: process.cwd(),
      permissions: getAgentPermissions(r.agentId),
      limits: {
        maxExecutionTime: 60000, // 1 minute
        maxFileSize: 10 * 1024 * 1024 // 10MB
      }
    };

    // Stream progress updates (throttled via env)
    if (STREAM_VERBOSE) {
      streamHub?.broadcast(requestId, {
        type: 'chunk',
        requestId,
        ts: Date.now(),
        content: `Executing ${r.agentId} with capability ${r.capability}...\n`
      });
    }

    // Execute the agent
    const result = await agentExecutor.executeAgent(r.agentId, r.capability, input, context);

    if (result.success) {
      // Stream tools used information
      if (STREAM_VERBOSE && result.toolsUsed.length > 0) {
        streamHub?.broadcast(requestId, {
          type: 'chunk',
          requestId,
          ts: Date.now(),
          content: `Tools used: ${result.toolsUsed.join(', ')}\n`
        });
      }

      // Stream changes made
      if (STREAM_VERBOSE && result.changes.filesCreated?.length) {
        streamHub?.broadcast(requestId, {
          type: 'chunk',
          requestId,
          ts: Date.now(),
          content: `Files created: ${result.changes.filesCreated.join(', ')}\n`
        });
      }

      r.status = 'done';
      const endTime = Date.now();
      const execMs = Number(result.executionTime) || Math.max(0, endTime - (r.startedAt || endTime));
      const waitMs = Math.max(0, (r.startedAt || endTime) - r.createdAt);
      ewmaExecMs = ewmaUpdate(ewmaExecMs, execMs);
      ewmaWaitMs = ewmaUpdate(ewmaWaitMs, waitMs);
      ewmaSuccess = ewmaUpdate(ewmaSuccess, 1);
      r.result = {
        agentResult: result.result,
        toolsUsed: result.toolsUsed,
        executionTime: execMs,
        changes: result.changes
      };
      
      streamHub?.broadcast(requestId, {
        type: 'final',
        requestId,
        ts: Date.now(),
        result: r.result
      });
      
      reqCompleted.inc({ status: 'done' });
      logger.info({ requestId, toolsUsed: result.toolsUsed.length, executionTime: result.executionTime }, 'agent job completed');
    } else {
    r.status = 'error';
    r.error = result.error;
    
    // Update EWMAs with failure
    const endTime = Date.now();
    const execMs = Math.max(0, endTime - (r.startedAt || endTime));
    const waitMs = Math.max(0, (r.startedAt || endTime) - r.createdAt);
    ewmaExecMs = ewmaUpdate(ewmaExecMs, execMs);
    ewmaWaitMs = ewmaUpdate(ewmaWaitMs, waitMs);
    ewmaSuccess = ewmaUpdate(ewmaSuccess, 0);
    
    streamHub?.broadcast(requestId, {
        type: 'error',
        requestId,
        ts: Date.now(),
        message: result.error || 'Agent execution failed'
      });
      
      reqCompleted.inc({ status: 'error' });
      logger.error({ requestId, error: result.error }, 'agent job failed');
    }
  } catch (error) {
    r.status = 'error';
    r.error = error instanceof Error ? error.message : String(error);
    
    // Update EWMAs with failure
    const endTime = Date.now();
    const execMs = Math.max(0, endTime - (r.startedAt || endTime));
    const waitMs = Math.max(0, (r.startedAt || endTime) - r.createdAt);
    ewmaExecMs = ewmaUpdate(ewmaExecMs, execMs);
    ewmaWaitMs = ewmaUpdate(ewmaWaitMs, waitMs);
    ewmaSuccess = ewmaUpdate(ewmaSuccess, 0);
    
    streamHub?.broadcast(requestId, {
      type: 'error',
      requestId,
      ts: Date.now(),
      message: r.error
    });
    
    reqCompleted.inc({ status: 'error' });
    logger.error({ requestId, error: r.error }, 'agent job crashed');
  }
  
  r.updatedAt = Date.now();
}


// metrics/health server
if (METRICS_PORT > 0) {
  const srv = http.createServer(async (req, res) => {
    if (!req.url) { res.statusCode = 404; res.end(); return; }
    const u = new URL(req.url, 'http://localhost');
    logger.debug({ url: req.url, path: u.pathname }, 'metrics request');
    if (u.pathname === '/metrics') {
      res.setHeader('Content-Type', registry.contentType);
      res.end(await registry.metrics());
      return;
    }
    if (u.pathname === '/healthz') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, queue: qSize(), running }));
      return;
    }
    if (u.pathname === '/demo' || u.pathname.startsWith('/demo/')) {
      try {
        const msg = u.searchParams.get('msg') ?? 'Hello from demo';
        const agentId = u.searchParams.get('agent') ?? 'echo';
        const capability = u.searchParams.get('capability') ?? 'chat';
        const input = { messages: [{ role: 'user', content: msg }] };
        const r = await invokeAgentInternal({ agentId, capability, input });
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(r));
      } catch (e: any) {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, error: { message: String(e?.message || e) } }));
      }
      return;
    }
    res.statusCode = 404; res.end('not found');
  });
  srv.listen(METRICS_PORT, () => logger.info({ port: METRICS_PORT }, 'metrics server listening'));
}

// Expose over stdio for MCP clients; streaming is available via WebSocket side-channel
await server.connect(new StdioServerTransport());

process.on('SIGINT', () => { try { streamHub?.close(); } catch {} process.exit(0); });
process.on('SIGTERM', () => { try { streamHub?.close(); } catch {} process.exit(0); });

logger.info({ url: streamHub?.urlBase || 'stdio-only', maxConcurrency: MAX_CONCURRENCY }, 'A2A MCP server ready');

// Self-optimization loop: adjust concurrency based on EWMA wait/exec and success rate
if (AUTOTUNE_ENABLED) {
  setInterval(() => {
    try {
      // Heuristics:
      // - Increase if high wait but high success: under-provisioned
      // - Decrease if low success or long exec: overload or instability
      const incCond = ewmaSuccess > 0.95 && ewmaWaitMs > 1000 && running >= Math.max(1, Math.floor(MAX_CONCURRENCY * 0.8));
      const decCond = (ewmaSuccess < 0.85) || (ewmaExecMs > 15000);
      let newConc = MAX_CONCURRENCY;
      if (incCond) newConc = Math.min(MAX_CONCURRENCY_MAX, MAX_CONCURRENCY + 8);
      else if (decCond) newConc = Math.max(MAX_CONCURRENCY_MIN, Math.floor(MAX_CONCURRENCY * 0.75));
      if (newConc !== MAX_CONCURRENCY) {
        logger.warn({ from: MAX_CONCURRENCY, to: newConc, ewmaWaitMs, ewmaExecMs, ewmaSuccess }, 'autotune: adjusting concurrency');
        MAX_CONCURRENCY = newConc;
        // Persist tuning
        if (AUTOTUNE_PERSIST) {
          try {
            const file = path.resolve(PERF_TUNING_PATH);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, JSON.stringify({ maxConcurrency: MAX_CONCURRENCY, ts: Date.now() }, null, 2));
          } catch {}
        }
        // Immediately try to start more work if increased
        maybeStartNext();
      }

      // Dynamically throttle verbosity for performance
      if (decCond && STREAM_VERBOSE) {
        STREAM_VERBOSE = false;
        logger.warn('autotune: disabled verbose streaming');
      } else if (incCond && !STREAM_VERBOSE) {
        STREAM_VERBOSE = false; // keep off by default for speed
      }

      // Adjust logger level to reduce overhead under stress
      const desiredLevel = decCond ? 'error' : 'warn';
      if ((logger as any).level !== desiredLevel) {
        try { (logger as any).level = desiredLevel; } catch {}
      }
    } catch {}
  }, OPT_TUNE_INTERVAL_MS);
}
