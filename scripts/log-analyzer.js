#!/usr/bin/env node

/**
 * Log Analyzer - Advanced log file analysis and filtering
 * Based on shell_one_liners.sh awk/sed patterns (blocks 246-287, 308-311, 314-320)
 */

import { readFile } from 'fs/promises';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const LOG_COMMANDS = {
  'grep-pattern': {
    desc: 'Search for pattern in log files',
    async run(args) {
      const pattern = args[0] || 'error';
      const file = args[1] || '.claude-sessions/logs/*.log';

      console.log(`🔍 Searching for: ${pattern} in ${file}\n`);

      try {
        // Block 273-275 - grep with multiple patterns
        const { stdout } = await execAsync(
          `powershell "Get-ChildItem ${file} -ErrorAction SilentlyContinue | Select-String -Pattern '${pattern}' -CaseSensitive:$false | Select-Object -First 20"`,
          { timeout: 10000 }
        );

        if (stdout.trim()) {
          console.log(stdout);
        } else {
          console.log('No matches found');
        }
      } catch (err) {
        console.log('No log files found or error:', err.message);
      }
    },
  },

  'tail-follow': {
    desc: 'Follow log file in real-time (like tail -f)',
    async run(args) {
      const file = args[0] || '.claude-sessions/logs/latest.log';
      const lines = parseInt(args[1]) || 10;

      console.log(`👁️  Following ${file} (last ${lines} lines)...\n`);

      try {
        // Block 308 - tail -f with timestamps
        const { stdout } = await execAsync(
          `powershell "Get-Content '${file}' -Tail ${lines} -Wait"`,
          { timeout: 60000 }
        );

        console.log(stdout);
      } catch (err) {
        console.log('File not found or error:', err.message);
      }
    },
  },

  'top-ips': {
    desc: 'Find top IPs from access logs',
    async run(args) {
      const file = args[0] || 'logs/access.log';
      const count = parseInt(args[1]) || 10;

      console.log(`📊 Top ${count} IPs from ${file}\n`);

      try {
        // Block 311 - top IPs from access log
        const content = await readFile(file, 'utf-8');
        const ipMap = new Map();

        content.split('\n').forEach((line) => {
          const match = line.match(/^(\d+\.\d+\.\d+\.\d+)/);
          if (match) {
            const ip = match[1];
            ipMap.set(ip, (ipMap.get(ip) || 0) + 1);
          }
        });

        const sorted = [...ipMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, count);

        sorted.forEach(([ip, cnt]) => {
          const bar = '█'.repeat(Math.min(cnt / 10, 50));
          console.log(`${ip.padEnd(15)} ${String(cnt).padStart(6)} ${bar}`);
        });
      } catch (err) {
        console.log('File not found:', err.message);
      }
    },
  },

  'filter-errors': {
    desc: 'Filter log file for errors/warnings',
    async run(args) {
      const file = args[0] || '.claude-sessions/logs/latest.log';

      console.log(`⚠️  Filtering errors from ${file}\n`);

      try {
        // Block 274-275 - multiple pattern grep
        const content = await readFile(file, 'utf-8');
        const lines = content.split('\n');

        const errors = lines.filter((line) => /error|fail|exception|critical|fatal/i.test(line));

        const warnings = lines.filter((line) => /warn|warning|caution/i.test(line));

        console.log(`Errors: ${errors.length}`);
        console.log(`Warnings: ${warnings.length}\n`);

        if (errors.length > 0) {
          console.log('Recent Errors:');
          errors.slice(-10).forEach((err) => console.log(`  ❌ ${err.substring(0, 100)}`));
        }

        if (warnings.length > 0) {
          console.log('\nRecent Warnings:');
          warnings.slice(-5).forEach((warn) => console.log(`  ⚠️  ${warn.substring(0, 100)}`));
        }
      } catch (err) {
        console.log('File not found:', err.message);
      }
    },
  },

  'http-status': {
    desc: 'Analyze HTTP status codes from access log',
    async run(args) {
      const file = args[0] || 'logs/access.log';

      console.log(`📈 HTTP Status Analysis: ${file}\n`);

      try {
        // Block 314 - HTTP status filtering
        const content = await readFile(file, 'utf-8');
        const statusMap = new Map();

        content.split('\n').forEach((line) => {
          const match = line.match(/HTTP\/[12]\.[01]"\s+(\d{3})/);
          if (match) {
            const status = match[1];
            statusMap.set(status, (statusMap.get(status) || 0) + 1);
          }
        });

        const sorted = [...statusMap.entries()].sort((a, b) => b[1] - a[1]);

        console.log('Status Code Distribution:\n');
        sorted.forEach(([status, count]) => {
          const emoji = status.startsWith('2')
            ? '✅'
            : status.startsWith('3')
              ? '➡️'
              : status.startsWith('4')
                ? '⚠️'
                : '❌';
          const bar = '█'.repeat(Math.min(count / 10, 40));
          console.log(`${emoji} ${status} ${String(count).padStart(6)} ${bar}`);
        });
      } catch (err) {
        console.log('File not found:', err.message);
      }
    },
  },

  'remove-blank': {
    desc: 'Remove blank lines from file',
    async run(args) {
      const file = args[0];

      if (!file) {
        console.log('Usage: remove-blank <filename>');
        return;
      }

      console.log(`🧹 Removing blank lines from ${file}\n`);

      try {
        // Block 258 - awk 'NF > 0'
        const content = await readFile(file, 'utf-8');
        const lines = content.split('\n');
        const nonBlank = lines.filter((line) => line.trim().length > 0);

        console.log(`Original lines: ${lines.length}`);
        console.log(`Non-blank lines: ${nonBlank.length}`);
        console.log(`Removed: ${lines.length - nonBlank.length}`);

        console.log('\nPreview (first 10 non-blank lines):');
        nonBlank.slice(0, 10).forEach((line) => console.log(`  ${line.substring(0, 80)}`));
      } catch (err) {
        console.log('Error:', err.message);
      }
    },
  },

  'find-long-lines': {
    desc: 'Find lines longer than specified length',
    async run(args) {
      const file = args[0];
      const maxLen = parseInt(args[1]) || 80;

      if (!file) {
        console.log('Usage: find-long-lines <filename> [max-length]');
        return;
      }

      console.log(`📏 Finding lines > ${maxLen} characters in ${file}\n`);

      try {
        // Block 250 - awk 'length($0)>80'
        const content = await readFile(file, 'utf-8');
        const lines = content.split('\n');

        const longLines = lines
          .map((line, idx) => ({ line, idx: idx + 1 }))
          .filter(({ line }) => line.length > maxLen);

        console.log(`Found ${longLines.length} lines longer than ${maxLen} characters\n`);

        longLines.slice(0, 20).forEach(({ line, idx }) => {
          console.log(`Line ${idx} (${line.length} chars):`);
          console.log(`  ${line.substring(0, 100)}...`);
        });

        if (longLines.length > 20) {
          console.log(`\n... and ${longLines.length - 20} more`);
        }
      } catch (err) {
        console.log('Error:', err.message);
      }
    },
  },

  'time-range': {
    desc: 'Extract logs from time range',
    async run(args) {
      const file = args[0];
      const start = args[1] || '00:00';
      const end = args[2] || '23:59';

      if (!file) {
        console.log('Usage: time-range <filename> [start-time] [end-time]');
        console.log('Example: time-range app.log 14:00 15:00');
        return;
      }

      console.log(`⏰ Extracting logs from ${start} to ${end} in ${file}\n`);

      try {
        // Block 266 - time range filtering with awk
        const content = await readFile(file, 'utf-8');
        const lines = content.split('\n');

        const timeRegex = /(\d{2}:\d{2})/;
        const filtered = lines.filter((line) => {
          const match = line.match(timeRegex);
          if (match) {
            const time = match[1];
            return time >= start && time <= end;
          }
          return false;
        });

        console.log(`Found ${filtered.length} lines in time range\n`);
        filtered.slice(0, 50).forEach((line) => {
          console.log(`  ${line.substring(0, 120)}`);
        });

        if (filtered.length > 50) {
          console.log(`\n... and ${filtered.length - 50} more lines`);
        }
      } catch (err) {
        console.log('Error:', err.message);
      }
    },
  },

  'unique-lines': {
    desc: 'Remove duplicate lines from file',
    async run(args) {
      const file = args[0];

      if (!file) {
        console.log('Usage: unique-lines <filename>');
        return;
      }

      console.log(`🔄 Finding unique lines in ${file}\n`);

      try {
        // Block 262 - awk '!x[$0]++'
        const content = await readFile(file, 'utf-8');
        const lines = content.split('\n');
        const seen = new Set();
        const unique = lines.filter((line) => {
          if (seen.has(line)) return false;
          seen.add(line);
          return true;
        });

        console.log(`Original lines: ${lines.length}`);
        console.log(`Unique lines: ${unique.length}`);
        console.log(`Duplicates removed: ${lines.length - unique.length}`);
      } catch (err) {
        console.log('Error:', err.message);
      }
    },
  },
};

async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  console.log('📊 Log Analyzer\n');

  if (!command || command === 'help') {
    console.log('Available commands:\n');
    Object.entries(LOG_COMMANDS).forEach(([name, cmd]) => {
      console.log(`  ${name.padEnd(20)} - ${cmd.desc}`);
    });

    console.log('\nUsage: node scripts/log-analyzer.js <command> [args]');
    console.log('\nExamples:');
    console.log('  node scripts/log-analyzer.js grep-pattern error app.log');
    console.log('  node scripts/log-analyzer.js filter-errors app.log');
    console.log('  node scripts/log-analyzer.js top-ips access.log');
    console.log('  node scripts/log-analyzer.js time-range app.log 14:00 15:00');
    return;
  }

  const cmd = LOG_COMMANDS[command];
  if (!cmd) {
    console.log(`❌ Unknown command: ${command}`);
    console.log('Run "node scripts/log-analyzer.js help" for available commands');
    process.exit(1);
  }

  await cmd.run(args);
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
