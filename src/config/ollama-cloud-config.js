/**
 * Ollama Cloud Configuration
 * Centralized configuration for cloud-hosted Ollama instances
 */

export const OLLAMA_CLOUD_CONFIG = {
  // Cloud endpoint configuration
  endpoint: {
    default: process.env.OLLAMA_CLOUD_ENDPOINT || 'http://localhost:11434',
    // Common cloud providers (examples)
    providers: {
      replicate: 'https://api.replicate.com/v1',
      modal: 'https://modal.com/api/v1',
      custom: process.env.OLLAMA_CLOUD_ENDPOINT,
    },
  },

  // Authentication
  auth: {
    apiKey: process.env.OLLAMA_CLOUD_API_KEY || null,
    authType: 'bearer', // 'bearer', 'api-key', 'none'
  },

  // Model configuration
  models: {
    default: process.env.OLLAMA_CLOUD_MODEL || 'llama3',
    available: ['llama3', 'llama3:70b', 'llama2', 'mistral', 'mixtral', 'codellama', 'phi'],
  },

  // Generation parameters
  generation: {
    temperature: 0.7,
    top_p: 0.9,
    top_k: 40,
    num_predict: 512,
    num_ctx: 4096,
    repeat_penalty: 1.1,
  },

  // Timeout and retry configuration
  reliability: {
    timeout: 30000, // 30 seconds
    retries: 2,
    retryDelay: 1000, // 1 second base delay
    circuitBreaker: {
      threshold: 3, // failures before opening
      timeout: 60000, // 1 minute cooldown
      resetTimeout: 30000, // 30 seconds half-open period
    },
  },

  // Fallback configuration
  fallback: {
    enabled: process.env.OLLAMA_FALLBACK_TO_LOCAL !== 'false',
    localEndpoint: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    localModel: process.env.OLLAMA_MODEL || 'llama2',
  },

  // Streaming configuration
  streaming: {
    enabled: true,
    preferredMethod: 'websocket', // 'websocket', 'http', 'auto'
    chunkSize: 1024,
    bufferSize: 8192,
  },

  // Health monitoring
  health: {
    checkInterval: 60000, // 1 minute
    timeout: 5000, // 5 seconds
    retryAttempts: 3,
    statusUpdateInterval: 10000, // 10 seconds
  },

  // Performance optimization
  performance: {
    connectionPooling: true,
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 10,
    maxFreeSockets: 5,
  },

  // Logging and debugging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    logRequests: process.env.NODE_ENV === 'development',
    logResponses: process.env.NODE_ENV === 'development',
    logHealth: true,
  },
};

/**
 * Get configuration for a specific provider
 * @param {string} providerName - Provider name ('replicate', 'modal', 'custom')
 * @returns {Object} Provider-specific configuration
 */
export function getProviderConfig(providerName = 'custom') {
  const baseConfig = { ...OLLAMA_CLOUD_CONFIG };

  if (providerName !== 'custom' && OLLAMA_CLOUD_CONFIG.endpoint.providers[providerName]) {
    baseConfig.endpoint.default = OLLAMA_CLOUD_CONFIG.endpoint.providers[providerName];
  }

  return baseConfig;
}

/**
 * Validate cloud configuration
 * @returns {Object} Validation result
 */
export function validateConfig() {
  const issues = [];

  // Check endpoint
  if (
    !OLLAMA_CLOUD_CONFIG.endpoint.default ||
    OLLAMA_CLOUD_CONFIG.endpoint.default === 'http://localhost:11434'
  ) {
    issues.push({
      level: 'warning',
      message: 'Using default localhost endpoint - cloud features may not work',
      fix: 'Set OLLAMA_CLOUD_ENDPOINT environment variable',
    });
  }

  // Check API key (if using cloud provider)
  if (
    OLLAMA_CLOUD_CONFIG.endpoint.default.includes('replicate') ||
    OLLAMA_CLOUD_CONFIG.endpoint.default.includes('modal')
  ) {
    if (!OLLAMA_CLOUD_CONFIG.auth.apiKey) {
      issues.push({
        level: 'error',
        message: 'API key required for cloud provider but not configured',
        fix: 'Set OLLAMA_CLOUD_API_KEY environment variable',
      });
    }
  }

  // Check fallback configuration
  if (OLLAMA_CLOUD_CONFIG.fallback.enabled) {
    if (!OLLAMA_CLOUD_CONFIG.fallback.localEndpoint) {
      issues.push({
        level: 'warning',
        message: 'Fallback enabled but no local endpoint configured',
        fix: 'Set OLLAMA_BASE_URL environment variable',
      });
    }
  }

  return {
    valid: issues.filter((i) => i.level === 'error').length === 0,
    issues,
    config: OLLAMA_CLOUD_CONFIG,
  };
}

export default OLLAMA_CLOUD_CONFIG;
