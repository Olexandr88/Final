#!/usr/bin/env node
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import readline from 'readline';
import { getGlobalCoordinator } from './session-coordinator.js';

const BRIDGE_WS = process.env.BRIDGE_WS || 'ws://localhost:9567';
const BRIDGE_HTTP = process.env.BRIDGE_HTTP || 'http://localhost:9568';

// Initialize session coordination
const sessionCoordinator = getGlobalCoordinator();
const sessionId = sessionCoordinator.initialize();
console.log(`[Session: ${sessionId.slice(0, 8)}] Code Assistant starting\n`);

class CodeAssistant {
  constructor() {
    this.ws = null;
    this.pendingTasks = new Map();
    this.results = [];
    this.sessionCoordinator = sessionCoordinator;
  }

  async connect() {
    this.ws = new WebSocket(BRIDGE_WS);

    await new Promise((resolve, reject) => {
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
    });

    this.ws.send(JSON.stringify({
      type: 'register',
      clientId: 'code-assistant',
      role: 'orchestrator',
      intents: ['code.analysis_result', 'code.fix_result']
    }));

    await new Promise(r => this.ws.once('message', r));

    this.ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (Array.isArray(msg) && msg[0] === 'env') {
        this.handleResult(msg[1]);
      }
    });

    console.log('🤖 Code Assistant connected\n');
  }

  handleResult(envelope) {
    if (envelope.intent === 'code.analysis_result') {
      const analysis = envelope.payload.analysis;
      const filePath = envelope.payload.filePath;

      console.log(`\n📊 Analysis: ${filePath}`);
      console.log(`   Quality: ${analysis.quality_score || 'N/A'}/10`);

      if (analysis.bugs?.length > 0) {
        console.log(`   🐛 Bugs: ${analysis.bugs.length}`);
        analysis.bugs.forEach((bug, i) => console.log(`      ${i + 1}. ${bug}`));
      }

      if (analysis.security_issues?.length > 0) {
        console.log(`   🔒 Security: ${analysis.security_issues.length} issues`);
      }

      if (analysis.performance_issues?.length > 0) {
        console.log(`   ⚡ Performance: ${analysis.performance_issues.length} issues`);
      }

      this.results.push({ filePath, analysis });
    }

    if (envelope.intent === 'code.fix_result') {
      const filePath = envelope.payload.filePath;
      const fixedCode = envelope.payload.fixed_code;

      console.log(`\n✅ Fixed: ${filePath}`);
      console.log(`   Issues resolved: ${envelope.payload.issues_fixed}`);

      if (filePath && fixedCode) {
        const backupPath = `${filePath}.backup`;
        await fs.promises.copyFile(filePath, backupPath);
        await fs.promises.writeFile(filePath, fixedCode);
        console.log(`   💾 Saved (backup: ${path.basename(backupPath)})`);
      }

      this.results.push({ filePath, fixed: true });
    }
  }

  async analyzeFile(filePath) {
    const code = await fs.promises.readFile(filePath, 'utf8');
    const language = path.extname(filePath).slice(1) || 'javascript';

    this.ws.send(JSON.stringify({
      type: 'envelope',
      envelope: {
        intent: 'code.analyze',
        from: 'code-assistant',
        to: 'code-analyzer',
        payload: { code, language, filePath }
      }
    }));

    console.log(`📤 Analyzing ${filePath}...`);
  }

  async fixFile(filePath, issues = []) {
    const code = await fs.promises.readFile(filePath, 'utf8');
    const language = path.extname(filePath).slice(1) || 'javascript';

    this.ws.send(JSON.stringify({
      type: 'envelope',
      envelope: {
        intent: 'code.fix',
        from: 'code-assistant',
        to: 'code-fixer',
        payload: { code, language, filePath, issues }
      }
    }));

    console.log(`🔧 Fixing ${filePath}...`);
  }

  async scanDirectory(dir, pattern = '**/*.js') {
    console.log(`\n🔍 Scanning ${dir}/${pattern}\n`);

    const files = await glob(pattern, {
      cwd: dir,
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**']
    });

    console.log(`Found ${files.length} files\n`);

    for (const file of files) {
      try {
        await this.analyzeFile(file);
        await new Promise(r => setTimeout(r, 100)); // Rate limit
      } catch (err) {
        console.error(`❌ Error with ${file}:`, err.message);
      }
    }

    return files.length;
  }

  async interactive() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log('\n🤖 Interactive Code Assistant');
    console.log('Commands: analyze <file>, fix <file>, scan <dir>, results, exit\n');

    const prompt = () => {
      rl.question('> ', async (input) => {
        const [cmd, ...args] = input.trim().split(' ');

        switch (cmd) {
          case 'analyze':
            if (args[0]) await this.analyzeFile(args[0]);
            else console.log('Usage: analyze <file>');
            break;

          case 'fix':
            if (args[0]) await this.fixFile(args[0]);
            else console.log('Usage: fix <file>');
            break;

          case 'scan':
            await this.scanDirectory(args[0] || '.', args[1]);
            break;

          case 'results':
            console.log(`\n📊 Results: ${this.results.length} total`);
            this.results.forEach((r, i) => {
              console.log(`${i + 1}. ${r.filePath} - ${r.fixed ? 'Fixed' : 'Analyzed'}`);
            });
            break;

          case 'exit':
            console.log('\n👋 Goodbye!');
            rl.close();
            process.exit(0);
            return;

          default:
            console.log('Unknown command');
        }

        prompt();
      });
    };

    prompt();
  }

  close() {
    this.ws?.close();
  }
}

// Main
const assistant = new CodeAssistant();

const args = process.argv.slice(2);
const command = args[0];

assistant.connect().then(() => {
  if (command === 'analyze' && args[1]) {
    assistant.analyzeFile(args[1]).then(() => {
      setTimeout(() => process.exit(0), 5000);
    });
  } else if (command === 'fix' && args[1]) {
    assistant.fixFile(args[1]).then(() => {
      setTimeout(() => process.exit(0), 5000);
    });
  } else if (command === 'scan') {
    assistant.scanDirectory(args[1] || '.', args[2]).then(() => {
      setTimeout(() => process.exit(0), 10000);
    });
  } else if (command === 'interactive' || !command) {
    assistant.interactive();
  } else {
    console.log('Usage: code-assistant [analyze|fix|scan|interactive] [file/dir]');
    process.exit(1);
  }
}).catch(err => {
  console.error('❌ Connection failed:', err.message);
  console.log('\nMake sure bridge is running: npm run start:bridge');
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down...');
  assistant.close();
  process.exit(0);
});
