/**
 * Context Manager - Prevents context overflow and manages session state
 * @module context-manager
 */

import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger.js';

const CONTEXT_LIMITS = {
  maxTokens: 200000,
  warningThreshold: 150000,
  criticalThreshold: 180000,
  compressionThreshold: 160000,
};

const STATE_DIR = '.agent-locks/SESSION-STATE';
const HISTORY_DIR = '.agent-locks/SESSION-HISTORY';
const HANDOFF_DIR = '.agent-locks/HANDOFFS';
const CHECKPOINT_DIR = '.agent-locks/CHECKPOINTS';

export class ContextManager {
  constructor(sessionId, role) {
    this.sessionId = sessionId;
    this.role = role;
    this.tokenCount = 0;
    this.lastCheckpoint = Date.now();
    this.stateFile = path.join(STATE_DIR, `${sessionId}.json`);
  }

  /**
   * Estimate token count for text (rough approximation: 1 token ≈ 4 chars)
   */
  estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }

  /**
   * Update current token count estimate
   */
  updateTokenCount(additionalTokens) {
    this.tokenCount += additionalTokens;
    logger.debug(`[${this.sessionId}] Token count: ${this.tokenCount}/${CONTEXT_LIMITS.maxTokens}`);

    // Check thresholds
    if (this.tokenCount >= CONTEXT_LIMITS.criticalThreshold) {
      logger.error(
        `[${this.sessionId}] CRITICAL: Token count at ${this.tokenCount}. Initiating handoff!`
      );
      this.initiateHandoff();
    } else if (this.tokenCount >= CONTEXT_LIMITS.compressionThreshold) {
      logger.warn(
        `[${this.sessionId}] WARNING: Token count at ${this.tokenCount}. Compressing context...`
      );
      this.compressContext();
    } else if (this.tokenCount >= CONTEXT_LIMITS.warningThreshold) {
      logger.info(`[${this.sessionId}] Token count approaching limit: ${this.tokenCount}`);
    }
  }

  /**
   * Save current session state to disk
   */
  async saveState(currentTask, criticalState, nextSteps, filesModified, decisions) {
    const state = {
      sessionId: this.sessionId,
      role: this.role,
      status: this.getStatus(),
      lastUpdate: new Date().toISOString(),
      context: {
        estimatedTokens: this.tokenCount,
        warningThreshold: CONTEXT_LIMITS.warningThreshold,
        criticalThreshold: CONTEXT_LIMITS.criticalThreshold,
        status: this.getStatus(),
        compressionNeeded: this.tokenCount >= CONTEXT_LIMITS.compressionThreshold,
      },
      currentTask,
      criticalState,
      nextSteps,
      filesModified,
      decisions,
    };

    try {
      await fs.mkdir(STATE_DIR, { recursive: true });
      await fs.writeFile(this.stateFile, JSON.stringify(state, null, 2));
      logger.debug(`[${this.sessionId}] State saved to ${this.stateFile}`);
    } catch (error) {
      logger.error(`[${this.sessionId}] Failed to save state:`, error);
    }
  }

  /**
   * Load session state from disk (for recovery)
   */
  async loadState() {
    try {
      const data = await fs.readFile(this.stateFile, 'utf-8');
      const state = JSON.parse(data);
      this.tokenCount = state.context?.estimatedTokens || 0;
      logger.info(`[${this.sessionId}] State loaded. Token count: ${this.tokenCount}`);
      return state;
    } catch (error) {
      logger.warn(`[${this.sessionId}] No previous state found. Starting fresh.`);
      return null;
    }
  }

  /**
   * Get current health status
   */
  getStatus() {
    if (this.tokenCount >= CONTEXT_LIMITS.criticalThreshold) return 'critical';
    if (this.tokenCount >= CONTEXT_LIMITS.compressionThreshold) return 'warning';
    return 'healthy';
  }

  /**
   * Compress context - archive history and clear non-essential data
   */
  async compressContext() {
    try {
      const timestamp = Date.now();
      const historyFile = path.join(HISTORY_DIR, this.sessionId, `${timestamp}-summary.md`);

      // Create summary
      const summary = `# Context Compression - ${new Date().toISOString()}

## Session: ${this.sessionId}
## Token Count: ${this.tokenCount}

Context compressed to prevent overflow. Full conversation archived.

## State Before Compression
- Role: ${this.role}
- Status: ${this.getStatus()}
- Files modified: See SESSION-STATE for details

## Continuing Work
Context has been cleared but critical state preserved in SESSION-STATE files.
`;

      await fs.mkdir(path.dirname(historyFile), { recursive: true });
      await fs.writeFile(historyFile, summary);

      // Reset token count (simulating context clear)
      this.tokenCount = Math.floor(this.tokenCount * 0.2); // Keep 20% for critical state
      logger.info(`[${this.sessionId}] Context compressed. New token count: ${this.tokenCount}`);

      // Update state file
      await this.saveState(
        { description: 'Context compressed, continuing work', progress: 100 },
        {},
        ['Resume from last known state'],
        [],
        [
          {
            timestamp: new Date().toISOString(),
            decision: 'Context compressed',
            rationale: 'Prevent overflow',
          },
        ]
      );
    } catch (error) {
      logger.error(`[${this.sessionId}] Context compression failed:`, error);
    }
  }

  /**
   * Initiate handoff to new session
   */
  async initiateHandoff() {
    try {
      const timestamp = Date.now();
      const handoffFile = path.join(HANDOFF_DIR, `${this.sessionId}-${timestamp}.md`);

      // Load current state
      const state = (await this.loadState()) || {};

      const handoff = `# Session Handoff - ${new Date().toISOString()}

## Context
Session: ${this.sessionId}
Role: ${this.role}
Reason: Context limit reached (${this.tokenCount}/${CONTEXT_LIMITS.maxTokens} tokens)

## Active Task
${JSON.stringify(state.currentTask, null, 2)}

## Progress
Token count exceeded safe limits. This session must be replaced.

## Next Steps
${state.nextSteps?.map((step, i) => `${i + 1}. ${step}`).join('\n') || 'No pending steps'}

## Critical Info
- Passcode: ${state.criticalState?.passcode || 'See SESSION-COORDINATION.json'}
- Coordination files: ${state.criticalState?.coordinationFiles?.join(', ') || 'See .agent-locks/'}
- Files modified: ${state.filesModified?.join(', ') || 'None'}

## Recovery Instructions
1. Read this handoff document
2. Load SESSION-STATE/${this.sessionId}.json for full state
3. Check TASK-QUEUE.json for pending assignments
4. Continue work seamlessly

## State Files
- SESSION-STATE: .agent-locks/SESSION-STATE/${this.sessionId}.json
- History: .agent-locks/SESSION-HISTORY/${this.sessionId}/
- Coordination: .agent-locks/UNIFIED-COORDINATION-PROTOCOL.json
`;

      await fs.mkdir(HANDOFF_DIR, { recursive: true });
      await fs.writeFile(handoffFile, handoff);

      logger.error(`[${this.sessionId}] HANDOFF INITIATED. Document: ${handoffFile}`);
      logger.error(`[${this.sessionId}] NEW SESSION REQUIRED. Read handoff and continue.`);

      // Update coordination file
      await this.updateCoordinationStatus('CONTEXT_FULL', handoffFile);

      return handoffFile;
    } catch (error) {
      logger.error(`[${this.sessionId}] Handoff creation failed:`, error);
      throw error;
    }
  }

  /**
   * Create periodic checkpoint
   */
  async createCheckpoint() {
    const now = Date.now();
    if (
      now - this.lastCheckpoint < 30 * 60 * 1000 &&
      this.tokenCount < this.lastCheckpoint + 50000
    ) {
      return; // Not time yet
    }

    try {
      const timestamp = now;
      const checkpointFile = path.join(CHECKPOINT_DIR, `${this.sessionId}-${timestamp}.json`);
      const state = await this.loadState();

      await fs.mkdir(CHECKPOINT_DIR, { recursive: true });
      await fs.writeFile(checkpointFile, JSON.stringify(state, null, 2));

      this.lastCheckpoint = now;
      logger.info(`[${this.sessionId}] Checkpoint created: ${checkpointFile}`);
    } catch (error) {
      logger.error(`[${this.sessionId}] Checkpoint failed:`, error);
    }
  }

  /**
   * Update coordination file with status
   */
  async updateCoordinationStatus(status, handoffFile = null) {
    try {
      const coordFile = '.agent-locks/SESSION-COORDINATION.json';
      const data = await fs.readFile(coordFile, 'utf-8');
      const coord = JSON.parse(data);

      if (!coord.sessions[this.sessionId]) {
        coord.sessions[this.sessionId] = {};
      }

      coord.sessions[this.sessionId].status = status;
      coord.sessions[this.sessionId].lastUpdate = new Date().toISOString();
      coord.sessions[this.sessionId].tokenCount = this.tokenCount;

      if (handoffFile) {
        coord.sessions[this.sessionId].handoffFile = handoffFile;
      }

      await fs.writeFile(coordFile, JSON.stringify(coord, null, 2));
      logger.info(`[${this.sessionId}] Coordination status updated: ${status}`);
    } catch (error) {
      logger.error(`[${this.sessionId}] Failed to update coordination:`, error);
    }
  }

  /**
   * Monitor and report health
   */
  async healthCheck() {
    const status = this.getStatus();
    await this.updateCoordinationStatus(status);

    return {
      sessionId: this.sessionId,
      role: this.role,
      status,
      tokenCount: this.tokenCount,
      healthy: status === 'healthy',
    };
  }
}

export default ContextManager;
