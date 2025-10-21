#!/usr/bin/env node
/**
 * A2A CLI - Unified Command-Line Interface for A2A MCP System
 * Manages AI Bridge, Agents, MCP Servers, and Deployments
 */

import { Command } from 'commander';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

const BRIDGE_WS = process.env.BRIDGE_WS || 'ws://localhost:65028';
const BRIDGE_HTTP = process.env.BRIDGE_HTTP || 'http://localhost:65029';

const program = new Command();

// Store running processes
const runningProcesses = new Map();

/**
 * Check if AI Bridge is running
 */
async function checkBridgeHealth() {
  try {
    const response = await axios.get(`${BRIDGE_HTTP}/api/status`, { timeout: 5000 });
    return response.data;
  } catch (error) {
    return null;
  }
}

/**
 * Start a component
 */
async function startComponent(component, options = {}) {
  const components = {
    bridge: {
      script: 'bridge:start',
      name: 'AI Bridge',
      check: () => checkBridgeHealth()
    },
    ollama: {
      script: 'agent:ollama',
      name: 'Ollama Agent',
      check: async () => {
        const health = await checkBridgeHealth();
        return health?.stats?.connectedClients > 0;
      }
    },
    claude: {
      script: 'agent:claude',
      name: 'Claude Agent',
      check: async () => {
        const health = await checkBridgeHealth();
        return health?.stats?.connectedClients > 0;
      }
    },
    analyzer: {
      script: 'agent:analyzer',
      name: 'Code Analyzer Agent'
    },
    'mcp-continue': {
      script: 'mcp:continue',
      name: 'Continue MCP Server'
    },
    'mcp-jules': {
      script: 'mcp:jules',
      name: 'Jules MCP Server'
    },
    all: {
      script: 'system:start',
      name: 'Full A2A System'
    }
  };

  const config = components[component];
  if (!config) {
    console.error(chalk.red(`Unknown component: ${component}`));
    console.log(chalk.yellow('Available components:'), Object.keys(components).join(', '));
    process.exit(1);
  }

  console.log(chalk.blue(`🚀 Starting ${config.name}...`));

  const child = spawn('npm', ['run', config.script], {
    cwd: PROJECT_ROOT,
    stdio: options.detached ? 'ignore' : 'inherit',
    shell: true,
    detached: options.detached
  });

  if (options.detached) {
    child.unref();
    runningProcesses.set(component, child.pid);
    console.log(chalk.green(`✅ ${config.name} started (PID: ${child.pid})`));
  } else {
    child.on('exit', (code) => {
      if (code === 0) {
        console.log(chalk.green(`✅ ${config.name} exited successfully`));
      } else {
        console.log(chalk.red(`❌ ${config.name} exited with code ${code}`));
      }
    });
  }

  // Wait for health check if available
  if (config.check && !options.detached) {
    console.log(chalk.yellow(`⏳ Waiting for ${config.name} to be healthy...`));
    let attempts = 0;
    while (attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const healthy = await config.check();
      if (healthy) {
        console.log(chalk.green(`✅ ${config.name} is healthy!`));
        break;
      }
      attempts++;
    }
  }

  return child;
}

/**
 * Stop a component
 */
async function stopComponent(component) {
  console.log(chalk.blue(`🛑 Stopping ${component}...`));

  try {
    // Use pkill to find and kill process
    await execAsync(`pkill -f "${component}"`);
    console.log(chalk.green(`✅ ${component} stopped`));
  } catch (error) {
    if (error.code === 1) {
      console.log(chalk.yellow(`⚠️ No running ${component} process found`));
    } else {
      console.error(chalk.red(`❌ Error stopping ${component}:`), error.message);
    }
  }
}

/**
 * Show system status
 */
async function showStatus() {
  console.log(chalk.bold.blue('\n━━━ A2A System Status ━━━\n'));

  // Check AI Bridge
  const bridgeHealth = await checkBridgeHealth();
  if (bridgeHealth) {
    console.log(chalk.green('✅ AI Bridge:'), 'Running');
    console.log(chalk.gray('   Port:'), BRIDGE_HTTP.replace('http://', ''));
    console.log(chalk.gray('   Uptime:'), Math.floor(bridgeHealth.uptime / 60), 'minutes');
    console.log(chalk.gray('   Connected Agents:'), bridgeHealth.stats.connectedClients);
    console.log(chalk.gray('   Messages Processed:'), bridgeHealth.stats.messagesProcessed);
    console.log(chalk.gray('   Errors:'), bridgeHealth.stats.errors);
    console.log(chalk.gray('   Memory:'), bridgeHealth.stats.performance.memoryUsage.toFixed(2), 'MB');
  } else {
    console.log(chalk.red('❌ AI Bridge:'), 'Not running');
  }

  // Check agents via Bridge API
  if (bridgeHealth) {
    try {
      const agentsResp = await axios.get(`${BRIDGE_HTTP}/agents`, { timeout: 5000 });
      const agents = agentsResp.data.agents || [];

      console.log(chalk.bold.blue('\n━━━ Connected Agents ━━━\n'));
      if (agents.length === 0) {
        console.log(chalk.yellow('No agents connected'));
      } else {
        agents.forEach(agent => {
          console.log(chalk.green(`✅ ${agent.id}`));
          console.log(chalk.gray('   Role:'), agent.role);
          console.log(chalk.gray('   Health Score:'), agent.healthScore + '%');
          console.log(chalk.gray('   Messages:'), `${agent.messagesSent} sent, ${agent.messagesReceived} received`);
          console.log(chalk.gray('   Last Seen:'), new Date(agent.lastSeen).toLocaleTimeString());
        });
      }
    } catch (error) {
      console.error(chalk.red('Error fetching agents:'), error.message);
    }
  }

  // Check Ollama
  try {
    const ollamaResp = await axios.get('http://localhost:11434/api/tags', { timeout: 5000 });
    console.log(chalk.bold.blue('\n━━━ Ollama Status ━━━\n'));
    console.log(chalk.green('✅ Ollama:'), 'Running');
    console.log(chalk.gray('   Models:'), ollamaResp.data.models.length);
  } catch (error) {
    console.log(chalk.bold.blue('\n━━━ Ollama Status ━━━\n'));
    console.log(chalk.red('❌ Ollama:'), 'Not running');
  }

  console.log('\n');
}

