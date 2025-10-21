#!/usr/bin/env node
/**
 * Autonomous System Verification Script
 * Validates that all components are working correctly
 */

import { logger } from './src/utils/logger.js';
import fs from 'fs/promises';
import { spawn } from 'child_process';

console.log('\n');
console.log('═══════════════════════════════════════════════════════════');
console.log('🔍 AUTONOMOUS AGENT SYSTEM VERIFICATION');
console.log('═══════════════════════════════════════════════════════════');
console.log('\n');

let allChecksPass = true;

// Helper function for checks
async function check(name, fn) {
  process.stdout.write(`${name}... `);
  try {
    await fn();
    console.log('✅');
    return true;
  } catch (error) {
    console.log('❌');
    console.log(`   Error: ${error.message}`);
    allChecksPass = false;
    return false;
  }
}

// 1. Check Node.js version
await check('Node.js version >= 18.0.0', async () => {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0]);
  if (major < 18) {
    throw new Error(`Node.js ${version} found, need >= 18.0.0`);
  }
});

// 2. Check required environment variables
await check('ANTHROPIC_API_KEY configured', async () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not found in environment');
  }
  if (!process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-')) {
    throw new Error('ANTHROPIC_API_KEY format appears invalid');
  }
});

// 3. Check core files exist
const coreFiles = [
  'src/agents/autonomous-claude-agent.js',
  'src/tools/tool-executor.js',
  'src/agents/meta-agent-factory.js',
  'src/tools/tools/file-tools.js',
  'src/tools/tools/bash-tools.js',
  'src/tools/tools/git-tools.js',
  'src/tools/tools/code-tools.js',
  'src/tools/tools/test-tools.js',
  'src/ai-bridge.js',
];

for (const file of coreFiles) {
  await check(`File exists: ${file}`, async () => {
    await fs.access(file);
  });
}

// 4. Check demo files exist
const demoFiles = [
  'demo-autonomous-agent.js',
  'demo-agent-orchestration.js',
  'tests/autonomous-agent-integration.test.js',
  'AUTONOMOUS_AGENTS.md',
  'AUTONOMOUS_SYSTEM_READY.md',
];

for (const file of demoFiles) {
  await check(`Demo/Doc exists: ${file}`, async () => {
    await fs.access(file);
  });
}

// 5. Check npm scripts are configured
await check('npm scripts configured', async () => {
  const pkg = JSON.parse(await fs.readFile('package.json', 'utf-8'));
  const requiredScripts = [
    'demo:autonomous',
    'demo:orchestration',
    'test:autonomous',
    'bridge:start',
    'agent:claude',
    'system:full',
  ];

  for (const script of requiredScripts) {
    if (!pkg.scripts[script]) {
      throw new Error(`Missing npm script: ${script}`);
    }
  }
});

// 6. Check module imports work
await check('AutonomousClaudeAgent imports', async () => {
  try {
    const module = await import('./src/agents/autonomous-claude-agent.js');
    if (!module.AutonomousClaudeAgent) {
      throw new Error('AutonomousClaudeAgent export not found');
    }
  } catch (err) {
    throw new Error(`Import failed: ${err.message}`);
  }
});

await check('ToolExecutor imports', async () => {
  try {
    const module = await import('./src/tools/tool-executor.js');
    if (!module.ToolExecutor) {
      throw new Error('ToolExecutor export not found');
    }
  } catch (err) {
    throw new Error(`Import failed: ${err.message}`);
  }
});

// 7. Check dependencies are installed
await check('Required npm packages installed', async () => {
  const pkg = JSON.parse(await fs.readFile('package.json', 'utf-8'));
  const requiredDeps = ['@anthropic-ai/sdk', 'ws', 'dotenv', 'glob'];

  for (const dep of requiredDeps) {
    if (!pkg.dependencies[dep]) {
      throw new Error(`Missing dependency: ${dep}`);
    }
  }

  // Check if node_modules exists
  await fs.access('node_modules');
});

// 8. Check tool modules load
await check('File tools load', async () => {
  const module = await import('./src/tools/tools/file-tools.js');
  if (!module.readFile || !module.writeFile) {
    throw new Error('File tools not properly exported');
  }
});

await check('Bash tools load', async () => {
  const module = await import('./src/tools/tools/bash-tools.js');
  if (!module.executeCommand) {
    throw new Error('Bash tools not properly exported');
  }
});

await check('Git tools load', async () => {
  const module = await import('./src/tools/tools/git-tools.js');
  if (!module.gitStatus) {
    throw new Error('Git tools not properly exported');
  }
});

// 9. Check ports are available
await check('Port 65028 available (AI Bridge WS)', async () => {
  const net = await import('net');
  const server = net.createServer();

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.once('listening', () => {
      server.close();
      resolve();
    });
    server.listen(65028);
  });
});

await check('Port 65029 available (AI Bridge HTTP)', async () => {
  const net = await import('net');
  const server = net.createServer();

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.once('listening', () => {
      server.close();
      resolve();
    });
    server.listen(65029);
  });
});

// 10. Check git repository
await check('Git repository initialized', async () => {
  await fs.access('.git');
});

console.log('\n');
console.log('═══════════════════════════════════════════════════════════');

if (allChecksPass) {
  console.log('✅ ALL CHECKS PASSED - SYSTEM READY FOR USE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('\n🚀 Quick Start Commands:\n');
  console.log('   npm run demo:autonomous        # Run autonomous agent demo');
  console.log('   npm run demo:orchestration     # Run multi-agent demo');
  console.log('   npm run test:autonomous        # Run integration tests');
  console.log('   npm run system:full            # Start complete system');
  console.log('\n📖 Documentation:\n');
  console.log('   AUTONOMOUS_AGENTS.md           # Full technical documentation');
  console.log('   AUTONOMOUS_SYSTEM_READY.md     # Quick start guide');
  console.log('   CLAUDE.md                      # Project constitution');
  console.log('\n');
  process.exit(0);
} else {
  console.log('❌ SOME CHECKS FAILED - REVIEW ERRORS ABOVE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('\n💡 Common Solutions:\n');
  console.log('   • Missing dependencies: npm install');
  console.log('   • Environment variables: Copy .env.example to .env');
  console.log('   • Port conflicts: Stop other services on ports 65028/65029');
  console.log('   • Import errors: Ensure Node.js >= 18.0.0');
  console.log('\n');
  process.exit(1);
}
