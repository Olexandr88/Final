#!/usr/bin/env node
/**
 * Diff Helper - Advanced File Comparison Utilities
 * Based on shell_one_liners.sh blocks 74-78
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';

const execAsync = promisify(exec);
const isWindows = process.platform === 'win32';

const DIFF_COMMANDS = {
  'files': {
    desc: 'Compare two files',
    async run(args) {
      const [file1, file2] = args;

      if (!file1 || !file2) {
        console.log('❌ Usage: diff-helper files <file1> <file2>');
        return;
      }

      if (!existsSync(file1)) {
        console.log(`❌ File not found: ${file1}`);
        return;
      }

      if (!existsSync(file2)) {
        console.log(`❌ File not found: ${file2}`);
        return;
      }

      console.log(`📄 Comparing ${file1} and ${file2}\n`);

      try {
        // Block 75 - basic diff
        const { stdout } = await execAsync(`diff "${file1}" "${file2}"`);
        console.log(stdout);
      } catch (error) {
        // diff returns exit code 1 when files differ
        if (error.stdout) {
          console.log(error.stdout);
        } else {
          console.log('✅ Files are identical');
        }
      }
    }
  },

  'dirs': {
    desc: 'Compare two directories',
    async run(args) {
      const [dir1, dir2] = args;

      if (!dir1 || !dir2) {
        console.log('❌ Usage: diff-helper dirs <dir1> <dir2>');
        return;
      }

      console.log(`📁 Comparing directories ${dir1} and ${dir2}\n`);

      try {
        if (isWindows) {
          console.log('⚠️  Directory diff on Windows - showing file lists:');
          const { stdout: list1 } = await execAsync(`dir /B /S "${dir1}"`);
          const { stdout: list2 } = await execAsync(`dir /B /S "${dir2}"`);

          const files1 = new Set(list1.split('\n').map(f => f.trim()).filter(Boolean));
          const files2 = new Set(list2.split('\n').map(f => f.trim()).filter(Boolean));

          console.log(`Dir1 has ${files1.size} files`);
          console.log(`Dir2 has ${files2.size} files`);
        } else {
          // Block 74 - directory comparison
          const cmd = `diff <(cd "${dir1}" && find . | sort) <(cd "${dir2}" && find . | sort)`;
          const { stdout } = await execAsync(cmd, { shell: '/bin/bash' });
          console.log(stdout);
        }
      } catch (error) {
        if (error.stdout) {
          console.log(error.stdout);
        } else {
          console.log('✅ Directories are identical');
        }
      }
    }
  },

  'json': {
    desc: 'Compare two JSON files (sorted)',
    async run(args) {
      const [file1, file2] = args;

      if (!file1 || !file2) {
        console.log('❌ Usage: diff-helper json <file1.json> <file2.json>');
        return;
      }

      console.log(`📊 Comparing JSON files (sorted)\n`);

      try {
        // Block 77 - JSON comparison with jq
        const cmd = isWindows
          ? `diff "${file1}" "${file2}"`  // Basic diff on Windows
          : `diff <(jq -S . "${file1}") <(jq -S . "${file2}")`;

        const { stdout } = await execAsync(cmd, { shell: '/bin/bash' });
        console.log(stdout);
      } catch (error) {
        if (error.stdout) {
          console.log(error.stdout);
        } else if (error.message.includes('jq')) {
          console.log('⚠️  jq not installed. Using basic diff:');
          try {
            const { stdout } = await execAsync(`diff "${file1}" "${file2}"`);
            console.log(stdout);
          } catch (e) {
            console.log(e.stdout || '✅ Files are identical');
          }
        } else {
          console.log('✅ Files are identical');
        }
      }
    }
  },

  'unified': {
    desc: 'Unified diff format (easier to read)',
    async run(args) {
      const [file1, file2] = args;

      if (!file1 || !file2) {
        console.log('❌ Usage: diff-helper unified <file1> <file2>');
        return;
      }

      console.log(`📋 Unified diff:\n`);

      try {
        const { stdout } = await execAsync(`diff -u "${file1}" "${file2}"`);
        console.log(stdout);
      } catch (error) {
        if (error.stdout) {
          console.log(error.stdout);
        } else {
          console.log('✅ Files are identical');
        }
      }
    }
  },

  'side-by-side': {
    desc: 'Side-by-side diff',
    async run(args) {
      const [file1, file2] = args;

      if (!file1 || !file2) {
        console.log('❌ Usage: diff-helper side-by-side <file1> <file2>');
        return;
      }

      console.log(`📊 Side-by-side comparison:\n`);

      try {
        const { stdout } = await execAsync(`diff -y "${file1}" "${file2}"`);
        console.log(stdout);
      } catch (error) {
        if (error.stdout) {
          console.log(error.stdout);
        } else {
          console.log('✅ Files are identical');
        }
      }
    }
  },

  'context': {
    desc: 'Context diff with 3 lines of context',
    async run(args) {
      const [file1, file2] = args;

      if (!file1 || !file2) {
        console.log('❌ Usage: diff-helper context <file1> <file2>');
        return;
      }

      console.log(`📝 Context diff (3 lines):\n`);

      try {
        const { stdout } = await execAsync(`diff -c "${file1}" "${file2}"`);
        console.log(stdout);
      } catch (error) {
        if (error.stdout) {
          console.log(error.stdout);
        } else {
          console.log('✅ Files are identical');
        }
      }
    }
  },

  'stats': {
    desc: 'Show diff statistics only',
    async run(args) {
      const [file1, file2] = args;

      if (!file1 || !file2) {
        console.log('❌ Usage: diff-helper stats <file1> <file2>');
        return;
      }

      console.log(`📊 Diff Statistics:\n`);

      try {
        const { stdout } = await execAsync(`diff "${file1}" "${file2}" | wc -l`);
        const lines = stdout.trim();

        if (lines === '0') {
          console.log('✅ Files are identical');
        } else {
          console.log(`Lines different: ${lines}`);

          // Show brief summary
          const { stdout: summary } = await execAsync(`diff -q "${file1}" "${file2}"`);
          console.log(summary);
        }
      } catch (error) {
        if (error.stdout) {
          const lines = error.stdout.split('\n').length - 1;
          console.log(`Lines different: ${lines}`);
        }
      }
    }
  },

  'binary': {
    desc: 'Compare binary files (hexdump)',
    async run(args) {
      const [file1, file2] = args;

      if (!file1 || !file2) {
        console.log('❌ Usage: diff-helper binary <file1> <file2>');
        return;
      }

      console.log(`🔢 Binary file comparison:\n`);

      try {
        if (isWindows) {
          // Use fc for binary comparison on Windows
          const { stdout } = await execAsync(`fc /b "${file1}" "${file2}"`);
          console.log(stdout);
        } else {
          // Block 78 - hexdump comparison
          const cmd = `diff <(hexdump -C "${file1}") <(hexdump -C "${file2}")`;
          const { stdout } = await execAsync(cmd, { shell: '/bin/bash' });
          console.log(stdout);
        }
      } catch (error) {
        if (error.stdout) {
          console.log(error.stdout);
        } else {
          console.log('✅ Files are identical');
        }
      }
    }
  },

  'ignore-whitespace': {
    desc: 'Diff ignoring whitespace changes',
    async run(args) {
      const [file1, file2] = args;

      if (!file1 || !file2) {
        console.log('❌ Usage: diff-helper ignore-whitespace <file1> <file2>');
        return;
      }

      console.log(`📄 Diff (ignoring whitespace):\n`);

      try {
        const { stdout } = await execAsync(`diff -w "${file1}" "${file2}"`);
        console.log(stdout);
      } catch (error) {
        if (error.stdout) {
          console.log(error.stdout);
        } else {
          console.log('✅ Files are identical (ignoring whitespace)');
        }
      }
    }
  },

  'ignore-case': {
    desc: 'Diff ignoring case differences',
    async run(args) {
      const [file1, file2] = args;

      if (!file1 || !file2) {
        console.log('❌ Usage: diff-helper ignore-case <file1> <file2>');
        return;
      }

      console.log(`📄 Diff (ignoring case):\n`);

      try {
        const { stdout } = await execAsync(`diff -i "${file1}" "${file2}"`);
        console.log(stdout);
      } catch (error) {
        if (error.stdout) {
          console.log(error.stdout);
        } else {
          console.log('✅ Files are identical (ignoring case)');
        }
      }
    }
  }
};

// CLI Interface
const command = process.argv[2];
const args = process.argv.slice(3);

if (!command || command === 'help' || command === '--help') {
  console.log('🔍 Diff Helper\n');
  console.log('Available commands:\n');

  Object.entries(DIFF_COMMANDS).forEach(([cmd, { desc }]) => {
    console.log(`  ${cmd.padEnd(20)} - ${desc}`);
  });

  console.log('\nUsage: node scripts/diff-helper.js <command> <file1> <file2>');
  console.log('\nExamples:');
  console.log('  node scripts/diff-helper.js files package.json package.json.backup');
  console.log('  node scripts/diff-helper.js dirs ./src ./backup/src');
  console.log('  node scripts/diff-helper.js json config.json config.prod.json');
  console.log('  node scripts/diff-helper.js unified file1.txt file2.txt');
  process.exit(0);
}

const cmd = DIFF_COMMANDS[command];
if (!cmd) {
  console.log(`❌ Unknown command: ${command}`);
  console.log('Run "node scripts/diff-helper.js help" for available commands');
  process.exit(1);
}

cmd.run(args).catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
