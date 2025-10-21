import pLimit from 'p-limit';

const limit = pLimit(Number(process.env.MCP_MAX_CONCURRENCY || 8));
const REQ_TIMEOUT = Number(process.env.MCP_REQUEST_TIMEOUT_MS || 20000);
const MAX_RETRIES = Number(process.env.MCP_MAX_RETRIES || 2);
const RETRY_BASE = Number(process.env.MCP_RETRY_BASE_MS || 250);
const CACHE_TTL = Number(process.env.MCP_CACHE_TTL_MS || 60000);

const cache = new Map(); // key -> {exp:number, val:any}
const inflight = new Map(); // key -> Promise

function key(method, params) {
  return `${method}:${JSON.stringify(params)}`;
}

async function withTimeout(p, ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort('timeout'), ms);
  try {
    return await p(ac.signal);
  } finally {
    clearTimeout(t);
  }
}

async function retry(fn) {
  let err;
  for (let i = 0; i <= MAX_RETRIES; i++) {
    try {
      return await fn();
    } catch (e) {
      err = e;
      await new Promise((r) => setTimeout(r, RETRY_BASE * 2 ** i));
    }
  }
  throw err;
}

export async function call(method, params, doFetch) {
  const k = key(method, params);
  const now = Date.now();
  const c = cache.get(k);
  if (c && c.exp > now) return c.val;

  if (inflight.has(k)) return inflight.get(k);

  const run = limit(async () => {
    const val = await retry(() =>
      withTimeout((signal) => doFetch({ method, params, signal }), REQ_TIMEOUT)
    );
    cache.set(k, { exp: now + CACHE_TTL, val });
    inflight.delete(k);
    return val;
  });

  const p = run;
  inflight.set(k, p);
  return p;
}

export async function batch(calls, doFetch) {
  return Promise.allSettled(calls.map((c) => call(c.method, c.params, doFetch)));
}
