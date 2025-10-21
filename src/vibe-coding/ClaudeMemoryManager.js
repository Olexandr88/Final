/**
 * CLAUDE.md Management System
 * Creates, validates, and enforces CLAUDE.md configuration files
 */

import { EventEmitter } from 'events';
import { readFile, writeFile, access } from 'fs/promises';
import { constants } from 'fs';
import path from 'path';

export class ClaudeMemoryManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.projectRoot = options.projectRoot || process.cwd();
    this.globalPath =
      options.globalPath ||
      path.join(process.env.HOME || process.env.USERPROFILE, '.claude', 'CLAUDE.md');
  }

  async createTemplate(type = 'project', config = {}) {
    const templates = {
      project: this.generateProjectTemplate(config),
      global: this.generateGlobalTemplate(config),
      subdir: this.generateSubdirTemplate(config),
    };

    const template = templates[type] || templates.project;
    this.emit('template:created', { type, template });
    return template;
  }

  generateProjectTemplate(config) {
    return `# ${config.projectName || 'Project'} - Claude Code Configuration

## Project Overview
${config.description || 'AI-assisted development project using Claude Code.'}

## Project Structure
\`\`\`
${
  config.structure ||
  `
src/          - Main application source code
tests/        - Test files
db/           - Database files
bin/          - Executable scripts
`
}
\`\`\`

## Technical Stack
- **Language**: ${config.language || 'JavaScript/Node.js'}
- **Database**: ${config.database || 'SQLite'}
- **Testing**: ${config.testing || 'Jest/pytest'}
- **Package Manager**: ${config.packageManager || 'npm'}

## Commands

### Development
\`\`\`bash
${config.devCommand || 'npm run dev'}        # Start development server
${config.testCommand || 'npm test'}          # Run tests
${config.buildCommand || 'npm run build'}    # Build for production
${config.lintCommand || 'npm run lint'}      # Run linter
\`\`\`

## Coding Conventions

### Code Style
- ${config.indentation || 'Use 2 spaces for indentation'}
- ${config.quotes || 'Use single quotes for strings'}
- ${config.semicolons || 'Always use semicolons'}
- ${config.naming || 'Use camelCase for variables and functions'}

### Architecture Patterns
- ${config.architecture || 'Follow MVC pattern for application structure'}
- ${config.separation || 'Separate business logic from presentation'}
- ${config.errorHandling || 'Use try-catch blocks for async operations'}

### Security Rules
- **NEVER** hardcode API keys, passwords, or secrets in source files
- **ALWAYS** use parameterized queries for database operations
- **ALWAYS** validate and sanitize user input
- Store sensitive data in .env files (must be in .gitignore)

## Anti-Patterns to Avoid

### Database
- ❌ Raw SQL string concatenation (SQL injection risk)
- ❌ Missing database connection cleanup
- ❌ No error handling on queries

### Code Quality
- ❌ Functions longer than 50 lines
- ❌ Deeply nested conditionals (>3 levels)
- ❌ Duplicate code blocks
- ❌ Magic numbers without constants

### Git Workflow
- ❌ Committing node_modules or build artifacts
- ❌ Committing .env or credentials files
- ❌ Vague commit messages like "fix stuff"

## Testing Requirements
- All new features MUST have tests
- Minimum test coverage: ${config.minCoverage || '80%'}
- Tests must pass before commits
- Use ${config.testPattern || 'describe/it'} pattern for test organization

## Sub-Agents Configuration
${
  config.subAgents ||
  `
- \`code-reviewer\`: Reviews code for bugs and best practices
- \`test-writer\`: Generates comprehensive test suites
- \`db-designer\`: Designs database schemas
`
}

## Workflow
1. **Explore**: Read codebase and understand context
2. **Plan**: Create detailed implementation plan
3. **Code**: Implement with TDD approach
4. **Commit**: Commit working, tested code

---
*This file is the single source of truth for project conventions.*
*All developers and AI agents must follow these rules.*
`;
  }

  generateGlobalTemplate(config) {
    return `# Global Claude Code Configuration

## User Preferences
- **Name**: ${config.userName || 'Developer'}
- **Email**: ${config.userEmail || 'dev@example.com'}
- **Preferred Model**: ${config.model || 'claude-sonnet-4'}

## Universal Coding Standards
- Write clean, readable, maintainable code
- Prefer explicit over implicit
- Optimize for clarity, then performance
- Document complex logic

