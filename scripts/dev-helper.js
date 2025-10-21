#!/usr/bin/env node

/**
 * Developer Helper - Quick access to common development tasks
 * Combines shell one-liners into useful Node.js utilities
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const COMMANDS = {
  ports: {
    desc: 'Show all listening ports',
    async run() {
      console.log('🔌 Listening Ports:\n');
      try {
        // Windows: netstat
        const { stdout } = await execAsync('netstat -an | findstr LISTENING');
        const lines = stdout.split('\n').filter((l) => l.trim());
        const ports = new Set();

        lines.forEach((line) => {
          const match = line.match(/:(\d+)/);
          if (match) ports.add(match[1]);
        });

        [...ports]
          .sort((a, b) => parseInt(a) - parseInt(b))
          .forEach((port) => {
            console.log(`  Port ${port}`);
          });
      } catch (err) {
        console.log('  (netstat command failed)');
      }
    },
  },

  'bridge-ports': {
    desc: 'Check if AI Bridge ports are in use',
    async run() {
      console.log('🌉 AI Bridge Port Status:\n');
      const ports = [65028, 65029];

      for (const port of ports) {
        try {
          const { stdout } = await execAsync(`netstat -an | findstr :${port}`);
          if (stdout.trim()) {
            console.log(`  ✅ Port ${port} - IN USE`);
          } else {
            console.log(`  ❌ Port ${port} - Available`);
          }
        } catch {
          console.log(`  ❌ Port ${port} - Available`);
        }
      }
    },
  },

  'kill-bridge': {
    desc: 'Kill all AI Bridge processes',
    async run() {
      console.log('💀 Killing AI Bridge processes...\n');
      try {
        // Find node processes with 'bridge' in command
        const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq node.exe" /FO CSV');
        const lines = stdout.split('\n');
        console.log(`  Found ${lines.length - 2} Node.js process(es)`);

        // Kill processes on bridge ports
        for (const port of [65028, 65029]) {
          try {
            const { stdout: portInfo } = await execAsync(`netstat -ano | findstr :${port}`);
            const match = portInfo.match(/LISTENING\s+(\d+)/);
            if (match) {
              const pid = match[1];
              console.log(`  Killing PID ${pid} on port ${port}`);
              await execAsync(`taskkill /PID ${pid} /F`);
            }
          } catch {}
        }

        console.log('  ✅ Done');
      } catch (err) {
        console.log('  ❌ Error:', err.message);
      }
    },
  },

  'node-procs': {
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

  'git-status': {
    desc: 'Quick git status summary',
    async run() {
      console.log('📊 Git Status:\n');
      try {
        const { stdout: branch } = await execAsync('git branch --show-current');
        console.log(`  Branch: ${branch.trim()}`);

        const { stdout: status } = await execAsync('git status --short');
        const lines = status.split('\n').filter((l) => l.trim());

        const modified = lines.filter((l) => l.startsWith(' M')).length;
        const added = lines.filter((l) => l.startsWith('??')).length;
        const staged = lines.filter((l) => l.startsWith('M ')).length;

        console.log(`  Modified: ${modified}`);
        console.log(`  Staged: ${staged}`);
        console.log(`  Untracked: ${added}`);
      } catch (err) {
        console.log('  ❌ Not a git repository');
      }
    },
  },

  'quick-test': {
    desc: 'Run quick test on a specific file',
    async run(args) {
      const pattern = args[0] || 'basic';
      console.log(`🧪 Running tests matching: ${pattern}\n`);

      const proc = spawn('node', ['scripts/quick-test.js', pattern], {
        stdio: 'inherit',
        shell: true,
      });

      return new Promise((resolve) => proc.on('close', resolve));
    },
  },

  cleanup: {
    desc: 'Cleanup workspace (dry run)',
    async run() {
      console.log('🧹 Workspace Cleanup Preview:\n');

      const proc = spawn('node', ['scripts/workspace-cleanup.js', '--dry-run'], {
        stdio: 'inherit',
        shell: true,
      });

      return new Promise((resolve) => proc.on('close', resolve));
    },
  },

  'disk-usage': {
    desc: 'Check disk usage of project directories',
    async run() {
      console.log('💾 Disk Usage:\n');

      const dirs = ['node_modules', 'tests', 'src', '.claude-sessions', '.git'];

      for (const dir of dirs) {
        try {
          const { stdout } = await execAsync(`du -sh ${dir} 2>nul || echo "N/A"`);
          console.log(`  ${dir}: ${stdout.trim() || 'N/A'}`);
        } catch {
          console.log(`  ${dir}: N/A`);
        }
      }
    },
  },

  'env-check': {
    desc: 'Check environment variables',
    async run() {
      console.log('🔐 Environment Check:\n');

      const required = [
        'ANTHROPIC_API_KEY',
        'GROQ_API_KEY',
        'DEEPSEEK_API_KEY',
        'NODE_ENV',
        'PORT',
      ];

      required.forEach((key) => {
        const value = process.env[key];
        if (value) {
          const masked = key.includes('KEY') ? `${value.substring(0, 8)}...` : value;
          console.log(`  ✅ ${key}: ${masked}`);
        } else {
          console.log(`  ❌ ${key}: Not set`);
        }
      });
    },
  },

  connections: {
    desc: 'Show active network connections by IP',
    async run() {
      console.log('🌐 Active Network Connections:\n');
      try {
        // Based on shell_one_liners.sh block 225
        const { stdout } = await execAsync('netstat -an | findstr ESTABLISHED');
        const connections = new Map();

        stdout.split('\n').forEach((line) => {
          const match = line.match(/(\d+\.\d+\.\d+\.\d+):(\d+)/);
          if (match && match[1] !== '127.0.0.1') {
            const ip = match[1];
            connections.set(ip, (connections.get(ip) || 0) + 1);
          }
        });

        const sorted = [...connections.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

        sorted.forEach(([ip, count]) => {
          const bar = '*'.repeat(Math.min(count, 40));
          console.log(`  ${ip.padEnd(15)} ${count}\t${bar}`);
        });
      } catch (err) {
        console.log('  No established connections');
      }
    },
  },

  'port-scan': {
    desc: 'Scan local ports (like netstat -nlt)',
    async run() {
      console.log('🔍 Listening Ports:\n');
      try {
        // Based on shell_one_liners.sh block 34 (lsof equivalent)
        const { stdout } = await execAsync('netstat -an | findstr LISTENING');
        const ports = new Map();

        stdout.split('\n').forEach((line) => {
          const match = line.match(/:(\d+)\s+.*LISTENING/);
          if (match) {
            const port = match[1];
            ports.set(port, line.trim());
          }
        });

        [...ports.entries()]
          .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
          .forEach(([port, info]) => {
            console.log(`  Port ${port.padStart(5)}: ${info.substring(0, 80)}`);
          });
      } catch (err) {
        console.log('  Error scanning ports');
      }
    },
  },

  'process-tree': {
    desc: 'Show process hierarchy (like ps awwfux)',
    async run() {
      console.log('📊 Process Tree:\n');
      try {
        // Windows equivalent of ps awwfux | less -S
        const { stdout } = await execAsync('tasklist /V /FO LIST');
        const processes = stdout.split('\n\n').slice(0, 20);
        processes.forEach((proc) => {
          if (proc.trim()) {
            console.log(proc.substring(0, 200));
            console.log('─'.repeat(80));
          }
        });
      } catch (err) {
        console.log('  Error listing processes');
      }
    },
  },

  'find-large-files': {
    desc: 'Find files larger than 20MB in current dir',
    async run() {
      console.log('📁 Large Files (>20MB):\n');
      try {
        // Based on shell_one_liners.sh block 43
        // Windows doesn't have find, use PowerShell
        const { stdout } = await execAsync(
          'powershell "Get-ChildItem -Recurse -File | Where-Object { $_.Length -gt 20MB } | Select-Object FullName, @{Name=\'Size\';Expression={[math]::Round($_.Length/1MB, 2)}} | Format-Table -AutoSize"'
        );
        console.log(stdout || '  No large files found');
      } catch (err) {
        console.log('  Error searching for files');
      }
    },
  },

  'recent-files': {
    desc: 'Show recently modified files (last 60 min)',
    async run() {
      console.log('⏰ Recently Modified Files:\n');
      try {
        // Based on shell_one_liners.sh block 42
        const { stdout } = await execAsync(
          'powershell "Get-ChildItem -Recurse -File | Where-Object { $_.LastWriteTime -gt (Get-Date).AddMinutes(-60) } | Select-Object LastWriteTime, FullName | Sort-Object LastWriteTime -Descending | Select-Object -First 20"'
        );
        console.log(stdout || '  No recent files');
      } catch (err) {
        console.log('  Error finding recent files');
      }
    },
  },
};

async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  console.log('🛠️  Developer Helper\n');

  if (!command || command === 'help') {
    console.log('Available commands:\n');
    Object.entries(COMMANDS).forEach(([name, cmd]) => {
      console.log(`  ${name.padEnd(15)} - ${cmd.desc}`);
    });
    console.log('\nUsage: node scripts/dev-helper.js <command> [args]');
    return;
  }

  const cmd = COMMANDS[command];
  if (!cmd) {
    console.log(`❌ Unknown command: ${command}`);
    console.log('Run "node scripts/dev-helper.js help" for available commands');
    process.exit(1);
  }

  await cmd.run(args);
}

main().catch(console.error);
