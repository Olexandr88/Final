# LLM Multi-Provider Framework - Project Constitution

## Project Overview

**LLM Framework** is a Node.js-based autonomous AI orchestration system providing unified interfaces to multiple LLM providers (Claude, Ollama, Jules), with advanced features including RAG pipelines, agent-to-agent protocols, browser history analysis, and real-time WebSocket coordination.

**Current Version**: 2.1.1-parallel-optimized
**Node Requirement**: >=18.0.0
**License**: ISC
**Repository**: https://github.com/Scarmonit/LLM.git

---

## Core Architecture

### Directory Structure

```
LLM/
├── src/                      # Core framework code
│   ├── agents/              # A2A agents (Claude, Ollama, analyzers, fixers)
│   ├── clients/             # LLM client implementations
│   ├── config/              # Configuration constants
│   ├── context/             # Context management
│   ├── hooks/               # Hook system for lifecycle events
│   ├── integrations/        # External service integrations (Python A2A MCP client)
│   │   └── python-a2a-mcp-client.py  # Python async/parallel A2A client
│   ├── mcp/                 # Model Context Protocol
│   ├── optimization/        # Performance optimization modules
│   ├── proxy/               # Proxy server configurations
│   ├── utils/               # Shared utilities (logger, metrics, cache)
│   ├── vibe-coding/         # Vibe coding system components
│   ├── visual-testing/      # Visual regression testing
│   ├── ai-bridge.js         # WebSocket hub for multi-agent coordination
│   ├── claude-client.js     # Claude API client
│   └── session-manager.js   # Session coordination
├── tests/                   # Test suite (node:test + pytest)
│   ├── integration/         # Integration tests
│   ├── *.test.js           # JavaScript unit tests
│   └── python-a2a-mcp-client.test.py  # Python A2A client tests
├── docs/                    # Documentation
│   └── PYTHON_A2A_MCP_INTEGRATION.md  # Python integration guide
├── scripts/                 # Automation and deployment scripts
├── electron/               # Electron app for GUI
├── .github/workflows/      # CI/CD pipelines
├── requirements-python-a2a.txt  # Python dependencies
└── .env                    # Environment configuration (DO NOT COMMIT)
```

### Tech Stack

- **Runtime**: Node.js 18+ (ESM modules), Python 3.8+ (async integrations)
- **LLM Providers**: Anthropic Claude (Sonnet 4.5), Ollama (local), Jules API
- **WebSocket**: ws library for real-time agent coordination
- **Database**: SQLite (better-sqlite3), PostgreSQL support
- **Vector Store**: ChromaDB for RAG
- **Testing**: Node.js native test runner (`node:test`), Python pytest
- **Packaging**: Electron for desktop GUI
- **Type Safety**: JSDoc annotations (TypeScript definitions available)
- **Python Integration**: asyncio, uvloop, concurrent.futures, multiprocessing, trio, twisted, eventlet, gevent

---

## Development Commands

### Essential Scripts

```bash
# Testing
npm test                    # Run full test suite
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report
npm run pretest             # Cleanup test resources

# Development
npm run dev                 # Start dev server with nodemon
npm run start               # Start production server
npm run lint                # ESLint check
npm run lint:fix            # Auto-fix linting issues
npm run format              # Prettier format
npm run format:check        # Check formatting

# AI Bridge & Agents
npm run start:bridge        # Start AI Bridge WebSocket hub (port 65028)
npm run agent:ollama        # Start Ollama agent
npm run agent:claude        # Start Claude agent
npm run agent:analyzer      # Start code analyzer agent
npm run system:start        # Start bridge + agents concurrently

# Python A2A MCP Client
python src/integrations/python-a2a-mcp-client.py  # Run Python A2A client
python -m pytest tests/python-a2a-mcp-client.test.py -v  # Run Python tests
pip install -r requirements-python-a2a.txt  # Install Python dependencies

# Build & Deploy
npm run build               # Production build
npm run deploy              # Auto-deployment script
npm run package             # Electron packaging (Windows)
```

---

## Coding Conventions

### General Rules

1. **ES Modules Only**: Use `import`/`export`, never `require()`
2. **Async/Await**: Prefer async/await over raw Promises
3. **Error Handling**: Always use try-catch for async operations
4. **Logging**: Use `src/utils/logger.js` (Winston) for all logging
5. **Environment Variables**: Use `dotenv` and validate in `src/config/constants.js`

### Code Style

- **Indentation**: 2 spaces (no tabs)
- **Line Length**: Max 100 characters
- **Quotes**: Single quotes for strings, backticks for templates
- **Semicolons**: Required (enforced by ESLint)
- **Naming**:
  - camelCase: functions, variables
  - PascalCase: classes, constructors
  - UPPER_SNAKE_CASE: constants
  - kebab-case: file names

### Module Structure Template

