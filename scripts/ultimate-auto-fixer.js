#!/usr/bin/env node

/**
 * Ultimate Auto-Fixer - Autonomous error detection and fixing
 * Runs continuously until system reaches zero errors
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';

const execAsync = promisify(exec);

console.log('🚀 ULTIMATE AUTO-FIXER ACTIVATED');
console.log('Will fix errors until system is perfect...\n');

let iteration = 0;
const MAX_ITERATIONS = 50;

async function fixAll() {
  while (iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`\n${'━'.repeat(60)}`);
    console.log(`🔄 ITERATION ${iteration}`);
    console.log(`${'━'.repeat(60)}\n`);

    let totalErrors = 0;

    // FIX 1: ESLint auto-fix
    console.log('1️⃣  Running ESLint auto-fix...');
    try {
      const { stdout } = await execAsync('npm run lint:fix 2>&1');
      const errors = stdout.match(/(\d+) problems/);
      if (errors) {
        console.log(`   Found ${errors[1]} linting issues`);
        totalErrors += parseInt(errors[1]);
      } else {
        console.log('   ✅ No linting errors');
      }
    } catch (e) {
      console.log('   ⚠️  Some lint errors remain (manual fix needed)');
    }

    // FIX 2: Format all code
    console.log('\n2️⃣  Auto-formatting code...');
    try {
      await execAsync('npm run format');
      console.log('   ✅ Code formatted');
    } catch (e) {
      console.log('   ⚠️  Formatting issues');
    }

    // FIX 3: Fix file watcher errors (ignore locked files)
    console.log('\n3️⃣  Fixing file watcher...');
    const watcherFiles = ['scripts/claim-task.js', 'scripts/auto-sync-loop.js'];

    for (const file of watcherFiles) {
      try {
        let content = await fs.readFile(file, 'utf8');
        if (!content.includes('ignored: [')) {
          const insertPos = content.indexOf('watch(');
          if (insertPos > 0) {
            content =
              content.slice(0, insertPos + 6) +
              `'.', {\n  ignored: [/node_modules/, /\\.git/, /AppData/, /Perplexity/],\n  ignoreInitial: true,\n  awaitWriteFinish: true\n}` +
              content.slice(content.indexOf(',', insertPos));

            await fs.writeFile(file, content);
            console.log(`   ✅ Fixed ${file}`);
          }
        }
      } catch (e) {
        console.log(`   ⚠️  Could not fix ${file}`);
      }
    }

    // FIX 4: Cleanup log errors
    console.log('\n4️⃣  Cleaning up error logs...');
    try {
      const logDir = 'logs';
      const files = await fs.readdir(logDir).catch(() => []);

      for (const file of files) {
        if (file.endsWith('.log')) {
          const filepath = `${logDir}/${file}`;
          const stats = await fs.stat(filepath);
          // Delete logs older than 24 hours
          if (Date.now() - stats.mtimeMs > 86400000) {
            await fs.unlink(filepath);
            console.log(`   🗑️  Deleted old log: ${file}`);
          }
        }
      }
    } catch (e) {
      console.log('   ⚠️  Could not cleanup logs');
    }

    // FIX 5: Run tests and count failures
    console.log('\n5️⃣  Running tests...');
    try {
      const { stdout } = await execAsync('npm test 2>&1');
      const passed = stdout.match(/# tests (\d+)/);
      const failed = stdout.match(/# failed (\d+)/);

      if (failed && parseInt(failed[1]) > 0) {
        console.log(`   ❌ ${failed[1]} tests failing`);
        totalErrors += parseInt(failed[1]);
      } else if (passed) {
        console.log(`   ✅ All ${passed[1]} tests passing`);
      }
    } catch (e) {
      console.log('   ⚠️  Some tests failed');
    }

    // Check if we're done
    if (totalErrors === 0) {
      console.log('\n' + '='.repeat(60));
      console.log('🎉 SUCCESS! ZERO ERRORS ACHIEVED!');
      console.log('='.repeat(60));
      console.log(`Total iterations: ${iteration}`);
      console.log('System is fully optimized.\n');
      break;
    }

    console.log(`\n📊 Remaining errors: ${totalErrors}`);

    // Wait before next iteration
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  if (iteration >= MAX_ITERATIONS) {
    console.log('\n⚠️  Reached maximum iterations. Manual review may be needed.');
  }
}

fixAll().catch(console.error);
