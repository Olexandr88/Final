#!/usr/bin/env node

/**
 * System Control - Master control script for LLM Framework
 * One command to rule them all - development workflow automation
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';

const execAsync = promisify(exec);

const ACTIONS = {
  'status': {
    desc: 'Show complete system status',
    async run() {
      console.log('📊 LLM Framework System Status\n');
      console.log('━'.repeat(60));

      // Git status
      try {
        const { stdout: branch } = await execAsync('git branch --show-current');
        const { stdout: status } = await execAsync('git status --short');
        const lines = status.split('\n').filter(l => l.trim());

        console.log('📂 Git:');
        console.log(`  Branch: ${branch.trim()}`);
        console.log(`  Modified: ${lines.filter(l => l.startsWith(' M')).length}`);
        console.log(`  Staged: ${lines.filter(l => l.startsWith('M ')).length}`);
        console.log(`  Untracked: ${lines.filter(l => l.startsWith('??')).length}`);
      } catch (err) {
        console.log('  ❌ Not a git repository');
      }

      console.log('');

      // Bridge status
      console.log('🌉 AI Bridge:');
      const bridgePorts = [65028, 65029];
      for (const port of bridgePorts) {
        try {
          const { stdout } = await execAsync(`netstat -an | findstr :${port}`);
          if (stdout.trim()) {
            console.log(`  ✅ Port ${port} - Active`);
          } else {
            console.log(`  ⭕ Port ${port} - Not running`);
          }
        } catch {
          console.log(`  ⭕ Port ${port} - Not running`);
        }
      }

      console.log('');

      // Node processes
      console.log('📦 Node.js Processes:');
      try {
        const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq node.exe" /NH');
        const processes = stdout.split('\n').filter(l => l.includes('node.exe'));
        console.log(`  Running: ${processes.length}`);
      } catch {
        console.log('  Running: 0');
      }

      console.log('');

      // Test status
      console.log('🧪 Tests:');
      try {
        const { stdout } = await execAsync('find tests -name "*.test.js" | wc -l');
        console.log(`  Test files: ${stdout.trim()}`);
      } catch {
        console.log('  Test files: Unknown');
      }

      console.log('\n' + '━'.repeat(60));
    }
  },

  'start': {
    desc: 'Start AI Bridge and agents',
    async run() {
      console.log('🚀 Starting AI Bridge System...\n');

      const proc = spawn('npm', ['run', 'system:start'], {
        stdio: 'inherit',
        shell: true
      });

      return new Promise(resolve => proc.on('close', resolve));
    }
  },

  'stop': {
    desc: 'Stop all AI Bridge processes',
    async run() {
      console.log('🛑 Stopping AI Bridge System...\n');

      const ports = [65028, 65029];
      let killed = 0;

      for (const port of ports) {
        try {
          const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
          const match = stdout.match(/LISTENING\s+(\d+)/);
          if (match) {
            const pid = match[1];
            await execAsync(`taskkill /PID ${pid} /F`);
            console.log(`  ✅ Killed process ${pid} on port ${port}`);
            killed++;
          }
        } catch {}
      }

      if (killed === 0) {
        console.log('  ℹ️  No processes to kill');
      } else {
        console.log(`\n  Stopped ${killed} process(es)`);
      }
    }
  },

  'test': {
    desc: 'Run quick tests',
    async run(args) {
      const pattern = args[0] || 'basic';
      console.log(`🧪 Running tests: ${pattern}\n`);

      const proc = spawn('npm', ['run', 'quick-test', pattern], {
        stdio: 'inherit',
        shell: true
      });

      return new Promise(resolve => proc.on('close', resolve));
    }
  },

  'clean': {
    desc: 'Clean workspace',
    async run() {
      console.log('🧹 Cleaning workspace...\n');

      const proc = spawn('npm', ['run', 'workspace:clean'], {
        stdio: 'inherit',
        shell: true
      });

      return new Promise(resolve => proc.on('close', resolve));
    }
  },

  'diagnostic': {
    desc: 'Run full system diagnostic',
    async run() {
      console.log('🔍 Running diagnostics...\n');

      const proc = spawn('bash', ['scripts/ai-bridge-diagnostic.sh'], {
        stdio: 'inherit',
        shell: true
      });

      return new Promise(resolve => proc.on('close', resolve));
    }
  },

  'dev': {
    desc: 'Start development mode (bridge + watch)',
    async run() {
      console.log('💻 Starting development mode...\n');

      const proc = spawn('npm', ['run', 'dev'], {
        stdio: 'inherit',
        shell: true
      });

      return new Promise(resolve => proc.on('close', resolve));
    }
  },

  'reset': {
    desc: 'Complete reset (stop + clean + status)',
    async run() {
      console.log('🔄 Resetting system...\n');

      await ACTIONS.stop.run();
      console.log('');
      await ACTIONS.clean.run();
      console.log('');
      await ACTIONS.status.run();
    }
  },

  'health': {
    desc: 'Quick health check',
    async run() {
      console.log('❤️  Health Check\n');
      console.log('━'.repeat(60));

      // Bridge health
      try {
        const { stdout } = await execAsync('curl -s http://localhost:65029/health');
        const health = JSON.parse(stdout);
        console.log('🌉 AI Bridge:');
        console.log(`  Status: ${health.status}`);
        console.log(`  Uptime: ${(health.uptime / 60).toFixed(2)} minutes`);
        console.log(`  Clients: ${health.connectedClients}`);
      } catch {
        console.log('🌉 AI Bridge: ❌ Not responding');
      }

      console.log('');

      // Disk usage
      console.log('💾 Disk:');
      try {
        const { stdout } = await execAsync('du -sh node_modules .git 2>nul || echo "N/A"');
        console.log(`  ${stdout.trim() || 'Unable to check'}`);
      } catch {
        console.log('  Unable to check');
      }

      console.log('\n' + '━'.repeat(60));
    }
  },

  'quick': {
    desc: 'Quick workflow: stop + clean + test + start',
    async run() {
      console.log('⚡ Quick Workflow\n');

      console.log('1️⃣  Stopping processes...');
      await ACTIONS.stop.run();

      console.log('\n2️⃣  Cleaning workspace...');
      await ACTIONS.clean.run();

      console.log('\n3️⃣  Running basic tests...');
      await ACTIONS.test.run(['basic']);

      console.log('\n4️⃣  Starting system...');
      await ACTIONS.start.run();
    }
  },

  'info': {
    desc: 'Show system information',
    async run() {
      console.log('ℹ️  System Information\n');
      console.log('━'.repeat(60));

      try {
        const pkg = JSON.parse(await readFile('package.json', 'utf-8'));

        console.log('📦 Project:');
        console.log(`  Name: ${pkg.name}`);
        console.log(`  Version: ${pkg.version}`);
        console.log(`  Node: ${process.version}`);
        console.log('');

        console.log('🛠️  Tools:');
        console.log(`  Scripts: ${Object.keys(pkg.scripts).length}`);
        console.log(`  Dependencies: ${Object.keys(pkg.dependencies || {}).length}`);
        console.log(`  DevDependencies: ${Object.keys(pkg.devDependencies || {}).length}`);
        console.log('');

        console.log('📝 Commands:');
        console.log('  npm run control <action>');
        console.log('  npm run quick-test <pattern>');
        console.log('  npm run dev:helper <cmd>');
      } catch (err) {
        console.log('  ❌ Unable to read package.json');
      }

      console.log('\n' + '━'.repeat(60));
    }
  }
};

async function main() {
  const action = process.argv[2];
  const args = process.argv.slice(3);

  console.log('🎮 LLM Framework System Control\n');

  if (!action || action === 'help') {
    console.log('Available actions:\n');
    Object.entries(ACTIONS).forEach(([name, cmd]) => {
      console.log(`  ${name.padEnd(12)} - ${cmd.desc}`);
    });
    console.log('\nUsage: npm run control <action> [args]');
    console.log('\nExamples:');
    console.log('  npm run control status');
    console.log('  npm run control start');
    console.log('  npm run control test basic');
    console.log('  npm run control quick');
    return;
  }

  const cmd = ACTIONS[action];
  if (!cmd) {
    console.log(`❌ Unknown action: ${action}`);
    console.log('Run "npm run control help" for available actions');
    process.exit(1);
  }

  console.log('');
  await cmd.run(args);
  console.log('\n✨ Done!');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
