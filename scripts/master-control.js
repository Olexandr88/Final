#!/usr/bin/env node
/**
 * Master Control - Central hub for all system utilities
 * Integrates shell_one_liners.sh patterns with Node.js tooling
 */

import { exec, execSync } from 'child_process';
import { createInterface } from 'readline';
import { promisify } from 'util';

const execAsync = promisify(exec);

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(msg, color = 'reset') {
  console.log(`${COLORS[color]}${msg}${COLORS.reset}`);
}

function header(title) {
  console.clear();
  log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
  log(`║  ${title.padEnd(56)}  ║`, 'cyan');
  log('╚════════════════════════════════════════════════════════════╝\n', 'cyan');
}

const TOOLS = {
  performance: {
    name: 'Performance Tools',
    items: [
      { key: '1', name: 'Quick System Check', cmd: 'node scripts/quick-fix.js' },
      {
        key: '2',
        name: 'Process Cleanup (Kill Zombies)',
        cmd: 'powershell -ExecutionPolicy Bypass -File scripts/ai-process-cleaner.ps1 -Kill',
      },
      { key: '3', name: 'Live Monitor Dashboard', cmd: 'bash scripts/live-monitor.sh' },
      { key: '4', name: 'Full Health Scan', cmd: 'bash scripts/ai-system-health.sh' },
      { key: '5', name: 'Performance Optimizer', cmd: 'node scripts/performance-optimizer.js' },
    ],
  },
  network: {
    name: 'Network & Debugging',
    items: [
      { key: '6', name: 'Port Hunter (65028)', cmd: 'bash scripts/port-hunter.sh 65028' },
      {
        key: '7',
        name: 'Network Debug Agent',
        cmd: 'bash scripts/network-debug-agent.sh localhost 65028',
      },
      { key: '8', name: 'Check AI Bridge Status', cmd: 'netstat -ano | findstr "65028"' },
    ],
  },
  testing: {
    name: 'Testing & Quality',
    items: [
      { key: '9', name: 'Run Tests (Fast)', cmd: 'npm run test:fast' },
      { key: 'a', name: 'Run Tests (Standard)', cmd: 'npm test' },
      { key: 'b', name: 'Run Lint Check', cmd: 'npm run lint' },
      { key: 'c', name: 'Run Lint Fix', cmd: 'npm run lint:fix' },
    ],
  },
  aibridge: {
    name: 'AI Bridge Control',
    items: [
      { key: 'd', name: 'Start AI Bridge', cmd: 'npm run start:bridge' },
      { key: 'e', name: 'Start Full System', cmd: 'npm run system:start' },
      { key: 'f', name: 'Stop All Node Processes', cmd: 'taskkill /IM node.exe /F' },
    ],
  },
  automation: {
    name: 'Automation & Scheduling',
    items: [
      {
        key: 'g',
        name: 'Setup Auto-Cleanup',
        cmd: 'powershell -ExecutionPolicy Bypass -File scripts/auto-cleanup-scheduler.ps1',
      },
      { key: 'h', name: 'View Scheduled Tasks', cmd: 'Get-ScheduledTask -TaskName "*AI-Bridge*"' },
    ],
  },
};

async function runCommand(cmd) {
  log(`\n▶ Running: ${cmd}`, 'yellow');
  log('─'.repeat(60) + '\n', 'cyan');

  try {
    const { stdout, stderr } = await execAsync(cmd, {
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      timeout: 60000, // 60s timeout
    });

    if (stdout) console.log(stdout);
    if (stderr) log(stderr, 'yellow');

    log('\n' + '─'.repeat(60), 'cyan');
    log('✓ Command completed', 'green');
  } catch (error) {
    log(`\n✗ Error: ${error.message}`, 'red');
  }

  await prompt('\nPress Enter to continue...');
}

function prompt(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function displayMenu() {
  header('AI Bridge Master Control');

  Object.values(TOOLS).forEach((category) => {
    log(`\n${category.name}:`, 'bright');
    category.items.forEach((item) => {
      log(`  [${item.key}] ${item.name}`, 'cyan');
    });
  });

  log('\n\nSpecial Commands:', 'bright');
  log('  [s] System Status Summary', 'green');
  log('  [q] Quit\n', 'red');
}

async function getSystemStatus() {
  header('System Status Summary');

  try {
    // Check processes
    const nodeCount = execSync('tasklist | findstr "node.exe" | wc -l', {
      encoding: 'utf-8',
    }).trim();
    log(`Node.js Processes: ${nodeCount}`, nodeCount > 30 ? 'yellow' : 'green');

    // Check AI Bridge
    try {
      execSync('netstat -ano | findstr "65028.*LISTENING"', { encoding: 'utf-8' });
      log('AI Bridge: Running', 'green');
    } catch {
      log('AI Bridge: Stopped', 'red');
    }

    // Check disk space
    const disk = execSync('df -h . | tail -1 || echo "N/A"', { encoding: 'utf-8' }).trim();
    log(`Disk Usage: ${disk || 'N/A'}`, 'cyan');

    // Quick recommendations
    log('\nQuick Actions:', 'yellow');

    if (parseInt(nodeCount) > 30) {
      log('  ⚠ High process count - run [2] Process Cleanup', 'yellow');
    }

    log('  💡 Press [3] for Live Monitor', 'cyan');
    log('  💡 Press [1] for Quick System Check', 'cyan');
  } catch (error) {
    log(`Error getting status: ${error.message}`, 'red');
  }

  await prompt('\nPress Enter to continue...');
}

async function main() {
  let running = true;

  while (running) {
    displayMenu();

    const choice = await prompt('Select option: ');
    const key = choice.toLowerCase().trim();

    if (key === 'q') {
      log('\nGoodbye! 👋\n', 'green');
      running = false;
      continue;
    }

    if (key === 's') {
      await getSystemStatus();
      continue;
    }

    // Find command
    let found = false;
    for (const category of Object.values(TOOLS)) {
      const item = category.items.find((i) => i.key === key);
      if (item) {
        await runCommand(item.cmd);
        found = true;
        break;
      }
    }

    if (!found && key) {
      log('\n✗ Invalid option', 'red');
      await prompt('Press Enter to continue...');
    }
  }
}

// Run
main().catch((err) => {
  log(`Fatal error: ${err.message}`, 'red');
  process.exit(1);
});
