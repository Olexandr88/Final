# 🚀 Automated Deployment Setup - www.scarmonit.com

## ✨ GitHub Actions CI/CD Pipeline

I've created an automated deployment workflow that will deploy your application to all three platforms (Cloudflare, Railway, Vercel) automatically whenever you push to the `main` branch!

---

## 📋 Setup Requirements

### Required GitHub Secrets

Go to your repository settings → Secrets and variables → Actions, and add these secrets:

#### 1. **Cloudflare Secrets**
- `CLOUDFLARE_API_TOKEN` - Get from: https://dash.cloudflare.com/profile/api-tokens
  - Create token with "Edit Cloudflare Workers" permission
- `CLOUDFLARE_ACCOUNT_ID` - Get from: Cloudflare Dashboard → Workers & Pages → Overview

#### 2. **Railway Secrets**
- `RAILWAY_TOKEN` - Get from: Railway Dashboard → Account Settings → Tokens
- `RAILWAY_SERVICE_ID` - Get from: Railway project URL (after `/service/`)

#### 3. **Vercel Secrets**
- `VERCEL_TOKEN` - Get from: Vercel Dashboard → Settings → Tokens
- `VERCEL_ORG_ID` - Run: `vercel whoami` (shows your org ID)
- `VERCEL_PROJECT_ID` - Get from: Vercel project settings

---

## 🎯 How to Get Each Secret

### Cloudflare API Token

```bash
# 1. Go to https://dash.cloudflare.com/profile/api-tokens
# 2. Click "Create Token"
# 3. Use "Edit Cloudflare Workers" template
# 4. Select your zone (scarmonit.com)
# 5. Create token and copy it
```

**Add to GitHub:**
- Name: `CLOUDFLARE_API_TOKEN`
- Value: `your_token_here`

**Account ID:**
```bash
# Get from Cloudflare dashboard right sidebar or:
# https://dash.cloudflare.com → Click on Workers → Copy Account ID
```

### Railway Token

```bash
# 1. Go to https://railway.app/account/tokens
# 2. Click "Create New Token"
# 3. Name it "GitHub Actions"
# 4. Copy the token

# Or use CLI:
railway login
railway token
```

**Add to GitHub:**
- Name: `RAILWAY_TOKEN`
- Value: `your_railway_token`

**Service ID:**
```bash
# From your Railway project URL:
# https://railway.app/project/PROJECT_ID/service/SERVICE_ID
# Copy the SERVICE_ID part
```

### Vercel Token

```bash
# 1. Go to https://vercel.com/account/tokens
# 2. Click "Create"
# 3. Name it "GitHub Actions"
# 4. Copy the token

# Or use CLI:
vercel login
# Token will be in ~/.vercel/auth.json
```

**Project Info:**
```bash
# Link your project first:
cd Final-production
vercel link

# This creates .vercel/project.json with:
# - projectId (VERCEL_PROJECT_ID)
# - orgId (VERCEL_ORG_ID)
```

---

## 🔄 Deployment Workflow

### Automatic Deployment (Recommended)

Just push to main:

```bash
cd Final-production
git add .
git commit -m "feat: trigger deployment"
git push origin main
```

The GitHub Action will automatically:
1. Deploy to Cloudflare Workers ✅
2. Deploy to Railway ✅
3. Deploy to Vercel ✅
4. Verify all deployments ✅

### Manual Deployment Trigger

You can also trigger deployment manually:

1. Go to: https://github.com/Scarmonit/Final/actions
2. Click "Deploy to Production" workflow
3. Click "Run workflow"
4. Select environment: production
5. Click "Run workflow"

---

## 🎨 Dashboard Access

After deployment completes:

- **Primary**: https://www.scarmonit.com/
- **Dashboard**: https://www.scarmonit.com/dashboard
- **Health**: https://www.scarmonit.com/health
- **Status**: https://www.scarmonit.com/status

---

## 🔍 Monitor Deployment

### Watch GitHub Actions

```bash
# View in GitHub
https://github.com/Scarmonit/Final/actions

# Or use GitHub CLI
gh run watch
gh run list
```

### Check Logs

After deployment, check platform logs:

**Cloudflare:**
```bash
wrangler tail
```

**Railway:**
```bash
railway logs
```

**Vercel:**
```bash
vercel logs
```

---

## ✅ Verification Steps

The workflow automatically verifies:

1. **Dashboard loads** (HTTP 200)
2. **Health endpoint responds** (status: healthy)
3. **All platforms deployed** successfully

Manual verification:

```bash
# Test dashboard
curl https://www.scarmonit.com/

# Test health
curl https://www.scarmonit.com/health

# Test status
curl https://www.scarmonit.com/status
```

---

## 🚨 Troubleshooting

### Workflow Failed

Check which job failed:
1. Go to Actions tab
2. Click failed workflow
3. Check error logs for each job

Common issues:
- **Missing secrets**: Add all required secrets in repo settings
- **Zone ID not set**: Update `wrangler.toml` with your Cloudflare Zone ID
- **Authentication**: Re-generate tokens if expired

### Deployment Successful but Site Not Loading

1. **Check DNS**:
   ```bash
   dig www.scarmonit.com
   # Should show Cloudflare IPs
   ```

2. **Check Cloudflare Routes**:
   - Go to Cloudflare Dashboard → Workers → Routes
   - Verify routes are active for www.scarmonit.com

3. **Check Backend**:
   ```bash
   # Railway health
   railway logs

   # Vercel deployment
   vercel ls
   ```

---

## 🎉 Success!

Once all secrets are configured and you push to `main`, your application will be automatically deployed to:

- ✅ Cloudflare Workers (Edge)
- ✅ Railway (Backend)
- ✅ Vercel (Serverless)

**Your interactive AI dashboard will be live at:**
**https://www.scarmonit.com/dashboard** 🚀

---

## 📚 Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Cloudflare Workers Deploy Action](https://github.com/cloudflare/wrangler-action)
- [Railway Deploy Guide](https://docs.railway.app/deploy/deployments)
- [Vercel Deploy Action](https://github.com/amondnet/vercel-action)

---

**Last Updated**: October 21, 2025
**Status**: Ready for automated deployment ✅