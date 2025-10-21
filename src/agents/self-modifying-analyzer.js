#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { parse } from 'acorn';
import ContextAwareAnalyzer from './context-aware-analyzer.js';
import { logger } from '../utils/logger.js';

/**
 * Self-Modifying Code Analyzer
 * Can analyze and improve its own code with safety guards
 */
class SelfModifyingAnalyzer extends ContextAwareAnalyzer {
  constructor(options = {}) {
    super();
    this.safeMode = options.safeMode !== false; // Default: true
    this.backupEnabled = options.backupEnabled !== false; // Default: true
    this.backupDir = options.backupDir || '.backups/analyzer';
    this.modifications = [];
    this.safetyChecks = {
      maxModificationsPerRun: 10,
      requireVerification: true,
      preventSyntaxErrors: true,
      preventBreakingChanges: true,
      preserveExports: true,
    };
  }

  /**
   * Analyze and propose self-modifications
   * @param {string} filePath - Path to file to modify
   * @param {object} options - Modification options
   * @returns {object} Proposed modifications
   */
  async proposeSelfModifications(filePath, options = {}) {
    const isSelf = this.isAnalyzingSelf(filePath);

    if (!isSelf && this.safeMode) {
      logger.info('⚠️  Safe mode: Only self-modifications allowed');
      return { allowed: false, reason: 'Not a self-file in safe mode' };
    }

    // Read current code
    const code = await fs.promises.readFile(filePath, 'utf8');

    // Analyze current state
    const analysis = this.analyzeWithContext(code, filePath, {
      source: 'self-modification',
    });

    // Generate modifications based on issues
    const modifications = this.generateModifications(code, analysis, options);

    return {
      filePath,
      isSelfModification: isSelf,
      currentAnalysis: analysis,
      proposedModifications: modifications,
      safetyStatus: this.checkSafety(modifications),
      timestamp: Date.now(),
    };
  }

  /**
   * Generate code modifications based on analysis
   */
  generateModifications(code, analysis, options = {}) {
    const modifications = [];

    analysis.issues?.forEach((issue) => {
      switch (issue.type) {
        case 'var-usage':
          modifications.push({
            type: 'replace-var',
            line: issue.line,
            severity: issue.severity,
            original: 'var',
            replacement: 'let',
            description: 'Replace var with let',
            safe: true,
          });
          break;

        case 'console-log':
          if (options.removeConsoleLogs) {
            modifications.push({
              type: 'remove-console',
              line: issue.line,
              severity: issue.severity,
              description: 'Remove console.log statement',
              safe: true,
            });
          }
          break;

        case 'weak-equality':
          modifications.push({
            type: 'fix-equality',
            line: issue.line,
            severity: issue.severity,
            original: issue.fix?.operator?.replace('=', '') || '==',
            replacement: issue.fix?.operator || '===',
            description: 'Use strict equality',
            safe: true,
          });
          break;

        case 'high-complexity':
          modifications.push({
            type: 'refactor-complexity',
            line: issue.line,
            severity: issue.severity,
            description: `Refactor function (complexity: ${issue.complexity})`,
            safe: false, // Requires manual review
            suggestion: 'Extract helper functions to reduce complexity',
          });
          break;

        case 'long-function':
          modifications.push({
            type: 'refactor-length',
            line: issue.line,
            severity: issue.severity,
            description: `Split long function (${issue.length} lines)`,
            safe: false, // Requires manual review
            suggestion: 'Break function into smaller, focused functions',
          });
          break;
      }
    });

    return modifications;
  }

  /**
   * Apply safe modifications
   * @param {string} filePath - File to modify
   * @param {Array} modifications - Modifications to apply
   * @param {object} options - Application options
   * @returns {object} Result of modifications
   */
  async applySelfModifications(filePath, modifications, options = {}) {
    const isSelf = this.isAnalyzingSelf(filePath);

    if (!isSelf && this.safeMode) {
      return {
        success: false,
        reason: 'Safe mode: Only self-modifications allowed',
        applied: [],
      };
    }

    // Filter to only safe modifications unless forced
    const safeModifications = options.force ? modifications : modifications.filter((m) => m.safe);

    if (safeModifications.length === 0) {
      return {
        success: true,
        reason: 'No safe modifications to apply',
        applied: [],
      };
    }

    if (safeModifications.length > this.safetyChecks.maxModificationsPerRun) {
      return {
        success: false,
        reason: `Too many modifications (${safeModifications.length} > ${this.safetyChecks.maxModificationsPerRun})`,
        applied: [],
      };
    }

    // Create backup
    if (this.backupEnabled) {
      await this.createBackup(filePath);
    }

    // Read current code
    let code = await fs.promises.readFile(filePath, 'utf8');
    const originalCode = code;

    // Apply modifications
    const applied = [];
    const lines = code.split('\n');

    for (const mod of safeModifications) {
      try {
        switch (mod.type) {
          case 'replace-var':
            lines[mod.line - 1] = lines[mod.line - 1].replace(/\bvar\b/, 'let');
            applied.push(mod);
            break;

          case 'remove-console':
            lines[mod.line - 1] = lines[mod.line - 1].replace(
              /console\.log\([^)]*\);?/,
              '// console.log removed'
            );
            applied.push(mod);
            break;

          case 'fix-equality':
            lines[mod.line - 1] = lines[mod.line - 1]
              .replace(/([^=!])==([^=])/, '$1===$2')
              .replace(/([^=!])!=([^=])/, '$1!==$2');
            applied.push(mod);
            break;
        }
      } catch (error) {
        logger.error(`Failed to apply modification: ${mod.type}`, error);
      }
    }

