#!/usr/bin/env node
import SessionDiscoveryService from './session-discovery.js';
import chalk from 'chalk';
import Table from 'cli-table3';
import { Command } from 'commander';

/**
 * CLI tool for monitoring and interacting with discovered Claude Code sessions
 */
class SessionMonitorCLI {
  constructor() {
    this.discovery = null;
    this.sessions = [];
    this.program = new Commander();
  }

  async init() {
    // Initialize session discovery
    this.discovery = new SessionDiscoveryService({
      sessionName: `Monitor-CLI-${Date.now()}`,
      capabilities: ['monitor', 'cli'],
      metadata: {
        type: 'monitor-cli',
        interactive: true,
      },
    });

    // Set up event handlers
    this.discovery.on('sessionDiscovered', (session) => {
      console.log(
        chalk.green(`✓ Discovered: ${session.sessionName} (${session.sessionId.slice(0, 8)})`)
      );
    });

    this.discovery.on('sessionDeparted', (session) => {
      console.log(chalk.red(`✗ Departed: ${session.sessionName}`));
    });

    this.discovery.on('sessionMessage', ({ from, fromSession, payload }) => {
      console.log(chalk.blue(`📨 Message from ${fromSession?.sessionName || from}:`), payload);
    });

    this.discovery.on('error', (error) => {
      console.error(chalk.red('Error:'), error.message);
    });

    // Connect to bridge
    try {
      await this.discovery.connect();
      console.log(chalk.green('✓ Connected to AI Bridge'));
    } catch (error) {
      console.error(chalk.red('✗ Failed to connect to AI Bridge:'), error.message);
      process.exit(1);
    }

    // Wait a moment for discovery
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  displaySessionTable() {
    const sessions = this.discovery.getSessions();

    if (sessions.length === 0) {
      console.log(chalk.yellow('\nNo active sessions discovered yet.'));
      console.log(chalk.gray('(Sessions announce themselves every 10 seconds)\n'));
      return;
    }

    const table = new Table({
      head: [
        chalk.cyan('Name'),
        chalk.cyan('ID'),
        chalk.cyan('PID'),
        chalk.cyan('Uptime'),
        chalk.cyan('Last Seen'),
        chalk.cyan('Status'),
        chalk.cyan('Capabilities'),
      ],
      colWidths: [20, 10, 8, 12, 12, 10, 25],
    });

    sessions.forEach((session) => {
      const uptime = this._formatDuration(session.age);
      const lastSeen = this._formatDuration(session.lastSeenAgo);
      const status = session.healthy ? chalk.green('●') : chalk.red('●');
      const capabilities = (session.capabilities || []).slice(0, 3).join(', ') || 'none';

      table.push([
        session.sessionName,
        session.sessionId.slice(0, 8),
        session.metadata?.pid || 'N/A',
        uptime,
        lastSeen + ' ago',
        status,
        capabilities,
      ]);
    });

    console.log('\n' + table.toString() + '\n');
  }

  displayStats() {
    const stats = this.discovery.getStats();

    console.log(chalk.cyan('\n=== Session Discovery Statistics ==='));
    console.log(`Active Sessions:      ${chalk.yellow(stats.activeSessions)}`);
    console.log(`Sessions Discovered:  ${chalk.green(stats.sessionsDiscovered)}`);
    console.log(`Sessions Departed:    ${chalk.red(stats.sessionsDeparted)}`);
    console.log(`Messages Sent:        ${stats.messagesSent}`);
    console.log(`Messages Received:    ${stats.messagesReceived}`);
    console.log(`Errors:               ${stats.errors}`);
    console.log(`Uptime:               ${this._formatDuration(stats.uptime)}`);
    console.log();
  }

  displaySessionDetails(sessionId) {
    const session = this.discovery.getSession(sessionId);

    if (!session) {
      console.log(chalk.red(`Session ${sessionId} not found`));
      return;
    }

    console.log(chalk.cyan('\n=== Session Details ==='));
    console.log(`Name:         ${session.sessionName}`);
    console.log(`ID:           ${session.sessionId}`);
    console.log(`PID:          ${session.metadata?.pid || 'N/A'}`);
    console.log(`User:         ${session.metadata?.userName || 'unknown'}`);
    console.log(`Working Dir:  ${session.metadata?.cwd || 'N/A'}`);
    console.log(`Platform:     ${session.metadata?.platform || 'N/A'}`);
    console.log(`Node Version: ${session.metadata?.nodeVersion || 'N/A'}`);
    console.log(`Start Time:   ${new Date(session.metadata?.startTime).toLocaleString()}`);
    console.log(`Discovered:   ${new Date(session.discoveredAt).toLocaleString()}`);
    console.log(`Last Seen:    ${this._formatDuration(Date.now() - session.lastSeen)} ago`);
    console.log(`Capabilities: ${(session.capabilities || []).join(', ') || 'none'}`);
    console.log();
  }

  sendMessage(sessionId, message) {
    const session = this.discovery.getSession(sessionId);

    if (!session) {
      console.log(chalk.red(`Session ${sessionId} not found`));
      return;
    }

    this.discovery.sendToSession(sessionId, {
      type: 'cli_message',
      message,
      timestamp: new Date().toISOString(),
    });

    console.log(chalk.green(`✓ Message sent to ${session.sessionName}`));
  }

  broadcast(message) {
    this.discovery.broadcast({
      type: 'cli_broadcast',
      message,
      timestamp: new Date().toISOString(),
    });

    console.log(chalk.green(`✓ Broadcast sent to all sessions`));
  }

  startInteractiveMode() {
    console.log(chalk.cyan('\n=== Session Monitor - Interactive Mode ==='));
    console.log('Commands:');
    console.log('  list       - List all discovered sessions');
    console.log('  stats      - Show statistics');
    console.log('  details <id> - Show session details');
    console.log('  send <id> <message> - Send message to session');
    console.log('  broadcast <message> - Broadcast to all sessions');
    console.log('  refresh    - Refresh session list');
    console.log('  quit       - Exit\n');

    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.green('monitor> '),
    });

