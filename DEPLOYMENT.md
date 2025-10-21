# Deployment Guide for www.scarmonit.com

Complete guide for deploying to Railway, Vercel, and Cloudflare Workers with custom domain configuration.

## 🏗️ Architecture Overview

```
www.scarmonit.com (Cloudflare DNS)
    │
    ├──> Cloudflare Workers (Edge Gateway)
    │    ├── /health → Workers edge function
    │    ├── /solve → Workers edge function
    │    └── /api/* → Proxy to Railway or Vercel
    │
    ├──> Railway (Heavy Compute Backend)
    │    └── Ollama Autonomous Agent
    │
    └──> Vercel (Serverless API Functions)
         └── Serverless functions & API routes
```

## 📋 Prerequisites

- [x] Cloudflare account with www.scarmonit.com domain
- [x] Railway account
- [x] Vercel account
- [x] GitHub personal access token
- [x] Node.js 20+ installed locally

## 🚀 Step-by-Step Deployment

### 1️⃣ Cloudflare DNS Configuration

First, configure your DNS records in Cloudflare:

1. **Login to Cloudflare Dashboard**: https://dash.cloudflare.com/
2. **Select your domain**: `scarmonit.com`
3. **Get your Zone ID**: Copy it from the right sidebar (needed for wrangler.toml)

#### DNS Records Setup

Add the following DNS records:

| Type | Name | Content | Proxy Status | TTL |
|------|------|---------|--------------|-----|
| A | www | 192.0.2.1 (placeholder) | Proxied (orange cloud) | Auto |
| CNAME | @ | www.scarmonit.com | Proxied | Auto |

> **Note**: The A record IP is a placeholder. Cloudflare Workers will handle the actual routing.

### 2️⃣ Cloudflare Workers Deployment

Deploy your edge functions to Cloudflare Workers:

```bash
# Install Wrangler CLI (if not already installed)
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Update wrangler.toml with your Zone ID
# Edit wrangler.toml and uncomment the routes section
# Replace YOUR_ZONE_ID with your actual Zone ID

# Set up secrets
wrangler secret put GITHUB_TOKEN
# Paste your GitHub token when prompted

# Optional: Set repository
wrangler secret put GITHUB_REPO
# Format: "Scarmonit/Final"

# Deploy to Cloudflare
npx wrangler deploy
```

**Verify Deployment:**
```bash
curl https://www.scarmonit.com/health
# Expected: {"status":"healthy","ai":"cloudflare-workers-ai"}
```

### 3️⃣ Railway Deployment

Deploy your backend service to Railway:

1. **Login to Railway**: https://railway.app/
2. **Create New Project**: Click "New Project"
3. **Select "Deploy from GitHub repo"**: Choose `Scarmonit/Final`
4. **Railway will auto-detect** the `railway.json` configuration

#### Environment Variables (Railway Dashboard)

Add these in Railway Settings → Variables:

```env
NODE_ENV=production
PORT=8080
GITHUB_TOKEN=ghp_your_token_here
GITHUB_REPO=Scarmonit/Final
```

#### Custom Domain (Optional)

If you want a direct Railway subdomain:

1. Go to Railway Settings → Networking
2. Click "Generate Domain" or "Add Custom Domain"
3. Add: `api.scarmonit.com`
4. Railway will provide a CNAME record
5. Add the CNAME in Cloudflare DNS:
   - Type: CNAME
   - Name: api
   - Content: [Railway provided domain]
   - Proxy: Off (grey cloud)

**Verify Deployment:**
```bash
# Check Railway logs for successful startup
railway logs
```

### 4️⃣ Vercel Deployment

Deploy serverless functions to Vercel:

```bash
# Install Vercel CLI (if not already installed)
npm install -g vercel

# Login to Vercel
vercel login

# Deploy to production
vercel --prod

# When prompted:
# - Set up and deploy: Y
# - Which scope: Select your account
# - Link to existing project: N
# - Project name: scarmonit-final
# - Directory: ./
# - Override settings: N
```

#### Add Custom Domain in Vercel

1. Go to Vercel Dashboard → Project Settings → Domains
2. Add domain: `www.scarmonit.com`
3. Vercel will provide DNS configuration
4. **Important**: Ignore Vercel's DNS instructions - your domain is proxied through Cloudflare Workers

#### Environment Variables (Vercel Dashboard)

Add these in Vercel Settings → Environment Variables:

```env
NODE_ENV=production
GITHUB_TOKEN=ghp_your_token_here
GITHUB_REPO=Scarmonit/Final
```

**Verify Deployment:**
```bash
vercel ls
# Check deployment status
```

### 5️⃣ Final Cloudflare Configuration

After deploying to all platforms, update your Cloudflare Workers routes:

1. **Edit `wrangler.toml`**:
   ```toml
   routes = [
     { pattern = "www.scarmonit.com/health", zone_id = "your_actual_zone_id" },
     { pattern = "www.scarmonit.com/solve", zone_id = "your_actual_zone_id" },
     { pattern = "www.scarmonit.com/api/*", zone_id = "your_actual_zone_id" }
   ]
   ```

