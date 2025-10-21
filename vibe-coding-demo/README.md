# Vibe Coding Demo

**Comprehensive demonstration of "Vibe Coding with Claude Code" best practices.**

This project showcases the key concepts from the multi-part "Vibe Coding with Claude Code" series, including sub-agents, hooks, visual UI testing, and production-ready workflows.

## 🚀 What is Vibe Coding?

Vibe coding is an AI-assisted development approach where you guide the model with natural language and high-level intent, letting it handle the grunt work of writing and modifying code. This demo implements the lessons learned from hundreds of millions of tokens of Claude Code usage.

## 📁 Project Structure

```
vibe-coding-demo/
├── agents/                    # Sub-agent configurations
│   ├── code-reviewer.json     # Quality & security reviewer
│   ├── test-specialist.json   # Testing expert
│   └── ui-designer.json       # UI/UX specialist
├── hooks/                     # Automated workflow hooks
│   ├── post-edit-format.js    # Auto-format after edits
│   ├── pre-commit-test.js     # Test before commits
│   ├── pre-bash-security.js   # Security guardrails
│   └── post-subagent-monitor.js # Sub-agent output monitoring
├── examples/                  # Practical examples
│   ├── ui-visual-testing.js   # Visual UI testing workflow
│   └── sample-ui.html         # Sample dashboard UI
├── production-checklist.js    # Production readiness validator
├── CLAUDE.md                  # Project-specific Claude config
└── README.md                  # This file
```

## 🎯 Key Features Demonstrated

### 1. Sub-Agents
Specialized AI assistants for different tasks, each with:
- Custom system prompts
- Specific tool access
- Independent context windows (100k tokens each)
- Domain expertise

**Example usage:**
```bash
# In Claude Code chat:
"Use the code-reviewer sub-agent to check my recent changes"
```

### 2. Hooks
Automated workflows that run at specific events:

- **Post-Edit Format**: Auto-formats files after Claude edits them
- **Pre-Commit Test**: Blocks commits with failing tests
- **Pre-Bash Security**: Prevents dangerous commands
- **Post-Subagent Monitor**: Detects output filtering

### 3. Visual UI Testing
Iterative UI design workflow:
1. Claude generates UI code
2. Renders in headless browser
3. Takes screenshot
4. Analyzes against design spec
5. Iterates until perfect

**Demo:**
```bash
npm run demo:ui
```

### 4. Production Readiness
Automated checklist to ensure projects meet production standards:

**Run the checker:**
```bash
npm run production-check
```

**Checks include:**
- ✅ Secrets management (.env, .gitignore)
- ✅ Dependency security (npm audit)
- ✅ Test suite & coverage (90%+ target)
- ✅ Code linting & formatting
- ✅ TypeScript strict mode
- ✅ Documentation (README)
- ✅ Build process
- ✅ Environment configuration

## 📚 Core Principles from the Series

### 1. Communicate the "Vibe"
Describe the outcome or feel, not implementation details:
```
❌ "Create a function that loops through users and filters by role"
✅ "Implement user role filtering with a vibe similar to GitHub's team permissions"
```

### 2. Context Management
- Reset context between major tasks
- Summarize work before starting new sessions
- Keep CLAUDE.md concise and tested

### 3. Stay in the Loop
- Review diffs that Claude produces
- Ask it to explain non-trivial changes
- Use sub-agents for double-checking
- Act as a tech lead reviewing junior dev code

### 4. Test-Driven Development
- Write tests BEFORE implementation
- Always run tests yourself
- Use hooks to automatically run tests
- Never trust "All tests passed" without proof

### 5. Sub-Agent Awareness
- Main agent "beautifies" sub-agent output
- Critical feedback may be filtered
- Monitor sub-agent transcripts for important tasks
- Ask explicitly: "Did the sub-agent identify any issues you haven't mentioned?"

## 🛠️ Installation

```bash
cd vibe-coding-demo
npm install
```

## 🧪 Usage

### Run Tests
```bash
npm test
```

### Check Production Readiness
```bash
npm run production-check
```

### Visual UI Testing Demo
```bash
npm run demo:ui
```

### Format Code
```bash
npm run format
```

### Full Validation
```bash
npm run validate
```

## 🔐 Security Best Practices

1. **Secrets**: Always use `.env` files (in `.gitignore`)
2. **Dependencies**: Run `npm audit` regularly
3. **Hooks**: Use pre-bash security hook to block dangerous commands
4. **Input Validation**: Validate all user inputs
5. **Permissions**: Follow principle of least privilege

## 📖 Common Mistakes to Avoid

### 1. Losing Context in Long Sessions
**Problem**: AI becomes confused after extensive back-and-forth
**Solution**: Reset context, create summaries, start fresh sessions

### 2. Skipping Testing
**Problem**: Trusting AI output without verification
**Solution**: TDD approach, automated test hooks, manual verification

### 3. Over-reliance on AI
**Problem**: Approving every action without review
**Solution**: Review diffs, act as tech lead, use sub-agents for checks

### 4. Neglecting Security
**Problem**: Hardcoded secrets, missing .gitignore entries
**Solution**: Use production checklist, automated security hooks

### 5. MVP ≠ Production
**Problem**: Treating AI-generated code as production-ready
**Solution**: Polish, optimize, document, audit before deployment

## 🎓 Learning Resources

This demo is based on the "Vibe Coding with Claude Code" series:

1. **First Steps**: Using Sub-Agents in Claude Code
2. **Everything About Claude Code's Toolkit**
3. **Writing Prompts for Effective Vibe Coding**
4. **Sub-Agents Deep Dive**: Correcting Misconceptions
5. **Boosting Performance with Commands & Hooks**
6. **Designing a Beautiful Interface via Vibe Coding**
7. **Common Mistakes and Achieving Production-Ready Quality**

## 💡 Tips for Success

1. **Be conversational but precise** - Guide Claude like a pair programmer
2. **Iterate and refine** - Don't expect perfection on first attempt
3. **Use structured prompts** - Intent, Constraints, Step-by-Step plan
4. **Leverage examples** - Show Claude what you mean (design galleries, references)
5. **Break tasks down** - Component by component, feature by feature
6. **Verify everything** - Run tests, check builds, prove it works
7. **Stay in control** - Human judgment is still critical

## 🚀 Next Steps

1. Clone this repo as a template for your projects
2. Customize `CLAUDE.md` with your project specifics
3. Configure sub-agents for your domain
4. Set up hooks for your workflow
5. Use production checklist before deploying
6. Iterate and improve based on your experience

## 📄 License

MIT License - Feel free to use this demo in your projects!

---

**Built with Claude Code** 🤖
Demonstrating AI-assisted development at scale.
