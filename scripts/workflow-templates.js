/**
 * Workflow Template Library
 * Pre-built workflows for common software development tasks
 */

import fs from 'fs/promises';
import path from 'path';

const BRIDGE_URL = 'http://localhost:51179';
const WORKSPACE = '.multi-claude/shared';
const OLLAMA_AGENT = 'ollama-agent-1';

await fs.mkdir(WORKSPACE, { recursive: true });

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendTask(role, taskDescription, context = {}) {
  const historyBefore = await fetch(`${BRIDGE_URL}/history`).then((r) => r.json());
  const messageCountBefore = historyBefore.history?.length || 0;

  const sendResponse = await fetch(`${BRIDGE_URL}/api/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: OLLAMA_AGENT,
      intent: 'ai.query',
      payload: { message: buildRolePrompt(role, taskDescription, context) },
    }),
  });

  if (!sendResponse.ok) {
    throw new Error(`HTTP ${sendResponse.status}: ${sendResponse.statusText}`);
  }

  const maxAttempts = 30;
  const pollInterval = 1000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await wait(pollInterval);

    const historyAfter = await fetch(`${BRIDGE_URL}/history`).then((r) => r.json());
    const messages = historyAfter.history || [];

    const newResponses = messages
      .slice(messageCountBefore)
      .filter((msg) => msg.intent === 'ai.response' && msg.from === OLLAMA_AGENT);

    if (newResponses.length > 0) {
      const response = newResponses[newResponses.length - 1];
      return {
        response: response.payload?.response || 'No response generated',
        metadata: {
          timestamp: response.timestamp,
          model: response.payload?.model,
        },
      };
    }
  }

  throw new Error(`Timeout waiting for response from ${OLLAMA_AGENT}`);
}

function buildRolePrompt(role, taskDescription, context) {
  const rolePrompts = {
    architect: `You are a Senior Software Architect with 15+ years of experience.

TASK: ${taskDescription}

${context.requirements ? `REQUIREMENTS:\n${context.requirements.map((r) => `- ${r}`).join('\n')}\n` : ''}

Provide:
1. System Overview - High-level architecture
2. Component Design - Detailed breakdown
3. Technology Stack - Specific tools and frameworks
4. API Contracts - Endpoints and data models
5. Data Flow - How data moves through the system
6. Scalability Strategy - Growth handling
7. Security Considerations - Auth, encryption, etc.
8. Implementation Plan - Step-by-step roadmap`,

    developer: `You are an Expert Software Developer with production system expertise.

TASK: ${taskDescription}

${context.architecture ? `ARCHITECTURE:\n${context.architecture}\n` : ''}
${context.requirements ? `REQUIREMENTS:\n${context.requirements.map((r) => `- ${r}`).join('\n')}\n` : ''}

Provide:
1. Core Implementation - Complete working code
2. Code Organization - File structure
3. Configuration - Environment variables
4. Integration Points - Component connections
5. Usage Examples - How to use the code
6. Error Handling - Comprehensive error management
7. Performance Optimizations - Efficient algorithms
8. Documentation - Inline comments`,

    tester: `You are an Expert QA Engineer specializing in comprehensive testing.

TASK: ${taskDescription}

${context.implementation ? `IMPLEMENTATION:\n${context.implementation}\n` : ''}
${context.requirements ? `REQUIREMENTS:\n${context.requirements.map((r) => `- ${r}`).join('\n')}\n` : ''}

Provide:
1. Unit Tests - Test individual functions
2. Integration Tests - Test interactions
3. Performance Tests - Load testing
4. Edge Cases - Boundary conditions
5. Test Data - Realistic fixtures
6. Coverage Analysis - What's tested
7. CI/CD Integration - Automation
8. Quality Metrics - Success criteria`,
  };

  return rolePrompts[role] || taskDescription;
}

async function saveDeliverable(role, content, taskName) {
  const timestamp = Date.now();
  const filename = `${role}-${taskName}-${timestamp}.md`;
  const filepath = path.join(WORKSPACE, filename);
  await fs.writeFile(filepath, content);
  console.log(`   📄 Saved: ${filename}`);
  return filepath;
}

async function executeWorkflow(projectDescription, requirements = []) {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║     MULTI-AGENT WORKFLOW COORDINATOR                          ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`📋 Project: ${projectDescription}`);
  console.log(`📊 Requirements: ${requirements.length} defined`);
  console.log('');

  const results = {
    architecture: null,
    implementation: null,
    tests: null,
    deliverables: [],
  };

  try {
    // Phase 1: Architecture
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

    // Phase 2: Development
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💻 PHASE 2: IMPLEMENTATION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('🤖 Developer Agent: Implementing based on architecture...');

    const devResult = await sendTask('developer', projectDescription, {
      requirements,
      architecture: results.architecture.substring(0, 1000),
    });
    const devContent = devResult.response || 'No implementation generated';
    results.implementation = devContent;

    const devFile = await saveDeliverable('developer', devContent, 'implementation');
    results.deliverables.push(devFile);

    console.log(`   ✅ Implementation complete (${devContent.length} chars)`);
    console.log('');

    await wait(2000);

    // Phase 3: Testing
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🧪 PHASE 3: TEST SUITE CREATION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('🤖 Tester Agent: Creating comprehensive test suite...');

    const testResult = await sendTask('tester', projectDescription, {
      requirements,
      implementation: results.implementation.substring(0, 1000),
    });
    const testContent = testResult.response || 'No tests generated';
    results.tests = testContent;

    const testFile = await saveDeliverable('tester', testContent, 'tests');
    results.deliverables.push(testFile);

    console.log(`   ✅ Test suite complete (${testContent.length} chars)`);
    console.log('');

    // Completion
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ WORKFLOW COMPLETE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('📦 Deliverables:');
    results.deliverables.forEach((file) => {
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

// ========== WORKFLOW TEMPLATES ==========

export const templates = {
  // 1. Microservice Template
  async microservice(serviceName, features = []) {
    await executeWorkflow(`${serviceName} - Microservice with RESTful API`, [
      'RESTful API with OpenAPI/Swagger documentation',
      'Database integration (PostgreSQL/MongoDB)',
      'JWT authentication and authorization',
      'Request validation and error handling',
      'Structured logging with correlation IDs',
      'Health checks and readiness probes',
      'Docker containerization',
      'Kubernetes deployment manifests',
      ...features,
    ]);
  },

  // 2. Event-Driven System
  async eventDriven(systemName, events = []) {
    await executeWorkflow(`${systemName} - Event-Driven Architecture`, [
      'Event bus (Kafka/RabbitMQ/Redis Streams)',
      'Event schema registry',
      'Producer and consumer implementations',
      'Event sourcing pattern',
      'CQRS (Command Query Responsibility Segregation)',
      'Dead letter queue handling',
      'Event replay capability',
      'At-least-once delivery guarantee',
      ...events,
    ]);
  },

  // 3. Real-Time Dashboard
  async dashboard(dashboardName, metrics = []) {
    await executeWorkflow(`${dashboardName} - Real-Time Analytics Dashboard`, [
      'WebSocket-based real-time updates',
      'React/Vue.js frontend with charts',
      'Time-series data aggregation',
      'Multi-tenant data isolation',
      'Responsive design (mobile/desktop)',
      'Export to PDF/CSV',
      'Alert thresholds and notifications',
      'Historical data comparison',
      ...metrics,
    ]);
  },

  // 4. CLI Tool
  async cliTool(toolName, commands = []) {
    await executeWorkflow(`${toolName} - Command-Line Interface Tool`, [
      'Argument parsing (yargs/commander)',
      'Interactive prompts',
      'Progress bars and spinners',
      'Configuration file support',
      'Color-coded output',
      'Auto-completion scripts',
      'Man page documentation',
      'Cross-platform compatibility',
      ...commands,
    ]);
  },

  // 5. Background Worker System
  async workerSystem(systemName, jobs = []) {
    await executeWorkflow(`${systemName} - Background Job Processing System`, [
      'Job queue (Bull/BullMQ/Redis)',
      'Priority-based scheduling',
      'Retry logic with exponential backoff',
      'Job progress tracking',
      'Concurrency control',
      'Job result persistence',
      'Dead job monitoring',
      'Graceful shutdown handling',
      ...jobs,
    ]);
  },

  // 6. Authentication Service
  async authService(serviceName) {
    await executeWorkflow(`${serviceName} - Authentication and Authorization Service`, [
      'JWT token generation and validation',
      'OAuth2/OpenID Connect support',
      'Multi-factor authentication (TOTP)',
      'Password hashing (bcrypt/argon2)',
      'Session management',
      'Role-based access control (RBAC)',
      'Refresh token rotation',
      'Account lockout and rate limiting',
      'Audit logging',
    ]);
  },

  // 7. File Processing Pipeline
  async filePipeline(pipelineName, stages = []) {
    await executeWorkflow(`${pipelineName} - File Processing Pipeline`, [
      'File upload handling (multipart/form-data)',
      'Stream-based processing',
      'Multiple file format support',
      'Transformation stages',
      'Validation and sanitization',
      'Storage (S3/local filesystem)',
      'Thumbnail/preview generation',
      'Batch processing support',
      ...stages,
    ]);
  },

  // 8. Search Engine
  async searchEngine(engineName) {
    await executeWorkflow(`${engineName} - Full-Text Search Engine`, [
      'Elasticsearch/Algolia integration',
      'Full-text indexing',
      'Faceted search and filters',
      'Autocomplete/typeahead',
      'Relevance scoring',
      'Fuzzy matching',
      'Search analytics',
      'Index optimization',
      'Real-time index updates',
    ]);
  },

  // 9. Data Sync Service
  async dataSyncService(serviceName) {
    await executeWorkflow(`${serviceName} - Data Synchronization Service`, [
      'Change data capture (CDC)',
      'Conflict resolution strategy',
      'Incremental sync',
      'Two-way synchronization',
      'Sync status tracking',
      'Rollback capability',
      'Large dataset handling',
      'Offline sync queue',
      'Sync scheduling',
    ]);
  },

  // 10. Cache Layer
  async cacheLayer(layerName) {
    await executeWorkflow(`${layerName} - Distributed Cache Layer`, [
      'Redis cluster setup',
      'Cache-aside pattern',
      'Write-through/write-behind strategies',
      'TTL (Time-To-Live) management',
      'Cache invalidation',
      'Hot-key detection',
      'Cache warming strategies',
      'Metrics and monitoring',
      'Fallback to database',
    ]);
  },
};

// ========== CLI EXECUTION ==========

const templateName = process.argv[2];
const customName = process.argv[3];
const customFeatures = process.argv.slice(4);

if (!templateName || !templates[templateName]) {
  console.log('');
  console.log('Workflow Template Library');
  console.log('');
  console.log('Usage: node scripts/workflow-templates.js <template> <name> [...features]');
  console.log('');
  console.log('Available templates:');
  Object.keys(templates).forEach((name) => {
    console.log(`  - ${name}`);
  });
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/workflow-templates.js microservice "Payment Service"');
  console.log(
    '  node scripts/workflow-templates.js dashboard "Analytics Dashboard" "Custom metric 1"'
  );
  console.log(
    '  node scripts/workflow-templates.js cliTool "Deploy Tool" "deploy command" "rollback command"'
  );
  console.log('');
  process.exit(1);
}

await templates[templateName](customName || `My ${templateName}`, customFeatures);
