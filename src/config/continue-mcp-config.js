/**
 * Continue MCP Configuration
 * Centralized configuration for Continue-Ollama MCP server
 */

export const CONTINUE_MCP_CONFIG = {
  // Ollama configuration
  ollama: {
    endpoint: process.env.OLLAMA_ENDPOINT || 'http://localhost:11434',
    defaultModel: process.env.OLLAMA_DEFAULT_MODEL || 'llama3',
    timeout: 30000,
    retries: 2
  },

  // MCP transport configuration
  transport: {
    type: process.env.MCP_TRANSPORT || 'stdio', // 'stdio' or 'http'
    httpPort: process.env.MCP_HTTP_PORT || 3100
  },

  // Model cache configuration
  cache: {
    ttl: parseInt(process.env.CONTINUE_CACHE_TTL) || 300000, // 5 minutes
    maxSize: 100
  },

  // Health monitoring
  health: {
    checkInterval: 60000, // 1 minute
    timeout: 5000
  },

  // Autocomplete optimization
  autocomplete: {
    maxTokens: 100,
    temperature: 0.2,
    timeout: 2000 // Low latency target
  },

  // Agent mode configuration
  agent: {
    maxHistoryLength: 50,
    contextWindow: 10, // Number of exchanges to include
    temperature: 0.7
  },

  // AI Bridge integration (optional)
  aiBridge: {
    enabled: process.env.AI_BRIDGE_INTEGRATION !== 'false',
    endpoint: process.env.AI_BRIDGE_WS || 'ws://localhost:65028',
    httpEndpoint: process.env.AI_BRIDGE_HTTP || 'http://localhost:65029'
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    logRequests: process.env.NODE_ENV === 'development'
  }
};

/**
 * Validate configuration
 */
export function validateContinueMCPConfig() {
  const issues = [];

  // Check Ollama endpoint
  if (!CONTINUE_MCP_CONFIG.ollama.endpoint) {
    issues.push({
      level: 'error',
      message: 'Ollama endpoint not configured',
      fix: 'Set OLLAMA_ENDPOINT environment variable'
    });
  }

  // Check transport type
  if (!['stdio', 'http'].includes(CONTINUE_MCP_CONFIG.transport.type)) {
    issues.push({
      level: 'error',
      message: `Invalid transport type: ${CONTINUE_MCP_CONFIG.transport.type}`,
      fix: 'Set MCP_TRANSPORT to either "stdio" or "http"'
    });
  }

  return {
    valid: issues.filter(i => i.level === 'error').length === 0,
    issues,
    config: CONTINUE_MCP_CONFIG
  };
}

export default CONTINUE_MCP_CONFIG;
