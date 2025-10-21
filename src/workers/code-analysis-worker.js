/**
 * Worker Thread for CPU-Intensive Code Analysis
 * Handles AST parsing, pattern detection, and code metrics
 */
import { parentPort, workerData } from 'worker_threads';

/**
 * Parse code and extract detailed information
 * This would normally use a proper AST parser like @babel/parser or esprima
 */
function analyzeCode(code, language) {
  const result = {
    language,
    metrics: {
      lines: code.split('\n').length,
      chars: code.length,
      complexity: 0,
      functions: 0,
      classes: 0,
      imports: 0,
      exports: 0
    },
    patterns: [],
    issues: []
  };

  try {
    // Extract functions
    const functionRegex = /function\s+([\w]+)\s*\(|const\s+([\w]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g;
    let match;
    const functions = [];
    while ((match = functionRegex.exec(code)) !== null) {
      const funcName = match[1] || match[2];
      functions.push(funcName);
      result.metrics.functions++;
    }

    // Extract classes
    const classRegex = /class\s+([\w]+)/g;
    const classes = [];
    while ((match = classRegex.exec(code)) !== null) {
      classes.push(match[1]);
      result.metrics.classes++;
    }

    // Extract imports
    const importRegex = /import\s+.*from\s+['"]([^'"]+)['"]/g;
    const imports = [];
    while ((match = importRegex.exec(code)) !== null) {
      imports.push(match[1]);
      result.metrics.imports++;
    }

    // Extract exports
    const exportRegex = /export\s+(?:const|let|var|function|class)\s+([\w]+)/g;
    const exports = [];
    while ((match = exportRegex.exec(code)) !== null) {
      exports.push(match[1]);
      result.metrics.exports++;
    }

    // Cyclomatic complexity (simplified)
    const complexityRegex = /if\s*\(|for\s*\(|while\s*\(|case\s+|catch\s*\(|\?\s*:|&&|\|\|/g;
    result.metrics.complexity = (code.match(complexityRegex) || []).length + 1;

    // Detect patterns
    if (code.includes('console.log')) {
      result.patterns.push({
        type: 'debug-code',
        message: 'Console.log statements detected',
        severity: 'info'
      });
    }

    if (code.includes('TODO') || code.includes('FIXME')) {
      result.patterns.push({
        type: 'todo-comment',
        message: 'TODO/FIXME comments found',
        severity: 'info'
      });
    }

    // Security issues
    if (code.includes('eval(') || code.includes('Function(')) {
      result.issues.push({
        type: 'security',
        message: 'Dangerous eval/Function usage detected',
        severity: 'high'
      });
    }

    if (code.includes('innerHTML =')) {
      result.issues.push({
        type: 'security',
        message: 'Potential XSS via innerHTML',
        severity: 'medium'
      });
    }

    // Performance issues
    if (code.match(/for\s*\([^)]*\)\s*{[^}]*for\s*\(/)) {
      result.issues.push({
        type: 'performance',
        message: 'Nested loops detected - O(n²) complexity',
        severity: 'medium'
      });
    }

    if (code.includes('JSON.parse') && code.includes('JSON.stringify')) {
      const parseCount = (code.match(/JSON\.parse/g) || []).length;
      const stringifyCount = (code.match(/JSON\.stringify/g) || []).length;
      if (parseCount + stringifyCount > 5) {
        result.issues.push({
          type: 'performance',
          message: 'Excessive JSON serialization/deserialization',
          severity: 'low'
        });
      }
    }

    // Add detailed breakdown
    result.details = {
      functions,
      classes,
      imports,
      exports
    };

    return result;
  } catch (error) {
    return {
      error: error.message,
      language,
      metrics: result.metrics
    };
  }
}

/**
 * Message handler
 */
parentPort.on('message', (task) => {
  try {
    const { code, language, filePath } = task;

    if (!code) {
      parentPort.postMessage({
        error: 'No code provided'
      });
      return;
    }

    const startTime = Date.now();
    const analysis = analyzeCode(code, language || 'javascript');
    const duration = Date.now() - startTime;

    parentPort.postMessage({
      data: {
        filePath,
        analysis,
        duration,
        workerId: workerData?.workerId
      }
    });
  } catch (error) {
    parentPort.postMessage({
      error: error.message,
      stack: error.stack
    });
  }
});

// Signal ready
if (parentPort) {
  parentPort.postMessage({ ready: true });
}
