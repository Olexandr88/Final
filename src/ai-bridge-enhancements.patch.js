/**
 * AI Bridge Enhancements - Additional API Endpoints
 * Add these endpoints to src/ai-bridge.js after the /api/clients endpoint (line 497)
 */

// GET /api/history - Message history (dashboard compatible alias)
app.get('/api/history', (req, res) => {
  const { limit, agentId, taskId, intent } = req.query;
  res.json({
    history: bridge.getHistory({
      limit: limit ? Number(limit) : undefined,
      agentId,
      taskId,
      intent,
    }),
  });
});

// POST /api/batch-send - Send multiple messages efficiently
app.post('/api/batch-send', (req, res) => {
  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  if (messages.length > 100) {
    return res.status(400).json({ error: 'Maximum 100 messages per batch' });
  }

  try {
    const envelopes = messages.map((msg) => ({
      from: msg.from || 'batch-api',
      to: msg.to,
      intent: msg.intent || 'agent.message',
      payload: msg.payload,
      taskId: msg.taskId,
    }));

    const results = bridge.acceptEnvelopeBatch(envelopes);
    const successful = results.filter((r) => r.success).length;

    res.status(202).json({
      success: true,
      processed: results.length,
      successful,
      failed: results.length - successful,
      results,
    });
  } catch (error) {
    logger.error(`[Bridge] Error in batch send:`, error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/export/metrics - Export metrics as CSV
app.get('/api/export/metrics', (req, res) => {
  const stats = bridge.getStats();
  const timestamp = new Date().toISOString();

  const csvLines = [
    'Metric,Value,Timestamp',
    `Connected Clients,${stats.connectedClients},${timestamp}`,
    `Messages Processed,${stats.messagesProcessed},${timestamp}`,
    `Messages Per Second,${stats.messagesPerSecond.toFixed(2)},${timestamp}`,
    `Queued Messages,${stats.queuedMessages},${timestamp}`,
    `Errors,${stats.errors},${timestamp}`,
    `Uptime (seconds),${stats.uptime},${timestamp}`,
    `History Size,${stats.historySize},${timestamp}`,
    `History Limit,${historyLimit},${timestamp}`,
  ];

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="a2a-metrics-${Date.now()}.csv"`);
  res.send(csvLines.join('\n'));
});
