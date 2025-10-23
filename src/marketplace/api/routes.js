/**
 * Marketplace API Routes
 * @module marketplace/api/routes
 */

import express from 'express';
import {
  searchPackages,
  getPackage,
  installPackage,
  uninstallPackage,
  ratePackage,
  getFeaturedPackages,
  getRecentPackages,
  getPackageStats,
  getInstalledPackages,
} from '../services/marketplace-service.js';
import { logger } from '../../utils/logger.js';

const router = express.Router();

/**
 * GET /marketplace/search
 * Search for packages with filters and pagination
 */
router.get('/search', async (req, res) => {
  try {
    const {
      q = '',
      category,
      rating,
      featured,
      verified,
      sort = 'relevance',
      page = 1,
      limit = 20,
    } = req.query;

    const filters = {
      category: category || null,
      minRating: rating ? parseFloat(rating) : null,
      featured: featured === 'true',
      verified: verified === 'true',
    };

    const results = await searchPackages(q, filters, sort, parseInt(page), parseInt(limit));

    res.json({
      success: true,
      data: results,
      query: {
        q,
        filters,
        sort,
        page: parseInt(page),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    logger.error('Search packages failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /marketplace/package/:id
 * Get detailed information about a specific package
 */
router.get('/package/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const includeRatings = req.query.includeRatings === 'true';

    const packageData = await getPackage(id, includeRatings);

    if (!packageData) {
      return res.status(404).json({
        success: false,
        error: 'Package not found',
      });
    }

    res.json({
      success: true,
      data: packageData,
    });
  } catch (error) {
    logger.error('Get package failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /marketplace/featured
 * Get featured packages
 */
router.get('/featured', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const packages = await getFeaturedPackages(limit);

    res.json({
      success: true,
      data: packages,
    });
  } catch (error) {
    logger.error('Get featured packages failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /marketplace/recent
 * Get recently updated packages
 */
router.get('/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const packages = await getRecentPackages(limit);

    res.json({
      success: true,
      data: packages,
    });
  } catch (error) {
    logger.error('Get recent packages failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /marketplace/installed
 * Get list of installed packages
 */
router.get('/installed', async (req, res) => {
  try {
    const status = req.query.status || 'installed';
    const packages = await getInstalledPackages(status);

    res.json({
      success: true,
      data: packages,
    });
  } catch (error) {
    logger.error('Get installed packages failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /marketplace/install
 * Install a package
 */
router.post('/install', async (req, res) => {
  try {
    const { packageId, version, config } = req.body;

    if (!packageId) {
      return res.status(400).json({
        success: false,
        error: 'Package ID is required',
      });
    }

    const result = await installPackage(packageId, version, config);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Install package failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /marketplace/uninstall
 * Uninstall a package
 */
router.post('/uninstall', async (req, res) => {
  try {
    const { packageId } = req.body;

    if (!packageId) {
      return res.status(400).json({
        success: false,
        error: 'Package ID is required',
      });
    }

    const result = await uninstallPackage(packageId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Uninstall package failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /marketplace/rate
 * Rate a package
 */
router.post('/rate', async (req, res) => {
  try {
    const { packageId, userId, rating, review } = req.body;

    if (!packageId || !userId || !rating) {
      return res.status(400).json({
        success: false,
        error: 'Package ID, user ID, and rating are required',
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        error: 'Rating must be between 1 and 5',
      });
    }

    const result = await ratePackage(packageId, userId, rating, review);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Rate package failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /marketplace/stats/:id
 * Get statistics for a package
 */
router.get('/stats/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const stats = await getPackageStats(id);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Get package stats failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /marketplace/health
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
