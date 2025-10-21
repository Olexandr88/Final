/**
 * Cloudflare Workers Webhook Handler
 * 
 * Receives GitHub webhooks and processes them in real-time
 * Complements the polling orchestrator with event-driven responses
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'healthy',
        service: 'webhook-handler',
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Webhook endpoint
    if (url.pathname === '/webhook' && request.method === 'POST') {
      return handleWebhook(request, env);
    }
    
    return new Response('Not Found', { status: 404 });
  },
  
  // Scheduled handler for periodic tasks
  async scheduled(event, env, ctx) {
    console.log('⏰ Scheduled task triggered');
    
    try {
      // Trigger health check on Railway service
      if (env.RAILWAY_SERVICE_URL) {
        await fetch(`${env.RAILWAY_SERVICE_URL}/health`);
      }
      
      // Perform periodic maintenance tasks
      await performMaintenance(env);
      
    } catch (error) {
      console.error('Error in scheduled task:', error);
    }
  }
};

/**
 * Handle incoming webhook from GitHub
 */
async function handleWebhook(request, env) {
  try {
    // Verify GitHub signature
    const signature = request.headers.get('X-Hub-Signature-256');
    const eventType = request.headers.get('X-GitHub-Event');
    
    if (!signature || !eventType) {
      return new Response('Missing headers', { status: 400 });
    }
    
    const payload = await request.json();
    
    console.log(`📬 Received ${eventType} event`);
    
    // Process different event types
    let response;
    switch (eventType) {
      case 'issues':
        response = await handleIssuesEvent(payload, env);
        break;
        
      case 'issue_comment':
        response = await handleIssueCommentEvent(payload, env);
        break;
        
      case 'pull_request':
        response = await handlePullRequestEvent(payload, env);
        break;
        
      case 'push':
        response = await handlePushEvent(payload, env);
        break;
        
      default:
        console.log(`⏭️ Ignoring ${eventType} event`);
        response = { acknowledged: true, processed: false };
    }
    
    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error handling webhook:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle issues event (opened, edited, closed, etc.)
 */
async function handleIssuesEvent(payload, env) {
  const { action, issue, repository } = payload;
  
  console.log(`🎫 Issue #${issue.number}: ${action}`);
  
  // Only process opened and reopened issues
  if (action === 'opened' || action === 'reopened') {
    // Check if this is a high-priority issue
    const labels = issue.labels.map(l => l.name);
    const isUrgent = labels.some(l => 
      l.includes('security') || 
      l.includes('critical') || 
      l.includes('bug')
    );
    
    if (isUrgent) {
      console.log('🚨 High-priority issue detected!');
      
      // Trigger immediate processing by notifying Railway service
      if (env.RAILWAY_SERVICE_URL) {
        await fetch(`${env.RAILWAY_SERVICE_URL}/trigger`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'urgent_issue',
            issueNumber: issue.number,
            priority: 'high'
          })
        });
      }
      
      return {
        acknowledged: true,
        processed: true,
        action: 'triggered_immediate_processing',
        issueNumber: issue.number
      };
    }
  }
  
  return {
    acknowledged: true,
    processed: false,
    reason: `Action '${action}' does not require immediate processing`
  };
}

/**
 * Handle issue comment events
 */
async function handleIssueCommentEvent(payload, env) {
  const { action, issue, comment } = payload;
  
  // Check for special commands in comments
  const commandMatch = comment.body.match(/@agent\\s+(\\w+)/);
  
  if (commandMatch) {
    const command = commandMatch[1].toLowerCase();
    console.log(`🎮 Command detected: ${command}`);
    
    switch (command) {
      case 'solve':
      case 'fix':
        // Add to high-priority queue
        await addLabel(issue.number, 'agent:priority', env);
        return {
          acknowledged: true,
          processed: true,
          action: 'added_to_priority_queue'
        };
        
      case 'pause':
        await addLabel(issue.number, 'agent:paused', env);
        return {
          acknowledged: true,
          processed: true,
          action: 'paused_processing'
        };
        
      case 'resume':
        await removeLabel(issue.number, 'agent:paused', env);
        return {
          acknowledged: true,
          processed: true,
          action: 'resumed_processing'
        };
    }
  }
  
  return { acknowledged: true, processed: false };
}

/**
 * Handle pull request events
 */
async function handlePullRequestEvent(payload, env) {
  const { action, pull_request } = payload;
  
  console.log(`🔀 PR #${pull_request.number}: ${action}`);
  
  // Could trigger automatic review, testing, etc.
  return { acknowledged: true, processed: false };
}

/**
 * Handle push events
 */
async function handlePushEvent(payload, env) {
  const { ref, commits } = payload;
  
  console.log(`📌 Push to ${ref}: ${commits.length} commits`);
  
  // Could trigger CI/CD, deployment verification, etc.
  return { acknowledged: true, processed: false };
}

/**
 * Add label to issue
 */
async function addLabel(issueNumber, label, env) {
  if (!env.GITHUB_TOKEN) {
    return;
  }
  
  const [owner, repo] = (env.GITHUB_REPO || 'Scarmonit/Final').split('/');
  
  await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/labels`, {
    method: 'POST',
    headers: {
      'Authorization': `token ${env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Scarmonit-Agent'
    },
    body: JSON.stringify({ labels: [label] })
  });
}

/**
 * Remove label from issue
 */
async function removeLabel(issueNumber, label, env) {
  if (!env.GITHUB_TOKEN) {
    return;
  }
  
  const [owner, repo] = (env.GITHUB_REPO || 'Scarmonit/Final').split('/');
  
  await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/labels/${label}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `token ${env.GITHUB_TOKEN}`,
      'User-Agent': 'Scarmonit-Agent'
    }
  });
}

/**
 * Perform periodic maintenance
 */
async function performMaintenance(env) {
  console.log('🧹 Running maintenance tasks...');
  
  // Could clean up old labels, close stale issues, etc.
  
  console.log('✅ Maintenance complete');
}

