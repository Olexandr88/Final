#!/usr/bin/env node
/**
 * Quick Fix - Immediate performance improvements
 * Based on shell_one_liners.sh patterns
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';

const fixes = [];
const warnings = [];

console.log('\n🔧 Quick Fix - Running diagnostics...\n');

// 1. Check if tests are hanging
console.log('[1/5] Checking test performance...');
try {
  const testStart = Date.now();
  execSync('npm test -- --test-timeout=5000 2>&1 | head -20', {
    encoding: 'utf-8',
    timeout: 10000,
  });
  const testTime = Date.now() - testStart;

  if (testTime > 8000) {
    warnings.push('Tests are slow (>8s). Consider using --test-concurrency');
    fixes.push('Add to package.json: "test:fast": "node --test --test-concurrency=4 tests"');
  } else {
    console.log('  ✓ Tests running efficiently');
  }
} catch (e) {
  warnings.push('Tests may be hanging or timing out');
  fixes.push('Review test timeouts and async cleanup');
}

// 2. Check for zombie processes (pattern from block 40)
console.log('[2/5] Checking for zombie processes...');
try {
  const zombies = execSync('tasklist | findstr "node.exe" | wc -l', { encoding: 'utf-8' }).trim();

  if (parseInt(zombies) > 30) {
    warnings.push(`High Node.js process count: ${zombies}`);
    fixes.push(
      'Run: powershell -ExecutionPolicy Bypass -File scripts/ai-process-cleaner.ps1 -Kill'
    );
  } else {
    console.log(`  ✓ Process count healthy: ${zombies}`);
  }
} catch (e) {
  console.log('  ⚠ Could not check processes (Windows only)');
}

// 3. Check package.json for optimization
console.log('[3/5] Checking package configuration...');
if (existsSync('./package.json')) {
  const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

  if (!pkg.scripts['test:fast']) {
    fixes.push('Add fast test script with concurrency');
  }

  if (!pkg.scripts['cleanup']) {
    fixes.push('Add cleanup script: "cleanup": "node .claude/scripts/pre-test-cleanup.js"');
  }

  console.log('  ✓ Package.json analyzed');
}

// 4. Check AI Bridge ports (pattern from block 136)
console.log('[4/5] Checking AI Bridge status...');
try {
  const ports = execSync('netstat -ano | findstr "65028.*LISTENING"', { encoding: 'utf-8' });

  if (ports) {
    const pid = ports.trim().split(/\s+/).pop();
    console.log(`  ✓ AI Bridge running (PID ${pid})`);
  } else {
    warnings.push('AI Bridge not running on expected port');
    fixes.push('Start bridge: npm run start:bridge');
  }
} catch (e) {
  warnings.push('AI Bridge may not be running');
}

// 5. Check memory usage
console.log('[5/5] Checking system memory...');
try {
  const mem = execSync('wmic OS get FreePhysicalMemory', { encoding: 'utf-8' });
  const freeKB = parseInt(mem.split('\n')[1]);
  const freeMB = Math.round(freeKB / 1024);

  if (freeMB < 500) {
    warnings.push(`Low free memory: ${freeMB}MB`);
    fixes.push('Kill zombie processes to free memory');
  } else {
    console.log(`  ✓ Free memory: ${freeMB}MB`);
  }
} catch (e) {
  console.log('  ⚠ Could not check memory (Windows only)');
}

// Report
console.log('\n' + '='.repeat(60));

if (warnings.length === 0) {
  console.log('✅ System is healthy!');
} else {
  console.log(`⚠️  Found ${warnings.length} issues:\n`);
  warnings.forEach((w, i) => console.log(`  ${i + 1}. ${w}`));
}

if (fixes.length > 0) {
  console.log(`\n🔧 Recommended fixes:\n`);
  fixes.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
}

console.log('\n' + '='.repeat(60));
console.log('\n💡 Quick actions:');
console.log('  - Kill zombies: npm run cleanup (if added)');
console.log('  - Fast tests: node --test --test-concurrency=4 tests');
console.log('  - Monitor: bash scripts/live-monitor.sh\n');
