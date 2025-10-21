/**
 * Enhanced Multi-Agent Workflow Coordinator
 * Uses the working Ollama agent with explicit role-based prompting
 * Stores deliverables and provides proper phase coordination
 */

import fs from 'fs/promises';
import path from 'path';

const BRIDGE_URL = 'http://localhost:51179';
const WORKSPACE = '.multi-claude/shared';
const OLLAMA_AGENT = 'ollama-agent-1';

// Ensure workspace exists
await fs.mkdir(WORKSPACE, { recursive: true });

/**
 * Send task to Ollama agent via AI Bridge and wait for response
 */
async function sendTask(role, taskDescription, context = {}) {
  // Get current history size before sending
  const historyBefore = await fetch(`${BRIDGE_URL}/history`).then(r => r.json());
  const messageCountBefore = historyBefore.history?.length || 0;

  // Send the task
  const sendResponse = await fetch(`${BRIDGE_URL}/api/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: OLLAMA_AGENT,
      intent: 'ai.query',
      payload: {
        message: buildRolePrompt(role, taskDescription, context)
      }
    })
  });

  if (!sendResponse.ok) {
    throw new Error(`HTTP ${sendResponse.status}: ${sendResponse.statusText}`);
  }

  // Poll for response (max 30 seconds)
  const maxAttempts = 30;
  const pollInterval = 1000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await wait(pollInterval);

    const historyAfter = await fetch(`${BRIDGE_URL}/history`).then(r => r.json());
    const messages = historyAfter.history || [];

    // Look for new ai.response message from ollama-agent
    const newResponses = messages.slice(messageCountBefore).filter(msg =>
      msg.intent === 'ai.response' &&
      msg.from === OLLAMA_AGENT
    );

    if (newResponses.length > 0) {
      // Return the most recent response
      const response = newResponses[newResponses.length - 1];
      return {
        response: response.payload?.response || 'No response generated',
        metadata: {
          timestamp: response.timestamp,
          model: response.payload?.model
        }
      };
    }
  }

  throw new Error(`Timeout waiting for response from ${OLLAMA_AGENT}`);
}

/**
 * Build role-specific prompt
 */
function buildRolePrompt(role, taskDescription, context) {
  const rolePrompts = {
    architect: `You are a Senior Software Architect with 15+ years of experience in distributed systems, microservices, and cloud architecture.

TASK: ${taskDescription}

${context.requirements ? `REQUIREMENTS:\n${context.requirements.map(r => `- ${r}`).join('\n')}\n` : ''}

Provide a comprehensive architecture document including:
1. **System Overview** - High-level architecture diagram (ASCII/text)
2. **Component Design** - Detailed breakdown of each component
3. **Technology Stack** - Specific tools, frameworks, languages
4. **API Contracts** - Endpoints, data models, interfaces
5. **Data Flow** - How data moves through the system
6. **Scalability Strategy** - How the system handles growth
7. **Security Considerations** - Authentication, authorization, encryption
8. **Implementation Plan** - Step-by-step development roadmap

Be specific, detailed, and production-ready. Use industry best practices.`,

    developer: `You are an Expert Software Developer with deep expertise in modern development practices, clean code, and production systems.

TASK: ${taskDescription}

${context.architecture ? `ARCHITECTURE REFERENCE:\n${context.architecture}\n` : ''}
${context.requirements ? `REQUIREMENTS:\n${context.requirements.map(r => `- ${r}`).join('\n')}\n` : ''}

Provide production-ready implementation including:
1. **Core Implementation** - Complete, working code with proper error handling
2. **Code Organization** - File structure, module design
3. **Configuration** - Environment variables, config files
4. **Integration Points** - How components connect
5. **Usage Examples** - How to use the code
6. **Error Handling** - Comprehensive error management
7. **Performance Optimizations** - Efficient algorithms, caching
8. **Documentation** - Inline comments and usage docs

Write clean, maintainable, well-tested code. Follow SOLID principles.`,

    tester: `You are an Expert QA Engineer specializing in test automation, quality assurance, and comprehensive testing strategies.

TASK: ${taskDescription}

${context.implementation ? `IMPLEMENTATION REFERENCE:\n${context.implementation}\n` : ''}
${context.requirements ? `REQUIREMENTS:\n${context.requirements.map(r => `- ${r}`).join('\n')}\n` : ''}

Provide a comprehensive test suite including:
1. **Unit Tests** - Test individual functions/methods
2. **Integration Tests** - Test component interactions
3. **Performance Tests** - Load testing, benchmarks
4. **Edge Cases** - Boundary conditions, error scenarios
5. **Test Data** - Realistic test fixtures
6. **Test Coverage Analysis** - What's tested, what's not
7. **CI/CD Integration** - How to run tests automatically
8. **Quality Metrics** - Success criteria, performance targets

Create thorough, maintainable tests with high coverage. Use industry-standard testing frameworks.`
  };

  return rolePrompts[role] || taskDescription;
}

/**
 * Save deliverable to workspace
 */
async function saveDeliverable(role, content, taskName) {
  const timestamp = Date.now();
  const filename = `${role}-${taskName}-${timestamp}.md`;
  const filepath = path.join(WORKSPACE, filename);

  await fs.writeFile(filepath, content);

  console.log(`   📄 Saved: ${filename}`);
  return filepath;
}

/**
 * Wait for specified milliseconds
 */
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute coordinated workflow with proper phase management
 */
async function executeWorkflow(projectDescription, requirements = []) {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║     ENHANCED MULTI-AGENT WORKFLOW COORDINATOR                 ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`📋 Project: ${projectDescription}`);
  console.log(`📊 Requirements: ${requirements.length} defined`);
  console.log('');

  const results = {
    architecture: null,
    implementation: null,
    tests: null,
    deliverables: []
  };

  try {
    // ===== PHASE 1: ARCHITECTURE =====
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📐 PHASE 1: ARCHITECTURE DESIGN');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('🤖 Architect Agent: Designing system architecture...');

    const archResult = await sendTask('architect', projectDescription, { requirements });
    const archContent = archResult.response || 'No architecture generated';
    results.architecture = archContent;

    const archFile = await saveDeliverable('architect', archContent, 'design');
    results.deliverables.push(archFile);

    console.log(`   ✅ Architecture complete (${archContent.length} chars)`);
    console.log('');

    await wait(2000);

    // ===== PHASE 2: DEVELOPMENT =====
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💻 PHASE 2: IMPLEMENTATION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('🤖 Developer Agent: Implementing based on architecture...');

    const devResult = await sendTask('developer', projectDescription, {
      requirements,
      architecture: results.architecture.substring(0, 1000) // First 1000 chars for context
    });
    const devContent = devResult.response || 'No implementation generated';
    results.implementation = devContent;

    const devFile = await saveDeliverable('developer', devContent, 'implementation');
    results.deliverables.push(devFile);

    console.log(`   ✅ Implementation complete (${devContent.length} chars)`);
    console.log('');

    await wait(2000);

    // ===== PHASE 3: TESTING =====
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🧪 PHASE 3: TEST SUITE CREATION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('🤖 Tester Agent: Creating comprehensive test suite...');

    const testResult = await sendTask('tester', projectDescription, {
      requirements,
      implementation: results.implementation.substring(0, 1000) // First 1000 chars for context
    });
    const testContent = testResult.response || 'No tests generated';
    results.tests = testContent;

    const testFile = await saveDeliverable('tester', testContent, 'tests');
    results.deliverables.push(testFile);

    console.log(`   ✅ Test suite complete (${testContent.length} chars)`);
    console.log('');

    // ===== COMPLETION SUMMARY =====
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ WORKFLOW COMPLETE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('📦 Deliverables:');
    results.deliverables.forEach(file => {
      console.log(`   - ${path.basename(file)}`);
    });
    console.log('');
    console.log(`📂 Workspace: ${WORKSPACE}`);
    console.log('');

    return results;

  } catch (error) {
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ WORKFLOW FAILED');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    console.error(`Error: ${error.message}`);
    console.error('');
    throw error;
  }
}

// ===== EXAMPLE WORKFLOWS =====

/**
 * Example 1: Real-time Notification System
 */
async function exampleRealtimeNotifications() {
  await executeWorkflow(
    'Real-time Notification System for Multi-Tenant SaaS Application',
    [
      'WebSocket-based real-time delivery',
      'Support for 100K+ concurrent connections',
      'Multi-channel delivery (email, SMS, push, in-app)',
      'Notification templates and personalization',
      'Delivery tracking and analytics',
      'Retry logic with exponential backoff',
      'Rate limiting per tenant',
      'Priority queue management'
    ]
  );
}

/**
 * Example 2: API Rate Limiter
 */
async function exampleRateLimiter() {
  await executeWorkflow(
    'Distributed API Rate Limiting Middleware',
    [
      'Token bucket algorithm implementation',
      'Redis-backed distributed state',
      'Per-user and per-API-key limits',
      'Configurable time windows (second, minute, hour, day)',
      'Burst allowance support',
      'Real-time metrics and monitoring',
      'Graceful degradation',
      'Express/Fastify middleware integration'
    ]
  );
}

/**
 * Example 3: Custom workflow
 */
async function customWorkflow() {
  const project = process.argv[2] || 'Custom Project';
  const requirements = process.argv.slice(3);

  await executeWorkflow(project, requirements);
}

// ===== MAIN EXECUTION =====

const workflow = process.argv[2];

switch (workflow) {
  case 'notifications':
    await exampleRealtimeNotifications();
    break;
  case 'rate-limiter':
    await exampleRateLimiter();
    break;
  case 'custom':
    await customWorkflow();
    break;
  default:
    console.log('');
    console.log('Enhanced Multi-Agent Workflow Coordinator');
    console.log('');
    console.log('Usage:');
    console.log('  node scripts/enhanced-multi-agent-workflow.js <workflow> [...args]');
    console.log('');
    console.log('Available workflows:');
    console.log('  notifications   - Real-time notification system');
    console.log('  rate-limiter    - Distributed API rate limiter');
    console.log('  custom "desc" "req1" "req2" ... - Custom workflow');
    console.log('');
    console.log('Examples:');
    console.log('  npm run multi-agent:enhanced notifications');
    console.log('  npm run multi-agent:enhanced rate-limiter');
    console.log('  npm run multi-agent:enhanced custom "User Auth System" "JWT tokens" "OAuth2"');
    console.log('');
    process.exit(1);
}
