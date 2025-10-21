import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { logger } from '../utils/logger.js';

/**
 * CLAUDE.md Management System
 * Implements "The Agent's Memory" - persistent configuration and rules
 */
export class ClaudeMemory {
  constructor(options = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.globalPath = options.globalPath || join(process.env.HOME || process.env.USERPROFILE, '.claude', 'CLAUDE.md');
    this.cache = new Map();
  }

  /**
   * Initialize CLAUDE.md with template
   */
  async init(projectPath = this.projectRoot) {
    const claudePath = join(projectPath, 'CLAUDE.md');

    if (existsSync(claudePath)) {
      logger.warn(`CLAUDE.md already exists at ${claudePath}`);
      return claudePath;
    }

    const template = this._getTemplate();
    await mkdir(dirname(claudePath), { recursive: true });
    await writeFile(claudePath, template, 'utf-8');

    logger.info(`Initialized CLAUDE.md at ${claudePath}`);
    return claudePath;
  }

  /**
   * Get default CLAUDE.md template
   */
  _getTemplate() {
    return `# Project Configuration

## Project Structure

\`\`\`
src/          - Main application source code
tests/        - Test files
db/           - Database files
bin/          - Executable scripts
\`\`\`

## Technical Stack

- **Language**: JavaScript/Node.js
- **Database**: SQLite
- **Testing**: Node.js test runner
- **Package Manager**: npm

## Commands

### Development
\`\`\`bash
npm run dev          # Start development server
npm test             # Run tests
npm run build        # Build for production
\`\`\`

### Database
\`\`\`bash
# Add database commands here
\`\`\`

## Coding Conventions

### Style Guide
- Use ES6+ features
- Prefer async/await over callbacks
- Use const for immutable values, let for mutable
- Use descriptive variable names

### Architecture Patterns
- **Separation of Concerns**: Keep business logic separate from data access
- **DRY Principle**: Don't repeat yourself
- **Error Handling**: Always use try/catch for async operations

## Anti-Patterns to Avoid

### Security
- ❌ Never use raw SQL strings (SQL injection risk)
- ✅ Always use parameterized queries
- ❌ Never hardcode secrets in code
- ✅ Use environment variables for sensitive data

### Code Quality
- ❌ Don't write monolithic functions
- ✅ Break down complex logic into smaller, testable functions
- ❌ Don't skip error handling
- ✅ Handle errors gracefully with proper logging

### Testing
- ❌ Don't skip writing tests
- ✅ Follow TDD when possible
- ❌ Don't test implementation details
- ✅ Test behavior and outcomes

## Project-Specific Rules

<!-- Add your custom rules here -->

---
*Last updated: ${new Date().toISOString()}*
`;
  }

  /**
   * Load CLAUDE.md from hierarchy (project → user → global)
   */
  async load(projectPath = this.projectRoot) {
    const contexts = [];

    // 1. Global config
    if (existsSync(this.globalPath)) {
      const global = await this._loadFile(this.globalPath);
      contexts.push({ scope: 'global', path: this.globalPath, content: global });
    }

    // 2. User config in home directory
    const userPath = join(process.env.HOME || process.env.USERPROFILE, '.claude', 'CLAUDE.md');
    if (existsSync(userPath) && userPath !== this.globalPath) {
      const user = await this._loadFile(userPath);
      contexts.push({ scope: 'user', path: userPath, content: user });
    }

    // 3. Project config
    const projectClaudePath = join(projectPath, 'CLAUDE.md');
    if (existsSync(projectClaudePath)) {
      const project = await this._loadFile(projectClaudePath);
      contexts.push({ scope: 'project', path: projectClaudePath, content: project });
    }

    // 4. Subdirectory configs
    const subdirPath = await this._findNearestClaudeMd(projectPath);
    if (subdirPath && subdirPath !== projectClaudePath) {
      const subdir = await this._loadFile(subdirPath);
      contexts.push({ scope: 'subdirectory', path: subdirPath, content: subdir });
    }

    logger.info(`Loaded ${contexts.length} CLAUDE.md contexts`);
    return contexts;
  }

  /**
   * Load single CLAUDE.md file
   */
  async _loadFile(path) {
    if (this.cache.has(path)) {
      return this.cache.get(path);
    }

    const content = await readFile(path, 'utf-8');
    this.cache.set(path, content);
    return content;
  }

  /**
   * Find nearest CLAUDE.md in directory hierarchy
   */
  async _findNearestClaudeMd(startPath) {
    let currentPath = startPath;
    const root = dirname(currentPath);

    while (currentPath !== root) {
      const claudePath = join(currentPath, 'CLAUDE.md');
      if (existsSync(claudePath)) {
        return claudePath;
      }
      currentPath = dirname(currentPath);
    }

    return null;
  }

