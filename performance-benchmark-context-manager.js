/**
 * Performance Benchmark for ContextManager
 * SESSION 6 - Performance & Optimization Agent
 * Task: Profile context-manager.js performance characteristics
 */

import { performance } from 'perf_hooks';
import fs from 'fs/promises';
import path from 'path';

// Import the ContextManager
const ContextManager = (await import('./src/utils/context-manager.js')).ContextManager;

// Performance metrics collector
class PerformanceMetrics {
  constructor() {
    this.metrics = {
      tokenEstimation: [],
      fileWrites: [],
      fileReads: [],
      compressionOverhead: [],
      memoryUsage: []
    };
  }

  record(category, duration, metadata = {}) {
    this.metrics[category].push({
      duration,
      timestamp: Date.now(),
      ...metadata
    });
  }

  getStats(category) {
    const data = this.metrics[category];
    if (data.length === 0) return null;

    const durations = data.map(d => d.duration);
    const sorted = durations.sort((a, b) => a - b);

    return {
      count: data.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      avg: durations.reduce((a, b) => a + b, 0) / durations.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  report() {
    console.log('\n=== PERFORMANCE BENCHMARK REPORT ===\n');

    for (const [category, data] of Object.entries(this.metrics)) {
      if (data.length > 0) {
        const stats = this.getStats(category);
        console.log(`${category}:`);
        console.log(`  Operations: ${stats.count}`);
        console.log(`  Avg: ${stats.avg.toFixed(3)}ms`);
        console.log(`  Min: ${stats.min.toFixed(3)}ms`);
        console.log(`  Max: ${stats.max.toFixed(3)}ms`);
        console.log(`  Median: ${stats.median.toFixed(3)}ms`);
        console.log(`  P95: ${stats.p95.toFixed(3)}ms`);
        console.log(`  P99: ${stats.p99.toFixed(3)}ms`);
        console.log('');
      }
    }
  }
}

// Test token estimation accuracy
async function testTokenEstimation(metrics) {
  console.log('Testing token estimation accuracy...');

  const testCases = [
    { text: 'a'.repeat(100), expectedTokens: 25, description: '100 chars (simple)' },
    { text: 'hello world ', expectedTokens: 3, description: '12 chars (words)' },
    { text: 'const x = 42;'.repeat(100), expectedTokens: 325, description: '1300 chars (code)' },
    { text: JSON.stringify({ key: 'value', nested: { array: [1, 2, 3] } }).repeat(50), expectedTokens: 500, description: 'JSON payload' },
    { text: 'x'.repeat(4000), expectedTokens: 1000, description: '4000 chars (large text)' },
    { text: '\u{1F600}'.repeat(100), expectedTokens: 25, description: '100 emojis (unicode)' }
  ];

  const cm = new ContextManager('test-token-estimation', 'benchmark');
  const results = [];

  for (const testCase of testCases) {
    const start = performance.now();
    const estimated = cm.estimateTokens(testCase.text);
    const duration = performance.now() - start;

    metrics.record('tokenEstimation', duration, {
      textLength: testCase.text.length,
      estimated,
      expected: testCase.expectedTokens
    });

    const accuracy = Math.abs(estimated - testCase.expectedTokens) / testCase.expectedTokens;
    results.push({
      description: testCase.description,
      textLength: testCase.text.length,
      expected: testCase.expectedTokens,
      estimated,
      error: Math.abs(estimated - testCase.expectedTokens),
      errorPercent: (accuracy * 100).toFixed(2),
      durationMs: duration.toFixed(3)
    });
  }

  console.log('\nToken Estimation Results:');
  console.table(results);

  return results;
}

// Test file I/O performance
async function testFileIO(metrics) {
  console.log('\nTesting file I/O performance...');

  const cm = new ContextManager('test-file-io', 'benchmark');
  const testData = {
    currentTask: { description: 'test task', progress: 50 },
    criticalState: { passcode: 'test123' },
    nextSteps: ['step1', 'step2', 'step3'],
    filesModified: ['file1.js', 'file2.js'],
    decisions: [{ timestamp: new Date().toISOString(), decision: 'test', rationale: 'benchmark' }]
  };

  // Test multiple writes
  const writeResults = [];
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    await cm.saveState(
      testData.currentTask,
      testData.criticalState,
      testData.nextSteps,
      testData.filesModified,
      testData.decisions
    );
    const duration = performance.now() - start;
    metrics.record('fileWrites', duration);
    writeResults.push(duration);
  }

  // Test multiple reads
  const readResults = [];
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    await cm.loadState();
    const duration = performance.now() - start;
    metrics.record('fileReads', duration);
    readResults.push(duration);
  }