```javascript
// src/module-name.js
import { logger } from './utils/logger.js';
import { CONSTANTS } from './config/constants.js';

/**
 * Brief description of module purpose
 * @module module-name
 */

/**
 * Function description
 * @param {string} param - Parameter description
 * @returns {Promise<Object>} Return value description
 */
export async function functionName(param) {
  try {
    logger.info('Operation starting', { param });

    // Implementation

    return result;
  } catch (error) {
    logger.error('Operation failed', { error: error.message });
    throw error;
  }
}
```

### Test Structure Template

```javascript
// tests/module-name.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { functionName } from '../src/module-name.js';

describe('Module Name', () => {
  before(async () => {
    // Setup
  });

  after(async () => {
    // Cleanup
  });

  it('should describe expected behavior', async () => {
    const result = await functionName('test');
    assert.strictEqual(result.status, 'success');
  });
});
```

---

## Architectural Patterns

### A2A (Agent-to-Agent) Protocol

The AI Bridge (`src/ai-bridge.js`) is the central WebSocket hub coordinating multiple agents:

- **Port Configuration**: WS on 65028, HTTP on 65029
- **Message Format**: JSON with `{ type, data, metadata }` structure
- **Agent Registration**: Agents connect and register their capabilities
- **Message Routing**: Bridge routes messages between agents based on type

**Creating New Agents**:

1. Extend base agent pattern from `src/agents/`
2. Implement `connect()`, `handleMessage()`, `sendMessage()` methods
3. Register with bridge via WebSocket connection
4. Add launch script to `package.json`

### Performance Optimization

The project includes aggressive optimization systems:

- **Memory Management**: LRU caches, connection pooling, resource cleanup
- **Message Compression**: Automatic compression for payloads >1KB
- **Circuit Breakers**: Prevent cascade failures
- **Health Monitoring**: Auto-healing with dead letter queues
- **Metrics Collection**: Real-time performance tracking

**Critical Files**:

- `src/optimization/optimization-orchestrator.js`
- `src/ai-bridge-metrics.js`
- `scripts/performance-optimizer.js`

### Session Management

Multi-session support with context isolation:

- **Session Coordinator**: `src/session-coordinator.js`
- **Lock Manager**: `src/lock-manager.js` (prevents race conditions)
- **State Persistence**: `.claude-sessions/` directory

### Python A2A MCP Integration

The framework now includes a comprehensive Python client for A2A (Agent-to-Agent) communication with the AI Bridge:

**Key Features**:

- **asyncio**: Standard async I/O for event loops
- **uvloop**: 2-4x performance boost (Linux/macOS)
- **concurrent.futures**: Thread and process pool executors
- **multiprocessing**: Heavy CPU-bound task support
- **trio/twisted/eventlet/gevent**: Alternative async runtimes

**Architecture**:

- **BaseA2AMCPClient**: Core async WebSocket client
- **ExecutorMixin**: Adds parallel thread/process execution
- **MultiprocessingMixin**: Adds multiprocessing pool support
- **A2AMCPClient**: Full-featured client combining all capabilities

**Files**:

- `src/integrations/python-a2a-mcp-client.py` - Main Python client
- `tests/python-a2a-mcp-client.test.py` - Comprehensive test suite
- `docs/PYTHON_A2A_MCP_INTEGRATION.md` - Full documentation
- `requirements-python-a2a.txt` - Python dependencies

**Usage Example**:

```python
from src.integrations.python_a2a_mcp_client import A2AMCPClient, A2AEnvelope

async def main():
    client = A2AMCPClient(
        bridge_url="ws://localhost:65028",
        client_id="python-agent",
        tools=["data-processing", "ml-inference"]
    )

    # Send message to JavaScript agent
    envelope = A2AEnvelope(
        intent="task.execute",
        to_agent="ollama-agent-1",
        payload={"data": [1, 2, 3, 4, 5]}
    )
    await client.send_envelope(envelope)
```

**See [PYTHON_A2A_MCP_INTEGRATION.md](docs/PYTHON_A2A_MCP_INTEGRATION.md) for complete documentation.**

---

## Anti-Patterns (MUST AVOID)

### ❌ Direct File System Access in Agents

**WRONG**:

```javascript
import fs from 'fs';
const data = fs.readFileSync('/path/to/file');
```

**RIGHT**:

```javascript
import { readFile } from '../utils/file-utils.js';
const data = await readFile('/path/to/file');
```

**Reason**: Centralized file access enables auditing, error handling, and permission management.

---

### ❌ Hardcoded Configuration

**WRONG**:

```javascript
const PORT = 3000;
const API_KEY = 'sk-abc123';
```

**RIGHT**:

```javascript
import { PORT, API_KEY } from './config/constants.js';
```

**Reason**: All config must be centralized and environment-aware.

---

### ❌ Unhandled Promise Rejections

