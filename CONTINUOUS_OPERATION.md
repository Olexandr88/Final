# Continuous Autonomous Operation Guide

This document explains how the continuous autonomous agent system works and how to configure it.

## 🎯 Overview

The system consists of three complementary components:

1. **Railway Orchestrator** - Long-running process that continuously polls and solves issues
2. **Cloudflare Webhooks** - Real-time event processing for immediate responses
3. **Scheduled Tasks** - Periodic maintenance and health checks

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        GitHub Repository                      │
│  • Issues (Task Queue)                                        │
│  • Labels (Task Status)                                       │
│  • .agent-state.json (Persistent State)                      │
└────────────┬────────────────────────────────────────┬────────┘
             │                                         │
             │ Webhooks                               │ Polling
             │ (Real-time)                            │ (Every 5 min)
             │                                         │
    ┌────────▼────────┐                      ┌────────▼────────┐
    │   Cloudflare    │                      │     Railway     │
    │    Workers      │                      │  Orchestrator   │
    │  (Edge/Cron)    │◄────Health Check────►│  (Long-running) │
    └─────────────────┘                      └─────────────────┘
             │                                         │
             │                                         │
             └──────────────┬──────────────────────────┘
                            │
                    ┌───────▼────────┐
                    │  Task Execution │
                    │  • Analyze      │
                    │  • Generate     │
                    │  • Implement    │
                    │  • Test         │
                    │  • Deploy       │
                    └─────────────────┘
```

## 🚀 Quick Start

### 1. Configure Environment Variables

#### Railway Environment Variables
```bash
GITHUB_TOKEN=ghp_xxxxxxxxxxxxx
GITHUB_REPO=Scarmonit/Final
NODE_ENV=production
PORT=8080
POLL_INTERVAL_MS=300000          # 5 minutes (optional)
MAX_CONCURRENT_TASKS=1           # Process one task at a time (optional)
ENABLE_AUTO_SOLVE=true           # Enable automatic solving (optional)
```

#### Cloudflare Worker Secrets
```bash
wrangler secret put GITHUB_TOKEN
wrangler secret put RAILWAY_SERVICE_URL  # Your Railway deployment URL
wrangler secret put GITHUB_REPO          # Optional: Scarmonit/Final
```

### 2. Deploy Components

#### Deploy Railway Orchestrator
```bash
railway up
# or
npm run deploy:railway
```

The orchestrator will start automatically and begin monitoring issues.

#### Deploy Cloudflare Workers
```bash
npx wrangler deploy
# or
npm run deploy:cloudflare
```

### 3. Configure GitHub Webhooks

1. Go to your repository settings
2. Navigate to **Settings → Webhooks → Add webhook**
3. Configure:
   - **Payload URL**: `https://scarmonit-final.your-subdomain.workers.dev/webhook`
   - **Content type**: `application/json`
   - **Events**: Select individual events:
     - ☑ Issues
     - ☑ Issue comments
     - ☑ Pull requests
     - ☑ Pushes
   - **Active**: ✓

## 📊 How It Works

### Task Queue System

The agent uses GitHub Issues as a task queue with special labels:

- `agent:in-progress` - Currently being processed
- `agent:completed` - Successfully completed
- `agent:priority` - High-priority task
- `agent:paused` - Temporarily paused

### Task Prioritization

Issues are scored based on:

1. **Labels** (highest priority):
   - `security` - 1000 points
   - `bug` - 500 points
   - `critical` - 400 points
   - `enhancement` - 200 points
   - `documentation` - 100 points
   - `question` - 50 points

2. **Age** - Older issues get a slight boost (up to 100 points)

3. **Community Interest** - 👍 reactions add 10 points each

### Processing Flow

```
1. Orchestrator polls for open issues
2. Calculate priority score for each issue
3. Select highest priority issue
4. Add 'agent:in-progress' label
5. Post comment: "🤖 Autonomous agent is working on this issue..."
6. Execute solution steps
7. Add 'agent:completed' label
8. Post results comment
9. Move to next issue
```

## 🎮 Manual Control

### Commands via Issue Comments

Comment on any issue with these commands:

- `@agent solve` - Add to high-priority queue
- `@agent pause` - Pause processing on this issue
- `@agent resume` - Resume processing

### Emergency Controls

#### Stop Agent
Create an issue with label `agent:stop` to halt all processing.

#### Resume Agent
Remove `agent:stop` label or create issue with `agent:resume`.

## 📈 Monitoring

### Health Check Endpoints

#### Railway Orchestrator
```bash
curl https://your-railway-app.railway.app/health
```

Response:
```json
{
  "status": "healthy",
  "uptime": 3600000,
  "isRunning": true,
  "currentTask": {
    "issueNumber": 42,
    "title": "Fix login bug",
    "startTime": "2024-01-20T10:30:00Z"
  },
  "lastPollTime": "2024-01-20T10:35:00Z",
  "totalTasksProcessed": 15,
  "errorCount": 0
}
```

#### Cloudflare Worker
```bash
curl https://scarmonit-final.your-subdomain.workers.dev/health
```

### View Agent State

The agent persists its state to `.agent-state.json` in the repository:

```json
{
  "isRunning": false,
  "currentTask": null,
  "lastPollTime": "2024-01-20T10:35:00Z",
  "completedTasks": [
    {
      "issueNumber": 40,
      "title": "Update documentation",
      "completedAt": "2024-01-20T10:20:00Z"
    }
  ],
  "errorCount": 0,
  "totalTasksProcessed": 15
}
```

