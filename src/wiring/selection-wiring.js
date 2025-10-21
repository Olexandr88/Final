#!/usr/bin/env node
import { createAIBridgeServer } from '../ai-bridge.js';
import TabSelectionManager from '../selection/tab-selection-manager.js';

(async () => {
  const server = await createAIBridgeServer();
  const { bridge, httpServer } = server;

  // Wire selected-text events via envelopes
  const selectionManager = new TabSelectionManager();

  bridge.on('envelopeProcessed', async (envelope) => {
    try {
      if (envelope.intent === 'selected.text' && envelope.payload?.text && envelope.context?.tabId) {
        const result = await selectionManager.handleTextSelection(
          envelope.context.tabId,
          envelope.payload.text,
          envelope.context || {}
        );
        // Emit analysis back to sender or broadcast
        if (envelope.from) {
          bridge.acceptEnvelope({
            intent: 'selected.text.analysis',
            to: envelope.from,
            from: 'selection.manager',
            context: { tabId: envelope.context.tabId },
            payload: result
          });
        }
      }

      if (envelope.intent === 'tab.optimize' && envelope.context?.tabId) {
        const optimization = await selectionManager.optimizeCurrentTab(
          envelope.context.tabId,
          envelope.payload || {}
        );
        if (envelope.from) {
          bridge.acceptEnvelope({
            intent: 'tab.optimize.result',
            to: envelope.from,
            from: 'selection.manager',
            context: { tabId: envelope.context.tabId },
            payload: optimization
          });
        }
      }
    } catch (error) {
      // Report error back
      if (envelope.from) {
        bridge.acceptEnvelope({
          intent: 'selection.error',
          to: envelope.from,
          from: 'selection.manager',
          payload: { message: error.message }
        });
      }
    }
  });

  // Expose metrics endpoint via HTTP API
  if (httpServer && httpServer.get) {
    httpServer.get('/api/selections/stats', (req, res) => {
      res.json(selectionManager.getStorageStats());
    });

    httpServer.get('/api/selections/latest', (req, res) => {
      const limit = parseInt(req.query.limit) || 10;
      res.json(selectionManager.getLatestSelections(limit));
    });

    httpServer.get('/api/selections/search', (req, res) => {
      const query = req.query.q || '';
      const limit = parseInt(req.query.limit) || 50;
      res.json(selectionManager.searchSelections(query, limit));
    });

    httpServer.get('/api/selections/metrics', (req, res) => {
      res.json(selectionManager.getPerformanceMetrics());
    });
  }
})();
