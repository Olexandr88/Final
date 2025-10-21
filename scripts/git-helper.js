#!/usr/bin/env node
/**
 * Git Helper - Advanced Git Operations
 * Based on shell_one_liners.sh block 241
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const GIT_COMMANDS = {
  'log-graph': {
    desc: 'Beautiful git log with graph',
    async run() {
      console.log('📊 Git Log with Graph\n');

      // Block 241 - option 1
      const { stdout } = await execAsync('git log --oneline --decorate --graph --all');
      console.log(stdout);
    }
  },

  'log-pretty': {
    desc: 'Pretty formatted git log',
    async run() {
      console.log('✨ Pretty Git Log\n');

      // Block 241 - option 2
      const cmd = `git log --graph --pretty=format:'%Cred%h%Creset -%C(yellow)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset' --abbrev-commit`;
      const { stdout } = await execAsync(cmd);
      console.log(stdout);
    }
  },

  'log-stats': {
    desc: 'Git log with file statistics',
    async run() {
      console.log('📈 Git Log with Stats\n');

      const { stdout } = await execAsync('git log --stat --oneline -10');
      console.log(stdout);
    }
  },

  'recent': {
    desc: 'Recent commits (last 20)',
    async run() {
      const { stdout } = await execAsync('git log --oneline -20');
      console.log('📅 Recent Commits:\n');
      console.log(stdout);
    }
  },

  'authors': {
    desc: 'List all authors with commit counts',
    async run() {
      console.log('👥 Authors and Commit Counts\n');

      const { stdout } = await execAsync('git shortlog -sn --all');
      console.log(stdout);
    }
  },

  'branches': {
    desc: 'List all branches with last commit',
    async run() {
      console.log('🌿 All Branches\n');

      const { stdout } = await execAsync('git branch -av');
      console.log(stdout);
    }
  },

  'status-short': {
    desc: 'Short status summary',
    async run() {
      const { stdout } = await execAsync('git status --short');
      console.log('📋 Status:\n');
      console.log(stdout || '  ✓ Working tree clean');
    }
  },

  'uncommitted': {
    desc: 'Show uncommitted changes',
    async run() {
      console.log('📝 Uncommitted Changes\n');

      const { stdout } = await execAsync('git diff --stat');
      if (stdout.trim()) {
        console.log(stdout);
      } else {
        console.log('  ✓ No uncommitted changes');
      }
    }
  },

  'file-history': {
    desc: 'Show history of a specific file',
    async run(args) {
      const file = args[0];
      if (!file) {
        console.log('❌ Usage: git-helper file-history <filename>');
        return;
      }

      console.log(`📜 History of ${file}\n`);

      const { stdout } = await execAsync(`git log --oneline --follow -- ${file}`);
      console.log(stdout);
    }
  },

  'blame': {
    desc: 'Show who changed each line in file',
    async run(args) {
      const file = args[0];
      if (!file) {
        console.log('❌ Usage: git-helper blame <filename>');
        return;
      }

      console.log(`🔍 Blame for ${file}\n`);

      const { stdout } = await execAsync(`git blame ${file}`);
      console.log(stdout);
    }
  },

  'changed-files': {
    desc: 'Files changed in last N commits',
    async run(args) {
      const count = args[0] || '10';

      console.log(`📂 Files Changed in Last ${count} Commits\n`);

      const { stdout } = await execAsync(`git log --name-only --oneline -${count}`);
      console.log(stdout);
    }
  },

  'diff-branch': {
    desc: 'Diff between two branches',
    async run(args) {
      const branch1 = args[0] || 'main';
      const branch2 = args[1] || 'HEAD';

      console.log(`🔀 Diff between ${branch1} and ${branch2}\n`);

      const { stdout } = await execAsync(`git diff ${branch1}..${branch2} --stat`);
      console.log(stdout);
    }
  },

  'stash-list': {
    desc: 'List all stashes',
    async run() {
      console.log('💾 Stash List\n');

      try {
        const { stdout } = await execAsync('git stash list');
        console.log(stdout || '  (no stashes)');
      } catch {
        console.log('  (no stashes)');
      }
    }
  },

  'tags': {
    desc: 'List all tags',
    async run() {
      console.log('🏷️  Tags\n');

      const { stdout } = await execAsync('git tag -l');
      console.log(stdout || '  (no tags)');
    }
  },

  'remote': {
    desc: 'Show remote repositories',
    async run() {
      console.log('🌐 Remote Repositories\n');

      const { stdout } = await execAsync('git remote -v');
      console.log(stdout);
    }
  },

  'size': {
    desc: 'Repository size and object count',
    async run() {
      console.log('📦 Repository Size\n');

      const { stdout: count } = await execAsync('git count-objects -vH');
      console.log(count);
    }
  },

  'contributors': {
    desc: 'Top contributors by lines of code',
    async run(args) {
      const limit = args[0] || '10';

      console.log(`👨‍💻 Top ${limit} Contributors by LOC\n`);

      const { stdout } = await execAsync(
        `git log --format='%aN' | sort | uniq -c | sort -rn | head -${limit}`
      );
      console.log(stdout);
    }
  },

  'today': {
    desc: 'Commits made today',
    async run() {
      console.log('📅 Today\'s Commits\n');

      const { stdout } = await execAsync('git log --since="midnight" --oneline');
      console.log(stdout || '  (no commits today)');
    }
  },

  'summary': {
    desc: 'Quick repository summary',
    async run() {
      console.log('📊 Repository Summary\n');

      try {
        const { stdout: branch } = await execAsync('git branch --show-current');
        const { stdout: commits } = await execAsync('git rev-list --count HEAD');
        const { stdout: authors } = await execAsync('git shortlog -sn --all | wc -l');
        const { stdout: files } = await execAsync('git ls-files | wc -l');

        console.log(`Current Branch: ${branch.trim()}`);
        console.log(`Total Commits: ${commits.trim()}`);
        console.log(`Contributors: ${authors.trim()}`);
        console.log(`Tracked Files: ${files.trim()}`);

        console.log('\nRecent Activity:');
        const { stdout: recent } = await execAsync('git log --oneline -5');
        console.log(recent);
      } catch (error) {
        console.error('❌ Error generating summary:', error.message);
      }
    }
  }
};

// CLI Interface
const command = process.argv[2];
const args = process.argv.slice(3);

if (!command || command === 'help' || command === '--help') {
  console.log('🔧 Git Helper\n');
  console.log('Available commands:\n');

  Object.entries(GIT_COMMANDS).forEach(([cmd, { desc }]) => {
    console.log(`  ${cmd.padEnd(20)} - ${desc}`);
  });

  console.log('\nUsage: node scripts/git-helper.js <command> [args]');
  console.log('\nExamples:');
  console.log('  node scripts/git-helper.js log-pretty');
  console.log('  node scripts/git-helper.js file-history package.json');
  console.log('  node scripts/git-helper.js diff-branch main develop');
  process.exit(0);
}

const cmd = GIT_COMMANDS[command];
if (!cmd) {
  console.log(`❌ Unknown command: ${command}`);
  console.log('Run "node scripts/git-helper.js help" for available commands');
  process.exit(1);
}

cmd.run(args).catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
