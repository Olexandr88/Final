/**
 * Python provider for LLMPacks
 * Handles pip, pipenv, and poetry projects
 *
 * @module llmpacks/providers/python
 */

import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logger.js';

export class PythonProvider {
  constructor(options) {
    this.projectPath = options.projectPath;
    this.detected = options.detected;
    this.config = options.config || {};
  }

  /**
   * Detect Python package manager
   * @returns {Promise<string>} Package manager (pip, pipenv, poetry)
   */
  async detectPackageManager() {
    const checks = [
      { file: 'poetry.lock', manager: 'poetry' },
      { file: 'Pipfile.lock', manager: 'pipenv' },
      { file: 'requirements.txt', manager: 'pip' }
    ];

    for (const { file, manager } of checks) {
      try {
        await fs.access(path.join(this.projectPath, file));
        return manager;
      } catch {
        continue;
      }
    }

    return 'pip';
  }

  /**
   * Generate build plan for Python project
   * @returns {Promise<Object>} Build plan
   */
  async generatePlan() {
    const packageManager = await this.detectPackageManager();

    logger.debug('Generating Python build plan', {
      packageManager,
      version: this.detected.version
    });

    const installCommands = {
      pip: ['pip install --no-cache-dir -r requirements.txt'],
      pipenv: ['pipenv install --deploy'],
      poetry: ['poetry install --no-dev']
    };

    const plan = {
      provider: 'python',
      version: this.detected.version || '3.11',
      packageManager,
      systemDependencies: [],
      phases: [
        {
          name: 'install',
          commands: installCommands[packageManager] || installCommands.pip,
          cacheDirectories: ['.venv', '__pycache__'],
          environment: {
            PYTHONUNBUFFERED: '1',
            PIP_NO_CACHE_DIR: '1'
          }
        },
        {
          name: 'start',
          command: 'python main.py',
          port: 8000,
          environment: {
            PYTHONUNBUFFERED: '1'
          }
        }
      ]
    };

    return plan;
  }
}

export default PythonProvider;
