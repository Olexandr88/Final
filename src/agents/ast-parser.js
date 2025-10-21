#!/usr/bin/env node
import { parse } from 'acorn';
import * as walk from 'acorn-walk';
import { logger } from '../utils/logger.js';

/**
 * AST-based code parser and analyzer
 * Replaces regex-based parsing with proper Abstract Syntax Tree analysis
 */
class ASTParser {
  constructor() {
    this.parseOptions = {
      ecmaVersion: 2024,
      sourceType: 'module',
      locations: true,
      ranges: true,
      allowHashBang: true,
      allowImportExportEverywhere: true,
      allowReservedWordsAsIdentifiers: true,
    };
  }

  /**
   * Parse code into AST
   * @param {string} code - Source code to parse
   * @param {string} filePath - File path for error reporting
   * @returns {object} AST and metadata
   */
  parseCode(code, filePath = 'unknown') {
    try {
      const ast = parse(code, this.parseOptions);
      return {
        success: true,
        ast,
        filePath,
        errors: [],
      };
    } catch (error) {
      return {
        success: false,
        ast: null,
        filePath,
        errors: [
          {
            message: error.message,
            line: error.loc?.line,
            column: error.loc?.column,
            position: error.pos,
          },
        ],
      };
    }
  }

  /**
   * Analyze code using AST
   * @param {string} code - Source code
   * @param {string} filePath - File path
   * @returns {object} Analysis results
   */
  analyzeCode(code, filePath = 'unknown') {
    const parseResult = this.parseCode(code, filePath);

    if (!parseResult.success) {
      return {
        filePath,
        parseErrors: parseResult.errors,
        issues: [],
        metrics: null,
      };
    }

    const issues = [];
    const metrics = {
      functions: 0,
      classes: 0,
      imports: 0,
      exports: 0,
      variables: 0,
      complexity: 1,
      maxDepth: 0,
      todoComments: 0,
    };

    let currentDepth = 0;

    // AST traversal
    walk.simple(parseResult.ast, {
      FunctionDeclaration: (node) => {
        metrics.functions++;
        this.analyzeFunction(node, issues, metrics);
      },

      FunctionExpression: (node) => {
        metrics.functions++;
        this.analyzeFunction(node, issues, metrics);
      },

      ArrowFunctionExpression: (node) => {
        metrics.functions++;
        this.analyzeFunction(node, issues, metrics);
      },

      ClassDeclaration: (node) => {
        metrics.classes++;
      },

      ImportDeclaration: (node) => {
        metrics.imports++;
      },

      ExportNamedDeclaration: (node) => {
        metrics.exports++;
      },

      ExportDefaultDeclaration: (node) => {
        metrics.exports++;
      },

      VariableDeclaration: (node) => {
        metrics.variables += node.declarations.length;

        // Check for var usage
        if (node.kind === 'var') {
          issues.push({
            type: 'var-usage',
            severity: 'error',
            message: 'Use const/let instead of var',
            line: node.loc.start.line,
            column: node.loc.start.column,
            fix: { kind: 'let' },
          });
        }
      },

      CallExpression: (node) => {
        // Detect console.log
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.name === 'console' &&
          node.callee.property.name === 'log'
        ) {
          issues.push({
            type: 'console-log',
            severity: 'warning',
            message: 'console.log found - remove before production',
            line: node.loc.start.line,
            column: node.loc.start.column,
            fix: { action: 'remove' },
          });
        }
      },

      BinaryExpression: (node) => {
        // Detect == instead of ===
        if (node.operator === '==' || node.operator === '!=') {
          issues.push({
            type: 'weak-equality',
            severity: 'warning',
            message: `Use ${node.operator}= instead of ${node.operator}`,
            line: node.loc.start.line,
            column: node.loc.start.column,
            fix: { operator: node.operator + '=' },
          });
        }
      },

      IfStatement: (node) => {
        metrics.complexity++;
      },

      WhileStatement: (node) => {
        metrics.complexity++;
      },

      ForStatement: (node) => {
        metrics.complexity++;
      },

      ForInStatement: (node) => {
        metrics.complexity++;
      },

      ForOfStatement: (node) => {
        metrics.complexity++;
      },

      SwitchCase: (node) => {
        if (node.test) metrics.complexity++;
      },

      LogicalExpression: (node) => {
        metrics.complexity++;
      },

      ConditionalExpression: (node) => {
        metrics.complexity++;
      },

      CatchClause: (node) => {
        metrics.complexity++;
      },
    });

