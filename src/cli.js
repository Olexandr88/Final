#!/usr/bin/env node
import { program } from 'commander';
import WebSocket from 'ws';
import readline from 'readline';

const BRIDGE_WS = process.env.BRIDGE_WS || 'ws://localhost:4567';
const BRIDGE_HTTP = process.env.BRIDGE_HTTP || 'http://localhost:4568';

program
  .name('ai-bridge-cli')
  .description('CLI for interacting with AI Bridge')
  .version('1.0.0');

program
  .command('status')
  .description('Check bridge server status')
  .action(async () => {
    try {
      const res = await fetch(`${BRIDGE_HTTP}/api/status`);
      const data = await res.json();
      console.log('✅ Bridge Status:', data.status);
      console.log(`   Connected: ${data.performance.connectedClients} agents`);
      console.log(`   Messages: ${data.performance.messagesProcessed}`);
      console.log(`   Uptime: ${data.uptime}s`);
    } catch (err) {
      console.error('❌ Bridge offline:', err.message);
      process.exit(1);
    }
  });

program
  .command('agents')
  .description('List connected agents')
  .action(async () => {
    try {
      const res = await fetch(`${BRIDGE_HTTP}/agents`);
      const data = await res.json();
      if (data.agents.length === 0) {
        console.log('No agents connected');
      } else {
        console.log(`\n📋 Connected Agents (${data.agents.length}):\n`);
        data.agents.forEach(agent => {
          console.log(`  • ${agent.id}`);
          console.log(`    Role: ${agent.role}`);
          console.log(`    Skills: ${agent.skills?.join(', ') || 'none'}`);
          console.log(`    Connected: ${new Date(agent.connectedAt).toLocaleString()}\n`);
        });
      }
    } catch (err) {
      console.error('❌ Error:', err.message);
      process.exit(1);
    }
  });

program
  .command('send <to> <message>')
  .description('Send message to agent')
  .option('-i, --intent <intent>', 'Message intent', 'user.message')
  .action(async (to, message, options) => {
    try {
      const res = await fetch(`${BRIDGE_HTTP}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          intent: options.intent,
          from: 'cli',
          payload: { text: message }
        })
      });
      const data = await res.json();
      console.log('✅ Message queued:', data.envelope.id);
    } catch (err) {
      console.error('❌ Error:', err.message);
      process.exit(1);
    }
  });

program
  .command('chat')
  .description('Start interactive chat session')
  .option('-r, --role <role>', 'Agent role to chat with', 'assistant')
  .action(async (options) => {
    const ws = new WebSocket(BRIDGE_WS);
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    console.log(`🤖 Connected to bridge. Chatting with role: ${options.role}\n`);

    // Register as CLI user
    ws.send(JSON.stringify({
      type: 'register',
      clientId: 'cli-user',
      role: 'user',
      intents: ['agent.response', 'user.message']
    }));

    await new Promise(r => ws.once('message', r));

    // Listen for responses
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (Array.isArray(msg) && msg[0] === 'env') {
        const env = msg[1];
        if (env.intent === 'agent.response' && env.payload?.text) {
          console.log(`\n${env.from}: ${env.payload.text}\n`);
          rl.prompt();
        }
      }
    });

    rl.setPrompt('You: ');
    rl.prompt();

    rl.on('line', (line) => {
      const text = line.trim();
      if (!text) {
        rl.prompt();
        return;
      }
      if (text === '/quit' || text === '/exit') {
        console.log('👋 Goodbye!');
        rl.close();
        ws.close();
        process.exit(0);
      }

      ws.send(JSON.stringify({
        type: 'envelope',
        envelope: {
          intent: 'user.message',
          from: 'cli-user',
          role: options.role,
          payload: { text }
        }
      }));
      rl.prompt();
    });

    rl.on('close', () => {
      ws.close();
      process.exit(0);
    });
  });

program
  .command('history')
  .description('View message history')
  .option('-l, --limit <n>', 'Number of messages', '10')
  .action(async (options) => {
    try {
      const res = await fetch(`${BRIDGE_HTTP}/history?limit=${options.limit}`);
      const data = await res.json();
      console.log(`\n📜 Recent History (${data.history.length}):\n`);
      data.history.forEach(msg => {
        console.log(`  ${msg.timestamp}`);
        console.log(`  ${msg.from} → ${msg.to || 'broadcast'}`);
        console.log(`  Intent: ${msg.intent}`);
        console.log(`  Payload: ${JSON.stringify(msg.payload).slice(0, 100)}\n`);
      });
    } catch (err) {
      console.error('❌ Error:', err.message);
      process.exit(1);
    }
  });

program.parse();
