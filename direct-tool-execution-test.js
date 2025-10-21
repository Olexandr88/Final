#!/usr/bin/env node
/**
 * Direct Tool Execution Test
 * Tests tool execution without requiring bridge or agent coordination
 * Proves tools can actually modify files and execute commands
 */

import { ToolExecutor } from './src/tools/tool-executor.js';
import { logger } from './src/utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

const TEST_DIR = path.join(process.cwd(), 'autonomous-test-workspace');
const TEST_FILE = path.join(TEST_DIR, 'tool-test.js');
const PROOF_FILE = path.join(process.cwd(), `direct-tool-proof-${Date.now()}.txt`);

async function testDirectToolExecution() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  DIRECT TOOL EXECUTION TEST                            ║');
  console.log('║  Proves tools can ACTUALLY execute without LLM        ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const executor = new ToolExecutor('direct-test-agent', {
    file_read: true,
    file_write: true,
    command_exec: true,
    git_operations: true,
  });

  // Wait for tools to load
  console.log('⏳ Loading tools...');
  await executor.waitForReady();
  console.log('✅ Tools loaded:', executor.getAvailableTools().join(', '));

  const results = {
    timestamp: new Date().toISOString(),
    tests: [],
  };

  // Test 1: Write a file
  console.log('\n📝 Test 1: Write file');
  try {
    const writeResult = await executor.executeTool('write', {
      file_path: TEST_FILE,
      content: `// Autonomous tool test file
function autonomousAdd(a, b) {
  return a + b;
}

function autonomousMultiply(a, b) {
  return a * b;
}

module.exports = { autonomousAdd, autonomousMultiply };

// This file was created by AUTONOMOUS TOOL EXECUTION
// NOT by an LLM generating text
// This proves real file system modification capability
`,
    });

    results.tests.push({
      name: 'Write File',
      success: writeResult.success,
      tool: writeResult.tool,
      duration: writeResult.duration,
      result: writeResult.result,
    });

    console.log('✅ File write successful');
    console.log('   File:', TEST_FILE);
    console.log('   Bytes written:', writeResult.result.bytes_written);
  } catch (error) {
    console.log('❌ File write failed:', error.message);
    results.tests.push({
      name: 'Write File',
      success: false,
      error: error.message,
    });
  }

  // Test 2: Read the file back
  console.log('\n📖 Test 2: Read file back');
  try {
    const readResult = await executor.executeTool('read', {
      file_path: TEST_FILE,
    });

    results.tests.push({
      name: 'Read File',
      success: readResult.success,
      tool: readResult.tool,
      duration: readResult.duration,
      lines: readResult.result.lines,
      size: readResult.result.size,
    });

    console.log('✅ File read successful');
    console.log('   Lines:', readResult.result.lines);
    console.log('   Size:', readResult.result.size, 'bytes');
    console.log('\n   Content preview:');
    console.log('   ', readResult.result.content.substring(0, 100) + '...');
  } catch (error) {
    console.log('❌ File read failed:', error.message);
    results.tests.push({
      name: 'Read File',
      success: false,
      error: error.message,
    });
  }

  // Test 3: Execute bash command (ls)
  console.log('\n💻 Test 3: Execute bash command');
  try {
    const bashResult = await executor.executeTool('bash', {
      command: 'ls',
      args: ['-la', TEST_DIR],
      timeout: 5000,
    });

    results.tests.push({
      name: 'Bash Command',
      success: bashResult.success,
      tool: bashResult.tool,
      duration: bashResult.duration,
      exitCode: bashResult.result.exitCode,
      stdout: bashResult.result.stdout.substring(0, 200),
    });

    console.log('✅ Bash command executed');
    console.log('   Exit code:', bashResult.result.exitCode);
    console.log('   Output:\n', bashResult.result.stdout.substring(0, 300));
  } catch (error) {
    console.log('❌ Bash command failed:', error.message);
    results.tests.push({
      name: 'Bash Command',
      success: false,
      error: error.message,
    });
  }

  // Test 4: Glob pattern search
  console.log('\n🔍 Test 4: Glob file search');
  try {
    const globResult = await executor.executeTool('glob', {
      pattern: '**/*.js',
      cwd: TEST_DIR,
    });

    results.tests.push({
      name: 'Glob Search',
      success: globResult.success,
      tool: globResult.tool,
      duration: globResult.duration,
      filesFound: globResult.result.count,
    });

    console.log('✅ Glob search executed');
    console.log('   Files found:', globResult.result.count);
    console.log('   Files:', globResult.result.files.slice(0, 5).join('\n          '));
  } catch (error) {
    console.log('❌ Glob search failed:', error.message);
    results.tests.push({
      name: 'Glob Search',
      success: false,
      error: error.message,
    });
  }

  // Test 5: Git status
  console.log('\n📦 Test 5: Git status');
  try {
    const gitResult = await executor.executeTool('git_status', {
      cwd: process.cwd(),
    });

    results.tests.push({
      name: 'Git Status',
      success: gitResult.success,
      tool: gitResult.tool,
      duration: gitResult.duration,
      isRepository: gitResult.result.isRepository,
      branch: gitResult.result.branch,
    });

    console.log('✅ Git status executed');
    console.log('   Is repository:', gitResult.result.isRepository);
    if (gitResult.result.branch) {
      console.log('   Branch:', gitResult.result.branch);
      console.log('   Untracked files:', gitResult.result.untracked?.length || 0);
    }
  } catch (error) {
    console.log('❌ Git status failed:', error.message);
    results.tests.push({
      name: 'Git Status',
      success: false,
      error: error.message,
    });
  }

  // Get execution metrics
  const metrics = executor.getMetrics();
  results.metrics = metrics;

  console.log('\n📊 Execution Metrics:');
  console.log('   Total executions:', metrics.totalExecutions);
  console.log('   Success rate:', metrics.successRate);
  console.log('   Average latency:', metrics.averageLatency.toFixed(2), 'ms');

  // Write proof file
  await fs.writeFile(PROOF_FILE, JSON.stringify(results, null, 2));
  console.log('\n📄 Proof written to:', PROOF_FILE);

  // Verify file exists
  try {
    const fileExists = await fs.stat(TEST_FILE);
    console.log('\n✅ VERIFICATION: Test file exists on filesystem');
    console.log('   Path:', TEST_FILE);
    console.log('   Size:', fileExists.size, 'bytes');
  } catch (error) {
    console.log('\n❌ VERIFICATION FAILED: Test file does not exist');
  }

  // Summary
  const successCount = results.tests.filter((t) => t.success).length;
  const totalTests = results.tests.length;

  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  TEST RESULTS SUMMARY                                  ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(`\n   Tests passed: ${successCount}/${totalTests}`);
  console.log(`   Success rate: ${((successCount / totalTests) * 100).toFixed(1)}%`);

  if (successCount === totalTests) {
    console.log('\n   🎉 ALL TESTS PASSED!');
    console.log('\n   ✅ Tools can ACTUALLY:');
    console.log('      - Write files to filesystem');
    console.log('      - Read files from filesystem');
    console.log('      - Execute bash commands');
    console.log('      - Search for files');
    console.log('      - Run git operations');
    console.log('\n   🚀 AUTONOMOUS EXECUTION CAPABILITY PROVEN!\n');
  } else {
    console.log('\n   ⚠️  Some tests failed - check details above');
  }

  return results;
}

// Run test
testDirectToolExecution().catch((error) => {
  console.error('\n❌ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
