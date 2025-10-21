#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { statSync, readdirSync } from 'fs';

/**
 * File System Tools
 * Standalone utilities for file search, stats, and batch operations
 */

export class FileTools {
  /**
   * Search for files by pattern
   */
  static async searchFiles(directory, pattern, options = {}) {
    try {
      const {
        maxDepth = 3,
        matchContent = false,
        includeHidden = false
      } = options;

      const regex = new RegExp(pattern);
      const results = [];

      async function search(dir, depth) {
        if (depth > maxDepth) return;

        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (!includeHidden && entry.name.startsWith('.')) continue;

          if (entry.isDirectory()) {
            await search(fullPath, depth + 1);
          } else if (entry.isFile()) {
            if (regex.test(entry.name)) {
              const stats = await fs.stat(fullPath);
              results.push({
                path: fullPath,
                name: entry.name,
                size: stats.size,
                modified: stats.mtime
              });
            } else if (matchContent) {
              try {
                const content = await fs.readFile(fullPath, 'utf-8');
                if (regex.test(content)) {
                  results.push({
                    path: fullPath,
                    name: entry.name,
                    matchType: 'content'
                  });
                }
              } catch {
                // Skip files that can't be read as text
              }
            }
          }
        }
      }

      await search(directory, 0);

      return {
        success: true,
        pattern,
        directory,
        count: results.length,
        results
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get detailed file/directory statistics
   */
  static async getStats(targetPath, options = {}) {
    try {
      const { includeHidden = false, recursive = true } = options;

      const stats = await fs.stat(targetPath);
      const isDirectory = stats.isDirectory();

      const result = {
        path: targetPath,
        type: isDirectory ? 'directory' : 'file',
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime
      };

      if (isDirectory && recursive) {
        const entries = await fs.readdir(targetPath, { withFileTypes: true });
        let fileCount = 0;
        let dirCount = 0;
        let totalSize = 0;

        for (const entry of entries) {
          if (!includeHidden && entry.name.startsWith('.')) continue;

          if (entry.isFile()) {
            fileCount++;
            const filePath = path.join(targetPath, entry.name);
            const fileStats = await fs.stat(filePath);
            totalSize += fileStats.size;
          } else if (entry.isDirectory()) {
            dirCount++;
          }
        }

        result.contents = {
          files: fileCount,
          directories: dirCount,
          totalSize,
          totalSizeReadable: this._formatBytes(totalSize)
        };
      }

      result.sizeReadable = this._formatBytes(stats.size);

      return {
        success: true,
        result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Batch rename files
   */
  static async batchRename(directory, pattern, replacement, options = {}) {
    try {
      const { dryRun = false, recursive = false } = options;
      const regex = new RegExp(pattern);
      const renames = [];

      async function processDirectory(dir) {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const oldPath = path.join(dir, entry.name);

          if (entry.isDirectory() && recursive) {
            await processDirectory(oldPath);
          }

          if (regex.test(entry.name)) {
            const newName = entry.name.replace(regex, replacement);
            const newPath = path.join(dir, newName);

            renames.push({
              old: oldPath,
              new: newPath,
              oldName: entry.name,
              newName
            });

            if (!dryRun) {
              await fs.rename(oldPath, newPath);
            }
          }
        }
      }

      await processDirectory(directory);

      return {
        success: true,
        dryRun,
        count: renames.length,
        renames
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * List directory contents with details
   */
  static async listDirectory(directory, options = {}) {
    try {
      const { includeHidden = false, sortBy = 'name' } = options;

      const entries = await fs.readdir(directory, { withFileTypes: true });
      const results = [];

      for (const entry of entries) {
        if (!includeHidden && entry.name.startsWith('.')) continue;

        const fullPath = path.join(directory, entry.name);
        const stats = await fs.stat(fullPath);

        results.push({
          name: entry.name,
          path: fullPath,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: stats.size,
          sizeReadable: this._formatBytes(stats.size),
          modified: stats.mtime,
          extension: path.extname(entry.name)
        });
      }

      // Sort results
      results.sort((a, b) => {
        if (sortBy === 'size') return b.size - a.size;
        if (sortBy === 'modified') return b.modified - a.modified;
        return a.name.localeCompare(b.name);
      });

      return {
        success: true,
        directory,
        count: results.length,
        results
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Find duplicate files by content hash
   */
  static async findDuplicates(directory, options = {}) {
    try {
      const { maxDepth = 3 } = options;
      const crypto = await import('crypto');
      const hashes = new Map();
      const duplicates = [];

      async function processDir(dir, depth) {
        if (depth > maxDepth) return;

        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            await processDir(fullPath, depth + 1);
          } else if (entry.isFile()) {
            const content = await fs.readFile(fullPath);
            const hash = crypto.createHash('md5').update(content).digest('hex');

            if (hashes.has(hash)) {
              const existing = hashes.get(hash);
              duplicates.push({
                hash,
                files: [existing, fullPath]
              });
            } else {
              hashes.set(hash, fullPath);
            }
          }
        }
      }

      await processDir(directory, 0);

      return {
        success: true,
        directory,
        duplicateGroups: duplicates.length,
        duplicates
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Helper method
  static _formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

// CLI Interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const [,, command, ...args] = process.argv;

  const commands = {
    'search': async () => {
      const [directory, pattern, maxDepth] = args;
      const result = await FileTools.searchFiles(directory, pattern, {
        maxDepth: maxDepth ? parseInt(maxDepth) : 3
      });
      console.log(JSON.stringify(result, null, 2));
    },
    'stats': async () => {
      const [targetPath] = args;
      const result = await FileTools.getStats(targetPath);
      console.log(JSON.stringify(result, null, 2));
    },
    'rename': async () => {
      const [directory, pattern, replacement, dryRun] = args;
      const result = await FileTools.batchRename(directory, pattern, replacement, {
        dryRun: dryRun !== 'false'
      });
      console.log(JSON.stringify(result, null, 2));
    },
    'list': async () => {
      const [directory, sortBy] = args;
      const result = await FileTools.listDirectory(directory, { sortBy });
      console.log(JSON.stringify(result, null, 2));
    },
    'duplicates': async () => {
      const [directory, maxDepth] = args;
      const result = await FileTools.findDuplicates(directory, {
        maxDepth: maxDepth ? parseInt(maxDepth) : 3
      });
      console.log(JSON.stringify(result, null, 2));
    }
  };

  if (commands[command]) {
    commands[command]();
  } else {
    console.log('File Tools - Available commands:');
    console.log('  search <directory> <pattern> [maxDepth]');
    console.log('  stats <path>');
    console.log('  rename <directory> <pattern> <replacement> [dryRun]');
    console.log('  list <directory> [sortBy]');
    console.log('  duplicates <directory> [maxDepth]');
  }
}
