#!/usr/bin/env node
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import SelfModifyingAnalyzer from './self-modifying-analyzer.js';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

/**
 * Verification Loop System
 * Continuously verifies code quality and applies improvements
 */
class VerificationLoop {
  constructor(options = {}) {
    this.analyzer = new SelfModifyingAnalyzer({
      safeMode: options.safeMode !== false,
      backupEnabled: options.backupEnabled !== false,
    });

    this.verificationConfig = {
      maxIterations: options.maxIterations || 5,
      qualityThreshold: options.qualityThreshold || 8.0,
      runTests: options.runTests !== false,
      runLinter: options.runLinter !== false,
      autoFix: options.autoFix !== false,
      verifyBuild: options.verifyBuild !== false,
    };

    this.iterations = [];
    this.currentIteration = 0;
  }

  /**
   * Run verification loop on file
   * @param {string} filePath - File to verify
   * @param {object} options - Verification options
   * @returns {object} Verification results
   */
  async runVerificationLoop(filePath, options = {}) {
    logger.info(`\n🔄 Starting verification loop for ${filePath}\n`);

    const startTime = Date.now();
    this.currentIteration = 0;
    let previousQuality = 0;
    let converged = false;

    while (this.currentIteration < this.verificationConfig.maxIterations && !converged) {
      this.currentIteration++;
      logger.info(
        `\n=== Iteration ${this.currentIteration}/${this.verificationConfig.maxIterations} ===\n`
      );

      const iteration = await this.runSingleIteration(filePath, options);
      this.iterations.push(iteration);

      // Check convergence
      const currentQuality = iteration.analysis?.metrics?.qualityScore || 0;

      if (currentQuality >= this.verificationConfig.qualityThreshold) {
        logger.info(`✅ Quality threshold reached: ${currentQuality.toFixed(2)}`);
        converged = true;
      } else if (Math.abs(currentQuality - previousQuality) < 0.1) {
        logger.info('✅ Quality score converged');
        converged = true;
      }

      previousQuality = currentQuality;

      if (!converged && this.currentIteration < this.verificationConfig.maxIterations) {
        logger.info(`Current quality: ${currentQuality.toFixed(2)}, continuing...\n`);
      }
    }

    const duration = Date.now() - startTime;

    return {
      filePath,
      iterations: this.iterations.length,
      converged,
      finalQuality: previousQuality,
      duration,
      results: this.iterations,
      summary: this.summarizeVerification(),
    };
  }

  /**
   * Run single verification iteration
   */
  async runSingleIteration(filePath, options = {}) {
    const iteration = {
      number: this.currentIteration,
      timestamp: Date.now(),
      steps: [],
    };

    try {
      // Step 1: Analyze code
      logger.info('📊 Step 1: Analyzing code...');
      const code = await fs.promises.readFile(filePath, 'utf8');
      const analysis = this.analyzer.analyzeWithContext(code, filePath, {
        source: 'verification-loop',
      });

      iteration.analysis = analysis;
      iteration.steps.push({
        name: 'analysis',
        success: true,
        issues: analysis.issues?.length || 0,
        quality: analysis.metrics?.qualityScore,
      });

      logger.info(
        `Found ${analysis.issues?.length || 0} issues, quality: ${analysis.metrics?.qualityScore?.toFixed(2)}`
      );

      // Step 2: Propose improvements
      if (analysis.issues && analysis.issues.length > 0) {
        logger.info('🔧 Step 2: Proposing improvements...');

        const proposal = await this.analyzer.proposeSelfModifications(filePath, {
          removeConsoleLogs: options.removeConsoleLogs,
        });

        iteration.proposal = proposal;
        iteration.steps.push({
          name: 'proposal',
          success: true,
          modifications: proposal.proposedModifications?.length || 0,
        });

        logger.info(`Proposed ${proposal.proposedModifications?.length || 0} modifications`);

        // Step 3: Apply safe modifications
        if (this.verificationConfig.autoFix && proposal.safetyStatus?.canAutoApply) {
          logger.info('✏️  Step 3: Applying safe modifications...');

          const result = await this.analyzer.applySelfModifications(
            filePath,
            proposal.proposedModifications,
            { force: false }
          );

          iteration.modifications = result;
          iteration.steps.push({
            name: 'modifications',
            success: result.success,
            applied: result.applied?.length || 0,
          });

          logger.info(`Applied ${result.applied?.length || 0} modifications`);
        } else {
          logger.info('⏭️  Step 3: Skipping modifications (not safe or autoFix disabled)');
        }
      } else {
        logger.info('✅ No issues found');
      }

      // Step 4: Run linter
      if (this.verificationConfig.runLinter) {
        logger.info('🔍 Step 4: Running linter...');
        const lintResult = await this.runLinter(filePath);
        iteration.lint = lintResult;
        iteration.steps.push({
          name: 'lint',
          success: lintResult.success,
          errors: lintResult.errors || 0,
        });

        if (lintResult.success) {
          logger.info('✅ Linter passed');
        } else {
          logger.info(`⚠️  Linter found ${lintResult.errors} errors`);
        }
      }

      // Step 5: Verify syntax
      logger.info('✔️  Step 5: Verifying syntax...');
      const syntaxCheck = await this.verifySyntax(filePath);
      iteration.syntax = syntaxCheck;
      iteration.steps.push({
        name: 'syntax',
        success: syntaxCheck.valid,
      });

      if (syntaxCheck.valid) {
        logger.info('✅ Syntax valid');
      } else {
        logger.info(`❌ Syntax error: ${syntaxCheck.error}`);
      }

      iteration.success = iteration.steps.every((s) => s.success);
    } catch (error) {
      logger.error(`❌ Iteration failed: ${error.message}`);
      iteration.error = error.message;
      iteration.success = false;
    }

    return iteration;
  }

