/**
 * Context Management with CLEAR/COMPRESS Ritual
 * Implements the Vibe Coding pattern for managing long-running sessions
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export class ContextManager {
  constructor(options = {}) {
    this.maxContextSize = options.maxContextSize || 200000; // 200k tokens
    this.compressionThreshold = options.compressionThreshold || 150000; // 150k tokens
    this.summaryDir = options.summaryDir || path.join(process.cwd(), '.claude', 'summaries');
    this.context = [];
    this.tokenCount = 0;
    this.sessionId = crypto.randomUUID();
    this.sessionStart = Date.now();

    this._ensureDirectories();
  }

  /**
   * Add content to context
   */
  add(content, metadata = {}) {
    const entry = {
      id: crypto.randomUUID(),
      content,
      metadata,
      timestamp: Date.now(),
      tokens: this._estimateTokens(content),
    };

    this.context.push(entry);
    this.tokenCount += entry.tokens;

    // Auto-compress if threshold exceeded
    if (this.tokenCount > this.compressionThreshold) {
      this.compress();
    }

    return entry.id;
  }

  /**
   * COMPRESS: Compress context to essential information
   */
  async compress() {
    if (this.context.length === 0) return;

    const summary = this._generateSummary();
    const summaryPath = path.join(this.summaryDir, `session-${this.sessionId}-${Date.now()}.md`);

    // Save full context before compression (async)
    await fs.promises.writeFile(summaryPath, summary, 'utf-8');

    // Keep only recent entries (last 20%)
    const keepCount = Math.floor(this.context.length * 0.2);
    const compressed = this.context.slice(-keepCount);

    // Add summary reference at the beginning
    const summaryEntry = {
      id: crypto.randomUUID(),
      content: `Previous context summary: ${summaryPath}`,
      metadata: { type: 'summary', originalCount: this.context.length },
      timestamp: Date.now(),
      tokens: 50,
    };

    this.context = [summaryEntry, ...compressed];
    this.tokenCount = this._recalculateTokens();

    console.log(
      `✓ Context compressed: ${compressed.length} entries remaining (${this.tokenCount} tokens)`
    );

    return summaryPath;
  }

  /**
   * CLEAR: Reset context for new task
   */
  async clear(saveHistorical = true) {
    if (saveHistorical && this.context.length > 0) {
      const summary = this._generateSummary();
      const archivePath = path.join(this.summaryDir, `archive-${this.sessionId}-${Date.now()}.md`);

      await fs.promises.writeFile(archivePath, summary, 'utf-8');
      console.log(`✓ Context archived: ${archivePath}`);
    }

    this.context = [];
    this.tokenCount = 0;
    this.sessionId = crypto.randomUUID();
    this.sessionStart = Date.now();

    return true;
  }

  /**
   * Generate summary of context
   */
  _generateSummary() {
    const sections = {
      keyChanges: [],
      issues: [],
      nextSteps: [],
      codeChanges: [],
      decisions: [],
    };

    // Categorize context entries
    for (const entry of this.context) {
      const type = entry.metadata?.type;
      const content = entry.content;

      if (type === 'code_change' || content.includes('Edit(') || content.includes('Write(')) {
        sections.codeChanges.push(content);
      } else if (type === 'issue' || content.includes('error') || content.includes('bug')) {
        sections.issues.push(content);
      } else if (type === 'decision') {
        sections.decisions.push(content);
      } else if (type === 'next_step') {
        sections.nextSteps.push(content);
      } else {
        sections.keyChanges.push(content);
      }
    }

    // Build markdown summary
    let summary = `# Session Summary\n\n`;
    summary += `**Session ID:** ${this.sessionId}\n`;
    summary += `**Duration:** ${this._formatDuration(Date.now() - this.sessionStart)}\n`;
    summary += `**Total Entries:** ${this.context.length}\n`;
    summary += `**Token Count:** ${this.tokenCount}\n\n`;

    if (sections.keyChanges.length > 0) {
      summary += `## Key Changes\n\n`;
      summary += sections.keyChanges
        .slice(-10)
        .map((c) => `- ${this._truncate(c, 200)}`)
        .join('\n');
      summary += '\n\n';
    }

    if (sections.codeChanges.length > 0) {
      summary += `## Code Modifications\n\n`;
      summary += sections.codeChanges
        .slice(-15)
        .map((c) => `- ${this._truncate(c, 150)}`)
        .join('\n');
      summary += '\n\n';
    }

    if (sections.issues.length > 0) {
      summary += `## Issues Encountered\n\n`;
      summary += sections.issues
        .slice(-10)
        .map((i) => `- ${this._truncate(i, 200)}`)
        .join('\n');
      summary += '\n\n';
    }

    if (sections.decisions.length > 0) {
      summary += `## Technical Decisions\n\n`;
      summary += sections.decisions.map((d) => `- ${this._truncate(d, 200)}`).join('\n');
      summary += '\n\n';
    }

    if (sections.nextSteps.length > 0) {
      summary += `## Next Steps\n\n`;
      summary += sections.nextSteps.map((n) => `- ${n}`).join('\n');
      summary += '\n\n';
    }

    return summary;
  }

  /**
   * Load context from summary
   */
  async loadFromSummary(summaryPath) {
    try {
      const summary = await fs.promises.readFile(summaryPath, 'utf-8');

      const entry = {
        id: crypto.randomUUID(),
        content: `Loaded context from: ${summaryPath}\n\n${summary}`,
        metadata: { type: 'loaded_summary' },
        timestamp: Date.now(),
        tokens: this._estimateTokens(summary),
      };

      this.context = [entry];
      this.tokenCount = entry.tokens;

      console.log(`✓ Context loaded from: ${summaryPath}`);
      return true;
    } catch (error) {
      console.error(`Failed to load summary: ${error.message}`);
      return false;
    }
  }

  /**
   * Get current context
   */
  getContext(limit = null) {
    if (limit) {
      return this.context.slice(-limit);
    }
    return this.context;
  }

  /**
   * Get context statistics
   */
  getStats() {
    return {
      sessionId: this.sessionId,
      entryCount: this.context.length,
      tokenCount: this.tokenCount,
      sessionDuration: Date.now() - this.sessionStart,
      compressionNeeded: this.tokenCount > this.compressionThreshold,
      utilizationPercent: Math.round((this.tokenCount / this.maxContextSize) * 100),
    };
  }

  /**
   * Estimate tokens in content (rough approximation)
   */
  _estimateTokens(content) {
    // Rough estimate: ~4 characters per token
    return Math.ceil(content.length / 4);
  }

  /**
   * Recalculate total token count
   */
  _recalculateTokens() {
    return this.context.reduce((sum, entry) => sum + entry.tokens, 0);
  }

  /**
   * Truncate string to max length
   */
  _truncate(str, maxLength) {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
  }

  /**
   * Format duration in human-readable form
   */
  _formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Ensure required directories exist
   */
  _ensureDirectories() {
    if (!fs.existsSync(this.summaryDir)) {
      fs.mkdirSync(this.summaryDir, { recursive: true }); // Keep sync for constructor
    }
  }
}

export default ContextManager;
