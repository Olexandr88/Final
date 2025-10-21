#!/usr/bin/env node
import { program } from 'commander';
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import WebSocket from 'ws';
import { randomUUID } from 'crypto';

const BRIDGE_HTTP = process.env.BRIDGE_HTTP || 'http://localhost:9568';
const BRIDGE_WS = process.env.BRIDGE_WS || 'ws://localhost:9567';

async function connectAndWaitForResponse(requestEnvelope, expectedIntent, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BRIDGE_WS);
    const taskId = randomUUID();
    const clientId = 'cli-' + randomUUID().slice(0, 8);
    let responded = false;

    const timeoutId = setTimeout(() => {
      if (!responded) {
        ws.close();
        reject(new Error('Response timeout'));
      }
    }, timeout);

    ws.on('open', () => {
      // Register
      ws.send(JSON.stringify({
        type: 'register',
        clientId,
        role: 'cli',
        labels: ['interactive'],
        intents: ['code.analysis', 'code.fixed']
      }));

      // Send request after a brief delay to ensure registration
      setTimeout(() => {
        console.log(`📤 Sending ${requestEnvelope.intent} request...`);
        ws.send(JSON.stringify({
          type: 'envelope',
          envelope: {
            ...requestEnvelope,
            from: clientId,  // Use the same clientId we registered with
            taskId,
            timestamp: new Date().toISOString()
          }
        }));
      }, 500);
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'registered') {
          console.log('✅ Registered with bridge');
          return;
        }

        // Handle envelope format: ['env', envelope]
        if (Array.isArray(message) && message[0] === 'env') {
          const envelope = message[1];
          console.log(`📬 Received: ${envelope.intent} from ${envelope.from}`);

          // Ignore echoes of our own requests - only accept responses from agents
          if (envelope.from === clientId) {
            console.log('   (ignoring echo of own message)');
            return;
          }

          // Only accept responses with the expected intent
          if (envelope.taskId === taskId && envelope.intent === expectedIntent && !responded) {
            responded = true;
            clearTimeout(timeoutId);
            ws.close();
            resolve(envelope);
          } else if (envelope.taskId === taskId) {
            console.log(`   (ignoring unexpected intent: ${envelope.intent}, expected: ${expectedIntent})`);
          }
        }
      } catch (err) {
        console.error('Parse error:', err.message);
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });
  });
}

program
  .name('code-assistant')
  .description('AI-powered code assistant with multi-agent analysis')
  .version('1.0.0');

program
  .command('analyze <file>')
  .description('Analyze a code file for issues')
  .action(async (file) => {
    try {
      if (!fs.existsSync(file)) {
        console.error(`❌ File not found: ${file}`);
        process.exit(1);
      }

      const code = await fs.promises.readFile(file, 'utf8');
      console.log(`🔍 Analyzing ${file}...\n`);

      const response = await connectAndWaitForResponse({
        intent: 'code.analyze',
        from: 'cli',
        payload: {
          code,
          filepath: file
        }
      }, 'code.analysis_result');

      if (!response.payload || !response.payload.analysis) {
        console.error(`❌ Invalid response format:`, JSON.stringify(response, null, 2));
        process.exit(1);
      }

      const { analysis } = response.payload;

      console.log(`\n📊 Analysis Results:\n`);

      // Handle different response formats
      if (analysis.error) {
        console.error(`❌ Analysis error: ${analysis.error}\n`);
        process.exit(1);
      }

      if (analysis.metrics) {
        console.log(`   Lines: ${analysis.metrics.lines}`);
        console.log(`   Complexity: ${analysis.metrics.complexity}`);
        console.log(`   Errors: ${analysis.metrics.errorCount}`);
        console.log(`   Warnings: ${analysis.metrics.warningCount}`);
        console.log(`   Info: ${analysis.metrics.infoCount}\n`);
      } else {
        // Alternative format from analyzer agent
        console.log(`   Quality Score: ${analysis.quality_score || 'N/A'}`);
        if (analysis.bugs) console.log(`   Bugs: ${analysis.bugs.length}`);
        if (analysis.security_issues) console.log(`   Security: ${analysis.security_issues.length}`);
        if (analysis.performance_issues) console.log(`   Performance: ${analysis.performance_issues.length}\n`);
      }

      // Display issues if available
      if (analysis.issues && analysis.issues.length > 0) {
        console.log(`🐛 Found ${analysis.issues.length} issue(s):\n`);
        analysis.issues.forEach((issue, idx) => {
          const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
          console.log(`${icon} Line ${issue.line}: ${issue.message}`);
          console.log(`   ${issue.code}`);
          if (issue.fix) {
            console.log(`   Fix: ${issue.fix}`);
          }
          console.log();
        });
      } else if (analysis.bugs || analysis.security_issues || analysis.performance_issues) {
        // Show alternative format issues
        if (analysis.bugs?.length > 0) {
          console.log(`🐛 Bugs:\n`);
          analysis.bugs.forEach(bug => console.log(`   - ${bug}`));
          console.log();
        }
        if (analysis.security_issues?.length > 0) {
          console.log(`🔒 Security Issues:\n`);
          analysis.security_issues.forEach(issue => console.log(`   - ${issue}`));
          console.log();
        }
        if (analysis.performance_issues?.length > 0) {
          console.log(`⚡ Performance Issues:\n`);
          analysis.performance_issues.forEach(issue => console.log(`   - ${issue}`));
          console.log();
        }
      } else {
        console.log('✅ No issues found!\n');
      }
    } catch (err) {
      console.error('❌ Error:', err.message);
      process.exit(1);
    }
  });