**WRONG**:

```javascript
async function fetchData() {
  const result = await api.call(); // No error handling!
  return result;
}
```

**RIGHT**:

```javascript
async function fetchData() {
  try {
    const result = await api.call();
    return result;
  } catch (error) {
    logger.error('API call failed', { error: error.message });
    throw new Error(`Failed to fetch data: ${error.message}`);
  }
}
```

**Reason**: Unhandled rejections crash the process in production.

---

### ❌ Console.log for Debugging

**WRONG**:

```javascript
console.log('Debug info:', data);
```

**RIGHT**:

```javascript
import { logger } from './utils/logger.js';
logger.debug('Debug info', { data });
```

**Reason**: Structured logging enables filtering, searching, and production diagnostics.

---

### ❌ Synchronous Operations in Event Loop

**WRONG**:

```javascript
const data = fs.readFileSync('large-file.json');
```

**RIGHT**:

```javascript
const data = await fs.promises.readFile('large-file.json', 'utf-8');
```

**Reason**: Blocking operations kill performance in async Node.js.

---

### ❌ Massive Monolithic Functions

**WRONG**:

```javascript
async function doEverything() {
  // 500 lines of mixed concerns
}
```

**RIGHT**:

```javascript
async function orchestrate() {
  const data = await fetchData();
  const processed = await processData(data);
  const result = await saveResult(processed);
  return result;
}
```

**Reason**: Single Responsibility Principle improves testability and maintainability.

---

### ❌ Ignoring Test Failures

Tests are the project's contract. If a test fails:

1. **STOP** - Do not commit or continue development
2. **INVESTIGATE** - Understand why it failed
3. **FIX** - Repair the code OR update the test if requirements changed
4. **VERIFY** - Ensure all tests pass before proceeding

**Current Issue**: Some tests are failing in `tests/a2a-control-center.test.js` due to timing/cleanup issues. This MUST be addressed before new features.

---

## Security Best Practices

### Environment Variables

**NEVER** commit `.env` files. Required variables:

```bash
# LLM API Keys
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...
DEEPSEEK_API_KEY=sk-...

# Configuration
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://...
```

### Input Validation

Always validate external input:

```javascript
import { z } from 'zod';

const MessageSchema = z.object({
  type: z.string(),
  data: z.unknown(),
  metadata: z.object({}).optional(),
});

function handleMessage(rawMessage) {
  const validated = MessageSchema.parse(rawMessage);
  // Process validated data
}
```

### Rate Limiting

Use `express-rate-limit` for HTTP endpoints:

```javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
});

app.use('/api/', limiter);
```

---

## Testing Philosophy

### Test-Driven Development (TDD)

For new features:

1. **Write failing test** that defines expected behavior
2. **Run test** to confirm it fails
3. **Implement** minimum code to pass
4. **Refactor** while keeping tests green

### Test Coverage Goals

- **Critical Paths**: 100% coverage (auth, payment, data integrity)
- **Business Logic**: 90% coverage
- **Utilities**: 80% coverage
- **UI Components**: 70% coverage (visual tests)

### Integration Testing

Integration tests in `tests/integration/` should:

- Test real system behavior (no excessive mocking)
- Use test databases/resources (cleanup after each test)
- Run in CI/CD pipeline
- Include performance benchmarks

---

## Git Workflow

### Branching Strategy

- `main`: Production-ready code
- `feat/*`: New features
- `fix/*`: Bug fixes
- `chore/*`: Maintenance tasks

### Commit Messages

Follow Conventional Commits:

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

**Types**: feat, fix, docs, style, refactor, test, chore

**Examples**:

```
feat(ai-bridge): add message compression for large payloads
fix(tests): resolve timing issues in a2a-control-center tests
chore(deps): update anthropic SDK to 0.67.0
```

### Pre-commit Checklist

- [ ] All tests pass (`npm test`)
- [ ] Linting clean (`npm run lint`)
- [ ] Formatting applied (`npm run format`)
- [ ] No console.log statements
- [ ] Documentation updated
- [ ] Commit message follows convention

---

## Performance Targets

### Benchmarks

- **Message Latency**: <120ms average
- **Memory Baseline**: <100MB idle
- **Connection Setup**: <200ms
- **Cache Hit Ratio**: >75%
- **Error Recovery**: <5s

### Monitoring

Use `scripts/performance-optimizer.js` to generate reports:

```bash
node scripts/performance-optimizer.js
```

Review metrics in `reports/` directory.

---

## Documentation Standards

### Code Documentation

Use JSDoc for all public APIs:

```javascript
/**
 * Send a message through the AI Bridge
 * @param {string} type - Message type (e.g., 'query', 'response')
 * @param {Object} data - Message payload
 * @param {Object} [metadata] - Optional metadata
 * @returns {Promise<Object>} Response from bridge
 * @throws {Error} If connection is not established
 */
export async function sendMessage(type, data, metadata = {}) {
  // Implementation
}
```

