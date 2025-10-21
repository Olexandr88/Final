# Interactive AI Dashboard Guide

## Overview

The Scarmonit AI Dashboard provides real-time monitoring and control of your AI agent infrastructure deployed across multiple platforms (Vercel, Railway, Cloudflare).

**Live Dashboard**: [https://www.scarmonit.com/dashboard](https://www.scarmonit.com/dashboard)

## Features

### 1. Real-Time Monitoring

- **Auto-refresh**: Updates every 5 seconds automatically
- **System Health**: Live uptime, memory usage, and response times
- **Agent Status**: Active agent count and operational status
- **Performance Metrics**: Visual progress bars for resource utilization

### 2. Multi-Platform Deployment Status

- **Vercel**: Edge deployment status and health
- **Railway**: Server deployment monitoring
- **Cloudflare Workers**: CDN and worker status

### 3. CI/CD Workflow Visualization

- **GitHub Actions**: Real-time workflow execution status
- **Build Status**: Success/failure indicators
- **Deployment Pipeline**: Track deployments across environments

### 4. Jules Automation Metrics

- **Auto-fixes Applied**: Count of automated fixes
- **Optimizations**: Performance improvements made
- **Issues Resolved**: Total issues automatically resolved

### 5. Quick Actions

- **Health Check**: Manual health verification
- **Start/Stop Agents**: Control agent execution
- **GitHub Links**: Direct access to repository
- **Deploy**: Trigger production deployments

## Architecture

```
┌─────────────────────────────────────────────────┐
│         www.scarmonit.com/dashboard             │
└────────────────┬────────────────────────────────┘
                 │
       ┌─────────┼─────────┐
       │         │         │
       ▼         ▼         ▼
   ┌──────┐ ┌──────┐ ┌──────────┐
   │Vercel│ │Railway│ │Cloudflare│
   │ API  │ │ API  │ │  Workers │
   └──┬───┘ └──┬───┘ └────┬─────┘
      │        │           │
      └────────┼───────────┘
               │
        ┌──────▼──────┐
        │   /health   │
        │   /status   │
        │   /api/*    │
        └─────────────┘
```

## API Endpoints

### Health Check

```bash
GET https://www.scarmonit.com/health
```

**Response:**

```json
{
  "status": "healthy",
  "uptime": 3600,
  "timestamp": "2025-10-21T17:55:00Z",
  "agent": "running",
  "memory": {
    "rss": 52428800,
    "heapTotal": 20971520,
    "heapUsed": 15728640
  }
}
```

### Dashboard Data

```bash
GET https://www.scarmonit.com/api/dashboard
```

Returns the complete dashboard HTML with embedded real-time JavaScript.

### Deployment Status

```bash
GET https://www.scarmonit.com/api/status
```

**Response:**

```json
{
  "vercel": {
    "status": "active",
    "url": "https://final-ten-sigma-56.vercel.app",
    "deployedAt": "2025-10-21T17:30:00Z"
  },
  "railway": {
    "status": "active",
    "health": "healthy"
  },
  "cloudflare": {
    "status": "active",
    "workers": 1
  }
}
```

## Local Development

### Run Dashboard Locally

```bash
# Install dependencies
npm install

# Start local server (http://localhost:8080)
npm run dashboard:dev
```

The dashboard will open at `http://localhost:8080/dashboard.html`.

### Modify Dashboard

1. Edit `public/dashboard.html`
2. Refresh browser to see changes
3. Deploy when ready:

```bash
npm run dashboard:deploy
```

## Configuration

### Update API Endpoints

In `public/dashboard.html`, modify the `API_BASE` constant:

```javascript
const API_BASE = 'https://www.scarmonit.com';
```

### Adjust Refresh Interval

Change the `REFRESH_INTERVAL` constant (in milliseconds):

```javascript
const REFRESH_INTERVAL = 5000; // 5 seconds
```

### Customize Theme

CSS variables are defined at the top of the `<style>` section:

```css
:root {
  --bg-dark: #0a0a0a;
  --bg-darker: #050505;
  --text-primary: #ffffff;
  --text-secondary: #888888;
  --accent-purple: #8b5cf6;
  --accent-blue: #3b82f6;
  --success: #10b981;
  --warning: #f59e0b;
  --danger: #ef4444;
}
```

## Deployment

### Deploy to Vercel

```bash
# Deploy dashboard to production
npm run deploy:vercel

# Or use comprehensive deployment script
npm run deploy:production
```

### Verify Deployment

```bash
# Check all platform statuses
npm run deploy:status
```

### Domain Configuration

The dashboard is configured for:

- Primary: `https://www.scarmonit.com/dashboard`
- Alias: `https://scarmonit.com/dashboard`
- Development: `https://final-ten-sigma-56.vercel.app/dashboard`

**DNS Setup** (in Cloudflare/your DNS provider):

```
Type    Name    Value                       TTL
A       @       76.76.21.21                 Auto
CNAME   www     cname.vercel-dns.com        Auto
```

See [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md) for complete DNS instructions.

## Monitoring

### Health Checks

The dashboard automatically monitors:

- System uptime
- Memory usage (RSS, heap)
- Response times
- Agent status
- Deployment health

### Alerts

Toast notifications appear for:

- ✅ Successful operations
- ⚠️ Warnings (high memory usage)
- ❌ Errors (failed health checks)

### Metrics Collection

Metrics are collected via:

1. `/health` endpoint (system metrics)
2. GitHub API (workflow status)
3. Platform APIs (deployment status)

## Troubleshooting

### Dashboard Won't Load

**Issue**: Dashboard shows blank page or 404

**Solutions**:

1. Verify Vercel deployment: `npm run deploy:status`
2. Check DNS configuration: `nslookup www.scarmonit.com`
3. Clear browser cache and reload
4. Check browser console for errors

### Data Not Updating

**Issue**: Dashboard shows stale data

**Solutions**:

1. Check `/health` endpoint is responding: `curl https://www.scarmonit.com/health`
2. Verify auto-refresh is enabled (check console logs)
3. Check for CORS errors in browser console
4. Restart agents: `npm run agent:orchestrator`

### High Memory Usage

**Issue**: Memory metrics show >80% usage

**Solutions**:

1. Restart agents to clear memory leaks
2. Review agent logs for memory issues
3. Check for zombie processes
4. Scale up Railway instance if needed

### 502/503 Errors

**Issue**: Gateway errors when accessing dashboard

**Solutions**:

1. Check Railway server status
2. Verify Vercel deployment health
3. Check Cloudflare Workers status
4. Run full deployment: `npm run deploy:production`

## Advanced Usage

### Custom Agent Integration

Add custom agent status to dashboard:

```javascript
// In public/dashboard.html
async function loadCustomAgent() {
  const response = await fetch('/api/custom-agent');
  const data = await response.json();
  // Update dashboard UI
}
```

### Webhook Integration

Receive real-time updates via webhooks:

```javascript
// Add WebSocket connection
const ws = new WebSocket('wss://www.scarmonit.com/ws');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  updateDashboard(data);
};
```

### Export Metrics

Export dashboard metrics to CSV:

```javascript
function exportMetrics() {
  const metrics = collectAllMetrics();
  const csv = convertToCSV(metrics);
  downloadFile('metrics.csv', csv);
}
```

## Security

### CORS Configuration

Dashboard API endpoints have CORS enabled:

```javascript
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
```

### Security Headers

Vercel configuration includes:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`

### Rate Limiting

API endpoints are rate-limited by Vercel:

- 100 requests/minute per IP
- Burst limit: 20 requests/second

## Performance

### Optimization Tips

1. **Reduce Refresh Interval**: Increase to 10-30 seconds for lower load
2. **Lazy Load Metrics**: Only fetch visible metrics
3. **Cache API Responses**: Use service workers for caching
4. **Compress Responses**: Enable gzip/brotli compression

### Lighthouse Scores

Target metrics:

- Performance: >90
- Accessibility: >95
- Best Practices: >90
- SEO: >90

## Support

### Documentation

- [Production Deployment Guide](PRODUCTION_DEPLOYMENT.md)
- [GitHub Repository](https://github.com/Scarmonit/Final)
- [Vercel Documentation](https://vercel.com/docs)

### Issues

Report issues at: https://github.com/Scarmonit/Final/issues

### Contact

Email: scarmonit@gmail.com

---

**Dashboard Version**: 1.0.0  
**Last Updated**: October 21, 2025  
**Status**: ✅ Production Ready
