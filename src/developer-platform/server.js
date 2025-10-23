/**
 * Developer Platform Server
 * Express server for blog, events, learning paths, communities
 * @module developer-platform/server
 */

import express from 'express';
import cors from 'cors';
import database from './database/init.js';
import routes from './api/routes.js';
import { logger } from '../utils/logger.js';
import manifest from './manifest.json' assert { type: 'json' };

const app = express();
const PORT = manifest.port || 65031;

// Middleware
app.use(cors(manifest.security.cors));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info('HTTP Request', {
    method: req.method,
    path: req.path,
    query: req.query,
  });
  next();
});

// Mount API routes
app.use('/developer-platform', routes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    components: manifest.components,
    endpoints: {
      blog: {
        search: '/developer-platform/blog/search',
        post: '/developer-platform/blog/:idOrSlug',
        featured: '/developer-platform/blog-featured',
        recent: '/developer-platform/blog-recent',
        comments: '/developer-platform/blog/:postId/comments',
      },
      events: {
        search: '/developer-platform/events/search',
        event: '/developer-platform/events/:idOrSlug',
        register: '/developer-platform/events/:eventId/register',
        featured: '/developer-platform/events-featured',
        userRegistrations: '/developer-platform/events/user/:userId/registrations',
      },
      health: '/developer-platform/health',
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

/**
 * Start developer platform server
 * @returns {Promise<Object>} Server instance
 */
export async function startDeveloperPlatformServer() {
  try {
    // Initialize database
    database.initialize();
    logger.info('Developer platform database initialized');

    // Start server
    return new Promise((resolve) => {
      const server = app.listen(PORT, () => {
        logger.info('Developer platform server started', {
          port: PORT,
          environment: process.env.NODE_ENV || 'development',
        });
        resolve(server);
      });

      // Graceful shutdown
      process.on('SIGTERM', () => {
        logger.info('SIGTERM received, closing server gracefully');
        server.close(() => {
          database.close();
          logger.info('Server closed');
          process.exit(0);
        });
      });

      process.on('SIGINT', () => {
        logger.info('SIGINT received, closing server gracefully');
        server.close(() => {
          database.close();
          logger.info('Server closed');
          process.exit(0);
        });
      });
    });
  } catch (error) {
    logger.error('Failed to start developer platform server', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startDeveloperPlatformServer().catch((error) => {
    logger.error('Fatal error starting server', { error: error.message });
    process.exit(1);
  });
}

export default app;
