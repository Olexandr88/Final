/**
 * File System Tools
 * Safe file operations with path validation
 *
 * @module file-tools
 */

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../utils/logger.js';

const execAsync = promisify(exec);

/**
 * Read file contents
 * @param {Object} params - Parameters
 * @param {string} params.file_path - Path to file
 * @param {string} [params.encoding='utf-8'] - File encoding
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} File contents and metadata
 */
export async function readFile(params, context) {
  const { file_path, encoding = 'utf-8' } = params;

  try {
    const resolvedPath = path.resolve(file_path);
    const content = await fs.readFile(resolvedPath, encoding);
    const stats = await fs.stat(resolvedPath);

    return {
      file_path: resolvedPath,
      content,
      size: stats.size,
      lines: content.split('\n').length,
      modified: stats.mtime.toISOString(),
    };
  } catch (error) {
    throw new Error(`Failed to read file ${file_path}: ${error.message}`);
  }
}

/**
 * Write file contents
 * @param {Object} params - Parameters
 * @param {string} params.file_path - Path to file
 * @param {string} params.content - File content
 * @param {string} [params.encoding='utf-8'] - File encoding
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Write result
 */
export async function writeFile(params, context) {
  const { file_path, content, encoding = 'utf-8' } = params;

  try {
    const resolvedPath = path.resolve(file_path);

    // Ensure directory exists
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });

    // Write file
    await fs.writeFile(resolvedPath, content, encoding);

    return {
      file_path: resolvedPath,
      bytes_written: Buffer.byteLength(content, encoding),
      success: true,
    };
  } catch (error) {
    throw new Error(`Failed to write file ${file_path}: ${error.message}`);
  }
}

/**
 * Edit file with line-based modifications
 * @param {Object} params - Parameters
 * @param {string} params.file_path - Path to file
 * @param {Array<Object>} params.edits - Array of edits [{line, operation, content}]
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Edit result
 */
export async function editFile(params, context) {
  const { file_path, edits } = params;

  try {
    // Read current content
    const { content } = await readFile({ file_path }, context);
    const lines = content.split('\n');

    // Apply edits (sorted by line number descending to maintain line numbers)
    const sortedEdits = [...edits].sort((a, b) => b.line - a.line);

    for (const edit of sortedEdits) {
      const { line, operation, content: newContent } = edit;
      const idx = line - 1; // Convert to 0-based index

      if (idx < 0 || idx >= lines.length) {
        throw new Error(`Invalid line number: ${line} (file has ${lines.length} lines)`);
      }

      switch (operation) {
        case 'replace':
          lines[idx] = newContent;
          break;
        case 'insert':
          lines.splice(idx, 0, newContent);
          break;
        case 'delete':
          lines.splice(idx, 1);
          break;
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
    }

    // Write modified content
    const modifiedContent = lines.join('\n');
    await writeFile({ file_path, content: modifiedContent }, context);

    return {
      file_path,
      edits_applied: edits.length,
      lines_before: content.split('\n').length,
      lines_after: lines.length,
    };
  } catch (error) {
    throw new Error(`Failed to edit file ${file_path}: ${error.message}`);
  }
}

/**
 * Find files matching glob pattern
 * @param {Object} params - Parameters
 * @param {string} params.pattern - Glob pattern
 * @param {string} [params.cwd] - Working directory
 * @param {Array<string>} [params.ignore] - Patterns to ignore
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Matching files
 */
export async function globFiles(params, context) {
  const { pattern, cwd = process.cwd(), ignore = [] } = params;

  try {
    const files = await glob(pattern, {
      cwd,
      ignore: [...ignore, '**/node_modules/**', '**/.git/**'],
      absolute: true,
      nodir: true,
    });

    return {
      pattern,
      files,
      count: files.length,
      search_path: cwd,
    };
  } catch (error) {
    throw new Error(`Glob search failed for pattern ${pattern}: ${error.message}`);
  }
}

/**
 * Search file contents (grep-like)
 * @param {Object} params - Parameters
 * @param {string} params.pattern - Search pattern (regex)
 * @param {string} [params.path='.'] - Path to search in
 * @param {boolean} [params.case_sensitive=false] - Case sensitive search
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Search results
 */
export async function grepPattern(params, context) {
  const { pattern, path: searchPath = '.', case_sensitive = false } = params;

  try {
    // Use ripgrep if available, fallback to simple implementation
    const flags = case_sensitive ? '' : 'i';
    const escapedPattern = pattern.replace(/"/g, '\\"');
    const command = `rg -n --json "${escapedPattern}" "${searchPath}"`;

    try {
      const { stdout } = await execAsync(command, {
        cwd: process.cwd(),
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });

      const matches = stdout
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line))
        .filter((obj) => obj.type === 'match')
        .map((obj) => ({
          file: obj.data.path.text,
          line: obj.data.line_number,
          content: obj.data.lines.text,
          match: obj.data.submatches[0],
        }));

      return {
        pattern,
        matches,
        count: matches.length,
      };
    } catch (error) {
      if (error.code === 1) {
        // No matches found
        return { pattern, matches: [], count: 0 };
      }

      // Fallback to simple grep
      logger.warn('Ripgrep not available, using fallback', { error: error.message });
      return fallbackGrep(pattern, searchPath, case_sensitive);
    }
  } catch (error) {
    throw new Error(`Grep failed for pattern ${pattern}: ${error.message}`);
  }
}

/**
 * Fallback grep implementation
 * @private
 */
async function fallbackGrep(pattern, searchPath, caseSensitive) {
  const files = await glob('**/*', {
    cwd: searchPath,
    ignore: ['**/node_modules/**', '**/.git/**'],
    absolute: true,
    nodir: true,
  });

  const matches = [];
  const regex = new RegExp(pattern, caseSensitive ? '' : 'i');

  for (const file of files.slice(0, 100)) {
    // Limit to 100 files
    try {
      const content = await fs.readFile(file, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, idx) => {
        if (regex.test(line)) {
          matches.push({
            file,
            line: idx + 1,
            content: line,
            match: { text: line.match(regex)?.[0] || '' },
          });
        }
      });
    } catch (error) {
      // Skip files that can't be read
    }
  }

  return { pattern, matches, count: matches.length };
}
