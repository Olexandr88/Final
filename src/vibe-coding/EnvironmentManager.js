/**
 * Environment Isolation Manager
 * Ensures safe workspace isolation for agentic operations
 */

import { EventEmitter } from 'events';
import { mkdir, access, writeFile, readFile } from 'fs/promises';
import { constants } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export class EnvironmentManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.baseWorkspace =
      options.baseWorkspace ||
      path.join(process.env.HOME || process.env.USERPROFILE, 'claude-workspace');
  }

  async createIsolatedWorkspace(projectName, options = {}) {
    const workspacePath = path.join(this.baseWorkspace, projectName);

    const workspace = {
      name: projectName,
      path: workspacePath,
      created: Date.now(),
      structure: options.structure || ['src', 'tests', 'db', 'bin'],
      isolated: true,
    };

    try {
      await mkdir(workspacePath, { recursive: true });

      for (const dir of workspace.structure) {
        await mkdir(path.join(workspacePath, dir), { recursive: true });
      }

      await this.initializeGit(workspacePath);

      await this.createGitignore(workspacePath);

      await this.createEnvTemplate(workspacePath);

      this.emit('workspace:created', workspace);

      return workspace;
    } catch (error) {
      this.emit('workspace:error', { error, workspace });
      throw error;
    }
  }

  async initializeGit(workspacePath) {
    try {
      await execAsync('git init', { cwd: workspacePath });

      await execAsync('git config user.name "AI Developer"', { cwd: workspacePath });
      await execAsync('git config user.email "ai@vibe-coding.dev"', { cwd: workspacePath });

      this.emit('git:initialized', { path: workspacePath });
    } catch (error) {
      this.emit('git:error', { error, path: workspacePath });
    }
  }

  async createGitignore(workspacePath) {
    const gitignoreContent = `# Dependencies
node_modules/
venv/
__pycache__/
*.pyc

# Environment
.env
.env.local
.env.*.local

# Build outputs
dist/
build/
*.egg-info/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Database
*.db
*.sqlite
*.sqlite3

# Logs
*.log
npm-debug.log*

# Temporary
tmp/
temp/
*.tmp
`;

    await writeFile(path.join(workspacePath, '.gitignore'), gitignoreContent, 'utf-8');
    this.emit('gitignore:created', { path: workspacePath });
  }

  async createEnvTemplate(workspacePath) {
    const envTemplate = `# Environment Configuration Template
# Copy this to .env and fill in your values

# API Keys (NEVER commit .env to git)
# ANTHROPIC_API_KEY=your-key-here
# OPENAI_API_KEY=your-key-here

# Database
# DATABASE_URL=sqlite:///db/database.db

# Application
# NODE_ENV=development
# PORT=3000
`;

    await writeFile(path.join(workspacePath, '.env.template'), envTemplate, 'utf-8');
    this.emit('env-template:created', { path: workspacePath });
  }

  async validateWorkspace(workspacePath) {
    const validation = {
      path: workspacePath,
      valid: true,
      issues: [],
      checks: {},
    };

    try {
      await access(workspacePath, constants.F_OK);
      validation.checks.exists = true;
    } catch {
      validation.valid = false;
      validation.issues.push('Workspace directory does not exist');
      validation.checks.exists = false;
    }

    try {
      await access(path.join(workspacePath, '.git'), constants.F_OK);
      validation.checks.hasGit = true;
    } catch {
      validation.issues.push('Git not initialized');
      validation.checks.hasGit = false;
    }

    try {
      await access(path.join(workspacePath, '.gitignore'), constants.F_OK);
      validation.checks.hasGitignore = true;
    } catch {
      validation.issues.push('.gitignore missing');
      validation.checks.hasGitignore = false;
    }

    const dangerousPaths = [
      path.join(process.env.HOME || process.env.USERPROFILE, 'Documents'),
      path.join(process.env.HOME || process.env.USERPROFILE, 'Desktop'),
      '/usr',
      '/etc',
      '/var',
      'C:\\Windows',
      'C:\\Program Files',
    ];

    const isDangerous = dangerousPaths.some((p) => workspacePath.startsWith(p));
    if (isDangerous) {
      validation.valid = false;
      validation.issues.push('Workspace in dangerous system directory');
      validation.checks.safeLocation = false;
    } else {
      validation.checks.safeLocation = true;
    }

    this.emit('workspace:validated', validation);
    return validation;
  }

  async checkIsolation(workspacePath) {
    const isolation = {
      isolated: true,
      risks: [],
    };

    const parentPath = path.dirname(workspacePath);

    try {
      const { stdout } = await execAsync('ls -la', { cwd: parentPath });

      if (stdout.includes('package.json') || stdout.includes('.git')) {
        isolation.isolated = false;
        isolation.risks.push('Parent directory appears to be an active project');
      }
    } catch {}

    try {
      const { stdout } = await execAsync('git status', { cwd: parentPath });
      if (!stdout.includes('not a git repository')) {
        isolation.isolated = false;
        isolation.risks.push('Parent directory is a git repository');
      }
    } catch {}

    return isolation;
  }

  async setupSafetyChecks(workspacePath) {
    const hooksDir = path.join(workspacePath, '.git', 'hooks');

    try {
      await mkdir(hooksDir, { recursive: true });

      const preCommitHook = `#!/bin/sh
# Prevent committing secrets

if git diff --cached --name-only | grep -E '^\.env$'; then
  echo "ERROR: Attempting to commit .env file"
  echo "This file may contain secrets and should not be committed"
  exit 1
fi

# Check for potential secrets in code
if git diff --cached | grep -iE '(api_key|password|secret|token)\\s*=\\s*["\'][^"\']{10,}'; then
  echo "WARNING: Potential secret detected in staged changes"
  echo "Please review before committing"
fi

exit 0
`;

      const hookPath = path.join(hooksDir, 'pre-commit');
      await writeFile(hookPath, preCommitHook, 'utf-8');

      if (process.platform !== 'win32') {
        await execAsync(`chmod +x "${hookPath}"`);
      }

      this.emit('safety-checks:installed', { path: workspacePath });
    } catch (error) {
      this.emit('safety-checks:error', { error, path: workspacePath });
    }
  }

  async createWorkspaceConfig(workspacePath, config = {}) {
    const workspaceConfig = {
      name: config.name || path.basename(workspacePath),
      created: new Date().toISOString(),
      isolated: true,
      structure: config.structure || ['src', 'tests', 'db', 'bin'],
      settings: {
        autoCommit: config.autoCommit !== false,
        requireTests: config.requireTests !== false,
        enforceLinting: config.enforceLinting || false,
      },
    };

    await writeFile(
      path.join(workspacePath, '.claude-workspace.json'),
      JSON.stringify(workspaceConfig, null, 2),
      'utf-8'
    );

    this.emit('config:created', { path: workspacePath, config: workspaceConfig });
    return workspaceConfig;
  }

  async loadWorkspaceConfig(workspacePath) {
    try {
      const configPath = path.join(workspacePath, '.claude-workspace.json');
      const content = await readFile(configPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async listWorkspaces() {
    try {
      const { stdout } = await execAsync(`ls -1 "${this.baseWorkspace}"`);
      const workspaces = stdout.trim().split('\n').filter(Boolean);

      const details = [];

      for (const name of workspaces) {
        const wsPath = path.join(this.baseWorkspace, name);
        const config = await this.loadWorkspaceConfig(wsPath);
        const validation = await this.validateWorkspace(wsPath);

        details.push({
          name,
          path: wsPath,
          valid: validation.valid,
          config,
        });
      }

      return details;
    } catch {
      return [];
    }
  }

  async deleteWorkspace(workspacePath, options = {}) {
    if (!options.confirm) {
      throw new Error('Workspace deletion requires explicit confirmation');
    }

    const validation = await this.validateWorkspace(workspacePath);

    if (!validation.checks.exists) {
      throw new Error('Workspace does not exist');
    }

    try {
      await execAsync(`rm -rf "${workspacePath}"`);
      this.emit('workspace:deleted', { path: workspacePath });
      return { success: true, path: workspacePath };
    } catch (error) {
      this.emit('workspace:delete-error', { error, path: workspacePath });
      throw error;
    }
  }
}

export default EnvironmentManager;
