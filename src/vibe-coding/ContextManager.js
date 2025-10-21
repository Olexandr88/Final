import fs from 'fs/promises';
import path from 'path';
import { Logger } from '../utils/logger.js';

/**
 * ContextManager - Manages context compression and summarization
 * Implements the CLEAR/COMPRESS ritual from vibe coding best practices
 */
export class ContextManager {
  constructor(options = {}) {
    this.logger = options.logger || Logger.getInstance();
    this.summaryDir = options.summaryDir || '.vibe-coding/summaries';
    this.maxContextSize = options.maxContextSize || 100000;
    this.compressionThreshold = options.compressionThreshold || 0.8;
  }

  /**
   * Initialize context manager
   */
  async initialize() {
    try {
      await fs.mkdir(this.summaryDir, { recursive: true });
      this.logger.info('Context manager initialized');
    } catch (error) {
      this.logger.error('Failed to initialize context manager', error);
      throw error;
    }
  }

  /**
   * Check if context needs compression
   */
  needsCompression(currentTokens) {
    return currentTokens >= this.maxContextSize * this.compressionThreshold;
  }

  /**
   * Summarize work done so far
   */
  async summarize(sessionData, taskName = 'work') {
    const {
      changes = [],
      issues = [],
      nextSteps = [],
      decisions = [],
      timestamp = Date.now()
    } = sessionData;

    const summary = {
      taskName,
      timestamp,
      duration: this._calculateDuration(sessionData),
      summary: {
        changes: changes.map(c => ({
          file: c.file,
          type: c.type,
          description: c.description
        })),
        issues: issues.map(i => ({
          type: i.type,
          description: i.description,
          resolution: i.resolution
        })),
        decisions: decisions.map(d => ({
          decision: d.decision,
          rationale: d.rationale
        })),
        nextSteps: nextSteps.map(s => ({
          task: s.task,
          priority: s.priority
        }))
      },
      metadata: {
        filesModified: [...new Set(changes.map(c => c.file))].length,
        issuesResolved: issues.filter(i => i.resolution).length,
        tokensSaved: sessionData.tokenCount || 0
      }
    };

    // Save summary to markdown
    const filename = `summary-${taskName}-${Date.now()}.md`;
    const filepath = path.join(this.summaryDir, filename);
    const markdown = this._generateMarkdown(summary);

    await fs.writeFile(filepath, markdown, 'utf-8');
    this.logger.info(`Summary saved: ${filepath}`);

    return {
      summary,
      filepath,
      markdown
    };
  }

  /**
   * Load previous summary
   */
  async loadSummary(taskName) {
    const files = await fs.readdir(this.summaryDir);
    const summaryFiles = files
      .filter(f => f.startsWith(`summary-${taskName}-`))
      .sort()
      .reverse();

    if (summaryFiles.length === 0) {
      return null;
    }

    const latestFile = path.join(this.summaryDir, summaryFiles[0]);
    const content = await fs.readFile(latestFile, 'utf-8');

    return {
      file: latestFile,
      content,
      taskName
    };
  }

  /**
   * Compress context by removing redundant information
   */
  compressContext(context) {
    // Remove duplicate entries
    const uniqueContext = this._deduplicateContext(context);

    // Prioritize recent and important entries
    const prioritized = this._prioritizeContext(uniqueContext);

    // Truncate to fit within limits
    const compressed = this._truncateContext(prioritized);

    const compressionRatio = (context.length - compressed.length) / context.length;
    this.logger.info(`Context compressed: ${context.length} → ${compressed.length} (${(compressionRatio * 100).toFixed(1)}% reduction)`);

    return compressed;
  }

  /**
   * Reset context for new task
   */
  async resetContext(sessionId, taskName) {
    this.logger.info(`Resetting context for session ${sessionId}, task: ${taskName}`);
    return {
      sessionId,
      taskName,
      context: [],
      timestamp: Date.now(),
      fresh: true
    };
  }

  /**
   * Generate markdown summary
   */
  _generateMarkdown(summary) {
    const lines = [];

    lines.push(`# Summary: ${summary.taskName}`);
    lines.push(`\nGenerated: ${new Date(summary.timestamp).toISOString()}`);
    lines.push(`Duration: ${this._formatDuration(summary.duration)}\n`);

    if (summary.summary.changes.length > 0) {
      lines.push('## Changes Made\n');
      for (const change of summary.summary.changes) {
        lines.push(`- **${change.type}**: \`${change.file}\``);
        lines.push(`  ${change.description}`);
      }
      lines.push('');
    }

    if (summary.summary.issues.length > 0) {
      lines.push('## Issues Encountered\n');
      for (const issue of summary.summary.issues) {
        lines.push(`- **${issue.type}**: ${issue.description}`);
        if (issue.resolution) {
          lines.push(`  - Resolution: ${issue.resolution}`);
        }
      }
      lines.push('');
    }

    if (summary.summary.decisions.length > 0) {
      lines.push('## Key Decisions\n');
      for (const decision of summary.summary.decisions) {
        lines.push(`- ${decision.decision}`);
        lines.push(`  - Rationale: ${decision.rationale}`);
      }
      lines.push('');
    }

    if (summary.summary.nextSteps.length > 0) {
      lines.push('## Next Steps\n');
      for (const step of summary.summary.nextSteps) {
        const priority = step.priority ? `[${step.priority}] ` : '';
        lines.push(`- ${priority}${step.task}`);
      }
      lines.push('');
    }

    lines.push('## Metadata\n');
    lines.push(`- Files Modified: ${summary.metadata.filesModified}`);
    lines.push(`- Issues Resolved: ${summary.metadata.issuesResolved}`);
    lines.push(`- Tokens Saved: ~${summary.metadata.tokensSaved}`);

    return lines.join('\n');
  }

  /**
   * Deduplicate context entries
   */
  _deduplicateContext(context) {
    const seen = new Set();
    return context.filter(entry => {
      const key = JSON.stringify(entry);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Prioritize context entries by importance and recency
   */
  _prioritizeContext(context) {
    return context
      .map(entry => ({
        ...entry,
        score: this._calculatePriority(entry)
      }))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate priority score for context entry
   */
  _calculatePriority(entry) {
    let score = 0;

    // Recency (higher score for recent)
    const age = Date.now() - (entry.timestamp || 0);
    score += Math.max(0, 100 - age / 1000);

    // Importance markers
    if (entry.important) score += 50;
    if (entry.type === 'error') score += 40;
    if (entry.type === 'decision') score += 30;
    if (entry.type === 'change') score += 20;

    return score;
  }

  /**
   * Truncate context to fit limits
   */
  _truncateContext(context) {
    // Keep most important entries within limit
    const limit = Math.floor(this.maxContextSize / 100);
    return context.slice(0, limit);
  }

  /**
   * Calculate session duration
   */
  _calculateDuration(sessionData) {
    if (sessionData.startTime && sessionData.endTime) {
      return sessionData.endTime - sessionData.startTime;
    }
    return 0;
  }

  /**
   * Format duration for display
   */
  _formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }
}