program
  .command('fix <file>')
  .description('Auto-fix issues in a code file')
  .option('-i, --issues <issues...>', 'Specific issues to fix')
  .action(async (file, options) => {
    try {
      const code = await fs.promises.readFile(file, 'utf8');
      const language = path.extname(file).slice(1) || 'javascript';
      const issues = options.issues || ['all detected issues'];

      console.log(`🔧 Fixing ${file}...\n`);

      const res = await fetch(`${BRIDGE_HTTP}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'code.fix',
          from: 'code-assistant-cli',
          to: 'code-fixer',
          payload: {
            code,
            language,
            filePath: file,
            issues
          }
        })
      });

      if (!res.ok) {
        console.error('❌ Failed to send fix request');
        process.exit(1);
      }

      console.log('✅ Fix requested - check agent logs for results\n');
    } catch (err) {
      console.error('❌ Error:', err.message);
      process.exit(1);
    }
  });

program
  .command('scan [dir]')
  .description('Scan directory for code quality issues')
  .option('-p, --pattern <pattern>', 'File pattern', '**/*.js')
  .action(async (dir = '.', options) => {
    try {
      console.log(`🔍 Scanning ${dir} for ${options.pattern}...\n`);

      const files = await glob(options.pattern, {
        cwd: dir,
        absolute: true,
        ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**']
      });

      console.log(`Found ${files.length} files\n`);

      for (const file of files.slice(0, 5)) {
        const code = await fs.promises.readFile(file, 'utf8');
        const language = path.extname(file).slice(1);

        await fetch(`${BRIDGE_HTTP}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            intent: 'code.analyze',
            from: 'code-assistant-cli',
            to: 'code-analyzer',
            payload: {
              code: code.slice(0, 5000), // Limit size
              language,
              filePath: file
            }
          })
        });

        console.log(`📤 Queued: ${path.basename(file)}`);
      }

      console.log(`\n✅ Scan complete - ${files.length} files queued\n`);
    } catch (err) {
      console.error('❌ Error:', err.message);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Check system status')
  .action(async () => {
    try {
      const res = await fetch(`${BRIDGE_HTTP}/agents`);
      const data = await res.json();

      console.log('\n🤖 AI Code Assistant Status\n');
      console.log(`Connected agents: ${data.agents.length}\n`);

      data.agents.forEach(agent => {
        console.log(`  • ${agent.id} (${agent.role})`);
        console.log(`    Skills: ${agent.skills?.join(', ') || 'none'}\n`);
      });

      const expected = ['code-analyzer', 'code-fixer'];
      const missing = expected.filter(id => !data.agents.find(a => a.id === id));

      if (missing.length > 0) {
        console.log(`⚠️  Missing agents: ${missing.join(', ')}\n`);
        console.log('Start with: npm run agents:start\n');
      } else {
        console.log('✅ All agents ready\n');
      }
    } catch (err) {
      console.error('❌ Bridge offline:', err.message);
      console.log('\nStart with: npm run start:bridge\n');
      process.exit(1);
    }
  });

program.parse();