  console.log('File Write Stats:', {
    avg: (writeResults.reduce((a, b) => a + b, 0) / writeResults.length).toFixed(3),
    min: Math.min(...writeResults).toFixed(3),
    max: Math.max(...writeResults).toFixed(3)
  });

  console.log('File Read Stats:', {
    avg: (readResults.reduce((a, b) => a + b, 0) / readResults.length).toFixed(3),
    min: Math.min(...readResults).toFixed(3),
    max: Math.max(...readResults).toFixed(3)
  });

  // Cleanup
  try {
    await fs.rm('.agent-locks', { recursive: true, force: true });
  } catch (err) {
    // Ignore cleanup errors
  }
}

// Test compression overhead
async function testCompressionOverhead(metrics) {
  console.log('\nTesting compression overhead...');

  const cm = new ContextManager('test-compression', 'benchmark');

  // Simulate reaching compression threshold
  cm.tokenCount = 160000;

  const start = performance.now();
  await cm.compressContext();
  const duration = performance.now() - start;

  metrics.record('compressionOverhead', duration, {
    tokensBefore: 160000,
    tokensAfter: cm.tokenCount
  });

  console.log('Compression Stats:', {
    durationMs: duration.toFixed(3),
    tokensBefore: 160000,
    tokensAfter: cm.tokenCount,
    reduction: (100 - (cm.tokenCount / 160000 * 100)).toFixed(2) + '%'
  });

  // Cleanup
  try {
    await fs.rm('.agent-locks', { recursive: true, force: true });
  } catch (err) {
    // Ignore cleanup errors
  }
}

// Test memory usage patterns
async function testMemoryUsage(metrics) {
  console.log('\nTesting memory usage patterns...');

  const initialMemory = process.memoryUsage();
  const instances = [];

  // Create multiple instances
  for (let i = 0; i < 100; i++) {
    instances.push(new ContextManager(`session-${i}`, 'benchmark'));
  }

  const afterCreation = process.memoryUsage();

  // Simulate usage
  for (const instance of instances) {
    instance.updateTokenCount(1000);
  }

  const afterUsage = process.memoryUsage();

  console.log('Memory Usage:');
  console.log('  Initial heap used:', (initialMemory.heapUsed / 1024 / 1024).toFixed(2), 'MB');
  console.log('  After 100 instances:', (afterCreation.heapUsed / 1024 / 1024).toFixed(2), 'MB');
  console.log('  After usage:', (afterUsage.heapUsed / 1024 / 1024).toFixed(2), 'MB');
  console.log('  Increase per instance:', ((afterCreation.heapUsed - initialMemory.heapUsed) / 100 / 1024).toFixed(2), 'KB');

  metrics.record('memoryUsage', afterUsage.heapUsed - initialMemory.heapUsed, {
    instanceCount: 100,
    perInstance: (afterCreation.heapUsed - initialMemory.heapUsed) / 100
  });
}

// Test token count update performance
async function testTokenCountUpdate(metrics) {
  console.log('\nTesting token count update performance...');

  const cm = new ContextManager('test-updates', 'benchmark');
  const iterations = 1000;

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    cm.updateTokenCount(100);
  }
  const duration = performance.now() - start;

  console.log('Token Update Stats:', {
    iterations,
    totalDurationMs: duration.toFixed(3),
    avgPerUpdateMs: (duration / iterations).toFixed(6),
    updatesPerSecond: Math.floor(iterations / (duration / 1000))
  });
}

