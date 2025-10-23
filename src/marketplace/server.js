/**
 * Marketplace Server
 * Express server for marketplace API
 * @module marketplace/server
 */

import express from 'express';
import cors from 'cors';
import { logger } from '../utils/logger.js';
import database from './database/init.js';
import marketplaceRoutes from './api/routes.js';
import bridgeAdapter from './ai-bridge-adapter.js';

const app = express();
const PORT = process.env.MARKETPLACE_PORT || 65030;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
    });
  });
  next();
});

// Mount marketplace routes
app.use('/marketplace', marketplaceRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'LLM Marketplace',
    version: '1.0.0',
    status: 'operational',
    endpoints: {
      search: '/marketplace/search',
      featured: '/marketplace/featured',
      recent: '/marketplace/recent',
      installed: '/marketplace/installed',
      package: '/marketplace/package/:id',
      install: '/marketplace/install',
      uninstall: '/marketplace/uninstall',
      rate: '/marketplace/rate',
      stats: '/marketplace/stats/:id',
      health: '/marketplace/health',
    },
    ai_bridge: {
      connected: bridgeAdapter.isConnected(),
      url: 'ws://localhost:65028',
    },
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
  });

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
    path: req.path,
  });
});

/**
 * Start marketplace server
 * @returns {Promise<Object>} Server instance
 */
export async function startMarketplaceServer() {
  try {
    // Initialize database
    logger.info('Initializing marketplace database...');
    database.initialize();

    const healthCheck = database.healthCheck();
    logger.info('Database health check', { health: healthCheck });

    // Start server
    return new Promise((resolve, reject) => {
      const server = app.listen(PORT, () => {
        logger.info('Marketplace server started', {
          port: PORT,
          endpoints: [
            `http://localhost:${PORT}`,
            `http://localhost:${PORT}/marketplace`,
          ],
          ai_bridge: bridgeAdapter.isConnected() ? 'connected' : 'disconnected',
        });
        resolve(server);
      });

      server.on('error', (error) => {
        logger.error('Server startup failed', { error: error.message });
        reject(error);
      });
    });
  } catch (error) {
    logger.error('Failed to start marketplace server', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Stop marketplace server
 * @param {Object} server - Server instance
 */
export async function stopMarketplaceServer(server) {
  return new Promise((resolve, reject) => {
    if (!server) {
      resolve();
      return;
    }

    server.close((error) => {
      if (error) {
        logger.error('Failed to stop server', { error: error.message });
        reject(error);
      } else {
        // Close database
        database.close();

        // Disconnect from AI Bridge
        bridgeAdapter.disconnect();

        logger.info('Marketplace server stopped');
        resolve();
      }
    });
  });
}

// If running directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  startMarketplaceServer().catch((error) => {
    logger.error('Startup failed', { error: error.message });
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    await stopMarketplaceServer();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully...');
    await stopMarketplaceServer();
    process.exit(0);
  });
}

export default app;
