import pLimit from 'p-limit';

const limit = pLimit(Number(process.env.MCP_MAX_CONCURRENCY || 8));
const REQ_TIMEOUT = Number(process.env.MCP_REQUEST_TIMEOUT_MS || 20000);
const MAX_RETRIES = Number(process.env.MCP_MAX_RETRIES || 2);
const RETRY_BASE = Number(process.env.MCP_RETRY_BASE_MS || 250);
const MAX_BACKOFF = Number(process.env.MCP_MAX_BACKOFF_MS || 30000);
const JITTER_PCT = Number(process.env.MCP_JITTER_PCT || 0.3);
const CACHE_TTL = Number(process.env.MCP_CACHE_TTL_MS || 60000);

const cache = new Map(); // key -> {exp:number, val:any}
const inflight = new Map(); // key -> Promise
let rateLimitUntil = 0; // epoch ms to respect Retry-After across calls

function key(method, params) {
  return `${method}:${JSON.stringify(params)}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryAfter(h) {
  if (!h) return null;
  if (Array.isArray(h)) h = h[0];
  if (typeof h !== 'string') return null;
  // Seconds or HTTP-date
  const s = h.trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Math.ceil(parseFloat(s) * 1000);
  const when = Date.parse(s);
  if (!Number.isNaN(when)) return Math.max(0, when - Date.now());
  return null;
}

function computeBackoff(attempt, err) {
  let backoff = RETRY_BASE * 2 ** attempt;
  const headers = err?.response?.headers || err?.headers || {};
  const retryAfter = parseRetryAfter(headers['retry-after'] || headers['Retry-After']);
  let reset = headers['x-ratelimit-reset'] || headers['X-RateLimit-Reset'];
  let resetMs = null;
  if (reset) {
    if (/^\d+$/.test(String(reset))) {
      const n = Number(reset);
      // Heuristic: unix seconds vs ms
      resetMs = n > 1e12 ? n - Date.now() : Math.max(0, n * 1000 - Date.now());
    } else {
      const d = Date.parse(String(reset));
      if (!Number.isNaN(d)) resetMs = Math.max(0, d - Date.now());
    }
  }
  if (retryAfter != null) backoff = Math.max(backoff, retryAfter);
  if (resetMs != null) backoff = Math.max(backoff, resetMs);
  backoff = Math.min(backoff, MAX_BACKOFF);
  const jitter = backoff * JITTER_PCT * Math.random();
  return Math.floor(backoff - jitter / 2 + jitter);
}

function isRetryable(err) {
  const status = err?.response?.status ?? err?.status;
  if (status === 429 || status === 408 || status === 425 || status === 409) return true;
  if (typeof status === 'number' && status >= 500 && status < 600) return true;
  const code = (err?.code || err?.cause?.code || '').toString();
  const transient = new Set(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETDOWN', 'ENETRESET', 'ENETUNREACH', 'EHOSTUNREACH']);
  if (transient.has(code)) return true;
  if (err?.name === 'AbortError' || /timeout/i.test(String(err?.message))) return true;
  return false;
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
  let lastErr;
  for (let i = 0; i <= MAX_RETRIES; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isRetryable(e) || i === MAX_RETRIES) break;
      const delay = computeBackoff(i, e);
      const status = e?.response?.status ?? e?.status;
      if (status === 429) rateLimitUntil = Math.max(rateLimitUntil, Date.now() + delay);
      await sleep(delay);
    }
  }
  throw lastErr;
}

async function rateLimitGate() {
  const wait = Math.max(0, rateLimitUntil - Date.now());
  if (wait > 0) await sleep(wait);
}

export async function call(method, params, doFetch) {
  const k = key(method, params);
  const now = Date.now();
  const c = cache.get(k);
  if (c && c.exp > now) return c.val;

  if (inflight.has(k)) return inflight.get(k);

  const run = limit(async () => {
    await rateLimitGate();
    const val = await retry(() =>
      withTimeout((signal) => doFetch({ method, params, signal }), REQ_TIMEOUT)
    );
    cache.set(k, { exp: Date.now() + CACHE_TTL, val });
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
