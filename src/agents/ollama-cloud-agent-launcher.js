#!/usr/bin/env node
/**
 * Ollama Cloud Agent Launcher
 * Standalone script to launch the cloud agent
 */

import { OllamaCloudAgent } from './ollama-cloud-agent.js';
import { logger } from '../utils/logger.js';
import { validateConfig } from '../config/ollama-cloud-config.js';
import dotenv from 'dotenv';

dotenv.config();

// Validate configuration
const validation = validateConfig();

if (!validation.valid) {
  logger.error('Configuration validation failed:');
  validation.issues.forEach((issue) => {
    logger.error(`  [${issue.level.toUpperCase()}] ${issue.message}`);
    if (issue.fix) {
      logger.info(`    Fix: ${issue.fix}`);
    }
  });

  if (validation.issues.some((i) => i.level === 'error')) {
    process.exit(1);
  }
}

// Log warnings
validation.issues
  .filter((i) => i.level === 'warning')
  .forEach((issue) => {
    logger.warn(issue.message);
    if (issue.fix) {
      logger.info(`  Fix: ${issue.fix}`);
    }
  });

// Create and start agent
const agent = new OllamaCloudAgent({
  clientId: process.env.OLLAMA_CLOUD_AGENT_ID || 'ollama-cloud-agent-1',
  cloudEndpoint: process.env.OLLAMA_CLOUD_ENDPOINT,
  cloudApiKey: process.env.OLLAMA_CLOUD_API_KEY,
  cloudModel: process.env.OLLAMA_CLOUD_MODEL,
  fallbackToLocal: process.env.OLLAMA_FALLBACK_TO_LOCAL !== 'false',
  bridgeUrl: process.env.BRIDGE_WS || 'ws://localhost:65028',
});

// Health status logging
setInterval(() => {
  const metrics = agent.getMetrics();
  const health = metrics.cloudHealth;

  logger.info('Agent Status:', {
    connected: agent.isConnected,
    cloudStatus: health.status,
    totalRequests: metrics.totalRequests,
    successRate:
      ((metrics.successfulRequests / Math.max(metrics.totalRequests, 1)) * 100).toFixed(1) + '%',
    fallbackRate:
      ((metrics.fallbackRequests / Math.max(metrics.totalRequests, 1)) * 100).toFixed(1) + '%',
    avgLatency: `${metrics.averageLatency.toFixed(0)}ms`,
    consecutiveFailures: health.consecutiveFailures,
  });
}, 60000); // Every minute

// Connect to bridge
agent.connect().catch((error) => {
  logger.error('Failed to connect to AI Bridge:', error);
  process.exit(1);
});

// Graceful shutdown
function shutdown() {
  logger.info('\n🛑 Shutting down Ollama Cloud Agent...');

  agent
    .disconnect()
    .then(() => {
      logger.info('✅ Agent disconnected cleanly');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

logger.info('🚀 Ollama Cloud Agent launched');
logger.info(`   Endpoint: ${agent.cloudClient.config.endpoint}`);
logger.info(`   Model: ${agent.cloudClient.config.model}`);
logger.info(`   Fallback: ${agent.fallbackEnabled ? 'Enabled' : 'Disabled'}`);
logger.info(`   Streaming: ${agent.cloudClient.config.streamingEnabled ? 'Enabled' : 'Disabled'}`);
