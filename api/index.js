/**
 * Vercel Serverless Function - Main API Endpoint
 * Endpoint: /api/index or /
 */

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Main response
  return res.status(200).json({
    message: 'Scarmonit API - Vercel Serverless Functions',
    platform: 'vercel',
    domain: 'www.scarmonit.com',
    endpoints: {
      health: '/health',
      api: '/api/*',
      docs: 'https://github.com/Scarmonit/Final'
    },
    status: 'operational',
    timestamp: new Date().toISOString()
  });
}

