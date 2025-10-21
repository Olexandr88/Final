#!/usr/bin/env node
/**
 * ANTI-PATTERN DETECTOR
 * Identifies "Seven Deadly Sins" and other anti-patterns in vibe coding workflows
 */

const fs = require('fs');
const path = require('path');

class AntiPatternDetector {
  constructor(projectRoot = process.cwd()) {
    this.root = projectRoot;
    this.violations = [];
  }

  // Run all anti-pattern checks
  async detectAll() {
    console.log('🔍 Scanning for Anti-Patterns\n');
    console.log('"The Seven Deadly Sins of Agentic Development"\n');

    this.violations = [];

    const checks = [
      { name: '1. Vague Prompting', fn: () => this.checkVaguePrompting() },
      { name: '2. Monolithic Tasking', fn: () => this.checkMonolithicTasks() },
      { name: '3. Context Neglect', fn: () => this.checkContextManagement() },
      { name: '4. Blind Trust', fn: () => this.checkCodeQuality() },
      { name: '5. Environmental Contamination', fn: () => this.checkWorkspaceIsolation() },
      { name: '6. Tool Ignorance', fn: () => this.checkToolUsage() },
      { name: '7. Premature Vibing', fn: () => this.checkPlanning() },
      { name: 'Security Vulnerabilities', fn: () => this.checkSecurity() }
    ];

    for (const check of checks) {
      console.log(`Checking: ${check.name}...`);
      const result = check.fn();

      if (result.violations.length > 0) {
        console.log(`  ⚠️  ${result.violations.length} issue(s) found`);
        this.violations.push(...result.violations.map(v => ({ ...v, category: check.name })));
      } else {
        console.log(`  ✓ Clean`);
      }
    }

    this.generateReport();
    return this.violations;
  }

  // 1. Vague Prompting
  checkVaguePrompting() {
    const violations = [];

    // Check for vague commit messages
    try {
      const { execSync } = require('child_process');
      const recentCommits = execSync('git log -5 --pretty=format:"%s"', {
        cwd: this.root,
        encoding: 'utf8'
      }).split('\n');

      const vaguePatterns = /^(fix|update|change|misc|wip|stuff|things)/i;

      recentCommits.forEach((msg, i) => {
        if (vaguePatterns.test(msg) && msg.length < 20) {
          violations.push({
            severity: 'medium',
            description: `Vague commit message: "${msg}"`,
            suggestion: 'Use descriptive messages: "feat: add user authentication" instead of "fix stuff"'
          });
        }
      });
    } catch {}

    // Check for TODO/FIXME without details
    const files = this.findSourceFiles();
    files.forEach(file => {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');

        lines.forEach((line, i) => {
          if (line.match(/\/\/\s*(TODO|FIXME)\s*$/)) {
            violations.push({
              severity: 'low',
              file,
              line: i + 1,
              description: 'Vague TODO/FIXME without description',
              suggestion: 'Add details: // TODO: Implement input validation for email field'
            });
          }
        });
      } catch {}
    });

