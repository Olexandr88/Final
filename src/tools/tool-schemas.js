/**
 * Complete Tool Schemas for LLM Function Calling
 * Provides accurate, comprehensive schemas for all available tools
 */

export const fileToolSchemas = {
  read: {
    name: 'read',
    description: 'Read file contents from the filesystem with metadata',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the file to read' },
        encoding: { type: 'string', description: 'File encoding', default: 'utf-8' },
      },
      required: ['file_path'],
    },
  },
  write: {
    name: 'write',
    description: 'Write content to a file',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
        content: { type: 'string' },
        encoding: { type: 'string', default: 'utf-8' },
      },
      required: ['file_path', 'content'],
    },
  },
  edit: {
    name: 'edit',
    description: 'Edit file with line-based modifications',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              line: { type: 'integer', minimum: 1 },
              operation: { type: 'string', enum: ['replace', 'insert', 'delete'] },
              content: { type: 'string' },
            },
            required: ['line', 'operation'],
          },
        },
      },
      required: ['file_path', 'edits'],
    },
  },
  glob: {
    name: 'glob',
    description: 'Find files matching a glob pattern',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        cwd: { type: 'string' },
        ignore: { type: 'array', items: { type: 'string' } },
      },
      required: ['pattern'],
    },
  },
  grep: {
    name: 'grep',
    description: 'Search file contents for a pattern',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        path: { type: 'string', default: '.' },
        case_sensitive: { type: 'boolean', default: false },
      },
      required: ['pattern'],
    },
  },
};

export const bashToolSchemas = {
  bash: {
    name: 'bash',
    description: 'Execute a shell command',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        args: { type: 'array', items: { type: 'string' }, default: [] },
        cwd: { type: 'string' },
        timeout: { type: 'integer', default: 30000, minimum: 1000, maximum: 60000 },
        env: { type: 'object' },
      },
      required: ['command'],
    },
  },
  npm: {
    name: 'npm',
    description: 'Run an npm command',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        cwd: { type: 'string' },
      },
      required: ['command'],
    },
  },
};

export const gitToolSchemas = {
  git_status: {
    name: 'git_status',
    description: 'Get the current git repository status',
    input_schema: {
      type: 'object',
      properties: {
        cwd: { type: 'string' },
        porcelain: { type: 'boolean', default: true },
      },
    },
  },
  git_diff: {
    name: 'git_diff',
    description: 'Get git diff output',
    input_schema: {
      type: 'object',
      properties: {
        cwd: { type: 'string' },
        file: { type: 'string' },
        staged: { type: 'boolean', default: false },
        nameOnly: { type: 'boolean', default: false },
        ref: { type: 'string' },
      },
    },
  },
  git_commit: {
    name: 'git_commit',
    description: 'Commit changes to git',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        cwd: { type: 'string' },
        files: { type: 'array', items: { type: 'string' } },
        all: { type: 'boolean', default: false },
        amend: { type: 'boolean', default: false },
        author: { type: 'string' },
      },
      required: ['message'],
    },
  },
};

export const codeToolSchemas = {
  analyze_code: {
    name: 'analyze_code',
    description: 'Analyze code for issues and bugs',
    input_schema: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        language: {
          type: 'string',
          default: 'js',
          enum: ['js', 'javascript', 'ts', 'typescript', 'jsx', 'tsx'],
        },
        file_path: { type: 'string' },
        eslint_config: { type: 'object' },
        include_metrics: { type: 'boolean', default: true },
      },
      required: ['code'],
    },
  },
};

export const testToolSchemas = {
  run_tests: {
    name: 'run_tests',
    description: 'Run test suite',
    input_schema: {
      type: 'object',
      properties: {
        test_pattern: { type: 'string' },
        framework: {
          type: 'string',
          default: 'node:test',
          enum: ['node:test', 'node', 'jest', 'mocha', 'vitest'],
        },
        cwd: { type: 'string' },
        coverage: { type: 'boolean', default: false },
        timeout: { type: 'integer', default: 120000, minimum: 10000, maximum: 600000 },
        args: { type: 'array', items: { type: 'string' } },
      },
    },
  },
};

export const allToolSchemas = {
  ...fileToolSchemas,
  ...bashToolSchemas,
  ...gitToolSchemas,
  ...codeToolSchemas,
  ...testToolSchemas,
};

export function getToolSchema(toolName) {
  return allToolSchemas[toolName] || null;
}

export function getAllToolSchemas() {
  return Object.values(allToolSchemas);
}

export function getToolSchemasByCategory(category) {
  const categoryMap = {
    file: fileToolSchemas,
    bash: bashToolSchemas,
    git: gitToolSchemas,
    code: codeToolSchemas,
    test: testToolSchemas,
  };
  return categoryMap[category.toLowerCase()]
    ? Object.values(categoryMap[category.toLowerCase()])
    : [];
}

export function validateToolParams(toolName, params) {
  const schema = getToolSchema(toolName);
  if (!schema) return { valid: false, errors: [`Unknown tool: ${toolName}`] };
  const errors = [];
  const { properties, required = [] } = schema.input_schema;
  for (const req of required) {
    if (!(req in params)) errors.push(`Missing: ${req}`);
  }
  for (const [name, value] of Object.entries(params)) {
    const prop = properties[name];
    if (!prop) {
      errors.push(`Unknown: ${name}`);
      continue;
    }
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== prop.type && value !== undefined) errors.push(`${name} type mismatch`);
  }
  return { valid: errors.length === 0, errors };
}
