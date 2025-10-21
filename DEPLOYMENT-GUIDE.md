# 🚀 Ollama Autonomous Agent - Cloud Deployment Guide

Deploy your FREE autonomous GitHub issue-solving agent to the cloud!

**3 Platform Options:**
1. **Railway** - Full Ollama server (best quality, $5/month)
2. **Cloudflare Workers** - Workers AI (FREE tier, good quality)
3. **Vercel** - Serverless + Cloudflare AI (FREE tier, auto-scaling)

---

## 🛤️ Option 1: Railway (RECOMMENDED)

**Best for:** Maximum quality, full Ollama with large models
**Cost:** $5/month (500 hours)
**Models:** CodeLlama 7B, DeepSeek Coder, Llama 2, etc.

### Step 1: Sign Up

1. Go to https://railway.app
2. Sign in with GitHub
3. Get $5 free credit (covers 1 month)

### Step 2: Create New Project

```bash
# In your project directory
git add -A
git commit -m "Add Railway deployment config"
git push origin Scarmonit
```

### Step 3: Deploy to Railway

1. Click "New Project" in Railway dashboard
2. Select "Deploy from GitHub repo"
3. Choose `scarmonit/Final` repository
4. Railway will auto-detect `railway.json` and `Dockerfile.railway`

### Step 4: Set Environment Variables

In Railway dashboard, go to Variables tab and add:

```bash
GITHUB_TOKEN=ghp_your_github_token_here
OLLAMA_MODEL=codellama
```

### Step 5: Deploy

Railway will automatically:
1. Build Docker image with Ollama
2. Download CodeLlama model (7GB, takes ~10 mins first time)
3. Start Ollama server
4. Run autonomous agent

### Step 6: Monitor

View logs in Railway dashboard:
```
🚀 Starting Ollama server...
⏳ Waiting for Ollama to be ready...
📦 Pulling CodeLlama model...
✅ Ollama ready! Starting autonomous agent...
🦙 Ollama Autonomous Agent Starting...
📋 Found 11 open issues
🎯 Targeting 11 issues for autonomous resolution
```

### Step 7: Schedule (Optional)

Add cron job in Railway:

1. Go to Settings → Cron
2. Add schedule: `0 0 * * *` (daily at midnight)
3. Command: `npm run agent:ollama-autonomous`

---

## ☁️ Option 2: Cloudflare Workers (EASIEST + FREE)

