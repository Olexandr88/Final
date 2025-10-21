# ⚡ Quick Start - Deploy in 5 Minutes

Choose your platform and follow the steps below:

---

## 🎯 Option 1: Railway (Best Quality) - $5/month

```bash
# 1. Commit files
git add -A
git commit -m "Add cloud deployment configs"
git push origin Scarmonit

# 2. Go to railway.app and sign in with GitHub

# 3. Click "New Project" → "Deploy from GitHub repo" → Select "Final"

# 4. Add environment variables in Railway dashboard:
GITHUB_TOKEN=ghp_your_token_here
OLLAMA_MODEL=codellama

# 5. Deploy! (Railway auto-detects Dockerfile.railway)

# ✅ Agent will run automatically, check logs in Railway dashboard
```

**What you get:**
- Full Ollama server with CodeLlama 7B
- Best code quality
- Always-on (24/7)
- ~720 hours/month runtime

**Cost:** $5/month after $5 free credit

---

## 🌐 Option 2: Cloudflare Workers (Easiest + FREE)

```bash
# 1. Install Wrangler
npm install -g wrangler

# 2. Login
wrangler login

# 3. Set GitHub token
wrangler secret put GITHUB_TOKEN
# Paste: ghp_your_token_here

# 4. Deploy!
wrangler deploy

# ✅ Done! Your agent is live at:
#    https://ollama-autonomous-agent.YOUR-SUBDOMAIN.workers.dev

# 5. Test it
curl https://ollama-autonomous-agent.YOUR-SUBDOMAIN.workers.dev/health
```

**What you get:**
- Cloudflare Workers AI (Llama 2 + CodeLlama)
- 100% FREE (10,000 neurons/day = ~100 issues)
- Auto-runs daily via cron
- Global edge network

**Cost:** FREE (or $5/month for unlimited)

---

## 🚢 Option 3: Vercel (FREE + Auto-Scaling)

```bash
# 1. Get Cloudflare API credentials
# - Go to dash.cloudflare.com
# - My Profile → API Tokens → Create Token
# - Use template: "Edit Cloudflare Workers"
# - Copy: API Token + Account ID

# 2. Install Vercel CLI
npm install -g vercel

# 3. Login
vercel login

# 4. Set environment variables
vercel env add GITHUB_TOKEN
# Paste: ghp_your_token_here

vercel env add CLOUDFLARE_API_TOKEN
# Paste: your_cloudflare_api_token

vercel env add CLOUDFLARE_ACCOUNT_ID
# Paste: your_account_id

# 5. Deploy!
vercel --prod

# ✅ Done! Your agent is live at:
#    https://final.vercel.app

# 6. Test it
curl https://final.vercel.app/api/health
```

**What you get:**
- Serverless functions with Cloudflare AI
- 100% FREE (Hobby plan)
- Auto-runs daily via cron
- Integrated with GitHub

**Cost:** FREE (or $20/month Pro for unlimited)

---

## ✅ After Deployment

All agents automatically:
1. Run daily at midnight UTC
2. Find open issues
3. Analyze with AI
4. Create PRs with solutions
5. Comment on issues

**You just review and merge PRs!**

---

## 🧪 Test Manually (Optional)

Force solve a specific issue:

**Cloudflare Workers:**
```bash
curl -X POST https://your-worker.workers.dev/solve \
  -H "Content-Type: application/json" \
  -d '{"issueNumber": 32}'
```

**Vercel:**
```bash
curl -X POST https://your-app.vercel.app/api/solve \
  -H "Content-Type: application/json" \
  -d '{"issueNumber": 32}'
```

**Railway:**
Railway runs the agent automatically on startup. Check logs in dashboard.

---

## 📊 Which Platform Should I Choose?

| If you want... | Choose |
|----------------|--------|
| **Best code quality** | Railway ($5/month) |
| **100% FREE** | Cloudflare Workers or Vercel |
| **Fastest setup** | Cloudflare Workers (5 mins) |
| **Auto-scaling** | Cloudflare Workers or Vercel |
| **Large models** | Railway (can run 13B+ models) |
| **Already using Vercel** | Vercel |

**My recommendation:** Start with **Cloudflare Workers** (FREE, 5 min setup), upgrade to **Railway** if you need better quality.

---

## 🐛 Troubleshooting

**Railway:** Check logs in dashboard, ensure $5 credit is added
**Cloudflare:** Run `wrangler tail` to see live logs
**Vercel:** Run `vercel logs` or check dashboard

Full troubleshooting guide: [DEPLOYMENT-GUIDE.md](./DEPLOYMENT-GUIDE.md)

---

## 📚 Full Documentation

See [DEPLOYMENT-GUIDE.md](./DEPLOYMENT-GUIDE.md) for:
- Detailed setup instructions
- Platform comparison
- Configuration options
- Cost breakdown
- Monitoring & logs
- Security best practices

---

**That's it! Your autonomous agent is now running in the cloud 🎉**