    rl.prompt();

    rl.on('line', async (line) => {
      const [command, ...args] = line.trim().split(' ');

      switch (command) {
        case 'list':
          this.displaySessionTable();
          break;

        case 'stats':
          this.displayStats();
          break;

        case 'details':
          if (args[0]) {
            const sessions = this.discovery.getSessions();
            const match = sessions.find((s) => s.sessionId.startsWith(args[0]));
            if (match) {
              this.displaySessionDetails(match.sessionId);
            } else {
              console.log(chalk.red(`Session not found: ${args[0]}`));
            }
          } else {
            console.log(chalk.red('Usage: details <session-id>'));
          }
          break;

        case 'send':
          if (args.length >= 2) {
            const sessions = this.discovery.getSessions();
            const match = sessions.find((s) => s.sessionId.startsWith(args[0]));
            if (match) {
              this.sendMessage(match.sessionId, args.slice(1).join(' '));
            } else {
              console.log(chalk.red(`Session not found: ${args[0]}`));
            }
          } else {
            console.log(chalk.red('Usage: send <session-id> <message>'));
          }
          break;

        case 'broadcast':
          if (args.length > 0) {
            this.broadcast(args.join(' '));
          } else {
            console.log(chalk.red('Usage: broadcast <message>'));
          }
          break;

        case 'refresh':
          this.discovery._queryExistingSessions();
          console.log(chalk.green('✓ Refreshing session list...'));
          setTimeout(() => this.displaySessionTable(), 1000);
          break;

        case 'quit':
        case 'exit':
          console.log(chalk.yellow('\nDisconnecting...'));
          await this.discovery.disconnect();
          process.exit(0);
          break;

        case 'help':
          console.log(chalk.cyan('\nCommands:'));
          console.log('  list       - List all discovered sessions');
          console.log('  stats      - Show statistics');
          console.log('  details <id> - Show session details');
          console.log('  send <id> <message> - Send message to session');
          console.log('  broadcast <message> - Broadcast to all sessions');
          console.log('  refresh    - Refresh session list');
          console.log('  quit       - Exit\n');
          break;

        default:
          if (command) {
            console.log(chalk.red(`Unknown command: ${command}`));
            console.log(chalk.gray('Type "help" for available commands'));
          }
      }

      rl.prompt();
    });

    rl.on('close', async () => {
      console.log(chalk.yellow('\nDisconnecting...'));
      await this.discovery.disconnect();
      process.exit(0);
    });
  }

  _formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  async cleanup() {
    if (this.discovery) {
      await this.discovery.disconnect();
    }
  }
}

// CLI Entry Point
async function main() {
  const monitor = new SessionMonitorCLI();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log(chalk.yellow('\n\nShutting down...'));
    await monitor.cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await monitor.cleanup();
    process.exit(0);
  });

  try {
    await monitor.init();

    const program = new Command();
    program
      .name('session-monitor')
      .description('Monitor and interact with Claude Code sessions')
      .version('1.0.0');

    program
      .command('list')
      .description('List all discovered sessions')
      .action(() => {
        monitor.displaySessionTable();
        monitor.cleanup().then(() => process.exit(0));
      });

    program
      .command('stats')
      .description('Show session discovery statistics')
      .action(() => {
        monitor.displayStats();
        monitor.cleanup().then(() => process.exit(0));
      });

    program
      .command('interactive')
      .alias('i')
      .description('Start interactive monitoring mode')
      .action(() => {
        monitor.startInteractiveMode();
      });

    // Default: interactive mode
    if (process.argv.length === 2) {
      monitor.startInteractiveMode();
    } else {
      await program.parseAsync(process.argv);
    }
  } catch (error) {
    console.error(chalk.red('Fatal error:'), error.message);
    await monitor.cleanup();
    process.exit(1);
  }
}

// Run CLI if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export default SessionMonitorCLI;
