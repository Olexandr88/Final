import fs from 'fs-extra';
import path from 'path';

/**
 * Context Compression and Session Summarization
 * Manages context window and creates session summaries
 */
export class ContextCompressor {
  constructor(options = {}) {
    this.maxContextSize = options.maxContextSize || 200000; // 200k tokens
    this.summaryDir = options.summaryDir || path.join(process.cwd(), '.claude', 'summaries');
    this.compressionRatio = options.compressionRatio || 0.3; // Compress to 30%
    this.tokenEstimator = options.tokenEstimator || this.defaultTokenEstimator;
  }

  /**
   * Initialize compressor
   */
  async initialize() {
    await fs.ensureDir(this.summaryDir);
  }

  /**
   * Default token estimator (rough approximation)
   */
  defaultTokenEstimator(text) {
    // Rough estimate: ~4 chars per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Compress conversation history
   */
  async compressHistory(messages, targetSize = null) {
    const target = targetSize || Math.floor(this.maxContextSize * this.compressionRatio);

    let currentSize = this.estimateSize(messages);

    if (currentSize <= target) {
      return { compressed: messages, removed: [] };
    }

    const compressed = [];
    const removed = [];
    let size = 0;

    // Keep recent messages, compress older ones
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const msgSize = this.tokenEstimator(JSON.stringify(msg));

      if (size + msgSize <= target) {
        compressed.unshift(msg);
        size += msgSize;
      } else {
        // Try to summarize older messages
        if (i < messages.length / 2) {
          removed.push(msg);
        } else {
          // Keep recent messages even if over target
          compressed.unshift(msg);
          size += msgSize;
        }
      }
    }

    return { compressed, removed, originalSize: currentSize, compressedSize: size };
  }

  /**
   * Create session summary
   */
  async createSessionSummary(session, options = {}) {
    const { includeCode = true, includeErrors = true, includeDecisions = true } = options;

    const summary = {
      sessionId: session.id,
      startTime: session.startTime,
      endTime: new Date(),
      duration: Date.now() - new Date(session.startTime).getTime(),
      summary: {
        keyChanges: await this.extractKeyChanges(session),
        decisions: includeDecisions ? await this.extractDecisions(session) : [],
        errors: includeErrors ? await this.extractErrors(session) : [],
        codeChanges: includeCode ? await this.extractCodeChanges(session) : [],
        nextSteps: await this.extractNextSteps(session),
      },
      stats: this.calculateStats(session),
    };

    // Save summary
    const summaryPath = path.join(this.summaryDir, `summary-${session.id}-${Date.now()}.json`);

    await fs.writeJson(summaryPath, summary, { spaces: 2 });

    return summary;
  }

  /**
   * Extract key changes from session
   */
  async extractKeyChanges(session) {
    const changes = [];

    for (const message of session.messages || []) {
      // Look for tool uses that modify files
      if (message.toolUses) {
        for (const tool of message.toolUses) {
          if (['Write', 'Edit'].includes(tool.name)) {
            changes.push({
              type: 'file-modification',
              file: tool.params.file_path,
              action: tool.name,
              timestamp: message.timestamp,
            });
          }
        }
      }

      // Look for feature completion markers
      if (message.content?.includes('✅') || message.content?.includes('completed')) {
        const match = message.content.match(/(?:implemented|completed|finished)\s+(.+?)(?:\.|$)/i);
        if (match) {
          changes.push({
            type: 'feature-complete',
            description: match[1],
            timestamp: message.timestamp,
          });
        }
      }
    }

    return changes;
  }

  /**
   * Extract key decisions
   */
  async extractDecisions(session) {
    const decisions = [];

    for (const message of session.messages || []) {
      // Look for decision markers
      const decisionPatterns = [
        /decided to (.+?)(?:\.|$)/i,
        /chose (.+?) because/i,
        /will use (.+?) for/i,
      ];

      for (const pattern of decisionPatterns) {
        const matches = message.content?.matchAll(new RegExp(pattern, 'gi'));
        if (matches) {
          for (const match of matches) {
            decisions.push({
              decision: match[1],
              timestamp: message.timestamp,
              context: message.content.substring(0, 200),
            });
          }
        }
      }
    }

    return decisions;
  }

  /**
   * Extract errors encountered
   */
  async extractErrors(session) {
    const errors = [];

    for (const message of session.messages || []) {
      // Look for error indicators
      if (
        message.content?.toLowerCase().includes('error') ||
        message.content?.toLowerCase().includes('failed')
      ) {
        const errorMatch = message.content.match(/error:?\s*(.+?)(?:\n|$)/i);
        if (errorMatch) {
          errors.push({
            error: errorMatch[1],
            timestamp: message.timestamp,
            resolved: await this.checkIfResolved(errorMatch[1], session.messages, message),
          });
        }
      }
    }

    return errors;
  }

