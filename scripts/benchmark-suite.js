#!/usr/bin/env node
/**
 * Comprehensive Benchmark Suite
 * Measures performance across critical system components
 */

import { performance } from 'perf_hooks';
import { cpus } from 'os';
import os from 'os';
import v8 from 'v8';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class BenchmarkSuite {
  constructor() {
    this.results = {};
  }

  async runAll() {
    console.log('\n🚀 Starting Comprehensive Benchmark Suite...\n');
    console.log('='.repeat(70));

    await this.benchmarkStartupTime();
    await this.benchmarkWorkerPoolPerformance();
    await this.benchmarkMemoryOperations();
    await this.benchmarkEventLoopLatency();
    await this.benchmarkCachePerformance();
    await this.benchmarkJSONOperations();

    this.generateReport();
    return this.results;
  }

  async benchmarkStartupTime() {
    console.log('\n1️⃣  Benchmarking Startup Time...');

    const runs = 5;
    const times = [];

    for (let i = 0; i < runs; i++) {
      const start = performance.now();

      // Simulate startup by loading main modules
      try {
        const modules = [
          '../src/ai-bridge.js',
          '../src/session-coordinator.js',
          '../src/utils/performance-monitor.js'
        ];

        await Promise.all(modules.map(async (mod) => {
          try {
            await import(mod);
          } catch (e) {
            // Module might not exist, that's okay for benchmark
          }
        }));
      } catch (error) {
        // Ignore import errors for benchmarking
      }

      const duration = performance.now() - start;
      times.push(duration);

      // Clear module cache for next iteration
      if (global.gc) global.gc();
    }

    this.results.startup = {
      avg: times.reduce((a, b) => a + b) / times.length,
      min: Math.min(...times),
      max: Math.max(...times),
      runs: times
    };

    console.log(`   ✓ Average: ${this.results.startup.avg.toFixed(2)}ms`);
    console.log(`   ✓ Range: ${this.results.startup.min.toFixed(2)}ms - ${this.results.startup.max.toFixed(2)}ms`);
  }

  async benchmarkWorkerPoolPerformance() {
    console.log('\n2️⃣  Benchmarking Worker Pool Simulation...');

    const iterations = 10000;
    const start = performance.now();

    // Simulate parallel task processing
    const tasks = Array.from({ length: iterations }, (_, i) => ({
      id: i,
      data: Buffer.alloc(1024).fill(i % 256)
    }));

    // Process tasks in batches
    const batchSize = 100;
    const batches = [];
    for (let i = 0; i < tasks.length; i += batchSize) {
      batches.push(tasks.slice(i, i + batchSize));
    }

    const results = [];
    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(task => this.processTask(task))
      );
      results.push(...batchResults);
    }

    const duration = performance.now() - start;
    const throughput = (iterations / (duration / 1000)).toFixed(2);

    this.results.workerPool = {
      duration,
      iterations,
      throughput: parseFloat(throughput),
      avgLatency: duration / iterations,
      batchSize
    };

    console.log(`   ✓ Processed ${iterations} tasks in ${duration.toFixed(2)}ms`);
    console.log(`   ✓ Throughput: ${throughput} ops/sec`);
    console.log(`   ✓ Avg Latency: ${this.results.workerPool.avgLatency.toFixed(2)}ms`);
  }

  async processTask(task) {
    // Simulate CPU-intensive work
    const buffer = task.data;
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i];
    }
    return { id: task.id, result: sum };
  }

  async benchmarkMemoryOperations() {
    console.log('\n3️⃣  Benchmarking Memory Operations...');

    const iterations = 10000;
    const allocations = [];

    const start = performance.now();
    const startMem = process.memoryUsage();

    // Allocate memory
    for (let i = 0; i < iterations; i++) {
      allocations.push(Buffer.alloc(1024));
    }

    const allocDuration = performance.now() - start;
    const peakMem = process.memoryUsage();

    // Cleanup
    allocations.length = 0;
    if (global.gc) global.gc();

    await new Promise(resolve => setTimeout(resolve, 100)); // Let GC run
    const endMem = process.memoryUsage();

    this.results.memory = {
      allocDuration,
      allocationsPerSec: (iterations / (allocDuration / 1000)).toFixed(2),
      peakHeapUsed: peakMem.heapUsed - startMem.heapUsed,
      peakHeapUsedMB: ((peakMem.heapUsed - startMem.heapUsed) / 1024 / 1024).toFixed(2),
      gcEfficiency: ((1 - (endMem.heapUsed - startMem.heapUsed) / (peakMem.heapUsed - startMem.heapUsed)) * 100).toFixed(2)
    };

    console.log(`   ✓ Allocated ${iterations} buffers in ${allocDuration.toFixed(2)}ms`);
    console.log(`   ✓ Rate: ${this.results.memory.allocationsPerSec} alloc/sec`);
    console.log(`   ✓ Peak Memory: ${this.results.memory.peakHeapUsedMB} MB`);
    console.log(`   ✓ GC Efficiency: ${this.results.memory.gcEfficiency}%`);
  }

  async benchmarkEventLoopLatency() {
    console.log('\n4️⃣  Benchmarking Event Loop Latency...');

    const samples = 100;
    const delays = [];

    for (let i = 0; i < samples; i++) {
      const start = performance.now();
      await new Promise(resolve => setImmediate(resolve));
      const delay = performance.now() - start;
      delays.push(delay);

      // Add some work between measurements
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    const sorted = delays.sort((a, b) => a - b);

    this.results.eventLoop = {
      samples,
      avg: delays.reduce((a, b) => a + b) / delays.length,
      min: Math.min(...delays),
      max: Math.max(...delays),
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };

    console.log(`   ✓ Samples: ${samples}`);
    console.log(`   ✓ Average: ${this.results.eventLoop.avg.toFixed(2)}ms`);
    console.log(`   ✓ P50: ${this.results.eventLoop.p50.toFixed(2)}ms`);
    console.log(`   ✓ P95: ${this.results.eventLoop.p95.toFixed(2)}ms`);
    console.log(`   ✓ P99: ${this.results.eventLoop.p99.toFixed(2)}ms`);
  }

  async benchmarkCachePerformance() {
    console.log('\n5️⃣  Benchmarking Cache Performance...');

    const cache = new Map();
    const iterations = 100000;

    // Write performance
    const writeStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      cache.set(`key_${i}`, {
        data: `value_${i}`,
        timestamp: Date.now(),
        metadata: { index: i }
      });
    }
    const writeDuration = performance.now() - writeStart;

    // Read performance
    const readStart = performance.now();
    let hits = 0;
    for (let i = 0; i < iterations; i++) {
      if (cache.get(`key_${i}`)) hits++;
    }
    const readDuration = performance.now() - readStart;

    // Delete performance
    const deleteStart = performance.now();
    for (let i = 0; i < iterations / 2; i++) {
      cache.delete(`key_${i}`);
    }
    const deleteDuration = performance.now() - deleteStart;

    this.results.cache = {
      iterations,
      writeOpsPerSec: (iterations / (writeDuration / 1000)).toFixed(2),
      readOpsPerSec: (iterations / (readDuration / 1000)).toFixed(2),
      deleteOpsPerSec: ((iterations / 2) / (deleteDuration / 1000)).toFixed(2),
      hitRate: ((hits / iterations) * 100).toFixed(2),
      finalSize: cache.size
    };

    console.log(`   ✓ Write: ${this.results.cache.writeOpsPerSec} ops/sec`);
    console.log(`   ✓ Read: ${this.results.cache.readOpsPerSec} ops/sec`);
    console.log(`   ✓ Delete: ${this.results.cache.deleteOpsPerSec} ops/sec`);
    console.log(`   ✓ Hit Rate: ${this.results.cache.hitRate}%`);
  }

  async benchmarkJSONOperations() {
    console.log('\n6️⃣  Benchmarking JSON Operations...');

    const iterations = 10000;
    const testObject = {
      id: 'test-123',
      timestamp: Date.now(),
      data: {
        users: Array.from({ length: 100 }, (_, i) => ({ id: i, name: `User ${i}` })),
        settings: { theme: 'dark', language: 'en', notifications: true }
      },
      metadata: {
        version: '1.0.0',
        tags: ['test', 'benchmark', 'performance']
      }
    };

    // Stringify performance
    const stringifyStart = performance.now();
    const strings = [];
    for (let i = 0; i < iterations; i++) {
      strings.push(JSON.stringify(testObject));
    }
    const stringifyDuration = performance.now() - stringifyStart;

    // Parse performance
    const parseStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      JSON.parse(strings[i]);
    }
    const parseDuration = performance.now() - parseStart;

    this.results.json = {
      iterations,
      objectSize: strings[0].length,
      stringifyOpsPerSec: (iterations / (stringifyDuration / 1000)).toFixed(2),
      parseOpsPerSec: (iterations / (parseDuration / 1000)).toFixed(2),
      avgStringifyTime: (stringifyDuration / iterations).toFixed(2),
      avgParseTime: (parseDuration / iterations).toFixed(2)
    };

    console.log(`   ✓ Object Size: ${this.results.json.objectSize} bytes`);
    console.log(`   ✓ Stringify: ${this.results.json.stringifyOpsPerSec} ops/sec`);
    console.log(`   ✓ Parse: ${this.results.json.parseOpsPerSec} ops/sec`);
  }

  generateReport() {
    console.log('\n' + '='.repeat(70));
    console.log('📊 BENCHMARK SUMMARY REPORT');
    console.log('='.repeat(70));

    console.log('\n📈 System Information:');
    console.log(`   Node Version: ${process.version}`);
    console.log(`   Platform: ${process.platform} ${process.arch}`);
    console.log(`   CPUs: ${cpus().length} cores`);
    console.log(`   Memory: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`);

    const heapStats = v8.getHeapStatistics();
    console.log(`   V8 Heap Limit: ${(heapStats.heap_size_limit / 1024 / 1024).toFixed(2)} MB`);

    console.log('\n📊 Performance Metrics:');
    console.log(JSON.stringify(this.results, null, 2));

    // Calculate overall score
    const score = this.calculateScore();
    console.log(`\n🏆 Overall Performance Score: ${score.total}/100`);
    console.log('\nScore Breakdown:');
    console.log(`   Startup: ${score.startup}/20`);
    console.log(`   Throughput: ${score.throughput}/25`);
    console.log(`   Memory: ${score.memory}/20`);
    console.log(`   Event Loop: ${score.eventLoop}/20`);
    console.log(`   Cache: ${score.cache}/15`);

    console.log('\n' + '='.repeat(70));

    // Performance recommendations
    this.generateRecommendations(score);
  }

  calculateScore() {
    const score = {
      total: 0,
      startup: 20,
      throughput: 25,
      memory: 20,
      eventLoop: 20,
      cache: 15
    };

    // Startup score (target < 100ms avg)
    if (this.results.startup?.avg > 100) {
      const penalty = Math.min(20, (this.results.startup.avg - 100) / 20);
      score.startup = Math.max(0, 20 - penalty);
    }

    // Throughput score (target > 1000 ops/sec)
    if (this.results.workerPool?.throughput < 1000) {
      const penalty = Math.min(25, (1000 - this.results.workerPool.throughput) / 50);
      score.throughput = Math.max(0, 25 - penalty);
    }

    // Memory score (target < 50MB peak)
    if (this.results.memory?.peakHeapUsedMB > 50) {
      const penalty = Math.min(20, (this.results.memory.peakHeapUsedMB - 50) / 10);
      score.memory = Math.max(0, 20 - penalty);
    }

    // Event loop score (target < 10ms p95)
    if (this.results.eventLoop?.p95 > 10) {
      const penalty = Math.min(20, (this.results.eventLoop.p95 - 10) / 2);
      score.eventLoop = Math.max(0, 20 - penalty);
    }

    // Cache score (target > 10000 ops/sec)
    if (this.results.cache?.readOpsPerSec < 10000) {
      const penalty = Math.min(15, (10000 - this.results.cache.readOpsPerSec) / 1000);
      score.cache = Math.max(0, 15 - penalty);
    }

    score.total = Object.values(score).reduce((sum, val) =>
      typeof val === 'number' ? sum + val : sum, 0
    );

    return score;
  }

  generateRecommendations(score) {
    console.log('\n💡 Performance Recommendations:\n');

    const recommendations = [];

    if (score.startup < 15) {
      recommendations.push({
        severity: 'HIGH',
        area: 'Startup',
        issue: 'Slow application startup time',
        suggestions: [
          'Enable --max-old-space-size flag',
          'Implement lazy module loading',
          'Review module dependencies',
          'Consider pre-compilation'
        ]
      });
    }

    if (score.throughput < 20) {
      recommendations.push({
        severity: 'HIGH',
        area: 'Throughput',
        issue: 'Low worker pool throughput',
        suggestions: [
          'Increase UV_THREADPOOL_SIZE',
          'Optimize worker pool size',
          'Review task batching strategy',
          'Consider worker thread reuse'
        ]
      });
    }

    if (score.memory < 15) {
      recommendations.push({
        severity: 'MEDIUM',
        area: 'Memory',
        issue: 'High memory usage',
        suggestions: [
          'Enable --expose-gc flag',
          'Implement manual GC triggers',
          'Review memory leaks',
          'Optimize buffer allocations'
        ]
      });
    }

    if (score.eventLoop < 15) {
      recommendations.push({
        severity: 'CRITICAL',
        area: 'Event Loop',
        issue: 'High event loop latency',
        suggestions: [
          'Move CPU-intensive work to workers',
          'Reduce synchronous operations',
          'Optimize I/O operations',
          'Review third-party middleware'
        ]
      });
    }

    if (score.cache < 12) {
      recommendations.push({
        severity: 'LOW',
        area: 'Cache',
        issue: 'Suboptimal cache performance',
        suggestions: [
          'Consider LRU cache implementation',
          'Review cache size limits',
          'Optimize cache key structure',
          'Implement cache warming'
        ]
      });
    }

    if (recommendations.length === 0) {
      console.log('   ✅ No critical performance issues detected!');
      console.log('   System is performing within optimal parameters.\n');
    } else {
      recommendations.forEach((rec, i) => {
        console.log(`${i + 1}. [${rec.severity}] ${rec.area}: ${rec.issue}`);
        console.log('   Suggestions:');
        rec.suggestions.forEach(s => console.log(`   • ${s}`));
        console.log();
      });
    }
  }
}

// CLI execution
if (process.argv[1] === __filename || process.argv[1].endsWith('benchmark-suite.js')) {
  const suite = new BenchmarkSuite();

  suite.runAll()
    .then(() => {
      console.log('\n✅ Benchmark suite completed successfully\n');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Benchmark suite failed:', error);
      process.exit(1);
    });
}

export default BenchmarkSuite;
