# ✅ DEPLOYMENT CHECKLIST - www.scarmonit.com

**Quick Reference**: Step-by-step guide to deploy Scarmonit/Final to production

---

## OVERVIEW

**Total Time**: 25-30 minutes
**Difficulty**: Easy (2 manual steps, rest automated)
**Prerequisites**: GitHub account, Cloudflare account

---

## PRE-DEPLOYMENT CHECKLIST

### ✅ Repository Status

- [x] Code committed to GitHub
- [x] CI/CD pipeline configured (`.github/workflows/deploy-production.yml`)
- [x] Server configured (`server.js`)
- [x] Dashboard created (`public/dashboard.html`)
- [x] Cloudflare Worker ready (`workers/webhook-handler.js`)
- [x] Platform configs ready (`wrangler.toml`, `railway.json`, `vercel.json`)
- [x] Documentation complete (5 guides)

**Status**: ✅ All pre-deployment requirements met

---

## STEP 1: CONFIGURE CLOUDFLARE ZONE ID (5 minutes)

### 1.1 Get Your Zone ID

1. Visit: https://dash.cloudflare.com/
2. Click on your domain: **scarmonit.com**
3. Look at the **right sidebar** under "API"
4. Copy the **Zone ID** (format: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`)

**Screenshot**: The Zone ID is clearly labeled in the API section

---

### 1.2 Update wrangler.toml

**File**: `C:/Users/scarm/Final-production/wrangler.toml`

**Find** (6 locations):
```toml
zone_id = "YOUR_ZONE_ID"
```

**Replace with** (your actual Zone ID):
```toml
zone_id = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
```

**Using VS Code**:
1. Open `wrangler.toml`
2. Press `Ctrl+H` (Find and Replace)
3. Find: `YOUR_ZONE_ID`
4. Replace: `<paste your Zone ID>`
5. Click "Replace All" (should show 6 replacements)
6. Save file (`Ctrl+S`)

**Using Command Line**:
```bash
cd C:/Users/scarm/Final-production

# Before: Verify placeholder exists
grep "YOUR_ZONE_ID" wrangler.toml
# Should show 6 lines

# Replace (use your actual Zone ID)
sed -i 's/YOUR_ZONE_ID/a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6/g' wrangler.toml

# After: Verify replacement
grep "YOUR_ZONE_ID" wrangler.toml
# Should show nothing

grep "zone_id" wrangler.toml
# Should show 6 lines with your actual Zone ID
```

---

### 1.3 Verify Configuration

```bash
# Should show 0 (no more placeholders)
grep -c "YOUR_ZONE_ID" wrangler.toml

# Should show 6 (all routes configured)
grep -c "zone_id" wrangler.toml
```

**Status**: ✅ Zone ID configured

---

## STEP 2: ADD GITHUB SECRETS (10 minutes)

### 2.1 Navigate to GitHub Secrets

1. Visit: https://github.com/Scarmonit/Final/settings/secrets/actions
2. Click: **"New repository secret"** for each secret below

---

### 2.2 Add Cloudflare Secrets (2 secrets)

#### Secret 1: CLOUDFLARE_API_TOKEN

**How to Get**:
1. Visit: https://dash.cloudflare.com/profile/api-tokens
2. Click: **"Create Token"**
3. Use template: **"Edit Cloudflare Workers"**
4. Account Resources: Include → Your Account
5. Zone Resources: Include → Specific zone → scarmonit.com
6. Client IP Address Filtering: (leave empty)
7. TTL: (leave empty for no expiration)
8. Click: **"Continue to summary"**
9. Click: **"Create Token"**
10. **Copy the token** (you won't see it again!)

**Add to GitHub**:
- Name: `CLOUDFLARE_API_TOKEN`
- Value: `<paste token>`
- Click: "Add secret"

---

#### Secret 2: CLOUDFLARE_ACCOUNT_ID

**How to Get**:
1. Visit: https://dash.cloudflare.com/
2. Click: **Workers & Pages** (left sidebar)
3. Look at the **right sidebar** under "Account ID"
4. Copy the **Account ID** (format: `abc123def456...`)

**Alternative**: Look in the URL when viewing your Workers:
```
https://dash.cloudflare.com/{ACCOUNT_ID}/workers/...
```

**Add to GitHub**:
- Name: `CLOUDFLARE_ACCOUNT_ID`
- Value: `<paste account ID>`
- Click: "Add secret"

---

### 2.3 Add Railway Secrets (2 secrets)

#### Secret 3: RAILWAY_TOKEN

**How to Get**:
1. Visit: https://railway.app/account/tokens
2. Click: **"Create New Token"**
3. Name: `GitHub Actions`
4. Click: **"Create"**
5. **Copy the token** immediately

**Alternative (CLI)**:
```bash
# Install Railway CLI (if not installed)
npm install -g @railway/cli

# Login
railway login

# Generate token
railway token
# Copy the output
```

**Add to GitHub**:
- Name: `RAILWAY_TOKEN`
- Value: `<paste token>`
- Click: "Add secret"

---

#### Secret 4: RAILWAY_SERVICE_ID

**How to Get**:
1. Visit: https://railway.app/
2. Click on your **Final** project
3. Click on your **service** (usually shows as "Final" or "web")
4. Look at the URL:
```
https://railway.app/project/{PROJECT_ID}/service/{SERVICE_ID}
```
5. Copy the **SERVICE_ID** part (after `/service/`)

**Alternative**: Look in `railway.json` if you've already deployed once

**Add to GitHub**:
- Name: `RAILWAY_SERVICE_ID`
- Value: `<paste service ID>`
- Click: "Add secret"

---

### 2.4 Add Vercel Secrets (3 secrets)

#### Secret 5: VERCEL_TOKEN

**How to Get**:
1. Visit: https://vercel.com/account/tokens
2. Click: **"Create"**
3. Token Name: `GitHub Actions`
4. Scope: **Full Account**
5. Expiration: Never (or set to 1 year)
6. Click: **"Create Token"**
7. **Copy the token**

**Alternative (CLI)**:
```bash
# Install Vercel CLI (if not installed)
npm install -g vercel

# Login
vercel login

# Token is stored in:
# Windows: C:/Users/scarm/.vercel/auth.json
# View it: type C:/Users/scarm/.vercel/auth.json
```

**Add to GitHub**:
- Name: `VERCEL_TOKEN`
- Value: `<paste token>`
- Click: "Add secret"

---

#### Secret 6: VERCEL_ORG_ID

**How to Get (Method 1 - CLI)**:
```bash
# Show org ID
vercel whoami
# Output includes: Org ID: org_abc123...
```

**Method 2 - Link Project**:
```bash
cd C:/Users/scarm/Final-production
vercel link
# Follow prompts, then check:
cat .vercel/project.json
```

**Output**:
```json
{
  "orgId": "org_abc123...",
  "projectId": "prj_xyz789..."
}
```

**Add to GitHub**:
- Name: `VERCEL_ORG_ID`
- Value: `<paste org ID>`
- Click: "Add secret"

---

#### Secret 7: VERCEL_PROJECT_ID

**How to Get**: Same as VERCEL_ORG_ID above

**From `.vercel/project.json`**:
```json
{
  "orgId": "org_abc123...",
  "projectId": "prj_xyz789..."
}
```

**Alternative - Vercel Dashboard**:
1. Visit: https://vercel.com/dashboard
2. Click your **Final** project
3. Click: **Settings**
4. Look for: **Project ID**

**Add to GitHub**:
- Name: `VERCEL_PROJECT_ID`
- Value: `<paste project ID>`
- Click: "Add secret"

---

### 2.5 Verify All Secrets Added

Visit: https://github.com/Scarmonit/Final/settings/secrets/actions

**Should see 7 secrets**:
- ✅ CLOUDFLARE_API_TOKEN
- ✅ CLOUDFLARE_ACCOUNT_ID
- ✅ RAILWAY_TOKEN
- ✅ RAILWAY_SERVICE_ID
- ✅ VERCEL_TOKEN
- ✅ VERCEL_ORG_ID
- ✅ VERCEL_PROJECT_ID

**Status**: ✅ All secrets configured

---

## STEP 3: DEPLOY (10 minutes)

### Option A: Automated GitHub Actions (RECOMMENDED)

**Commit and push your Zone ID change**:

```bash
cd C:/Users/scarm/Final-production

# Stage changes
git add wrangler.toml

# Commit
git commit -m "chore: configure Cloudflare Zone ID for production deployment"

# Push to main (triggers deployment)
git push origin main
```

**Monitor Deployment**:
1. Visit: https://github.com/Scarmonit/Final/actions
2. Click on the latest workflow run
3. Watch the 4 jobs:
   - ✅ deploy-cloudflare (3-4 min)
   - ✅ deploy-railway (2-3 min)
   - ✅ deploy-vercel (2-3 min)
   - ✅ verify-deployment (1-2 min)

**Total Time**: 7-11 minutes

---

### Option B: Manual Workflow Dispatch

**Use when**: You want to deploy without pushing code

1. Visit: https://github.com/Scarmonit/Final/actions
2. Click: **"Deploy to Production"** (left sidebar)
3. Click: **"Run workflow"** (right side)
4. Select branch: `main`
5. Select environment: `production`
6. Click: **"Run workflow"** (green button)

**Same automation as Option A, just manual trigger**

---

### Option C: Local Deployment Script

**Prerequisites**:
```bash
# Install CLIs
npm install -g @railway/cli vercel wrangler

# Authenticate
railway login
vercel login
wrangler login
```

**Execute**:
```bash
cd C:/Users/scarm/Final-production
node scripts/deploy-production.js
```

**What happens**:
1. Checks prerequisites ✅
2. Installs dependencies ✅
3. Runs tests (if configured) ✅
4. Deploys to Railway ✅
5. Deploys to Vercel ✅
6. Deploys to Cloudflare ✅
7. Verifies health endpoints ✅
8. Prints summary ✅

---

## STEP 4: VERIFY DEPLOYMENT (5 minutes)

### 4.1 Wait for Propagation

**After deployment completes, wait 1-2 minutes** for:
- DNS propagation
- Platform synchronization
- Health checks to stabilize

---

### 4.2 Test Dashboard

**Command Line**:
```bash
curl -I https://www.scarmonit.com/
```

**Expected**:
```
HTTP/2 200
content-type: text/html
...
```

**Browser**:
1. Open: https://www.scarmonit.com/dashboard
2. **Should see**:
   - ✅ Purple gradient background
   - ✅ "Scarmonit AI Dashboard" header
   - ✅ System Health card (status, uptime, memory)
   - ✅ Active Agents section
   - ✅ Performance Metrics chart (Chart.js)
   - ✅ Quick Actions buttons (Refresh, Logs, Health Check)
   - ✅ Deployed Agents cards (Railway, Cloudflare, Vercel)
   - ✅ Activity Log streaming

3. **Verify metrics update every 5 seconds**

---

### 4.3 Test Health Endpoint

```bash
curl https://www.scarmonit.com/health
```

**Expected**:
```json
{
  "status": "healthy",
  "uptime": 123.45,
  "timestamp": "2025-10-21T21:30:00.000Z",
  "agent": "running",
  "platform": "railway"
}
```

---

### 4.4 Test Status Endpoint

```bash
curl https://www.scarmonit.com/status
```

**Expected**:
```json
{
  "agent": "running",
  "pid": 1234,
  "memory": {
    "rss": 50331648,
    "heapTotal": 16777216,
    "heapUsed": 8388608
  },
  "uptime": 123.45
}
```

---

### 4.5 Check Platform Logs

**Cloudflare Workers**:
```bash
npx wrangler tail
# Press Ctrl+C to stop
```

**Railway**:
```bash
railway logs
# Look for:
# "🚀 Railway server running on port 8080"
# "Agent marked as healthy"
```

**Vercel**:
- Visit: https://vercel.com/dashboard
- Click: Final project
- Check: Deployment status (Production - Ready)

---

### 4.6 DNS Verification

```bash
# Check DNS resolution
dig www.scarmonit.com

# Should show Cloudflare nameservers
# Should return Cloudflare IPs (104.xx.xx.xx or 172.xx.xx.xx)
```

**Online Tool**: https://www.whatsmydns.net/#A/www.scarmonit.com
- Check propagation worldwide

---

## SUCCESS CRITERIA

### ✅ Deployment Successful When:

- [x] GitHub Actions workflow completed (all 4 jobs green)
- [ ] Dashboard loads at https://www.scarmonit.com/
- [ ] Health endpoint returns `{"status":"healthy"}`
- [ ] Agent status shows "running"
- [ ] Real-time metrics update every 5 seconds
- [ ] No errors in browser console
- [ ] No 4xx/5xx errors in platform logs
- [ ] DNS resolves correctly
- [ ] All 3 platforms show "deployed" status

---

## TROUBLESHOOTING

### Dashboard Returns 404

**Check**:
```bash
# 1. DNS propagation
dig www.scarmonit.com

# 2. Cloudflare routes
# Visit: https://dash.cloudflare.com/
# Workers & Pages → scarmonit-final → Routes
# Verify all 6 routes are active

# 3. Railway status
railway status
railway logs
```

---

### 520/521 Cloudflare Error

**Check**:
```bash
# 1. Railway service
railway status

# 2. Recent logs
railway logs --tail 50

# 3. Restart if needed
railway restart
```

---

### GitHub Actions Failed

**Check**:
1. Visit: https://github.com/Scarmonit/Final/actions
2. Click failed workflow
3. Review error logs

**Common Issues**:
- Missing secret: Add at Settings → Secrets → Actions
- Zone ID placeholder: Update wrangler.toml
- Token expired: Regenerate and update secret

---

### "starting" Status

**Wait 15 seconds**, then check again:
```bash
sleep 15
curl https://www.scarmonit.com/health
```

**If still "starting" after 30 seconds**:
```bash
railway logs
# Look for errors or "Agent marked as healthy"
```

---

## ROLLBACK PROCEDURE

If something goes wrong:

```bash
# Option 1: Revert last commit
git revert HEAD
git push origin main

# Option 2: Reset to previous commit
git log --oneline
git reset --hard <previous-commit-sha>
git push --force origin main

# GitHub Actions will automatically redeploy the previous version
```

---

## POST-DEPLOYMENT TASKS

### Monitor for 24 Hours

- [ ] Check dashboard every few hours
- [ ] Monitor platform logs for errors
- [ ] Verify uptime > 99%
- [ ] Test from different locations/networks

### Set Up Monitoring

- [ ] UptimeRobot or similar (https://uptimerobot.com/)
- [ ] Cloudflare Analytics (built-in)
- [ ] Railway metrics (built-in)
- [ ] Vercel Analytics (built-in)

### Documentation

- [ ] Update team on deployment
- [ ] Document any issues encountered
- [ ] Share dashboard URL with stakeholders

---

## QUICK REFERENCE

### URLs

- **Dashboard**: https://www.scarmonit.com/dashboard
- **Health**: https://www.scarmonit.com/health
- **Status**: https://www.scarmonit.com/status
- **GitHub Actions**: https://github.com/Scarmonit/Final/actions
- **Cloudflare**: https://dash.cloudflare.com/
- **Railway**: https://railway.app/
- **Vercel**: https://vercel.com/dashboard

### Commands

```bash
# Quick health check
curl https://www.scarmonit.com/health

# Platform logs
npx wrangler tail
railway logs
vercel logs

# Restart services
railway restart

# Redeploy
git push origin main  # GitHub Actions
# OR
node scripts/deploy-production.js  # Local
```

---

## CONCLUSION

✅ **You're ready to deploy!**

**Just 3 steps**:
1. Configure Cloudflare Zone ID (5 min)
2. Add 7 GitHub Secrets (10 min)
3. Push to main branch (10 min deployment)

**Total Time**: 25-30 minutes

**Result**: Your interactive AI dashboard will be **LIVE** at **https://www.scarmonit.com/dashboard** 🚀

---

**Next**: See `DEPLOYMENT_READINESS_REPORT.md` for comprehensive technical details

**Status**: ✅ **READY TO DEPLOY**