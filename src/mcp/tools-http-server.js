#!/usr/bin/env node
/**
 * HTTP Tools Server for Ollama + MCP Tools
 * Exposes the full tool suite over HTTP so any app can use it, not just VS Code.
 */
import express from 'express';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import { logger } from '../utils/logger.js';
import ContinueOllamaMCPServer from './continue-ollama-server.js';

const PORT = process.env.OLLAMA_TOOLS_PORT ? Number(process.env.OLLAMA_TOOLS_PORT) : 9568;
const API_KEY = process.env.OLLAMA_TOOLS_API_KEY || '';

async function main() {
  // Instantiate the MCP server class but don't start stdio transport
  const mcp = new ContinueOllamaMCPServer();
  // Initialize model detector (normally done in start())
  await mcp.modelDetector?.initialize?.();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  // Basic rate limiting
  const limiter = rateLimit({ windowMs: 60_000, max: 120 });
  app.use(limiter);

  // Optional API key auth
  app.use((req, res, next) => {
    if (!API_KEY) return next();
    const key = req.headers['x-api-key'] || req.query.api_key;
    if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
    next();
  });

  // List available tools
  app.get('/tools', (_req, res) => {
    res.json({
      tools: [
        'list_models',
        'select_model',
        'autocomplete',
        'chat',
        'analyze_code',
        'refactor_code',
        'read_file',
        'write_file',
        'list_dir',
        'search_code',
        'execute_command',
        'run_tests',
        'get_context',
        'fetch_url',
        'git_status',
        'edit_file_patch',
      ],
      activeModel: mcp.activeModel,
    });
  });

  // Invoke a tool
  app.post('/tool/:name', async (req, res) => {
    const { name } = req.params;
    const args = req.body || {};

    try {
      const handlerMap = {
        list_models: mcp._handleListModels.bind(mcp),
        select_model: mcp._handleSelectModel.bind(mcp),
        autocomplete: mcp._handleAutocomplete.bind(mcp),
        chat: mcp._handleChat.bind(mcp),
        analyze_code: mcp._handleAnalyzeCode.bind(mcp),
        refactor_code: mcp._handleRefactorCode.bind(mcp),
        read_file: mcp._handleReadFile.bind(mcp),
        write_file: mcp._handleWriteFile.bind(mcp),
        list_dir: mcp._handleListDir.bind(mcp),
        search_code: mcp._handleSearchCode.bind(mcp),
        execute_command: mcp._handleExecuteCommand.bind(mcp),
        run_tests: mcp._handleRunTests.bind(mcp),
        get_context: mcp._handleGetContext.bind(mcp),
        fetch_url: mcp._handleFetchUrl.bind(mcp),
        git_status: mcp._handleGitStatus.bind(mcp),
        edit_file_patch: mcp._handleEditFilePatch.bind(mcp),
      };

      const fn = handlerMap[name];
      if (!fn) return res.status(404).json({ error: `Unknown tool: ${name}` });

      const result = await fn(args);
      // result.content is MCP-style; unwrap text if present
      const payload = Array.isArray(result?.content)
        ? result.content[0]?.text
          ? JSON.parse(result.content[0].text)
          : result
        : result;
      res.json(payload);
    } catch (e) {
      logger.error('Tool error', { tool: name, error: e.message });
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/health', (_req, res) => {
    res.json({ ok: true, model: mcp.activeModel, time: new Date().toISOString() });
  });

  app.listen(PORT, () => {
    logger.info(`Ollama Tools HTTP server listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  logger.error('Failed to start tools server', { error: err.message });
  process.exit(1);
});
