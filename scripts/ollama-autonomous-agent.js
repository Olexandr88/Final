#!/usr/bin/env node
/**
 * Ollama Autonomous Coding Agent
 * Autonomously resolves GitHub issues and creates PRs using local Ollama LLM
 *
 * FREE - No API keys required! Runs 100% locally with Ollama
 *
 * Models: codellama (best for code), deepseek-coder, llama2
 */

import 'dotenv/config';
import { Octokit } from '@octokit/rest';
import { readFile, writeFile } from 'fs/promises';
import { logger } from '../src/utils/logger.js';

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'codellama';
const MAX_TOKENS = 2048; // Ollama context limit for speed

class OllamaAutonomousAgent {
  constructor() {
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
    });

    this.owner = 'scarmonit';
    this.repo = 'Final';
    this.baseBranch = 'Scarmonit';

    logger.info(`🦙 Ollama Model: ${MODEL}`);
    logger.info(`🌐 Ollama URL: ${OLLAMA_URL}`);
  }

  /**
   * Call Ollama API with retry logic
   */
  async callOllama(prompt, options = {}) {
    const maxRetries = 3;
    let lastError;

    for (let i = 0; i < maxRetries; i++) {
      try {
        logger.info(`🤔 Calling Ollama (attempt ${i + 1}/${maxRetries})...`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min timeout

        const response = await fetch(`${OLLAMA_URL}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: MODEL,
            prompt: prompt,
            stream: false,
            options: {
              temperature: options.temperature || 0.7,
              top_p: 0.9,
              top_k: 40,
              num_predict: options.maxTokens || MAX_TOKENS,
              num_ctx: 4096,
              num_thread: 8,
            },
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Ollama API error: ${response.status}`);
        }

        const result = await response.json();
        logger.info(`✅ Ollama responded (${result.response.length} chars)`);

        return result.response;
      } catch (error) {
        lastError = error;
        logger.warn(`⚠️  Attempt ${i + 1} failed: ${error.message}`);

        if (i < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000 * (i + 1)));
        }
      }
    }

    throw new Error(`Ollama failed after ${maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Main autonomous loop - fetch and solve issues
   */
  async run() {
    logger.info('🦙 Ollama Autonomous Agent Starting...');
    logger.info(`📦 Repository: ${this.owner}/${this.repo}`);

    try {
      // Check if Ollama is running
      await this.checkOllama();

      // Get all open issues
      const { data: issues } = await this.octokit.issues.listForRepo({
        owner: this.owner,
        repo: this.repo,
        state: 'open',
        per_page: 100,
      });

      logger.info(`📋 Found ${issues.length} open issues`);

      // Filter for issues without PRs and not assigned to Copilot
      const targetIssues = issues.filter(
        (issue) => !issue.pull_request && !issue.assignees.some((a) => a.login === 'Copilot')
      );

      logger.info(`🎯 Targeting ${targetIssues.length} issues for autonomous resolution\n`);

      for (const issue of targetIssues.slice(0, 5)) {
        // Limit to 5 to avoid overwhelming
        await this.solveIssue(issue);
      }

      logger.info('\n✅ Autonomous agent cycle complete!');
    } catch (error) {
      logger.error('❌ Agent error:', { error: error.message });
      throw error;
    }
  }

  /**
   * Check if Ollama is running and model is available
   */
  async checkOllama() {
    try {
      logger.info('🔍 Checking Ollama availability...');

      const response = await fetch(`${OLLAMA_URL}/api/tags`);
      if (!response.ok) {
        throw new Error('Ollama not responding');
      }

      const data = await response.json();
      const modelExists = data.models.some((m) => m.name.includes(MODEL));

      if (!modelExists) {
        logger.warn(`⚠️  Model ${MODEL} not found. Available models:`);
        data.models.forEach((m) => logger.info(`   - ${m.name}`));
        throw new Error(`Model ${MODEL} not installed. Run: ollama pull ${MODEL}`);
      }

      logger.info(`✅ Ollama is running with model: ${MODEL}`);
    } catch (error) {
      logger.error('❌ Ollama check failed:', error.message);
      logger.info('\n📖 To fix this:');
      logger.info('   1. Install Ollama: https://ollama.com/download');
      logger.info('   2. Start Ollama: ollama serve');
      logger.info(`   3. Pull model: ollama pull ${MODEL}`);
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
      // Step 1: Analyze issue with Ollama
      logger.info('🧠 Analyzing issue with Ollama...');
      const analysis = await this.analyzeIssue(issue);

      logger.info('📝 Solution plan generated');
      logger.info(`   Complexity: ${analysis.complexity}`);
      logger.info(`   Approach: ${analysis.approach}`);

      // Step 2: Generate code solution
      logger.info('\n💻 Generating code solution...');
      const solution = await this.generateSolution(issue, analysis);

      logger.info(`   Solution length: ${solution.length} chars`);

      // Step 3: Create PR with solution
      const branchName = `ollama/issue-${issue.number}-${this.slugify(issue.title)}`;
      logger.info(`\n🌿 Creating branch: ${branchName}`);

      await this.createIssuePR(issue, branchName, solution, analysis);

      logger.info(`✅ Issue #${issue.number} solved! PR created.`);
    } catch (error) {
      logger.error(`❌ Failed to solve issue #${issue.number}:`, { error: error.message });

      // Comment on issue about failure
      await this.octokit.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: issue.number,
        body: `🦙 **Ollama Autonomous Agent** attempted to solve this issue but encountered an error:\n\n\`\`\`\n${error.message}\n\`\`\`\n\nManual intervention may be required.`,
      });
    }
  }

  /**
   * Analyze issue and create solution plan using Ollama
   */
  async analyzeIssue(issue) {
    const prompt = `You are an expert software engineer analyzing a GitHub issue.

ISSUE #${issue.number}: ${issue.title}

DESCRIPTION:
${issue.body || 'No description provided'}

LABELS: ${issue.labels.map((l) => l.name).join(', ')}

TASK: Analyze this issue and provide a solution approach.

Respond in this EXACT format:
COMPLEXITY: [low/medium/high]
APPROACH: [brief 1-sentence approach]
FILES: [comma-separated list of files to create/modify, e.g. src/file1.js,src/file2.js]
STEPS:
1. [First step]
2. [Second step]
3. [Third step]

Keep your response concise and structured exactly as shown above.`;

    const response = await this.callOllama(prompt, { maxTokens: 512 });

    // Parse response
    const complexityMatch = response.match(/COMPLEXITY:\s*(\w+)/i);
    const approachMatch = response.match(/APPROACH:\s*(.+?)(?:\n|FILES:)/is);
    const filesMatch = response.match(/FILES:\s*(.+?)(?:\n|STEPS:)/is);
    const stepsMatch = response.match(/STEPS:\s*([\s\S]+)/i);

    return {
      complexity: complexityMatch ? complexityMatch[1].toLowerCase() : 'medium',
      approach: approachMatch ? approachMatch[1].trim() : 'Create solution step by step',
      files: filesMatch ? filesMatch[1].split(',').map((f) => f.trim()) : [],
      steps: stepsMatch
        ? stepsMatch[1]
            .trim()
            .split('\n')
            .filter((s) => s.trim())
        : [],
      rawAnalysis: response,
    };
  }

  /**
   * Generate code solution using Ollama
   */
  async generateSolution(issue, analysis) {
    const prompt = `You are an expert software engineer implementing a solution.

ISSUE: ${issue.title}
${issue.body || ''}

SOLUTION APPROACH:
${analysis.approach}

STEPS:
${analysis.steps.join('\n')}

CODE REQUIREMENTS:
- Use ES modules (import/export, NOT require)
- Include comprehensive error handling
- Add JSDoc comments
- Use async/await for async operations
- Follow clean code principles

TASK: Generate the complete code solution. If creating a new file, provide the full file content. If modifying existing code, provide the complete modified version.

Output ONLY the code, no explanations. Start with a comment indicating the file path.`;

    const solution = await this.callOllama(prompt, {
      maxTokens: 2048,
      temperature: 0.5, // Lower temperature for more consistent code
    });

    return solution;
  }

  /**
   * Create branch and PR with solution
   */
  async createIssuePR(issue, branchName, solution, analysis) {
    try {
      // Get base branch ref
      const { data: ref } = await this.octokit.git.getRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${this.baseBranch}`,
      });

      // Create new branch
      try {
        await this.octokit.git.createRef({
          owner: this.owner,
          repo: this.repo,
          ref: `refs/heads/${branchName}`,
          sha: ref.object.sha,
        });
      } catch (error) {
        if (error.status === 422) {
          // Branch already exists, that's okay
          logger.info('   Branch already exists, updating...');
        } else {
          throw error;
        }
      }

      // Determine file path from solution or analysis
      let filePath = 'solution.js';

      // Try to extract file path from solution comment
      const filePathMatch = solution.match(
        /\/\/\s*(?:File:|Path:)?\s*([^\n]+\.(?:js|ts|json|md))/i
      );
      if (filePathMatch) {
        filePath = filePathMatch[1].trim();
      } else if (analysis.files && analysis.files.length > 0) {
        filePath = analysis.files[0];
      }

      logger.info(`   Creating file: ${filePath}`);

      // Create/update file
      let fileSha;
      try {
        const { data: existingFile } = await this.octokit.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path: filePath,
          ref: branchName,
        });
        fileSha = existingFile.sha;
      } catch (error) {
        // File doesn't exist, that's fine
      }

      await this.octokit.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path: filePath,
        message: `🦙 Ollama: Implement solution for issue #${issue.number}`,
        content: Buffer.from(solution).toString('base64'),
        branch: branchName,
        sha: fileSha,
      });

      // Create PR
      const { data: pr } = await this.octokit.pulls.create({
        owner: this.owner,
        repo: this.repo,
        title: `🦙 [Ollama] ${issue.title}`,
        head: branchName,
        base: this.baseBranch,
        body: `## 🦙 Autonomous Resolution by Ollama

**Resolves:** #${issue.number}

### 📝 Solution Approach
${analysis.approach}

### 🤖 AI Analysis
**Complexity:** ${analysis.complexity}
**Model:** ${MODEL}

### 📋 Implementation Steps
${analysis.steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

### 📁 Files Modified
- \`${filePath}\`

### ✅ Review Checklist
- [ ] Code follows ES module conventions
- [ ] Error handling is comprehensive
- [ ] Code is well-documented
- [ ] Solution addresses the issue

---
*🦙 Generated with Ollama (${MODEL}) - 100% FREE, runs locally!*

Co-Authored-By: Ollama <noreply@ollama.com>`,
      });

      logger.info(`✅ PR created: #${pr.number} - ${pr.html_url}`);

      // Comment on issue
      await this.octokit.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: issue.number,
        body: `🦙 **Ollama Autonomous Agent** (${MODEL}) has created PR #${pr.number} to resolve this issue.\n\nReview at: ${pr.html_url}\n\n*Using local Ollama - no API costs!*`,
      });
    } catch (error) {
      logger.error('❌ Failed to create PR:', { error: error.message });
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

// Check if Ollama is running before starting
async function checkOllamaRunning() {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!response.ok) throw new Error('Not running');
    return true;
  } catch (error) {
    logger.error('❌ Ollama is not running!');
    logger.info('\n📖 Quick Start:');
    logger.info('   1. Install Ollama: https://ollama.com/download');
    logger.info('   2. Start Ollama: ollama serve (in separate terminal)');
    logger.info('   3. Pull a code model:');
    logger.info('      ollama pull codellama     (best for code, 7B params)');
    logger.info('      ollama pull deepseek-coder (alternative, 6.7B params)');
    logger.info('      ollama pull llama2         (general purpose, 7B params)');
    logger.info('\n   4. Set model in .env (optional):');
    logger.info('      OLLAMA_MODEL=codellama');
    logger.info('\n   5. Run this agent again:');
    logger.info('      npm run agent:ollama-autonomous\n');
    process.exit(1);
  }
}

// Main execution
(async () => {
  await checkOllamaRunning();

  const agent = new OllamaAutonomousAgent();
  await agent.run();
})().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
