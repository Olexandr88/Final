import fs from 'fs-extra';
import path from 'path';

/**
 * CLAUDE.md Loader - Customizable environment configuration
 * Project-specific context and instructions
 */
export class ClaudeMdLoader {
  constructor(options = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.claudeMdPath = path.join(this.projectRoot, 'CLAUDE.md');
    this.globalClaudeMdPath =
      options.globalPath ||
      path.join(process.env.HOME || process.env.USERPROFILE, '.claude', 'CLAUDE.md');
    this.config = null;
  }

  /**
   * Load CLAUDE.md configuration
   */
  async load() {
    const configs = [];

    // Load global config
    if (await fs.pathExists(this.globalClaudeMdPath)) {
      const globalConfig = await this.parseClaudeMd(this.globalClaudeMdPath);
      configs.push({ source: 'global', ...globalConfig });
    }

    // Load project config (overrides global)
    if (await fs.pathExists(this.claudeMdPath)) {
      const projectConfig = await this.parseClaudeMd(this.claudeMdPath);
      configs.push({ source: 'project', ...projectConfig });
    }

    // Merge configs (project overrides global)
    this.config = this.mergeConfigs(configs);

    return this.config;
  }

  /**
   * Parse CLAUDE.md file
   */
  async parseClaudeMd(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');

    const config = {
      raw: content,
      sections: this.parseMarkdownSections(content),
      commands: this.extractCommands(content),
      rules: this.extractRules(content),
      context: this.extractContext(content),
      techStack: this.extractTechStack(content),
      testingInstructions: this.extractTestingInstructions(content),
    };

    return config;
  }

