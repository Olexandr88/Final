/**
 * Vercel Serverless Function - Autonomous Agent
 * Uses Cloudflare Workers AI API (remote)
 *
 * Deploy: vercel --prod
 * Endpoints:
 *   GET  /api/health
 *   POST /api/solve
 *   GET  /api/cron (auto-scheduled)
 */

import { Octokit } from '@octokit/rest';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { pathname } = new URL(req.url, `https://${req.headers.host}`);

  // Health check
  if (pathname === '/api/health') {
    return res.json({
      status: 'healthy',
      platform: 'vercel',
      ai: 'cloudflare-workers-ai',
      timestamp: new Date().toISOString(),
    });
  }

  // Cron job (runs daily)
  if (pathname === '/api/cron') {
    console.log('🦙 Running scheduled autonomous agent...');

    try {
      const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

      const { data: issues } = await octokit.issues.listForRepo({
        owner: 'scarmonit',
        repo: 'Final',
        state: 'open',
        per_page: 5,
      });

      const results = [];

      for (const issue of issues.filter((i) => !i.pull_request)) {
        try {
          const result = await solveIssue(issue.number);
          results.push({ issue: issue.number, success: true, result });
        } catch (error) {
          results.push({ issue: issue.number, success: false, error: error.message });
        }
      }

      return res.json({ success: true, processed: results.length, results });
    } catch (error) {
      console.error('Cron error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // Manual solve endpoint
  if (pathname === '/api/solve' && req.method === 'POST') {
    const { issueNumber } = req.body;

    if (!issueNumber) {
      return res.status(400).json({ error: 'issueNumber required' });
    }

    try {
      const result = await solveIssue(issueNumber);
      return res.json({ success: true, issueNumber, result });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  return res.json({
    message: 'Ollama Autonomous Agent on Vercel',
    endpoints: {
      health: 'GET /api/health',
      solve: 'POST /api/solve { issueNumber: 123 }',
      cron: 'GET /api/cron (automated)',
    },
  });
}

/**
 * Solve GitHub issue using Cloudflare Workers AI
 */
async function solveIssue(issueNumber) {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

  // Get issue
  const { data: issue } = await octokit.issues.get({
    owner: 'scarmonit',
    repo: 'Final',
    issue_number: issueNumber,
  });

  console.log(`Solving issue #${issueNumber}: ${issue.title}`);

  // Analyze with Cloudflare AI
  const analysis = await callCloudflareAI(
    `Analyze this GitHub issue and provide solution approach:

ISSUE: ${issue.title}
${issue.body || ''}

Respond: COMPLEXITY: [low/medium/high], APPROACH: [brief approach]`,
    { model: 'llama-2-7b-chat' }
  );

  // Generate solution
  const solution = await callCloudflareAI(
    `Generate code to solve: ${issue.title}

Requirements:
- ES modules
- Error handling
- Clean code

Generate code only:`,
    { model: 'codellama-7b', maxTokens: 2048 }
  );

  // Create PR
  const branchName = `vercel-ai/issue-${issueNumber}`;

  // Get base ref
  const { data: ref } = await octokit.git.getRef({
    owner: 'scarmonit',
    repo: 'Final',
    ref: 'heads/Scarmonit',
  });

  // Create branch
  try {
    await octokit.git.createRef({
      owner: 'scarmonit',
      repo: 'Final',
      ref: `refs/heads/${branchName}`,
      sha: ref.object.sha,
    });
  } catch (error) {
    // Branch exists, continue
  }

  // Create file
  await octokit.repos.createOrUpdateFileContents({
    owner: 'scarmonit',
    repo: 'Final',
    path: 'solution.js',
    message: `🚀 Vercel AI: Solve issue #${issueNumber}`,
    content: Buffer.from(solution).toString('base64'),
    branch: branchName,
  });

  // Create PR
  const { data: pr } = await octokit.pulls.create({
    owner: 'scarmonit',
    repo: 'Final',
    title: `🚀 [Vercel AI] ${issue.title}`,
    head: branchName,
    base: 'Scarmonit',
    body: `## 🚀 Autonomous Resolution by Vercel + Cloudflare AI

**Resolves:** #${issueNumber}

**Analysis:** ${analysis}

---
*Generated with Vercel + Cloudflare Workers AI*`,
  });

  // Comment on issue
  await octokit.issues.createComment({
    owner: 'scarmonit',
    repo: 'Final',
    issue_number: issueNumber,
    body: `🚀 **Vercel Autonomous Agent** has created PR #${pr.number} to resolve this issue.\n\nReview: ${pr.html_url}`,
  });

  return { prNumber: pr.number, prUrl: pr.html_url, analysis };
}

/**
 * Call Cloudflare Workers AI API
 */
async function callCloudflareAI(prompt, options = {}) {
  const model =
    options.model === 'codellama-7b'
      ? '@cf/meta/codellama-7b-instruct'
      : '@cf/meta/llama-2-7b-chat-int8';

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        max_tokens: options.maxTokens || 512,
        temperature: options.temperature || 0.7,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Cloudflare AI error: ${response.status}`);
  }

  const data = await response.json();
  return data.result.response;
}
