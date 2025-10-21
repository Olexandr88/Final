import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { agents, AgentDescriptor, ensureRequestId } from './agents.js';
import { StreamHub } from './streaming.js';
import { setTimeout as sleep } from 'timers/promises';

// In-memory requests state
type RequestStatus = 'queued' | 'running' | 'done' | 'error' | 'canceled';

type RequestRecord = {
  id: string;
  agentId: string;
  capability: string;
  status: RequestStatus;
  createdAt: number;
  updatedAt: number;
  error?: string;
  result?: unknown;
  idempotencyKey?: string;
  sessionId?: string;
};

type IdempotencyEntry = { requestId: string; expiresAt: number };

type QueueItem = { requestId: string; input: any };

const requests = new Map<string, RequestRecord>();
const idempotency = new Map<string, IdempotencyEntry>(); // idempotencyKey -> entry

const STREAM_PORT = parseInt(process.env.STREAM_PORT || '8787', 10);
const STREAM_HOST = process.env.STREAM_HOST || '127.0.0.1';
const MAX_CONCURRENCY = parseInt(process.env.MAX_CONCURRENCY || '4', 10);
const REQUEST_TTL_MS = parseInt(process.env.REQUEST_TTL_MS || String(5 * 60 * 1000), 10);
const IDEMP_TTL_MS = parseInt(process.env.IDEMP_TTL_MS || String(15 * 60 * 1000), 10);

const streamHub = new StreamHub(STREAM_PORT, STREAM_HOST);

function ok<T>(data: T) {
  return { ok: true, data };
}
function fail(message: string, code: string = 'ERR_BAD_REQUEST') {
  return { ok: false, error: { code, message } };
}

// Concurrency-limited queue
const queue: QueueItem[] = [];
let running = 0;

function maybeStartNext() {
  while (running < MAX_CONCURRENCY && queue.length > 0) {
    const item = queue.shift()!;
    const r = requests.get(item.requestId);
    if (!r || r.status === 'canceled') continue;
    startJob(item.requestId, item.input);
  }
}

