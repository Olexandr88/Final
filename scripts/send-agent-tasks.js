/**
 * Send tasks to agents via AI Bridge HTTP API
 */

const bridgeUrl = 'http://localhost:51179';

async function sendTask(task) {
  try {
    const response = await fetch(`${bridgeUrl}/api/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('✅ Task sent:', result);
    return result;
  } catch (error) {
    console.error('❌ Failed to send task:', error.message);
    throw error;
  }
}

// Distributed Tracing Feature Development Workflow
async function runFeatureWorkflow() {
  console.log('🚀 Starting Feature Development Workflow');
  console.log('Feature: Distributed Tracing System for A2A Network');
  console.log('');

  // Task 1: Architect designs the system
  console.log('📋 Step 1: Assigning task to Architect Agent...');
  await sendTask({
    to: 'architect-agent',
    intent: 'task.assign',
    payload: {
      description: 'Design a distributed tracing system for the A2A network',
      criteria: [
        'Trace ID generation and propagation',
        'Span tracking across agents',
        'OpenTelemetry export integration',
        'Minimal performance overhead (<5ms latency)',
        'Create architecture diagram and implementation plan'
      ],
      priority: 'high',
      estimatedTime: '30 minutes'
    }
  });

  // Wait a bit for architect to start
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Task 2: Developer implements based on architecture
  console.log('📋 Step 2: Assigning task to Developer Agent...');
  await sendTask({
    to: 'developer-agent',
    intent: 'task.assign',
    payload: {
      description: 'Implement the distributed tracing system based on Architect plan',
      criteria: [
        'Implement trace ID middleware',
        'Add span tracking to agent messages',
        'Integrate OpenTelemetry exporter',
        'Add configuration options',
        'Write inline documentation'
      ],
      dependencies: 'architect',
      priority: 'high',
      estimatedTime: '45 minutes'
    }
  });

  // Wait a bit for developer to start
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Task 3: Tester creates comprehensive tests
  console.log('📋 Step 3: Assigning task to Tester Agent...');
  await sendTask({
    to: 'tester-agent',
    intent: 'task.assign',
    payload: {
      description: 'Create comprehensive tests for distributed tracing system',
      criteria: [
        'Unit tests for trace ID generation',
        'Integration tests for end-to-end tracing',
        'Performance tests (verify <5ms overhead)',
        'Test error handling and edge cases',
        'Run full test suite and report results'
      ],
      dependencies: 'developer',
      priority: 'high',
      estimatedTime: '30 minutes'
    }
  });

  console.log('');
  console.log('✅ All tasks assigned!');
  console.log('📊 Agents are now working...');
  console.log('');
  console.log('Check deliverables in: .multi-claude/shared/');
  console.log('Monitor agents: curl http://localhost:51179/agents');
}

// Run workflow
runFeatureWorkflow().catch(console.error);
