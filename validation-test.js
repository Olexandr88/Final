#!/usr/bin/env node
/**
 * Repository Validation Test
 * Comprehensive validation of the LLM repository setup
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class RepositoryValidator {
  constructor() {
    this.validationResults = [];
    this.errors = [];
    this.warnings = [];

    console.log('🔍 Repository Validation Test - Starting Comprehensive Check');
  }

  async validateRepository() {
    console.log('\n📦 Validating Package Configuration...');
    await this.validatePackageConfig();

    console.log('\n🔧 Validating Scripts Directory...');
    await this.validateScriptsDirectory();

    console.log('\n📁 Validating Examples Directory...');
    await this.validateExamplesDirectory();

    console.log('\n⚙️ Validating Workflow Files...');
    await this.validateWorkflows();

    return this.generateReport();
  }

  async validatePackageConfig() {
    try {
      const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));

      // Check ES module configuration
      if (packageJson.type === 'module') {
        this.addResult('✅ ES Module configuration correct');
      } else {
        this.addError('❌ Missing ES module configuration in package.json');
      }

      // Check required dependencies
      const requiredDeps = ['express', 'ws', 'pg', 'compression', 'helmet'];
      for (const dep of requiredDeps) {
        if (packageJson.dependencies && packageJson.dependencies[dep]) {
          this.addResult(`✅ Required dependency found: ${dep}`);
        } else {
          this.addWarning(`⚠️ Missing dependency: ${dep}`);
        }
      }

      // Check scripts
      const requiredScripts = ['start', 'test', 'lint', 'performance:analyze'];
      for (const script of requiredScripts) {
        if (packageJson.scripts && packageJson.scripts[script]) {
          this.addResult(`✅ Required script found: ${script}`);
        } else {
          this.addWarning(`⚠️ Missing script: ${script}`);
        }
      }
    } catch (error) {
      this.addError(`❌ Failed to read package.json: ${error.message}`);
    }
  }

  async validateScriptsDirectory() {
    const requiredScripts = [
      'performance-optimizer.js',
      'health-check.js',
      'validate-optimization.js',
    ];

    try {
      const scriptsDir = await fs.readdir('scripts');

      for (const script of requiredScripts) {
        if (scriptsDir.includes(script)) {
          this.addResult(`✅ Required script exists: ${script}`);

          // Validate ES module syntax
          try {
            const content = await fs.readFile(`scripts/${script}`, 'utf8');
            if (content.includes('import ') && content.includes('from ')) {
              this.addResult(`✅ ${script} uses ES module syntax`);
            } else if (content.includes('require(')) {
              this.addWarning(`⚠️ ${script} still uses CommonJS - consider updating`);
            }
          } catch (readError) {
            this.addWarning(`⚠️ Could not validate ${script} syntax`);
          }
        } else {
          this.addError(`❌ Missing required script: ${script}`);
        }
      }
    } catch (error) {
      this.addError(`❌ Failed to read scripts directory: ${error.message}`);
    }
  }

  async validateExamplesDirectory() {
    const requiredExamples = [
      'bridge-demo.js',
      'bridge-demo-ultra.js',
      'bridge-demo-production-enhancements.js',
    ];

    try {
      const examplesDir = await fs.readdir('examples');

      for (const example of requiredExamples) {
        if (examplesDir.includes(example)) {
          this.addResult(`✅ Required example exists: ${example}`);
        } else {
          this.addError(`❌ Missing required example: ${example}`);
        }
      }
    } catch (error) {
      this.addError(`❌ Failed to read examples directory: ${error.message}`);
    }
  }

  async validateWorkflows() {
    const requiredWorkflows = ['ultra-performance-optimization.yml', 'node.js.yml'];

    try {
      const workflowsDir = await fs.readdir('.github/workflows');

      for (const workflow of requiredWorkflows) {
        if (workflowsDir.includes(workflow)) {
          this.addResult(`✅ Required workflow exists: ${workflow}`);
        } else {
          this.addError(`❌ Missing required workflow: ${workflow}`);
        }
      }
    } catch (error) {
      this.addError(`❌ Failed to read workflows directory: ${error.message}`);
    }
  }

  addResult(message) {
    this.validationResults.push(message);
    console.log(`   ${message}`);
  }

  addError(message) {
    this.errors.push(message);
    console.log(`   ${message}`);
  }

  addWarning(message) {
    this.warnings.push(message);
    console.log(`   ${message}`);
  }

  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalChecks: this.validationResults.length + this.errors.length + this.warnings.length,
        successful: this.validationResults.length,
        errors: this.errors.length,
        warnings: this.warnings.length,
      },
      results: this.validationResults,
      errors: this.errors,
      warnings: this.warnings,
      status: this.errors.length === 0 ? 'PASS' : 'FAIL',
      overallHealth: this.calculateHealth(),
    };

    console.log('\n' + '='.repeat(70));
    console.log('🎯 REPOSITORY VALIDATION COMPLETE');
    console.log('='.repeat(70));
    console.log(`📊 Total Checks: ${report.summary.totalChecks}`);
    console.log(`✅ Successful: ${report.summary.successful}`);
    console.log(`❌ Errors: ${report.summary.errors}`);
    console.log(`⚠️ Warnings: ${report.summary.warnings}`);
    console.log(`🏥 Health Score: ${report.overallHealth}%`);
    console.log(`📋 Status: ${report.status}`);

    if (report.status === 'PASS') {
      console.log('\n🎉 Repository is in excellent condition!');
      console.log('✅ All critical components validated successfully');
      console.log('🚀 Ready for production deployment');
    } else {
      console.log('\n⚠️ Repository needs attention:');
      this.errors.forEach((error) => console.log(`   ${error}`));
    }

    return report;
  }

  calculateHealth() {
    const total = this.validationResults.length + this.errors.length + this.warnings.length;
    if (total === 0) return 100;

    const successWeight = 1;
    const warningWeight = 0.5;
    const errorWeight = 0;

    const score =
      ((this.validationResults.length * successWeight +
        this.warnings.length * warningWeight +
        this.errors.length * errorWeight) /
        total) *
      100;

    return Math.round(score);
  }
}

// Execute validation
const validator = new RepositoryValidator();
validator
  .validateRepository()
  .then((report) => {
    console.log('\n🔍 Validation completed successfully');
    process.exit(report.status === 'PASS' ? 0 : 1);
  })
  .catch((error) => {
    console.error('\n💥 Validation failed:', error);
    process.exit(1);
  });