// Main benchmark runner
async function runBenchmark() {
  console.log('='.repeat(60));
  console.log('CONTEXT MANAGER PERFORMANCE BENCHMARK');
  console.log('SESSION 6 - Performance & Optimization Agent');
  console.log('='.repeat(60));

  const metrics = new PerformanceMetrics();

  try {
    // Run all tests
    const tokenEstResults = await testTokenEstimation(metrics);
    await testFileIO(metrics);
    await testCompressionOverhead(metrics);
    await testMemoryUsage(metrics);
    await testTokenCountUpdate(metrics);

    // Print comprehensive report
    metrics.report();

    // Analysis and recommendations
    console.log('\n=== ANALYSIS & RECOMMENDATIONS ===\n');

    // Token estimation accuracy
    const avgError = tokenEstResults.reduce((sum, r) => sum + parseFloat(r.errorPercent), 0) / tokenEstResults.length;
    console.log('1. TOKEN ESTIMATION ACCURACY:');
    console.log(`   Average error: ${avgError.toFixed(2)}%`);
    if (avgError > 10) {
      console.log('   ⚠️  RECOMMENDATION: The 4-char-per-token formula has >10% error.');
      console.log('   Consider using a proper tokenizer like GPT-tokenizer or tiktoken.');
    } else {
      console.log('   ✓ Current formula is acceptable for rough estimation.');
    }

    // File I/O
    const writeStats = metrics.getStats('fileWrites');
    console.log('\n2. FILE I/O FREQUENCY:');
    console.log(`   Average write time: ${writeStats.avg.toFixed(3)}ms`);
    if (writeStats.avg > 10) {
      console.log('   ⚠️  RECOMMENDATION: File writes are expensive (>10ms).');
      console.log('   - Implement write batching/debouncing');
      console.log('   - Use in-memory buffer with periodic flush');
      console.log('   - Consider async queue for non-critical writes');
    } else {
      console.log('   ✓ File write performance is acceptable.');
    }

    // Compression overhead
    const compressionStats = metrics.getStats('compressionOverhead');
    console.log('\n3. COMPRESSION OVERHEAD:');
    console.log(`   Compression time: ${compressionStats.avg.toFixed(3)}ms`);
    if (compressionStats.avg > 100) {
      console.log('   ⚠️  WARNING: Compression is expensive (>100ms).');
      console.log('   - Consider increasing compressionThreshold to compress less frequently');
      console.log('   - Evaluate if compression is necessary or if handoff is better');
    } else {
      console.log('   ✓ Compression overhead is acceptable.');
    }

    // Threshold analysis
    console.log('\n4. THRESHOLD CONFIGURATION:');
    console.log('   Current: compression at 160k/200k tokens (80%)');
    console.log('   RECOMMENDATION: This is aggressive.');
    console.log('   - Compression at 80% leaves little buffer before critical threshold (90%)');
    console.log('   - Suggest: Compress at 70% (140k) or increase warning gap');

    console.log('\n5. OPTIMIZATION OPPORTUNITIES:');
    console.log('   ✓ Batch file writes (implement debouncing)');
    console.log('   ✓ Use proper tokenizer for accuracy');
    console.log('   ✓ Adjust compression threshold to 70% (140k tokens)');
    console.log('   ✓ Add in-memory state cache to reduce file reads');
    console.log('   ✓ Implement lazy loading for historical data');

    console.log('\n=== BENCHMARK COMPLETE ===\n');

  } catch (error) {
    console.error('Benchmark failed:', error);
    throw error;
  } finally {
    // Cleanup
    try {
      await fs.rm('.agent-locks', { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  }
}

// Run the benchmark
runBenchmark().catch(console.error);
