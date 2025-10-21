#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import ASTParser from './ast-parser.js';
import { logger } from '../utils/logger.js';

/**
 * Context-Aware Code Analyzer
 * Knows when it's analyzing itself and can provide self-referential analysis
 */
class ContextAwareAnalyzer {
  constructor() {
    this.astParser = new ASTParser();
    this.selfFilePaths = new Set();
    this.analysisHistory = [];
    this.selfAnalysisDepth = 0;
    this.maxSelfAnalysisDepth = 3; // Prevent infinite recursion

    // Register self-awareness
    this.registerSelfFiles();
  }

  /**
   * Register files that are part of this analysis system
   */
  registerSelfFiles() {
    const selfFiles = [
      'src/agents/ast-parser.js',
      'src/agents/context-aware-analyzer.js',
      'src/agents/self-modifying-analyzer.js',
      'src/agents/verification-loop.js',
      'src/agents/code-analyzer-agent.js',
      'src/agents/code-fixer-agent.js',
    ];

    selfFiles.forEach((file) => {
      this.selfFilePaths.add(path.normalize(file));
      this.selfFilePaths.add(path.resolve(file));
    });
  }

  /**
   * Check if analyzing self
   * @param {string} filePath - Path to file being analyzed
   * @returns {boolean} True if analyzing self
   */
  isAnalyzingSelf(filePath) {
    const normalizedPath = path.normalize(filePath);
    const resolvedPath = path.resolve(filePath);

    return (
      this.selfFilePaths.has(normalizedPath) ||
      this.selfFilePaths.has(resolvedPath) ||
      normalizedPath.includes('code-analyzer') ||
      normalizedPath.includes('ast-parser') ||
      normalizedPath.includes('self-modifying') ||
      normalizedPath.includes('verification-loop')
    );
  }

  /**
   * Analyze code with context awareness
   * @param {string} code - Source code
   * @param {string} filePath - File path
   * @param {object} context - Additional context
   * @returns {object} Analysis results with context
   */
  analyzeWithContext(code, filePath = 'unknown', context = {}) {
    const isSelfAnalysis = this.isAnalyzingSelf(filePath);

    if (isSelfAnalysis) {
      this.selfAnalysisDepth++;

      if (this.selfAnalysisDepth > this.maxSelfAnalysisDepth) {
        logger.warn(`⚠️  Self-analysis depth limit reached (${this.maxSelfAnalysisDepth})`);
        this.selfAnalysisDepth--;
        return {
          filePath,
          selfAnalysis: true,
          depthLimitReached: true,
          message: 'Self-analysis depth limit reached to prevent recursion',
        };
      }

      logger.info(`🔍 Self-analysis detected: ${filePath} (depth: ${this.selfAnalysisDepth})`);
    }

    // Perform AST-based analysis
    const analysis = this.astParser.analyzeCode(code, filePath);

    // Add context metadata
    const contextualAnalysis = {
      ...analysis,
      context: {
        isSelfAnalysis,
        analysisDepth: this.selfAnalysisDepth,
        timestamp: Date.now(),
        analyzer: 'ContextAwareAnalyzer',
        requestSource: context.source || 'unknown',
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          cwd: process.cwd(),
        },
      },
      recommendations: [],
    };

    // Add self-aware recommendations
    if (isSelfAnalysis) {
      contextualAnalysis.recommendations.push({
        type: 'self-improvement',
        priority: 'high',
        message:
          'This is a self-analysis. Consider improvements that enhance analysis capabilities.',
        suggestions: this.generateSelfImprovementSuggestions(analysis),
      });
    }

    // Add context-based recommendations
    if (analysis.metrics) {
      if (analysis.metrics.complexity > 20) {
        contextualAnalysis.recommendations.push({
          type: 'refactoring',
          priority: 'high',
          message: 'High complexity detected. Consider refactoring.',
          metrics: { complexity: analysis.metrics.complexity },
        });
      }

      if (analysis.metrics.functions > 10 && analysis.metrics.classes === 0) {
        contextualAnalysis.recommendations.push({
          type: 'architecture',
          priority: 'medium',
          message: 'Consider using classes to organize multiple functions.',
          metrics: { functions: analysis.metrics.functions },
        });
      }
    }

