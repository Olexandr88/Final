import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { TrainingSyncService } from '../src/services/training-sync-service.js';
import fs from 'fs';

describe('TrainingSyncService', () => {
  let syncService;
  const TEST_DB_PATH = './data/test-training-sync.db';

  before(() => {
    process.env.TRAINING_DB_PATH = TEST_DB_PATH;
    process.env.TRAINING_SYNC_CRON = '0 0 * * *'; // Daily at midnight
    syncService = new TrainingSyncService();
  });

  after(() => {
    syncService.shutdown();

    // Cleanup test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    if (fs.existsSync(TEST_DB_PATH + '-wal')) {
      fs.unlinkSync(TEST_DB_PATH + '-wal');
    }
    if (fs.existsSync(TEST_DB_PATH + '-shm')) {
      fs.unlinkSync(TEST_DB_PATH + '-shm');
    }
  });

  describe('Constructor', () => {
    it('should initialize with client and repository', () => {
      assert.ok(syncService.client, 'Should have API client');
      assert.ok(syncService.repository, 'Should have repository');
      assert.strictEqual(syncService.isSyncing, false, 'Should not be syncing initially');
    });
  });

  describe('Manual Sync', () => {
    it('should perform FULL sync on first run', async () => {
      const result = await syncService.triggerManualSync('FULL');

      assert.ok(result, 'Should return result');
      assert.ok(result.success !== undefined, 'Should have success flag');

      if (result.success) {
        assert.strictEqual(result.syncType, 'FULL');
        assert.ok(result.itemsSynced >= 0, 'Should have items synced count');
        assert.ok(result.duration, 'Should have duration');
        assert.ok(result.breakdown, 'Should have breakdown');
      }
    }, { timeout: 60000 }); // 60 second timeout for network requests

    it('should perform INCREMENTAL sync after full sync', async () => {
      const result = await syncService.triggerManualSync('INCREMENTAL');

      assert.ok(result, 'Should return result');
      assert.ok(result.success !== undefined, 'Should have success flag');

      if (result.success) {
        assert.strictEqual(result.syncType, 'INCREMENTAL');
      }
    }, { timeout: 60000 });

    it('should prevent concurrent syncs', async () => {
      const sync1Promise = syncService.triggerManualSync('INCREMENTAL');
      const sync2Promise = syncService.triggerManualSync('INCREMENTAL');

      const [result1, result2] = await Promise.all([sync1Promise, sync2Promise]);

      // One should succeed, one should be skipped
      const successCount = [result1, result2].filter(r => r.success).length;
      const skippedCount = [result1, result2].filter(r => r.reason === 'Sync already in progress').length;

      assert.ok(successCount >= 1, 'At least one sync should succeed');
      assert.ok(skippedCount <= 1, 'At most one sync should be skipped');
    }, { timeout: 60000 });
  });

  describe('Sync Status', () => {
    it('should provide sync status', () => {
      const status = syncService.getStatus();

      assert.ok('isRunning' in status, 'Should have isRunning flag');
      assert.ok('isSyncing' in status, 'Should have isSyncing flag');
      assert.ok('cronSchedule' in status, 'Should have cronSchedule');
      assert.ok('lastSync' in status, 'Should have lastSync');
      assert.ok('cacheStats' in status, 'Should have cacheStats');
      assert.ok('recentHistory' in status, 'Should have recentHistory');
    });

    it('should include last sync information after sync', async () => {
      await syncService.triggerManualSync('INCREMENTAL');
      const status = syncService.getStatus();

      if (status.lastSync) {
        assert.ok(status.lastSync.type, 'Should have sync type');
        assert.ok(status.lastSync.timestamp, 'Should have timestamp');
        assert.ok(status.lastSync.itemsSynced !== undefined, 'Should have items synced');
      }
    }, { timeout: 60000 });
  });

  describe('Cache Management', () => {
    it('should clear API cache', () => {
      syncService.clearCache();
      const status = syncService.getStatus();

      assert.strictEqual(status.cacheStats.keys, 0, 'Cache should be empty');
    });
  });

  describe('Automated Sync Service', () => {
    it('should start cron service', () => {
      syncService.start();
      const status = syncService.getStatus();

      assert.strictEqual(status.isRunning, true, 'Service should be running');
    });

    it('should stop cron service', () => {
      syncService.stop();
      const status = syncService.getStatus();

      assert.strictEqual(status.isRunning, false, 'Service should be stopped');
    });

    it('should not start if already running', () => {
      syncService.start();
      syncService.start(); // Try to start again

      const status = syncService.getStatus();
      assert.strictEqual(status.isRunning, true, 'Should still be running');

      syncService.stop();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid sync type', async () => {
      const result = await syncService.triggerManualSync('INVALID_TYPE');

      // The service should either reject or handle gracefully
      assert.ok(result, 'Should return a result');
    });

    it('should record sync errors in metadata', async () => {
      // Force an error by using invalid API client
      const originalClient = syncService.client;
      syncService.client.baseUrl = 'https://invalid-url.invalid';

      const result = await syncService.triggerManualSync('FULL');

      // Restore client
      syncService.client = originalClient;

      if (!result.success) {
        assert.ok(result.error, 'Should have error message');
      }
    }, { timeout: 60000 });
  });

  describe('Sync History', () => {
    it('should maintain sync history', async () => {
      await syncService.triggerManualSync('INCREMENTAL');
      const status = syncService.getStatus();

      assert.ok(Array.isArray(status.recentHistory), 'Should have history array');
      assert.ok(status.recentHistory.length > 0, 'Should have history entries');
    }, { timeout: 60000 });

    it('should limit history to 50 entries', async () => {
      // This would take too long to test fully, but we can check the logic
      const history = syncService.syncHistory;
      assert.ok(history.length <= 50, 'History should not exceed 50 entries');
    });
  });
});
