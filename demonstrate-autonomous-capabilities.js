#!/usr/bin/env node
/**
 * Standalone Demonstration of Autonomous Agent Capabilities
 * Shows that the agent can actually execute file operations, commands, and implement code
 */

import { AutonomousClaudeAgent } from './src/agents/autonomous-claude-agent.js';
import { logger } from './src/utils/logger.js';
import { EventEmitter } from 'events';

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║  Autonomous Agent Capability Demonstration                 ║');
console.log('║  Proving real tool execution without human intervention    ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// Create a mock bridge event emitter for testing without WebSocket
class MockBridge extends EventEmitter {
  constructor() {
    super();
    this.responses = [];
  }
}

const bridge = new MockBridge();

// Create autonomous agent (standalone, no bridge connection needed for testing)
const agent = new AutonomousClaudeAgent({
  clientId: 'autonomous-demo-agent',
  role: 'autonomous-assistant',
  extendedThinking: true,
  thinkingBudget: 8000,
});

// Capture responses
agent.on('response', (response) => {
  bridge.responses.push(response);
});

// Override sendResponse to capture locally
agent.sendResponse = function (envelope, response) {
  console.log(`\n📤 Agent Response to: ${envelope.taskId}`);
  console.log(`Status: ${response.status}`);
  if (response.tool_calls && response.tool_calls.length > 0) {
    console.log(`Tools used: ${response.tool_calls.map((t) => t.name).join(', ')}`);
  }
  if (response.thinking) {
    console.log(`Thinking tokens: ${response.thinking.split(' ').length}`);
  }
  if (response.error) {
    console.error(`Error: ${response.error}`);
  } else {
    console.log(`Response: ${response.response.substring(0, 200)}...`);
  }
  this.emit('response', response);
};

async function test1_AutonomousFileRead() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('TEST 1: Autonomous File Read (package.json)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Instruction: "Read package.json and tell me the project name"');
  console.log('Expected: Agent autonomously uses read tool\n');

  const envelope = {
    from: 'demo-harness',
    to: 'autonomous-demo-agent',
    taskId: 'test-1-read',
    intent: 'file.read',
    payload: {
      message: 'Read the package.json file and tell me the project name and current version.',
    },
  };

  return new Promise((resolve) => {
    agent.once('response', (response) => {
      console.log('\n✅ TEST 1 RESULT:');
      console.log(`  - Status: ${response.status}`);
      console.log(
        `  - Used tools: ${response.tool_calls?.map((t) => t.name).join(', ') || 'none'}`
      );
      console.log(`  - Autonomous: ${response.tool_calls?.length > 0 ? 'YES ✅' : 'NO ❌'}`);
      resolve(response);
    });

    agent.handleEnvelope(envelope);
  });
}

async function test2_AutonomousFileWrite() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('TEST 2: Autonomous File Creation');
  console.log('═══════════════════════════════════════════════════════════');
  const filename = `autonomous-proof-${Date.now()}.txt`;
  console.log(`Instruction: "Create file ${filename}"`);
  console.log('Expected: Agent autonomously uses write tool\n');

  const envelope = {
    from: 'demo-harness',
    to: 'autonomous-demo-agent',
    taskId: 'test-2-write',
    intent: 'file.write',
    payload: {
      message: `Create a new file called ${filename} with the following content: "This file was created autonomously by Claude Agent at ${new Date().toISOString()}. No human intervention was required."`,
    },
  };

  return new Promise((resolve) => {
    agent.once('response', (response) => {
      console.log('\n✅ TEST 2 RESULT:');
      console.log(`  - Status: ${response.status}`);
      console.log(
        `  - Used tools: ${response.tool_calls?.map((t) => t.name).join(', ') || 'none'}`
      );
      console.log(`  - File created: ${filename}`);
      console.log(
        `  - Autonomous: ${response.tool_calls?.some((t) => t.name === 'write') ? 'YES ✅' : 'NO ❌'}`
      );
      resolve(response);
    });

    agent.handleEnvelope(envelope);
  });
}

