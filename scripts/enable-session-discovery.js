#!/usr/bin/env node
import SessionDiscoveryService from '../src/session-discovery.js';
import chalk from 'chalk';

/**
 * Quick enable session discovery for current Claude Code session
 * Run this in any terminal/session to make it discoverable
 */

async function enableDiscovery() {
  // Get session name from current directory or generate
  const cwd = process.cwd();
  const projectName = cwd.split(/[\\/]/).pop();
  const sessionName = `${projectName}-${process.pid}`;

  console.log(chalk.cyan('🔮 Enabling Session Discovery...\n'));
  console.log(chalk.gray(`Session Name: ${sessionName}`));
  console.log(chalk.gray(`Working Dir:  ${cwd}`));
  console.log(chalk.gray(`PID:          ${process.pid}\n`));

  const discovery = new SessionDiscoveryService({
    sessionName,
    capabilities: ['claude-code'],
    metadata: {
      cwd,
      startedBy: 'enable-session-discovery.js',
    },
  });

  // Event handlers
  discovery.on('registered', (client) => {
    console.log(chalk.green(`✓ Registered with AI Bridge (${client.id.slice(0, 8)})\n`));
  });

  discovery.on('sessionDiscovered', (session) => {
    console.log(
      chalk.blue(`📡 Discovered: ${session.sessionName} (${session.sessionId.slice(0, 8)})`)
    );
    console.log(chalk.gray(`   Capabilities: ${session.capabilities.join(', ')}`));
    console.log(chalk.gray(`   Working Dir:  ${session.metadata?.cwd || 'N/A'}`));
    console.log();
  });

  discovery.on('sessionMessage', ({ fromSession, payload }) => {
    console.log(chalk.magenta(`\n📨 Message from ${fromSession?.sessionName || 'unknown'}:`));
    console.log(chalk.white(JSON.stringify(payload, null, 2)));
    console.log();
  });

  discovery.on('sessionDeparted', (session) => {
    console.log(chalk.red(`👋 Session departed: ${session.sessionName}\n`));
  });

  try {
    await discovery.connect();

    console.log(chalk.green('✅ Session Discovery Enabled!\n'));
    console.log(chalk.yellow('This session is now visible to other sessions.'));
    console.log(chalk.yellow('Press Ctrl+C to disconnect.\n'));

    // Keep alive and show stats periodically
    setInterval(() => {
      const sessions = discovery.getSessions();
      const stats = discovery.getStats();

      console.clear();
      console.log(chalk.bold.cyan('=== Session Discovery Status ===\n'));
      console.log(chalk.cyan(`Your Session:  ${sessionName}`));
      console.log(chalk.cyan(`Active Sessions: ${stats.activeSessions}`));
      console.log(chalk.cyan(`Messages Sent:   ${stats.messagesSent}`));
      console.log(chalk.cyan(`Messages Rcvd:   ${stats.messagesReceived}`));
      console.log(chalk.cyan(`Uptime:          ${Math.floor(stats.uptime / 1000)}s\n`));

      if (sessions.length > 0) {
        console.log(chalk.bold.yellow('Discovered Sessions:\n'));
        sessions.forEach((s, i) => {
          const status = s.healthy ? chalk.green('●') : chalk.red('○');
          console.log(`${status} ${i + 1}. ${s.sessionName}`);
          console.log(`   ID:  ${s.sessionId.slice(0, 8)}`);
          console.log(`   Dir: ${s.metadata?.cwd || 'N/A'}`);
          console.log(`   Age: ${Math.floor((Date.now() - s.discoveredAt) / 1000)}s`);
          console.log();
        });
      } else {
        console.log(chalk.gray('No other sessions discovered yet.\n'));
        console.log(chalk.gray('Run this script in another terminal to see session discovery!\n'));
      }

      console.log(chalk.gray('Press Ctrl+C to stop\n'));
    }, 5000);

    // Handle cleanup
    process.on('SIGINT', async () => {
      console.log(chalk.yellow('\n\nDisconnecting...'));
      await discovery.disconnect();
      console.log(chalk.green('✓ Disconnected\n'));
      process.exit(0);
    });
  } catch (error) {
    console.error(chalk.red('✗ Failed to enable discovery:'), error.message);
    process.exit(1);
  }
}

enableDiscovery();
