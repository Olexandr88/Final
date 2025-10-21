#!/usr/bin/env node
/**
 * MCP Server Usage Example
 * Demonstrates how to use the MCP server programmatically
 */

import { MCPServer } from '../src/mcp/mcp-server.js';
import { logger } from '../src/utils/logger.js';

/**
 * Example: Using MCP Server Tools
 */
async function demonstrateMCPTools() {
  logger.info('Starting MCP Server demonstration...');

  // Create MCP server instance
  const server = new MCPServer({
    name: 'example-mcp',
    version: '1.0.0',
    debug: true,
  });

  try {
    // Example 1: Analyze code
    logger.info('\n=== Example 1: Code Analysis ===');
    const codeToAnalyze = `
function fetchUserData(userId) {
  return fetch('/api/users/' + userId)
    .then(response => response.json());
}

const user = fetchUserData(123);
console.log(user);
    `;

    const analysisResult = await server._handleAnalyzeCode({
      code: codeToAnalyze,
      filepath: 'example.js',
    });

    logger.info('Analysis Result:', {
      qualityScore: analysisResult.metrics.qualityScore,
      totalIssues: analysisResult.issues.total,
      errors: analysisResult.issues.errors,
      warnings: analysisResult.issues.warnings,
    });

    if (analysisResult.details.length > 0) {
      logger.info('Issues found:');
      analysisResult.details.forEach((issue) => {
        logger.info(`  Line ${issue.line}: [${issue.severity}] ${issue.message}`);
      });
    }

    // Example 2: Execute command
    logger.info('\n=== Example 2: Command Execution ===');
    const commandResult = await server._handleExecuteCommand({
      command: 'node --version',
    });

    if (commandResult.success) {
      logger.info('Command output:', commandResult.stdout.trim());
    } else {
      logger.error('Command failed:', commandResult.stderr);
    }

    // Example 3: Get session context
    logger.info('\n=== Example 3: Session Context ===');
    const contextResult = await server._handleGetContext({
      includeHistory: false,
    });

    logger.info('Session Info:', {
      sessionId: contextResult.session.id.slice(0, 8),
      pid: contextResult.session.pid,
      status: contextResult.session.status,
      uptime: Math.round(contextResult.session.uptime / 1000) + 's',
    });

    // Example 4: File operations
    logger.info('\n=== Example 4: File Operations ===');

    // Write file
    const writeResult = await server._handleWriteFile({
      filepath: 'example-output.txt',
      content: 'Hello from MCP Server!\nTimestamp: ' + new Date().toISOString(),
      createBackup: false,
    });

    logger.info('File written:', writeResult.filepath);

    // Read file
    const readResult = await server._handleReadFile({
      filepath: writeResult.filepath,
    });

    logger.info('File content:', readResult.content);

    // Example 5: Run tests (optional, may fail if no tests available)
    logger.info('\n=== Example 5: Test Execution ===');
    try {
      const testResult = await server._handleRunTests({
        pattern: 'tests/mcp-server.test.js',
        timeout: 10000,
        parallel: false,
      });

      if (testResult.success) {
        logger.info('Test Results:', {
          passed: testResult.passed,
          failed: testResult.failed,
          duration: testResult.duration + 'ms',
        });
      } else {
        logger.warn('Tests failed:', testResult.error);
      }
    } catch (error) {
      logger.warn('Test execution skipped:', error.message);
    }

    logger.info('\n=== Demonstration Complete ===');
  } catch (error) {
    logger.error('Demonstration error:', error.message);
    throw error;
  } finally {
    // Cleanup
    await server.cleanup();
  }
}

/**
 * Main entry point
 */
async function main() {
  try {
    await demonstrateMCPTools();
    process.exit(0);
  } catch (error) {
    logger.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { demonstrateMCPTools };