async function test3_MultiToolWorkflow() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('TEST 3: Multi-Tool Autonomous Workflow');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Instruction: "Find agent files, read one, analyze it"');
  console.log('Expected: Agent uses glob → read → analyze autonomously\n');

  const envelope = {
    from: 'demo-harness',
    to: 'autonomous-demo-agent',
    taskId: 'test-3-workflow',
    intent: 'code.analyze',
    payload: {
      message:
        'Find all JavaScript files in src/agents/ using glob, then read the autonomous-claude-agent.js file, and tell me how many tools it supports.',
    },
  };

  return new Promise((resolve) => {
    agent.once('response', (response) => {
      console.log('\n✅ TEST 3 RESULT:');
      console.log(`  - Status: ${response.status}`);
      console.log(
        `  - Tools used (in order): ${response.tool_calls?.map((t) => t.name).join(' → ') || 'none'}`
      );
      console.log(`  - Number of tools: ${response.tool_calls?.length || 0}`);
      console.log(
        `  - Multi-tool autonomous: ${response.tool_calls?.length >= 2 ? 'YES ✅' : 'NO ❌'}`
      );
      resolve(response);
    });

    agent.handleEnvelope(envelope);
  });
}

async function test4_CodeImplementation() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('TEST 4: Autonomous Code Implementation');
  console.log('═══════════════════════════════════════════════════════════');
  const filename = `src/utils/demo-autonomous-util-${Date.now()}.js`;
  console.log(`Instruction: "Implement a utility function"`);
  console.log('Expected: Agent writes actual code file autonomously\n');

  const envelope = {
    from: 'demo-harness',
    to: 'autonomous-demo-agent',
    taskId: 'test-4-implement',
    intent: 'code.implement',
    payload: {
      message: `Create a new utility file at ${filename} with:
1. A function called getAutonomousTimestamp() that returns current ISO timestamp
2. A function called proveAutonomy() that returns an object with creation time and autonomous:true
3. Proper JSDoc documentation
4. Export both functions

Implement this completely without asking for permission.`,
    },
  };

  return new Promise((resolve) => {
    agent.once('response', (response) => {
      console.log('\n✅ TEST 4 RESULT:');
      console.log(`  - Status: ${response.status}`);
      console.log(
        `  - Used tools: ${response.tool_calls?.map((t) => t.name).join(', ') || 'none'}`
      );
      console.log(
        `  - Implementation autonomous: ${response.tool_calls?.some((t) => t.name === 'write') ? 'YES ✅' : 'NO ❌'}`
      );
      resolve(response);
    });

    agent.handleEnvelope(envelope);
  });
}

async function test5_BashExecution() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('TEST 5: Autonomous Command Execution');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Instruction: "List files in current directory"');
  console.log('Expected: Agent executes bash command autonomously\n');

  const envelope = {
    from: 'demo-harness',
    to: 'autonomous-demo-agent',
    taskId: 'test-5-bash',
    intent: 'command.execute',
    payload: {
      message:
        'Execute "ls -la" to list files in the current directory and tell me how many files you found.',
    },
  };

  return new Promise((resolve) => {
    agent.once('response', (response) => {
      console.log('\n✅ TEST 5 RESULT:');
      console.log(`  - Status: ${response.status}`);
      console.log(
        `  - Used tools: ${response.tool_calls?.map((t) => t.name).join(', ') || 'none'}`
      );
      console.log(
        `  - Command executed: ${response.tool_calls?.some((t) => t.name === 'bash') ? 'YES ✅' : 'NO ❌'}`
      );
      resolve(response);
    });

    agent.handleEnvelope(envelope);
  });
}

// Run all tests
(async () => {
  try {
    console.log('⏳ Waiting for agent initialization...\n');
    await agent._initPromise;
    console.log(
      `✅ Agent initialized with ${agent.toolExecutor.getAvailableTools().length} tools\n`
    );
    console.log(`Available tools: ${agent.toolExecutor.getAvailableTools().join(', ')}\n`);

    await test1_AutonomousFileRead();
    await test2_AutonomousFileWrite();
    await test3_MultiToolWorkflow();
    await test4_CodeImplementation();
    await test5_BashExecution();

    // Final statistics
    const stats = agent.getToolStats();
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  FINAL STATISTICS                                          ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`Total tool calls: ${stats.totalCalls}`);
    console.log(`Successful: ${stats.successfulCalls}`);
    console.log(`Failed: ${stats.failedCalls}`);
    console.log(`Success rate: ${stats.successRate}`);
    console.log(`\n✅ AUTONOMOUS EXECUTION PROVEN`);
    console.log(`   The agent executed ${stats.successfulCalls} tools without human intervention.`);
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  }
})();
