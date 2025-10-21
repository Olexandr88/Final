// Generate MULTI-AGENT-STATUS.md from live processes
import fs from 'fs';
import path from 'path';
import { startBridge } from '../src/ai-bridge.js';
import { queryAll, startAgents, stopAgents } from '../src/process-manager.js';

async function main() {
  const bridge = startBridge();
  const children = startAgents();
  const statuses = await queryAll(children);
  stopAgents(children);
  bridge.httpServer.close();
  bridge.wsServer.close();

  const now = new Date().toISOString();
  const md = [];
  md.push('# 🤖 LIVE MULTI-AGENT STATUS');
  md.push(`Generated: ${now}`);
  md.push('');
  md.push('## Agents');
  md.push('| Agent | PID | Uptime (s) | Ticks | Capabilities |');
  md.push('|-------|-----|------------|-------|--------------|');
  for (const s of statuses) {
    if (s.error) {
      md.push(`| unknown | ${s.pid} | timeout | - | - |`);
    } else {
      md.push(`| ${s.agent} | ${s.pid} | ${s.uptime.toFixed(1)} | ${s.ticks} | ${(s.capabilities||[]).join(', ')} |`);
    }
  }
  md.push('');
  md.push('## Summary');
  md.push(`Total Agents: ${statuses.length}`);
  md.push('Note: This file is generated from live processes, not a static template.');

  fs.writeFileSync(path.resolve('MULTI-AGENT-STATUS.md'), md.join('\n'));
  console.log('Status report updated.');
}

main().catch(e => {
  console.error('Failed to generate status report', e);
  process.exit(1);
});
