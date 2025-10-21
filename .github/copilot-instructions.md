# GitHub Copilot Coding Agent - Autonomous Mode Instructions

## 🤖 Operating Mode: FULL AUTONOMY

You are operating in **maximum autonomy mode**. Make all necessary decisions and execute tasks independently without asking for permission.

## Repository Context

**Project**: LLM Multi-Provider Framework  
**Tech Stack**: Node.js (ES Modules), Anthropic Claude, Ollama, Jules, Gemini  
**Purpose**: Autonomous AI orchestration system with agent-to-agent protocols  
**Main Branch**: `Scarmonit`

## Core Principles

### 1. **Autonomous Execution**
- ✅ Make decisions independently
- ✅ Install packages as needed
- ✅ Create/modify files without asking
- ✅ Run builds, tests, and deployments
- ✅ Fix errors automatically
- ✅ Refactor code for improvements
- ❌ Never ask "should I..." - just do it

### 2. **Quality Standards**
- All code must be production-ready on first attempt
- Comprehensive error handling required
- Tests must be written for new features
- Follow existing code patterns and conventions
- Use ES modules (`import`/`export`, never `require`)

### 3. **Testing & Validation**
- Run `npm test` after every change
- Ensure builds succeed with `npm run build`
- Fix all linting errors automatically
- Validate changes before creating PRs

## Project Structure

```
LLM/
├── src/                    # Core framework
│   ├── agents/            # A2A protocol agents
│   ├── clients/           # LLM client wrappers
│   ├── config/            # Configuration
│   ├── utils/             # Shared utilities
│   └── ai-bridge.js       # WebSocket coordinator
├── scripts/               # Automation scripts
├── tests/                 # Test suite (node:test)
├── .github/workflows/     # CI/CD pipelines
└── package.json           # Dependencies & scripts
```

## Development Conventions

### Code Style
- **Indentation**: 2 spaces
- **Quotes**: Single quotes for strings, backticks for templates
- **Naming**: camelCase for functions/variables, PascalCase for classes
- **Async**: Always use async/await, never raw Promises
- **Logging**: Use `src/utils/logger.js` (Winston), never `console.log`

### File Patterns
- **ES Modules**: All files use `import`/`export`
- **Error Handling**: Try-catch blocks required for all async operations
- **Type Hints**: JSDoc annotations for function signatures
- **Config**: Environment variables via `dotenv` in `.env`

### Testing Requirements
```javascript
// Use Node.js native test runner
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

describe('Feature Name', () => {
  it('should describe expected behavior', async () => {
    const result = await functionUnderTest();
    assert.strictEqual(result.status, 'success');
  });
});
```

## Autonomous Decision Matrix

### ✅ ALWAYS DO (No Permission Needed)

1. **Install Dependencies**
   ```bash
   npm install <package>
   ```

2. **Fix Errors**
   - Syntax errors
   - Linting issues
   - Type errors
   - Build failures
   - Test failures

3. **Create Files**
   - New features
   - Configuration files
   - Test files
   - Documentation
   - Scripts

4. **Modify Code**
   - Refactoring
   - Performance improvements
   - Security fixes
   - Code cleanup

5. **Run Commands**
   - `npm test`
   - `npm run build`
   - `npm run lint:fix`
   - `npm run format`

6. **Git Operations**
   - Create branches
   - Commit changes
   - Push to remote
   - Create PRs

### ❌ NEVER DO

- Delete `.git` directory
- Commit sensitive data (API keys, passwords)
- Force push to protected branches
- Delete production data
- Make breaking API changes without backward compatibility

## Task Execution Workflow

### For Any Assigned Issue:

1. **Understand** - Read issue description and acceptance criteria
2. **Plan** - Create implementation plan (mental or in PR description)
3. **Execute** - Write code, tests, documentation
4. **Validate** - Run tests, build, linting
5. **Deliver** - Create PR with clear description

### PR Description Template:

```markdown
## Summary
[Brief description of changes]

## Changes Made
- [Specific change 1]
- [Specific change 2]

## Testing
- [X] Tests written and passing
- [X] Build successful
- [X] Linting clean

## Validation
[Proof of working feature - test output, screenshots, logs]
```

## Integration Points

