/**
 * Performance Utilities Integration Example
 * Demonstrates usage of WorkerPool, LazyLoader, OptimizedCache, and PerformanceMonitor
 */

import { WorkerPool } from '../src/utils/worker-pool.js';
import { globalLazyLoader, LazyLoader } from '../src/utils/lazy-loader.js';
import { OptimizedCache, FileContentCache, ResponseCache } from '../src/utils/optimized-cache.js';
import { globalPerformanceMonitor, PerformanceMonitor } from '../src/utils/performance-monitor.js';
import { CodebaseAnalyzer } from '../src/codebase/codebase-analyzer.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Example 1: OptimizedCache Usage
 * Bounded memory caching with automatic eviction
 */
async function exampleOptimizedCache() {
  console.log('\n=== OptimizedCache Example ===\n');

  // Create a custom cache
  const apiCache = new OptimizedCache({
    name: 'api-cache',
    maxSize: 100, // Max 100 entries
    maxMemory: 5000, // 5MB max memory
    ttl: 60000, // 1 minute TTL
    onEvict: (key, value) => {
      console.log(`  Evicted: ${key}`);
    },
  });

  // Store data
  apiCache.set('user:123', { name: 'John Doe', email: 'john@example.com' });
  apiCache.set('user:456', { name: 'Jane Smith', email: 'jane@example.com' });

  // Retrieve data
  const user = apiCache.get('user:123');
  console.log('  Retrieved user:', user);

  // Get or compute pattern
  const computed = await apiCache.getOrCompute('expensive:calculation', async () => {
    console.log('  Computing expensive value...');
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { result: Math.random() * 1000 };
  });
  console.log('  Computed value:', computed);

  // Get statistics
  const stats = apiCache.getStats();
  console.log('  Cache stats:', stats);

  // Specialized caches
  const fileCache = new FileContentCache();
  const responseCache = new ResponseCache();
  console.log('  FileContentCache created with 50MB default memory limit');
  console.log('  ResponseCache created with 10MB default memory limit');
}

/**
 * Example 2: LazyLoader Usage
 * Deferred module loading for faster startup
 */
async function exampleLazyLoader() {
  console.log('\n=== LazyLoader Example ===\n');

  // Create custom lazy loader
  const loader = new LazyLoader();

  // Register heavy modules
  loader.register('heavy-parser', () => import('../src/codebase/codebase-analyzer.js'));
  loader.register('crypto', () => import('crypto'));

  console.log('  Modules registered (not loaded yet)');
  console.log('  Stats:', loader.getStats());

  // Load on demand
  console.log('\n  Loading heavy-parser on first use...');
  const { CodebaseAnalyzer } = await loader.get('heavy-parser');
  console.log('  CodebaseAnalyzer loaded!');

  // Second access is instant (already loaded)
  console.log('\n  Accessing again (cached)...');
  const cached = await loader.get('heavy-parser');
  console.log('  Retrieved from cache instantly');

  // Check stats
  console.log('\n  Final stats:', loader.getStats());

  // Using global lazy loader
  console.log('\n  Global lazy loader example:');
  globalLazyLoader.register('fs', () => import('fs/promises'));
  const fs = await globalLazyLoader.get('fs');
  console.log('  fs/promises loaded via global loader');
}

/**
 * Example 3: PerformanceMonitor Usage
 * Track and report performance metrics
 */
async function examplePerformanceMonitor() {
  console.log('\n=== PerformanceMonitor Example ===\n');

  // Create custom monitor
  const monitor = new PerformanceMonitor({
    name: 'api-monitor',
    slowThreshold: 50, // Warn if operation takes >50ms
  });

  // Time async operations
  console.log('  Timing async operations...');

  await monitor.timeAsync('database-query', async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    console.log('    ✓ Fast query completed');
  });

  await monitor.timeAsync('slow-operation', async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    console.log('    ⚠ Slow operation completed (will warn)');
  });

  // Time sync operations
  const result = monitor.timeSync('calculation', () => {
    let sum = 0;
    for (let i = 0; i < 1000000; i++) sum += i;
    return sum;
  });
  console.log('  Calculation result:', result);

  // Get metric statistics
  console.log('\n  Metric stats:');
  console.log('    database-query:', monitor.getMetricStats('database-query'));
  console.log('    slow-operation:', monitor.getMetricStats('slow-operation'));
  console.log('    calculation:', monitor.getMetricStats('calculation'));

  // Generate report
  const report = monitor.generateReport();
  console.log('\n  Performance Report:', JSON.stringify(report, null, 2));

  // Using global monitor
  console.log('\n  Global monitor example:');
  await globalPerformanceMonitor.timeAsync('global-operation', async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    console.log('    ✓ Tracked via global monitor');
  });
}

