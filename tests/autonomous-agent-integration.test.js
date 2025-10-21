/**
 * Integration Tests for Autonomous Agent System
 * Tests autonomous tool execution, multi-turn interactions, and extended thinking
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { AutonomousClaudeAgent } from '../src/agents/autonomous-claude-agent.js';
import { spawn } from 'child_process';
import { logger } from '../src/utils/logger.js';
import fs from 'fs/promises';

describe('Autonomous Agent Integration Tests', () => {
  let bridgeProcess;
  let agent;

  before(async () => {
    logger.info('🚀 Starting AI Bridge for tests...');

    // Start AI Bridge
    bridgeProcess = spawn('node', ['src/ai-bridge.js'], {
      stdio: 'pipe',
      detached: false
    });

    // Wait for bridge startup
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Initialize autonomous agent
    agent = new AutonomousClaudeAgent({
      clientId: 'test-autonomous-agent',
      role: 'test-agent',
      bridgeUrl: 'ws://localhost:65028',
      intents: ['*'],
      extendedThinking: true,
      thinkingBudget: 5000
    });

    await agent.connect();
    logger.info('✅ Test agent connected');
  });

  after(async () => {
    logger.info('🧹 Cleaning up test resources...');

    // Disconnect agent
    if (agent && agent.ws) {
      agent.ws.close();
    }

    // Kill bridge
    if (bridgeProcess) {
      bridgeProcess.kill();
    }

    // Clean up test files
    try {
      await fs.unlink('test-autonomous-file.txt');
    } catch (err) {
      // File might not exist
    }
  });

  it('should execute file read tool autonomously', async () => {
    const envelope = {
      from: 'test-user',
      to: 'test-autonomous-agent',
      taskId: 'test-read',
      intent: 'file.read',
      payload: {
        message: 'Read the package.json file and tell me the project name'
      }
    };

    const response = await new Promise((resolve) => {
      agent.once('response', resolve);
      agent.handleEnvelope(envelope);
    });

    assert.strictEqual(response.status, 'success');
    assert.ok(response.response);
    assert.ok(response.tool_calls);

    // Check that read tool was used
    const readTool = response.tool_calls.find(t => t.name === 'read');
    assert.ok(readTool, 'Read tool should have been executed');

    logger.info('✅ File read test passed');
  });

  it('should execute multi-tool workflow autonomously', async () => {
    const envelope = {
      from: 'test-user',
      to: 'test-autonomous-agent',
      taskId: 'test-multi-tool',
      intent: 'code.analyze',
      payload: {
        message: `Find all .js files in src/agents/, read one of them,
                  and provide a summary. Use multiple tools autonomously.`
      }
    };

    const response = await new Promise((resolve) => {
      agent.once('response', resolve);
      agent.handleEnvelope(envelope);
    });

    assert.strictEqual(response.status, 'success');
    assert.ok(response.tool_calls.length >= 2, 'Should use at least 2 tools');

    // Verify glob and read were used
    const hasGlob = response.tool_calls.some(t => t.name === 'glob');
    const hasRead = response.tool_calls.some(t => t.name === 'read');

    assert.ok(hasGlob, 'Should use glob tool');
    assert.ok(hasRead, 'Should use read tool');

    logger.info(`✅ Multi-tool workflow test passed (${response.tool_calls.length} tools used)`);
  });

  it('should create file autonomously with write tool', async () => {
    const testContent = 'This is a test file created by autonomous agent';
    const envelope = {
      from: 'test-user',
      to: 'test-autonomous-agent',
      taskId: 'test-write',
      intent: 'file.write',
      payload: {
        message: `Create a file named test-autonomous-file.txt with content: "${testContent}"`
      }
    };

    const response = await new Promise((resolve) => {
      agent.once('response', resolve);
      agent.handleEnvelope(envelope);
    });

    assert.strictEqual(response.status, 'success');

    // Verify write tool was used
    const writeTool = response.tool_calls.find(t => t.name === 'write');
    assert.ok(writeTool, 'Write tool should have been executed');

    // Verify file was actually created
    const fileContent = await fs.readFile('test-autonomous-file.txt', 'utf-8');
    assert.strictEqual(fileContent, testContent);

    logger.info('✅ File creation test passed');
  });

  it('should execute bash commands autonomously', async () => {
    const envelope = {
      from: 'test-user',
      to: 'test-autonomous-agent',
      taskId: 'test-bash',
      intent: 'command.execute',
      payload: {
        message: 'Execute "echo Hello from autonomous agent" using bash tool'
      }
    };

    const response = await new Promise((resolve) => {
      agent.once('response', resolve);
      agent.handleEnvelope(envelope);
    });

    assert.strictEqual(response.status, 'success');

    const bashTool = response.tool_calls.find(t => t.name === 'bash');
    assert.ok(bashTool, 'Bash tool should have been executed');

    logger.info('✅ Bash execution test passed');
  });

  it('should use extended thinking for complex tasks', async () => {
    const envelope = {
      from: 'test-user',
      to: 'test-autonomous-agent',
      taskId: 'test-thinking',
      intent: 'code.analyze',
      payload: {
        message: `Analyze the autonomous agent architecture and suggest improvements.
                  Use extended thinking to reason through the analysis.`
      }
    };

    const response = await new Promise((resolve) => {
      agent.once('response', resolve);
      agent.handleEnvelope(envelope);
    });

    assert.strictEqual(response.status, 'success');
    assert.ok(response.thinking, 'Should include thinking content');
    assert.ok(response.thinking.length > 0, 'Thinking should not be empty');

    logger.info('✅ Extended thinking test passed');
  });

  it('should handle errors gracefully', async () => {
    const envelope = {
      from: 'test-user',
      to: 'test-autonomous-agent',
      taskId: 'test-error',
      intent: 'file.read',
      payload: {
        message: 'Read a file that does not exist: /nonexistent/file.txt'
      }
    };

    const response = await new Promise((resolve) => {
      agent.once('response', resolve);
      agent.handleEnvelope(envelope);
    });

    // Agent should handle tool error gracefully
    assert.ok(response);
    assert.ok(response.response || response.error);

    logger.info('✅ Error handling test passed');
  });

  it('should track tool usage metrics', async () => {
    const stats = agent.getToolStats();

    assert.ok(stats.totalCalls > 0, 'Should have tool calls recorded');
    assert.ok(stats.successfulCalls > 0, 'Should have successful calls');
    assert.ok(stats.successRate, 'Should calculate success rate');
    assert.ok(stats.executorMetrics, 'Should include executor metrics');

    logger.info('✅ Metrics tracking test passed');
    logger.info(`   Total calls: ${stats.totalCalls}`);
    logger.info(`   Success rate: ${stats.successRate}`);
  });

  it('should execute git operations autonomously', async () => {
    const envelope = {
      from: 'test-user',
      to: 'test-autonomous-agent',
      taskId: 'test-git',
      intent: 'git.status',
      payload: {
        message: 'Check git status and tell me the current branch'
      }
    };

    const response = await new Promise((resolve) => {
      agent.once('response', resolve);
      agent.handleEnvelope(envelope);
    });

    assert.strictEqual(response.status, 'success');

    const gitTool = response.tool_calls.find(t => t.name === 'git_status');
    assert.ok(gitTool, 'Git status tool should have been executed');

    logger.info('✅ Git operations test passed');
  });

  it('should maintain conversation history across turns', async () => {
    // First message
    const envelope1 = {
      from: 'test-user',
      to: 'test-autonomous-agent',
      taskId: 'test-history-1',
      intent: 'conversation',
      payload: {
        message: 'Remember this number: 42'
      }
    };

    await new Promise((resolve) => {
      agent.once('response', resolve);
      agent.handleEnvelope(envelope1);
    });

    // Second message referring to previous context
    const envelope2 = {
      from: 'test-user',
      to: 'test-autonomous-agent',
      taskId: 'test-history-1', // Same task ID to maintain context
      intent: 'conversation',
      payload: {
        message: 'What number did I just tell you to remember?'
      }
    };

    const response = await new Promise((resolve) => {
      agent.once('response', resolve);
      agent.handleEnvelope(envelope2);
    });

    assert.strictEqual(response.status, 'success');
    assert.ok(response.response.includes('42'), 'Should remember context');

    logger.info('✅ Context preservation test passed');
  });
});
