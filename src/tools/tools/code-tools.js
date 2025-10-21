/**
 * Code Analysis Tools
 * Provides static code analysis using ESLint and AST parsing
 *
 * @module code-tools
 */

import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { logger } from '../../utils/logger.js';

// ESLint is dynamically imported to avoid runtime errors if not installed
let ESLint = null;

/**
 * Analyze code for issues, bugs, and code smells
 * Performs actual static analysis using ESLint and AST parsing
 *
 * @param {Object} params - Analysis parameters
 * @param {string} params.code - Code string to analyze
 * @param {string} params.language - Programming language (js, ts, jsx, tsx)
 * @param {string} [params.file_path] - Optional file path for context
 * @param {Object} [params.eslint_config] - Custom ESLint configuration
 * @param {boolean} [params.include_metrics] - Include code metrics (default: true)
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Analysis result with issues, suggestions, and metrics
 */
export async function analyzeCode(params, context = {}) {
  const startTime = Date.now();
  const { code, language = 'js', file_path, eslint_config, include_metrics = true } = params;

  logger.info('Code analysis started', {
    agentId: context.agentId,
    executionId: context.executionId,
    language,
    codeLength: code?.length || 0,
    filePath: file_path,
  });

  try {
    // Validate input
    if (!code || typeof code !== 'string') {
      throw new Error('Code parameter must be a non-empty string');
    }

    // Determine if language is supported
    const supportedLanguages = ['js', 'javascript', 'ts', 'typescript', 'jsx', 'tsx'];
    const normalizedLanguage = language.toLowerCase();

    if (!supportedLanguages.includes(normalizedLanguage)) {
      logger.warn('Unsupported language for ESLint analysis', { language });
      return {
        success: true,
        language,
        message: `Analysis for ${language} not fully supported. Basic parsing only.`,
        issues: [],
        suggestions: [],
        metrics: include_metrics ? await calculateBasicMetrics(code) : null,
      };
    }

    // Perform ESLint analysis for JS/TS
    const eslintResults = await performESLintAnalysis(code, {
      language: normalizedLanguage,
      file_path,
      eslint_config,
    });

    // Perform AST-based structural analysis
    const astResults = await performASTAnalysis(code, normalizedLanguage);

    // Combine results
    const issues = [...eslintResults.issues, ...astResults.issues];

    const suggestions = [...eslintResults.suggestions, ...astResults.suggestions];

    // Calculate code metrics if requested
    const metrics = include_metrics ? await calculateCodeMetrics(code, astResults.ast) : null;

    const duration = Date.now() - startTime;

    logger.info('Code analysis completed', {
      agentId: context.agentId,
      executionId: context.executionId,
      duration,
      issueCount: issues.length,
      suggestionCount: suggestions.length,
    });

    return {
      success: true,
      language: normalizedLanguage,
      file_path,
      issues,
      suggestions,
      metrics,
      summary: {
        totalIssues: issues.length,
        errors: issues.filter((i) => i.severity === 'error').length,
        warnings: issues.filter((i) => i.severity === 'warning').length,
        info: issues.filter((i) => i.severity === 'info').length,
        totalSuggestions: suggestions.length,
      },
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('Code analysis failed', {
      agentId: context.agentId,
      executionId: context.executionId,
      error: error.message,
      stack: error.stack,
      duration,
    });

    return {
      success: false,
      error: error.message,
      language,
      file_path,
      issues: [],
      suggestions: [],
      metrics: null,
      duration,
    };
  }
}

/**
 * Perform ESLint analysis on code
 * @private
 */
async function performESLintAnalysis(code, options) {
  const { language, file_path, eslint_config } = options;

  try {
    // Dynamically import ESLint if not already loaded
    if (!ESLint) {
      try {
        const eslintModule = await import('eslint');
        ESLint = eslintModule.ESLint;
      } catch (importError) {
        logger.warn('ESLint not available, skipping ESLint analysis', {
          error: importError.message,
        });
        return { issues: [], suggestions: [] };
      }
    }

    // Determine file extension
    const ext = language.includes('ts') ? '.ts' : '.js';
    const filename = file_path || `temp${ext}`;

    // Create ESLint instance with configuration
    const eslint = new ESLint({
      useEslintrc: false,
      overrideConfig: eslint_config || getDefaultESLintConfig(language),
      fix: false,
    });

    // Lint the code
    const results = await eslint.lintText(code, {
      filePath: filename,
    });

    const issues = [];
    const suggestions = [];

    // Process ESLint results
    if (results && results.length > 0) {
      const result = results[0];

      result.messages.forEach((msg) => {
        const issue = {
          type: 'eslint',
          severity: msg.severity === 2 ? 'error' : msg.severity === 1 ? 'warning' : 'info',
          message: msg.message,
          rule: msg.ruleId,
          line: msg.line,
          column: msg.column,
          endLine: msg.endLine,
          endColumn: msg.endColumn,
          fixable: msg.fix ? true : false,
        };

        issues.push(issue);

        // Generate suggestions for fixable issues
        if (msg.fix) {
          suggestions.push({
            type: 'auto-fix',
            message: `Auto-fix available for: ${msg.message}`,
            rule: msg.ruleId,
            line: msg.line,
            fix: msg.fix,
          });
        }
      });
    }

    return { issues, suggestions };
  } catch (error) {
    logger.error('ESLint analysis failed', { error: error.message });
    return {
      issues: [
        {
          type: 'eslint-error',
          severity: 'error',
          message: `ESLint analysis error: ${error.message}`,
          line: 0,
          column: 0,
        },
      ],
      suggestions: [],
    };
  }
}

/**
 * Get default ESLint configuration for language
 * @private
 */
function getDefaultESLintConfig(language) {
  const baseConfig = {
    env: {
      es2022: true,
      node: true,
      browser: true,
    },
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      ecmaFeatures: {
        jsx: language.includes('jsx') || language.includes('tsx'),
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'error',
      'no-console': 'off',
      semi: ['warn', 'always'],
      quotes: ['warn', 'single'],
      'no-debugger': 'warn',
      'no-unreachable': 'error',
      'no-const-assign': 'error',
      'no-duplicate-case': 'error',
      'no-empty': 'warn',
      'no-extra-semi': 'warn',
      'no-func-assign': 'error',
      'no-irregular-whitespace': 'warn',
      'no-redeclare': 'error',
      'no-sparse-arrays': 'warn',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      eqeqeq: ['warn', 'always'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-with': 'error',
    },
  };

  // Add TypeScript parser if needed
  if (language.includes('ts')) {
    baseConfig.parser = '@typescript-eslint/parser';
    baseConfig.plugins = ['@typescript-eslint'];
    baseConfig.extends = ['plugin:@typescript-eslint/recommended'];
  }

  return baseConfig;
}

/**
 * Perform AST-based structural analysis
 * @private
 */
async function performASTAnalysis(code, language) {
  try {
    // Parse code to AST
    const ast = acorn.parse(code, {
      ecmaVersion: 2022,
      sourceType: 'module',
      locations: true,
      ranges: true,
    });

    const issues = [];
    const suggestions = [];

    // Analyze AST for patterns and code smells
    const analysisState = {
      functionCount: 0,
      largeFunction: [],
      deepNesting: [],
      complexExpressions: [],
      unusedParameters: [],
      todoComments: [],
    };

    // Walk the AST
    walk.simple(ast, {
      FunctionDeclaration(node) {
        analysisState.functionCount++;
        checkFunctionComplexity(node, analysisState, issues, suggestions);
      },
      FunctionExpression(node) {
        analysisState.functionCount++;
        checkFunctionComplexity(node, analysisState, issues, suggestions);
      },
      ArrowFunctionExpression(node) {
        analysisState.functionCount++;
        checkFunctionComplexity(node, analysisState, issues, suggestions);
      },
      BlockStatement(node) {
        checkNestingDepth(node, 0, analysisState, issues);
      },
      CallExpression(node) {
        checkCallExpression(node, issues, suggestions);
      },
    });

    return { ast, issues, suggestions, analysisState };
  } catch (error) {
    logger.warn('AST parsing failed, code may have syntax errors', { error: error.message });
    return {
      ast: null,
      issues: [
        {
          type: 'syntax-error',
          severity: 'error',
          message: `Syntax error: ${error.message}`,
          line: error.loc?.line || 0,
          column: error.loc?.column || 0,
        },
      ],
      suggestions: [],
      analysisState: {},
    };
  }
}

/**
 * Check function complexity
 * @private
 */
function checkFunctionComplexity(node, state, issues, suggestions) {
  // Calculate function length
  if (node.loc) {
    const length = node.loc.end.line - node.loc.start.line;

    if (length > 50) {
      state.largeFunction.push(node);
      issues.push({
        type: 'code-smell',
        severity: 'warning',
        message: `Function is too long (${length} lines). Consider breaking it down.`,
        line: node.loc.start.line,
        column: node.loc.start.column,
        category: 'complexity',
      });

      suggestions.push({
        type: 'refactor',
        message: 'Extract smaller functions for better readability and maintainability',
        line: node.loc.start.line,
        category: 'complexity',
      });
    }
  }

  // Check parameter count
  if (node.params && node.params.length > 5) {
    issues.push({
      type: 'code-smell',
      severity: 'warning',
      message: `Function has too many parameters (${node.params.length}). Consider using an options object.`,
      line: node.loc?.start.line || 0,
      column: node.loc?.start.column || 0,
      category: 'complexity',
    });
  }
}

/**
 * Check nesting depth
 * @private
 */
function checkNestingDepth(node, depth, state, issues) {
  if (depth > 4) {
    state.deepNesting.push({ node, depth });
    issues.push({
      type: 'code-smell',
      severity: 'warning',
      message: `Deep nesting detected (depth: ${depth}). Consider refactoring.`,
      line: node.loc?.start.line || 0,
      column: node.loc?.start.column || 0,
      category: 'complexity',
    });
  }

  // Recursively check nested blocks
  if (node.body && Array.isArray(node.body)) {
    node.body.forEach((child) => {
      if (child.type === 'BlockStatement' || child.type === 'IfStatement') {
        checkNestingDepth(child, depth + 1, state, issues);
      }
    });
  }
}

/**
 * Check call expressions for common issues
 * @private
 */
function checkCallExpression(node, issues, suggestions) {
  // Check for console.log usage
  if (
    node.callee.type === 'MemberExpression' &&
    node.callee.object.name === 'console' &&
    node.callee.property.name === 'log'
  ) {
    suggestions.push({
      type: 'best-practice',
      message: 'Consider using a proper logger instead of console.log',
      line: node.loc?.start.line || 0,
      category: 'logging',
    });
  }

  // Check for eval usage
  if (node.callee.name === 'eval') {
    issues.push({
      type: 'security',
      severity: 'error',
      message: 'Use of eval() is dangerous and should be avoided',
      line: node.loc?.start.line || 0,
      column: node.loc?.start.column || 0,
      category: 'security',
    });
  }
}

/**
 * Calculate code metrics
 * @private
 */
async function calculateCodeMetrics(code, ast) {
  const lines = code.split('\n');
  const metrics = {
    totalLines: lines.length,
    codeLines: 0,
    commentLines: 0,
    blankLines: 0,
    functions: 0,
    classes: 0,
    complexity: 0,
    maintainabilityIndex: 0,
  };

  // Count code, comment, and blank lines
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed === '') {
      metrics.blankLines++;
    } else if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      metrics.commentLines++;
    } else {
      metrics.codeLines++;
    }
  });

  // If AST is available, extract more detailed metrics
  if (ast) {
    walk.simple(ast, {
      FunctionDeclaration() {
        metrics.functions++;
      },
      FunctionExpression() {
        metrics.functions++;
      },
      ArrowFunctionExpression() {
        metrics.functions++;
      },
      ClassDeclaration() {
        metrics.classes++;
      },
      IfStatement() {
        metrics.complexity++;
      },
      WhileStatement() {
        metrics.complexity++;
      },
      ForStatement() {
        metrics.complexity++;
      },
      SwitchCase() {
        metrics.complexity++;
      },
      ConditionalExpression() {
        metrics.complexity++;
      },
    });
  }

  // Calculate maintainability index (simplified version)
  // MI = max(0, (171 - 5.2 * ln(Halstead Volume) - 0.23 * (Cyclomatic Complexity) - 16.2 * ln(Lines of Code)) * 100 / 171)
  // Simplified: 100 - (complexity_penalty + size_penalty)
  const complexityPenalty = Math.min(50, metrics.complexity * 2);
  const sizePenalty = Math.min(30, metrics.codeLines / 10);
  metrics.maintainabilityIndex = Math.max(0, 100 - complexityPenalty - sizePenalty);

  return metrics;
}

