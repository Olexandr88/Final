#!/usr/bin/env node

import { getGlobalCoordinator } from './session-coordinator.js';

const coordinator = getGlobalCoordinator();

const command = process.argv[2];
const args = process.argv.slice(3);

async function main() {
  try {
    switch (command) {
      case 'list':
      case 'ls':
        console.log(coordinator.formatSessionList());
        break;

      case 'locks':
        console.log(coordinator.formatLockList());
        break;

      case 'info':
        {
          const sessionId = args[0] || coordinator.getCurrentSessionId();
          const info = coordinator.getSessionInfo(sessionId);
          if (!info) {
            console.log(`Session ${sessionId} not found`);
            return;
          }
          console.log('\n=== Session Info ===\n');
          console.log(`ID: ${info.id}`);
          console.log(`PID: ${info.pid}`);
          console.log(`Status: ${info.status}`);
          console.log(`Started: ${new Date(info.start_time).toISOString()}`);
          console.log(`Last Heartbeat: ${new Date(info.last_heartbeat).toISOString()}`);
          console.log(`Working Dir: ${info.cwd}`);
          if (info.current_task) {
            console.log(`Current Task: ${info.current_task}`);
          }
          if (info.locks && info.locks.length > 0) {
            console.log('\nLocks:');
            info.locks.forEach(lock => {
              console.log(`  • ${lock.resource_path} (${lock.lock_type})`);
            });
          }
          console.log();
        }
        break;

      case 'kill':
        {
          const sessionId = args[0];
          if (!sessionId) {
            console.log('Usage: session-cli kill <session-id>');
            return;
          }
          const success = coordinator.killSession(sessionId);
          if (success) {
            console.log(`✓ Session ${sessionId} killed`);
          } else {
            console.log(`✗ Failed to kill session ${sessionId}`);
          }
        }
        break;

      case 'check':
        {
          const filePath = args[0];
          if (!filePath) {
            console.log('Usage: session-cli check <file-path>');
            return;
          }
          const conflict = coordinator.checkConflicts(filePath);
          if (!conflict) {
            console.log(`✓ ${filePath} is not locked`);
          } else {
            console.log(`✗ ${filePath} is locked`);
            console.log(`  Locked by: ${conflict.lockedBy.slice(0, 8)}`);
            console.log(`  Lock type: ${conflict.lockType}`);
            console.log(`  PID: ${conflict.pid}`);
            console.log(`  Age: ${Math.floor(conflict.age / 1000)}s`);
          }
        }
        break;

      case 'cleanup':
        coordinator.cleanup();
        console.log('✓ Session cleaned up');
        break;

      case 'help':
      default:
        console.log(`
Claude Session Manager CLI

Usage: session-cli <command> [args]

Commands:
  list, ls              List all active sessions
  locks                 Show locks held by current session
  info [session-id]     Show detailed info for a session
  kill <session-id>     Kill a specific session
  check <file-path>     Check if a file is locked
  cleanup               Cleanup current session
  help                  Show this help message

Examples:
  session-cli list
  session-cli info abc123
  session-cli kill abc123
  session-cli check src/claude-client.js
        `);
    }

    coordinator.cleanup();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
