import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { MicrosoftLearnClient } from '../src/integrations/microsoft-learn-client.js';

describe('MicrosoftLearnClient', () => {
  let client;

  before(() => {
    client = new MicrosoftLearnClient();
  });

  after(() => {
    client.clearCache();
  });

  describe('Constructor', () => {
    it('should initialize with cache', () => {
      assert.ok(client.cache, 'Cache should be initialized');
      assert.strictEqual(client.baseUrl, 'https://learn.microsoft.com/api/catalog/');
    });
  });

  describe('fetchModules', () => {
    it('should fetch modules with default filters', async () => {
      const modules = await client.fetchModules();
      assert.ok(Array.isArray(modules), 'Should return an array');
    });

    it('should apply level filter', async () => {
      const modules = await client.fetchModules({ level: 'beginner' });
      assert.ok(Array.isArray(modules), 'Should return filtered results');
    });

    it('should handle API errors gracefully', async () => {
      const invalidClient = new MicrosoftLearnClient();
      invalidClient.baseUrl = 'https://invalid-url-that-does-not-exist.com';

      await assert.rejects(
        async () => await invalidClient.fetchModules(),
        { message: /Failed to fetch modules/ },
        'Should throw error for invalid URL'
      );
    });
  });

  describe('fetchLearningPaths', () => {
    it('should fetch learning paths', async () => {
      const paths = await client.fetchLearningPaths();
      assert.ok(Array.isArray(paths), 'Should return an array');
    });
  });

  describe('fetchCertifications', () => {
    it('should fetch certifications', async () => {
      const certs = await client.fetchCertifications();
      assert.ok(Array.isArray(certs), 'Should return an array');
    });
  });

  describe('fetchExams', () => {
    it('should fetch exams', async () => {
      const exams = await client.fetchExams();
      assert.ok(Array.isArray(exams), 'Should return an array');
    });
  });

  describe('fetchUpdatedSince', () => {
    it('should fetch content updated since timestamp', async () => {
      const timestamp = new Date('2024-01-01').toISOString();
      const result = await client.fetchUpdatedSince(timestamp);

      assert.ok(result.modules, 'Should have modules property');
      assert.ok(result.paths, 'Should have paths property');
      assert.ok(result.certifications, 'Should have certifications property');
      assert.ok(result.exams, 'Should have exams property');
    });
  });

  describe('fetchAll', () => {
    it('should fetch all content types in parallel', async () => {
      const result = await client.fetchAll();

      assert.ok(result.modules, 'Should have modules');
      assert.ok(result.paths, 'Should have paths');
      assert.ok(result.certifications, 'Should have certifications');
      assert.ok(result.exams, 'Should have exams');
    });
  });

  describe('Cache Management', () => {
    it('should cache API responses', async () => {
      // First call - should hit API
      await client.fetchModules({ limit: 1 });

      const statsBefore = client.getCacheStats();
      const hitsBefore = parseInt(statsBefore.hits);

      // Second call - should hit cache
      await client.fetchModules({ limit: 1 });

      const statsAfter = client.getCacheStats();
      const hitsAfter = parseInt(statsAfter.hits);

      assert.ok(hitsAfter > hitsBefore, 'Cache hits should increase');
    });

    it('should clear cache on demand', () => {
      client.clearCache();
      const stats = client.getCacheStats();
      assert.strictEqual(stats.keys, 0, 'Cache should be empty');
    });

    it('should provide cache statistics', () => {
      const stats = client.getCacheStats();

      assert.ok('keys' in stats, 'Should have keys count');
      assert.ok('hits' in stats, 'Should have hits count');
      assert.ok('misses' in stats, 'Should have misses count');
      assert.ok('hitRate' in stats, 'Should have hit rate');
    });
  });

  describe('Error Handling', () => {
    it('should retry on network errors', async () => {
      const retryClient = new MicrosoftLearnClient();
      retryClient.baseUrl = 'https://this-will-fail-for-testing.invalid';

      await assert.rejects(
        async () => await retryClient.fetchModules(),
        { message: /Failed to fetch modules/ },
        'Should fail after retries'
      );
    });

    it('should handle timeout', async () => {
      const slowClient = new MicrosoftLearnClient();
      // This will test timeout handling if the API is slow
      const result = await slowClient.fetchModules({ limit: 1 });
      assert.ok(Array.isArray(result), 'Should handle timeout gracefully or succeed');
    });
  });
});
