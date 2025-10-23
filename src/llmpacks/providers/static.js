/**
 * Static site provider for LLMPacks
 * Handles static HTML/CSS/JS sites
 *
 * @module llmpacks/providers/static
 */

import { logger } from '../../utils/logger.js';

export class StaticProvider {
  constructor(options) {
    this.projectPath = options.projectPath;
    this.detected = options.detected;
    this.config = options.config || {};
  }

  /**
   * Generate build plan for static site
   * @returns {Promise<Object>} Build plan
   */
  async generatePlan() {
    logger.debug('Generating static site build plan');

    const plan = {
      provider: 'static',
      version: 'nginx:alpine',
      systemDependencies: [],
      phases: [
        {
          name: 'start',
          command: 'nginx -g "daemon off;"',
          port: 80,
          environment: {
            NGINX_HOST: 'localhost',
            NGINX_PORT: '80'
          }
        }
      ],
      staticFiles: {
        source: '.',
        destination: '/usr/share/nginx/html'
      }
    };

    return plan;
  }
}

export default StaticProvider;
