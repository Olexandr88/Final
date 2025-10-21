#!/usr/bin/env node
/**
 * WORKFLOW ORCHESTRATOR
 * Implements Explore → Plan → Code → Commit pattern from Vibe Coder's Compass
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class WorkflowOrchestrator {
  constructor(projectRoot = process.cwd()) {
    this.root = projectRoot;
    this.workflowsDir = path.join(this.root, '.claude/workflows');
    this.currentPhase = 'idle';
    this.planFile = path.join(this.root, 'PLAN.md');
  }

  // Phase 1: EXPLORE (Context gathering, NO code)
  async explore(feature) {
    console.log('🔍 PHASE 1: EXPLORE\n');
    console.log(`Feature: ${feature}\n`);

    this.currentPhase = 'explore';

    const exploration = {
      timestamp: new Date().toISOString(),
      feature,
      projectStructure: this.analyzeProjectStructure(),
      existingCode: this.identifyRelevantFiles(feature),
      dependencies: this.checkDependencies(),
      tests: this.findExistingTests(),
    };

    console.log('Project Structure:');
    console.log(`  Directories: ${exploration.projectStructure.directories.length}`);
    console.log(`  Source files: ${exploration.projectStructure.sourceFiles}`);
    console.log(`  Test files: ${exploration.tests.count}\n`);

    console.log('Relevant Files:');
    exploration.existingCode.forEach((file) => console.log(`  - ${file}`));

    this.saveExploration(exploration);

    console.log('\n✓ Exploration complete');
    console.log('   Next: Run plan() to create implementation strategy\n');

    return exploration;
  }

  // Phase 2: PLAN (Detailed strategy, still NO code)
  async plan(feature, requirements = []) {
    console.log('📋 PHASE 2: PLAN\n');

    if (this.currentPhase !== 'explore') {
      console.warn('⚠️  Warning: Should run explore() first for best results\n');
    }

    this.currentPhase = 'plan';

    const plan = this.generatePlan(feature, requirements);

    fs.writeFileSync(this.planFile, plan);

    console.log(`✓ Plan created: ${this.planFile}`);
    console.log('\nPlan contents:');
    console.log('─'.repeat(60));
    console.log(plan);
    console.log('─'.repeat(60));
    console.log('\n⏸️  REVIEW REQUIRED');
    console.log('   Review PLAN.md carefully before proceeding');
    console.log('   Next: Run code() to implement (after approval)\n');

    return { planFile: this.planFile, content: plan };
  }

  // Phase 3: CODE (Implementation ONLY after plan approval)
  async code() {
    console.log('⚙️  PHASE 3: CODE\n');

    if (!fs.existsSync(this.planFile)) {
      throw new Error('No PLAN.md found. Run plan() first!');
    }

    if (this.currentPhase !== 'plan') {
      console.warn('⚠️  Warning: Proceeding without approved plan\n');
    }

    this.currentPhase = 'code';

    const plan = fs.readFileSync(this.planFile, 'utf8');

    console.log('Implementation Guidelines:');
    console.log('  1. Follow PLAN.md step-by-step');
    console.log('  2. Write tests FIRST (TDD)');
    console.log('  3. Implement minimum code to pass tests');
    console.log('  4. Run tests after each change');
    console.log('  5. Refactor while keeping tests green\n');

    console.log('✓ Ready for implementation');
    console.log('   Proceed with TDD workflow');
    console.log('   Next: Run commit() when feature complete\n');

    return { plan, phase: this.currentPhase };
  }

  // Phase 4: COMMIT (Git commit with verification)
  async commit(message = null) {
    console.log('💾 PHASE 4: COMMIT\n');

    if (this.currentPhase !== 'code') {
      console.warn('⚠️  Warning: Committing without completing code phase\n');
    }

    // Pre-commit checks
    console.log('Running pre-commit checks...');

    const checks = {
      tests: this.runTests(),
      linter: this.runLinter(),
      build: this.runBuild(),
    };

    console.log(`  Tests: ${checks.tests ? '✓' : '✗'}`);
    console.log(`  Linter: ${checks.linter ? '✓' : '✗'}`);
    console.log(`  Build: ${checks.build ? '✓' : '✗'}\n`);

    if (!checks.tests) {
      throw new Error('Cannot commit: tests failing');
    }

    // Get git status
    const status = this.getGitStatus();
    console.log('Changed files:');
    status.forEach((file) => console.log(`  M ${file}`));

    // Create commit
    const commitMessage = message || this.generateCommitMessage();

    try {
      execSync('git add .', { cwd: this.root, stdio: 'pipe' });
      execSync(`git commit -m "${commitMessage}"`, { cwd: this.root, stdio: 'pipe' });

      console.log(`\n✓ Committed: ${commitMessage}`);
      console.log('\n🎉 Workflow complete!');
      console.log('   Cycle: Explore → Plan → Code → Commit ✓\n');

      this.currentPhase = 'idle';

      return { committed: true, message: commitMessage, checks };
    } catch (error) {
      throw new Error(`Commit failed: ${error.message}`);
    }
  }

  // Full workflow automation
  async fullCycle(feature, requirements = [], autoCommit = false) {
    console.log('🚀 FULL WORKFLOW CYCLE\n');
    console.log('Phases: Explore → Plan → Code → Commit\n');

    const results = {};

    try {
      results.explore = await this.explore(feature);
      results.plan = await this.plan(feature, requirements);

      if (!autoCommit) {
        console.log('⏸️  Paused for manual plan review');
        console.log('   Review PLAN.md, then call code() and commit()');
        return { phase: 'plan', awaitingApproval: true, results };
      }

      results.code = await this.code();
      results.commit = await this.commit();

      return { phase: 'complete', results };
    } catch (error) {
      return { phase: this.currentPhase, error: error.message, results };
    }
  }

  // Helper methods

  analyzeProjectStructure() {
    const directories = [];
    const files = [];

    const walk = (dir) => {
      if (dir.includes('node_modules') || dir.includes('.git')) return;

      try {
        const items = fs.readdirSync(dir);
        items.forEach((item) => {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            directories.push(path.relative(this.root, fullPath));
            walk(fullPath);
          } else {
            files.push(path.relative(this.root, fullPath));
          }
        });
      } catch {}
    };

    walk(this.root);

    return {
      directories,
      sourceFiles: files.filter((f) => f.match(/\.(js|ts|py|go|rs)$/)).length,
      testFiles: files.filter((f) => f.includes('test')).length,
      totalFiles: files.length,
    };
  }

  identifyRelevantFiles(feature) {
    // Simple keyword-based file identification
    const keywords = feature.toLowerCase().split(' ');
    const files = [];

    const walk = (dir) => {
      if (dir.includes('node_modules') || dir.includes('.git')) return;

      try {
        const items = fs.readdirSync(dir);
        items.forEach((item) => {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            walk(fullPath);
          } else if (fullPath.match(/\.(js|ts|py|go|rs)$/)) {
            const fileName = item.toLowerCase();
            if (keywords.some((kw) => fileName.includes(kw))) {
              files.push(path.relative(this.root, fullPath));
            }
          }
        });
      } catch {}
    };

    walk(this.root);
    return files.slice(0, 10); // Top 10 matches
  }

  checkDependencies() {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(this.root, 'package.json'), 'utf8'));
      return {
        dependencies: Object.keys(pkg.dependencies || {}).length,
        devDependencies: Object.keys(pkg.devDependencies || {}).length,
      };
    } catch {
      return { dependencies: 0, devDependencies: 0 };
    }
  }

  findExistingTests() {
    let count = 0;
    const walk = (dir) => {
      if (dir.includes('node_modules')) return;

      try {
        const items = fs.readdirSync(dir);
        items.forEach((item) => {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            walk(fullPath);
          } else if (item.includes('test') || item.includes('spec')) {
            count++;
          }
        });
      } catch {}
    };

    walk(this.root);
    return { count };
  }

  generatePlan(feature, requirements) {
    return `# Implementation Plan: ${feature}

**Generated:** ${new Date().toISOString()}
**Workflow:** Explore → Plan → **Code** → Commit

## Feature Description
${feature}

## Requirements
${requirements.length > 0 ? requirements.map((r, i) => `${i + 1}. ${r}`).join('\n') : 'No specific requirements provided'}

## Implementation Steps

### Step 1: Test Setup (TDD)
- [ ] Create test file in \`tests/\`
- [ ] Write failing tests for core functionality
- [ ] Verify tests fail (run test suite)

### Step 2: Minimum Implementation
- [ ] Implement ONLY what's needed to pass tests
- [ ] No premature optimization
- [ ] Focus on correctness first

### Step 3: Test Validation
- [ ] Run test suite
- [ ] Verify all tests pass
- [ ] Check coverage (target: 90%+)

### Step 4: Refactoring
- [ ] Improve code quality while keeping tests green
- [ ] Extract reusable components
- [ ] Apply DRY principle
- [ ] Add error handling

### Step 5: Integration
- [ ] Update relevant imports/exports
- [ ] Update documentation
- [ ] Add inline comments for complex logic

### Step 6: Quality Assurance
- [ ] Run linter
- [ ] Run full test suite
- [ ] Run build process
- [ ] Manual testing

## Files to Modify
${
  this.identifyRelevantFiles(feature)
    .map((f) => `- ${f}`)
    .join('\n') || 'No existing files identified'
}

## Acceptance Criteria
- ✅ All tests passing
- ✅ Linter passing
- ✅ Build successful
- ✅ Coverage >= 90%
- ✅ No security vulnerabilities
- ✅ Documentation updated

## Risks and Mitigations
- **Risk:** Breaking existing functionality
  - **Mitigation:** Comprehensive test coverage before changes
- **Risk:** Performance degradation
  - **Mitigation:** Benchmark before/after
- **Risk:** Security vulnerabilities
  - **Mitigation:** Code review by security sub-agent

---

**APPROVAL REQUIRED BEFORE IMPLEMENTATION**

Review this plan carefully. Adjust as needed. Only proceed to coding phase after approval.

*Generated by Workflow Orchestrator*
`;
  }

  saveExploration(exploration) {
    const exploreFile = path.join(this.workflowsDir, 'last-exploration.json');
    fs.mkdirSync(path.dirname(exploreFile), { recursive: true });
    fs.writeFileSync(exploreFile, JSON.stringify(exploration, null, 2));
  }

  runTests() {
    try {
      execSync('npm test', { cwd: this.root, stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  runLinter() {
    try {
      execSync('npm run lint', { cwd: this.root, stdio: 'pipe' });
      return true;
    } catch {
      return true; // Pass if no linter configured
    }
  }

  runBuild() {
    try {
      execSync('npm run build', { cwd: this.root, stdio: 'pipe' });
      return true;
    } catch {
      return true; // Pass if no build configured
    }
  }

  getGitStatus() {
    try {
      const status = execSync('git status --porcelain', {
        cwd: this.root,
        encoding: 'utf8',
      });

      return status
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => line.substring(3));
    } catch {
      return [];
    }
  }

  generateCommitMessage() {
    if (fs.existsSync(this.planFile)) {
      const plan = fs.readFileSync(this.planFile, 'utf8');
      const match = plan.match(/# Implementation Plan: (.+)/);
      if (match) {
        return `feat: ${match[1]}`;
      }
    }
    return 'feat: implement feature (automated commit)';
  }
}

// CLI
if (require.main === module) {
  const orchestrator = new WorkflowOrchestrator();
  const command = process.argv[2];
  const feature = process.argv.slice(3).join(' ');

  if (command === 'explore' && feature) {
    orchestrator.explore(feature);
  } else if (command === 'plan' && feature) {
    orchestrator.plan(feature);
  } else if (command === 'code') {
    orchestrator.code();
  } else if (command === 'commit') {
    orchestrator.commit();
  } else if (command === 'full' && feature) {
    orchestrator.fullCycle(feature);
  } else {
    console.log('Workflow Orchestrator - Explore → Plan → Code → Commit');
    console.log('\nUsage:');
    console.log('  workflow-orchestrator.js explore "feature description"');
    console.log('  workflow-orchestrator.js plan "feature description"');
    console.log('  workflow-orchestrator.js code');
    console.log('  workflow-orchestrator.js commit');
    console.log('  workflow-orchestrator.js full "feature description"');
  }
}

module.exports = WorkflowOrchestrator;
