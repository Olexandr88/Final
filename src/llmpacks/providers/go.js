/**
 * Go provider for LLMPacks
 * Handles Go module projects
 *
 * @module llmpacks/providers/go
 */

import { logger } from '../../utils/logger.js';

export class GoProvider {
  constructor(options) {
    this.projectPath = options.projectPath;
    this.detected = options.detected;
    this.config = options.config || {};
  }

  /**
   * Generate build plan for Go project
   * @returns {Promise<Object>} Build plan
   */
  async generatePlan() {
    logger.debug('Generating Go build plan', {
      version: this.detected.version
    });

    const plan = {
      provider: 'go',
      version: this.detected.version || '1.21',
      systemDependencies: [],
      phases: [
        {
          name: 'install',
          commands: ['go mod download'],
          cacheDirectories: ['/go/pkg/mod'],
          environment: {
            CGO_ENABLED: '0',
            GOOS: 'linux'
          }
        },
        {
          name: 'build',
          commands: ['go build -o app .'],
          environment: {
            CGO_ENABLED: '0',
            GOOS: 'linux'
          }
        },
        {
          name: 'start',
          command: './app',
          port: 8080,
          environment: {}
        }
      ]
    };

    return plan;
  }
}

export default GoProvider;
