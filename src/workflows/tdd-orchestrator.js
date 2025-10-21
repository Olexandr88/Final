/**
 * TDD Workflow Orchestrator
 * Implements Test-Driven Development patterns for Claude Code
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export class TDDOrchestrator {
  constructor(options = {}) {
    this.testDir = options.testDir || 'tests';
    this.testFramework = options.testFramework || 'jest'; // jest, pytest, mocha
    this.coverageThreshold = options.coverageThreshold || 80;
    this.testHistory = [];
  }

  /**
   * Red phase: Write failing test
   */
  async red(testSpec) {
    const {
      feature,
      description,
      testFile,
      testName,
      expectations
    } = testSpec;

    console.log(`\n🔴 RED: Writing failing test for ${feature}\n`);

    const testCode = this._generateTest({
      framework: this.testFramework,
      testFile,
      testName,
      description,
      expectations,
      shouldFail: true
    });

    // Write test file
    const testPath = path.join(this.testDir, testFile);
    await fs.promises.mkdir(path.dirname(testPath), { recursive: true });

    if (fs.existsSync(testPath)) {
      // Append to existing file
      const existing = await fs.promises.readFile(testPath, 'utf-8');
      await fs.promises.writeFile(testPath, `${existing}\n\n${testCode}`, 'utf-8');
    } else {
      await fs.promises.writeFile(testPath, testCode, 'utf-8');
    }

    // Run tests to verify failure
    const result = await this.runTests({ file: testPath });

    if (result.passed) {
      throw new Error(`Test should fail but passed. Review test implementation.`);
    }

    console.log(`✓ Test created and verified to fail: ${testName}`);

    this.testHistory.push({
      phase: 'red',
      feature,
      testFile,
      testName,
      timestamp: Date.now()
    });

    return {
      testPath,
      testName,
      failed: true
    };
  }

  /**
   * Green phase: Implement minimum code to pass
   */
  async green(implementation) {
    const {
      feature,
      sourceFile,
      code,
      testFile
    } = implementation;

    console.log(`\n🟢 GREEN: Implementing ${feature}\n`);

    // Write implementation
    const sourcePath = path.join(process.cwd(), sourceFile);
    await fs.promises.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.promises.writeFile(sourcePath, code, 'utf-8');

    // Run tests
    const testPath = testFile ? path.join(this.testDir, testFile) : null;
    const result = await this.runTests({ file: testPath });

    if (!result.passed) {
      console.log(`\n❌ Tests failed. Iteration required.\n`);
      return {
        passed: false,
        failures: result.failures,
        needsIteration: true
      };
    }

    console.log(`✓ Implementation complete. All tests passing.`);

    this.testHistory.push({
      phase: 'green',
      feature,
      sourceFile,
      timestamp: Date.now()
    });

    return {
      passed: true,
      coverage: result.coverage
    };
  }

  /**
   * Refactor phase: Improve code while keeping tests green
   */
  async refactor(refactorSpec) {
    const {
      feature,
      sourceFile,
      refactoredCode,
      reason
    } = refactorSpec;

    console.log(`\n🔵 REFACTOR: ${reason}\n`);

    // Backup original
    const sourcePath = path.join(process.cwd(), sourceFile);
    const backup = await fs.promises.readFile(sourcePath, 'utf-8');

    try {
      // Apply refactoring
      await fs.promises.writeFile(sourcePath, refactoredCode, 'utf-8');

      // Run tests to ensure nothing broke
      const result = await this.runTests();

      if (!result.passed) {
        // Revert if tests fail
        await fs.promises.writeFile(sourcePath, backup, 'utf-8');
        throw new Error(`Refactoring broke tests. Changes reverted.`);
      }

      console.log(`✓ Refactoring successful. Tests still passing.`);

      this.testHistory.push({
        phase: 'refactor',
        feature,
        sourceFile,
        reason,
        timestamp: Date.now()
      });

      return {
        success: true,
        testsPass: true
      };
    } catch (error) {
      // Revert on any error
      await fs.promises.writeFile(sourcePath, backup, 'utf-8');
      throw error;
    }
  }

  /**
   * Full TDD cycle: Red → Green → Refactor
   */
  async cycle(spec) {
    const {
      feature,
      testSpec,
      implementation,
      refactoring
    } = spec;

    console.log(`\n═══════════════════════════════════════`);
    console.log(`  TDD Cycle: ${feature}`);
    console.log(`═══════════════════════════════════════\n`);

    const results = {
      feature,
      phases: {},
      success: false
    };

    try {
      // RED: Write failing test
      results.phases.red = await this.red(testSpec);

      // GREEN: Implement to pass
      let greenResult;
      let attempts = 0;
      const maxAttempts = 5;

      do {
        greenResult = await this.green({
          ...implementation,
          attempt: attempts + 1
        });
        attempts++;

        if (!greenResult.passed && attempts >= maxAttempts) {
          throw new Error(`Failed to pass tests after ${maxAttempts} attempts`);
        }
      } while (!greenResult.passed && attempts < maxAttempts);

      results.phases.green = greenResult;

      // REFACTOR: Improve code (optional)
      if (refactoring) {
        results.phases.refactor = await this.refactor(refactoring);
      }

      results.success = true;

      console.log(`\n✅ TDD Cycle Complete: ${feature}\n`);

      return results;
    } catch (error) {
      console.error(`\n❌ TDD Cycle Failed: ${error.message}\n`);
      results.error = error.message;
      return results;
    }
  }

  /**
   * Run test suite
   */
  async runTests(options = {}) {
    const { file, watch = false } = options;

    let command;
    const fileArg = file ? ` ${file}` : '';

    switch (this.testFramework) {
      case 'jest':
        command = `npx jest${fileArg} --coverage --json --outputFile=.test-results.json`;
        break;
      case 'pytest':
        command = `pytest${fileArg} --cov --json-report --json-report-file=.test-results.json`;
        break;
      case 'mocha':
        command = `npx mocha${fileArg} --reporter json > .test-results.json`;
        break;
      default:
        command = `npm test${fileArg}`;
    }

    try {
      execSync(command, { stdio: 'inherit', cwd: process.cwd() });

      // Parse results
      const resultsPath = path.join(process.cwd(), '.test-results.json');
      let results = { passed: true, failures: [], coverage: null };

      if (fs.existsSync(resultsPath)) {
        const resultsContent = await fs.promises.readFile(resultsPath, 'utf-8');
        results = JSON.parse(resultsContent);
      }

      return {
        passed: true,
        failures: [],
        coverage: results.coverage || null
      };
    } catch (error) {
      // Parse failures
      const resultsPath = path.join(process.cwd(), '.test-results.json');
      let failures = [];

      if (fs.existsSync(resultsPath)) {
        const resultsContent = await fs.promises.readFile(resultsPath, 'utf-8');
        const results = JSON.parse(resultsContent);
        failures = results.failures || [];
      }

      return {
        passed: false,
        failures,
        coverage: null
      };
    }
  }

  /**
   * Generate test code based on framework
   */
  _generateTest(spec) {
    const { framework, testName, description, expectations } = spec;

    switch (framework) {
      case 'jest':
        return this._generateJestTest(spec);
      case 'pytest':
        return this._generatePytestTest(spec);
      case 'mocha':
        return this._generateMochaTest(spec);
      default:
        throw new Error(`Unsupported test framework: ${framework}`);
    }
  }

  /**
   * Generate Jest test
   */
  _generateJestTest(spec) {
    const { testName, description, expectations } = spec;

    return `
describe('${testName}', () => {
  test('${description}', () => {
    ${expectations.map(exp => `expect(${exp.actual}).${exp.matcher}(${exp.expected});`).join('\n    ')}
  });
});
`;
  }

  /**
   * Generate pytest test
   */
  _generatePytestTest(spec) {
    const { testName, description, expectations } = spec;

    return `
def test_${testName.replace(/\s+/g, '_').toLowerCase()}():
    """${description}"""
    ${expectations.map(exp => `assert ${exp.actual} ${exp.matcher} ${exp.expected}`).join('\n    ')}
`;
  }

  /**
   * Generate Mocha test
   */
  _generateMochaTest(spec) {
    const { testName, description, expectations } = spec;

    return `
describe('${testName}', function() {
  it('${description}', function() {
    ${expectations.map(exp => `expect(${exp.actual}).to.${exp.matcher}(${exp.expected});`).join('\n    ')}
  });
});
`;
  }

  /**
   * Get TDD cycle history
   */
  getHistory() {
    return this.testHistory;
  }

  /**
   * Generate TDD report
   */
  generateReport() {
    const report = {
      totalCycles: this.testHistory.length,
      phases: {
        red: this.testHistory.filter(h => h.phase === 'red').length,
        green: this.testHistory.filter(h => h.phase === 'green').length,
        refactor: this.testHistory.filter(h => h.phase === 'refactor').length
      },
      features: [...new Set(this.testHistory.map(h => h.feature))],
      timeline: this.testHistory
    };

    return report;
  }
}

export default TDDOrchestrator;