    // Track analysis history
    this.analysisHistory.push({
      filePath,
      timestamp: Date.now(),
      isSelfAnalysis,
      issueCount: analysis.issues?.length || 0,
      qualityScore: analysis.metrics?.qualityScore,
    });

    if (isSelfAnalysis) {
      this.selfAnalysisDepth--;
    }

    return contextualAnalysis;
  }

  /**
   * Generate self-improvement suggestions
   */
  generateSelfImprovementSuggestions(analysis) {
    const suggestions = [];

    if (analysis.metrics?.complexity > 15) {
      suggestions.push('Reduce cyclomatic complexity by extracting helper functions');
    }

    if (analysis.metrics?.todoComments > 0) {
      suggestions.push('Address TODO comments to improve code completeness');
    }

    if (analysis.issues?.some((i) => i.type === 'console-log')) {
      suggestions.push('Replace console.log with proper logging framework');
    }

    if (analysis.metrics?.functions > 20) {
      suggestions.push('Consider splitting into multiple modules for better organization');
    }

    return suggestions;
  }

  /**
   * Get analysis statistics
   */
  getAnalysisStats() {
    const total = this.analysisHistory.length;
    const selfAnalysisCount = this.analysisHistory.filter((h) => h.isSelfAnalysis).length;

    return {
      totalAnalyses: total,
      selfAnalyses: selfAnalysisCount,
      externalAnalyses: total - selfAnalysisCount,
      selfAnalysisRatio: total > 0 ? selfAnalysisCount / total : 0,
      averageQualityScore:
        total > 0
          ? this.analysisHistory.reduce((sum, h) => sum + (h.qualityScore || 0), 0) / total
          : 0,
      recentAnalyses: this.analysisHistory.slice(-10),
    };
  }

  /**
   * Analyze directory with context
   */
  async analyzeDirectory(dirPath, options = {}) {
    const results = [];
    const files = this.getJavaScriptFiles(dirPath, options.recursive !== false);

    for (const file of files) {
      try {
        const code = fs.readFileSync(file, 'utf8');
        const analysis = this.analyzeWithContext(code, file, {
          source: 'directory-scan',
          recursive: options.recursive,
        });
        results.push(analysis);
      } catch (error) {
        results.push({
          filePath: file,
          error: error.message,
          context: { source: 'directory-scan' },
        });
      }
    }

    return {
      directory: dirPath,
      fileCount: files.length,
      results,
      summary: this.summarizeResults(results),
    };
  }

  /**
   * Get JavaScript files in directory
   */
  getJavaScriptFiles(dirPath, recursive = true) {
    const files = [];

    const scan = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && recursive) {
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            scan(fullPath);
          }
        } else if (entry.isFile() && /\.(js|mjs|cjs)$/.test(entry.name)) {
          files.push(fullPath);
        }
      }
    };

    scan(dirPath);
    return files;
  }

  /**
   * Summarize analysis results
   */
  summarizeResults(results) {
    const totalIssues = results.reduce((sum, r) => sum + (r.issues?.length || 0), 0);
    const avgQuality =
      results.reduce((sum, r) => sum + (r.metrics?.qualityScore || 0), 0) / results.length;

    return {
      totalFiles: results.length,
      totalIssues,
      averageQualityScore: avgQuality,
      issuesByType: this.groupIssuesByType(results),
      severityCounts: this.countBySeverity(results),
      selfAnalysisFiles: results.filter((r) => r.context?.isSelfAnalysis).length,
    };
  }

  /**
   * Group issues by type
   */
  groupIssuesByType(results) {
    const grouped = {};

    results.forEach((result) => {
      result.issues?.forEach((issue) => {
        grouped[issue.type] = (grouped[issue.type] || 0) + 1;
      });
    });

    return grouped;
  }

  /**
   * Count issues by severity
   */
  countBySeverity(results) {
    const counts = { error: 0, warning: 0, info: 0 };

    results.forEach((result) => {
      result.issues?.forEach((issue) => {
        counts[issue.severity] = (counts[issue.severity] || 0) + 1;
      });
    });

    return counts;
  }
}

export default ContextAwareAnalyzer;