/**
 * Example 4: WorkerPool Usage
 * Parallel processing with worker threads
 */
async function exampleWorkerPool() {
  console.log('\n=== WorkerPool Example ===\n');

  const workerPath = path.join(__dirname, '../src/workers/code-analysis-worker.js');
  const pool = new WorkerPool(workerPath, {
    poolSize: 4, // Use 4 workers
  });

  console.log('  Worker pool created with 4 workers');
  console.log('  Initial stats:', pool.getStats());

  // Analyze code samples in parallel
  const codeSamples = [
    `function add(a, b) { return a + b; }`,
    `class Calculator { multiply(x, y) { return x * y; } }`,
    `const data = [1,2,3]; const doubled = data.map(x => x * 2);`,
    `async function fetchData() { const res = await fetch('/api'); return res.json(); }`,
  ];

  console.log('\n  Processing 4 code samples in parallel...');
  const startTime = Date.now();

  const results = await Promise.all(
    codeSamples.map((code, i) =>
      pool.execute({
        code,
        language: 'javascript',
        filePath: `sample${i}.js`,
      })
    )
  );

  const duration = Date.now() - startTime;

  console.log(`  ✓ Processed in ${duration}ms`);
  results.forEach((result, i) => {
    console.log(`\n  Sample ${i + 1} analysis:`, {
      functions: result.analysis?.metrics?.functions,
      classes: result.analysis?.metrics?.classes,
      complexity: result.analysis?.metrics?.complexity,
      duration: `${result.duration}ms`,
      worker: result.workerId,
    });
  });

  console.log('\n  Final stats:', pool.getStats());

  // Cleanup
  await pool.terminate();
  console.log('  Worker pool terminated');
}

/**
 * Example 5: Integrated CodebaseAnalyzer
 * Using all utilities together
 */
async function exampleIntegratedAnalyzer() {
  console.log('\n=== Integrated CodebaseAnalyzer Example ===\n');

  // Create analyzer with all optimizations enabled
  const analyzer = new CodebaseAnalyzer({
    rootDir: path.join(__dirname, '../src'),
    useWorkerPool: true,
    workerPoolSize: 4,
  });

  console.log('  CodebaseAnalyzer initialized with:');
  console.log('    ✓ FileContentCache (1000 files, 100MB)');
  console.log('    ✓ PerformanceMonitor (tracking indexFile, analyzeFileDeep)');
  console.log('    ✓ WorkerPool (4 workers for parallel analysis)');

  // Index codebase (uses cache)
  console.log('\n  Indexing codebase...');
  const indexResult = await analyzer.indexCodebase();
  console.log(`  ✓ Indexed ${indexResult.metrics.totalFiles} files`);

  // Deep analysis using worker pool
  if (indexResult.metrics.totalFiles > 0) {
    const files = Array.from(analyzer.fileIndex.values())
      .filter((f) => f.extension === '.js')
      .slice(0, 3)
      .map((f) => f.path);

    if (files.length > 0) {
      console.log(`\n  Deep analyzing ${files.length} files in parallel...`);
      const analyses = await analyzer.analyzeFilesBatch(files);

      analyses.forEach((analysis, i) => {
        console.log(`\n  ${files[i]}:`, {
          complexity: analysis.analysis?.metrics?.complexity,
          issues: analysis.analysis?.issues?.length || 0,
          patterns: analysis.analysis?.patterns?.length || 0,
        });
      });
    }
  }

  // Get cache statistics
  console.log('\n  File cache stats:', analyzer.fileContentCache.getStats());

  // Get worker pool stats
  console.log('  Worker pool stats:', analyzer.getWorkerPoolStats());

  // Get performance metrics
  const perfMetrics = globalPerformanceMonitor.getAllMetrics();
  console.log('\n  Performance metrics:', perfMetrics);

  // Cleanup
  await analyzer.cleanup();
  console.log('\n  ✓ Resources cleaned up');
}

/**
 * Main execution
 */
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Performance Utilities Integration Examples              ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  try {
    await exampleOptimizedCache();
    await exampleLazyLoader();
    await examplePerformanceMonitor();
    await exampleWorkerPool();
    await exampleIntegratedAnalyzer();

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  All examples completed successfully!                    ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    // Final performance report
    const finalReport = globalPerformanceMonitor.generateReport();
    console.log('Final Global Performance Report:');
    console.log(JSON.stringify(finalReport, null, 2));
  } catch (error) {
    console.error('\n❌ Error running examples:', error);
    process.exit(1);
  }
}

// Run examples
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export {
  exampleOptimizedCache,
  exampleLazyLoader,
  examplePerformanceMonitor,
  exampleWorkerPool,
  exampleIntegratedAnalyzer,
};