async function startJob(requestId: string, input: any) {
  running++;
  try {
    await runEchoJob(requestId, input);
  } catch (err: any) {
    const r = requests.get(requestId);
    if (r) {
      r.status = 'error';
      r.error = String(err?.message || err);
      r.updatedAt = Date.now();
      streamHub.broadcast(requestId, {
        type: 'error',
        requestId,
        ts: Date.now(),
        message: r.error!,
      });
    }
  } finally {
    running = Math.max(0, running - 1);
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
        streamUrl: streamHub.channelUrl(entry.requestId),
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

  queue.push({ requestId, input });
  maybeStartNext();

  return ok({ requestId, status: rec.status, streamUrl: streamHub.channelUrl(requestId) });
}

const server = new Server(
  {
    name: 'a2a-mcp-server',
    version: '0.1.0',
  },
  {
    tools: {
      list_agents: {
        description: 'List available downstream agents',
        inputSchema: { type: 'object', additionalProperties: false, properties: {} },
        outputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            agents: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  version: { type: 'string' },
                  capabilities: { type: 'array' },
                },
                required: ['id', 'name', 'version', 'capabilities'],
              },
            },
          },
          required: ['agents'],
        },
        async handler() {
          const list = Object.values(agents) as AgentDescriptor[];
          return ok({ agents: list });
        },
      },

      describe_agent: {
        description: 'Describe a specific agent and its capabilities',
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
        outputSchema: { type: 'object' },
        async handler({ id }: { id: string }) {
          const a = agents[id];
          if (!a) return fail(`Unknown agent: ${id}`, 'ERR_NOT_FOUND');
          return ok(a);
        },
      },

      open_session: {
        description: 'Open a session for multi-call workflows',
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: { sessionId: { type: 'string' } },
        },
        outputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: { sessionId: { type: 'string' } },
          required: ['sessionId'],
        },
        async handler({ sessionId }: { sessionId?: string }) {
          const sid = ensureRequestId(sessionId);
          return ok({ sessionId: sid });
        },
      },

      close_session: {
        description: 'Close an existing session',
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: { sessionId: { type: 'string' } },
          required: ['sessionId'],
        },
        outputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: { closed: { type: 'boolean' } },
          required: ['closed'],
        },
        async handler() {
          return ok({ closed: true });
        },
      },

      invoke_agent: {
        description: 'Invoke an agent capability with streaming output over WebSocket',
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            agentId: { type: 'string' },
            capability: { type: 'string' },
            input: { type: 'object' },
            idempotencyKey: { type: 'string' },
            sessionId: { type: 'string' },
          },
          required: ['agentId', 'capability', 'input'],
        },
        outputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            requestId: { type: 'string' },
            status: { type: 'string' },
            streamUrl: { type: 'string' },
          },
          required: ['requestId', 'status', 'streamUrl'],
        },
        async handler({
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
          return invokeAgentInternal({ agentId, capability, input, idempotencyKey, sessionId });
        },
      },

      cancel: {
        description: 'Cancel a running request',
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: { requestId: { type: 'string' } },
          required: ['requestId'],
        },
        outputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: { canceled: { type: 'boolean' } },
          required: ['canceled'],
        },
        async handler({ requestId }: { requestId: string }) {
          const r = requests.get(requestId);
          if (!r) return fail(`Unknown requestId ${requestId}`, 'ERR_NOT_FOUND');
          if (r.status === 'done' || r.status === 'error') return ok({ canceled: false });
          r.status = 'canceled';
          r.updatedAt = Date.now();
          streamHub.broadcast(requestId, {
            type: 'error',
            requestId,
            ts: Date.now(),
            message: 'canceled',
          });
          return ok({ canceled: true });
        },
      },

      get_status: {
        description: 'Get request status',
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: { requestId: { type: 'string' } },
          required: ['requestId'],
        },
        outputSchema: { type: 'object' },
        async handler({ requestId }: { requestId: string }) {
          const r = requests.get(requestId);
          if (!r) return fail(`Unknown requestId ${requestId}`, 'ERR_NOT_FOUND');
          return ok(r);
        },
      },

      handoff: {
        description: 'Handoff payload to another agent within the same request/session',
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            fromRequestId: { type: 'string' },
            toAgentId: { type: 'string' },
            capability: { type: 'string' },
            payload: { type: 'object' },
          },
          required: ['fromRequestId', 'toAgentId', 'capability', 'payload'],
        },
        outputSchema: { type: 'object' },
        async handler({
          fromRequestId,
          toAgentId,
          capability,
          payload,
        }: {
          fromRequestId: string;
          toAgentId: string;
          capability: string;
          payload: any;
        }) {
          const parent = requests.get(fromRequestId);
          if (!parent) return fail(`Unknown fromRequestId ${fromRequestId}`, 'ERR_NOT_FOUND');
          // Delegate as a new invoke under same session
          return invokeAgentInternal({
            agentId: toAgentId,
            capability,
            input: payload,
            sessionId: parent.sessionId,
          });
        },
      },
    },
  } as any
);

async function runEchoJob(requestId: string, input: any) {
  const r = requests.get(requestId)!;
  r.status = 'running';
  r.updatedAt = Date.now();
  streamHub.broadcast(requestId, { type: 'start', requestId, ts: Date.now() });

  // Produce token-like chunks from the last user message
  const messages = input?.messages ?? [];
  const last = messages[messages.length - 1]?.content ?? '';
  const text = String(last);
  for (const token of text.split(/(\s+)/).filter(Boolean)) {
    await sleep(30 + Math.floor(Math.random() * 40));
    streamHub.broadcast(requestId, { type: 'chunk', requestId, ts: Date.now(), content: token });
    const rr = requests.get(requestId);
    if (!rr || rr.status === 'canceled') return; // stop streaming if canceled
  }

  r.status = 'done';
  r.updatedAt = Date.now();
  r.result = { echoed: text };
  streamHub.broadcast(requestId, { type: 'final', requestId, ts: Date.now(), result: r.result });
}

// Expose over stdio for MCP clients; streaming is available via WebSocket side-channel
await server.connect(new StdioServerTransport());

process.on('SIGINT', () => { try { streamHub.close(); } catch {} process.exit(0); });
process.on('SIGTERM', () => { try { streamHub.close(); } catch {} process.exit(0); });

console.error(`A2A MCP server ready. Streaming at ${streamHub.urlBase} | maxConcurrency=${MAX_CONCURRENCY}`);
