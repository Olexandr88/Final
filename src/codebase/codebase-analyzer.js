/**
 * Whole-Codebase Reasoning Integration
 * Implements the Vibe Coding pattern for comprehensive code analysis
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { FileContentCache } from '../utils/optimized-cache.js';
import { globalPerformanceMonitor } from '../utils/performance-monitor.js';
import { WorkerPool } from '../utils/worker-pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class CodebaseAnalyzer {
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.ignorePatterns = options.ignorePatterns || [
      'node_modules',
      '.git',
      'dist',
      'build',
      'coverage',
      '.next',
      '.cache'
    ];
    this.fileIndex = new Map();
    this.dependencyGraph = new Map();
    this.metrics = {
      totalFiles: 0,
      totalLines: 0,
      languages: {}
    };

    // Add file content cache for better performance
    this.fileContentCache = new FileContentCache({
      maxSize: 1000,        // Cache up to 1000 files
      maxMemory: 100000,    // 100MB max
      ttl: 600000           // 10 minutes TTL
    });

    // Add worker pool for CPU-intensive analysis (optional)
    this.useWorkerPool = options.useWorkerPool !== false;
    if (this.useWorkerPool) {
      const workerPath = path.join(__dirname, '../workers/code-analysis-worker.js');
      this.workerPool = new WorkerPool(workerPath, {
        poolSize: options.workerPoolSize || 4
      });
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.workerPool) {
      await this.workerPool.terminate();
    }
  }

  /**
   * Index entire codebase
   */
  async indexCodebase() {
    console.log('Indexing codebase...');

    this.fileIndex.clear();
    this.metrics = { totalFiles: 0, totalLines: 0, languages: {} };

    await this._indexDirectory(this.rootDir);

    console.log(`✓ Indexed ${this.metrics.totalFiles} files (${this.metrics.totalLines} lines)`);

    return {
      files: this.fileIndex,
      metrics: this.metrics
    };
  }

  /**
   * Recursively index directory
   */
  async _indexDirectory(dir) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });

    // Parallelize directory and file processing
    const tasks = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(this.rootDir, fullPath);

      // Skip ignored patterns
      if (this._shouldIgnore(relativePath)) continue;

      if (entry.isDirectory()) {
        tasks.push(this._indexDirectory(fullPath));
      } else if (entry.isFile()) {
        tasks.push(this._indexFile(fullPath, relativePath));
      }
    }

    // Execute all tasks in parallel with controlled concurrency
    await Promise.all(tasks);
  }

  /**
   * Index individual file
   */
  async _indexFile(fullPath, relativePath) {
    return globalPerformanceMonitor.timeAsync('indexFile', async () => {
      try {
        const stats = await fs.promises.stat(fullPath);
        const mtime = stats.mtime.getTime();
        const cacheKey = this.fileContentCache.generateKey(fullPath, mtime);

        // Try to get from cache first
        const cached = this.fileContentCache.get(cacheKey);
        if (cached) {
          this.fileIndex.set(relativePath, cached);
          this.metrics.totalFiles++;
          this.metrics.totalLines += cached.lines;
          this.metrics.languages[cached.extension] = (this.metrics.languages[cached.extension] || 0) + 1;
          return;
        }

        // Not in cache, read and parse
        const content = await fs.promises.readFile(fullPath, 'utf-8');
        const lines = content.split('\n').length;
        const ext = path.extname(fullPath);

        const fileData = {
          path: relativePath,
          fullPath,
          extension: ext,
          size: content.length,
          lines,
          lastModified: stats.mtime,
          imports: this._extractImports(content, ext),
          exports: this._extractExports(content, ext),
          functions: this._extractFunctions(content, ext),
          classes: this._extractClasses(content, ext)
        };

        // Store in cache
        this.fileContentCache.set(cacheKey, fileData);
        this.fileIndex.set(relativePath, fileData);

        // Update metrics
        this.metrics.totalFiles++;
        this.metrics.totalLines += lines;
        this.metrics.languages[ext] = (this.metrics.languages[ext] || 0) + 1;
      } catch (error) {
        // Skip binary or unreadable files
      }
    });
  }

  /**
   * Extract imports from file content
   */
  _extractImports(content, ext) {
    const imports = [];

    if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
      // ES6 imports
      const importRegex = /import\s+(?:{[^}]*}|[\w*]+)\s+from\s+['"]([^'"]+)['"]/g;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }

      // CommonJS requires
      const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
      while ((match = requireRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }
    } else if (ext === '.py') {
      // Python imports
      const pyImportRegex = /from\s+([\w.]+)\s+import|import\s+([\w.]+)/g;
      let match;
      while ((match = pyImportRegex.exec(content)) !== null) {
        imports.push(match[1] || match[2]);
      }
    }

    return imports;
  }

  /**
   * Extract exports from file content
   */
  _extractExports(content, ext) {
    const exports = [];

    if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
      // Named exports
      const namedExportRegex = /export\s+(?:const|let|var|function|class)\s+([\w]+)/g;
      let match;
      while ((match = namedExportRegex.exec(content)) !== null) {
        exports.push(match[1]);
      }

      // Default export
      if (/export\s+default/.test(content)) {
        exports.push('default');
      }
    }

    return exports;
  }

  /**
   * Extract function definitions
   */
  _extractFunctions(content, ext) {
    const functions = [];

    if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
      // Function declarations
      const fnRegex = /function\s+([\w]+)\s*\(/g;
      let match;
      while ((match = fnRegex.exec(content)) !== null) {
        functions.push(match[1]);
      }

      // Arrow functions assigned to const
      const arrowRegex = /const\s+([\w]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g;
      while ((match = arrowRegex.exec(content)) !== null) {
        functions.push(match[1]);
      }
    } else if (ext === '.py') {
      // Python functions
      const pyFnRegex = /def\s+([\w]+)\s*\(/g;
      let match;
      while ((match = pyFnRegex.exec(content)) !== null) {
        functions.push(match[1]);
      }
    }

    return functions;
  }

  /**
   * Extract class definitions
   */
  _extractClasses(content, ext) {
    const classes = [];

    if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
      const classRegex = /class\s+([\w]+)/g;
      let match;
      while ((match = classRegex.exec(content)) !== null) {
        classes.push(match[1]);
      }
    } else if (ext === '.py') {
      const pyClassRegex = /class\s+([\w]+):/g;
      let match;
      while ((match = pyClassRegex.exec(content)) !== null) {
        classes.push(match[1]);
      }
    }

    return classes;
  }

  /**
   * Build dependency graph
   */
  async buildDependencyGraph() {
    console.log('Building dependency graph...');

    this.dependencyGraph.clear();

    for (const [filePath, fileData] of this.fileIndex) {
      const dependencies = [];

      for (const importPath of fileData.imports) {
        // Resolve relative imports
        if (importPath.startsWith('.')) {
          const resolvedPath = path.normalize(
            path.join(path.dirname(filePath), importPath)
          );

          // Try common extensions
          for (const ext of ['.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.ts']) {
            const fullPath = resolvedPath + ext;
            if (this.fileIndex.has(fullPath)) {
              dependencies.push(fullPath);
              break;
            }
          }
        }
      }

      this.dependencyGraph.set(filePath, dependencies);
    }

    console.log(`✓ Built dependency graph for ${this.dependencyGraph.size} files`);

    return this.dependencyGraph;
  }

  /**
   * Find files by pattern
   */
  findFiles(pattern) {
    const regex = new RegExp(pattern, 'i');
    const results = [];

    for (const [filePath, fileData] of this.fileIndex) {
      if (regex.test(filePath) || regex.test(fileData.fullPath)) {
        results.push(fileData);
      }
    }

    return results;
  }

  /**
   * Find files containing function/class
   */
  findDefinition(name) {
    const results = [];

    for (const [filePath, fileData] of this.fileIndex) {
      if (
        fileData.functions.includes(name) ||
        fileData.classes.includes(name)
      ) {
        results.push({
          file: filePath,
          type: fileData.functions.includes(name) ? 'function' : 'class'
        });
      }
    }

    return results;
  }

  /**
   * Find files that import a module
   */
  findUsages(modulePath) {
    const results = [];

    for (const [filePath, fileData] of this.fileIndex) {
      if (fileData.imports.some(imp => imp.includes(modulePath))) {
        results.push(filePath);
      }
    }

    return results;
  }

  /**
   * Get file dependencies (recursive)
   */
  getDependencies(filePath, recursive = false) {
    const deps = this.dependencyGraph.get(filePath) || [];

    if (!recursive) {
      return deps;
    }

    // Recursive dependency collection
    const allDeps = new Set(deps);
    const visited = new Set([filePath]);

    const collect = (file) => {
      const fileDeps = this.dependencyGraph.get(file) || [];

      for (const dep of fileDeps) {
        if (!visited.has(dep)) {
          visited.add(dep);
          allDeps.add(dep);
          collect(dep);
        }
      }
    };

    for (const dep of deps) {
      collect(dep);
    }

    return Array.from(allDeps);
  }

  /**
   * Get codebase statistics
   */
  getStatistics() {
    const stats = {
      ...this.metrics,
      filesByLanguage: {},
      largestFiles: [],
      mostImported: []
    };

    // Files by language
    for (const [ext, count] of Object.entries(this.metrics.languages)) {
      stats.filesByLanguage[ext] = {
        count,
        percentage: Math.round((count / this.metrics.totalFiles) * 100)
      };
    }

    // Largest files
    const filesBySize = Array.from(this.fileIndex.values())
      .sort((a, b) => b.lines - a.lines)
      .slice(0, 10);

    stats.largestFiles = filesBySize.map(f => ({
      path: f.path,
      lines: f.lines,
      size: f.size
    }));

    // Most imported files
    const importCounts = new Map();
    for (const deps of this.dependencyGraph.values()) {
      for (const dep of deps) {
        importCounts.set(dep, (importCounts.get(dep) || 0) + 1);
      }
    }

    stats.mostImported = Array.from(importCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([file, count]) => ({ file, importCount: count }));

    return stats;
  }

  /**
   * Generate codebase summary report
   */
  generateReport() {
    const stats = this.getStatistics();

    let report = '# Codebase Analysis Report\n\n';
    report += `**Generated:** ${new Date().toLocaleString()}\n\n`;
    report += `## Overview\n\n`;
    report += `- **Total Files:** ${stats.totalFiles}\n`;
    report += `- **Total Lines:** ${stats.totalLines.toLocaleString()}\n`;
    report += `- **Languages:** ${Object.keys(stats.languages).length}\n\n`;

    report += `## Files by Language\n\n`;
    for (const [ext, data] of Object.entries(stats.filesByLanguage)) {
      report += `- ${ext || 'no extension'}: ${data.count} files (${data.percentage}%)\n`;
    }
    report += '\n';

    report += `## Largest Files\n\n`;
    for (const file of stats.largestFiles) {
      report += `- ${file.path}: ${file.lines} lines\n`;
    }
    report += '\n';

    report += `## Most Imported Files\n\n`;
    for (const item of stats.mostImported) {
      report += `- ${item.file}: imported ${item.importCount} times\n`;
    }
    report += '\n';

    return report;
  }

  /**
   * Deep analysis using worker pool (CPU-intensive)
   * @param {string} filePath - File to analyze
   * @returns {Promise<Object>} Detailed analysis results
   */
  async analyzeFileDeep(filePath) {
    if (!this.workerPool) {
      throw new Error('Worker pool not initialized. Set useWorkerPool: true in constructor');
    }

    return globalPerformanceMonitor.timeAsync('analyzeFileDeep', async () => {
      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(this.rootDir, filePath);

      const content = fs.readFileSync(fullPath, 'utf-8');
      const ext = path.extname(fullPath).slice(1);

      // Delegate to worker pool for CPU-intensive analysis
      const result = await this.workerPool.execute({
        code: content,
        language: ext || 'javascript',
        filePath
      });

      return result;
    });
  }

  /**
   * Batch deep analysis of multiple files
   * @param {string[]} filePaths - Files to analyze
   * @returns {Promise<Object[]>} Array of analysis results
   */
  async analyzeFilesBatch(filePaths) {
    if (!this.workerPool) {
      throw new Error('Worker pool not initialized. Set useWorkerPool: true in constructor');
    }

    const analyses = await Promise.all(
      filePaths.map(filePath => this.analyzeFileDeep(filePath))
    );

    return analyses;
  }

  /**
   * Get worker pool statistics
   */
  getWorkerPoolStats() {
    if (!this.workerPool) {
      return { enabled: false };
    }

    return {
      enabled: true,
      ...this.workerPool.getStats()
    };
  }

  /**
   * Check if path should be ignored
   */
  _shouldIgnore(relativePath) {
    return this.ignorePatterns.some(pattern => relativePath.includes(pattern));
  }
}

export default CodebaseAnalyzer;
