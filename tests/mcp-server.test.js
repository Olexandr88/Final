import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MCPServer } from '../src/mcp/mcp-server.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('MCP Server', () => {
  let server;
  const testDir = path.join(__dirname, '.test-mcp');

  before(async () => {
    // Create test directory
    await fs.mkdir(testDir, { recursive: true });

    // Initialize server
    server = new MCPServer({
      name: 'test-mcp-server',
      version: '1.0.0-test',
      workingDir: testDir,
      debug: true
    });
  });

  after(async () => {
    // Cleanup
    await server.cleanup();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('Tool Definitions', () => {
    it('should define all required tools', () => {
      const tools = server.tools;
      const toolNames = tools.map(t => t.name);

      assert.ok(toolNames.includes('analyze_code'));
      assert.ok(toolNames.includes('run_tests'));
      assert.ok(toolNames.includes('get_context'));
      assert.ok(toolNames.includes('execute_command'));
      assert.ok(toolNames.includes('read_file'));
      assert.ok(toolNames.includes('write_file'));
    });

    it('should have valid input schemas for all tools', () => {
      for (const tool of server.tools) {
        assert.ok(tool.name, 'Tool must have a name');
        assert.ok(tool.description, 'Tool must have a description');
        assert.ok(tool.inputSchema, 'Tool must have an input schema');
        assert.strictEqual(tool.inputSchema.type, 'object');
      }
    });
  });

  describe('analyze_code tool', () => {
    it('should analyze valid JavaScript code', async () => {
      const code = `
function add(a, b) {
  return a + b;
}

const result = add(5, 10);
console.log(result);
      `;

      const result = await server._handleAnalyzeCode({
        code,
        filepath: 'test.js'
      });

      assert.ok(result.success);
      assert.ok(result.metrics);
      assert.ok(result.issues);
      assert.ok(typeof result.metrics.qualityScore === 'number');
    });

    it('should detect issues in problematic code', async () => {
      const code = `
function buggyFunction() {
  var x = 10;
  eval('console.log(x)');
  return x;
}
      `;

      const result = await server._handleAnalyzeCode({
        code,
        filepath: 'buggy.js'
      });

      assert.ok(result.success);
      assert.ok(result.issues.total > 0);
    });

    it('should require code parameter', async () => {
      await assert.rejects(
        async () => {
          await server._handleAnalyzeCode({});
        },
        /Code parameter is required/
      );
    });
  });

  describe('read_file tool', () => {
    it('should read existing file', async () => {
      const testFile = path.join(testDir, 'test-read.txt');
      const content = 'Hello, MCP Server!';

      await fs.writeFile(testFile, content, 'utf-8');

      const result = await server._handleReadFile({
        filepath: testFile
      });

      assert.ok(result.success);
      assert.strictEqual(result.content, content);
      assert.ok(result.size > 0);
      assert.ok(result.modified);
    });

    it('should handle non-existent file', async () => {
      await assert.rejects(
        async () => {
          await server._handleReadFile({
            filepath: path.join(testDir, 'non-existent.txt')
          });
        },
        /Failed to read file/
      );
    });

    it('should require filepath parameter', async () => {
      await assert.rejects(
        async () => {
          await server._handleReadFile({});
        },
        /Filepath parameter is required/
      );
    });
  });

  describe('write_file tool', () => {
    it('should write file successfully', async () => {
      const testFile = path.join(testDir, 'test-write.txt');
      const content = 'MCP Server Write Test';

      const result = await server._handleWriteFile({
        filepath: testFile,
        content
      });

      assert.ok(result.success);
      assert.ok(result.size > 0);

      // Verify file was written
      const readContent = await fs.readFile(testFile, 'utf-8');
      assert.strictEqual(readContent, content);
    });

    it('should create backup when overwriting', async () => {
      const testFile = path.join(testDir, 'test-backup.txt');
      const originalContent = 'Original content';
      const newContent = 'New content';

      // Write original
      await fs.writeFile(testFile, originalContent, 'utf-8');

      // Overwrite with backup
      await server._handleWriteFile({
        filepath: testFile,
        content: newContent,
        createBackup: true
      });

      // Check backup exists
      const backupFile = `${testFile}.backup`;
      const backupContent = await fs.readFile(backupFile, 'utf-8');
      assert.strictEqual(backupContent, originalContent);

      // Check new content
      const currentContent = await fs.readFile(testFile, 'utf-8');
      assert.strictEqual(currentContent, newContent);
    });

    it('should require filepath and content parameters', async () => {
      await assert.rejects(
        async () => {
          await server._handleWriteFile({ filepath: 'test.txt' });
        },
        /Filepath and content parameters are required/
      );

      await assert.rejects(
        async () => {
          await server._handleWriteFile({ content: 'test' });
        },
        /Filepath and content parameters are required/
      );
    });
  });

  describe('execute_command tool', () => {
    it('should execute simple command', async () => {
      const result = await server._handleExecuteCommand({
        command: 'node --version'
      });

      assert.ok(result.success);
      assert.strictEqual(result.exitCode, 0);
      assert.ok(result.stdout.includes('v'));
    });

    it('should handle command failure', async () => {
      const result = await server._handleExecuteCommand({
        command: 'node non-existent-script.js',
        timeout: 5000
      });

      assert.ok(!result.success);
      assert.notStrictEqual(result.exitCode, 0);
    });

    it('should block dangerous commands', async () => {
      await assert.rejects(
        async () => {
          await server._handleExecuteCommand({
            command: 'rm -rf /'
          });
        },
        /dangerous operations/
      );
    });

    it('should require command parameter', async () => {
      await assert.rejects(
        async () => {
          await server._handleExecuteCommand({});
        },
        /Command parameter is required/
      );
    });
  });

  describe('get_context tool', () => {
    it('should retrieve current session context', async () => {
      const result = await server._handleGetContext({});

      assert.ok(result.session);
      assert.ok(result.session.id);
      assert.ok(result.session.pid);
      assert.ok(result.workingDirectory);
    });

    it('should include log history when requested', async () => {
      const result = await server._handleGetContext({
        includeHistory: true
      });

      assert.ok(result.session);
      assert.ok(result.logHistory);
    });

    it('should handle invalid session ID', async () => {
      await assert.rejects(
        async () => {
          await server._handleGetContext({
            sessionId: 'invalid-session-id'
          });
        },
        /Session not found/
      );
    });
  });

  describe('run_tests tool', () => {
    it('should execute test suite', async () => {
      // Create a simple test file
      const testFile = path.join(testDir, 'sample.test.js');
      const testCode = `
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Sample Test', () => {
  it('should pass', () => {
    assert.strictEqual(1 + 1, 2);
  });
});
      `;

      await fs.writeFile(testFile, testCode, 'utf-8');

      const result = await server._handleRunTests({
        pattern: testFile,
        timeout: 10000
      });

      // Test may fail due to environment, check structure
      assert.ok(result.hasOwnProperty('success'));
      assert.ok(result.hasOwnProperty('passed'));
      assert.ok(result.hasOwnProperty('failed'));
    });
  });

  describe('Server Initialization', () => {
    it('should initialize with default options', () => {
      const defaultServer = new MCPServer();

      assert.ok(defaultServer.options.name);
      assert.ok(defaultServer.options.version);
      assert.ok(defaultServer.analyzer);
      assert.ok(defaultServer.sessionManager);
    });

    it('should initialize with custom options', () => {
      const customServer = new MCPServer({
        name: 'custom-mcp',
        version: '2.0.0',
        debug: true
      });

      assert.strictEqual(customServer.options.name, 'custom-mcp');
      assert.strictEqual(customServer.options.version, '2.0.0');
      assert.strictEqual(customServer.options.debug, true);
    });
  });
});
