/**
 * Example Multi-Claude Coordination Workflows
 *
 * These demonstrate how to coordinate multiple Claude instances for complex tasks
 */

import { assignTask } from './multi-claude-coordinator.js';

// Workflow 1: Full Feature Development
export async function featureDevelopmentWorkflow() {
  console.log('🚀 Starting Feature Development Workflow\n');

  // Architect: Design the feature
  await assignTask('architect', {
    description: 'Design a new distributed tracing system for the A2A network',
    criteria: [
      'Trace ID generation and propagation',
      'Span tracking across agents',
      'OpenTelemetry export integration',
      'Minimal performance overhead (<5ms latency)',
      'Create architecture diagram and implementation plan',
    ],
    dependencies: 'None',
    priority: 'high',
    estimatedTime: '30 minutes',
  });

  console.log('✅ Task assigned to Architect Claude\n');

  // Developer: Implement the feature (waits for architect)
  await new Promise((resolve) => setTimeout(resolve, 2000));

  await assignTask('developer', {
    description: 'Implement the distributed tracing system based on Architect plan',
    criteria: [
      'Implement trace ID middleware',
      'Add span tracking to agent messages',
      'Integrate OpenTelemetry exporter',
      'Add configuration options',
      'Write inline documentation',
    ],
    dependencies: 'architect - Wait for architecture plan',
    priority: 'high',
    estimatedTime: '45 minutes',
  });

  console.log('✅ Task assigned to Developer Claude\n');

  // Tester: Create tests and validate (waits for developer)
  await new Promise((resolve) => setTimeout(resolve, 2000));

  await assignTask('tester', {
    description: 'Create comprehensive tests for distributed tracing system',
    criteria: [
      'Unit tests for trace ID generation',
      'Integration tests for end-to-end tracing',
      'Performance tests (verify <5ms overhead)',
      'Test error handling and edge cases',
      'Run full test suite and report results',
    ],
    dependencies: 'developer - Wait for implementation',
    priority: 'high',
    estimatedTime: '30 minutes',
  });

  console.log('✅ Task assigned to Tester Claude\n');
  console.log('📊 Monitor progress: node scripts/multi-claude-coordinator.js monitor\n');
}

// Workflow 2: Code Review & Refactoring
export async function codeReviewWorkflow() {
  console.log('🔍 Starting Code Review Workflow\n');

  // Architect: Analyze architecture
  await assignTask('architect', {
    description: 'Analyze src/agents/ architecture and identify improvement opportunities',
    criteria: [
      'Review agent communication patterns',
      'Identify code duplication',
      'Assess scalability concerns',
      'Document architectural debt',
      'Create refactoring recommendations',
    ],
    dependencies: 'None',
    priority: 'medium',
    estimatedTime: '25 minutes',
  });

  console.log('✅ Task assigned to Architect Claude\n');

  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Developer: Implement refactoring
  await assignTask('developer', {
    description: 'Refactor agents based on Architect recommendations',
    criteria: [
      'Extract common base agent class',
      'Implement shared error handling',
      'Create agent factory pattern',
      'Update all agents to use new structure',
      'Maintain backward compatibility',
    ],
    dependencies: 'architect',
    priority: 'medium',
    estimatedTime: '40 minutes',
  });

  console.log('✅ Task assigned to Developer Claude\n');

  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Tester: Validate refactoring
  await assignTask('tester', {
    description: 'Validate refactored agent code',
    criteria: [
      'Run all existing tests (must pass)',
      'Create tests for new base class',
      'Test backward compatibility',
      'Performance regression testing',
      'Integration test suite',
    ],
    dependencies: 'developer',
    priority: 'medium',
    estimatedTime: '30 minutes',
  });

  console.log('✅ Task assigned to Tester Claude\n');
}

// Workflow 3: Bug Investigation & Fix
export async function bugFixWorkflow() {
  console.log('🐛 Starting Bug Fix Workflow\n');

  // Architect: Analyze the bug
  await assignTask('architect', {
    description: 'Investigate why A2A agents randomly disconnect',
    criteria: [
      'Analyze WebSocket connection handling',
      'Review keepalive implementation',
      'Check error logs and patterns',
      'Identify root cause',
      'Propose solution approach',
    ],
    dependencies: 'None',
    priority: 'critical',
    estimatedTime: '20 minutes',
  });

  console.log('✅ Task assigned to Architect Claude\n');

  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Developer: Implement the fix
  await assignTask('developer', {
    description: 'Fix A2A agent disconnection issue',
    criteria: [
      'Implement proposed solution',
      'Add better error logging',
      'Improve keepalive mechanism',
      'Add reconnection logic',
      'Test with multiple agents',
    ],
    dependencies: 'architect',
    priority: 'critical',
    estimatedTime: '30 minutes',
  });

  console.log('✅ Task assigned to Developer Claude\n');

  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Tester: Validate the fix
  await assignTask('tester', {
    description: 'Validate bug fix for agent disconnections',
    criteria: [
      'Reproduce original bug scenario',
      'Verify fix resolves issue',
      'Stress test with many agents',
      'Test edge cases',
      'Add regression test',
    ],
    dependencies: 'developer',
    priority: 'critical',
    estimatedTime: '25 minutes',
  });

  console.log('✅ Task assigned to Tester Claude\n');
}

