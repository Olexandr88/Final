/**
 * Marketplace Service
 * Business logic for marketplace operations
 * @module marketplace/services/marketplace-service
 */

import { randomUUID } from 'crypto';
import database from '../database/init.js';
import { logger } from '../../utils/logger.js';
import { installationService } from './installation-service.js';
import { notifyAIBridge } from '../ai-bridge-adapter.js';

/**
 * Search packages with filters and pagination
 * @param {string} query - Search query
 * @param {Object} filters - Filter options
 * @param {string} sort - Sort field
 * @param {number} page - Page number
 * @param {number} limit - Results per page
 * @returns {Promise<Object>} Search results with pagination
 */
export async function searchPackages(
  query = '',
  filters = {},
  sort = 'relevance',
  page = 1,
  limit = 20
) {
  try {
    const db = database.getDatabase();
    const offset = (page - 1) * limit;

    let sql = '';
    let params = [];

    // Use FTS if query provided
    if (query.trim()) {
      sql = `
        SELECT p.*
        FROM packages p
        INNER JOIN packages_fts fts ON p.rowid = fts.rowid
        WHERE packages_fts MATCH ?
      `;
      params.push(query);
    } else {
      sql = 'SELECT * FROM packages WHERE 1=1';
    }

    // Apply filters
    if (filters.category) {
      sql += ' AND category = ?';
      params.push(filters.category);
    }

    if (filters.minRating) {
      sql += ' AND rating >= ?';
      params.push(filters.minRating);
    }

    if (filters.featured) {
      sql += ' AND featured = 1';
    }

    if (filters.verified) {
      sql += ' AND verified = 1';
    }

    // Apply sorting
    const sortMap = {
      relevance: 'rating DESC, downloads DESC',
      rating: 'rating DESC, rating_count DESC',
      downloads: 'downloads DESC',
      newest: 'created_at DESC',
      updated: 'updated_at DESC',
    };
    sql += ` ORDER BY ${sortMap[sort] || sortMap.relevance}`;

    // Add pagination
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const packages = db.prepare(sql).all(...params);

    // Get total count for pagination
    let countSql = 'SELECT COUNT(*) as total FROM packages WHERE 1=1';
    let countParams = [];

    if (query.trim()) {
      countSql = `
        SELECT COUNT(*) as total
        FROM packages p
        INNER JOIN packages_fts fts ON p.rowid = fts.rowid
        WHERE packages_fts MATCH ?
      `;
      countParams.push(query);
    }

    if (filters.category) {
      countSql += ' AND category = ?';
      countParams.push(filters.category);
    }

    const { total } = db.prepare(countSql).get(...countParams);

    // Parse JSON fields
    const parsedPackages = packages.map(parsePackageJson);

    // Notify AI Bridge about search
    await notifyAIBridge('package.searched', { query, filters, resultCount: total });

    return {
      packages: parsedPackages,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    logger.error('Search packages failed', { error: error.message });
    throw error;
  }
}

/**
 * Get package details by ID
 * @param {string} id - Package ID
 * @param {boolean} includeRatings - Include ratings and reviews
 * @returns {Promise<Object|null>} Package data or null
 */
export async function getPackage(id, includeRatings = false) {
  try {
    const db = database.getDatabase();

    const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(id);

    if (!pkg) {
      return null;
    }

    const packageData = parsePackageJson(pkg);

    // Get installation status
    const installation = db
      .prepare('SELECT * FROM installations WHERE package_id = ? ORDER BY installed_at DESC LIMIT 1')
      .get(id);

    packageData.installed = installation ? installation.status === 'installed' : false;
    packageData.installation = installation || null;

    // Include ratings if requested
    if (includeRatings) {
      const ratings = db
        .prepare('SELECT * FROM ratings WHERE package_id = ? ORDER BY created_at DESC')
        .all(id);
      packageData.ratings = ratings;
    }

    return packageData;
  } catch (error) {
    logger.error('Get package failed', { error: error.message, id });
    throw error;
  }
}

/**
 * Get featured packages
 * @param {number} limit - Maximum number of packages
 * @returns {Promise<Array>} Featured packages
 */
export async function getFeaturedPackages(limit = 10) {
  try {
    const db = database.getDatabase();

    const packages = db
      .prepare('SELECT * FROM packages WHERE featured = 1 ORDER BY rating DESC, downloads DESC LIMIT ?')
      .all(limit);

    return packages.map(parsePackageJson);
  } catch (error) {
    logger.error('Get featured packages failed', { error: error.message });
    throw error;
  }
}

/**
 * Get recently updated packages
 * @param {number} limit - Maximum number of packages
 * @returns {Promise<Array>} Recent packages
 */
export async function getRecentPackages(limit = 20) {
  try {
    const db = database.getDatabase();

    const packages = db
      .prepare('SELECT * FROM packages ORDER BY updated_at DESC LIMIT ?')
      .all(limit);

    return packages.map(parsePackageJson);
  } catch (error) {
    logger.error('Get recent packages failed', { error: error.message });
    throw error;
  }
}

/**
 * Get installed packages
 * @param {string} status - Filter by status (installed, pending, failed, uninstalled)
 * @returns {Promise<Array>} Installed packages
 */
export async function getInstalledPackages(status = 'installed') {
  try {
    const db = database.getDatabase();

    const installations = db
      .prepare(`
        SELECT i.*, p.*
        FROM installations i
        JOIN packages p ON i.package_id = p.id
        WHERE i.status = ?
        ORDER BY i.installed_at DESC
      `)
      .all(status);

    return installations.map(parsePackageJson);
  } catch (error) {
    logger.error('Get installed packages failed', { error: error.message });
    throw error;
  }
}

/**
 * Install a package
 * @param {string} packageId - Package ID
 * @param {string} version - Version to install (optional)
 * @param {Object} config - Installation configuration
 * @returns {Promise<Object>} Installation result
 */
export async function installPackage(packageId, version = null, config = {}) {
  try {
    const db = database.getDatabase();

    // Get package details
    const pkg = await getPackage(packageId);
    if (!pkg) {
      throw new Error(`Package not found: ${packageId}`);
    }

    // Create installation record
    const installationId = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO installations (id, package_id, version, status, config, installed_at)
      VALUES (?, ?, ?, 'pending', ?, ?)
    `).run(installationId, packageId, version || pkg.version, JSON.stringify(config), now);

    // Perform actual installation
    const result = await installationService.install(pkg, version, config);

    // Update installation status
    if (result.success) {
      db.prepare(`
        UPDATE installations
        SET status = 'installed', install_path = ?, error_message = NULL
        WHERE id = ?
      `).run(result.installPath, installationId);

      // Increment download count
      db.prepare('UPDATE packages SET downloads = downloads + 1 WHERE id = ?').run(packageId);

      // Record download stat
      db.prepare(`
        INSERT INTO download_stats (id, package_id, version, downloaded_at)
        VALUES (?, ?, ?, ?)
      `).run(randomUUID(), packageId, version || pkg.version, now);

      // Notify AI Bridge
      await notifyAIBridge('package.installed', {
        packageId,
        version: version || pkg.version,
        installationId,
      });

      logger.info('Package installed successfully', { packageId, version, installationId });
    } else {
      db.prepare(`
        UPDATE installations
        SET status = 'failed', error_message = ?
        WHERE id = ?
      `).run(result.error, installationId);

      logger.error('Package installation failed', { packageId, error: result.error });
    }

    return {
      installationId,
      packageId,
      version: version || pkg.version,
      success: result.success,
      error: result.error,
      installPath: result.installPath,
    };
  } catch (error) {
    logger.error('Install package failed', { error: error.message, packageId });
    throw error;
  }
}

/**
 * Uninstall a package
 * @param {string} packageId - Package ID
 * @returns {Promise<Object>} Uninstallation result
 */
export async function uninstallPackage(packageId) {
  try {
    const db = database.getDatabase();

    // Get latest installation
    const installation = db
      .prepare('SELECT * FROM installations WHERE package_id = ? AND status = "installed" ORDER BY installed_at DESC LIMIT 1')
      .get(packageId);

    if (!installation) {
      throw new Error(`Package not installed: ${packageId}`);
    }

    // Perform uninstallation
    const result = await installationService.uninstall(installation);

    // Update installation status
    if (result.success) {
      db.prepare('UPDATE installations SET status = "uninstalled" WHERE id = ?').run(installation.id);

      // Notify AI Bridge
      await notifyAIBridge('package.uninstalled', { packageId, installationId: installation.id });

      logger.info('Package uninstalled successfully', { packageId, installationId: installation.id });
    }

    return {
      packageId,
      success: result.success,
      error: result.error,
    };
  } catch (error) {
    logger.error('Uninstall package failed', { error: error.message, packageId });
    throw error;
  }
}

/**
 * Rate a package
 * @param {string} packageId - Package ID
 * @param {string} userId - User ID
 * @param {number} rating - Rating (1-5)
 * @param {string} review - Review text (optional)
 * @returns {Promise<Object>} Rating result
 */
export async function ratePackage(packageId, userId, rating, review = null) {
  try {
    const db = database.getDatabase();

    const ratingId = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    // Insert or update rating
    db.prepare(`
      INSERT INTO ratings (id, package_id, user_id, rating, review, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(package_id, user_id) DO UPDATE SET
        rating = excluded.rating,
        review = excluded.review,
        updated_at = excluded.updated_at
    `).run(ratingId, packageId, userId, rating, review, now, now);

    // Recalculate package average rating
    const { avgRating, count } = db.prepare(`
      SELECT AVG(rating) as avgRating, COUNT(*) as count
      FROM ratings
      WHERE package_id = ?
    `).get(packageId);

    db.prepare(`
      UPDATE packages
      SET rating = ?, rating_count = ?
      WHERE id = ?
    `).run(avgRating, count, packageId);

    // Notify AI Bridge
    await notifyAIBridge('package.rated', { packageId, userId, rating, review });

    logger.info('Package rated successfully', { packageId, userId, rating });

    return {
      ratingId,
      packageId,
      userId,
      rating,
      review,
      avgRating,
      totalRatings: count,
    };
  } catch (error) {
    logger.error('Rate package failed', { error: error.message, packageId });
    throw error;
  }
}

/**
 * Get package statistics
 * @param {string} packageId - Package ID
 * @returns {Promise<Object>} Package statistics
 */
export async function getPackageStats(packageId) {
  try {
    const db = database.getDatabase();

    const stats = {
      downloads: 0,
      installations: 0,
      activeInstallations: 0,
      rating: 0,
      ratingCount: 0,
      downloadHistory: [],
    };

    // Get package data
    const pkg = db.prepare('SELECT downloads, rating, rating_count FROM packages WHERE id = ?').get(packageId);
    if (pkg) {
      stats.downloads = pkg.downloads;
      stats.rating = pkg.rating;
      stats.ratingCount = pkg.rating_count;
    }

    // Get installation stats
    const installStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'installed' THEN 1 ELSE 0 END) as active
      FROM installations
      WHERE package_id = ?
    `).get(packageId);

    stats.installations = installStats.total;
    stats.activeInstallations = installStats.active;

    // Get download history (last 30 days)
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
    const downloadHistory = db.prepare(`
      SELECT DATE(downloaded_at, 'unixepoch') as date, COUNT(*) as count
      FROM download_stats
      WHERE package_id = ? AND downloaded_at >= ?
      GROUP BY date
      ORDER BY date DESC
    `).all(packageId, thirtyDaysAgo);

    stats.downloadHistory = downloadHistory;

    return stats;
  } catch (error) {
    logger.error('Get package stats failed', { error: error.message, packageId });
    throw error;
  }
}

/**
 * Parse JSON fields in package object
 * @param {Object} pkg - Package object with JSON strings
 * @returns {Object} Package with parsed JSON
 */
function parsePackageJson(pkg) {
  if (!pkg) return pkg;

  try {
    return {
      ...pkg,
      tags: pkg.tags ? JSON.parse(pkg.tags) : [],
      screenshots: pkg.screenshots ? JSON.parse(pkg.screenshots) : [],
      config: pkg.config ? JSON.parse(pkg.config) : {},
    };
  } catch (error) {
    logger.warn('Failed to parse package JSON fields', { id: pkg.id, error: error.message });
    return pkg;
  }
}