/**
 * Calculate basic metrics for unsupported languages
 * @private
 */
async function calculateBasicMetrics(code) {
  const lines = code.split('\n');
  return {
    totalLines: lines.length,
    codeLines: lines.filter((l) => l.trim() !== '').length,
    blankLines: lines.filter((l) => l.trim() === '').length,
    estimatedComplexity: 'N/A (language not supported)',
  };
}

/**
 * Format code using prettier (if available)
 * @param {Object} params - Parameters
 * @param {string} params.code - Code to format
 * @param {string} params.language - Language
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Formatted code
 */
export async function formatCode(params, context) {
  const { code, language } = params;

  try {
    // Try to use prettier if available
    const prettier = await import('prettier');
    const formatted = await prettier.format(code, {
      parser: language === 'ts' ? 'typescript' : 'babel',
      semi: true,
      singleQuote: true,
      tabWidth: 2,
    });

    return {
      formatted: true,
      code: formatted,
    };
  } catch (error) {
    logger.warn('Prettier not available, returning original code', {
      error: error.message,
    });

    return {
      formatted: false,
      code,
    };
  }
}

/**
 * Tool schema for LLM function calling
 */
export const analyzeCodeSchema = {
  name: 'analyze_code',
  description:
    'Analyze code for issues, bugs, code smells, and calculate metrics using ESLint and AST parsing',
  input_schema: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'The code to analyze',
      },
      language: {
        type: 'string',
        description: 'Programming language (js, ts, jsx, tsx)',
        default: 'js',
      },
      file_path: {
        type: 'string',
        description: 'Optional file path for context',
      },
      eslint_config: {
        type: 'object',
        description: 'Custom ESLint configuration',
      },
      include_metrics: {
        type: 'boolean',
        description: 'Include code metrics in results',
        default: true,
      },
    },
    required: ['code'],
  },
};
