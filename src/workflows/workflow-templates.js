/**
 * Workflow Templates
 * Implements Explore-Plan-Code-Commit and other development workflows
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export class WorkflowTemplates {
  constructor(options = {}) {
    this.workflowDir = options.workflowDir || path.join(process.cwd(), '.workflows');
    this.workflowHistory = [];
  }

  /**
   * Explore-Plan-Code-Commit workflow
   */
  async explorePlanCodeCommit(spec) {
    const { feature, exploration = {}, planning = {}, implementation = {}, commit = {} } = spec;

    console.log(`\n╔═══════════════════════════════════════╗`);
    console.log(`║  Explore → Plan → Code → Commit      ║`);
    console.log(`║  Feature: ${feature.padEnd(27)}║`);
    console.log(`╚═══════════════════════════════════════╝\n`);

    const workflow = {
      feature,
      phases: {},
      startTime: Date.now(),
    };

    try {
      // Phase 1: EXPLORE
      workflow.phases.explore = await this.explore({
        feature,
        ...exploration,
      });

      // Phase 2: PLAN
      workflow.phases.plan = await this.plan({
        feature,
        context: workflow.phases.explore,
        ...planning,
      });

      // Phase 3: CODE
      workflow.phases.code = await this.code({
        feature,
        plan: workflow.phases.plan,
        ...implementation,
      });

      // Phase 4: COMMIT
      workflow.phases.commit = await this.commit({
        feature,
        changes: workflow.phases.code,
        ...commit,
      });

      workflow.endTime = Date.now();
      workflow.duration = workflow.endTime - workflow.startTime;
      workflow.success = true;

      this.workflowHistory.push(workflow);

      console.log(`\n✅ Workflow Complete: ${feature}`);
      console.log(`⏱  Duration: ${Math.round(workflow.duration / 1000)}s\n`);

      return workflow;
    } catch (error) {
      workflow.error = error.message;
      workflow.success = false;

      console.error(`\n❌ Workflow Failed: ${error.message}\n`);

      return workflow;
    }
  }

  /**
   * Phase 1: Explore codebase and gather context
   */
  async explore(spec) {
    const { feature, files = [], directories = [], keywords = [] } = spec;

    console.log(`\n🔍 EXPLORE: Gathering context for ${feature}\n`);

    const context = {
      files: {},
      structure: {},
      dependencies: [],
      patterns: [],
    };

    // Read specified files
    for (const file of files) {
      const filePath = path.join(process.cwd(), file);
      if (fs.existsSync(filePath)) {
        context.files[file] = await fs.promises.readFile(filePath, 'utf-8');
      }
    }

    // Analyze directory structure
    for (const dir of directories) {
      const dirPath = path.join(process.cwd(), dir);
      if (fs.existsSync(dirPath)) {
        context.structure[dir] = this._analyzeDirectory(dirPath);
      }
    }

    // Search for keywords
    for (const keyword of keywords) {
      try {
        const results = execSync(`git grep -n "${keyword}"`, {
          cwd: process.cwd(),
          encoding: 'utf-8',
        });
        context.patterns.push({
          keyword,
          matches: results.split('\n').filter(Boolean),
        });
      } catch (error) {
        // No matches found
      }
    }

    console.log(`✓ Explored ${Object.keys(context.files).length} files`);
    console.log(`✓ Analyzed ${Object.keys(context.structure).length} directories`);
    console.log(`✓ Found ${context.patterns.length} pattern matches\n`);

    return context;
  }

  /**
   * Phase 2: Create detailed implementation plan
   */
  async plan(spec) {
    const { feature, context, requirements = [], constraints = [] } = spec;

    console.log(`\n📋 PLAN: Creating implementation plan for ${feature}\n`);

    const plan = {
      feature,
      overview: '',
      steps: [],
      files: {
        toCreate: [],
        toModify: [],
        toDelete: [],
      },
      risks: [],
      dependencies: [],
      estimatedTime: null,
    };

    // Generate plan structure
    plan.overview = `Implementation plan for ${feature}`;

    // Default planning steps (would be enhanced with AI)
    plan.steps = [
      'Analyze existing codebase structure',
      'Design new components/modules',
      'Implement core functionality',
      'Add error handling',
      'Write tests',
      'Update documentation',
    ];

    // Save plan to file
    const planPath = path.join(this.workflowDir, `PLAN-${Date.now()}.md`);
    await fs.promises.mkdir(this.workflowDir, { recursive: true });

    const planContent = this._formatPlan(plan);
    await fs.promises.writeFile(planPath, planContent, 'utf-8');

    console.log(`✓ Plan created: ${planPath}\n`);

    return {
      ...plan,
      planPath,
    };
  }

  /**
   * Phase 3: Implement according to plan
   */
  async code(spec) {
    const { feature, plan, files = [] } = spec;

    console.log(`\n💻 CODE: Implementing ${feature}\n`);

    const implementation = {
      filesCreated: [],
      filesModified: [],
      linesAdded: 0,
      linesRemoved: 0,
    };

    // Execute implementation (placeholder - would integrate with actual code generation)
    for (const file of files) {
      const { path: filePath, content, action = 'create' } = file;
      const fullPath = path.join(process.cwd(), filePath);

      if (action === 'create') {
        await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.promises.writeFile(fullPath, content, 'utf-8');
        implementation.filesCreated.push(filePath);
        implementation.linesAdded += content.split('\n').length;
      } else if (action === 'modify') {
        const original = fs.existsSync(fullPath)
          ? await fs.promises.readFile(fullPath, 'utf-8')
          : '';
        await fs.promises.writeFile(fullPath, content, 'utf-8');
        implementation.filesModified.push(filePath);
        implementation.linesAdded += content.split('\n').length;
        implementation.linesRemoved += original.split('\n').length;
      }
    }

    console.log(`✓ Created ${implementation.filesCreated.length} files`);
    console.log(`✓ Modified ${implementation.filesModified.length} files`);
    console.log(`✓ +${implementation.linesAdded} -${implementation.linesRemoved} lines\n`);

    return implementation;
  }

  /**
   * Phase 4: Commit changes with descriptive message
   */
  async commit(spec) {
    const { feature, changes, message, type = 'feat' } = spec;

    console.log(`\n💾 COMMIT: Committing ${feature}\n`);

    // Generate commit message
    const commitMessage = message || this._generateCommitMessage(feature, changes, type);

    try {
      // Stage all changes
      execSync('git add .', { cwd: process.cwd(), stdio: 'inherit' });

      // Create commit
      execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, {
        cwd: process.cwd(),
        stdio: 'inherit',
      });

      // Get commit hash
      const hash = execSync('git rev-parse HEAD', {
        cwd: process.cwd(),
        encoding: 'utf-8',
      }).trim();

      console.log(`✓ Committed: ${hash.substring(0, 7)}\n`);

      return {
        hash,
        message: commitMessage,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error(`Failed to commit: ${error.message}`);
      throw error;
    }
  }

  /**
   * Format plan as markdown
   */
  _formatPlan(plan) {
    let content = `# Implementation Plan: ${plan.feature}\n\n`;
    content += `## Overview\n\n${plan.overview}\n\n`;

    content += `## Steps\n\n`;
    plan.steps.forEach((step, i) => {
      content += `${i + 1}. ${step}\n`;
    });
    content += '\n';

    if (plan.files.toCreate.length > 0) {
      content += `## Files to Create\n\n`;
      plan.files.toCreate.forEach((file) => {
        content += `- ${file}\n`;
      });
      content += '\n';
    }

    if (plan.files.toModify.length > 0) {
      content += `## Files to Modify\n\n`;
      plan.files.toModify.forEach((file) => {
        content += `- ${file}\n`;
      });
      content += '\n';
    }

    if (plan.risks.length > 0) {
      content += `## Risks\n\n`;
      plan.risks.forEach((risk) => {
        content += `- ${risk}\n`;
      });
      content += '\n';
    }

    return content;
  }

  /**
   * Generate commit message
   */
  _generateCommitMessage(feature, changes, type) {
    const summary = `${type}: ${feature}`;

    const details = [];
    if (changes.filesCreated?.length > 0) {
      details.push(`Created ${changes.filesCreated.length} file(s)`);
    }
    if (changes.filesModified?.length > 0) {
      details.push(`Modified ${changes.filesModified.length} file(s)`);
    }
    if (changes.linesAdded > 0) {
      details.push(`+${changes.linesAdded} lines`);
    }

    return `${summary}\n\n${details.join(', ')}`;
  }

  /**
   * Analyze directory structure
   */
  _analyzeDirectory(dirPath) {
    const files = fs.readdirSync(dirPath);

    return {
      files: files.filter((f) => {
        const stat = fs.statSync(path.join(dirPath, f));
        return stat.isFile();
      }),
      directories: files.filter((f) => {
        const stat = fs.statSync(path.join(dirPath, f));
        return stat.isDirectory();
      }),
    };
  }

  /**
   * Get workflow history
   */
  getHistory() {
    return this.workflowHistory;
  }
}

export default WorkflowTemplates;
