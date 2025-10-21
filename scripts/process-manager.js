#!/usr/bin/env node

/**
 * Process Management Utility
 * Based on shell_one_liners.sh patterns for process management
 * Provides ps, top, strace-like functionality for Windows
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const COMMANDS = {
  'top-cpu': {
    desc: 'Show top CPU-consuming processes',
    async run() {
      console.log('⚡ Top CPU Processes:\n');
      try {
        const { stdout } = await execAsync(
          'powershell "Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 ProcessName, CPU, PM, Id | Format-Table -AutoSize"'
        );
        console.log(stdout);
      } catch (err) {
        console.log('  Error:', err.message);
      }
    },
  },

  'top-mem': {
    desc: 'Show top memory-consuming processes',
    async run() {
      console.log('💾 Top Memory Processes:\n');
      try {
        const { stdout } = await execAsync(
          'powershell "Get-Process | Sort-Object WS -Descending | Select-Object -First 10 ProcessName, @{Name=\'MemMB\';Expression={[math]::Round($_.WS/1MB, 2)}}, CPU, Id | Format-Table -AutoSize"'
        );
        console.log(stdout);
      } catch (err) {
        console.log('  Error:', err.message);
      }
    },
  },

  'by-user': {
    desc: 'Count processes by user (ps hax -o user equivalent)',
    async run() {
      console.log('👥 Processes by User:\n');
      try {
        const { stdout } = await execAsync(
          'powershell "Get-Process -IncludeUserName | Group-Object UserName | Sort-Object Count -Descending | Select-Object Count, Name | Format-Table -AutoSize"'
        );
        console.log(stdout);
      } catch (err) {
        console.log('  ❌ Run as Administrator to see user info');
      }
    },
  },

  tree: {
    desc: 'Show process tree (ps awwfux equivalent)',
    async run() {
      console.log('🌳 Process Tree:\n');
      try {
        const { stdout } = await execAsync('powershell "Get-Process | Format-List"');
        const processes = stdout.split('\n\n').slice(0, 10);
        processes.forEach((proc) => {
          if (proc.trim()) {
            console.log(proc);
            console.log('─'.repeat(80));
          }
        });
      } catch (err) {
        console.log('  Error:', err.message);
      }
    },
  },

  'node-processes': {
    desc: 'List all Node.js processes',
    async run() {
      console.log('📦 Node.js Processes:\n');
      try {
        const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq node.exe" /V');
        console.log(stdout);
      } catch (err) {
        console.log('  No Node.js processes found');
      }
    },
  },

  'kill-pattern': {
    desc: 'Kill processes matching pattern',
    async run(args) {
      const pattern = args[0];
      if (!pattern) {
        console.log('❌ Usage: process-manager kill-pattern <pattern>');
        return;
      }

      console.log(`💀 Killing processes matching: ${pattern}\n`);

      try {
        const { stdout } = await execAsync(`tasklist /FI "IMAGENAME eq ${pattern}*" /FO CSV`);

        const lines = stdout.split('\n').filter((l) => l.includes(pattern));
        console.log(`  Found ${lines.length} processes\n`);

        for (const line of lines) {
          const match = line.match(/"([^"]+)","(\d+)"/);
          if (match) {
            const [, name, pid] = match;
            console.log(`  Killing ${name} (PID: ${pid})`);
            await execAsync(`taskkill /PID ${pid} /F`);
          }
        }

        console.log('\n  ✅ Done');
      } catch (err) {
        console.log(`  ❌ Error: ${err.message}`);
      }
    },
  },

  cwd: {
    desc: 'Get current working directory of process (pwdx equivalent)',
    async run(args) {
      const pid = args[0];
      if (!pid) {
        console.log('❌ Usage: process-manager cwd <pid>');
        return;
      }

      console.log(`📂 Working Directory for PID ${pid}:\n`);

      try {
        // Based on shell_one_liners.sh block 87
        const { stdout } = await execAsync(
          `powershell "Get-Process -Id ${pid} | Select-Object -ExpandProperty Path"`
        );
        console.log(`  ${stdout.trim()}`);
      } catch (err) {
        console.log(`  ❌ Process ${pid} not found`);
      }
    },
  },

  watch: {
    desc: 'Watch process count for pattern',
    async run(args) {
      const pattern = args[0] || 'node.exe';
      console.log(`👀 Watching processes: ${pattern} (Ctrl+C to stop)\n`);

      const watch = async () => {
        try {
          const { stdout } = await execAsync(`tasklist /FI "IMAGENAME eq ${pattern}" /FO CSV /NH`);

          const count = stdout.split('\n').filter((l) => l.trim()).length;

          console.clear();
          console.log(`📊 Process Monitor - ${new Date().toLocaleTimeString()}\n`);
          console.log(`  Pattern: ${pattern}`);
          console.log(`  Count:   ${count}\n`);

          if (count > 0) {
            console.log('  Details:');
            console.log(stdout);
          }
        } catch {
          console.log('  No processes found');
        }
      };

      setInterval(watch, 2000);
      await watch();
    },
  },

  'zombie-check': {
    desc: 'Check for zombie/stuck Node.js processes',
    async run() {
      console.log('👻 Checking for Zombie Processes:\n');

      try {
        const { stdout } = await execAsync(
          'powershell "Get-Process node -ErrorAction SilentlyContinue | Where-Object {$_.CPU -eq 0 -and (New-TimeSpan -Start $_.StartTime).TotalHours -gt 1} | Select-Object Id, ProcessName, StartTime, @{Name=\'Runtime\';Expression={(New-TimeSpan -Start $_.StartTime).ToString()}} | Format-Table -AutoSize"'
        );

        if (stdout.trim()) {
          console.log('  Found potential zombies:\n');
          console.log(stdout);
          console.log('\n  💡 Tip: Use "process-manager kill-pattern node" to clean up');
        } else {
          console.log('  ✅ No zombie processes detected');
        }
      } catch {
        console.log('  No Node.js processes found');
      }
    },
  },
};

async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  console.log('⚙️  Process Management Utility\n');

  if (!command || command === 'help') {
    console.log('Available commands:\n');
    Object.entries(COMMANDS).forEach(([name, cmd]) => {
      console.log(`  ${name.padEnd(20)} - ${cmd.desc}`);
    });
    console.log('\nUsage: node scripts/process-manager.js <command> [args]');
    console.log('\nExamples:');
    console.log('  node scripts/process-manager.js top-cpu');
    console.log('  node scripts/process-manager.js kill-pattern node');
    console.log('  node scripts/process-manager.js cwd 12345');
    return;
  }

  const cmd = COMMANDS[command];
  if (!cmd) {
    console.log(`❌ Unknown command: ${command}`);
    console.log('Run "node scripts/process-manager.js help" for available commands');
    process.exit(1);
  }

  await cmd.run(args);
}

main().catch(console.error);