  /**
   * Parse markdown sections
   */
  parseMarkdownSections(content) {
    const sections = {};
    const lines = content.split('\n');
    let currentSection = null;
    let currentContent = [];

    for (const line of lines) {
      // Heading detection
      const headingMatch = line.match(/^(#+)\s+(.+)$/);
      if (headingMatch) {
        // Save previous section
        if (currentSection) {
          sections[currentSection] = currentContent.join('\n').trim();
        }

        // Start new section
        currentSection = headingMatch[2].toLowerCase().replace(/\s+/g, '-');
        currentContent = [];
      } else if (currentSection) {
        currentContent.push(line);
      }
    }

    // Save last section
    if (currentSection) {
      sections[currentSection] = currentContent.join('\n').trim();
    }

    return sections;
  }

  /**
   * Extract important commands
   */
  extractCommands(content) {
    const commands = [];
    const commandPattern = /```(?:bash|sh|shell)\n([\s\S]*?)```/g;

    let match;
    while ((match = commandPattern.exec(content)) !== null) {
      const cmdBlock = match[1].trim();
      const cmdLines = cmdBlock.split('\n').filter((line) => !line.startsWith('#'));

      commands.push(...cmdLines);
    }

    return commands;
  }

  /**
   * Extract coding rules
   */
  extractRules(content) {
    const rules = [];

    // Look for rules section
    const rulesSection =
      this.parseMarkdownSections(content)['coding-rules'] ||
      this.parseMarkdownSections(content)['rules'] ||
      this.parseMarkdownSections(content)['guidelines'];

    if (rulesSection) {
      // Extract list items
      const lines = rulesSection.split('\n');
      for (const line of lines) {
        const ruleMatch = line.match(/^[-*]\s+(.+)$/);
        if (ruleMatch) {
          rules.push(ruleMatch[1].trim());
        }
      }
    }

    return rules;
  }

  /**
   * Extract project context
   */
  extractContext(content) {
    const sections = this.parseMarkdownSections(content);

    return {
      description: sections['description'] || sections['about'] || '',
      architecture: sections['architecture'] || sections['structure'] || '',
      conventions: sections['conventions'] || '',
    };
  }

  /**
   * Extract tech stack
   */
  extractTechStack(content) {
    const sections = this.parseMarkdownSections(content);
    const techSection = sections['tech-stack'] || sections['technology'] || sections['stack'] || '';

    const stack = {
      languages: [],
      frameworks: [],
      tools: [],
    };

    // Simple extraction - look for common patterns
    if (techSection.includes('TypeScript')) stack.languages.push('TypeScript');
    if (techSection.includes('JavaScript')) stack.languages.push('JavaScript');
    if (techSection.includes('Python')) stack.languages.push('Python');

    if (techSection.includes('React')) stack.frameworks.push('React');
    if (techSection.includes('Express')) stack.frameworks.push('Express');
    if (techSection.includes('Next.js')) stack.frameworks.push('Next.js');

    return stack;
  }

  /**
   * Extract testing instructions
   */
  extractTestingInstructions(content) {
    const sections = this.parseMarkdownSections(content);
    return sections['testing'] || sections['tests'] || '';
  }

  /**
   * Merge multiple configs (later configs override earlier)
   */
  mergeConfigs(configs) {
    if (configs.length === 0) return null;
    if (configs.length === 1) return configs[0];

    const merged = {
      sources: configs.map((c) => c.source),
      sections: {},
      commands: [],
      rules: [],
      context: {},
      techStack: { languages: [], frameworks: [], tools: [] },
      testingInstructions: '',
    };

    for (const config of configs) {
      // Merge sections
      merged.sections = { ...merged.sections, ...config.sections };

      // Append commands
      merged.commands.push(...(config.commands || []));

      // Append rules
      merged.rules.push(...(config.rules || []));

      // Merge context
      merged.context = { ...merged.context, ...config.context };

      // Merge tech stack
      if (config.techStack) {
        merged.techStack.languages.push(...(config.techStack.languages || []));
        merged.techStack.frameworks.push(...(config.techStack.frameworks || []));
        merged.techStack.tools.push(...(config.techStack.tools || []));
      }

      // Override testing instructions (project wins)
      if (config.testingInstructions) {
        merged.testingInstructions = config.testingInstructions;
      }
    }

    // Deduplicate arrays
    merged.commands = [...new Set(merged.commands)];
    merged.rules = [...new Set(merged.rules)];
    merged.techStack.languages = [...new Set(merged.techStack.languages)];
    merged.techStack.frameworks = [...new Set(merged.techStack.frameworks)];
    merged.techStack.tools = [...new Set(merged.techStack.tools)];

    return merged;
  }

  /**
   * Get config value
   */
  get(key) {
    return this.config?.[key];
  }

  /**
   * Get all sections
   */
  getSections() {
    return this.config?.sections || {};
  }

  /**
   * Get formatted context for LLM
   */
  getFormattedContext() {
    if (!this.config) return '';

    const parts = [];

    // Project description
    if (this.config.context?.description) {
      parts.push('# Project Description');
      parts.push(this.config.context.description);
      parts.push('');
    }

    // Tech stack
    if (this.config.techStack) {
      parts.push('# Tech Stack');
      if (this.config.techStack.languages?.length > 0) {
        parts.push(`Languages: ${this.config.techStack.languages.join(', ')}`);
      }
      if (this.config.techStack.frameworks?.length > 0) {
        parts.push(`Frameworks: ${this.config.techStack.frameworks.join(', ')}`);
      }
      parts.push('');
    }

    // Coding rules
    if (this.config.rules?.length > 0) {
      parts.push('# Coding Rules');
      for (const rule of this.config.rules) {
        parts.push(`- ${rule}`);
      }
      parts.push('');
    }

    // Important commands
    if (this.config.commands?.length > 0) {
      parts.push('# Important Commands');
      for (const cmd of this.config.commands) {
        parts.push(`\`${cmd}\``);
      }
      parts.push('');
    }

    // Testing instructions
    if (this.config.testingInstructions) {
      parts.push('# Testing Instructions');
      parts.push(this.config.testingInstructions);
      parts.push('');
    }

    return parts.join('\n');
  }

  /**
   * Create template CLAUDE.md
   */
  async createTemplate() {
    const template = `# Project Name

## Description
Brief description of your project and its purpose.

## Tech Stack
- **Languages**: TypeScript, JavaScript
- **Frameworks**: Express, React
- **Tools**: ESLint, Prettier

## Architecture
Describe your project architecture, key modules, and how they interact.

## Coding Rules
- Use TypeScript for all new code
- Follow ESLint configuration
- Write tests for all features
- Use meaningful variable names
- Document complex logic

## Important Commands
\`\`\`bash
# Development
npm run dev

# Testing
npm test

# Build
npm run build

# Lint
npm run lint:fix
\`\`\`

## Testing Instructions
- Write unit tests for all functions
- Integration tests for API endpoints
- Aim for 80%+ code coverage
- Use TDD approach when possible

## Conventions
- File names: kebab-case
- Function names: camelCase
- Constants: UPPER_SNAKE_CASE
- Components: PascalCase
`;

    await fs.writeFile(this.claudeMdPath, template, 'utf-8');
    console.log(`CLAUDE.md template created at ${this.claudeMdPath}`);

    return template;
  }

  /**
   * Validate CLAUDE.md (check for common issues)
   */
  async validate() {
    if (!this.config) {
      await this.load();
    }

    const issues = [];

    // Check length (too long = slow)
    const totalLength = this.config?.raw?.length || 0;
    if (totalLength > 10000) {
      issues.push({
        severity: 'warning',
        message: `CLAUDE.md is ${totalLength} characters. Consider condensing for better performance.`,
      });
    }

    // Check for essential sections
    const essentialSections = ['description', 'tech-stack', 'coding-rules'];
    for (const section of essentialSections) {
      if (!this.config?.sections?.[section]) {
        issues.push({
          severity: 'info',
          message: `Consider adding a "${section}" section`,
        });
      }
    }

    return {
      valid: issues.filter((i) => i.severity === 'error').length === 0,
      issues,
    };
  }
}

export default ClaudeMdLoader;
