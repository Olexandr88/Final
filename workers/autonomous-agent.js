/**
 * Cloudflare Workers AI Autonomous Agent
 * Uses Cloudflare Workers AI (Llama 2, CodeLlama) - NO local Ollama needed!
 *
 * Deploy: wrangler deploy
 * Cost: FREE tier includes 10,000 neurons/day
 */

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/health') {
      return Response.json({ status: 'healthy', ai: 'cloudflare-workers-ai' });
    }

    // Manual trigger endpoint
    if (url.pathname === '/solve' && request.method === 'POST') {
      const { issueNumber } = await request.json();

      try {
        const result = await solveGitHubIssue(env, issueNumber);
        return Response.json({ success: true, result });
      } catch (error) {
        return Response.json({ success: false, error: error.message }, { status: 500 });
      }
    }

    // Cron job handler (runs automatically)
    return Response.json({
      message: 'Ollama Autonomous Agent on Cloudflare Workers AI',
      endpoints: {
        health: '/health',
        solve: 'POST /solve with { issueNumber: 123 }',
      },
    });
  },

  // Scheduled job (runs daily)
  async scheduled(event, env, ctx) {
    console.log('🦙 Running scheduled autonomous agent...');

    try {
      const issues = await fetchOpenIssues(env);

      for (const issue of issues.slice(0, 5)) {
        try {
          await solveGitHubIssue(env, issue.number);
        } catch (error) {
          console.error(`Failed to solve issue #${issue.number}:`, error);
        }
      }

      console.log('✅ Scheduled run complete');
    } catch (error) {
      console.error('❌ Scheduled run failed:', error);
    }
  },
};

/**
 * Fetch open GitHub issues
 */
async function fetchOpenIssues(env) {
  const response = await fetch(
    `https://api.github.com/repos/scarmonit/Final/issues?state=open&per_page=10`,
    {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        'User-Agent': 'Cloudflare-Workers-Agent',
        Accept: 'application/vnd.github.v3+json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const issues = await response.json();
  return issues.filter((issue) => !issue.pull_request);
}

/**
 * Solve a GitHub issue using Cloudflare Workers AI
 */
async function solveGitHubIssue(env, issueNumber) {
  console.log(`🔧 Solving issue #${issueNumber}...`);

  // Get issue details
  const issueResponse = await fetch(
    `https://api.github.com/repos/scarmonit/Final/issues/${issueNumber}`,
    {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        'User-Agent': 'Cloudflare-Workers-Agent',
        Accept: 'application/vnd.github.v3+json',
      },
    }
  );

  const issue = await issueResponse.json();

  // Analyze issue with Cloudflare Workers AI
  const analysis = await analyzeIssueWithAI(env, issue);

  // Generate solution
  const solution = await generateSolutionWithAI(env, issue, analysis);

  // Create PR
  const prUrl = await createPullRequest(env, issue, solution);

  return { issueNumber, prUrl, analysis };
}

/**
 * Analyze issue using Cloudflare Workers AI
 */
async function analyzeIssueWithAI(env, issue) {
  const prompt = `You are an expert software engineer. Analyze this GitHub issue and provide a solution approach.

ISSUE #${issue.number}: ${issue.title}

DESCRIPTION:
${issue.body || 'No description'}

Respond in this format:
COMPLEXITY: [low/medium/high]
APPROACH: [1-sentence approach]
FILES: [comma-separated file paths]
STEPS:
1. [step]
2. [step]`;

  const response = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
    prompt,
    max_tokens: 512,
    temperature: 0.7,
  });

  return parseAnalysis(response.response);
}

/**
 * Generate code solution using Cloudflare Workers AI
 */
async function generateSolutionWithAI(env, issue, analysis) {
  const prompt = `You are an expert software engineer. Generate code to solve this issue.

ISSUE: ${issue.title}
${issue.body || ''}

APPROACH: ${analysis.approach}

CODE REQUIREMENTS:
- Use ES modules (import/export)
- Include error handling
- Add JSDoc comments
- Clean, production-ready code

Generate ONLY the code, no explanations.`;

  const response = await env.AI.run('@cf/meta/codellama-7b-instruct', {
    prompt,
    max_tokens: 2048,
    temperature: 0.5,
  });

  return response.response;
}

/**
 * Create GitHub pull request
 */
async function createPullRequest(env, issue, solution) {
  const branchName = `cloudflare-ai/issue-${issue.number}`;

  // Get base ref
  const refResponse = await fetch(
    `https://api.github.com/repos/scarmonit/Final/git/refs/heads/Scarmonit`,
    {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        'User-Agent': 'Cloudflare-Workers-Agent',
      },
    }
  );
  const refData = await refResponse.json();

  // Create branch
  await fetch(`https://api.github.com/repos/scarmonit/Final/git/refs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'User-Agent': 'Cloudflare-Workers-Agent',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: refData.object.sha,
    }),
  });

  // Create file
  const filePath = 'solution.js';
  await fetch(`https://api.github.com/repos/scarmonit/Final/contents/${filePath}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'User-Agent': 'Cloudflare-Workers-Agent',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `☁️ Cloudflare AI: Solve issue #${issue.number}`,
      content: btoa(solution),
      branch: branchName,
    }),
  });

  // Create PR
  const prResponse = await fetch(`https://api.github.com/repos/scarmonit/Final/pulls`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'User-Agent': 'Cloudflare-Workers-Agent',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: `☁️ [Cloudflare AI] ${issue.title}`,
      head: branchName,
      base: 'Scarmonit',
      body: `## ☁️ Autonomous Resolution by Cloudflare Workers AI

**Resolves:** #${issue.number}

**Model:** Llama 2 7B + CodeLlama 7B

---
*Generated with Cloudflare Workers AI - FREE tier!*`,
    }),
  });

  const pr = await prResponse.json();
  return pr.html_url;
}

/**
 * Parse AI analysis response
 */
function parseAnalysis(text) {
  const complexityMatch = text.match(/COMPLEXITY:\s*(\w+)/i);
  const approachMatch = text.match(/APPROACH:\s*(.+?)(?:\n|FILES:)/is);

  return {
    complexity: complexityMatch ? complexityMatch[1] : 'medium',
    approach: approachMatch ? approachMatch[1].trim() : 'Implement solution',
    rawAnalysis: text,
  };
}
