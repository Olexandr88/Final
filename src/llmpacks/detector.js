/**
 * Language and framework detection engine
 * Inspired by Nixpacks provider detection system
 *
 * @module llmpacks/detector
 */

import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';

/**
 * Detection patterns for different project types
 */
const DETECTION_PATTERNS = {
  electron: {
    name: 'Electron',
    priority: 100,
    patterns: [
      { file: 'package.json', check: async (content) => {
        const pkg = JSON.parse(content);
        return pkg.dependencies?.electron || pkg.devDependencies?.electron;
      }},
      { file: 'electron-builder.yml', exists: true },
      { file: 'electron-builder.json', exists: true }
    ]
  },

  nodejs: {
    name: 'Node.js',
    priority: 80,
    patterns: [
      { file: 'package.json', exists: true },
      { file: 'package-lock.json', exists: true },
      { file: 'yarn.lock', exists: true },
      { file: 'pnpm-lock.yaml', exists: true }
    ]
  },

  python: {
    name: 'Python',
    priority: 70,
    patterns: [
      { file: 'requirements.txt', exists: true },
      { file: 'Pipfile', exists: true },
      { file: 'pyproject.toml', exists: true },
      { file: 'setup.py', exists: true },
      { file: 'poetry.lock', exists: true }
    ]
  },

  go: {
    name: 'Go',
    priority: 70,
    patterns: [
      { file: 'go.mod', exists: true },
      { file: 'go.sum', exists: true }
    ]
  },

  static: {
    name: 'Static Site',
    priority: 50,
    patterns: [
      { file: 'index.html', exists: true },
      { file: 'index.htm', exists: true }
    ]
  }
};

/**
 * Version detection for Node.js projects
 * @param {string} projectPath - Path to project
 * @returns {Promise<string|null>} Node version or null
 */
async function detectNodeVersion(projectPath) {
  try {
    const nvmrcPath = path.join(projectPath, '.nvmrc');
    const content = await fs.readFile(nvmrcPath, 'utf-8');
    return content.trim();
  } catch {
    // Check package.json engines
    try {
      const pkgPath = path.join(projectPath, 'package.json');
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
      return pkg.engines?.node || null;
    } catch {
      return null;
    }
  }
}

/**
 * Version detection for Python projects
 * @param {string} projectPath - Path to project
 * @returns {Promise<string|null>} Python version or null
 */
async function detectPythonVersion(projectPath) {
  try {
    const pythonVersionPath = path.join(projectPath, '.python-version');
    const content = await fs.readFile(pythonVersionPath, 'utf-8');
    return content.trim();
  } catch {
    // Check pyproject.toml
    try {
      const tomlPath = path.join(projectPath, 'pyproject.toml');
      const content = await fs.readFile(tomlPath, 'utf-8');
      const versionMatch = content.match(/python\s*=\s*"([^"]+)"/);
      return versionMatch ? versionMatch[1] : null;
    } catch {
      return null;
    }
  }
}

/**
 * Detect package manager for Node.js projects
 * @param {string} projectPath - Path to project
 * @returns {Promise<string>} Package manager (npm, yarn, pnpm)
 */
async function detectPackageManager(projectPath) {
  const checks = [
    { file: 'pnpm-lock.yaml', manager: 'pnpm' },
    { file: 'yarn.lock', manager: 'yarn' },
    { file: 'package-lock.json', manager: 'npm' }
  ];

  for (const { file, manager } of checks) {
    try {
      await fs.access(path.join(projectPath, file));
      return manager;
    } catch {
      continue;
    }
  }

  return 'npm'; // Default
}

/**
 * Check if a file exists and optionally validate content
 * @param {string} projectPath - Path to project
 * @param {Object} pattern - Detection pattern
 * @returns {Promise<boolean>} True if pattern matches
 */
async function checkPattern(projectPath, pattern) {
  const filePath = path.join(projectPath, pattern.file);

  try {
    await fs.access(filePath);

    // If pattern has a check function, validate content
    if (pattern.check) {
      const content = await fs.readFile(filePath, 'utf-8');
      return await pattern.check(content);
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Detect project language and framework
 * @param {string} projectPath - Path to project directory
 * @returns {Promise<Object>} Detection result with provider, version, confidence
 */
export async function detectLanguage(projectPath) {
  logger.debug('Starting language detection', { projectPath });

  const results = [];

  // Check each provider's patterns
  for (const [providerId, provider] of Object.entries(DETECTION_PATTERNS)) {
    let matchCount = 0;

    for (const pattern of provider.patterns) {
      const matches = await checkPattern(projectPath, pattern);
      if (matches) {
        matchCount++;
      }
    }

    if (matchCount > 0) {
      const confidence = (matchCount / provider.patterns.length) * 100;
      results.push({
        providerId,
        provider,
        confidence,
        matchCount
      });
    }
  }

  // Sort by priority then confidence
  results.sort((a, b) => {
    if (a.provider.priority !== b.provider.priority) {
      return b.provider.priority - a.provider.priority;
    }
    return b.confidence - a.confidence;
  });

  if (results.length === 0) {
    logger.warn('No provider detected', { projectPath });
    return null;
  }

  const detected = results[0];
  logger.debug('Provider detected', {
    provider: detected.providerId,
    confidence: detected.confidence.toFixed(2) + '%',
    matchCount: detected.matchCount
  });

  // Detect version based on provider
  let version = null;
  if (detected.providerId === 'nodejs' || detected.providerId === 'electron') {
    version = await detectNodeVersion(projectPath);
    detected.packageManager = await detectPackageManager(projectPath);
  } else if (detected.providerId === 'python') {
    version = await detectPythonVersion(projectPath);
  }

  return {
    provider: {
      id: detected.providerId,
      name: detected.provider.name
    },
    version: version || 'latest',
    confidence: detected.confidence,
    packageManager: detected.packageManager || null,
    detectedAt: new Date().toISOString()
  };
}

/**
 * List all detectable files in project
 * @param {string} projectPath - Path to project directory
 * @returns {Promise<Array<string>>} List of relevant files found
 */
export async function listDetectableFiles(projectPath) {
  const files = [];

  for (const provider of Object.values(DETECTION_PATTERNS)) {
    for (const pattern of provider.patterns) {
      try {
        await fs.access(path.join(projectPath, pattern.file));
        files.push(pattern.file);
      } catch {
        // File doesn't exist, continue
      }
    }
  }

  return files;
}

export default detectLanguage;
