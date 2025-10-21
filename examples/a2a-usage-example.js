/**
 * A2A System Usage Examples
 * Demonstrates how to use the A2A network for agent communication
 */

import { ClaudeA2AAgent } from '../src/claude-a2a-agent.js';
import { MCPtoA2ABridge } from '../src/mcp-a2a-bridge.js';
import { A2AAdapter } from '../src/a2a-adapter.js';

/**
 * Example 1: Basic Claude agent communication
 */
async function example1_basicClaudeAgent() {
  console.log('\n=== Example 1: Basic Claude Agent ===\n');

  // Create and connect Claude agent
  const agent = new ClaudeA2AAgent('my-claude-agent');
  await agent.connect();

  console.log('Claude agent connected to A2A hub');

  // Send a message to another agent
  agent.a2a.sendTo('another-agent', {
    task: 'Analyze this code',
    code: 'function hello() { console.log("Hello"); }'
  });

  // Wait for responses
  setTimeout(() => {
    agent.disconnect();
    console.log('Agent disconnected');
  }, 5000);
}

/**
 * Example 2: Multi-agent collaboration
 */
async function example2_collaboration() {
  console.log('\n=== Example 2: Multi-Agent Collaboration ===\n');

  const agent = new ClaudeA2AAgent('orchestrator-agent');
  await agent.connect();

  // Request collaboration from multiple agents
  await agent.collaborate(
    ['code-analyzer', 'security-auditor', 'performance-optimizer'],
    'Review and optimize the authentication system'
  );

  console.log('Collaboration request sent');

  setTimeout(() => {
    agent.disconnect();
  }, 10000);
}

/**
 * Example 3: MCP servers communicating via A2A
 */
async function example3_mcpBridge() {
  console.log('\n=== Example 3: MCP Bridge ===\n');

  // Connect all MCP servers to A2A hub
  const bridge = new MCPtoA2ABridge();
  await bridge.connectAll();

  console.log('MCP servers connected:', bridge.getStatus());

  // Send message from filesystem to memory server
  await bridge.sendBetweenServers(
    'filesystem',
    'memory',
    {
      action: 'store',
      data: { file: 'important.txt', content: 'Store this in memory' }
    }
  );

  console.log('Message sent between MCP servers');

  setTimeout(() => {
    bridge.disconnectAll();
  }, 5000);
}

/**
 * Example 4: Custom agent with specific capabilities
 */
async function example4_customAgent() {
  console.log('\n=== Example 4: Custom Agent ===\n');

  // Create custom agent
  const customAgent = new A2AAdapter('data-processor');

  // Set up custom message handlers
  customAgent.on('message', async (message) => {
    console.log('Processing data:', message.payload);

    // Do custom processing
    const result = {
      processed: true,
      data: message.payload,
      timestamp: new Date().toISOString()
    };

    // Send result back
    customAgent.sendTo(message.from, result);
  });

  // Connect with specific capabilities
  await customAgent.connect(['data-processing', 'analytics', 'transformation']);

  console.log('Custom agent connected');

  setTimeout(() => {
    customAgent.disconnect();
  }, 5000);
}

/**
 * Example 5: Real-world workflow - Code review pipeline
 */
async function example5_codeReviewPipeline() {
  console.log('\n=== Example 5: Code Review Pipeline ===\n');

  // Create specialized agents
  const coordinator = new ClaudeA2AAgent('review-coordinator');
  const analyzer = new A2AAdapter('code-analyzer');
  const securityChecker = new A2AAdapter('security-checker');

  // Connect all agents
  await Promise.all([
    coordinator.connect(),
    analyzer.connect(['code-analysis', 'complexity-check']),
    securityChecker.connect(['security-audit', 'vulnerability-scan'])
  ]);

  // Set up analyzer handler
  analyzer.on('message', (message) => {
    console.log('Analyzer processing:', message.payload.file);
    analyzer.sendTo(message.from, {
      analysis: 'Code looks good, complexity: 5',
      issues: []
    });
  });

  // Set up security checker handler
  securityChecker.on('message', (message) => {
    console.log('Security check for:', message.payload.file);
    securityChecker.sendTo(message.from, {
      security: 'No vulnerabilities found',
      score: 95
    });
  });

  // Coordinator orchestrates the workflow
  console.log('Starting code review workflow...');

  // Send to analyzer
  coordinator.a2a.sendTo('code-analyzer', {
    file: 'auth.js',
    action: 'analyze'
  });

  // Send to security checker
  coordinator.a2a.sendTo('security-checker', {
    file: 'auth.js',
    action: 'security-check'
  });

  console.log('Review requests sent, waiting for results...');

  setTimeout(() => {
    coordinator.disconnect();
    analyzer.disconnect();
    securityChecker.disconnect();
    console.log('Pipeline complete');
  }, 10000);
}

/**
 * Example 6: Broadcasting status updates
 */
async function example6_broadcasting() {
  console.log('\n=== Example 6: Broadcasting ===\n');

  const statusAgent = new A2AAdapter('status-broadcaster');
  await statusAgent.connect(['monitoring', 'status']);

  // Broadcast status every 2 seconds
  const interval = setInterval(() => {
    statusAgent.broadcast({
      type: 'status-update',
      status: 'healthy',
      metrics: {
        cpu: Math.random() * 100,
        memory: Math.random() * 100
      }
    });
    console.log('Status broadcast sent');
  }, 2000);

  setTimeout(() => {
    clearInterval(interval);
    statusAgent.disconnect();
  }, 10000);
}

// Run examples (uncomment to test)
// Note: Make sure a2a-hub-server.py is running first!

async function runExamples() {
  console.log('A2A Usage Examples');
  console.log('Make sure a2a-hub-server.py is running on ws://localhost:4567\n');

  try {
    // Run one example at a time
    // await example1_basicClaudeAgent();
    // await example2_collaboration();
    // await example3_mcpBridge();
    // await example4_customAgent();
    // await example5_codeReviewPipeline();
    // await example6_broadcasting();

    console.log('\nTo run these examples:');
    console.log('1. Start the hub: python a2a-hub-server.py');
    console.log('2. Uncomment an example above');
    console.log('3. Run: node examples/a2a-usage-example.js');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Export examples for individual testing
export {
  example1_basicClaudeAgent,
  example2_collaboration,
  example3_mcpBridge,
  example4_customAgent,
  example5_codeReviewPipeline,
  example6_broadcasting
};

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples();
}
