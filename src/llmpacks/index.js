/**
 * LLMPacks - App source + Language Detection + Build Plans + Docker = Image
 * Inspired by Nixpacks v1.40.0 (Railway) + Cloud Native Buildpacks
 *
 * @module llmpacks
 */

import { detectLanguage } from './detector.js';
import { loadConfig } from './config-loader.js';
import { generateBuildPlan } from './build-plan.js';
import { buildDockerImage } from './docker-builder.js';
import { logger } from '../utils/logger.js';

export class LLMPacks {
  constructor(options = {}) {
    this.projectPath = options.projectPath || process.cwd();
    this.config = null;
    this.detected = null;
    this.buildPlan = null;
  }

  /**
   * Detect project language/framework
   */
  async detect() {
    logger.info('🔍 Detecting project type...', { path: this.projectPath });

    try {
      this.detected = await detectLanguage(this.projectPath);

      if (!this.detected || !this.detected.provider) {
        throw new Error('Could not detect project type');
      }

      logger.info(`✓ Detected: ${this.detected.provider.name}`, {
        confidence: this.detected.confidence,
        version: this.detected.version
      });

      return this.detected;
    } catch (error) {
      logger.error('Detection failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Load configuration from llmpacks.toml or nixpacks.toml
   */
  async loadConfiguration() {
    logger.info('📋 Loading configuration...');

    try {
      this.config = await loadConfig(this.projectPath);

      if (this.config && Object.keys(this.config).length > 0) {
        logger.info('✓ Configuration loaded', {
          providers: this.config.providers?.length || 0,
          customVars: Object.keys(this.config.variables || {}).length
        });
      } else {
        logger.info('Using auto-detected defaults (no config file)');
      }

      return this.config;
    } catch (error) {
      logger.warn('Config loading failed, using defaults', { error: error.message });
      this.config = {};
      return this.config;
    }
  }

  /**
   * Generate build plan
   */
  async plan() {
    if (!this.detected) {
      await this.detect();
    }

    if (!this.config) {
      await this.loadConfiguration();
    }

    logger.info('📝 Generating build plan...');

    try {
      this.buildPlan = await generateBuildPlan({
        projectPath: this.projectPath,
        detected: this.detected,
        config: this.config
      });

      logger.info('✓ Build plan generated', {
        phases: this.buildPlan.phases.length,
        cacheKey: this.buildPlan.cacheKey
      });

      return this.buildPlan;
    } catch (error) {
      logger.error('Build plan generation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Build Docker image
   */
  async build(options = {}) {
    if (!this.buildPlan) {
      await this.plan();
    }

    logger.info('🐳 Building Docker image...');

    try {
      const result = await buildDockerImage({
        projectPath: this.projectPath,
        buildPlan: this.buildPlan,
        imageName: options.imageName || 'llm-framework',
        tag: options.tag || 'latest',
        push: options.push || false
      });

      logger.info('✓ Docker image built', {
        image: result.imageName,
        size: result.size,
        layers: result.layers
      });

      return result;
    } catch (error) {
      logger.error('Docker build failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Complete end-to-end build
   */
  async buildAll(options = {}) {
    const startTime = Date.now();

    logger.info('🚀 Starting LLMPacks build...');

    try {
      await this.detect();
      await this.loadConfiguration();
      await this.plan();
      const result = await this.build(options);

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      logger.info(`✓ Build complete in ${duration}s`, {
        image: result.imageName,
        provider: this.detected.provider.name
      });

      return {
        detected: this.detected,
        config: this.config,
        buildPlan: this.buildPlan,
        image: result,
        duration
      };
    } catch (error) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      logger.error(`Build failed after ${duration}s`, { error: error.message });
      throw error;
    }
  }
}

export default LLMPacks;