    const modifiedCode = lines.join('\n');

    // Verify syntax
    if (this.safetyChecks.preventSyntaxErrors) {
      try {
        parse(modifiedCode, { ecmaVersion: 2024 });
      } catch (error) {
        logger.error('Syntax error after modification:', error.message);

        // Restore from backup
        if (this.backupEnabled) {
          await this.restoreBackup(filePath);
        }

        return {
          success: false,
          reason: 'Modifications would cause syntax error',
          error: error.message,
          applied: [],
        };
      }
    }

    // Write modified code
    await fs.promises.writeFile(filePath, modifiedCode, 'utf8');

    // Track modifications
    this.modifications.push({
      filePath,
      timestamp: Date.now(),
      modificationsApplied: applied.length,
      isSelfModification: isSelf,
      backup: this.backupEnabled ? this.getBackupPath(filePath) : null,
    });

    return {
      success: true,
      filePath,
      applied,
      backupPath: this.backupEnabled ? this.getBackupPath(filePath) : null,
      modifiedLines: applied.map((m) => m.line),
    };
  }

  /**
   * Create backup of file
   */
  async createBackup(filePath) {
    const backupPath = this.getBackupPath(filePath);
    const backupDir = path.dirname(backupPath);

    // Create backup directory if needed
    if (!fs.existsSync(backupDir)) {
      await fs.promises.mkdir(backupDir, { recursive: true });
    }

    // Copy file
    await fs.promises.copyFile(filePath, backupPath);

    return backupPath;
  }

  /**
   * Restore from backup
   */
  async restoreBackup(filePath) {
    const backupPath = this.getBackupPath(filePath);

    if (!fs.existsSync(backupPath)) {
      throw new Error(`No backup found: ${backupPath}`);
    }

    fs.copyFileSync(backupPath, filePath);
    return filePath;
  }

  /**
   * Get backup file path
   */
  getBackupPath(filePath) {
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const basename = path.basename(filePath);
    return path.join(this.backupDir, `${basename}.${timestamp}.backup`);
  }

  /**
   * Check safety of modifications
   */
  checkSafety(modifications) {
    const safeCount = modifications.filter((m) => m.safe).length;
    const unsafeCount = modifications.length - safeCount;

    return {
      totalModifications: modifications.length,
      safeModifications: safeCount,
      unsafeModifications: unsafeCount,
      canAutoApply: unsafeCount === 0 && safeCount <= this.safetyChecks.maxModificationsPerRun,
      requiresReview: unsafeCount > 0,
    };
  }

  /**
   * Improve self (analyze and modify own code)
   */
  async improveSelf(options = {}) {
    logger.info('🤖 Starting self-improvement process...\n');

    const selfFiles = Array.from(this.selfFilePaths).filter((f) => fs.existsSync(f));
    const results = [];

    for (const filePath of selfFiles) {
      logger.info(`\n📝 Analyzing ${filePath}...`);

      try {
        // Propose modifications
        const proposal = await this.proposeSelfModifications(filePath, options);

        if (!proposal.allowed) {
          logger.info(`⚠️  ${proposal.reason}`);
          continue;
        }

        logger.info(`Found ${proposal.proposedModifications.length} potential improvements`);
        logger.info(
          `Safe: ${proposal.safetyStatus.safeModifications}, Unsafe: ${proposal.safetyStatus.unsafeModifications}`
        );

        // Apply if safe and auto-apply enabled
        if (proposal.safetyStatus.canAutoApply && options.autoApply) {
          logger.info('✅ Applying safe modifications...');

          const result = await this.applySelfModifications(
            filePath,
            proposal.proposedModifications,
            { force: false }
          );

          results.push(result);

          if (result.success) {
            logger.info(`✅ Applied ${result.applied.length} modifications`);
          } else {
            logger.info(`❌ Failed: ${result.reason}`);
          }
        } else {
          logger.info('ℹ️  Modifications require manual review');
          results.push({
            filePath,
            requiresReview: true,
            proposal,
          });
        }
      } catch (error) {
        logger.error(`❌ Error processing ${filePath}:`, error.message);
        results.push({
          filePath,
          error: error.message,
        });
      }
    }

    return {
      processedFiles: selfFiles.length,
      results,
      summary: {
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => r.error).length,
        requiresReview: results.filter((r) => r.requiresReview).length,
      },
    };
  }

  /**
   * Get modification history
   */
  getModificationHistory() {
    return {
      totalModifications: this.modifications.length,
      modifications: this.modifications,
      selfModifications: this.modifications.filter((m) => m.isSelfModification).length,
      recentModifications: this.modifications.slice(-10),
    };
  }
}

export default SelfModifyingAnalyzer;
