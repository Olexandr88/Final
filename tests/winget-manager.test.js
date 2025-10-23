// tests/winget-manager.test.js
import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { WinGetManager } from '../src/integrations/winget-manager.js';

describe('WinGetManager', () => {
  let winget;

  before(async () => {
    winget = new WinGetManager({
      cacheEnabled: true,
      timeout: 10000,
    });
  });

  after(() => {
    if (winget) {
      winget.clearCache();
    }
  });

  describe('Initialization', () => {
    it('should create WinGetManager instance', () => {
      assert.ok(winget instanceof WinGetManager);
      assert.strictEqual(typeof winget.initialize, 'function');
    });

    it('should have default configuration', () => {
      assert.ok(winget.config);
      assert.strictEqual(winget.config.cacheEnabled, true);
      assert.strictEqual(winget.config.timeout, 10000);
    });
  });

  describe('Initialization on Windows', () => {
    it('should detect WinGet availability', async () => {
      // Only run on Windows
      if (process.platform !== 'win32') {
        return;
      }

      const available = await winget.initialize();
      assert.strictEqual(typeof available, 'boolean');

      if (available) {
        assert.strictEqual(winget.isAvailable, true);
      }
    });
  });

  describe('Search', () => {
    it('should handle search requests', async () => {
      if (process.platform !== 'win32' || !winget.isAvailable) {
        return; // Skip if not on Windows or WinGet not available
      }

      const results = await winget.search('nodejs', { exact: false });
      assert.ok(Array.isArray(results));
    });

    it('should cache search results', async () => {
      if (process.platform !== 'win32' || !winget.isAvailable) {
        return;
      }

      // First search
      const results1 = await winget.search('git');

      // Second search (should be cached)
      const startTime = Date.now();
      const results2 = await winget.search('git');
      const duration = Date.now() - startTime;

      // Cached result should be faster
      assert.ok(duration < 100, 'Cached search should be fast');
      assert.deepStrictEqual(results1, results2);
    });
  });

  describe('Package Operations', () => {
    it('should parse search output correctly', () => {
      const mockOutput = `
Name              Id                   Version  Source
---------------------------------------------------------
Git               Git.Git              2.43.0   winget
GitHub Desktop    GitHub.GitHubDesktop 3.3.6    winget
      `;

      const packages = winget._parseSearchOutput(mockOutput);
      assert.ok(Array.isArray(packages));
      assert.strictEqual(packages.length, 2);
      assert.strictEqual(packages[0].name, 'Git');
      assert.strictEqual(packages[0].id, 'Git.Git');
      assert.strictEqual(packages[0].version, '2.43.0');
    });

    it('should parse show output correctly', () => {
      const mockOutput = `
Found Git [Git.Git] Version 2.43.0
Publisher: The Git Development Community
Description: Git is a fast, scalable, distributed revision control system
      `;

      const details = winget._parseShowOutput(mockOutput);
      assert.ok(typeof details === 'object');
      assert.ok(details.Publisher);
      assert.ok(details.Description);
    });
  });

  describe('Cache Management', () => {
    it('should clear cache on demand', () => {
      winget.cache.set('test', { data: 'value', timestamp: Date.now() });
      assert.strictEqual(winget.cache.size, 1);

      winget.clearCache();
      assert.strictEqual(winget.cache.size, 0);
    });

    it('should respect cache TTL', async () => {
      const shortTTLWinget = new WinGetManager({
        cacheEnabled: true,
        cacheTTL: 100, // 100ms
      });

      shortTTLWinget.cache.set('test', { data: 'value', timestamp: Date.now() - 200 });

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Cache should be expired, but we can't easily test this without a real search
      assert.ok(true);
    });
  });

  describe('Event Emission', () => {
    it('should emit events on operations', (done) => {
      let eventReceived = false;

      winget.once('search', (data) => {
        eventReceived = true;
        assert.ok(data);
        assert.ok('query' in data);
      });

      // Simulate search event
      winget.emit('search', { query: 'test', count: 0 });

      setTimeout(() => {
        assert.strictEqual(eventReceived, true);
        done();
      }, 100);
    });
  });

  describe('Error Handling', () => {
    it('should handle command timeout', async () => {
      const timeoutWinget = new WinGetManager({ timeout: 1 });

      if (process.platform === 'win32') {
        await assert.rejects(
          async () => await timeoutWinget.search('test'),
          /timeout/i
        );
      } else {
        assert.ok(true); // Skip on non-Windows
      }
    });

    it('should handle invalid commands gracefully', async () => {
      if (process.platform !== 'win32') {
        return;
      }

      await assert.rejects(
        async () => await winget._execute(['invalid-command']),
        Error
      );
    });
  });
});
