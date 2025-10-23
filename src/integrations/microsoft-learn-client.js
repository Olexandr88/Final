import fetch from 'node-fetch';
import NodeCache from 'node-cache';
import { logger } from '../utils/logger.js';

/**
 * Microsoft Learn Catalog API Client
 * @module microsoft-learn-client
 * @see https://learn.microsoft.com/api/catalog/
 */

const BASE_URL = 'https://learn.microsoft.com/api/catalog/';
const DEFAULT_LOCALE = 'en-us';
const CACHE_TTL = 12 * 60 * 60; // 12 hours in seconds
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff in ms
const REQUEST_TIMEOUT = 30000; // 30 seconds

export class MicrosoftLearnClient {
  constructor() {
    this.cache = new NodeCache({ stdTTL: CACHE_TTL, checkperiod: 600 });
    this.baseUrl = BASE_URL;
    logger.info('MicrosoftLearnClient initialized', { cacheTTL: CACHE_TTL });
  }

  /**
   * Perform HTTP request with exponential backoff retry logic
   * @private
   * @param {string} endpoint - API endpoint path
   * @param {Object} params - Query parameters
   * @param {number} attempt - Current retry attempt (1-indexed)
   * @returns {Promise<Object>} API response data
   */
  async _makeRequest(endpoint, params = {}, attempt = 1) {
    const url = new URL(endpoint, this.baseUrl);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value);
      }
    });

    const cacheKey = url.toString();
    const cached = this.cache.get(cacheKey);
    if (cached) {
      logger.debug('Cache hit', { endpoint, cacheKey });
      return cached;
    }

    try {
      logger.debug('Making API request', { endpoint, params, attempt });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      const response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'LLM-Framework/2.1.1 (Training Catalog Integration)',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      this.cache.set(cacheKey, data);

      logger.info('API request successful', {
        endpoint,
        itemCount: data.modules?.length || data.learningPaths?.length || 0,
        attempt
      });

      return data;
    } catch (error) {
      logger.warn('API request failed', {
        endpoint,
        attempt,
        error: error.message
      });

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt - 1];
        logger.info('Retrying request', { endpoint, attempt: attempt + 1, delayMs: delay });
        await new Promise(resolve => setTimeout(resolve, delay));
        return this._makeRequest(endpoint, params, attempt + 1);
      }

      logger.error('API request failed after max retries', {
        endpoint,
        attempts: MAX_RETRIES,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Fetch all training modules
   * @param {Object} filters - Query filters
   * @param {string} [filters.locale] - Content locale (default: 'en-us')
   * @param {string} [filters.level] - Difficulty level (beginner, intermediate, advanced)
   * @param {string} [filters.role] - Target role (e.g., 'developer', 'administrator')
   * @param {string} [filters.product] - Product filter (e.g., 'azure', 'github')
   * @param {string} [filters.subject] - Subject area (e.g., 'app-development', 'ai')
   * @param {string} [filters.last_modified] - ISO timestamp for incremental sync
   * @returns {Promise<Array>} Training modules
   */
  async fetchModules(filters = {}) {
    try {
      const params = {
        locale: filters.locale || DEFAULT_LOCALE,
        type: 'modules',
        ...filters,
      };

      const response = await this._makeRequest('', params);
      return response.modules || [];
    } catch (error) {
      logger.error('Failed to fetch modules', { filters, error: error.message });
      throw new Error(`Failed to fetch modules: ${error.message}`);
    }
  }

  /**
   * Fetch all learning paths
   * @param {Object} filters - Query filters
   * @returns {Promise<Array>} Learning paths
   */
  async fetchLearningPaths(filters = {}) {
    try {
      const params = {
        locale: filters.locale || DEFAULT_LOCALE,
        type: 'learningPaths',
        ...filters,
      };

      const response = await this._makeRequest('', params);
      return response.learningPaths || [];
    } catch (error) {
      logger.error('Failed to fetch learning paths', { filters, error: error.message });
      throw new Error(`Failed to fetch learning paths: ${error.message}`);
    }
  }

  /**
   * Fetch all certifications
   * @param {Object} filters - Query filters
   * @returns {Promise<Array>} Certifications
   */
  async fetchCertifications(filters = {}) {
    try {
      const params = {
        locale: filters.locale || DEFAULT_LOCALE,
        type: 'certifications',
        ...filters,
      };

      const response = await this._makeRequest('', params);
      return response.certifications || [];
    } catch (error) {
      logger.error('Failed to fetch certifications', { filters, error: error.message });
      throw new Error(`Failed to fetch certifications: ${error.message}`);
    }
  }

  /**
   * Fetch all exams
   * @param {Object} filters - Query filters
   * @returns {Promise<Array>} Exams
   */
  async fetchExams(filters = {}) {
    try {
      const params = {
        locale: filters.locale || DEFAULT_LOCALE,
        type: 'exams',
        ...filters,
      };

      const response = await this._makeRequest('', params);
      return response.exams || [];
    } catch (error) {
      logger.error('Failed to fetch exams', { filters, error: error.message });
      throw new Error(`Failed to fetch exams: ${error.message}`);
    }
  }

  /**
   * Fetch content updated since a specific timestamp (incremental sync)
   * @param {string} timestamp - ISO 8601 timestamp
   * @param {Object} filters - Additional filters
   * @returns {Promise<Object>} Object with modules, paths, certifications, exams arrays
   */
  async fetchUpdatedSince(timestamp, filters = {}) {
    try {
      logger.info('Fetching incremental updates', { since: timestamp });

      const [modules, paths, certifications, exams] = await Promise.all([
        this.fetchModules({ ...filters, last_modified: timestamp }),
        this.fetchLearningPaths({ ...filters, last_modified: timestamp }),
        this.fetchCertifications({ ...filters, last_modified: timestamp }),
        this.fetchExams({ ...filters, last_modified: timestamp }),
      ]);

      const totalUpdates = modules.length + paths.length + certifications.length + exams.length;
      logger.info('Incremental sync complete', {
        modules: modules.length,
        paths: paths.length,
        certifications: certifications.length,
        exams: exams.length,
        total: totalUpdates
      });

      return { modules, paths, certifications, exams };
    } catch (error) {
      logger.error('Incremental sync failed', { timestamp, error: error.message });
      throw new Error(`Incremental sync failed: ${error.message}`);
    }
  }

  /**
   * Fetch all content (FULL sync)
   * @param {Object} filters - Query filters
   * @returns {Promise<Object>} Object with modules, paths, certifications, exams arrays
   */
  async fetchAll(filters = {}) {
    try {
      logger.info('Starting full catalog sync', { filters });

      const [modules, paths, certifications, exams] = await Promise.all([
        this.fetchModules(filters),
        this.fetchLearningPaths(filters),
        this.fetchCertifications(filters),
        this.fetchExams(filters),
      ]);

      const totalItems = modules.length + paths.length + certifications.length + exams.length;
      logger.info('Full catalog sync complete', {
        modules: modules.length,
        paths: paths.length,
        certifications: certifications.length,
        exams: exams.length,
        total: totalItems
      });

      return { modules, paths, certifications, exams };
    } catch (error) {
      logger.error('Full catalog sync failed', { error: error.message });
      throw new Error(`Full catalog sync failed: ${error.message}`);
    }
  }

  /**
   * Clear all cached data
   */
  clearCache() {
    const keys = this.cache.keys();
    this.cache.flushAll();
    logger.info('Cache cleared', { keysCleared: keys.length });
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats (keys, hits, misses, hit rate)
   */
  getCacheStats() {
    const stats = this.cache.getStats();
    const hitRate = stats.hits / (stats.hits + stats.misses) || 0;
    return {
      keys: stats.keys,
      hits: stats.hits,
      misses: stats.misses,
      hitRate: (hitRate * 100).toFixed(2) + '%',
    };
  }
}

export default MicrosoftLearnClient;
