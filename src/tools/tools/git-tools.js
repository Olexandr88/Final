/**
 * Git Operations Tools
 * Provides git command execution for autonomous agents
 *
 * @module git-tools
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../utils/logger.js';

const execAsync = promisify(exec);

/**
 * Execute a git command with error handling
 * @private
 * @param {string} command - Git command to execute
 * @param {string} cwd - Working directory
 * @returns {Promise<string>} Command output
 */
async function executeGit(command, cwd) {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: cwd || process.cwd(),
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });

    // Git sometimes outputs to stderr even on success
    if (stderr && !stderr.includes('warning:')) {
      logger.debug('Git stderr output', { stderr, command });
    }

    return stdout.trim();
  } catch (error) {
    logger.error('Git command failed', {
      command,
      error: error.message,
      stderr: error.stderr
    });
    throw new Error(`Git command failed: ${error.message}`);
  }
}

/**
 * Get git repository status
 * Returns structured information about repository state
 *
 * @param {Object} params - Parameters
 * @param {string} [params.cwd] - Repository directory (defaults to current directory)
 * @param {boolean} [params.porcelain=true] - Use porcelain format for machine-readable output
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Repository status
 */
export async function gitStatus(params = {}, context = {}) {
  const { cwd = process.cwd(), porcelain = true } = params;

  logger.info('Executing git status', {
    agentId: context.agentId,
    cwd,
    porcelain
  });

  try {
    // Check if directory is a git repository
    try {
      await executeGit('git rev-parse --git-dir', cwd);
    } catch (error) {
      return {
        isRepository: false,
        error: 'Not a git repository'
      };
    }

    // Get status in porcelain format for structured parsing
    const statusCommand = porcelain
      ? 'git status --porcelain=v2 --branch'
      : 'git status';

    const output = await executeGit(statusCommand, cwd);

    // Parse porcelain output
    if (porcelain) {
      const result = {
        isRepository: true,
        branch: null,
        upstream: null,
        ahead: 0,
        behind: 0,
        staged: [],
        unstaged: [],
        untracked: [],
        conflicted: []
      };

      const lines = output.split('\n');

      for (const line of lines) {
        if (line.startsWith('# branch.oid')) {
          result.commit = line.split(' ')[2];
        } else if (line.startsWith('# branch.head')) {
          result.branch = line.split(' ')[2];
        } else if (line.startsWith('# branch.upstream')) {
          result.upstream = line.split(' ')[2];
        } else if (line.startsWith('# branch.ab')) {
          const parts = line.split(' ');
          result.ahead = parseInt(parts[2].replace('+', ''));
          result.behind = parseInt(parts[3].replace('-', ''));
        } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
          // Changed files
          const parts = line.split(' ');
          const xy = parts[1]; // XY status codes
          const file = parts.slice(-1)[0];

          // X = staged, Y = unstaged
          const x = xy[0];
          const y = xy[1];

          if (x !== '.' && x !== '?') {
            result.staged.push({ status: x, file });
          }
          if (y !== '.' && y !== '?') {
            result.unstaged.push({ status: y, file });
          }
          if (x === 'U' || y === 'U') {
            result.conflicted.push(file);
          }
        } else if (line.startsWith('? ')) {
          // Untracked files
          result.untracked.push(line.substring(2));
        }
      }

      return result;
    } else {
      // Return raw output for human-readable format
      return {
        isRepository: true,
        output
      };
    }
  } catch (error) {
    logger.error('Git status failed', {
      agentId: context.agentId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get git diff for changes
 * Returns diff output for unstaged or staged changes
 *
 * @param {Object} params - Parameters
 * @param {string} [params.cwd] - Repository directory
 * @param {string} [params.file] - Specific file to diff (optional)
 * @param {boolean} [params.staged=false] - Show staged changes (--cached)
 * @param {boolean} [params.nameOnly=false] - Show only file names
 * @param {string} [params.ref] - Compare against specific ref/commit
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Diff results
 */
export async function gitDiff(params = {}, context = {}) {
  const {
    cwd = process.cwd(),
    file = null,
    staged = false,
    nameOnly = false,
    ref = null
  } = params;

  logger.info('Executing git diff', {
    agentId: context.agentId,
    cwd,
    file,
    staged,
    nameOnly,
    ref
  });

  try {
    // Check if directory is a git repository
    try {
      await executeGit('git rev-parse --git-dir', cwd);
    } catch (error) {
      return {
        isRepository: false,
        error: 'Not a git repository'
      };
    }

    // Build diff command
    let command = 'git diff';

    if (staged) {
      command += ' --cached';
    }

    if (nameOnly) {
      command += ' --name-only';
    }

    if (ref) {
      command += ` ${ref}`;
    }

    if (file) {
      command += ` -- ${file}`;
    }

    const output = await executeGit(command, cwd);

    if (nameOnly) {
      // Parse file list
      const files = output.split('\n').filter(f => f.trim());
      return {
        files,
        count: files.length
      };
    } else {
      // Return full diff
      return {
        diff: output,
        hasChanges: output.length > 0
      };
    }
  } catch (error) {
    logger.error('Git diff failed', {
      agentId: context.agentId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Commit changes with message
 * Stages and commits specified files or all staged files
 *
 * @param {Object} params - Parameters
 * @param {string} params.message - Commit message (required)
 * @param {string} [params.cwd] - Repository directory
 * @param {Array<string>} [params.files] - Files to stage and commit (optional, commits staged files if not provided)
 * @param {boolean} [params.all=false] - Stage all changes (-a flag)
 * @param {boolean} [params.amend=false] - Amend previous commit
 * @param {string} [params.author] - Override author (format: "Name <email>")
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Commit result
 */
export async function gitCommit(params = {}, context = {}) {
  const {
    message,
    cwd = process.cwd(),
    files = null,
    all = false,
    amend = false,
    author = null
  } = params;

  // Validate required parameters
  if (!message) {
    throw new Error('Commit message is required');
  }

  logger.info('Executing git commit', {
    agentId: context.agentId,
    cwd,
    message: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
    filesCount: files ? files.length : 'all staged',
    all,
    amend
  });

  try {
    // Check if directory is a git repository
    try {
      await executeGit('git rev-parse --git-dir', cwd);
    } catch (error) {
      return {
        isRepository: false,
        error: 'Not a git repository'
      };
    }

    // Stage specific files if provided
    if (files && files.length > 0) {
      for (const file of files) {
        const addCommand = `git add ${JSON.stringify(file)}`;
        await executeGit(addCommand, cwd);
        logger.debug('Staged file', { file });
      }
    }

    // Check if there are changes to commit (unless amending)
    if (!amend) {
      const statusOutput = await executeGit('git status --porcelain', cwd);
      const hasStaged = statusOutput.split('\n').some(line => {
        const status = line.substring(0, 2);
        return status[0] !== ' ' && status[0] !== '?' && status[0] !== '!';
      });

      if (!hasStaged && !all) {
        return {
          success: false,
          error: 'No changes staged for commit'
        };
      }
    }

    // Build commit command
    let command = 'git commit';

    if (all) {
      command += ' -a';
    }

    if (amend) {
      command += ' --amend';
    }

    if (author) {
      command += ` --author=${JSON.stringify(author)}`;
    }

    // Add message (properly escaped)
    command += ` -m ${JSON.stringify(message)}`;

    const output = await executeGit(command, cwd);

    // Parse commit hash from output
    const commitHashMatch = output.match(/\[[\w-]+\s+([a-f0-9]+)\]/);
    const commitHash = commitHashMatch ? commitHashMatch[1] : null;

    // Get commit details
    let commitDetails = null;
    if (commitHash) {
      try {
        const logOutput = await executeGit(
          `git log -1 --format="%H%n%an%n%ae%n%at%n%s" ${commitHash}`,
          cwd
        );
        const [hash, authorName, authorEmail, timestamp, subject] = logOutput.split('\n');
        commitDetails = {
          hash,
          author: {
            name: authorName,
            email: authorEmail
          },
          timestamp: parseInt(timestamp),
          subject
        };
      } catch (error) {
        logger.warn('Failed to get commit details', { error: error.message });
      }
    }

    logger.info('Git commit successful', {
      agentId: context.agentId,
      commitHash
    });

    return {
      success: true,
      commitHash,
      commit: commitDetails,
      output
    };
  } catch (error) {
    logger.error('Git commit failed', {
      agentId: context.agentId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Tool schemas for LLM function calling
 */
export const gitToolSchemas = {
  git_status: {
    name: 'git_status',
    description: 'Get the current git repository status including branch, staged/unstaged changes, and untracked files',
    input_schema: {
      type: 'object',
      properties: {
        cwd: {
          type: 'string',
          description: 'Repository directory path (defaults to current directory)'
        },
        porcelain: {
          type: 'boolean',
          description: 'Use machine-readable format (default: true)'
        }
      }
    }
  },

  git_diff: {
    name: 'git_diff',
    description: 'Get git diff output for changes in the repository',
    input_schema: {
      type: 'object',
      properties: {
        cwd: {
          type: 'string',
          description: 'Repository directory path'
        },
        file: {
          type: 'string',
          description: 'Specific file to diff (optional)'
        },
        staged: {
          type: 'boolean',
          description: 'Show staged changes (--cached flag)'
        },
        nameOnly: {
          type: 'boolean',
          description: 'Show only changed file names'
        },
        ref: {
          type: 'string',
          description: 'Compare against specific commit/branch/ref'
        }
      }
    }
  },

  git_commit: {
    name: 'git_commit',
    description: 'Commit changes to the git repository',
    input_schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Commit message (required)'
        },
        cwd: {
          type: 'string',
          description: 'Repository directory path'
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific files to stage and commit (optional)'
        },
        all: {
          type: 'boolean',
          description: 'Stage all tracked changes (-a flag)'
        },
        amend: {
          type: 'boolean',
          description: 'Amend the previous commit'
        },
        author: {
          type: 'string',
          description: 'Override commit author (format: "Name <email>")'
        }
      },
      required: ['message']
    }
  }
}
