import { call, batch } from './mcpClient.js';
import { createStdioTransport } from './stdioTransport.js';

const CMD = process.env.MCP_SERVER_CMD || 'node';
const ARGS = (process.env.MCP_SERVER_ARGS && process.env.MCP_SERVER_ARGS.split(' ')) || [
  'server.js',
];
const doFetch = createStdioTransport({ command: CMD, args: ARGS });

(async () => {
  const single = await call('health', {}, doFetch);
  console.log('single:', single);

  const results = await batch(
    [
      { method: 'foo', params: { n: 1 } },
      { method: 'foo', params: { n: 1 } }, // coalesced + cached + coalesced in-flight
      { method: 'bar', params: { q: 'x' } },
    ],
    doFetch
  );
  console.log('batch:', results);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