### Logs

#### Railway Logs
```bash
railway logs --follow
```

#### Cloudflare Worker Logs
```bash
wrangler tail
```

## ⚙️ Configuration

### Polling Interval

Control how often the orchestrator checks for new issues:

```bash
# Check every 1 minute (development)
POLL_INTERVAL_MS=60000

# Check every 5 minutes (default)
POLL_INTERVAL_MS=300000

# Check every 15 minutes (production)
POLL_INTERVAL_MS=900000
```

### Concurrency

Control how many issues can be processed simultaneously:

```bash
# Process one at a time (safe, recommended)
MAX_CONCURRENT_TASKS=1

# Process up to 3 simultaneously (experimental)
MAX_CONCURRENT_TASKS=3
```

### Auto-Solve Mode

Enable or disable automatic issue solving:

```bash
# Enable automatic solving (default)
ENABLE_AUTO_SOLVE=true

# Monitoring only (no automatic actions)
ENABLE_AUTO_SOLVE=false
```

## 🔒 Safety Features

### Rate Limiting
- GitHub API calls are throttled to prevent rate limiting
- Respects GitHub's rate limit headers
- Backs off on errors

### Error Recovery
- Automatically retries failed operations
- Stops after 3 consecutive errors
- Creates alert issues for critical failures
- Graceful shutdown on SIGTERM/SIGINT

### State Persistence
- State saved to `.agent-state.json` after each operation
- Survives restarts and redeployments
- Prevents duplicate work

### Circuit Breaker
- Stops processing after repeated failures
- Requires manual intervention to resume
- Prevents runaway processes

## 🧪 Testing

### Development Mode

Run locally with faster polling:

```bash
npm run agent:dev
```

This sets:
- `NODE_ENV=development`
- `POLL_INTERVAL_MS=60000` (1 minute)

### Monitor-Only Mode

Run without making changes:

```bash
npm run agent:monitor
```

This sets `ENABLE_AUTO_SOLVE=false` to watch without acting.

### Test Webhooks Locally

Use ngrok or cloudflared to test webhooks:

```bash
# Terminal 1: Start local worker
npx wrangler dev

# Terminal 2: Create tunnel
cloudflared tunnel --url http://localhost:8787

# Use the tunnel URL in GitHub webhook settings
```

## 🐛 Troubleshooting

### Agent Not Processing Issues

1. **Check health endpoint**:
   ```bash
   curl https://your-railway-app.railway.app/health
   ```

2. **Check environment variables**:
   ```bash
   railway variables
   ```

3. **Check logs**:
   ```bash
   railway logs --follow
   ```

4. **Verify GitHub token**:
   - Must have `repo` scope
   - Must have write permissions
   - Check expiration date

### Webhook Not Receiving Events

1. **Check webhook deliveries** in GitHub repo settings
2. **Verify worker is deployed**:
   ```bash
   curl https://your-worker.workers.dev/health
   ```
3. **Check worker logs**:
   ```bash
   wrangler tail
   ```

### High Error Count

Check `.agent-state.json` for error count:
- If `errorCount >= 3`, agent has stopped
- Review recent issue comments for error details
- Fix underlying issue
- Remove `agent:in-progress` labels
- Restart agent

### State Corruption

If `.agent-state.json` becomes corrupted:

```bash
# Delete state file (will reset to fresh start)
git rm .agent-state.json
git commit -m "Reset agent state"
git push
```

The agent will create a new state file on next run.

## 📚 Advanced Usage

### Custom Priority Rules

Edit `scripts/autonomous-orchestrator.js` to customize priority weights:

```javascript
const PRIORITY_WEIGHTS = {
  'security': 2000,      // Increase security priority
  'bug': 500,
  'customer-request': 300, // Add custom label
  'enhancement': 200,
  'documentation': 100,
  'question': 50
};
```

### Integration with Other Systems

The orchestrator exposes a `/trigger` endpoint for manual triggering:

```bash
curl -X POST https://your-railway-app.railway.app/trigger \
  -H "Content-Type: application/json" \
  -d '{"issueNumber": 42, "priority": "high"}'
```

### Scheduled Tasks

Cloudflare Workers run scheduled tasks (see `wrangler.toml`):

```toml
[triggers]
crons = [
  "0 0 * * *",     # Daily at midnight UTC
  "*/30 * * * *"   # Every 30 minutes
]
```

Customize in `workers/webhook-handler.js` `scheduled()` function.

## 🎓 Best Practices

1. **Start with monitoring mode** - Use `ENABLE_AUTO_SOLVE=false` initially
2. **Test with low-priority issues** - Label test issues as `question` or `documentation`
3. **Monitor health regularly** - Set up uptime monitoring
4. **Review completed work** - Check PRs created by agent
5. **Adjust polling interval** - Balance responsiveness vs. API usage
6. **Use webhooks for urgent issues** - Critical bugs get immediate attention
7. **Maintain state backups** - Periodically save `.agent-state.json`

## 📞 Support

For issues or questions:
1. Check troubleshooting section above
2. Review logs (Railway and Cloudflare)
3. Create an issue in the repository
4. Contact repository maintainers

## 🔄 Updates

To update the continuous operation system:

```bash
git pull origin main
npm install
railway up              # Redeploy Railway
npx wrangler deploy     # Redeploy Cloudflare
```

The orchestrator will automatically reload with new configuration.