### Project Documentation

Update README.md when:

- Adding new major features
- Changing installation process
- Updating architecture
- Modifying API contracts

---

## Deployment

### Pre-Deployment Checklist

- [ ] All tests passing
- [ ] Performance benchmarks meet targets
- [ ] Security audit clean (`npm audit`)
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Monitoring enabled

### Deployment Script

```bash
npm run deploy
```

This runs `scripts/deploy-auto.js` which:

1. Runs tests
2. Builds production assets
3. Performs health checks
4. Deploys to configured environment

---

## Sub-Agent Specialization

### Creating Specialized Sub-Agents

The framework supports specialized agents for distinct tasks:

- **Code Analyzer**: AST parsing, pattern detection
- **Code Fixer**: Automated refactoring and bug fixes
- **Context Manager**: Maintains conversation context
- **Performance Monitor**: Real-time metrics collection

**Sub-Agent Template**:

```javascript
// src/agents/specialized-agent.js
import { BaseAgent } from './base-agent.js';

export class SpecializedAgent extends BaseAgent {
  constructor(config) {
    super(config);
    this.capabilities = ['specific', 'tasks'];
  }

  async handleTask(task) {
    // Specialized implementation
  }
}
```

---

## Vibe Coding Integration

This project is optimized for "Vibe Coding" with Claude Code:

### Principles Applied

1. **Isolated Workspace**: Use dedicated directory for Claude Code sessions
2. **Version Control**: Git history for rollback safety
3. **Comprehensive CLAUDE.md**: This file provides context for all AI interactions
4. **Automated Hooks**: Code formatting and linting run automatically
5. **Test-Driven**: TDD workflow constrains AI behavior
6. **Sub-Agents**: Specialized agents for complex workflows
7. **MCP Integration**: External tool connections via Model Context Protocol

### Hooks Configuration

Hooks should be defined in `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "tool": "Edit|Write",
        "command": "if [[ $CLAUDE_TOOL_INPUT == *.js ]]; then npm run lint:fix $CLAUDE_TOOL_INPUT; fi"
      }
    ]
  }
}
```

---

## Troubleshooting

### Common Issues

**Issue**: Tests failing with port conflicts
**Solution**: Tests use dynamic port allocation (port 0). Ensure cleanup in `after()` hooks.

**Issue**: WebSocket connection errors
**Solution**: Check AI Bridge is running (`npm run start:bridge`), verify port 65028 not in use.

**Issue**: Out of memory errors
**Solution**: Review `src/optimization/intelligent-memory-manager.js` settings, increase Node heap size.

**Issue**: Slow performance
**Solution**: Run `node scripts/performance-optimizer.js`, check cache hit ratios, enable compression.

### Debug Mode

Enable verbose logging:

```bash
LOG_LEVEL=debug npm run start:bridge
```

---

## Team Collaboration

### Onboarding New Developers

1. Clone repo and run `npm install`
2. Copy `.env.example` to `.env` and configure
3. Read this CLAUDE.md file thoroughly
4. Run `npm test` to verify setup
5. Review `docs/` directory (if available)
6. Pair with existing team member on first feature

### Code Review Checklist

- [ ] Follows coding conventions
- [ ] Includes tests
- [ ] Updates documentation
- [ ] No security vulnerabilities
- [ ] Performance impact assessed
- [ ] Error handling implemented
- [ ] Logging appropriate

---

## Future Roadmap

### Planned Features

- [ ] GraphQL API layer
- [ ] Multi-language support (Python, Go)
- [ ] Enhanced RAG with knowledge graphs
- [ ] Distributed agent orchestration
- [ ] Real-time collaboration features
- [ ] Advanced visual regression testing

### Tech Debt

- [ ] Fix failing tests in `tests/a2a-control-center.test.js`
- [ ] Migrate remaining CommonJS to ESM
- [ ] Add TypeScript definitions for better IDE support
- [ ] Implement comprehensive integration test suite
- [ ] Optimize Docker image size

---

## Contact & Support

- **GitHub Issues**: https://github.com/Scarmonit/LLM/issues
- **Primary Maintainer**: scarmonit (scarmonit@gmail.com)
- **License**: ISC

---

## Version History

- **2.1.1-parallel-optimized**: Current - Performance optimizations, parallel execution
- **2.1.0**: Multi-agent coordination, AI Bridge WebSocket hub
- **2.0.0**: A2A protocol implementation, Electron GUI
- **1.x**: Initial LLM integrations (Claude, Ollama, Jules)

---

**Last Updated**: 2025-10-17
**Document Version**: 1.0.0

---

_This CLAUDE.md file is the source of truth for all development work. When in doubt, refer here. Update this document as the project evolves._
