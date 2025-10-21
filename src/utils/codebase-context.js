import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Whole-Codebase Reasoning System
 * Automatically ingests entire project as context
 */
export class CodebaseContext {
  constructor(options = {}) {
    this.rootPath = options.rootPath || process.cwd();
    this.maxFileSize = options.maxFileSize || 1024 * 1024; // 1MB
    this.excludePatterns = options.excludePatterns || [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/.cache/**',
      '**/coverage/**',
      '**/*.log',
      '**/package-lock.json',
    ];
    this.fileIndex = new Map();
    this.dependencyGraph = new Map();
    this.projectStructure = null;
  }

  /**
   * Ingest entire codebase
   */
  async ingestCodebase() {
    console.log('Ingesting codebase...');

    // Build file index
    await this.buildFileIndex();

    // Analyze dependencies
    await this.analyzeDependencies();

    // Build project structure
    this.projectStructure = await this.buildProjectStructure();

    console.log(`Indexed ${this.fileIndex.size} files`);

    return {
      fileCount: this.fileIndex.size,
      structure: this.projectStructure,
    };
  }

  /**
   * Build file index
   */
  async buildFileIndex() {
    const patterns = ['**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx', '**/*.json', '**/*.md'];

    for (const pattern of patterns) {
      const files = await glob(pattern, {
        cwd: this.rootPath,
        ignore: this.excludePatterns,
        absolute: true,
      });

      for (const file of files) {
        try {
          const stats = await fs.stat(file);

          // Skip large files
          if (stats.size > this.maxFileSize) continue;

          const content = await fs.readFile(file, 'utf-8');
          const relativePath = path.relative(this.rootPath, file);

          this.fileIndex.set(relativePath, {
            path: file,
            relativePath,
            content,
            size: stats.size,
            modified: stats.mtime,
            type: this.getFileType(file),
          });
        } catch (err) {
          console.warn(`Failed to index ${file}:`, err.message);
        }
      }
    }
  }

  /**
   * Analyze dependencies between files
   */
  async analyzeDependencies() {
    for (const [filePath, fileInfo] of this.fileIndex) {
      const deps = this.extractDependencies(fileInfo.content, fileInfo.type);
      this.dependencyGraph.set(filePath, deps);
    }
  }

  /**
   * Extract import/require statements
   */
  extractDependencies(content, fileType) {
    const deps = [];

    if (fileType === 'javascript' || fileType === 'typescript') {
      // ES6 imports
      const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        deps.push({ type: 'import', module: match[1] });
      }

      // CommonJS require
      const requireRegex = /require\s*\(['"]([^'"]+)['"]\)/g;
      while ((match = requireRegex.exec(content)) !== null) {
        deps.push({ type: 'require', module: match[1] });
      }
    }

    return deps;
  }

  /**
   * Build project structure tree
   */
  async buildProjectStructure() {
    const structure = {
      name: path.basename(this.rootPath),
      type: 'directory',
      children: new Map(),
    };

    for (const relativePath of this.fileIndex.keys()) {
      const parts = relativePath.split(path.sep);
      let current = structure;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isFile = i === parts.length - 1;

        if (!current.children.has(part)) {
          current.children.set(part, {
            name: part,
            type: isFile ? 'file' : 'directory',
            path: parts.slice(0, i + 1).join(path.sep),
            children: isFile ? null : new Map(),
          });
        }

        if (!isFile) {
          current = current.children.get(part);
        }
      }
    }

    return this.convertMapToObject(structure);
  }

  /**
   * Convert Map structure to plain object
   */
  convertMapToObject(node) {
    if (node.type === 'file') {
      return {
        name: node.name,
        type: 'file',
        path: node.path,
      };
    }

    return {
      name: node.name,
      type: 'directory',
      path: node.path,
      children: Array.from(node.children.values()).map((child) => this.convertMapToObject(child)),
    };
  }

  /**
   * Get file by path
   */
  getFile(relativePath) {
    return this.fileIndex.get(relativePath);
  }

  /**
   * Search files by pattern
   */
  searchFiles(pattern) {
    const regex = new RegExp(pattern, 'i');
    const results = [];

    for (const [path, info] of this.fileIndex) {
      if (regex.test(path) || regex.test(info.content)) {
        results.push({ path, info });
      }
    }

    return results;
  }

  /**
   * Get dependencies for file
   */
  getDependencies(relativePath) {
    return this.dependencyGraph.get(relativePath) || [];
  }

  /**
   * Get files that depend on this file
   */
  getDependents(relativePath) {
    const dependents = [];

    for (const [file, deps] of this.dependencyGraph) {
      const hasDep = deps.some((dep) => {
        const resolved = this.resolveDependency(dep.module, file);
        return resolved === relativePath;
      });

      if (hasDep) {
        dependents.push(file);
      }
    }

    return dependents;
  }

  /**
   * Resolve dependency path
   */
  resolveDependency(modulePath, fromFile) {
    // Relative import
    if (modulePath.startsWith('.')) {
      const fromDir = path.dirname(fromFile);
      const resolved = path.normalize(path.join(fromDir, modulePath));

      // Try with extensions
      for (const ext of ['.js', '.ts', '.jsx', '.tsx', '/index.js', '/index.ts']) {
        const withExt = resolved + ext;
        if (this.fileIndex.has(withExt)) {
          return withExt;
        }
      }

      return resolved;
    }

    // Node module
    return modulePath;
  }

  /**
   * Get file type from extension
   */
  getFileType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const typeMap = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.json': 'json',
      '.md': 'markdown',
    };
    return typeMap[ext] || 'unknown';
  }

  /**
   * Get context summary for LLM
   */
  getContextSummary() {
    return {
      totalFiles: this.fileIndex.size,
      structure: this.projectStructure,
      fileTypes: this.getFileTypeSummary(),
      dependencies: {
        totalFiles: this.dependencyGraph.size,
        avgDepsPerFile: this.getAverageDependencies(),
      },
    };
  }

  /**
   * Get file type summary
   */
  getFileTypeSummary() {
    const summary = {};

    for (const info of this.fileIndex.values()) {
      summary[info.type] = (summary[info.type] || 0) + 1;
    }

    return summary;
  }

  /**
   * Get average dependencies per file
   */
  getAverageDependencies() {
    if (this.dependencyGraph.size === 0) return 0;

    const total = Array.from(this.dependencyGraph.values()).reduce(
      (sum, deps) => sum + deps.length,
      0
    );

    return (total / this.dependencyGraph.size).toFixed(2);
  }

  /**
   * Refresh file in index
   */
  async refreshFile(relativePath) {
    const filePath = path.join(this.rootPath, relativePath);

    try {
      const stats = await fs.stat(filePath);
      const content = await fs.readFile(filePath, 'utf-8');

      this.fileIndex.set(relativePath, {
        path: filePath,
        relativePath,
        content,
        size: stats.size,
        modified: stats.mtime,
        type: this.getFileType(filePath),
      });

      // Update dependencies
      const deps = this.extractDependencies(content, this.getFileType(filePath));
      this.dependencyGraph.set(relativePath, deps);

      return true;
    } catch (err) {
      console.error(`Failed to refresh ${relativePath}:`, err);
      return false;
    }
  }
}

export default CodebaseContext;