    return { violations };
  }

  // 2. Monolithic Tasking
  checkMonolithicTasks() {
    const violations = [];

    // Check for overly large functions (>50 lines)
    const files = this.findSourceFiles();

    files.forEach(file => {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');

        let inFunction = false;
        let functionStart = 0;
        let braceCount = 0;

        lines.forEach((line, i) => {
          if (line.match(/function\s+\w+|const\s+\w+\s*=\s*\(/)) {
            inFunction = true;
            functionStart = i;
            braceCount = 0;
          }

          if (inFunction) {
            braceCount += (line.match(/{/g) || []).length;
            braceCount -= (line.match(/}/g) || []).length;

            if (braceCount === 0 && i > functionStart) {
              const functionLength = i - functionStart;

              if (functionLength > 50) {
                violations.push({
                  severity: 'high',
                  file,
                  line: functionStart + 1,
                  description: `Function is ${functionLength} lines long (>50 threshold)`,
                  suggestion: 'Break into smaller, focused functions. Each function should have a single responsibility.'
                });
              }

              inFunction = false;
            }
          }
        });
      } catch {}
    });

    return { violations };
  }

  // 3. Context Neglect
  checkContextManagement() {
    const violations = [];

    // Check for missing session management
    const sessionDir = path.join(this.root, '.claude-sessions');
    if (!fs.existsSync(sessionDir)) {
      violations.push({
        severity: 'medium',
        description: 'No session management directory found',
        suggestion: 'Use session manager to save/load context between tasks'
      });
    }

    // Check for overly large source files (context overload indicator)
    const files = this.findSourceFiles();

    files.forEach(file => {
      try {
        const stats = fs.statSync(file);
        const lines = fs.readFileSync(file, 'utf8').split('\n').length;

        if (lines > 500) {
          violations.push({
            severity: 'medium',
            file,
            description: `File is ${lines} lines (>500 threshold)`,
            suggestion: 'Split large files into smaller modules to reduce context load'
          });
        }
      } catch {}
    });

    return { violations };
  }

  // 4. Blind Trust
  checkCodeQuality() {
    const violations = [];

    // Check for missing tests
    const sourceFiles = this.findSourceFiles().filter(f => !f.includes('test'));
    const testFiles = this.findSourceFiles().filter(f => f.includes('test') || f.includes('spec'));

    if (sourceFiles.length > 0 && testFiles.length === 0) {
      violations.push({
        severity: 'critical',
        description: 'No test files found',
        suggestion: 'Implement TDD workflow. Write tests before implementation.'
      });
    }

    // Check for unhandled promises
    const files = this.findSourceFiles();

    files.forEach(file => {
      try {
        const content = fs.readFileSync(file, 'utf8');

        const asyncWithoutCatch = content.match(/async\s+function[^{]+{[^}]*await[^}]*}(?![^{]*catch)/g);

        if (asyncWithoutCatch) {
          violations.push({
            severity: 'high',
            file,
            description: 'Async function without try/catch',
            suggestion: 'Always wrap async operations in try/catch for error handling'
          });
        }
      } catch {}
    });

    return { violations };
  }

  // 5. Environmental Contamination
  checkWorkspaceIsolation() {
    const violations = [];

    const isRoot = this.root === '/';
    const isHome = this.root === process.env.HOME || this.root === process.env.USERPROFILE;

    if (isRoot || isHome) {
      violations.push({
        severity: 'critical',
        description: 'Running in root or home directory',
        suggestion: 'Create isolated workspace: mkdir claude-workspace && cd claude-workspace'
      });
    }

    // Check for .git
    if (!fs.existsSync(path.join(this.root, '.git'))) {
      violations.push({
        severity: 'high',
        description: 'No git repository',
        suggestion: 'Initialize git: git init && git commit -m "Initial commit"'
      });
    }

    return { violations };
  }

  // 6. Tool Ignorance
  checkToolUsage() {
    const violations = [];

    // Check for CLAUDE.md
    if (!fs.existsSync(path.join(this.root, 'CLAUDE.md'))) {
      violations.push({
        severity: 'high',
        description: 'No CLAUDE.md configuration',
        suggestion: 'Create CLAUDE.md with project context, conventions, and anti-patterns'
      });
    }

    // Check for sub-agents
    const agentsDir = path.join(this.root, '.claude/agents');
    if (!fs.existsSync(agentsDir) || fs.readdirSync(agentsDir).length === 0) {
      violations.push({
        severity: 'medium',
        description: 'No sub-agents configured',
        suggestion: 'Create specialized sub-agents for code review, testing, and architecture'
      });
    }

    // Check for hooks
    const settingsFile = path.join(this.root, '.claude/settings.json');
    if (!fs.existsSync(settingsFile)) {
      violations.push({
        severity: 'medium',
        description: 'No automation hooks configured',
        suggestion: 'Set up hooks for auto-formatting, testing, and security checks'
      });
    }

    return { violations };
  }

  // 7. Premature Vibing
  checkPlanning() {
    const violations = [];

    // Check for PLAN.md
    if (!fs.existsSync(path.join(this.root, 'PLAN.md'))) {
      violations.push({
        severity: 'low',
        description: 'No PLAN.md found',
        suggestion: 'Use Explore → Plan → Code → Commit workflow for complex features'
      });
    }

    return { violations };
  }

  // Security checks
  checkSecurity() {
    const violations = [];

    const files = this.findSourceFiles();

    files.forEach(file => {
      try {
        const content = fs.readFileSync(file, 'utf8');

        // SQL injection
        if (content.match(/`\s*SELECT\s+.*\$\{/i)) {
          violations.push({
            severity: 'critical',
            file,
            description: 'Potential SQL injection (template string in query)',
            suggestion: 'Use parameterized queries instead of string interpolation'
          });
        }

        // Hardcoded secrets
        if (content.match(/(api[_-]?key|password|secret|token)\s*=\s*["'][^"']+["']/i)) {
          violations.push({
            severity: 'critical',
            file,
            description: 'Potential hardcoded secret',
            suggestion: 'Use environment variables (.env file) for sensitive data'
          });
        }

        // eval() usage
        if (content.match(/\beval\s*\(/)) {
          violations.push({
            severity: 'high',
            file,
            description: 'Use of eval() is dangerous',
            suggestion: 'Find alternative approach - eval() can execute arbitrary code'
          });
        }
      } catch {}
    });

    return { violations };
  }

  findSourceFiles() {
    const files = [];

    const walk = (dir) => {
      if (dir.includes('node_modules') || dir.includes('.git')) return;

      try {
        const items = fs.readdirSync(dir);
        items.forEach(item => {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            walk(fullPath);
          } else if (fullPath.match(/\.(js|ts|jsx|tsx|py)$/)) {
            files.push(fullPath);
          }
        });
      } catch {}
    };

    walk(this.root);
    return files;
  }

  generateReport() {
    console.log('\n' + '='.repeat(70));
    console.log('ANTI-PATTERN DETECTION REPORT');
    console.log('='.repeat(70) + '\n');

    const critical = this.violations.filter(v => v.severity === 'critical');
    const high = this.violations.filter(v => v.severity === 'high');
    const medium = this.violations.filter(v => v.severity === 'medium');
    const low = this.violations.filter(v => v.severity === 'low');

    console.log(`Total Violations: ${this.violations.length}`);
    console.log(`  Critical: ${critical.length}`);
    console.log(`  High: ${high.length}`);
    console.log(`  Medium: ${medium.length}`);
    console.log(`  Low: ${low.length}\n`);

    if (this.violations.length === 0) {
      console.log('✅ No anti-patterns detected!\n');
      console.log('Your vibe coding environment follows best practices.\n');
      return;
    }

    const grouped = {};
    this.violations.forEach(v => {
      if (!grouped[v.category]) grouped[v.category] = [];
      grouped[v.category].push(v);
    });

    Object.entries(grouped).forEach(([category, violations]) => {
      console.log(`\n${category} (${violations.length} issue${violations.length > 1 ? 's' : ''})`);
      console.log('─'.repeat(70));

      violations.forEach((v, i) => {
        const icon = v.severity === 'critical' ? '🔴' : v.severity === 'high' ? '🟠' : v.severity === 'medium' ? '🟡' : '🔵';

        console.log(`\n${i + 1}. ${icon} ${v.description}`);
        if (v.file) console.log(`   File: ${v.file}${v.line ? `:${v.line}` : ''}`);
        console.log(`   → ${v.suggestion}`);
      });
    });

    console.log('\n' + '='.repeat(70));
    console.log('\n💡 Fix these issues to improve your vibe coding workflow\n');
  }
}

// CLI
if (require.main === module) {
  const detector = new AntiPatternDetector();
  detector.detectAll().then(violations => {
    process.exit(violations.filter(v => v.severity === 'critical').length > 0 ? 1 : 0);
  });
}

module.exports = AntiPatternDetector;