2. **Redeploy Workers**:
   ```bash
   npx wrangler deploy
   ```

3. **Configure Workers Routes in Dashboard** (Alternative):
   - Go to Cloudflare Dashboard → Workers & Pages
   - Click your worker → Triggers → Routes
   - Add routes:
     - `www.scarmonit.com/health`
     - `www.scarmonit.com/solve`
     - `www.scarmonit.com/api/*`

## ✅ Verification Checklist

Test all endpoints after deployment:

```bash
# Test Cloudflare Workers
curl https://www.scarmonit.com/health
curl -X POST https://www.scarmonit.com/solve \
  -H "Content-Type: application/json" \
  -d '{"issueNumber": 1}'

# Test Railway (if using subdomain)
curl https://api.scarmonit.com/health

# Test Vercel
curl https://www.scarmonit.com/api/index
```

### Expected Responses

- **Workers /health**: `{"status":"healthy","ai":"cloudflare-workers-ai"}`
- **Workers /solve**: `{"success":true}` or issue solving response
- **Railway health**: Service-specific response
- **Vercel API**: API route response

## 🔧 Environment Variables Reference

### Required Variables (All Platforms)

| Variable | Description | Example |
|----------|-------------|---------|
| `GITHUB_TOKEN` | GitHub Personal Access Token | `ghp_xxxxxxxxxxxx` |
| `GITHUB_REPO` | Repository in owner/repo format | `Scarmonit/Final` |
| `NODE_ENV` | Environment mode | `production` |

### Platform-Specific Variables

**Railway Only:**
| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8080` |

**Vercel Only:**
- Environment variables are set via Vercel Dashboard
- Secrets prefixed with `@` in vercel.json

**Cloudflare Workers:**
- Set via `wrangler secret put` command
- No env file needed

## 🚨 Troubleshooting

### Issue: DNS not resolving
**Solution**: 
- Wait 5-10 minutes for DNS propagation
- Check DNS with: `dig www.scarmonit.com`
- Ensure Cloudflare proxy is enabled (orange cloud)

### Issue: Workers not routing correctly
**Solution**:
- Verify Zone ID in wrangler.toml
- Check Workers routes in Cloudflare Dashboard
- Ensure routes are uncommented after deployment

### Issue: Railway build failing
**Solution**:
- Check Dockerfile.railway is valid
- Verify all dependencies in package.json
- Check Railway build logs for specific errors

### Issue: Vercel deployment failing
**Solution**:
- Ensure vercel.json is valid JSON
- Check build command exists in package.json
- Verify Node.js version compatibility (20+)

### Issue: 520 or 521 errors
**Solution**:
- Check if backend services (Railway/Vercel) are running
- Verify health check endpoints are responding
- Check Cloudflare SSL/TLS settings (should be "Full" or "Full (strict)")

## 📊 Monitoring & Logs

### Cloudflare Workers
```bash
# View logs in real-time
wrangler tail

# View logs in dashboard
# Cloudflare Dashboard → Workers → Your Worker → Logs
```

### Railway
```bash
# View logs
railway logs

# View logs in dashboard
# Railway Dashboard → Your Project → Deployments → Logs
```

### Vercel
```bash
# View logs
vercel logs

# View logs in dashboard
# Vercel Dashboard → Your Project → Deployments → View Logs
```

## 🔄 Deployment Commands (Quick Reference)

```bash
# Deploy to all platforms
npm run deploy:all

# Deploy individually
npm run deploy:cloudflare  # Cloudflare Workers
npm run deploy:railway     # Railway
npm run deploy:vercel      # Vercel

# Check status
npm run deploy:status
```

## 🔐 Security Best Practices

1. **Never commit secrets** to Git
2. **Use environment variables** for all sensitive data
3. **Rotate tokens regularly** (every 90 days)
4. **Enable 2FA** on all platform accounts
5. **Use HTTPS only** - enforced by Cloudflare
6. **Review access logs** regularly in each platform

## 📚 Additional Resources

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Railway Documentation](https://docs.railway.app/)
- [Vercel Documentation](https://vercel.com/docs)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/wrangler/)

## 💡 Tips

- **Cost Optimization**: All three platforms have generous free tiers
- **High Availability**: Use Cloudflare Workers as the entry point for automatic failover
- **Performance**: Workers execute at the edge (50+ locations worldwide)
- **Monitoring**: Set up uptime monitoring with UptimeRobot or similar
- **SSL/TLS**: Managed automatically by Cloudflare (Universal SSL)

## 🆘 Getting Help

- **Issues**: Open an issue in the GitHub repository
- **Cloudflare Support**: https://support.cloudflare.com/
- **Railway Support**: https://railway.app/help
- **Vercel Support**: https://vercel.com/support

---

**Last Updated**: October 2024
**Maintained by**: Scarmonit Team