## Git Configuration
\`\`\`bash
git config user.name "${config.gitName || config.userName || 'Developer'}"
git config user.email "${config.gitEmail || config.userEmail || 'dev@example.com'}"
\`\`\`

## Default Tools
- Always use version control (Git)
- Always include .gitignore
- Always create README.md
- Always set up testing framework

## Security Defaults
- Never commit secrets
- Always validate input
- Use environment variables for config
- Follow principle of least privilege
`;
  }

  generateSubdirTemplate(config) {
    return `# ${config.subdirName || 'Subdirectory'} - Specific Rules

## Purpose
${config.purpose || 'Specific rules for this subdirectory'}

## Conventions
${config.conventions || '- Follow parent directory conventions\n- Add subdirectory-specific rules here'}
`;
  }

  async loadMemory(filePath) {
    try {
      await access(filePath, constants.F_OK);
      const content = await readFile(filePath, 'utf-8');

      this.emit('memory:loaded', { filePath, size: content.length });
      return this.parseMemory(content);
    } catch (error) {
      this.emit('memory:not-found', { filePath });
      return null;
    }
  }

  parseMemory(content) {
    const parsed = {
      raw: content,
      sections: {},
      rules: [],
      antiPatterns: [],
      commands: {},
    };

    const sections = content.split(/^## /m).filter(Boolean);

    for (const section of sections) {
      const lines = section.trim().split('\n');
      const title = lines[0].trim();
      const body = lines.slice(1).join('\n');

      parsed.sections[title] = body;

      if (title.includes('Anti-Pattern')) {
        const patterns = body.match(/- ❌ (.+)/g);
        if (patterns) {
          parsed.antiPatterns.push(...patterns.map((p) => p.replace('- ❌ ', '').trim()));
        }
      }

      if (title.includes('Command')) {
        const cmds = body.match(/```bash\n([\s\S]*?)\n```/);
        if (cmds) {
          const lines = cmds[1].split('\n').filter((l) => l.trim() && !l.includes('#'));
          parsed.commands = lines.reduce((acc, line) => {
            const [cmd, ...desc] = line.split('#');
            acc[cmd.trim()] = desc.join('#').trim();
            return acc;
          }, {});
        }
      }
    }

    return parsed;
  }

  async validateMemory(filePath) {
    const memory = await this.loadMemory(filePath);

    if (!memory) {
      return {
        valid: false,
        errors: ['CLAUDE.md file not found'],
      };
    }

    const validation = {
      valid: true,
      errors: [],
      warnings: [],
    };

    const requiredSections = [
      'Project Overview',
      'Project Structure',
      'Technical Stack',
      'Commands',
      'Coding Conventions',
    ];

    for (const section of requiredSections) {
      if (!memory.sections[section]) {
        validation.errors.push(`Missing required section: ${section}`);
        validation.valid = false;
      }
    }

    if (memory.raw.length < 200) {
      validation.warnings.push('CLAUDE.md is very short - consider adding more detail');
    }

    if (memory.antiPatterns.length === 0) {
      validation.warnings.push('No anti-patterns defined - consider adding common pitfalls');
    }

    if (Object.keys(memory.commands).length === 0) {
      validation.warnings.push('No commands defined - add common project commands');
    }

    this.emit('memory:validated', validation);
    return validation;
  }

  async initializeProject(projectPath, config = {}) {
    const claudePath = path.join(projectPath, 'CLAUDE.md');

    try {
      await access(claudePath, constants.F_OK);
      this.emit('init:exists', { claudePath });
      return {
        success: false,
        message: 'CLAUDE.md already exists',
        path: claudePath,
      };
    } catch {
      const template = await this.createTemplate('project', config);
      await writeFile(claudePath, template, 'utf-8');

      this.emit('init:created', { claudePath });
      return {
        success: true,
        message: 'CLAUDE.md created successfully',
        path: claudePath,
        content: template,
      };
    }
  }

  async enforceRules(code, filePath, memoryPath) {
    const memory = await this.loadMemory(memoryPath);

    if (!memory) {
      return {
        violations: [],
        warnings: [],
      };
    }

    const violations = [];
    const warnings = [];

    for (const antiPattern of memory.antiPatterns) {
      if (antiPattern.toLowerCase().includes('sql injection')) {
        if (code.includes('query(`') || code.includes('query("')) {
          violations.push({
            type: 'security',
            pattern: 'SQL Injection Risk',
            description: 'Raw SQL string detected - use parameterized queries',
            file: filePath,
          });
        }
      }

      if (antiPattern.toLowerCase().includes('hardcode')) {
        const secretPatterns = /(?:api_key|password|secret|token)\s*=\s*['"][^'"]+['"]/gi;
        if (secretPatterns.test(code)) {
          violations.push({
            type: 'security',
            pattern: 'Hardcoded Secret',
            description: 'Secret value appears to be hardcoded',
            file: filePath,
          });
        }
      }

      if (antiPattern.toLowerCase().includes('magic number')) {
        const numbers = code.match(/(?<![a-zA-Z0-9_])[0-9]{2,}(?![a-zA-Z0-9_])/g);
        if (numbers && numbers.length > 3) {
          warnings.push({
            type: 'code-quality',
            pattern: 'Magic Numbers',
            description: `Found ${numbers.length} numeric literals - consider using constants`,
            file: filePath,
          });
        }
      }
    }

    this.emit('rules:enforced', { violations, warnings, file: filePath });
    return { violations, warnings };
  }

  async getHierarchy(projectPath) {
    const hierarchy = [];

    let currentPath = projectPath;
    while (currentPath !== path.dirname(currentPath)) {
      const claudePath = path.join(currentPath, 'CLAUDE.md');
      try {
        await access(claudePath, constants.F_OK);
        hierarchy.unshift(claudePath);
      } catch {}
      currentPath = path.dirname(currentPath);
    }

    if (this.globalPath) {
      try {
        await access(this.globalPath, constants.F_OK);
        hierarchy.unshift(this.globalPath);
      } catch {}
    }

    return hierarchy;
  }

  async loadHierarchy(projectPath) {
    const hierarchy = await this.getHierarchy(projectPath);
    const memories = [];

    for (const memPath of hierarchy) {
      const memory = await this.loadMemory(memPath);
      if (memory) {
        memories.push({
          path: memPath,
          scope: this.getScope(memPath),
          memory,
        });
      }
    }

    return memories;
  }

  getScope(memoryPath) {
    if (memoryPath === this.globalPath) return 'global';
    if (memoryPath.endsWith(path.join(this.projectRoot, 'CLAUDE.md'))) return 'project';
    return 'subdirectory';
  }
}

export default ClaudeMemoryManager;