  /**
   * Check if error was resolved later
   */
  async checkIfResolved(error, messages, errorMsg) {
    const errorIndex = messages.indexOf(errorMsg);
    const laterMessages = messages.slice(errorIndex + 1);

    for (const msg of laterMessages) {
      if (
        msg.content?.toLowerCase().includes('fixed') ||
        msg.content?.toLowerCase().includes('resolved')
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extract code changes
   */
  async extractCodeChanges(session) {
    const changes = [];

    for (const message of session.messages || []) {
      if (message.toolUses) {
        for (const tool of message.toolUses) {
          if (tool.name === 'Edit') {
            changes.push({
              file: tool.params.file_path,
              type: 'edit',
              description: this.summarizeEdit(tool.params),
              timestamp: message.timestamp,
            });
          } else if (tool.name === 'Write') {
            changes.push({
              file: tool.params.file_path,
              type: 'create',
              description: 'New file created',
              timestamp: message.timestamp,
            });
          }
        }
      }
    }

    return changes;
  }

  /**
   * Summarize an edit operation
   */
  summarizeEdit(params) {
    const oldLength = params.old_string?.length || 0;
    const newLength = params.new_string?.length || 0;

    if (newLength > oldLength * 1.5) {
      return 'Significant addition';
    } else if (newLength < oldLength * 0.5) {
      return 'Significant removal';
    } else {
      return 'Modification';
    }
  }

  /**
   * Extract next steps
   */
  async extractNextSteps(session) {
    const lastMessages = (session.messages || []).slice(-5);
    const nextSteps = [];

    for (const message of lastMessages) {
      // Look for TODO markers
      const todoMatches = message.content?.matchAll(/(?:TODO|Next|Need to):\s*(.+?)(?:\n|$)/gi);
      if (todoMatches) {
        for (const match of todoMatches) {
          nextSteps.push(match[1]);
        }
      }
    }

    return nextSteps;
  }

  /**
   * Calculate session statistics
   */
  calculateStats(session) {
    return {
      messageCount: session.messages?.length || 0,
      toolUses: this.countToolUses(session),
      filesModified: this.countFilesModified(session),
      tokensUsed: this.estimateSize(session.messages || []),
    };
  }

  /**
   * Count tool uses by type
   */
  countToolUses(session) {
    const counts = {};

    for (const message of session.messages || []) {
      if (message.toolUses) {
        for (const tool of message.toolUses) {
          counts[tool.name] = (counts[tool.name] || 0) + 1;
        }
      }
    }

    return counts;
  }

  /**
   * Count unique files modified
   */
  countFilesModified(session) {
    const files = new Set();

    for (const message of session.messages || []) {
      if (message.toolUses) {
        for (const tool of message.toolUses) {
          if (['Write', 'Edit', 'Read'].includes(tool.name)) {
            files.add(tool.params.file_path);
          }
        }
      }
    }

    return files.size;
  }

  /**
   * Estimate total size of messages
   */
  estimateSize(messages) {
    return messages.reduce((total, msg) => {
      return total + this.tokenEstimator(JSON.stringify(msg));
    }, 0);
  }

  /**
   * Load session summary
   */
  async loadSummary(summaryId) {
    const files = await fs.readdir(this.summaryDir);
    const summaryFile = files.find((f) => f.includes(summaryId));

    if (!summaryFile) {
      throw new Error(`Summary ${summaryId} not found`);
    }

    return fs.readJson(path.join(this.summaryDir, summaryFile));
  }

  /**
   * Get all summaries
   */
  async getAllSummaries() {
    const files = await fs.readdir(this.summaryDir);
    const summaries = [];

    for (const file of files.filter((f) => f.endsWith('.json'))) {
      const summary = await fs.readJson(path.join(this.summaryDir, file));
      summaries.push(summary);
    }

    return summaries.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  }

  /**
   * Create compressed checkpoint
   */
  async createCheckpoint(session, label = '') {
    const summary = await this.createSessionSummary(session);

    const checkpoint = {
      id: `checkpoint-${Date.now()}`,
      label,
      timestamp: new Date(),
      summary,
      resumeContext: await this.buildResumeContext(session),
    };

    const checkpointPath = path.join(this.summaryDir, `checkpoint-${checkpoint.id}.json`);

    await fs.writeJson(checkpointPath, checkpoint, { spaces: 2 });

    return checkpoint;
  }

  /**
   * Build resume context for continuing session
   */
  async buildResumeContext(session) {
    return {
      keyChanges: await this.extractKeyChanges(session),
      activeFiles: this.getActiveFiles(session),
      pendingTasks: await this.extractNextSteps(session),
      context: this.summarizeContext(session),
    };
  }

  /**
   * Get files actively worked on
   */
  getActiveFiles(session) {
    const recentMessages = (session.messages || []).slice(-10);
    const files = new Set();

    for (const message of recentMessages) {
      if (message.toolUses) {
        for (const tool of message.toolUses) {
          if (tool.params?.file_path) {
            files.add(tool.params.file_path);
          }
        }
      }
    }

    return Array.from(files);
  }

  /**
   * Summarize context in natural language
   */
  summarizeContext(session) {
    const summary = [];

    const stats = this.calculateStats(session);
    summary.push(
      `Session involved ${stats.messageCount} messages and ${stats.filesModified} files.`
    );

    // Add more context as needed

    return summary.join(' ');
  }
}

export default ContextCompressor;