    // Analyze TODO comments in source
    const lines = code.split('\n');
    lines.forEach((line, idx) => {
      if (line.includes('TODO') || line.includes('FIXME')) {
        metrics.todoComments++;
        issues.push({
          type: 'todo-comment',
          severity: 'info',
          message: 'TODO/FIXME comment found',
          line: idx + 1,
          column: line.indexOf('TODO') !== -1 ? line.indexOf('TODO') : line.indexOf('FIXME'),
        });
      }
    });

    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warningCount = issues.filter((i) => i.severity === 'warning').length;
    const infoCount = issues.filter((i) => i.severity === 'info').length;

    return {
      filePath,
      parseErrors: [],
      issues,
      metrics: {
        ...metrics,
        lines: lines.length,
        errorCount,
        warningCount,
        infoCount,
        qualityScore: Math.max(0, 10 - (errorCount * 2 + warningCount * 0.5)),
      },
    };
  }

  /**
   * Analyze function for complexity and issues
   */
  analyzeFunction(node, issues, metrics) {
    // Check function complexity
    let functionComplexity = 1;

    walk.simple(node, {
      IfStatement: () => functionComplexity++,
      WhileStatement: () => functionComplexity++,
      ForStatement: () => functionComplexity++,
      SwitchCase: (n) => {
        if (n.test) functionComplexity++;
      },
      LogicalExpression: () => functionComplexity++,
      ConditionalExpression: () => functionComplexity++,
      CatchClause: () => functionComplexity++,
    });

    if (functionComplexity > 10) {
      issues.push({
        type: 'high-complexity',
        severity: 'warning',
        message: `Function has cyclomatic complexity of ${functionComplexity} (threshold: 10)`,
        line: node.loc.start.line,
        column: node.loc.start.column,
        complexity: functionComplexity,
      });
    }

    // Check for long functions
    const functionLength = node.loc.end.line - node.loc.start.line;
    if (functionLength > 50) {
      issues.push({
        type: 'long-function',
        severity: 'info',
        message: `Function is ${functionLength} lines (threshold: 50)`,
        line: node.loc.start.line,
        column: node.loc.start.column,
        length: functionLength,
      });
    }
  }

  /**
   * Get function signatures and exports
   */
  extractStructure(code, filePath = 'unknown') {
    const parseResult = this.parseCode(code, filePath);

    if (!parseResult.success) {
      return { functions: [], classes: [], exports: [] };
    }

    const functions = [];
    const classes = [];
    const exports = [];

    walk.simple(parseResult.ast, {
      FunctionDeclaration: (node) => {
        if (node.id) {
          functions.push({
            name: node.id.name,
            params: node.params.map((p) => p.name || p.type),
            line: node.loc.start.line,
            async: node.async,
            generator: node.generator,
          });
        }
      },

      ClassDeclaration: (node) => {
        if (node.id) {
          classes.push({
            name: node.id.name,
            line: node.loc.start.line,
            methods: node.body.body
              .filter((m) => m.type === 'MethodDefinition')
              .map((m) => ({
                name: m.key.name,
                kind: m.kind,
                static: m.static,
              })),
          });
        }
      },

      ExportNamedDeclaration: (node) => {
        if (node.declaration) {
          if (node.declaration.id) {
            exports.push({
              name: node.declaration.id.name,
              type: node.declaration.type,
              line: node.loc.start.line,
            });
          }
        }
      },

      ExportDefaultDeclaration: (node) => {
        exports.push({
          name: 'default',
          type: node.declaration.type,
          line: node.loc.start.line,
        });
      },
    });

    return { functions, classes, exports };
  }
}

export default ASTParser;
