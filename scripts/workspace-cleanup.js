#!/usr/bin/env node

/**
 * Workspace Cleanup Utility
 * Removes temporary files, test artifacts, and development clutter
 */

import { readdir, stat, rm, rmdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const DRY_RUN = process.argv.includes('--dry-run');
const AGGRESSIVE = process.argv.includes('--aggressive');

const PATTERNS_TO_REMOVE = {
  // Test artifacts
  testArtifacts: [
    '.test-sessions',
    'test-output.txt',
    'test-results.txt',
    'test_output.txt',
    'test.txt',
    'test.js'
  ],

  // Temporary files
  tempFiles: [
    'variableContent',
    'summary.txt',
    'NUL',
    'SHARED-FILE.txt',
    '.temp-dashboard-optimizations.txt'
  ],

  // Demo/validation scripts (if aggressive)
  demoScripts: [
    'demo-*.js',
    'test-a2a-*.js',
    'validate-*.js',
    'verify-*.ps1',
    'cleanup-*.ps1'
  ],

  // Markdown reports (keep important ones)
  reports: [
    '*-COMPLETE.md',
    '*-REPORT.md',
    '*-STATUS.md',
    '*-VALIDATED.md',
    'OPTIMIZATION-*.md',
    'WHAT_IS_THIS.txt',
    'WHATS_NEXT.txt',
    'SIMPLE_SUMMARY.txt'
  ]
};

async function shouldRemove(filename, category) {
  const patterns = PATTERNS_TO_REMOVE[category];
  return patterns.some(pattern => {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
      return regex.test(filename);
    }
    return filename === pattern;
  });
}

async function cleanupDirectory(dir = '.') {
  const removed = {
    files: [],
    dirs: [],
    savedSpace: 0
  };

  try {
    const items = await readdir(dir);

    for (const item of items) {
      const fullPath = join(dir, item);

      // Skip critical directories
      if ([
        'node_modules', '.git', 'src', 'tests', 'scripts',
        '.claude', '.github', 'prisma', 'electron'
      ].includes(item)) {
        continue;
      }

      try {
        const stats = await stat(fullPath);

        // Check if should remove
        let shouldDelete = false;
        let reason = '';

        if (stats.isFile()) {
          if (await shouldRemove(item, 'testArtifacts')) {
            shouldDelete = true;
            reason = 'test artifact';
          } else if (await shouldRemove(item, 'tempFiles')) {
            shouldDelete = true;
            reason = 'temp file';
          } else if (AGGRESSIVE && await shouldRemove(item, 'reports')) {
            shouldDelete = true;
            reason = 'report file';
          } else if (AGGRESSIVE && await shouldRemove(item, 'demoScripts')) {
            shouldDelete = true;
            reason = 'demo script';
          }

          if (shouldDelete) {
            console.log(`${DRY_RUN ? '[DRY] ' : ''}Removing ${item} (${reason}) - ${(stats.size / 1024).toFixed(2)} KB`);
            if (!DRY_RUN) {
              await rm(fullPath, { force: true });
            }
            removed.files.push(item);
            removed.savedSpace += stats.size;
          }
        } else if (stats.isDirectory()) {
          // Remove specific empty or test directories
          const tempDirs = [
            'test-workspace',
            'vibe-demo-workspace',
            'demo',
            'output',
            'generated'
          ];

          if (tempDirs.includes(item)) {
            console.log(`${DRY_RUN ? '[DRY] ' : ''}Removing directory ${item}`);
            if (!DRY_RUN) {
              await rm(fullPath, { recursive: true, force: true });
            }
            removed.dirs.push(item);
          }
        }
      } catch (err) {
        // Skip files we can't access
      }
    }
  } catch (err) {
    console.error('Error during cleanup:', err.message);
  }

  return removed;
}

async function main() {
  console.log('🧹 Workspace Cleanup Utility');
  console.log('━'.repeat(60));

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No files will be deleted');
  }

  if (AGGRESSIVE) {
    console.log('⚠️  AGGRESSIVE MODE - Will remove reports and demo files');
  }

  console.log('');

  const result = await cleanupDirectory('.');

  console.log('\n📊 Cleanup Summary');
  console.log('━'.repeat(60));
  console.log(`Files removed: ${result.files.length}`);
  console.log(`Directories removed: ${result.dirs.length}`);
  console.log(`Space saved: ${(result.savedSpace / (1024 * 1024)).toFixed(2)} MB`);

  if (result.files.length > 0) {
    console.log('\nFiles removed:');
    result.files.slice(0, 20).forEach(f => console.log(`  • ${f}`));
    if (result.files.length > 20) {
      console.log(`  ... and ${result.files.length - 20} more`);
    }
  }

  if (result.dirs.length > 0) {
    console.log('\nDirectories removed:');
    result.dirs.forEach(d => console.log(`  • ${d}`));
  }

  console.log('\n✨ Cleanup complete!');
  console.log('\nUsage:');
  console.log('  node scripts/workspace-cleanup.js              # Normal cleanup');
  console.log('  node scripts/workspace-cleanup.js --dry-run    # Preview changes');
  console.log('  node scripts/workspace-cleanup.js --aggressive # Remove reports too');
}

main().catch(console.error);
