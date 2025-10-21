import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

function respond(id, result, error) {
  const msg = { jsonrpc: '2.0', id };
  if (error) msg.error = { code: -32000, message: String(error.message || error) };
  else msg.result = result;
  process.stdout.write(JSON.stringify(msg) + '\n');
}

rl.on('line', async (line) => {
  if (!line.trim()) return;
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = req || {};
  try {
    switch (method) {
      case 'health':
        return respond(id, { status: 'ok', ts: Date.now() });
      case 'foo': {
        const n = params?.n ?? 0;
        await new Promise((r) => setTimeout(r, 75));
        return respond(id, { sum: n + 1 });
      }
      case 'bar': {
        const q = params?.q ?? '';
        return respond(id, { echo: q });
      }
      default:
        return respond(id, null, new Error('Method not found'));
    }
  } catch (e) {
    return respond(id, null, e);
  }
});
