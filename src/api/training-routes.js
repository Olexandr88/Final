import express from 'express';
import { TrainingController } from './training-controller.js';
import { logger } from '../utils/logger.js';

/**
 * Training API Routes
 * @module training-routes
 */

const router = express.Router();
const controller = new TrainingController();

/**
 * @route GET /api/training/catalog
 * @desc Get training catalog with filters
 * @query {string} search - Full-text search query
 * @query {string} level - Filter by level (beginner, intermediate, advanced)
 * @query {string} product - Filter by product
 * @query {string} role - Filter by role
 * @query {string} subject - Filter by subject
 * @query {number} page - Page number (default: 1)
 * @query {number} limit - Results per page (default: 50)
 */
router.get('/catalog', async (req, res) => {
  try {
    const result = await controller.getCatalog(req.query);
    res.json(result);
  } catch (error) {
    logger.error('GET /catalog error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * @route GET /api/training/catalog/:uid
 * @desc Get module by UID
 * @param {string} uid - Module UID
 */
router.get('/catalog/:uid', async (req, res) => {
  try {
    const result = await controller.getModuleByUid(req.params.uid);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    logger.error('GET /catalog/:uid error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * @route GET /api/training/search
 * @desc Full-text search
 * @query {string} q - Search query
 * @query {number} limit - Results limit (default: 50)
 * @query {number} offset - Results offset (default: 0)
 */
router.get('/search', async (req, res) => {
  try {
    const result = await controller.searchCatalog(req.query);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    logger.error('GET /search error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * @route POST /api/training/recommendations
 * @desc Get AI-powered recommendations
 * @body {string} userId - User ID
 * @body {Array<string>} skills - User skills
 * @body {Object} preferences - User preferences
 */
router.post('/recommendations', async (req, res) => {
  try {
    const result = await controller.getRecommendations(req.body);
    res.json(result);
  } catch (error) {
    logger.error('POST /recommendations error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * @route POST /api/training/progress
 * @desc Track user progress
 * @body {string} userId - User ID
 * @body {string} contentUid - Content UID
 * @body {string} contentType - Content type (module, path, certification)
 * @body {number} progressPercent - Progress percentage (0-100)
 */
router.post('/progress', async (req, res) => {
  try {
    const result = await controller.trackProgress(req.body);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    logger.error('POST /progress error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * @route POST /api/training/sync/trigger
 * @desc Trigger manual sync
 * @body {string} syncType - Sync type (FULL or INCREMENTAL)
 */
router.post('/sync/trigger', async (req, res) => {
  try {
    const { syncType = 'INCREMENTAL' } = req.body;
    const result = await controller.triggerSync(syncType);
    res.json(result);
  } catch (error) {
    logger.error('POST /sync/trigger error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * @route GET /api/training/sync/status
 * @desc Get sync status
 */
router.get('/sync/status', async (req, res) => {
  try {
    const result = await controller.getSyncStatus();
    res.json(result);
  } catch (error) {
    logger.error('GET /sync/status error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

export default router;
