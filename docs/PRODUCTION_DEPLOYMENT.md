# Production Deployment Guide

## 🚀 Quick Start

```bash
# Deploy to production (Vercel)
npm run deploy:production

# Deploy to all platforms
npm run deploy:all

# Check deployment status
npm run deploy:status
```

## 📋 Prerequisites

### Required Tools
- Node.js 18+ installed
- Git repository initialized
- Vercel CLI installed (`npm i -g vercel`)
- Railway CLI (optional): `npm i -g @railway/cli`
- Cloudflare Wrangler (optional): `npm i -g wrangler`

### Environment Setup

1. **Vercel Authentication**
   ```bash
   vercel login
   ```

2. **Railway Authentication** (optional)
   ```bash
   railway login
   ```

3. **Cloudflare Authentication** (optional)
   ```bash
   wrangler login
   ```

## 🌐 Domain Configuration (www.scarmonit.com)

### Vercel Domain Setup

1. **Add Domain in Vercel Dashboard**
   - Go to https://vercel.com/dashboard
   - Select your project
   - Navigate to Settings → Domains
   - Add `www.scarmonit.com` and `scarmonit.com`

2. **DNS Configuration**
   
   Add these records to your DNS provider:
   
   ```
   Type: CNAME
   Name: www
   Value: cname.vercel-dns.com
   TTL: 3600
   
   Type: A
   Name: @
   Value: 76.76.21.21
   TTL: 3600
   ```

3. **SSL Certificate**
   - Vercel automatically provisions SSL certificates
   - Certificate will be active within 24 hours

### Railway Domain Setup (optional)

1. Go to Railway dashboard
2. Select your project
3. Click on Settings → Networking
4. Add custom domain
5. Follow DNS configuration instructions

### Cloudflare Workers Setup (optional)

1. Update `wrangler.toml` with your zone_id
2. Configure routes in Cloudflare dashboard
3. Deploy with `npm run deploy:cloudflare`

## 🔧 Deployment Scripts

### Production Deployment

```bash
node scripts/deploy-production.js
```

**Features:**
- Pre-deployment validation
- Automated testing
- Build verification
- Health checks
- Deployment reporting

**Process:**
1. ✅ Pre-checks (Git status, dependencies)
2. 🏗️ Build project
3. 🚀 Deploy to Vercel
4. 🏥 Health checks (all endpoints)
5. 📊 Generate deployment report

### Manual Deployment

**Vercel:**
```bash
vercel --prod
```

**Railway:**
```bash
railway up
```

**Cloudflare:**
```bash
wrangler deploy
```

## 📊 Monitoring

### Health Check Endpoints

- **Main**: https://www.scarmonit.com/health
- **Status**: https://www.scarmonit.com/status
- **Dashboard**: https://www.scarmonit.com/dashboard

### Deployment Reports

Deployment reports are saved to `reports/deployment-*.json`

**Report Contents:**
- Deployment timestamp
- Duration
- Pre-check results
- Build status
- Deployment status per platform
- Health check results

## 🔍 Troubleshooting

### Common Issues

**Issue: Domain not resolving**
- Check DNS propagation (can take up to 48 hours)
- Verify DNS records are correct
- Use `dig www.scarmonit.com` to check DNS

**Issue: SSL certificate not provisioned**
- Wait 24 hours for auto-provisioning
- Ensure domain ownership is verified
- Check Vercel dashboard for certificate status

**Issue: Health check fails**
- Verify deployment completed successfully
- Check server logs for errors
- Test endpoints manually with curl

**Issue: Build fails**
- Check Node version (18+ required)
- Verify all dependencies installed
- Review build logs for errors

### Debug Commands

```bash
# Check deployment status
vercel ls

# View logs
vercel logs

# Test health endpoint
curl https://www.scarmonit.com/health

# Test dashboard
curl https://www.scarmonit.com/dashboard

# Check DNS
dig www.scarmonit.com
nslookup www.scarmonit.com
```

## 🔄 Continuous Deployment

### GitHub Actions Integration

Deployments are automatically triggered on:
- Push to `main` branch
- Pull request merge
- Manual workflow dispatch

### Rollback Procedure

```bash
# Vercel rollback to previous deployment
vercel rollback

# Or specify deployment URL
vercel rollback https://final-abc123.vercel.app
```

## 📈 Performance Optimization

### Caching Strategy

- Static assets: 1 year cache
- API responses: No cache (must-revalidate)
- HTML pages: No cache (for dashboard updates)

### CDN Configuration

Vercel automatically provides:
- Global CDN
- Edge caching
- Automatic compression
- HTTP/2 support

## 🔐 Security

### Security Headers

Configured in `vercel.json`:
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY/SAMEORIGIN
- X-XSS-Protection: 1; mode=block
- CORS headers for API endpoints

### Environment Variables

Set via Vercel dashboard:
1. Go to Settings → Environment Variables
2. Add production variables
3. Redeploy for changes to take effect

## 📞 Support

- **GitHub Issues**: https://github.com/Scarmonit/Final/issues
- **Vercel Support**: https://vercel.com/support
- **Documentation**: This file

---

**Last Updated**: 2025-10-21  
**Version**: 1.0.0  
**Maintainer**: Scarmonit
