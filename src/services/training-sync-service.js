import cron from 'node-cron';
import { MicrosoftLearnClient } from '../integrations/microsoft-learn-client.js';
import { TrainingCatalogRepository } from '../database/training-catalog-repository.js';
import { logger } from '../utils/logger.js';

/**
 * Training Sync Service - Automated catalog synchronization
 * @module training-sync-service
 */

const CRON_SCHEDULE = process.env.TRAINING_SYNC_CRON || '0 2,14 * * *'; // 2 AM and 2 PM daily
const SYNC_LOCALE = process.env.TRAINING_SYNC_LOCALE || 'en-us';

export class TrainingSyncService {
  constructor() {
    this.client = new MicrosoftLearnClient();
    this.repository = new TrainingCatalogRepository();
    this.cronJob = null;
    this.isSyncing = false;
    this.syncHistory = [];
    logger.info('TrainingSyncService initialized', { cronSchedule: CRON_SCHEDULE });
  }

  /**
   * Start automated sync service
   */
  start() {
    if (this.cronJob) {
      logger.warn('Sync service already running');
      return;
    }

    // Run initial sync immediately
    this._performSync('FULL').catch(error => {
      logger.error('Initial sync failed', { error: error.message });
    });

    // Schedule recurring syncs
    this.cronJob = cron.schedule(CRON_SCHEDULE, async () => {
      try {
        await this._performSync('INCREMENTAL');
      } catch (error) {
        logger.error('Scheduled sync failed', { error: error.message });
      }
    });

    logger.info('Sync service started', { schedule: CRON_SCHEDULE });
  }

  /**
   * Stop automated sync service
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      logger.info('Sync service stopped');
    }
  }

  /**
   * Perform synchronization
   * @private
   * @param {string} syncType - 'FULL' or 'INCREMENTAL'
   * @returns {Promise<Object>} Sync result
   */
  async _performSync(syncType) {
    if (this.isSyncing) {
      logger.warn('Sync already in progress, skipping');
      return { success: false, reason: 'Sync already in progress' };
    }

    this.isSyncing = true;
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    logger.info('Sync started', { syncType, timestamp });

    try {
      let data;
      let itemsSynced = 0;

      if (syncType === 'FULL') {
        data = await this._performFullSync();
      } else {
        data = await this._performIncrementalSync();
      }

      // Process data
      itemsSynced += this.repository.upsertModules(data.modules || []);
      itemsSynced += this.repository.upsertLearningPaths(data.paths || []);

      const duration = Date.now() - startTime;

      // Record sync metadata
      this.repository.recordSyncMetadata(syncType, timestamp, itemsSynced, null);

      const result = {
        success: true,
        syncType,
        timestamp,
        itemsSynced,
        duration: `${(duration / 1000).toFixed(2)}s`,
        breakdown: {
          modules: data.modules?.length || 0,
          paths: data.paths?.length || 0,
          certifications: data.certifications?.length || 0,
          exams: data.exams?.length || 0,
        },
      };

      this.syncHistory.push(result);
      if (this.syncHistory.length > 50) {
        this.syncHistory.shift(); // Keep last 50 syncs
      }

      logger.info('Sync completed successfully', result);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error.message;

      this.repository.recordSyncMetadata(syncType, timestamp, 0, errorMessage);

      logger.error('Sync failed', {
        syncType,
        duration: `${(duration / 1000).toFixed(2)}s`,
        error: errorMessage
      });

      return {
        success: false,
        syncType,
        timestamp,
        error: errorMessage,
        duration: `${(duration / 1000).toFixed(2)}s`,
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Perform full catalog sync
   * @private
   * @returns {Promise<Object>} All content
   */
  async _performFullSync() {
    logger.info('Performing FULL sync');
    const filters = { locale: SYNC_LOCALE };
    return await this.client.fetchAll(filters);
  }

  /**
   * Perform incremental sync (updates since last sync)
   * @private
   * @returns {Promise<Object>} Updated content
   */
  async _performIncrementalSync() {
    logger.info('Performing INCREMENTAL sync');

    const lastSync = this.repository.getLastSyncMetadata();
    if (!lastSync) {
      logger.warn('No previous sync found, performing FULL sync instead');
      return await this._performFullSync();
    }

    const since = lastSync.last_sync_timestamp;
    const filters = { locale: SYNC_LOCALE };

    return await this.client.fetchUpdatedSince(since, filters);
  }

  /**
   * Manually trigger sync
   * @param {string} [syncType='INCREMENTAL'] - Sync type
   * @returns {Promise<Object>} Sync result
   */
  async triggerManualSync(syncType = 'INCREMENTAL') {
    logger.info('Manual sync triggered', { syncType });
    return await this._performSync(syncType);
  }

  /**
   * Get sync status
   * @returns {Object} Current status
   */
  getStatus() {
    const lastSync = this.repository.getLastSyncMetadata();
    const cacheStats = this.client.getCacheStats();

    return {
      isRunning: this.cronJob !== null,
      isSyncing: this.isSyncing,
      cronSchedule: CRON_SCHEDULE,
      lastSync: lastSync ? {
        type: lastSync.sync_type,
        timestamp: lastSync.last_sync_timestamp,
        itemsSynced: lastSync.items_synced,
        createdAt: lastSync.created_at,
        errors: lastSync.errors,
      } : null,
      cacheStats,
      recentHistory: this.syncHistory.slice(-10),
    };
  }

  /**
   * Clear API cache
   */
  clearCache() {
    this.client.clearCache();
    logger.info('API cache cleared');
  }

  /**
   * Cleanup resources
   */
  shutdown() {
    this.stop();
    this.repository.close();
    logger.info('TrainingSyncService shut down');
  }
}

export default TrainingSyncService;
