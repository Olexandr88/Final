#!/usr/bin/env node

/**
 * File Operations Utility
 * Based on shell_one_liners.sh find, awk, sed patterns
 * Provides cross-platform file search and manipulation
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';

const execAsync = promisify(exec);

const COMMANDS = {
  'find-large': {
    desc: 'Find files larger than size (default: 20MB)',
    async run(args) {
      const sizeMB = args[0] || '20';
      const path = args[1] || '.';

      console.log(`📁 Finding files > ${sizeMB}MB in ${path}:\n`);

      try {
        // Based on shell_one_liners.sh block #43
        const { stdout } = await execAsync(
          `powershell "Get-ChildItem -Path '${path}' -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Length -gt ${sizeMB}MB } | Select-Object FullName, @{Name='SizeMB';Expression={[math]::Round($_.Length/1MB, 2)}} | Sort-Object SizeMB -Descending | Format-Table -AutoSize"`,
          { timeout: 30000 }
        );
        console.log(stdout || '  No large files found');
      } catch (err) {
        console.log(`  Error: ${err.message}`);
      }
    }
  },

  'find-recent': {
    desc: 'Find files modified in last N minutes (default: 60)',
    async run(args) {
      const minutes = args[0] || '60';
      const path = args[1] || '.';

      console.log(`⏰ Files modified in last ${minutes} minutes:\n`);

      try {
        // Based on shell_one_liners.sh block #42
        const { stdout } = await execAsync(
          `powershell "Get-ChildItem -Path '${path}' -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt (Get-Date).AddMinutes(-${minutes}) } | Select-Object LastWriteTime, FullName | Sort-Object LastWriteTime -Descending | Format-Table -AutoSize"`,
          { timeout: 30000 }
        );
        console.log(stdout || '  No recent files');
      } catch (err) {
        console.log(`  Error: ${err.message}`);
      }
    }
  },

  'find-duplicates': {
    desc: 'Find duplicate files by hash',
    async run(args) {
      const path = args[0] || '.';
      console.log(`🔍 Finding duplicate files in ${path}:\n`);

      try {
        // Based on shell_one_liners.sh block #44
        const { stdout } = await execAsync(
          `powershell "Get-ChildItem -Path '${path}' -Recurse -File | Get-FileHash -Algorithm MD5 | Group-Object Hash | Where-Object { $_.Count -gt 1 } | ForEach-Object { Write-Host ('Hash: ' + $_.Name); $_.Group | Select-Object Path | Format-Table -HideTableHeaders }"`,
          { timeout: 60000 }
        );
        console.log(stdout || '  No duplicates found');
      } catch (err) {
        console.log(`  Error: ${err.message}`);
      }
    }
  },

  'find-by-extension': {
    desc: 'Find files by extension',
    async run(args) {
      const ext = args[0];
      const path = args[1] || '.';

      if (!ext) {
        console.log('❌ Usage: file-operations find-by-extension <ext> [path]');
        return;
      }

      console.log(`📄 Finding *.${ext} files in ${path}:\n`);

      try {
        const { stdout } = await execAsync(
          `powershell "Get-ChildItem -Path '${path}' -Recurse -Filter '*.${ext}' -File -ErrorAction SilentlyContinue | Select-Object FullName, Length, LastWriteTime | Format-Table -AutoSize"`,
          { timeout: 30000 }
        );
        console.log(stdout || '  No files found');
      } catch (err) {
        console.log(`  Error: ${err.message}`);
      }
    }
  },

  'disk-usage': {
    desc: 'Show disk usage by directory (top 20)',
    async run(args) {
      const path = args[0] || '.';
      console.log(`💾 Disk Usage in ${path}:\n`);

      try {
        // Based on shell_one_liners.sh block #98
        const { stdout } = await execAsync(
          `powershell "Get-ChildItem -Path '${path}' -Directory -ErrorAction SilentlyContinue | ForEach-Object { $size = (Get-ChildItem $_.FullName -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum; [PSCustomObject]@{Path=$_.Name; SizeMB=[math]::Round($size/1MB, 2)} } | Sort-Object SizeMB -Descending | Select-Object -First 20 | Format-Table -AutoSize"`,
          { timeout: 60000 }
        );
        console.log(stdout || '  No directories found');
      } catch (err) {
        console.log(`  Error: ${err.message}`);
      }
    }
  },

  'count-lines': {
    desc: 'Count lines in all files by extension',
    async run(args) {
      const ext = args[0] || 'js';
      const path = args[1] || '.';

      console.log(`📊 Line count for *.${ext} files:\n`);

      try {
        // Based on Perl block #287 pattern
        const { stdout } = await execAsync(
          `powershell "Get-ChildItem -Path '${path}' -Recurse -Filter '*.${ext}' -File -ErrorAction SilentlyContinue | ForEach-Object { $lines = (Get-Content $_.FullName | Measure-Object -Line).Lines; [PSCustomObject]@{File=$_.Name; Lines=$lines} } | Sort-Object Lines -Descending | Format-Table -AutoSize"`,
          { timeout: 60000 }
        );

        const { stdout: total } = await execAsync(
          `powershell "Get-ChildItem -Path '${path}' -Recurse -Filter '*.${ext}' -File -ErrorAction SilentlyContinue | Get-Content | Measure-Object -Line | Select-Object -ExpandProperty Lines"`,
          { timeout: 60000 }
        );

        console.log(stdout);
        console.log(`\nTotal lines: ${total.trim()}`);
      } catch (err) {
        console.log(`  Error: ${err.message}`);
      }
    }
  },

  'empty-dirs': {
    desc: 'Find empty directories',
    async run(args) {
      const path = args[0] || '.';
      console.log(`📂 Empty directories in ${path}:\n`);

      try {
        // Based on shell_one_liners.sh block #51
        const { stdout } = await execAsync(
          `powershell "Get-ChildItem -Path '${path}' -Recurse -Directory -ErrorAction SilentlyContinue | Where-Object { (Get-ChildItem $_.FullName -Force -ErrorAction SilentlyContinue).Count -eq 0 } | Select-Object FullName | Format-Table -HideTableHeaders"`,
          { timeout: 30000 }
        );
        console.log(stdout || '  No empty directories found');
      } catch (err) {
        console.log(`  Error: ${err.message}`);
      }
    }
  },

  'file-stats': {
    desc: 'Show file statistics for current directory',
    async run() {
      console.log('📈 File Statistics:\n');

      try {
        const stats = {
          total: 0,
          files: 0,
          dirs: 0,
          totalSize: 0,
          byExt: new Map()
        };

        async function scan(dir) {
          try {
            const items = await readdir(dir);

            for (const item of items) {
              const fullPath = join(dir, item);
              try {
                const itemStat = await stat(fullPath);
                stats.total++;

                if (itemStat.isDirectory()) {
                  stats.dirs++;
                  await scan(fullPath);
                } else {
                  stats.files++;
                  stats.totalSize += itemStat.size;

                  const ext = item.split('.').pop();
                  if (ext && item.includes('.')) {
                    stats.byExt.set(ext, (stats.byExt.get(ext) || 0) + 1);
                  }
                }
              } catch {}
            }
          } catch {}
        }

        await scan('.');

        console.log(`  Total items: ${stats.total}`);
        console.log(`  Files: ${stats.files}`);
        console.log(`  Directories: ${stats.dirs}`);
        console.log(`  Total size: ${(stats.totalSize / (1024 * 1024)).toFixed(2)} MB\n`);

        console.log('  Top 10 file types:');
        const sorted = [...stats.byExt.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10);

        sorted.forEach(([ext, count]) => {
          console.log(`    .${ext}: ${count} files`);
        });
      } catch (err) {
        console.log(`  Error: ${err.message}`);
      }
    }
  },

  'search-content': {
    desc: 'Search for text in files (case-insensitive)',
    async run(args) {
      const query = args[0];
      const path = args[1] || '.';
      const ext = args[2] || '*';

      if (!query) {
        console.log('❌ Usage: file-operations search-content <query> [path] [ext]');
        return;
      }

      console.log(`🔎 Searching for "${query}" in ${path}:\n`);

      try {
        // Based on grep patterns (block #273)
        const { stdout } = await execAsync(
          `powershell "Get-ChildItem -Path '${path}' -Recurse -Filter '*.${ext}' -File -ErrorAction SilentlyContinue | Select-String -Pattern '${query}' -CaseSensitive:$false | Select-Object Path, LineNumber, Line | Format-Table -Wrap"`,
          { timeout: 60000 }
        );
        console.log(stdout || '  No matches found');
      } catch (err) {
        console.log(`  Error: ${err.message}`);
      }
    }
  }
};

async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  console.log('📂 File Operations Utility\n');

  if (!command || command === 'help') {
    console.log('Available commands:\n');
    Object.entries(COMMANDS).forEach(([name, cmd]) => {
      console.log(`  ${name.padEnd(20)} - ${cmd.desc}`);
    });
    console.log('\nUsage: node scripts/file-operations.js <command> [args]');
    console.log('\nExamples:');
    console.log('  node scripts/file-operations.js find-large 50');
    console.log('  node scripts/file-operations.js find-recent 30');
    console.log('  node scripts/file-operations.js search-content "TODO" . js');
    console.log('  node scripts/file-operations.js disk-usage');
    return;
  }

  const cmd = COMMANDS[command];
  if (!cmd) {
    console.log(`❌ Unknown command: ${command}`);
    console.log('Run "node scripts/file-operations.js help" for available commands');
    process.exit(1);
  }

  await cmd.run(args);
}

main().catch(console.error);
