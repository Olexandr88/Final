import express from 'express';
import { CometAutomationAgent } from '../agents/comet-automation-agent.js';
import { logger } from '../utils/logger.js';

/**
 * Comet Automation API Router
 * Provides REST endpoints for controlling Comet browser automation
 * @module comet-api
 */

const router = express.Router();

// Singleton agent instance
let cometAgent = null;

/**
 * Initialize Comet agent if not already running
 */
async function ensureAgent() {
  if (!cometAgent) {
    cometAgent = new CometAutomationAgent();
    await cometAgent.initialize();
  }
  return cometAgent;
}

/**
 * GET /api/comet/status
 * Get agent status and capabilities
 */
router.get('/status', async (req, res) => {
  try {
    const agent = await ensureAgent();

    res.json({
      success: true,
      data: {
        agentId: agent.config.agentId,
        isConnected: agent.isConnected,
        isCometRunning: agent.isCometRunning,
        capabilities: agent.capabilities,
        bridgeWS: agent.config.bridgeWS,
        debugPort: agent.config.debugPort,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Status check failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/comet/navigate
 * Navigate to a URL
 * Body: { url: string }
 */
router.post('/navigate', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required',
      });
    }

    const agent = await ensureAgent();
    const result = await agent.navigate(url);

    res.json({
      success: true,
      data: {
        url,
        frameId: result.frameId,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Navigation failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/comet/execute
 * Execute JavaScript in browser
 * Body: { script: string }
 */
router.post('/execute', async (req, res) => {
  try {
    const { script } = req.body;

    if (!script) {
      return res.status(400).json({
        success: false,
        error: 'Script is required',
      });
    }

    const agent = await ensureAgent();
    const result = await agent.executeScript(script);

    res.json({
      success: true,
      data: { result },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Script execution failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/comet/extract
 * Extract data from page using CSS selector
 * Body: { selector: string }
 */
router.post('/extract', async (req, res) => {
  try {
    const { selector } = req.body;

    if (!selector) {
      return res.status(400).json({
        success: false,
        error: 'Selector is required',
      });
    }

    const agent = await ensureAgent();
    const data = await agent.extractData(selector);

    res.json({
      success: true,
      data: {
        selector,
        results: data,
        count: data.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Data extraction failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/comet/screenshot
 * Capture screenshot of current page
 */
router.post('/screenshot', async (req, res) => {
  try {
    const agent = await ensureAgent();
    const screenshot = await agent.takeScreenshot();

    res.json({
      success: true,
      data: {
        screenshot,
        format: 'png',
        encoding: 'base64',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Screenshot failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/comet/search
 * Perform autonomous search using Comet's AI
 * Body: { query: string }
 */
router.post('/search', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required',
      });
    }

    const agent = await ensureAgent();
    const results = await agent.autonomousSearch(query);

    res.json({
      success: true,
      data: {
        query,
        results,
        count: results.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Search failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/comet/restart
 * Restart the Comet agent
 */
router.post('/restart', async (req, res) => {
  try {
    if (cometAgent) {
      await cometAgent.destroy();
      cometAgent = null;
    }

    const agent = await ensureAgent();

    res.json({
      success: true,
      data: {
        message: 'Comet agent restarted successfully',
        agentId: agent.config.agentId,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Restart failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Cleanup on server shutdown
 */
process.on('SIGTERM', async () => {
  if (cometAgent) {
    await cometAgent.destroy();
  }
});

process.on('SIGINT', async () => {
  if (cometAgent) {
    await cometAgent.destroy();
  }
});

export default router;
