/**
 * Configuration loader for LLMPacks
 * Loads and parses llmpacks.toml or nixpacks.toml configuration files
 *
 * @module llmpacks/config-loader
 */

import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';

/**
 * Simple TOML parser for basic key-value pairs
 * @param {string} content - TOML file content
 * @returns {Object} Parsed configuration
 */
function parseTOML(content) {
  const config = {
    variables: {},
    providers: [],
    phases: {},
    start: {}
  };

  let currentSection = null;
  let currentPhase = null;

  const lines = content.split('\n');

  for (let line of lines) {
    line = line.trim();

    // Skip comments and empty lines
    if (!line || line.startsWith('#')) {
      continue;
    }

    // Section headers
    if (line.startsWith('[') && line.endsWith(']')) {
      const section = line.slice(1, -1).trim();

      if (section === 'variables') {
        currentSection = 'variables';
        currentPhase = null;
      } else if (section === 'providers') {
        currentSection = 'providers';
        currentPhase = null;
      } else if (section === 'start') {
        currentSection = 'start';
        currentPhase = null;
      } else if (section.startsWith('phases.')) {
        currentSection = 'phases';
        currentPhase = section.replace('phases.', '');
        config.phases[currentPhase] = {};
      } else {
        currentSection = null;
        currentPhase = null;
      }
      continue;
    }

    // Key-value pairs
    const kvMatch = line.match(/^([^=]+)=(.+)$/);
    if (kvMatch) {
      let key = kvMatch[1].trim();
      let value = kvMatch[2].trim();

      // Remove quotes from string values
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // Parse arrays
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map(v => v.trim().replace(/['"]/g, ''));
      }

      // Parse booleans
      if (value === 'true') value = true;
      if (value === 'false') value = false;

      // Parse numbers
      if (/^\d+$/.test(value)) {
        value = parseInt(value, 10);
      }

      // Store in appropriate section
      if (currentSection === 'variables') {
        config.variables[key] = value;
      } else if (currentSection === 'start') {
        config.start[key] = value;
      } else if (currentSection === 'phases' && currentPhase) {
        config.phases[currentPhase][key] = value;
      } else if (currentSection === 'providers') {
        // Handle provider entries
        if (!config.providers[0]) {
          config.providers.push({});
        }
        config.providers[0][key] = value;
      }
    }
  }

  return config;
}

/**
 * Load configuration from llmpacks.toml or nixpacks.toml
 * @param {string} projectPath - Path to project directory
 * @returns {Promise<Object>} Configuration object
 */
export async function loadConfig(projectPath) {
  const configFiles = ['llmpacks.toml', 'nixpacks.toml'];

  for (const configFile of configFiles) {
    const configPath = path.join(projectPath, configFile);

    try {
      const content = await fs.readFile(configPath, 'utf-8');

      logger.debug('Found configuration file', {
        file: configFile,
        path: configPath
      });

      const config = parseTOML(content);

      logger.debug('Configuration parsed', {
        variables: Object.keys(config.variables).length,
        providers: config.providers.length,
        phases: Object.keys(config.phases).length
      });

      return config;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.warn('Error reading configuration file', {
          file: configFile,
          error: error.message
        });
      }
      // Continue to next file
    }
  }

  // No config file found
  logger.debug('No configuration file found, using defaults');
  return {};
}

/**
 * Validate configuration object
 * @param {Object} config - Configuration to validate
 * @returns {Object} Validation result with { valid, errors }
 */
export function validateConfig(config) {
  const errors = [];

  // Validate variables section
  if (config.variables && typeof config.variables !== 'object') {
    errors.push('variables must be an object');
  }

  // Validate providers section
  if (config.providers) {
    if (!Array.isArray(config.providers)) {
      errors.push('providers must be an array');
    } else {
      for (const [index, provider] of config.providers.entries()) {
        if (!provider.name) {
          errors.push(`providers[${index}] missing name`);
        }
      }
    }
  }

  // Validate phases section
  if (config.phases && typeof config.phases !== 'object') {
    errors.push('phases must be an object');
  }

  // Validate start section
  if (config.start) {
    if (typeof config.start !== 'object') {
      errors.push('start must be an object');
    }
    if (config.start.port && typeof config.start.port !== 'number') {
      errors.push('start.port must be a number');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Create example configuration file
 * @param {string} projectPath - Path to create config file in
 * @param {string} provider - Provider type
 * @returns {Promise<string>} Path to created file
 */
export async function createExampleConfig(projectPath, provider = 'nodejs') {
  const examples = {
    nodejs: `# LLMPacks Configuration
# https://github.com/Scarmonit/LLM

[variables]
NODE_ENV = "production"
PORT = 3000

[start]
command = "npm start"
port = 3000

[phases.build]
commands = ["npm run build"]
`,
    electron: `# LLMPacks Configuration for Electron
# https://github.com/Scarmonit/LLM

[variables]
NODE_ENV = "production"
ELECTRON_ENABLE_LOGGING = "true"

[phases.build]
commands = ["npm run build"]
environment = { NODE_ENV = "production" }

[start]
command = "xvfb-run --auto-servernum npm start"
`,
    python: `# LLMPacks Configuration for Python
# https://github.com/Scarmonit/LLM

[variables]
PYTHONUNBUFFERED = "1"
PORT = 8000

[phases.install]
commands = ["pip install -r requirements.txt"]

[start]
command = "python main.py"
port = 8000
`
  };

  const content = examples[provider] || examples.nodejs;
  const configPath = path.join(projectPath, 'llmpacks.toml');

  await fs.writeFile(configPath, content, 'utf-8');

  logger.info('Example configuration created', { path: configPath });

  return configPath;
}

export default loadConfig;
