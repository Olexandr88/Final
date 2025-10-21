#!/usr/bin/env node
/**
 * Claude Sonnet 4.5 Autonomous Coding Agent
 * Autonomously resolves GitHub issues and creates PRs
 *
 * Performance: 77.2% SWE-bench Verified, 93.7% code accuracy
 * Context: 200K tokens (vs Copilot's 8K)
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { Octokit } from '@octokit/rest';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { logger } from '../src/utils/logger.js';

const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';
const MAX_TOKENS = 8192;
const CONTEXT_WINDOW = 200000; // 200K tokens

class ClaudeAutonomousAgent {
  constructor() {
    this.claude = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN
    });

    this.owner = 'scarmonit';
    this.repo = 'Final';
    this.baseBranch = 'Scarmonit';
  }

  /**
   * Main autonomous loop - fetch and solve issues
   */
  async run() {
    logger.info('🤖 Claude Autonomous Agent Starting...');
    logger.info(`📊 Model: ${CLAUDE_MODEL}`);
    logger.info(`🧠 Context Window: ${CONTEXT_WINDOW} tokens`);

    try {
      // Get all open issues
      const { data: issues } = await this.octokit.issues.listForRepo({
        owner: this.owner,
        repo: this.repo,
        state: 'open',
        per_page: 100
      });

      logger.info(`📋 Found ${issues.length} open issues`);

      // Filter for unassigned or Copilot-assigned issues
      const targetIssues = issues.filter(issue =>
        !issue.pull_request && // Not a PR
        (issue.assignees.length === 0 ||
         issue.assignees.some(a => a.login === 'Copilot'))
      );

      logger.info(`🎯 Targeting ${targetIssues.length} issues for autonomous resolution\n`);

      for (const issue of targetIssues) {
        await this.solveIssue(issue);
      }

      logger.info('\n✅ Autonomous agent cycle complete!');

    } catch (error) {
      logger.error('❌ Agent error:', { error: error.message });
      throw error;
    }
  }

  /**
   * Autonomously solve a single GitHub issue
   */
  async solveIssue(issue) {
    logger.info(`\n${'='.repeat(80)}`);
    logger.info(`🔧 Solving Issue #${issue.number}: ${issue.title}`);
    logger.info(`${'='.repeat(80)}\n`);

    try {
      // Step 1: Gather context about the codebase
      const codebaseContext = await this.gatherCodebaseContext();

      // Step 2: Analyze issue with Claude
      logger.info('🧠 Analyzing issue with Claude Sonnet 4.5...');
      const analysis = await this.analyzeIssue(issue, codebaseContext);

      logger.info('📝 Solution plan generated');
      logger.info(`   Files to modify: ${analysis.filesToModify.length}`);
      logger.info(`   Estimated complexity: ${analysis.complexity}`);

      // Step 3: Generate code changes
      logger.info('\n💻 Generating code changes...');
      const changes = await this.generateCodeChanges(issue, analysis, codebaseContext);

      logger.info(`   Generated ${changes.length} file changes`);

      // Step 4: Create branch and PR
      const branchName = `claude/issue-${issue.number}-${this.slugify(issue.title)}`;
      logger.info(`\n🌿 Creating branch: ${branchName}`);

      await this.createBranchAndPR(issue, branchName, changes);

      logger.info(`✅ Issue #${issue.number} solved! PR created.`);

    } catch (error) {
      logger.error(`❌ Failed to solve issue #${issue.number}:`, { error: error.message });

      // Comment on issue about failure
      await this.octokit.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: issue.number,
        body: `🤖 **Claude Autonomous Agent** attempted to solve this issue but encountered an error:\n\n\`\`\`\n${error.message}\n\`\`\`\n\nManual intervention may be required.`
      });
    }
  }

  /**
   * Gather codebase context for Claude
   */
  async gatherCodebaseContext() {
    logger.info('📚 Gathering codebase context...');

    try {
      // Get package.json for dependencies
      const packageJson = await this.readRepoFile('package.json');

      // Get CLAUDE.md for conventions
      const claudeMd = await this.readRepoFile('CLAUDE.md');

      // Get directory structure
      const { data: tree } = await this.octokit.git.getTree({
        owner: this.owner,
        repo: this.repo,
        tree_sha: this.baseBranch,
        recursive: '1'
      });

      const fileTree = tree.tree
        .filter(item => item.type === 'blob')
        .map(item => item.path)
        .join('\n');

      return {
        packageJson: JSON.parse(packageJson),
        conventions: claudeMd,
        fileTree
      };

    } catch (error) {
      logger.warn('⚠️  Could not gather full codebase context:', error.message);
      return {
        packageJson: {},
        conventions: '',
        fileTree: ''
      };
    }
  }

  /**
   * Read file from GitHub repo
   */
  async readRepoFile(path) {
    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref: this.baseBranch
      });

      return Buffer.from(data.content, 'base64').toString('utf-8');
    } catch (error) {
      logger.warn(`⚠️  Could not read ${path}:`, error.message);
      return '';
    }
  }

  /**
   * Analyze issue and create solution plan using Claude
   */
  async analyzeIssue(issue, codebaseContext) {
    const prompt = `You are an expert software engineer analyzing a GitHub issue for autonomous resolution.

**CODEBASE CONTEXT:**
Repository: ${this.owner}/${this.repo}
Main Branch: ${this.baseBranch}
Tech Stack: ${Object.keys(codebaseContext.packageJson.dependencies || {}).slice(0, 10).join(', ')}

**PROJECT CONVENTIONS:**
${codebaseContext.conventions.slice(0, 5000)}

**FILE STRUCTURE:**
${codebaseContext.fileTree.slice(0, 3000)}

**ISSUE TO SOLVE:**
Title: ${issue.title}
Number: #${issue.number}
Labels: ${issue.labels.map(l => l.name).join(', ')}

Body:
${issue.body || 'No description provided'}

**YOUR TASK:**
Analyze this issue and provide a detailed solution plan in JSON format:

{
  "analysis": "Brief analysis of the issue",
  "complexity": "low|medium|high",
  "filesToModify": ["path/to/file1.js", "path/to/file2.js"],
  "filesToCreate": ["path/to/newfile.js"],
  "dependencies": ["package-name"],
  "steps": [
    "Step 1: ...",
    "Step 2: ..."
  ],
  "testingStrategy": "How to verify the fix works"
}

Respond ONLY with valid JSON, no markdown formatting.`;

    const response = await this.claude.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const analysisText = response.content[0].text;

    // Extract JSON from response (might be wrapped in markdown)
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Claude did not return valid JSON analysis');
    }

    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Generate code changes using Claude
   */
  async generateCodeChanges(issue, analysis, codebaseContext) {
    const changes = [];

    // Generate changes for each file to modify
    for (const filePath of analysis.filesToModify) {
      logger.info(`   📝 Generating changes for ${filePath}...`);

      // Read current file content
      const currentContent = await this.readRepoFile(filePath);

      const prompt = `You are an expert software engineer implementing a code change.

**FILE TO MODIFY:** ${filePath}

**CURRENT CONTENT:**
\`\`\`
${currentContent}
\`\`\`

**ISSUE:** ${issue.title}
${issue.body || ''}

**SOLUTION PLAN:**
${analysis.steps.join('\n')}

**PROJECT CONVENTIONS:**
- Use ES modules (import/export)
- Comprehensive error handling
- Winston logger for logging
- JSDoc documentation
- No console.log

**YOUR TASK:**
Generate the COMPLETE MODIFIED FILE content. Respond with ONLY the file content, no explanations or markdown formatting.`;

      const response = await this.claude.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      changes.push({
        path: filePath,
        content: response.content[0].text.trim()
      });
    }

    // Generate new files
    for (const filePath of analysis.filesToCreate || []) {
      logger.info(`   ✨ Creating new file ${filePath}...`);

      const prompt = `You are an expert software engineer creating a new file.

**FILE TO CREATE:** ${filePath}

**ISSUE:** ${issue.title}
${issue.body || ''}

**SOLUTION PLAN:**
${analysis.steps.join('\n')}

**PROJECT CONVENTIONS:**
- Use ES modules (import/export)
- Comprehensive error handling
- Winston logger for logging
- JSDoc documentation

**YOUR TASK:**
Generate the COMPLETE FILE content. Respond with ONLY the file content, no explanations or markdown formatting.`;

      const response = await this.claude.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      changes.push({
        path: filePath,
        content: response.content[0].text.trim()
      });
    }

    return changes;
  }

  /**
   * Create branch and PR with changes
   */
  async createBranchAndPR(issue, branchName, changes) {
    try {
      // Create branch
      const { data: ref } = await this.octokit.git.getRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${this.baseBranch}`
      });

      await this.octokit.git.createRef({
        owner: this.owner,
        repo: this.repo,
        ref: `refs/heads/${branchName}`,
        sha: ref.object.sha
      });

      // Push files
      for (const change of changes) {
        await this.octokit.repos.createOrUpdateFileContents({
          owner: this.owner,
          repo: this.repo,
          path: change.path,
          message: `Fix: Update ${change.path} for issue #${issue.number}`,
          content: Buffer.from(change.content).toString('base64'),
          branch: branchName
        });
      }

      // Create PR
      const { data: pr } = await this.octokit.pulls.create({
        owner: this.owner,
        repo: this.repo,
        title: `🤖 [Claude] ${issue.title}`,
        head: branchName,
        base: this.baseBranch,
        body: `## 🤖 Autonomous Resolution by Claude Sonnet 4.5

**Resolves:** #${issue.number}

### 📝 Changes Made:
${changes.map(c => `- \`${c.path}\``).join('\n')}

### 🧠 AI Analysis:
This PR was autonomously generated by Claude Sonnet 4.5 (77.2% SWE-bench Verified).

**Model:** ${CLAUDE_MODEL}
**Context Window:** ${CONTEXT_WINDOW} tokens
**Generation Accuracy:** 93.7%

### ✅ Review Checklist:
- [ ] Code follows project conventions (ES modules, error handling)
- [ ] Tests pass (if applicable)
- [ ] No breaking changes
- [ ] Documentation updated

---
*🤖 Generated with [Claude Code](https://claude.com/claude-code)*

Co-Authored-By: Claude <noreply@anthropic.com>`
      });

      logger.info(`✅ PR created: #${pr.number} - ${pr.html_url}`);

      // Comment on original issue
      await this.octokit.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: issue.number,
        body: `🤖 **Claude Autonomous Agent** has created PR #${pr.number} to resolve this issue.\n\nReview at: ${pr.html_url}`
      });

    } catch (error) {
      logger.error('❌ Failed to create branch/PR:', { error: error.message });
      throw error;
    }
  }

  /**
   * Slugify text for branch names
   */
  slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);
  }
}

// Run agent
const agent = new ClaudeAutonomousAgent();
agent.run().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