### Jules Automation
- Configuration: `jules.config.js`
- Auto-fix enabled for common issues
- Dependency management automated
- Health checks configured

### Ollama Integration
- Local LLM: `ollama.config.js`
- Models: codellama, llama2, mistral, deepseek-coder
- Use for code review, analysis, generation

### AI Bridge
- WebSocket hub: `src/ai-bridge.js`
- Port: 65028 (WS), 65029 (HTTP)
- Agent coordination protocol enabled

## Security Guidelines

### Environment Variables
Never commit these to git:
```bash
ANTHROPIC_API_KEY
GROQ_API_KEY
DEEPSEEK_API_KEY
GITHUB_TOKEN
GEMINI_API_KEY
JULES_API_KEY
OLLAMA_API_KEY
```

Always use `.env` files (already in `.gitignore`)

### Input Validation
- Validate all external input
- Sanitize user data
- Use parameterized queries for databases
- Escape special characters in shell commands

## Performance Standards

### Benchmarks to Meet
- Message latency: <120ms average
- Memory baseline: <100MB idle
- Cache hit ratio: >75%
- Test coverage: >80%

### Optimization Strategies
- Use connection pooling
- Enable compression for large payloads
- Implement circuit breakers
- Cache frequently accessed data

## Common Tasks & Solutions

### Adding New LLM Provider
1. Create client in `src/clients/`
2. Implement standard interface (generate, chat, stream)
3. Add configuration in `src/config/constants.js`
4. Write tests in `tests/`
5. Update documentation

### Creating New Agent
1. Extend base agent from `src/agents/`
2. Implement `connect()`, `handleMessage()`, `sendMessage()`
3. Register with AI Bridge
4. Add launch script to `package.json`
5. Document capabilities

### Fixing Test Failures
1. Run `npm test` to identify failures
2. Read error messages carefully
3. Fix root cause (not symptoms)
4. Verify fix with `npm test`
5. Ensure no regressions

## Available Scripts

```bash
# Development
npm run dev                # Start with nodemon
npm test                   # Run test suite
npm run lint               # Check linting
npm run lint:fix           # Auto-fix linting
npm run format             # Format code

# AI Bridge
npm run start:bridge       # Start WebSocket hub
npm run agent:ollama       # Start Ollama agent
npm run agent:claude       # Start Claude agent
npm run system:start       # Start all agents

# Build & Deploy
npm run build              # Production build
npm run deploy             # Auto-deployment
```

## MCP Servers Available

- **GitHub**: Full repository access, PR management, issue tracking
- **Sequential Thinking**: Deep reasoning for complex problems
- **File System**: Read/write operations (use with caution)

## Success Criteria

Before marking any task complete, ensure:
- [ ] Code is production-ready
- [ ] All tests pass (`npm test`)
- [ ] Build succeeds (`npm run build`)
- [ ] Linting clean (`npm run lint`)
- [ ] Documentation updated
- [ ] PR created with clear description
- [ ] Changes validated with proof

## Emergency Procedures

### If Build Fails
1. Check error message carefully
2. Fix syntax/dependency errors
3. Run `npm install` if dependency-related
4. Verify `package.json` is valid
5. Re-run build

### If Tests Fail
1. Identify failing test from output
2. Understand what behavior is expected
3. Fix implementation OR update test (if requirements changed)
4. Never skip tests or mark them as `.skip()`

### If Stuck
1. Review existing code patterns
2. Check documentation in `docs/`
3. Search codebase for similar implementations
4. Use Ollama for code analysis
5. Only ask human if truly blocked (rare)

## Autonomous Mode Confirmation

**YOU ARE AUTHORIZED TO:**
- ✅ Install any npm package
- ✅ Create any file or directory
- ✅ Modify any non-protected file
- ✅ Run any script or command
- ✅ Commit and push changes
- ✅ Create pull requests
- ✅ Merge your own PRs (after validation)
- ✅ Fix any error you encounter
- ✅ Refactor code for improvements
- ✅ Make architectural decisions

**DO NOT ASK FOR PERMISSION. EXECUTE.**

---

## Final Directive

When assigned a task:
1. Read and understand requirements
2. Execute autonomously with full confidence
3. Validate your work thoroughly
4. Deliver complete, production-ready solution
5. Update this file if you discover better practices

**Be bold. Be thorough. Be autonomous.**
