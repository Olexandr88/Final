#!/usr/bin/env node
/**
 * PRODUCTION-READY CHECKLIST
 *
 * Automated validation tool to ensure vibe-coded projects
 * meet production standards before deployment.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class ProductionChecker {
  constructor(projectRoot = process.cwd()) {
    this.root = projectRoot;
    this.results = [];
  }

  check(name, fn) {
    try {
      const result = fn();
      this.results.push({ name, status: result ? 'PASS' : 'FAIL', message: result || 'Failed' });
      return result;
    } catch (error) {
      this.results.push({ name, status: 'ERROR', message: error.message });
      return false;
    }
  }

  // Security Checks
  checkSecrets() {
    return this.check('Secrets Management', () => {
      const gitignore = path.join(this.root, '.gitignore');
      if (!fs.existsSync(gitignore)) return false;

      const content = fs.readFileSync(gitignore, 'utf8');
      const required = ['.env', 'node_modules', '*.log'];
      const missing = required.filter(item => !content.includes(item));

      if (missing.length > 0) {
        return `Missing in .gitignore: ${missing.join(', ')}`;
      }

      // Check for hardcoded secrets
      const jsFiles = this.findFiles('**/*.{js,ts,jsx,tsx}');
      const secretPatterns = [
        /api[_-]?key\s*=\s*["'][^"']+["']/i,
        /password\s*=\s*["'][^"']+["']/i,
        /secret\s*=\s*["'][^"']+["']/i,
      ];

      for (const file of jsFiles.slice(0, 50)) { // Check first 50 files
        const content = fs.readFileSync(file, 'utf8');
        for (const pattern of secretPatterns) {
          if (pattern.test(content)) {
            return `Potential hardcoded secret in ${file}`;
          }
        }
      }

      return true;
    });
  }

  checkDependencies() {
    return this.check('Dependency Security', () => {
      const pkg = path.join(this.root, 'package.json');
      if (!fs.existsSync(pkg)) return 'No package.json found';

      try {
        execSync('npm audit --audit-level=high', { cwd: this.root, stdio: 'pipe' });
        return true;
      } catch (error) {
        return 'Security vulnerabilities found (run: npm audit)';
      }
    });
  }

  // Testing Checks
  checkTests() {
    return this.check('Test Suite', () => {
      const pkg = path.join(this.root, 'package.json');
      if (!fs.existsSync(pkg)) return 'No package.json';

      const pkgData = JSON.parse(fs.readFileSync(pkg, 'utf8'));
      if (!pkgData.scripts || !pkgData.scripts.test) {
        return 'No test script defined';
      }

      if (pkgData.scripts.test.includes('no test specified')) {
        return 'Test script not configured';
      }

      // Try to run tests
      try {
        execSync('npm test', { cwd: this.root, stdio: 'pipe' });
        return true;
      } catch (error) {
        return 'Tests failing';
      }
    });
  }

  checkCoverage() {
    return this.check('Test Coverage', () => {
      const coverageFile = path.join(this.root, 'coverage', 'coverage-summary.json');
      if (!fs.existsSync(coverageFile)) {
        return 'Coverage report not found (run tests with --coverage)';
      }

      const coverage = JSON.parse(fs.readFileSync(coverageFile, 'utf8'));
      const total = coverage.total;

      if (total.lines.pct < 90) {
        return `Coverage ${total.lines.pct}% (target: 90%+)`;
      }

      return true;
    });
  }

  // Code Quality Checks
  checkLinting() {
    return this.check('Code Linting', () => {
      const pkg = path.join(this.root, 'package.json');
      if (!fs.existsSync(pkg)) return 'No package.json';

      const pkgData = JSON.parse(fs.readFileSync(pkg, 'utf8'));
      const hasESLint = pkgData.devDependencies &&
                       (pkgData.devDependencies.eslint || pkgData.devDependencies.prettier);

      if (!hasESLint) {
        return 'No linter configured';
      }

      return true;
    });
  }

  checkTypeScript() {
    return this.check('TypeScript Configuration', () => {
      const tsconfig = path.join(this.root, 'tsconfig.json');
      if (!fs.existsSync(tsconfig)) {
        return 'No tsconfig.json (skip if not using TS)';
      }

      const config = JSON.parse(fs.readFileSync(tsconfig, 'utf8'));
      if (!config.compilerOptions || !config.compilerOptions.strict) {
        return 'TypeScript strict mode not enabled';
      }

      return true;
    });
  }

  // Documentation Checks
  checkREADME() {
    return this.check('Documentation', () => {
      const readme = path.join(this.root, 'README.md');
      if (!fs.existsSync(readme)) {
        return 'No README.md';
      }

      const content = fs.readFileSync(readme, 'utf8');
      if (content.length < 100) {
        return 'README too short (minimum documentation required)';
      }

      const required = ['install', 'usage', 'test'];
      const missing = required.filter(section => !content.toLowerCase().includes(section));

      if (missing.length > 0) {
        return `README missing sections: ${missing.join(', ')}`;
      }

      return true;
    });
  }

  // Deployment Checks
  checkBuild() {
    return this.check('Build Process', () => {
      const pkg = path.join(this.root, 'package.json');
      if (!fs.existsSync(pkg)) return 'No package.json';

      const pkgData = JSON.parse(fs.readFileSync(pkg, 'utf8'));
      if (!pkgData.scripts || !pkgData.scripts.build) {
        return 'No build script defined';
      }

      try {
        execSync('npm run build', { cwd: this.root, stdio: 'pipe' });
        return true;
      } catch (error) {
        return 'Build failed';
      }
    });
  }

  checkEnvironment() {
    return this.check('Environment Configuration', () => {
      const envExample = path.join(this.root, '.env.example');
      const env = path.join(this.root, '.env');

      if (!fs.existsSync(envExample) && fs.existsSync(env)) {
        return 'Missing .env.example (document required env vars)';
      }

      return true;
    });
  }

  // Helper methods
  findFiles(pattern) {
    try {
      const result = execSync(`find . -name "${pattern}" -type f`, {
        cwd: this.root,
        encoding: 'utf8'
      });
      return result.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  // Run all checks
  async runAll() {
    console.log('🔍 Running Production Readiness Checks...\n');

    // Security
    console.log('=== SECURITY ===');
    this.checkSecrets();
    this.checkDependencies();
    this.checkEnvironment();

    // Testing
    console.log('\n=== TESTING ===');
    this.checkTests();
    this.checkCoverage();

    // Code Quality
    console.log('\n=== CODE QUALITY ===');
    this.checkLinting();
    this.checkTypeScript();

    // Documentation
    console.log('\n=== DOCUMENTATION ===');
    this.checkREADME();

    // Build
    console.log('\n=== BUILD ===');
    this.checkBuild();

    this.printResults();
  }

  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('PRODUCTION READINESS REPORT');
    console.log('='.repeat(60) + '\n');

    let passed = 0;
    let failed = 0;
    let errors = 0;

    this.results.forEach(result => {
      const icon = result.status === 'PASS' ? '✓' : '✗';
      const color = result.status === 'PASS' ? '\x1b[32m' : '\x1b[31m';
      const reset = '\x1b[0m';

      console.log(`${color}${icon}${reset} ${result.name}`);

      if (result.status !== 'PASS') {
        console.log(`  ${result.message}\n`);
      }

      if (result.status === 'PASS') passed++;
      else if (result.status === 'FAIL') failed++;
      else errors++;
    });

    console.log('\n' + '='.repeat(60));
    console.log(`Total: ${this.results.length} | Passed: ${passed} | Failed: ${failed} | Errors: ${errors}`);
    console.log('='.repeat(60) + '\n');

    const score = (passed / this.results.length * 100).toFixed(0);
    console.log(`Production Readiness Score: ${score}%`);

    if (score >= 90) {
      console.log('✓ READY FOR PRODUCTION');
    } else if (score >= 70) {
      console.log('⚠ NEEDS IMPROVEMENTS');
    } else {
      console.log('✗ NOT PRODUCTION READY');
    }

    return score >= 90;
  }
}

// CLI
if (require.main === module) {
  const checker = new ProductionChecker(process.argv[2] || process.cwd());
  checker.runAll().then(ready => {
    process.exit(ready ? 0 : 1);
  });
}

module.exports = ProductionChecker;
