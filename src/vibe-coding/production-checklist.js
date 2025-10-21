/**
 * Vibe Coding Production Readiness Checklist
 * Automated validation for production deployment
 */

import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, access } from 'fs/promises';
import { constants } from 'fs';

const execAsync = promisify(exec);

export class ProductionChecklist extends EventEmitter {
  constructor(options = {}) {
    super();
    this.projectRoot = options.projectRoot || process.cwd();
    this.checks = new Map();
    this.initializeChecks();
  }

  initializeChecks() {
    this.registerCheck('env-file', this.checkEnvFile.bind(this));
    this.registerCheck('gitignore', this.checkGitignore.bind(this));
    this.registerCheck('no-secrets', this.checkNoSecrets.bind(this));
    this.registerCheck('tests-passing', this.checkTestsPassing.bind(this));
    this.registerCheck('build-success', this.checkBuildSuccess.bind(this));
    this.registerCheck('dependencies', this.checkDependencies.bind(this));
    this.registerCheck('security-audit', this.checkSecurityAudit.bind(this));
    this.registerCheck('linting', this.checkLinting.bind(this));
    this.registerCheck('documentation', this.checkDocumentation.bind(this));
    this.registerCheck('error-handling', this.checkErrorHandling.bind(this));
  }

  registerCheck(name, checkFunction) {
    this.checks.set(name, {
      name,
      fn: checkFunction,
      enabled: true,
    });
  }

  async runAllChecks() {
    const results = {
      timestamp: Date.now(),
      passed: [],
      failed: [],
      warnings: [],
      score: 0,
      ready: false,
    };

    for (const [name, check] of this.checks) {
      if (!check.enabled) continue;

      try {
        this.emit('check:start', { name });

        const result = await check.fn();

        if (result.passed) {
          results.passed.push({ name, ...result });
        } else if (result.warning) {
          results.warnings.push({ name, ...result });
        } else {
          results.failed.push({ name, ...result });
        }

        this.emit('check:complete', { name, result });
      } catch (error) {
        results.failed.push({
          name,
          passed: false,
          error: error.message,
        });

        this.emit('check:error', { name, error });
      }
    }

    results.score = (results.passed.length / this.checks.size) * 100;
    results.ready = results.failed.length === 0 && results.score >= 80;

    this.emit('checklist:complete', results);
    return results;
  }

  async checkEnvFile() {
    try {
      await access(`${this.projectRoot}/.env`, constants.F_OK);
      return {
        passed: true,
        message: '.env file exists',
      };
    } catch {
      return {
        passed: false,
        message: '.env file not found - create one for secrets management',
      };
    }
  }

  async checkGitignore() {
    try {
      const gitignore = await readFile(`${this.projectRoot}/.gitignore`, 'utf-8');
      const requiredEntries = ['.env', 'node_modules', 'dist', 'build', '.DS_Store'];
      const missing = requiredEntries.filter((entry) => !gitignore.includes(entry));

      if (missing.length === 0) {
        return {
          passed: true,
          message: '.gitignore is properly configured',
        };
      }

      return {
        passed: false,
        message: `.gitignore missing entries: ${missing.join(', ')}`,
      };
    } catch {
      return {
        passed: false,
        message: '.gitignore file not found',
      };
    }
  }

  async checkNoSecrets() {
    try {
      const { stdout } = await execAsync(
        'git grep -i "api_key\\|secret\\|password\\|token" -- "*.js" "*.ts" "*.jsx" "*.tsx"',
        {
          cwd: this.projectRoot,
        }
      );

      if (stdout.trim()) {
        return {
          passed: false,
          message: 'Potential secrets found in code - review these carefully',
          details: stdout.split('\n').slice(0, 5),
        };
      }

      return {
        passed: true,
        message: 'No obvious secrets detected in code',
      };
    } catch (error) {
      if (error.code === 1) {
        return {
          passed: true,
          message: 'No secrets found in code',
        };
      }

      return {
        warning: true,
        message: 'Could not scan for secrets',
      };
    }
  }

