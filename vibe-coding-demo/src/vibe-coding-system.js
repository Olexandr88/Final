#!/usr/bin/env node
/**
 * VIBE CODING SYSTEM - Environment Orchestrator
 * Implements "The Vibe Coder's Compass" principles for production-ready Claude Code workflows
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class VibeCodingSystem {
  constructor(projectRoot = process.cwd()) {
    this.root = projectRoot;
    this.claudeDir = path.join(this.root, '.claude');
  }

  // Initialize complete vibe coding environment
  async initializeEnvironment() {
    console.log('🎯 Initializing Vibe Coding Environment\n');

    const steps = [
      { name: 'Workspace isolation check', fn: () => this.checkWorkspaceIsolation() },
      { name: 'Git repository verification', fn: () => this.ensureGitRepo() },
      { name: 'Directory structure setup', fn: () => this.setupDirectories() },
      { name: 'CLAUDE.md constitution', fn: () => this.generateClaudeMd() },
      { name: 'Sub-agent team creation', fn: () => this.createSubAgents() },
      { name: 'Hook automation setup', fn: () => this.setupHooks() },
      { name: 'Permissions configuration', fn: () => this.configurePermissions() },
    ];

    const results = [];

    for (const step of steps) {
      try {
        console.log(`⏳ ${step.name}...`);
        const result = await step.fn();
        results.push({ step: step.name, status: 'success', result });
        console.log(`✓ ${step.name} complete\n`);
      } catch (error) {
        results.push({ step: step.name, status: 'error', error: error.message });
        console.error(`✗ ${step.name} failed: ${error.message}\n`);
      }
    }

    this.generateReport(results);
    return results;
  }

  checkWorkspaceIsolation() {
    // Check if we're in an isolated workspace (not root, not home)
    const isRoot = this.root === '/';
    const isHome = this.root === process.env.HOME || this.root === process.env.USERPROFILE;
    const hasNodeModules = fs.existsSync(path.join(this.root, 'node_modules'));
    const hasPackageJson = fs.existsSync(path.join(this.root, 'package.json'));

    if (isRoot || isHome) {
      throw new Error('⚠️  Running in root or home directory - create isolated workspace!');
    }

    return {
      isolated: true,
      hasProject: hasPackageJson,
      hasDependencies: hasNodeModules,
      path: this.root,
    };
  }

  ensureGitRepo() {
    try {
      execSync('git status', { cwd: this.root, stdio: 'pipe' });
      return { exists: true, message: 'Git repository found' };
    } catch {
      console.log('   Initializing Git repository...');
      execSync('git init', { cwd: this.root, stdio: 'pipe' });
      execSync('git add .', { cwd: this.root, stdio: 'pipe' });
      execSync('git commit -m "Initial commit - Vibe Coding System setup"', {
        cwd: this.root,
        stdio: 'pipe',
      });
      return { exists: true, message: 'Git repository initialized' };
    }
  }

  setupDirectories() {
    const dirs = [
      '.claude',
      '.claude/agents',
      '.claude/hooks',
      '.claude/workflows',
      'src',
      'tests',
      'docs',
    ];

    dirs.forEach((dir) => {
      const fullPath = path.join(this.root, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    });

    return { created: dirs.length, directories: dirs };
  }

  generateClaudeMd() {
    const claudeMdPath = path.join(this.root, 'CLAUDE.md');

    const template = `# Project Constitution - Vibe Coding Environment

## I. The Vibe Coding Paradigm

You are operating in a disciplined, high-velocity collaborative environment. This is not unstructured "vibing" - it is **Environment as Code** where planning precedes execution.

### Your Role
- **Architect, not implementer**: You guide at a high level
- **Reviewer, not writer**: You verify AI-generated code rigorously
- **Navigator, not passenger**: You steer with precision

## II. Project Structure

\`\`\`
${path.basename(this.root)}/
├── src/              # Application source code
├── tests/            # Test suite (TDD mandatory)
├── docs/             # Documentation
├── .claude/          # Claude Code configuration
│   ├── agents/       # Sub-agent definitions
│   ├── hooks/        # Automation hooks
│   └── workflows/    # Workflow templates
└── CLAUDE.md         # This file
\`\`\`

## III. Technical Stack

**Language:** ${this.detectLanguage()}
**Package Manager:** ${this.detectPackageManager()}
**Testing:** ${this.detectTestFramework()}
**Version Control:** Git (mandatory)

## IV. Workflow Patterns

### The Golden Workflow: Explore → Plan → Code → Commit

1. **Explore**: Read project structure, gather context (NO CODE)
2. **Plan**: Create detailed step-by-step plan in PLAN.md
3. **Code**: Implement ONLY after plan approval
4. **Commit**: Git commit with descriptive message

### Test-Driven Development (TDD)

For ALL critical features:
1. Write failing tests FIRST
2. Confirm tests fail
3. Implement minimum code to pass
4. Refactor with passing tests

## V. Coding Conventions

### Security (Non-Negotiable)
- ✅ Use parameterized queries (NO raw SQL)
- ✅ Validate ALL inputs
- ✅ No secrets in code (use .env)
- ✅ Sanitize user data

### Code Quality
- ✅ DRY principle (no repetition)
- ✅ SOLID principles
- ✅ Clear, descriptive names
- ✅ Comments for complex logic
- ✅ Error handling on ALL async operations

### Testing
- ✅ Minimum 90% coverage
- ✅ Test edge cases
- ✅ Test error conditions
- ✅ Mock external dependencies

## VI. Anti-Patterns (AVOID)

### The Seven Deadly Sins
1. **Vague Prompting**: Always provide clear, specific instructions
2. **Monolithic Tasking**: Break large tasks into small, verifiable steps
3. **Context Neglect**: Use /clear between major tasks
4. **Blind Trust**: NEVER assume AI output is correct - verify everything
5. **Environmental Contamination**: Keep workspace isolated
6. **Tool Ignorance**: Leverage sub-agents, hooks, and MCP
7. **Premature Vibing**: Plan thoroughly before coding

### Specific Anti-Patterns
- ❌ Raw SQL strings (use parameterized queries)
- ❌ Unhandled promise rejections
- ❌ Missing input validation
- ❌ Hardcoded configuration
- ❌ God objects/functions
- ❌ Copy-paste code duplication

## VII. Commands Reference

### Common Operations
\`\`\`bash
# Run tests
npm test

# Run linter
npm run lint

# Build project
npm run build

# Start development server
npm run dev
\`\`\`

### Claude Code Commands
- \`/clear\` - Reset context between tasks
- \`/compact\` - Summarize long conversations
- \`/agents\` - Manage sub-agents
- \`/hooks\` - View automation hooks
- \`/permissions\` - Configure tool allowlist

## VIII. Sub-Agent Orchestration

### Available Specialists
- **code-reviewer**: Security, quality, best practices review
- **test-specialist**: TDD, comprehensive test suites
- **ui-designer**: Frontend, accessibility, visual design
- **architect**: System design, tech decisions
- **debugger**: Systematic bug diagnosis

### Delegation Protocol
Always delegate to specialists for their domain. Use explicit delegation:
\`\`\`
"Use the code-reviewer sub-agent to audit this module for security vulnerabilities"
\`\`\`

## IX. Quality Gates

### Before Committing
- ✅ All tests passing
- ✅ Linter passing
- ✅ Build successful
- ✅ Code reviewed
- ✅ No TODO comments
- ✅ Documentation updated

### Before Deploying
- ✅ Integration tests passing
- ✅ Security audit clean
- ✅ Performance benchmarks met
- ✅ Environment variables documented
- ✅ Rollback plan documented

## X. Emergency Procedures

### When AI Goes Off Track
1. Press **ESC** immediately to interrupt
2. Provide corrective feedback
3. If needed, double-tap **ESC** to fork conversation
4. Revert to last good commit if corrupted

### When Context is Lost
1. Run \`/clear\` to reset
2. Use session manager to load previous summary
3. Re-establish context with CLAUDE.md
4. Resume with smaller, focused tasks

---

**Remember:** The "vibe" is earned through discipline, not improvisation.

*Generated by Vibe Coding System*
*Based on "The Vibe Coder's Compass"*
`;

    fs.writeFileSync(claudeMdPath, template);
    return { path: claudeMdPath, size: template.length };
  }

  detectLanguage() {
    if (fs.existsSync(path.join(this.root, 'package.json')))
      return 'JavaScript/TypeScript (Node.js)';
    if (fs.existsSync(path.join(this.root, 'requirements.txt'))) return 'Python';
    if (fs.existsSync(path.join(this.root, 'Cargo.toml'))) return 'Rust';
    if (fs.existsSync(path.join(this.root, 'go.mod'))) return 'Go';
    return 'Unknown (update CLAUDE.md)';
  }

  detectPackageManager() {
    if (fs.existsSync(path.join(this.root, 'package-lock.json'))) return 'npm';
    if (fs.existsSync(path.join(this.root, 'yarn.lock'))) return 'yarn';
    if (fs.existsSync(path.join(this.root, 'pnpm-lock.yaml'))) return 'pnpm';
    if (fs.existsSync(path.join(this.root, 'requirements.txt'))) return 'pip';
    return 'Unknown';
  }

  detectTestFramework() {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(this.root, 'package.json'), 'utf8'));
      if (pkg.devDependencies?.jest) return 'Jest';
      if (pkg.devDependencies?.mocha) return 'Mocha';
      if (pkg.devDependencies?.vitest) return 'Vitest';
    } catch {}
    return 'Unknown (configure tests)';
  }

  createSubAgents() {
    const agents = [
      {
        name: 'code-reviewer',
        description: 'Security, quality, and best practices auditor',
        systemPrompt: `You are a senior code reviewer specializing in security and quality.

Your responsibilities:
1. Identify security vulnerabilities (SQL injection, XSS, CSRF, etc.)
2. Check adherence to project coding standards
3. Flag performance issues
4. Verify error handling
5. Ensure test coverage
6. Be BRUTALLY HONEST - never sugarcoat issues

Rate every review: EXCELLENT | GOOD | NEEDS_WORK | CRITICAL_ISSUES

Provide specific line-by-line feedback with fix suggestions.`,
        tools: ['Read', 'Grep', 'Glob'],
      },
      {
        name: 'test-specialist',
        description: 'TDD expert and comprehensive test suite designer',
        systemPrompt: `You are a test automation specialist. You enforce TDD rigorously.

Workflow:
1. Write failing tests FIRST
2. Confirm tests fail (run them)
3. Implement minimum code to pass
4. Run tests to verify
5. Refactor while keeping tests green

Requirements:
- 90%+ coverage minimum
- Test all edge cases
- Test error conditions
- Use appropriate mocking
- Clear, descriptive test names

NEVER implement features before tests exist.`,
        tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep'],
      },
      {
        name: 'architect',
        description: 'System design and technical decision specialist',
        systemPrompt: `You are a software architect focused on high-level design.

Your expertise:
1. System architecture patterns
2. Technology selection
3. Scalability planning
4. Performance optimization strategy
5. Security architecture

Deliverables:
- Architecture diagrams (in markdown)
- Technology decision records
- Design patterns recommendations
- Scalability analysis

Think deeply about trade-offs and long-term maintainability.`,
        tools: ['Read', 'Write', 'Grep', 'Glob', 'WebFetch'],
      },
    ];

    agents.forEach((agent) => {
      const agentPath = path.join(this.claudeDir, 'agents', `${agent.name}.json`);
      fs.writeFileSync(
        agentPath,
        JSON.stringify(
          {
            name: agent.name,
            description: agent.description,
            systemPrompt: agent.systemPrompt,
            tools: agent.tools,
            model: 'claude-sonnet-4-5',
          },
          null,
          2
        )
      );
    });

    return { created: agents.length, agents: agents.map((a) => a.name) };
  }

  setupHooks() {
    const hooksPath = path.join(this.claudeDir, 'settings.json');

    const hooks = {
      hooks: {
        PostToolUse: [
          {
            name: 'Auto-format Python',
            matcher: 'Edit|Write',
            command:
              'if [[ "$CLAUDE_TOOL_INPUT" == *.py ]]; then black "$CLAUDE_TOOL_INPUT" 2>/dev/null || true; fi',
          },
          {
            name: 'Auto-format JavaScript',
            matcher: 'Edit|Write',
            command:
              'if [[ "$CLAUDE_TOOL_INPUT" =~ \\.(js|ts|jsx|tsx)$ ]]; then npx prettier --write "$CLAUDE_TOOL_INPUT" 2>/dev/null || true; fi',
          },
        ],
        PreToolUse: [
          {
            name: 'Security check',
            matcher: 'Bash',
            command:
              'echo "[Hook] Running command: $CLAUDE_TOOL_INPUT" && if [[ "$CLAUDE_TOOL_INPUT" =~ rm\\ -rf\\ / ]]; then echo "BLOCKED: Dangerous command"; exit 1; fi',
          },
        ],
      },
    };

    fs.writeFileSync(hooksPath, JSON.stringify(hooks, null, 2));
    return { configured: Object.keys(hooks.hooks).length };
  }

  configurePermissions() {
    const permissionsPath = path.join(this.claudeDir, 'allowed-tools.json');

    const config = {
      allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
      dangerousToolsRequireConfirmation: ['Write', 'Edit', 'Bash'],
      autoApprove: ['Read', 'Grep', 'Glob'],
    };

    fs.writeFileSync(permissionsPath, JSON.stringify(config, null, 2));
    return config;
  }

  generateReport(results) {
    console.log('\n' + '='.repeat(60));
    console.log('VIBE CODING ENVIRONMENT - INITIALIZATION REPORT');
    console.log('='.repeat(60) + '\n');

    const succeeded = results.filter((r) => r.status === 'success').length;
    const failed = results.filter((r) => r.status === 'error').length;

    results.forEach((result) => {
      const icon = result.status === 'success' ? '✓' : '✗';
      const color = result.status === 'success' ? '\x1b[32m' : '\x1b[31m';
      const reset = '\x1b[0m';

      console.log(`${color}${icon}${reset} ${result.step}`);
      if (result.status === 'error') {
        console.log(`   Error: ${result.error}\n`);
      }
    });

    console.log('\n' + '='.repeat(60));
    console.log(`Status: ${succeeded}/${results.length} steps completed`);
    console.log('='.repeat(60) + '\n');

    if (succeeded === results.length) {
      console.log('✅ Vibe Coding Environment Ready!');
      console.log('\nNext steps:');
      console.log('  1. Review CLAUDE.md and customize for your project');
      console.log('  2. Run: claude --dangerously-skip-permissions (for autonomous mode)');
      console.log('  3. Start with: "Explore this project and create a plan in PLAN.md"');
      console.log('\nRemember: Plan before coding. The vibe comes from discipline!');
    } else {
      console.log('⚠️  Some steps failed - review errors above');
    }

    return { succeeded, failed, total: results.length };
  }
}

// Export for use as module
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VibeCodingSystem };
}

// CLI
if (require.main === module) {
  const system = new VibeCodingSystem();
  system
    .initializeEnvironment()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}
