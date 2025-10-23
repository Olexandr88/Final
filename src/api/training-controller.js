import { TrainingCatalogRepository } from '../database/training-catalog-repository.js';
import { TrainingSyncService } from '../services/training-sync-service.js';
import { logger } from '../utils/logger.js';

/**
 * Training Controller - Business logic for training catalog operations
 * @module training-controller
 */

export class TrainingController {
  constructor() {
    this.repository = new TrainingCatalogRepository();
    this.syncService = new TrainingSyncService();
  }

  /**
   * Get catalog with filters and pagination
   * @param {Object} query - Query parameters
   * @returns {Promise<Object>} Catalog results
   */
  async getCatalog(query) {
    try {
      const {
        search,
        level,
        product,
        role,
        subject,
        page = 1,
        limit = 50,
      } = query;

      const offset = (parseInt(page) - 1) * parseInt(limit);

      const modules = this.repository.searchModules({
        query: search,
        level,
        product,
        role,
        subject,
        limit: parseInt(limit),
        offset,
      });

      logger.info('Catalog query executed', {
        filters: { search, level, product, role, subject },
        resultCount: modules.length,
        page,
        limit
      });

      return {
        success: true,
        data: modules,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          hasMore: modules.length === parseInt(limit),
        },
        metadata: {
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      logger.error('Catalog query failed', { query, error: error.message });
      throw new Error(`Failed to retrieve catalog: ${error.message}`);
    }
  }

  /**
   * Get module by UID
   * @param {string} uid - Module UID
   * @returns {Promise<Object>} Module details
   */
  async getModuleByUid(uid) {
    try {
      const module = this.repository.getModuleByUid(uid);

      if (!module) {
        return {
          success: false,
          error: 'Module not found',
          code: 'MODULE_NOT_FOUND',
        };
      }

      logger.info('Module retrieved', { uid });

      return {
        success: true,
        data: module,
        metadata: {
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      logger.error('Module retrieval failed', { uid, error: error.message });
      throw new Error(`Failed to retrieve module: ${error.message}`);
    }
  }

  /**
   * Search catalog with full-text search
   * @param {Object} query - Search query
   * @returns {Promise<Object>} Search results
   */
  async searchCatalog(query) {
    try {
      const { q, limit = 50, offset = 0 } = query;

      if (!q || q.trim().length < 2) {
        return {
          success: false,
          error: 'Search query must be at least 2 characters',
          code: 'INVALID_QUERY',
        };
      }

      const modules = this.repository.searchModules({
        query: q,
        limit: parseInt(limit),
        offset: parseInt(offset),
      });

      logger.info('Search executed', { query: q, resultCount: modules.length });

      return {
        success: true,
        data: modules,
        query: q,
        metadata: {
          timestamp: new Date().toISOString(),
          resultCount: modules.length,
        },
      };
    } catch (error) {
      logger.error('Search failed', { query, error: error.message });
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  /**
   * Get AI-powered recommendations
   * @param {Object} context - User context
   * @returns {Promise<Object>} Recommendations
   */
  async getRecommendations(context) {
    try {
      const { userId, skills = [], preferences = {} } = context;

      logger.info('Generating recommendations', { userId, skillCount: skills.length });

      // Get user progress
      const progressData = this.repository.db.prepare(`
        SELECT content_uid, progress_percent
        FROM user_progress
        WHERE user_id = ? AND progress_percent < 100
        ORDER BY last_accessed DESC
        LIMIT 5
      `).all(userId || 'anonymous');

      // Search for skill-based recommendations
      const recommendations = [];
      for (const skill of skills.slice(0, 5)) {
        const modules = this.repository.searchModules({
          query: skill,
          level: preferences.level,
          limit: 3,
        });
        recommendations.push(...modules);
      }

      // Deduplicate
      const uniqueRecommendations = [...new Map(
        recommendations.map(m => [m.uid, m])
      ).values()];

      return {
        success: true,
        data: {
          recommendations: uniqueRecommendations.slice(0, 10),
          inProgress: progressData,
        },
        metadata: {
          userId,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      logger.error('Recommendations failed', { context, error: error.message });
      throw new Error(`Failed to generate recommendations: ${error.message}`);
    }
  }

  /**
   * Track user progress
   * @param {Object} progressData - Progress data
   * @returns {Promise<Object>} Result
   */
  async trackProgress(progressData) {
    try {
      const { userId, contentUid, contentType, progressPercent } = progressData;

      if (!userId || !contentUid || !contentType || progressPercent === undefined) {
        return {
          success: false,
          error: 'Missing required fields',
          code: 'INVALID_INPUT',
        };
      }

      if (progressPercent < 0 || progressPercent > 100) {
        return {
          success: false,
          error: 'Progress must be between 0 and 100',
          code: 'INVALID_PROGRESS',
        };
      }

      this.repository.db.prepare(`
        INSERT INTO user_progress (user_id, content_uid, content_type, progress_percent, last_accessed)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, content_uid) DO UPDATE SET
          progress_percent = excluded.progress_percent,
          last_accessed = CURRENT_TIMESTAMP,
          completed_at = CASE WHEN excluded.progress_percent = 100 THEN CURRENT_TIMESTAMP ELSE completed_at END
      `).run(userId, contentUid, contentType, progressPercent);

      logger.info('Progress tracked', { userId, contentUid, progressPercent });

      return {
        success: true,
        data: {
          userId,
          contentUid,
          progressPercent,
          completed: progressPercent === 100,
        },
        metadata: {
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      logger.error('Progress tracking failed', { progressData, error: error.message });
      throw new Error(`Failed to track progress: ${error.message}`);
    }
  }

  /**
   * Trigger manual sync
   * @param {string} syncType - 'FULL' or 'INCREMENTAL'
   * @returns {Promise<Object>} Sync result
   */
  async triggerSync(syncType = 'INCREMENTAL') {
    try {
      if (!['FULL', 'INCREMENTAL'].includes(syncType)) {
        return {
          success: false,
          error: 'Invalid sync type. Must be FULL or INCREMENTAL',
          code: 'INVALID_SYNC_TYPE',
        };
      }

      logger.info('Manual sync triggered', { syncType });

      const result = await this.syncService.triggerManualSync(syncType);
      return result;
    } catch (error) {
      logger.error('Manual sync failed', { syncType, error: error.message });
      throw new Error(`Manual sync failed: ${error.message}`);
    }
  }

  /**
   * Get sync status
   * @returns {Promise<Object>} Sync status
   */
  async getSyncStatus() {
    try {
      const status = this.syncService.getStatus();

      return {
        success: true,
        data: status,
        metadata: {
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      logger.error('Failed to get sync status', { error: error.message });
      throw new Error(`Failed to get sync status: ${error.message}`);
    }
  }

  /**
   * Cleanup resources
   */
  shutdown() {
    this.repository.close();
    this.syncService.shutdown();
    logger.info('TrainingController shut down');
  }
}

export default TrainingController;
