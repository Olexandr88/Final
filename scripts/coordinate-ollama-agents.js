/**
 * Coordinate Multi-Agent Workflow Using Single Ollama Agent
 * Simulates Architect -> Developer -> Tester workflow
 */

const bridgeUrl = 'http://localhost:51179';

async function sendTask(intent, message) {
  try {
    const response = await fetch(`${bridgeUrl}/api/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'ollama-agent-1',
        intent: intent,
        payload: { message },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('✅ Response:', result.status);
    return result;
  } catch (error) {
    console.error('❌ Failed:', error.message);
    throw error;
  }
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCoordinatedWorkflow() {
  console.log('🚀 Multi-Agent Coordination Workflow');
  console.log('Using Ollama Agent to simulate Architect → Developer → Tester');
  console.log('');

  // Task 1: Architecture Design
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚙️  ARCHITECT PHASE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('📋 Task: Design distributed tracing system for A2A network');
  console.log('');

  await sendTask(
    'ai.query',
    `You are a Senior Software Architect. Design a distributed tracing system for an A2A (Agent-to-Agent) network.

Requirements:
- Trace ID generation and propagation
- Span tracking across agents
- OpenTelemetry export integration
- Minimal performance overhead (<5ms latency)

Provide:
1. High-level architecture
2. Component design
3. Technology stack
4. Implementation plan

Be concise and specific.`
  );

  console.log('✅ Architecture design complete');
  console.log('');
  await wait(2000);

  // Task 2: Implementation
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💻 DEVELOPER PHASE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('📋 Task: Implement tracing system based on architecture');
  console.log('');

  await sendTask(
    'ai.query',
    `You are an Expert Software Developer. Implement a distributed tracing system for A2A agents.

Based on the architecture:
- Trace ID middleware
- Span tracking in messages
- OpenTelemetry integration
- Configuration options

Provide:
1. Core implementation code
2. Usage examples
3. Configuration
4. Integration points

Write production-ready code.`
  );

  console.log('✅ Implementation complete');
  console.log('');
  await wait(2000);

  // Task 3: Testing
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TESTER PHASE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('📋 Task: Create comprehensive test suite');
  console.log('');

  await sendTask(
    'ai.query',
    `You are an Expert QA Engineer. Create a comprehensive test suite for the distributed tracing system.

Test Coverage:
- Unit tests for trace ID generation
- Integration tests for end-to-end tracing
- Performance tests (<5ms overhead)
- Edge cases and error handling

Provide:
1. Unit test cases
2. Integration tests
3. Performance tests
4. Test data examples

Create thorough tests.`
  );

  console.log('✅ Testing complete');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ WORKFLOW COMPLETE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('All 3 phases completed:');
  console.log('  ✅ Architecture designed by Architect');
  console.log('  ✅ Code implemented by Developer');
  console.log('  ✅ Tests created by Tester');
  console.log('');
  console.log('Check agent responses in bridge history:');
  console.log('  curl http://localhost:51179/history');
}

// Run
runCoordinatedWorkflow().catch(console.error);
