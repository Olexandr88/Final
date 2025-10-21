#!/usr/bin/env node

/**
 * Deployment Test Runner
 * Runs all deployment validation tests and generates report
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const testFiles = [
  'tests/architecture/event-store.test.js',
  'tests/architecture/command-handlers.test.js',
  'tests/architecture/query-handlers.test.js',
  'tests/architecture/projection-engine.test.js',
  'tests/architecture/session-manager-cqrs.test.js',
  'tests/database/prisma-client.test.js',
  'tests/redis-redlock.test.js',
  'tests/integration/deployment-validation.test.js'
];

const results = {
  passed: [],
  failed: [],
  skipped: [],
  totalTests: 0,
  passedTests: 0,
  failedTests: 0,
  startTime: Date.now()
};

async function runTest(testFile) {
  return new Promise((resolve) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running: ${testFile}`);
    console.log('='.repeat(60));

    const child = spawn('node', ['--test', testFile], {
      stdio: 'inherit',
      shell: true,
      cwd: process.cwd()
    });

    child.on('close', (code) => {
      if (code === 0) {
        results.passed.push(testFile);
        console.log(`✅ PASSED: ${testFile}\n`);
      } else {
        results.failed.push(testFile);
        console.log(`❌ FAILED: ${testFile}\n`);
      }
      resolve(code);
    });

    child.on('error', (err) => {
      results.failed.push(testFile);
      console.log(`❌ ERROR: ${testFile} - ${err.message}\n`);
      resolve(1);
    });
  });
}

async function runAllTests() {
  console.log('\n' + '█'.repeat(60));
  console.log('  DEPLOYMENT VALIDATION TEST SUITE');
  console.log('█'.repeat(60) + '\n');

  console.log(`Starting ${testFiles.length} test suites...\n`);

  for (const testFile of testFiles) {
    const fullPath = path.join(process.cwd(), testFile);

    if (!fs.existsSync(fullPath)) {
      console.log(`⏭️  SKIPPED: ${testFile} (file not found)\n`);
      results.skipped.push(testFile);
      continue;
    }

    await runTest(testFile);
  }

  printResults();
}

function printResults() {
  const duration = Date.now() - results.startTime;

  console.log('\n' + '█'.repeat(60));
  console.log('  TEST RESULTS SUMMARY');
  console.log('█'.repeat(60) + '\n');

  console.log(`Total Suites: ${testFiles.length}`);
  console.log(`Passed: ${results.passed.length}`);
  console.log(`Failed: ${results.failed.length}`);
  console.log(`Skipped: ${results.skipped.length}`);
  console.log(`Duration: ${(duration / 1000).toFixed(2)}s\n`);

  if (results.passed.length > 0) {
    console.log('✅ Passed Suites:');
    results.passed.forEach(file => {
      console.log(`  ✓ ${file}`);
    });
    console.log('');
  }

  if (results.failed.length > 0) {
    console.log('❌ Failed Suites:');
    results.failed.forEach(file => {
      console.log(`  ✗ ${file}`);
    });
    console.log('');
  }

  if (results.skipped.length > 0) {
    console.log('⏭️  Skipped Suites:');
    results.skipped.forEach(file => {
      console.log(`  - ${file}`);
    });
    console.log('');
  }

  const successRate = testFiles.length > 0
    ? ((results.passed.length / testFiles.length) * 100).toFixed(2)
    : 0;

  console.log(`Success Rate: ${successRate}%\n`);

  if (results.failed.length === 0 && results.skipped.length === 0) {
    console.log('🎉 ALL TESTS PASSED! Deployment validation complete.\n');
    process.exit(0);
  } else if (results.failed.length === 0) {
    console.log('⚠️  All tests passed, but some were skipped.\n');
    process.exit(0);
  } else {
    console.log('❌ DEPLOYMENT VALIDATION FAILED. Please review failing tests.\n');
    process.exit(1);
  }
}

// Run tests
runAllTests().catch((error) => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