  async checkTestsPassing() {
    try {
      await execAsync('npm test', { cwd: this.projectRoot });
      return {
        passed: true,
        message: 'All tests passing',
      };
    } catch (error) {
      return {
        passed: false,
        message: 'Tests failing - fix before deployment',
        details: error.stderr || error.stdout,
      };
    }
  }

  async checkBuildSuccess() {
    try {
      await execAsync('npm run build', { cwd: this.projectRoot });
      return {
        passed: true,
        message: 'Build successful',
      };
    } catch (error) {
      return {
        passed: false,
        message: 'Build failed - fix build errors',
        details: error.stderr || error.stdout,
      };
    }
  }

  async checkDependencies() {
    try {
      const { stdout } = await execAsync('npm outdated --json', { cwd: this.projectRoot });

      if (!stdout.trim()) {
        return {
          passed: true,
          message: 'All dependencies up to date',
        };
      }

      const outdated = JSON.parse(stdout);
      const critical = Object.values(outdated).filter((d) => d.wanted !== d.latest);

      return {
        warning: true,
        message: `${critical.length} dependencies have updates available`,
        details: Object.keys(outdated).slice(0, 5),
      };
    } catch {
      return {
        passed: true,
        message: 'Dependency check complete',
      };
    }
  }

  async checkSecurityAudit() {
    try {
      await execAsync('npm audit --audit-level=high', { cwd: this.projectRoot });
      return {
        passed: true,
        message: 'No high-severity vulnerabilities',
      };
    } catch (error) {
      return {
        passed: false,
        message: 'Security vulnerabilities detected - run npm audit fix',
        details: error.stdout,
      };
    }
  }

  async checkLinting() {
    try {
      await execAsync('npm run lint', { cwd: this.projectRoot });
      return {
        passed: true,
        message: 'Code passes linting',
      };
    } catch (error) {
      return {
        passed: false,
        message: 'Linting errors found - fix code style issues',
        details: error.stdout,
      };
    }
  }

  async checkDocumentation() {
    try {
      await access(`${this.projectRoot}/README.md`, constants.F_OK);

      const readme = await readFile(`${this.projectRoot}/README.md`, 'utf-8');

      if (readme.length < 100) {
        return {
          warning: true,
          message: 'README exists but is very short',
        };
      }

      return {
        passed: true,
        message: 'Documentation found',
      };
    } catch {
      return {
        warning: true,
        message: 'No README.md found - consider adding documentation',
      };
    }
  }

  async checkErrorHandling() {
    try {
      const { stdout } = await execAsync('git grep -c "try {" -- "*.js" "*.ts"', {
        cwd: this.projectRoot,
      });

      const tryCount = stdout.split('\n').length - 1;

      if (tryCount > 5) {
        return {
          passed: true,
          message: `Error handling detected (${tryCount} try blocks)`,
        };
      }

      return {
        warning: true,
        message: 'Limited error handling found - consider adding more try-catch blocks',
      };
    } catch {
      return {
        warning: true,
        message: 'Could not analyze error handling',
      };
    }
  }

  async generateReport(results) {
    const report = {
      title: 'Production Readiness Report',
      timestamp: new Date().toISOString(),
      score: results.score,
      ready: results.ready,
      summary: {
        total: this.checks.size,
        passed: results.passed.length,
        failed: results.failed.length,
        warnings: results.warnings.length,
      },
      details: {
        passed: results.passed,
        failed: results.failed,
        warnings: results.warnings,
      },
      recommendations: this.generateRecommendations(results),
    };

    this.emit('report:generated', report);
    return report;
  }

  generateRecommendations(results) {
    const recommendations = [];

    if (results.failed.length > 0) {
      recommendations.push({
        priority: 'high',
        message: `Fix ${results.failed.length} failing checks before deploying to production`,
        checks: results.failed.map((f) => f.name),
      });
    }

    if (results.warnings.length > 0) {
      recommendations.push({
        priority: 'medium',
        message: `Address ${results.warnings.length} warnings to improve production readiness`,
        checks: results.warnings.map((w) => w.name),
      });
    }

    if (results.score < 80) {
      recommendations.push({
        priority: 'high',
        message: `Production readiness score is ${results.score.toFixed(1)}% - aim for at least 80%`,
      });
    }

    return recommendations;
  }
}

export default ProductionChecklist;
