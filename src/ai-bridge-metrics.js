#!/usr/bin/env node
/**
 * AI Bridge Metrics Endpoint
 * Provides real-time metrics and health status
 */

export function attachMetricsEndpoint(app, bridge) {
  // Health check endpoint
  app.get('/health', (req, res) => {
    const uptime = Date.now() - bridge.startTime;
    res.json({
      status: 'healthy',
      uptime: uptime,
      uptimeHuman: formatUptime(uptime),
      timestamp: new Date().toISOString()
    });
  });

  // Metrics endpoint
  app.get('/api/metrics', (req, res) => {
    const uptime = Date.now() - bridge.startTime;
    const clients = Array.from(bridge.clients.values()).map(({ meta }) => ({
      id: meta.id,
      role: meta.role,
      labels: meta.labels,
      connectedAt: meta.connectedAt,
      lastSeen: meta.lastSeen
    }));

    res.json({
      uptime: uptime,
      uptimeHuman: formatUptime(uptime),
      clients: {
        total: clients.length,
        byRole: groupByRole(clients),
        list: clients
      },
      stats: {
        messagesProcessed: bridge.stats.messagesProcessed,
        totalConnections: bridge.stats.totalConnections,
        errors: bridge.stats.errors,
        lastError: bridge.stats.lastError
      },
      history: {
        count: bridge.history.length,
        limit: bridge.historyLimit
      },
      queues: {
        totalQueued: Array.from(bridge.messageQueue.values()).reduce((sum, q) => sum + q.length, 0)
      },
      timestamp: new Date().toISOString()
    });
  });

  // Clients list endpoint
  app.get('/api/clients', (req, res) => {
    const clients = Array.from(bridge.clients.values()).map(({ meta }) => ({
      id: meta.id,
      role: meta.role,
      labels: meta.labels,
      tools: meta.tools,
      intents: meta.intents,
      maxConcurrentTasks: meta.maxConcurrentTasks,
      connectedAt: meta.connectedAt,
      lastSeen: meta.lastSeen
    }));

    res.json({
      count: clients.length,
      clients: clients,
      timestamp: new Date().toISOString()
    });
  });

  // History endpoint with pagination
  app.get('/api/history', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const history = bridge.history.toArray();
    const slice = history.slice(offset, offset + limit);

    res.json({
      total: history.length,
      limit: limit,
      offset: offset,
      messages: slice,
      timestamp: new Date().toISOString()
    });
  });
}

function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function groupByRole(clients) {
  const groups = {};
  for (const client of clients) {
    const role = client.role || 'unknown';
    groups[role] = (groups[role] || 0) + 1;
  }
  return groups;
}
