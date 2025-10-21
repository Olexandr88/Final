#!/usr/bin/env node
/**
 * TDD WORKFLOW AUTOMATION
 * Enforces test-first development cycle
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class TDDWorkflow {
  constructor(projectRoot = process.cwd()) {
    this.root = projectRoot;
    this.state = 'red'; // red -> green -> refactor
  }

  // Step 1: Write failing tests
  async writeFailing(feature, testFile) {
    console.log('🔴 RED: Writing failing tests...\n');

    if (!fs.existsSync(testFile)) {
      console.error(`Test file not found: ${testFile}`);
      return false;
    }

    // Run tests (should fail)
    const result = this.runTests();

    if (result.passed) {
      console.error('⚠️  TDD Violation: Tests are passing but they should fail!');
      console.error('Write tests that verify the feature before implementing it.');
      return false;
    }

    console.log('✓ Tests are failing as expected');
    console.log(`  Failed: ${result.failed}`);
    this.state = 'red';
    return true;
  }

  // Step 2: Implement to make tests pass
  async implementGreen(implementationFile) {
    console.log('\n🟢 GREEN: Implementing feature...\n');

    if (this.state !== 'red') {
      console.error('⚠️  TDD Violation: Must have failing tests first (RED phase)');
      return false;
    }

    // Implementation happens here (Claude writes code)
    // After implementation, verify tests pass

    const result = this.runTests();

    if (!result.passed) {
      console.error('✗ Tests still failing after implementation');
      console.error(`  Passed: ${result.passed}, Failed: ${result.failed}`);
      return false;
    }

    console.log('✓ All tests passing!');
    console.log(`  Total: ${result.total}`);
    this.state = 'green';
    return true;
  }

  // Step 3: Refactor with safety
  async refactor(files) {
    console.log('\n🔵 REFACTOR: Improving code quality...\n');

    if (this.state !== 'green') {
      console.error('⚠️  TDD Violation: Tests must be green before refactoring');
      return false;
    }

    const beforeTests = this.runTests();

    // Refactoring happens here (Claude improves code)
    // After refactoring, verify tests still pass

    const afterTests = this.runTests();

    if (!afterTests.passed || afterTests.total !== beforeTests.total) {
      console.error('✗ Refactoring broke tests!');
      console.error(`  Before: ${beforeTests.total} total`);
      console.error(`  After: ${afterTests.total} total`);
      console.error('Revert changes and try again');
      return false;
    }

    console.log('✓ Refactoring successful - tests still passing');
    return true;
  }

  runTests() {
    try {
      const output = execSync('npm test 2>&1', {
        cwd: this.root,
        encoding: 'utf8'
      });

      // Parse test output
      const passMatch = output.match(/(\d+)\s+passing/);
      const failMatch = output.match(/(\d+)\s+failing/);

      const passed = passMatch ? parseInt(passMatch[1]) : 0;
      const failed = failMatch ? parseInt(failMatch[1]) : 0;

      return {
        passed: failed === 0,
        total: passed + failed,
        failed,
        output
      };

    } catch (error) {
      // Tests failed
      const output = error.stdout || error.stderr || '';
      const failMatch = output.match(/(\d+)\s+failing/);
      const passMatch = output.match(/(\d+)\s+passing/);

      const passed = passMatch ? parseInt(passMatch[1]) : 0;
      const failed = failMatch ? parseInt(failMatch[1]) : 0;

      return {
        passed: false,
        total: passed + failed,
        failed,
        output
      };
    }
  }

  // Full TDD cycle
  async cycle(feature, testFile, implementationFile) {
    console.log('=== TDD CYCLE START ===');
    console.log(`Feature: ${feature}\n`);

    // RED
    const redOk = await this.writeFailing(feature, testFile);
    if (!redOk) return false;

    // GREEN
    const greenOk = await this.implementGreen(implementationFile);
    if (!greenOk) return false;

    // REFACTOR
    console.log('\n✓ TDD Cycle Complete');
    console.log('Ready for refactor phase if needed\n');

    return true;
  }

  // Generate test template
  static generateTestTemplate(feature, acceptance) {
    return `
describe('${feature}', () => {
${acceptance.map(criterion => `
  it('should ${criterion}', () => {
    // TODO: Write test
    expect(true).toBe(false); // Failing test
  });
`).join('\n')}
});
`.trim();
  }

  // Verify TDD compliance
  verifyCoverage(threshold = 90) {
    try {
      const coverageFile = path.join(this.root, 'coverage', 'coverage-summary.json');

      if (!fs.existsSync(coverageFile)) {
        console.error('No coverage report found. Run: npm test -- --coverage');
        return false;
      }

      const coverage = JSON.parse(fs.readFileSync(coverageFile, 'utf8'));
      const total = coverage.total;

      console.log('\n📊 Coverage Report:');
      console.log(`  Lines: ${total.lines.pct}%`);
      console.log(`  Branches: ${total.branches.pct}%`);
      console.log(`  Functions: ${total.functions.pct}%`);
      console.log(`  Statements: ${total.statements.pct}%`);

      const passed = total.lines.pct >= threshold &&
                     total.branches.pct >= threshold &&
                     total.functions.pct >= threshold;

      if (passed) {
        console.log(`\n✓ Coverage above ${threshold}% threshold`);
      } else {
        console.log(`\n✗ Coverage below ${threshold}% threshold`);
      }

      return passed;

    } catch (error) {
      console.error('Error reading coverage:', error.message);
      return false;
    }
  }
}

// CLI
if (require.main === module) {
  const command = process.argv[2];

  const workflow = new TDDWorkflow();

  if (command === 'template') {
    const feature = process.argv[3] || 'Feature Name';
    const acceptance = process.argv.slice(4);

    if (acceptance.length === 0) {
      console.log('Usage: tdd-workflow.js template "Feature" "criterion1" "criterion2" ...');
      process.exit(1);
    }

    console.log(TDDWorkflow.generateTestTemplate(feature, acceptance));

  } else if (command === 'verify') {
    const threshold = parseInt(process.argv[3]) || 90;
    const passed = workflow.verifyCoverage(threshold);
    process.exit(passed ? 0 : 1);

  } else if (command === 'status') {
    const result = workflow.runTests();
    console.log(`Tests: ${result.passed ? 'PASSING' : 'FAILING'}`);
    console.log(`Total: ${result.total} | Failed: ${result.failed}`);
    process.exit(result.passed ? 0 : 1);

  } else {
    console.log('TDD Workflow Automation');
    console.log('\nUsage:');
    console.log('  tdd-workflow.js template "Feature" "criterion1" "criterion2"');
    console.log('  tdd-workflow.js verify [threshold]');
    console.log('  tdd-workflow.js status');
  }
}

module.exports = TDDWorkflow;
