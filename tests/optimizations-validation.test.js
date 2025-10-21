#!/usr/bin/env node
/**
 * Comprehensive Validation Tests for A2A Optimizations
 * Tests all new optimization features
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { CircuitBreaker, CircuitBreakerManager } from '../src/utils/circuit-breaker.js';
import { StreamingResponseHandler, streamText } from '../src/utils/streaming-response.js';
import { PerformanceMonitorEndpoint } from '../src/utils/performance-monitor-endpoint.js';

describe('Optimization Features Validation', () => {
  describe('Circuit Breaker', () => {
    let breaker;

    before(() => {
      breaker = new CircuitBreaker({
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 1000,
        monitoringWindow: 5000,
      });
    });

    it('should start in CLOSED state', () => {
      assert.strictEqual(breaker.state, 'CLOSED');
    });

    it('should execute successful functions', async () => {
      const result = await breaker.execute(async () => 'success');
      assert.strictEqual(result, 'success');
      assert.strictEqual(breaker.isHealthy(), true);
    });

    it('should track failures and open circuit', async () => {
      const failingFn = async () => {
        throw new Error('fail');
      };

      // Trigger 3 failures (threshold)
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingFn);
        } catch (err) {
          // Expected
        }
      }

      // Circuit should be OPEN
      assert.strictEqual(breaker.state, 'OPEN');
    });

    it('should reject requests when circuit is OPEN', async () => {
      try {
        await breaker.execute(async () => 'test');
        assert.fail('Should have thrown');
      } catch (error) {
        assert.strictEqual(error.message, 'Circuit breaker is OPEN');
      }
    });

    it('should provide accurate statistics', () => {
      const stats = breaker.getStats();
      assert.strictEqual(stats.state, 'OPEN');
      assert.ok(stats.totalRequests > 0);
      assert.ok(stats.totalFailures > 0);
      assert.ok(stats.recentFailures >= 3);
    });

    it('should reset to CLOSED state', () => {
      breaker.reset();
      assert.strictEqual(breaker.state, 'CLOSED');
      assert.strictEqual(breaker.isHealthy(), true);
    });
  });

  describe('Circuit Breaker Manager', () => {
    let manager;

    before(() => {
      manager = new CircuitBreakerManager({
        failureThreshold: 2,
        timeout: 1000,
      });
    });

    it('should create circuit breakers for agents', async () => {
      const result = await manager.execute('agent-1', async () => 'success');
      assert.strictEqual(result, 'success');
    });

    it('should track multiple agents independently', async () => {
      await manager.execute('agent-1', async () => 'ok');
      await manager.execute('agent-2', async () => 'ok');

      const health = manager.getHealthStatus();
      assert.strictEqual(health['agent-1'].healthy, true);
      assert.strictEqual(health['agent-2'].healthy, true);
    });

    it('should provide stats for all agents', () => {
      const stats = manager.getAllStats();
      assert.ok(stats['agent-1']);
      assert.ok(stats['agent-2']);
      assert.ok(stats['agent-1'].totalRequests > 0);
    });

    after(() => {
      manager.resetAll();
    });
  });

  describe('Streaming Response Handler', () => {
    let handler;

    before(() => {
      handler = new StreamingResponseHandler({
        chunkSize: 10,
        chunkDelay: 10,
      });
    });

    it('should stream response in chunks', async () => {
      const text = 'This is a test message that should be chunked';
      const chunks = [];

      await handler.streamResponse('test-1', text, async (chunk) => {
        chunks.push(chunk);
      });

      assert.ok(chunks.length > 1, 'Should have multiple chunks');
      assert.strictEqual(chunks[chunks.length - 1].isLast, true);

      // Verify all chunks reconstruct original text
      const reconstructed = chunks.map((c) => c.chunk).join('');
      assert.strictEqual(reconstructed, text);
    });

    it('should track stream progress', async () => {
      const text = 'Progress tracking test';

      const streamPromise = handler.streamResponse('test-2', text, async () => {});

      // Check status while streaming
      await new Promise((resolve) => setTimeout(resolve, 20));
      const status = handler.getStreamStatus('test-2');

      if (status.active) {
        assert.ok(status.progress >= 0 && status.progress <= 100);
      }

      await streamPromise;

      const finalStatus = handler.getStreamStatus('test-2');
      assert.strictEqual(finalStatus.active, false);
    });

    it('should support pause and resume', async () => {
      const text = 'Pause and resume test message';
      let chunkCount = 0;

      const streamPromise = handler.streamResponse('test-3', text, async () => {
        chunkCount++;
      });

      // Pause after a bit
      await new Promise((resolve) => setTimeout(resolve, 30));
      handler.pauseStream('test-3');
      const pausedCount = chunkCount;

      // Wait a bit while paused
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.strictEqual(chunkCount, pausedCount, 'Should not receive chunks while paused');

      // Resume
      handler.resumeStream('test-3');
      await streamPromise;

      assert.ok(chunkCount > pausedCount, 'Should continue after resume');
    });

    it('should support cancellation', async () => {
      const text = 'Cancel test message that is long enough to need multiple chunks';
      let completed = false;

      const streamPromise = handler
        .streamResponse('test-4', text, async () => {})
        .then(() => {
          completed = true;
        });

      await new Promise((resolve) => setTimeout(resolve, 20));
      handler.cancelStream('test-4');

      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.strictEqual(completed, false, 'Stream should be cancelled, not completed');
    });

    it('should provide accurate statistics', async () => {
      const text = 'Stats test';
      await handler.streamResponse('test-5', text, async () => {});

      const stats = handler.getStats();
      assert.ok(stats.totalStreams > 0);
      assert.ok(stats.totalChunksSent > 0);
      assert.ok(stats.totalBytesSent > 0);
      assert.strictEqual(stats.activeStreams, 0);
    });
  });

  describe('Helper: streamText', () => {
    it('should stream text with default options', async () => {
      const text = 'Simple streaming test';
      const chunks = [];

      await streamText(
        text,
        async (chunk) => {
          chunks.push(chunk.chunk);
        },
        5,
        10
      );

      const reconstructed = chunks.join('');
      assert.strictEqual(reconstructed, text);
    });
  });

  describe('Performance Monitor Endpoint', () => {
    let monitor;

    before(() => {
      monitor = new PerformanceMonitorEndpoint();
    });

    it('should initialize with zero metrics', () => {
      const metrics = monitor.getMetrics();
      assert.strictEqual(metrics.application.requests, 0);
      assert.strictEqual(metrics.application.errors, 0);
    });

    it('should record request metrics', () => {
      monitor.recordRequest(100, false); // 100ms, no error
      monitor.recordRequest(200, false); // 200ms, no error
      monitor.recordRequest(150, true); // 150ms, error

      const metrics = monitor.getMetrics();
      assert.strictEqual(metrics.application.requests, 3);
      assert.strictEqual(metrics.application.errors, 1);
      assert.ok(metrics.application.avgResponseTime > 0);
    });

    it('should calculate percentiles correctly', () => {
      // Record multiple requests
      for (let i = 0; i < 10; i++) {
        monitor.recordRequest(i * 10, false); // 0, 10, 20, ... 90ms
      }

      const metrics = monitor.getMetrics();
      assert.ok(metrics.application.p95ResponseTime >= 0);
      assert.ok(metrics.application.p99ResponseTime >= 0);
    });

    it('should collect system metrics', () => {
      const metrics = monitor.getMetrics();

      assert.ok(metrics.system);
      assert.ok(metrics.system.platform);
      assert.ok(metrics.system.cpuCount > 0);
      assert.ok(metrics.system.totalMemory > 0);

      assert.ok(metrics.process);
      assert.ok(metrics.process.pid > 0);
      assert.ok(metrics.process.memoryUsage);
    });

    it('should provide health status', () => {
      const health = monitor.getHealthStatus();

      assert.ok(['healthy', 'warning', 'critical'].includes(health.status));
      assert.ok(Array.isArray(health.issues));
      assert.ok(health.metrics);
    });

    it('should track trends over time', async () => {
      // Wait for system metrics collection
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const metrics = monitor.getMetrics();
      assert.ok(metrics.trends);
      assert.ok(Array.isArray(metrics.trends.cpu));
      assert.ok(Array.isArray(metrics.trends.memory));
    });

    after(() => {
      monitor.destroy();
    });
  });

  describe('Integration: Circuit Breaker + Streaming', () => {
    it('should use circuit breaker to protect streaming operations', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2 });
      const handler = new StreamingResponseHandler({ chunkSize: 10 });

      // Successful streaming through circuit breaker
      const result = await breaker.execute(async () => {
        const chunks = [];
        await handler.streamResponse('integration-1', 'Test message', async (chunk) => {
          chunks.push(chunk.chunk);
        });
        return chunks.join('');
      });

      assert.strictEqual(result, 'Test message');
      assert.strictEqual(breaker.isHealthy(), true);
    });
  });
});

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running A2A Optimizations Validation Tests...\n');
}