  /**
   * Parse CLAUDE.md into structured sections
   */
  parse(content) {
    const sections = {
      projectStructure: '',
      techStack: '',
      commands: '',
      conventions: '',
      antiPatterns: '',
      rules: ''
    };

    const lines = content.split('\n');
    let currentSection = null;

    for (const line of lines) {
      if (line.startsWith('## Project Structure')) {
        currentSection = 'projectStructure';
      } else if (line.startsWith('## Technical Stack')) {
        currentSection = 'techStack';
      } else if (line.startsWith('## Commands')) {
        currentSection = 'commands';
      } else if (line.startsWith('## Coding Conventions')) {
        currentSection = 'conventions';
      } else if (line.startsWith('## Anti-Patterns')) {
        currentSection = 'antiPatterns';
      } else if (line.startsWith('## Project-Specific Rules')) {
        currentSection = 'rules';
      } else if (currentSection) {
        sections[currentSection] += line + '\n';
      }
    }

    return sections;
  }

  /**
   * Update CLAUDE.md section
   */
  async updateSection(path, section, newContent) {
    const content = await readFile(path, 'utf-8');
    const parsed = this.parse(content);
    parsed[section] = newContent;

    const updated = this._reconstructContent(parsed);
    await writeFile(path, updated, 'utf-8');

    // Invalidate cache
    this.cache.delete(path);

    logger.info(`Updated section '${section}' in ${path}`);
  }

  /**
   * Reconstruct CLAUDE.md from parsed sections
   */
  _reconstructContent(sections) {
    return `# Project Configuration

## Project Structure
${sections.projectStructure}

## Technical Stack
${sections.techStack}

## Commands
${sections.commands}

## Coding Conventions
${sections.conventions}

## Anti-Patterns to Avoid
${sections.antiPatterns}

## Project-Specific Rules
${sections.rules}

---
*Last updated: ${new Date().toISOString()}*
`;
  }

  /**
   * Extract anti-patterns as rules
   */
  extractAntiPatterns(content) {
    const patterns = [];
    const lines = content.split('\n');
    let inAntiPatterns = false;

    for (const line of lines) {
      if (line.startsWith('## Anti-Patterns')) {
        inAntiPatterns = true;
        continue;
      }
      if (inAntiPatterns && line.startsWith('##')) {
        break;
      }
      if (inAntiPatterns && line.trim().startsWith('❌')) {
        patterns.push({
          antiPattern: line.replace('❌', '').trim(),
          severity: 'error'
        });
      }
    }

    return patterns;
  }

  /**
   * Get merged context from all loaded configs
   */
  async getMergedContext(projectPath = this.projectRoot) {
    const contexts = await this.load(projectPath);

    const merged = {
      scopes: contexts.map(c => c.scope),
      fullContext: contexts.map(c => `### ${c.scope.toUpperCase()}\n${c.content}`).join('\n\n'),
      antiPatterns: [],
      conventions: []
    };

    // Extract anti-patterns from all contexts
    for (const ctx of contexts) {
      const patterns = this.extractAntiPatterns(ctx.content);
      merged.antiPatterns.push(...patterns);
    }

    return merged;
  }

  /**
   * Validate code against CLAUDE.md rules
   */
  async validate(code, projectPath = this.projectRoot) {
    const context = await this.getMergedContext(projectPath);
    const violations = [];

    for (const pattern of context.antiPatterns) {
      // Simple pattern matching (extend with AST analysis)
      if (this._checkViolation(code, pattern.antiPattern)) {
        violations.push({
          pattern: pattern.antiPattern,
          severity: pattern.severity
        });
      }
    }

    return {
      valid: violations.length === 0,
      violations
    };
  }

  /**
   * Check if code violates a pattern
   */
  _checkViolation(code, pattern) {
    const checks = {
      'Never use raw SQL strings': /\$\{.*\}.*SELECT|INSERT|UPDATE|DELETE/i,
      'Never hardcode secrets': /api[_-]?key\s*=\s*['"][^'"]+['"]/i,
      "Don't write monolithic functions": code => code.split('\n').length > 100
    };

    for (const [key, check] of Object.entries(checks)) {
      if (pattern.includes(key)) {
        if (typeof check === 'function') {
          return check(code);
        }
        return check.test(code);
      }
    }

    return false;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    logger.info('CLAUDE.md cache cleared');
  }
}

export default ClaudeMemory;
