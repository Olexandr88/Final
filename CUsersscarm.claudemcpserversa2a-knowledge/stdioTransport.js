import { spawn } from 'node:child_process';
import { EOL } from 'node:os';

export function createStdioTransport({
  command,
  args = [],
  env = process.env,
  restartBackoffMs = 500,
}) {
  let child = null;
  let buffer = '';
  let nextId = 1;
  const pending = new Map(); // id -> {resolve,reject}

  function start() {
    if (child && !child.killed) return;
    child = spawn(command, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += String(chunk);
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg && Object.prototype.hasOwnProperty.call(msg, 'id')) {
            const entry = pending.get(msg.id);
            if (entry) {
              pending.delete(msg.id);
              if (msg.error)
                entry.reject(
                  Object.assign(new Error(msg.error.message || 'RPC error'), {
                    code: msg.error.code,
                    data: msg.error.data,
                  })
                );
              else entry.resolve(msg.result);
            }
          }
        } catch (_) {
          // ignore parse errors
        }
      }
    });

    child.on('exit', () => {
      // Reject all inflight
      for (const [id, entry] of pending.entries()) {
        entry.reject(new Error('Server exited'));
        pending.delete(id);
      }
      // attempt restart
      setTimeout(() => start(), restartBackoffMs);
    });
  }

  start();

  return async function doFetch({ method, params, signal }) {
    start();
    const id = nextId++;
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + EOL;

    return new Promise((resolve, reject) => {
      const entry = { resolve, reject };
      pending.set(id, entry);

      const onAbort = () => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        }
      };
      if (signal) {
        if (signal.aborted) return onAbort();
        signal.addEventListener('abort', onAbort, { once: true });
      }

      try {
        child.stdin.write(payload);
      } catch (e) {
        pending.delete(id);
        reject(e);
      }
    });
  };
}
