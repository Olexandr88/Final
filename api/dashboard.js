/**
 * Vercel Serverless Function - Dashboard Endpoint
 * Serves the AI Dashboard at /api/dashboard and /dashboard
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Read and serve the dashboard HTML
    const dashboardPath = join(process.cwd(), 'public', 'dashboard.html');
    const dashboardHTML = readFileSync(dashboardPath, 'utf-8');

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(dashboardHTML);
  } catch (error) {
    console.error('Error serving dashboard:', error);
    return res.status(500).json({
      error: 'Failed to load dashboard',
      message: error.message,
    });
  }
}