/**
 * Deploy to target
 */
async function deploy(target, options) {
  console.log(chalk.blue(`🚀 Deploying to ${target}...`));

  const deployTargets = {
    pm2: async () => {
      console.log(chalk.yellow('Starting PM2 deployment...'));
      await execAsync('npm run pm2:start', { cwd: PROJECT_ROOT });
      console.log(chalk.green('✅ PM2 deployment complete'));
    },
    docker: async () => {
      console.log(chalk.yellow('Building Docker image...'));
      await execAsync('npm run build:docker', { cwd: PROJECT_ROOT });
      console.log(chalk.green('✅ Docker image built'));
    },
    railway: async () => {
      console.log(chalk.yellow('Deploying to Railway...'));
      console.log(chalk.gray('Push to GitHub, then deploy via Railway dashboard'));
      console.log(chalk.blue('Railway URL:'), 'https://railway.app');
    },
    cloudflare: async () => {
      console.log(chalk.yellow('Deploying to Cloudflare Workers...'));
      await execAsync('npm run deploy:cloudflare', { cwd: PROJECT_ROOT });
      console.log(chalk.green('✅ Cloudflare deployment complete'));
    },
    vercel: async () => {
      console.log(chalk.yellow('Deploying to Vercel...'));
      await execAsync('npm run deploy:vercel', { cwd: PROJECT_ROOT });
      console.log(chalk.green('✅ Vercel deployment complete'));
    }
  };

  if (!deployTargets[target]) {
    console.error(chalk.red(`Unknown deployment target: ${target}`));
    console.log(chalk.yellow('Available targets:'), Object.keys(deployTargets).join(', '));
    process.exit(1);
  }

  try {
    await deployTargets[target]();
  } catch (error) {
    console.error(chalk.red('Deployment failed:'), error.message);
    process.exit(1);
  }
}

/**
 * Show logs for component
 */
async function showLogs(component, options) {
  const lines = options.lines || 50;
  const follow = options.follow || false;

  console.log(chalk.blue(`📋 Logs for ${component} (last ${lines} lines)${follow ? ' [following...]' : ''}:\n`));

  const logCommands = {
    bridge: `tail ${follow ? '-f' : ''} -n ${lines} logs/ai-bridge.log`,
    ollama: `tail ${follow ? '-f' : ''} -n ${lines} logs/ollama-agent.log`,
    claude: `tail ${follow ? '-f' : ''} -n ${lines} logs/claude-agent.log`,
    all: `tail ${follow ? '-f' : ''} -n ${lines} logs/*.log`
  };

  const cmd = logCommands[component] || logCommands.all;

  try {
    if (follow) {
      const child = spawn('tail', ['-f', '-n', lines.toString(), `logs/${component}.log`], {
        cwd: PROJECT_ROOT,
        stdio: 'inherit'
      });

      process.on('SIGINT', () => {
        child.kill();
        process.exit(0);
      });
    } else {
      const { stdout } = await execAsync(cmd, { cwd: PROJECT_ROOT });
      console.log(stdout);
    }
  } catch (error) {
    console.error(chalk.red('Error reading logs:'), error.message);
  }
}

// CLI Command Definitions
program
  .name('a2a')
  .description('A2A MCP System - Unified CLI for AI Bridge, Agents, and MCP Servers')
  .version('1.0.0');

program
  .command('start <component>')
  .description('Start a component (bridge, ollama, claude, analyzer, mcp-continue, mcp-jules, all)')
  .option('-d, --detached', 'Run in detached mode')
  .action(startComponent);

program
  .command('stop <component>')
  .description('Stop a component')
  .action(stopComponent);

program
  .command('status')
  .description('Show system status')
  .action(showStatus);

program
  .command('deploy <target>')
  .description('Deploy to target (pm2, docker, railway, cloudflare, vercel)')
  .action(deploy);

program
  .command('logs <component>')
  .description('Show logs for component')
  .option('-n, --lines <number>', 'Number of lines to show', '50')
  .option('-f, --follow', 'Follow log output')
  .action(showLogs);

program
  .command('config <action>')
  .description('Manage configuration (show, edit, validate)')
  .action((action) => {
    console.log(chalk.yellow(`Config action: ${action} (not yet implemented)`));
  });

program
  .command('agents')
  .description('List connected agents')
  .action(async () => {
    const bridgeHealth = await checkBridgeHealth();
    if (!bridgeHealth) {
      console.log(chalk.red('❌ AI Bridge not running'));
      return;
    }

    try {
      const response = await axios.get(`${BRIDGE_HTTP}/agents`);
      const agents = response.data.agents || [];

      console.log(chalk.bold.blue('\n━━━ Connected Agents ━━━\n'));
      console.table(agents.map(a => ({
        ID: a.id,
        Role: a.role,
        'Health %': a.healthScore,
        Sent: a.messagesSent,
        Received: a.messagesReceived,
        'Last Seen': new Date(a.lastSeen).toLocaleTimeString()
      })));
    } catch (error) {
      console.error(chalk.red('Error fetching agents:'), error.message);
    }
  });

program.parse();
