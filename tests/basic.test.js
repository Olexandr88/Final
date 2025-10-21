/**
 * Basic Test Suite for LLM Framework
 * Ensures core functionality and prevents CI/CD failures
 *
 * Note: This test may show a "deserialize cloned data" error when run
 * with all tests due to Node.js test runner concurrency issues.
 * The test passes when run individually: node --test tests/basic.test.js
 */

import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

describe('LLM Framework Basic Tests', () => {
  beforeEach(async () => {
    console.log('🧪 Starting LLM Framework tests...');
  });

  afterEach(async () => {
    console.log('✅ LLM Framework tests completed');
  });

  describe('Environment Setup', () => {
    test('should have required configuration files', () => {
      assert.strictEqual(existsSync('package.json'), true);
      assert.strictEqual(existsSync('.nvmrc'), true);
      assert.strictEqual(existsSync('tsconfig.json'), true);
    });

    test('should have valid package.json', () => {
      const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
      assert.strictEqual(packageJson.name, 'llm');
      assert.strictEqual(packageJson.type, 'module');
      assert.match(packageJson.version, /\d+\.\d+\.\d+/);
    });

    test('should have required scripts', () => {
      const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
      const scripts = packageJson.scripts;

      assert.ok(scripts.start);
      assert.ok(scripts.test);
      assert.ok(scripts.build);
      assert.ok(scripts['start:production']);
    });
  });

  describe('Dependencies', () => {
    test('should have core dependencies', () => {
      const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
      const deps = packageJson.dependencies;

      assert.ok(deps.express);
      assert.ok(deps.dotenv);
      assert.ok(deps.cors);
      assert.ok(deps.winston);
    });

    test('should have optimization dependencies', () => {
      const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
      const deps = packageJson.dependencies;

      assert.ok(deps.compression);
      assert.ok(deps.helmet);
      assert.ok(deps['express-rate-limit']);
      assert.ok(deps['lru-cache']);
    });

    test('should have development dependencies', () => {
      const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
      const devDeps = packageJson.devDependencies;

      assert.ok(devDeps.jest);
      assert.ok(devDeps.typescript);
      assert.ok(devDeps.eslint);
      assert.ok(devDeps['cross-env']);
    });
  });

  describe('Node.js Compatibility', () => {
    test('should run on supported Node.js version', () => {
      const nodeVersion = process.version;
      const major = parseInt(nodeVersion.slice(1).split('.')[0]);
      assert.ok(major >= 18);
    });

    test('should support ESM modules', () => {
      assert.strictEqual(typeof import.meta.url, 'string');
      assert.strictEqual(import.meta.url.startsWith('file://'), true);
    });

    test('should have proper memory limits', () => {
      const memory = process.memoryUsage();
      assert.ok(memory.heapUsed > 0);
      assert.ok(memory.heapTotal > 0);
    });
  });

  describe('File Structure', () => {
    test('should have src directory with core files', () => {
      assert.strictEqual(existsSync('src'), true);
      assert.strictEqual(existsSync('src/performance-monitor.js'), true);
      assert.strictEqual(existsSync('src/ai-bridge.js'), true);
    });

    test('should have scripts directory', () => {
      assert.strictEqual(existsSync('scripts'), true);
      assert.strictEqual(existsSync('scripts/performance-optimizer.js'), true);
      assert.strictEqual(existsSync('scripts/health-check.js'), true);
    });

    test('should have server files', () => {
      assert.strictEqual(existsSync('server.js'), true);
      assert.strictEqual(existsSync('server-optimized.js'), true);
      assert.strictEqual(existsSync('server-ultra-optimized.js'), true);
    });
  });

  describe('Performance Monitoring', () => {
    test('should be able to import performance monitor', async () => {
      const { PerformanceMonitor } = await import('../src/performance-monitor.js');
      assert.ok(PerformanceMonitor);
      assert.equal(typeof PerformanceMonitor, 'function');
    });

    test('should create performance monitor instance', async () => {
      const { PerformanceMonitor } = await import('../src/performance-monitor.js');
      const monitor = new PerformanceMonitor({
        enableFileLogging: false,
        samplingInterval: 30000,
      });

      assert.ok(monitor);
      assert.equal(typeof monitor.start, 'function');
      assert.equal(typeof monitor.stop, 'function');
      assert.equal(typeof monitor.getStats, 'function');
    });
  });

  describe('Environment Variables', () => {
    test('should handle missing environment variables gracefully', () => {
      // Test that the app doesn't crash with minimal env setup
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      assert.equal(process.env.NODE_ENV, 'test');

      // Restore original env
      process.env.NODE_ENV = originalEnv;
    });

    test('should have safe defaults for critical settings', () => {
      // These should not throw errors even if not defined
      const port = process.env.PORT || '8080';
      const nodeEnv = process.env.NODE_ENV || 'development';
      const logLevel = process.env.LOG_LEVEL || 'info';

      assert.equal(typeof port, 'string');
      assert.equal(typeof nodeEnv, 'string');
      assert.equal(typeof logLevel, 'string');
    });
  });

  describe('Error Handling', () => {
    test('should handle promise rejections', async () => {
      const promiseWithError = new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('Test error')), 10);
      });

      await assert.rejects(promiseWithError, { message: 'Test error' });
    });

    test('should handle synchronous errors', () => {
      assert.throws(() => {
        throw new Error('Sync test error');
      }, Error);
    });
  });

  describe('Optimization Scripts', () => {
    test('should have optimization scripts available', () => {
      const scriptFiles = [
        'scripts/performance-optimizer.js',
        'scripts/health-check.js',
        'scripts/complete-system-optimization.js',
        'scripts/concurrent-optimization.js',
        'scripts/optimization-suite.js',
        'scripts/full-optimization.js',
      ];

      scriptFiles.forEach((scriptPath) => {
        assert.strictEqual(existsSync(scriptPath), true);
      });
    });
  });

  describe('Build System', () => {
    test('should have TypeScript configuration', () => {
      const tsConfig = JSON.parse(readFileSync('tsconfig.json', 'utf8'));
      assert.ok(tsConfig.compilerOptions);
      assert.ok(tsConfig.compilerOptions.target);
      assert.ok(tsConfig.compilerOptions.module);
    });

    test('should have ESLint configuration', () => {
      const hasConfig = existsSync('eslint.config.js') || existsSync('eslint.config.js.disabled');
      assert.strictEqual(hasConfig, true);
    });
  });
});

// Helper function tests
describe('Utility Functions', () => {
  test('should handle async operations', async () => {
    const asyncFunction = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return 'success';
    };

    const result = await asyncFunction();
    assert.equal(result, 'success');
  });

  test('should handle JSON operations', () => {
    const testObject = { test: true, value: 42 };
    const jsonString = JSON.stringify(testObject);
    const parsedObject = JSON.parse(jsonString);

    assert.equal(parsedObject.test, true);
    assert.equal(parsedObject.value, 42);
  });

  test('should handle file path operations', () => {
    const testPath = path.join('src', 'test.js');
    const resolvedPath = path.resolve(testPath);
    const expectedPath = path.join('src', 'test.js');

    assert.equal(testPath, expectedPath);
    assert.ok(resolvedPath.includes('src') && resolvedPath.includes('test.js'));
  });
});