  /**
   * Run verification loop on directory
   */
  async runDirectoryVerification(dirPath, options = {}) {
    logger.info(`\n🔄 Starting directory verification: ${dirPath}\n`);

    const results = await this.analyzer.analyzeDirectory(dirPath, {
      recursive: options.recursive !== false,
    });

    const fileResults = [];

    for (const fileAnalysis of results.results) {
      if (fileAnalysis.error) continue;

      const needsImprovement =
        (fileAnalysis.metrics?.qualityScore || 10) < this.verificationConfig.qualityThreshold;

      if (needsImprovement && this.verificationConfig.autoFix) {
        logger.info(`\n🔧 Processing ${fileAnalysis.filePath}...`);
        const verificationResult = await this.runVerificationLoop(fileAnalysis.filePath, options);
        fileResults.push(verificationResult);
      } else {
        logger.info(
          `✅ ${fileAnalysis.filePath} quality: ${fileAnalysis.metrics?.qualityScore?.toFixed(2)}`
        );
      }
    }

    return {
      directory: dirPath,
      filesProcessed: results.fileCount,
      filesImproved: fileResults.length,
      results: fileResults,
      summary: results.summary,
    };
  }

  /**
   * Run linter on file
   */
  async runLinter(filePath) {
    try {
      const { stdout, stderr } = await execAsync(`npx eslint ${filePath} --format json`, {
        cwd: process.cwd(),
      });

      const result = JSON.parse(stdout);
      const fileResult = result[0] || {};

      return {
        success: fileResult.errorCount === 0,
        errors: fileResult.errorCount || 0,
        warnings: fileResult.warningCount || 0,
        messages: fileResult.messages || [],
      };
    } catch (error) {
      // ESLint returns non-zero exit code if errors found
      if (error.stdout) {
        try {
          const result = JSON.parse(error.stdout);
          const fileResult = result[0] || {};

          return {
            success: false,
            errors: fileResult.errorCount || 0,
            warnings: fileResult.warningCount || 0,
            messages: fileResult.messages || [],
          };
        } catch (parseError) {
          // Continue to generic error handling
        }
      }

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Verify syntax of file
   */
  async verifySyntax(filePath) {
    try {
      const code = await fs.promises.readFile(filePath, 'utf8');
      const { parse } = await import('acorn');

      parse(code, {
        ecmaVersion: 2024,
        sourceType: 'module',
      });

      return {
        valid: true,
        filePath,
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
        filePath,
      };
    }
  }

  /**
   * Verify build
   */
  async verifyBuild() {
    try {
      logger.info('🏗️  Running build...');
      const { stdout, stderr } = await execAsync('npm run build', {
        cwd: process.cwd(),
      });

      return {
        success: true,
        output: stdout,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        output: error.stderr || error.stdout,
      };
    }
  }

  /**
   * Run tests
   */
  async runTests() {
    try {
      logger.info('🧪 Running tests...');
      const { stdout, stderr } = await execAsync('npm test', {
        cwd: process.cwd(),
      });

      return {
        success: true,
        output: stdout,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        output: error.stderr || error.stdout,
      };
    }
  }

  /**
   * Full verification cycle (analyze → modify → build → test)
   */
  async runFullVerification(filePath, options = {}) {
    logger.info('\n🚀 Running full verification cycle\n');

    const results = {
      filePath,
      timestamp: Date.now(),
      steps: [],
    };

    // Step 1: Verification loop
    logger.info('Step 1: Verification loop');
    const loopResult = await this.runVerificationLoop(filePath, options);
    results.verificationLoop = loopResult;
    results.steps.push({ name: 'verification-loop', success: loopResult.converged });

    // Step 2: Build
    if (this.verificationConfig.verifyBuild) {
      logger.info('\nStep 2: Build verification');
      const buildResult = await this.verifyBuild();
      results.build = buildResult;
      results.steps.push({ name: 'build', success: buildResult.success });

      if (!buildResult.success) {
        logger.error('❌ Build failed:', buildResult.error);
        return results;
      }
    }

    // Step 3: Tests
    if (this.verificationConfig.runTests) {
      logger.info('\nStep 3: Test execution');
      const testResult = await this.runTests();
      results.tests = testResult;
      results.steps.push({ name: 'tests', success: testResult.success });

      if (!testResult.success) {
        logger.error('❌ Tests failed:', testResult.error);
        return results;
      }
    }

    results.success = results.steps.every((s) => s.success);
    return results;
  }

  /**
   * Summarize verification results
   */
  summarizeVerification() {
    const totalSteps = this.iterations.reduce((sum, i) => sum + (i.steps?.length || 0), 0);
    const successfulSteps = this.iterations.reduce(
      (sum, i) => sum + (i.steps?.filter((s) => s.success).length || 0),
      0
    );

    const totalModifications = this.iterations.reduce(
      (sum, i) => sum + (i.modifications?.applied?.length || 0),
      0
    );

    return {
      totalIterations: this.iterations.length,
      totalSteps,
      successfulSteps,
      successRate: totalSteps > 0 ? successfulSteps / totalSteps : 0,
      totalModifications,
      qualityProgression: this.iterations.map((i) => ({
        iteration: i.number,
        quality: i.analysis?.metrics?.qualityScore,
        issues: i.analysis?.issues?.length,
      })),
    };
  }

  /**
   * Reset verification state
   */
  reset() {
    this.iterations = [];
    this.currentIteration = 0;
  }
}

export default VerificationLoop;