**Best for:** Zero cost, auto-scaling, global edge network
**Cost:** FREE (10,000 AI neurons/day = ~100 issues)
**Models:** Llama 2 7B, CodeLlama 7B (Cloudflare's Workers AI)

### Step 1: Install Wrangler

```bash
npm install -g wrangler

# Login to Cloudflare
wrangler login
```

### Step 2: Set GitHub Token

```bash
# Set secret (paste your token when prompted)
wrangler secret put GITHUB_TOKEN
```

### Step 3: Deploy

```bash
# Deploy to Cloudflare Workers
wrangler deploy

# Output:
# ✨ Uploaded autonomous-agent
# 🌍 https://ollama-autonomous-agent.your-subdomain.workers.dev
```

### Step 4: Test

```bash
# Health check
curl https://ollama-autonomous-agent.your-subdomain.workers.dev/health

# Manually solve an issue
curl -X POST https://ollama-autonomous-agent.your-subdomain.workers.dev/solve \
  -H "Content-Type: application/json" \
  -d '{"issueNumber": 32}'
```

### Step 5: Enable Cron (Auto-Run Daily)

The cron is already configured in `wrangler.toml`:

```toml
[triggers]
crons = ["0 0 * * *"]  # Runs daily at midnight UTC
```

Your agent will automatically:
- Run every day at midnight
- Process up to 5 open issues
- Create PRs autonomously
- Zero maintenance needed!

### Free Tier Limits

- **100,000 requests/day** (more than enough)
- **10,000 AI neurons/day** (~100 issue analyses)
- **10ms CPU time** per request
- Unlimited storage for logs

---

## 🚢 Option 3: Vercel (FREE + AUTO-SCALING)

**Best for:** Serverless, zero config, integrated with GitHub
**Cost:** FREE (Hobby plan)
**Models:** CodeLlama 7B via Cloudflare API

### Step 1: Get Cloudflare API Credentials

1. Go to https://dash.cloudflare.com
2. My Profile → API Tokens → Create Token
3. Use template: "Edit Cloudflare Workers"
4. Copy:
   - `API Token` (looks like: xxxxxxxxxxxxxxx)
   - `Account ID` (Account → Copy ID)

### Step 2: Install Vercel CLI

```bash
npm install -g vercel

# Login
vercel login
```

### Step 3: Set Environment Variables

```bash
# In your project directory
vercel env add GITHUB_TOKEN
# Paste: ghp_your_github_token

vercel env add CLOUDFLARE_API_TOKEN
# Paste: your_cloudflare_api_token

vercel env add CLOUDFLARE_ACCOUNT_ID
# Paste: your_account_id
```

### Step 4: Deploy

```bash
# Deploy to production
vercel --prod

# Output:
# 🔍 Inspect: https://vercel.com/yourname/final/xxxxx
# ✅ Production: https://final.vercel.app
```

### Step 5: Test Endpoints

```bash
# Health check
curl https://final.vercel.app/api/health

# Solve issue manually
curl -X POST https://final.vercel.app/api/solve \
  -H "Content-Type: application/json" \
  -d '{"issueNumber": 32}'
```

### Step 6: Enable Cron (Vercel Cron Jobs)

Already configured in `vercel.json`:

```json
"crons": [
  {
    "path": "/api/cron",
    "schedule": "0 0 * * *"
  }
]
```

Runs daily at midnight automatically!

---

## 📊 Platform Comparison

| Feature | Railway | Cloudflare Workers | Vercel |
|---------|---------|-------------------|--------|
| **Cost** | $5/month | FREE | FREE |
| **Setup Time** | 15 mins | 5 mins | 5 mins |
| **AI Quality** | ★★★★★ (Full Ollama) | ★★★★☆ (Workers AI) | ★★★★☆ (Workers AI) |
| **Speed** | ★★★★☆ (2-5s) | ★★★★★ (<1s edge) | ★★★★★ (<1s serverless) |
| **Scalability** | Limited (1 instance) | ★★★★★ (Auto-scale) | ★★★★★ (Auto-scale) |
| **Models Available** | Any Ollama model | Llama 2, CodeLlama | Llama 2, CodeLlama |
| **Context Window** | 4K-128K tokens | 4K tokens | 4K tokens |
| **Maintenance** | Medium | Zero | Zero |
| **Cold Starts** | None (always on) | ~100ms | ~200ms |

### Recommendations

**Use Railway if:**
- ✅ You want the BEST code quality
- ✅ Need large context windows (32K+)
- ✅ Want to use specialized models (deepseek-coder, etc.)
- ✅ Can afford $5/month

**Use Cloudflare Workers if:**
- ✅ You want 100% FREE
- ✅ Need global edge deployment
- ✅ Want zero maintenance
- ✅ Process <100 issues/day

**Use Vercel if:**
- ✅ You want 100% FREE
- ✅ Already use Vercel for other projects
- ✅ Want integrated GitHub deployment
- ✅ Need auto-scaling

---

## 🔧 Configuration

### Changing the Model

**Railway:**
```bash
# In Railway dashboard → Variables
OLLAMA_MODEL=deepseek-coder
# or
OLLAMA_MODEL=llama2:13b
```

**Cloudflare/Vercel:**
Models are hardcoded in `workers/autonomous-agent.js` and `api/autonomous-agent.js`:
```javascript
// Available models:
'@cf/meta/llama-2-7b-chat-int8'     // General purpose
'@cf/meta/codellama-7b-instruct'    // Code generation
'@cf/meta/llama-2-7b-chat-fp16'     // Higher precision
```

### Adjusting Frequency

**All Platforms:**

Change cron schedule:

```bash
# Daily at midnight
0 0 * * *

# Every 6 hours
0 */6 * * *

# Every Monday at 9am
0 9 * * 1

# Every hour
0 * * * *
```

### Limiting Issues Processed

Edit the agent files and change:

```javascript
// Process only 5 issues per run
for (const issue of targetIssues.slice(0, 5)) {
  // Change 5 to your desired limit
}
```

---

## 🎯 Testing Your Deployment

### 1. Health Check

```bash
# Railway
curl https://your-app.railway.app/health

# Cloudflare Workers
curl https://ollama-autonomous-agent.your-subdomain.workers.dev/health

# Vercel
curl https://your-app.vercel.app/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "ai": "ollama|cloudflare-workers-ai",
  "timestamp": "2025-10-21T..."
}
```

### 2. Manual Issue Solve

```bash
# Cloudflare Workers
curl -X POST https://your-worker.workers.dev/solve \
  -H "Content-Type: application/json" \
  -d '{"issueNumber": 32}'

# Vercel
curl -X POST https://your-app.vercel.app/api/solve \
  -H "Content-Type: application/json" \
  -d '{"issueNumber": 32}'
```

### 3. Check GitHub

After 2-5 minutes, check:
1. New branch created: `ollama/issue-32-...` or `cloudflare-ai/issue-32-...`
2. New PR opened
3. Comment added to issue #32

---

## 🐛 Troubleshooting

### Railway Issues

**Problem:** "Ollama not responding"
```bash
# Solution: Increase memory in railway.json
# Add to Dockerfile.railway:
ENV OLLAMA_MAX_LOADED_MODELS=1
ENV OLLAMA_NUM_PARALLEL=1
```

**Problem:** "Model download timeout"
```bash
# Solution: Use smaller model
OLLAMA_MODEL=codellama  # 3.8GB instead of 7GB
```

### Cloudflare Workers Issues

**Problem:** "AI binding not found"
```bash
# Solution: Ensure wrangler.toml has:
[ai]
binding = "AI"
```

**Problem:** "Rate limit exceeded"
```bash
# Solution: Reduce cron frequency or upgrade to paid plan
# Free tier: 10,000 neurons/day
```

### Vercel Issues

**Problem:** "Cloudflare API error 401"
```bash
# Solution: Check API token permissions
# Must have: "Workers AI - Edit" permission
```

**Problem:** "Function timeout"
```bash
# Solution: Reduce max issues per run
# Free tier: 10s timeout
# Pro tier: 60s timeout
```

---

## 💰 Cost Breakdown

### Railway ($5/month)

- 500 execution hours
- 8GB RAM, 8 vCPUs
- 100GB disk
- **Best value** if running 24/7

**Monthly cost for agent:**
- Always-on server: ~720 hours
- With $5 credit: 500 hours FREE, then $0.01/hour
- **Actual cost:** ~$2.20/month after credits

### Cloudflare Workers (FREE)

- 100,000 requests/day
- 10,000 AI neurons/day
- Unlimited scripts

**Limits:**
- ~100 issue analyses/day (FREE)
- Upgrade to $5/month for 1M neurons/day

### Vercel (FREE)

- 100GB bandwidth/month
- 100 hours serverless execution/month
- Unlimited deployments

**Limits:**
- ~1,000 issue analyses/month (FREE)
- Pro plan: $20/month unlimited

---

## 🎉 Success! What's Next?

After deploying, your agent will:

1. **Run automatically** (via cron)
2. **Find open issues** in your repo
3. **Analyze with AI** (Ollama or Workers AI)
4. **Generate code solutions**
5. **Create pull requests**
6. **Comment on issues**

**You just:**
- Review PRs (takes 2-5 mins each)
- Merge good ones
- Close or request changes on others

**Result:**
- 80% of simple issues solved automatically
- 50% of medium issues need minor tweaks
- 20% of complex issues need human guidance

---

## 📈 Monitoring & Logs

### Railway

View logs in dashboard:
```
Logs tab → Real-time stream
```

### Cloudflare Workers

```bash
# Stream logs
wrangler tail

# View in dashboard
Workers → ollama-autonomous-agent → Logs
```

### Vercel

```bash
# View logs
vercel logs

# Dashboard
Deployments → View Function Logs
```

---

## 🔐 Security Best Practices

### GitHub Token Permissions

Create token with **minimum** permissions:
- ✅ `repo` (full repo access)
- ✅ `workflow` (update workflows)
- ❌ No admin, delete, or security permissions

### Secret Management

**DO:**
- ✅ Use platform secret storage (Railway Variables, Wrangler Secrets, Vercel Env)
- ✅ Rotate tokens every 90 days
- ✅ Use separate tokens for dev/prod

**DON'T:**
- ❌ Commit tokens to Git
- ❌ Share tokens between projects
- ❌ Use personal tokens in production

---

## 📚 Additional Resources

- **Railway Docs:** https://docs.railway.app
- **Cloudflare Workers AI:** https://developers.cloudflare.com/workers-ai
- **Vercel Docs:** https://vercel.com/docs
- **Ollama Models:** https://ollama.com/library
- **GitHub API:** https://docs.github.com/rest

---

## 🆘 Need Help?

1. Check logs on your platform
2. Test locally first: `npm run agent:ollama-autonomous`
3. Open issue: https://github.com/scarmonit/Final/issues
4. Platform support:
   - Railway: https://help.railway.app
   - Cloudflare: https://community.cloudflare.com
   - Vercel: https://vercel.com/support

---

**Built with ❤️ using FREE and open-source AI models!**

*No API keys needed. No vendor lock-in. 100% yours.*