// Workflow 4: Documentation & Maintenance
export async function documentationWorkflow() {
  console.log('📚 Starting Documentation Workflow\n');

  // Architect: Document architecture
  await assignTask('architect', {
    description: 'Create comprehensive A2A architecture documentation',
    criteria: [
      'System architecture diagram',
      'Agent communication protocol docs',
      'Message format specifications',
      'Deployment architecture',
      'Scalability considerations',
    ],
    dependencies: 'None',
    priority: 'low',
    estimatedTime: '35 minutes',
  });

  console.log('✅ Task assigned to Architect Claude\n');

  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Developer: API documentation
  await assignTask('developer', {
    description: 'Generate API documentation for all agents',
    criteria: [
      'Document all agent methods',
      'Create usage examples',
      'Document message types',
      'Add JSDoc comments to code',
      'Generate API reference',
    ],
    dependencies: 'None (parallel with architect)',
    priority: 'low',
    estimatedTime: '40 minutes',
  });

  console.log('✅ Task assigned to Developer Claude\n');

  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Tester: Testing documentation
  await assignTask('tester', {
    description: 'Create testing guide and document test coverage',
    criteria: [
      'Document test strategy',
      'Create testing guide',
      'Generate coverage report',
      'Document how to run tests',
      'Add examples of common test patterns',
    ],
    dependencies: 'None (parallel)',
    priority: 'low',
    estimatedTime: '30 minutes',
  });

  console.log('✅ Task assigned to Tester Claude\n');
}

// Workflow 5: Performance Optimization
export async function performanceWorkflow() {
  console.log('⚡ Starting Performance Optimization Workflow\n');

  // Architect: Identify bottlenecks
  await assignTask('architect', {
    description: 'Analyze A2A network performance and identify bottlenecks',
    criteria: [
      'Profile message latency',
      'Identify slow operations',
      'Analyze memory usage patterns',
      'Review connection pooling',
      'Create optimization plan',
    ],
    dependencies: 'None',
    priority: 'high',
    estimatedTime: '30 minutes',
  });

  console.log('✅ Task assigned to Architect Claude\n');

  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Developer: Implement optimizations
  await assignTask('developer', {
    description: 'Implement performance optimizations',
    criteria: [
      'Optimize message serialization',
      'Add message compression',
      'Implement connection pooling',
      'Add caching where appropriate',
      'Reduce memory allocations',
    ],
    dependencies: 'architect',
    priority: 'high',
    estimatedTime: '50 minutes',
  });

  console.log('✅ Task assigned to Developer Claude\n');

  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Tester: Benchmark and validate
  await assignTask('tester', {
    description: 'Benchmark optimizations and validate improvements',
    criteria: [
      'Run performance benchmarks',
      'Compare before/after metrics',
      'Test under load (1000+ messages)',
      'Memory leak testing',
      'Generate performance report',
    ],
    dependencies: 'developer',
    priority: 'high',
    estimatedTime: '35 minutes',
  });

  console.log('✅ Task assigned to Tester Claude\n');
}

// CLI interface
const workflows = {
  feature: featureDevelopmentWorkflow,
  review: codeReviewWorkflow,
  bugfix: bugFixWorkflow,
  docs: documentationWorkflow,
  perf: performanceWorkflow,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const workflow = process.argv[2];

  if (!workflow || !workflows[workflow]) {
    console.log('🎯 Multi-Claude Example Workflows\n');
    console.log('Usage: node scripts/example-workflows.js <workflow>\n');
    console.log('Available workflows:');
    console.log('  feature  - Full feature development (design → implement → test)');
    console.log('  review   - Code review and refactoring');
    console.log('  bugfix   - Bug investigation and fix');
    console.log('  docs     - Documentation generation');
    console.log('  perf     - Performance optimization\n');
    console.log('Example:');
    console.log('  node scripts/example-workflows.js feature\n');
    process.exit(1);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  workflows[workflow]()
    .then(() => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ Workflow tasks assigned!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    })
    .catch(console.error);
}
