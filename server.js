#!/usr/bin/env node

/**
 * Railway HTTP Server with Health Check
 * Provides HTTP endpoint for Railway deployment
 * Runs autonomous agents in the background
 */

const http = require('http');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';

let agentProcess = null;
let isHealthy = false;

// Create HTTP server
const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS for CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check endpoint
  if (req.url === '/health' || req.url === '/') {
    const healthStatus = {
      status: isHealthy ? 'healthy' : 'starting',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      agent: agentProcess ? 'running' : 'stopped',
      memory: process.memoryUsage(),
      port: PORT
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(healthStatus, null, 2));
    return;
  }

  // Status endpoint
  if (req.url === '/status') {
    const status = {
      agent: agentProcess ? 'running' : 'stopped',
      pid: agentProcess ? agentProcess.pid : null,
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status, null, 2));
    return;
  }

  // Default 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Start autonomous agent in background
function startAgent() {
  console.log('Starting autonomous agent...');
  
  try {
    agentProcess = spawn('node', ['scripts/autonomous-orchestrator.js'], {
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' }
    });

    agentProcess.on('error', (error) => {
      console.error('Agent process error:', error);
      isHealthy = false;
      // Restart after 5 seconds
      setTimeout(startAgent, 5000);
    });

    agentProcess.on('exit', (code) => {
      console.log(`Agent process exited with code ${code}`);
      agentProcess = null;
      isHealthy = false;
      // Restart after 5 seconds if not intentional shutdown
      if (code !== 0) {
        setTimeout(startAgent, 5000);
      }
    });

    // Mark as healthy after startup
    setTimeout(() => {
      isHealthy = true;
      console.log('Agent marked as healthy');
    }, 2000);

  } catch (error) {
    console.error('Failed to start agent:', error);
    isHealthy = false;
    setTimeout(startAgent, 5000);
  }
}

// Start the server
server.listen(PORT, HOST, () => {
  console.log(`🚀 Railway server running on http://${HOST}:${PORT}`);
  console.log(`📊 Health check: http://${HOST}:${PORT}/health`);
  console.log(`📈 Status: http://${HOST}:${PORT}/status`);
  
  // Start agent after server is ready
  startAgent();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    if (agentProcess) {
      agentProcess.kill();
    }
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(() => {
    if (agentProcess) {
      agentProcess.kill();
    }
    process.exit(0);
  });
});
