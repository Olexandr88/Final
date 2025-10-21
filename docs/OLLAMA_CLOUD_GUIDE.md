# Ollama Cloud Models Integration Guide

## Overview

The Ollama Cloud Models feature extends the LLM Multi-Provider Framework to support remote/cloud-hosted Ollama instances with intelligent fallback to local models. This enables scalable AI processing with automatic failover and comprehensive health monitoring.

## Features

- ✅ **Multi-Provider Support**: Cloud, local, or hybrid configurations
- ✅ **Automatic Fallback**: Seamless cloud → local fallback on failure
- ✅ **Health Monitoring**: Real-time endpoint health checks with circuit breaker
- ✅ **WebSocket Streaming**: Real-time token streaming via AI Bridge (port 65028)
- ✅ **Provider Factory**: Intelligent provider selection based on health
- ✅ **Comprehensive Testing**: 90%+ test coverage with node:test framework

## Quick Start

### 1. Environment Configuration

Create a `.env` file (or update existing):

```bash
# Cloud Ollama Configuration
OLLAMA_CLOUD_ENDPOINT=https://your-cloud-ollama-instance.com
OLLAMA_CLOUD_API_KEY=your-api-key-here
OLLAMA_CLOUD_MODEL=llama3:70b

# Fallback Configuration
OLLAMA_FALLBACK_TO_LOCAL=true
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama2

# Provider Selection (auto, cloud, local)
OLLAMA_PROVIDER=auto
```

### 2. Start the Cloud Agent

```bash
# Start AI Bridge first
npm run start:bridge

# In another terminal, start the cloud agent
npm run start:ollama-cloud
```

### 3. Test the Integration

```bash
# Run tests
npm test tests/ollama-cloud-client.test.js

# Check agent health
curl http://localhost:65029/api/agents
```

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────┐
│              A2A Bridge (WebSocket Hub)                 │
│                   Port: 65028                           │
└─────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┴───────────────┐
           │                               │
┌──────────▼──────────┐        ┌──────────▼───────────┐
│  OllamaCloudAgent   │        │  Local Ollama Agent  │
│  (Cloud Provider)   │        │    (Fallback)        │
└──────────┬──────────┘        └──────────┬───────────┘
           │                               │
┌──────────▼──────────┐        ┌──────────▼───────────┐
│ OllamaCloudClient   │        │   Ollama API Client  │
│ (HTTP/WebSocket)    │        │ (http://localhost)   │
└─────────────────────┘        └──────────────────────┘
```

### File Structure

```
src/
├── clients/
│   └── ollama-cloud-client.js      # Cloud API client
├── agents/
│   ├── ollama-cloud-agent.js       # Cloud agent (extends BaseAgent)
│   └── provider-factory.js         # Provider selection logic
└── config/
    └── ollama-cloud-config.js      # Configuration constants

tests/
└── ollama-cloud-client.test.js     # Comprehensive test suite

docs/
└── OLLAMA_CLOUD_GUIDE.md           # This file
```

## Usage Examples

### Basic Text Generation

```javascript
import { OllamaCloudAgent } from './src/agents/ollama-cloud-agent.js';

// Create cloud agent
const agent = new OllamaCloudAgent({
  cloudEndpoint: 'https://your-cloud-ollama.com',
  cloudApiKey: 'your-api-key',
  fallbackToLocal: true,
});

// Connect to AI Bridge
await agent.connect();

// Send a generation request through the bridge
agent.send({
  type: 'envelope',
  envelope: {
    from: 'test-client',
    to: 'ollama-cloud-agent',
    intent: 'ai.query',
    payload: {
      message: 'Explain quantum computing in simple terms',
    },
  },
});

// Listen for response
agent.on('message', (envelope) => {
  if (envelope.intent === 'ai.response') {
    console.log('Response:', envelope.payload.response);
    console.log('Provider:', envelope.payload.provider);
    console.log('Latency:', envelope.payload.latency);
  }
});
```

### Streaming Generation

```javascript
import { OllamaCloudClient } from './src/clients/ollama-cloud-client.js';

const client = new OllamaCloudClient({
  endpoint: 'https://cloud-ollama.com',
  streamingEnabled: true,
});

// Stream tokens
const result = await client.generateStream(
  {
    prompt: 'Write a short story about AI',
    num_predict: 500,
  },
  (token) => {
    process.stdout.write(token); // Print each token as it arrives
  }
);

console.log('\n\nComplete!', result.provider);
```

### Provider Factory (Auto-Selection)

```javascript
import { ProviderFactory } from './src/agents/provider-factory.js';

const factory = new ProviderFactory({
  preferredProvider: 'auto', // Tries cloud, falls back to local
  fallbackEnabled: true,
});

// Create agent (auto-selects based on health)
const agent = await factory.createAgent({
  clientId: 'smart-agent',
});

await agent.connect();

// Check which provider was selected
console.log('Active providers:', factory.getActiveProviders());
console.log('Health status:', factory.getHealthStatus());
```

### Health Monitoring

```javascript
import { OllamaCloudClient } from './src/clients/ollama-cloud-client.js';

const client = new OllamaCloudClient();

// Manual health check
const health = await client.healthCheck();
console.log('Status:', health.status);
console.log('Latency:', health.latency);
console.log('Available models:', health.models);

// Get current health (from last check)
const currentHealth = client.getHealth();
console.log('Last success:', currentHealth.lastSuccess);
console.log('Consecutive failures:', currentHealth.consecutiveFailures);
console.log('Circuit breaker:', currentHealth.status);
```

## Configuration Reference

### OllamaCloudClient Options

```javascript
{
  endpoint: 'https://cloud-ollama.com',    // Cloud endpoint URL
  apiKey: 'sk-...',                        // API key (if required)
  model: 'llama3:70b',                     // Default model
  timeout: 30000,                          // Request timeout (ms)
  retries: 2,                              // Retry attempts
  streamingEnabled: true,                  // Enable WebSocket streaming
  fallbackToLocal: true,                   // Auto-fallback to local
  healthCheckInterval: 60000               // Health check frequency (ms)
}
```

### OllamaCloudAgent Options

```javascript
{
  clientId: 'my-cloud-agent',              // Unique agent ID
  cloudEndpoint: 'https://...',            // Cloud endpoint
  cloudApiKey: 'sk-...',                   // API key
  cloudModel: 'llama3:70b',                // Cloud model
  fallbackToLocal: true,                   // Enable fallback
  streamingEnabled: true,                  // Enable streaming
  bridgeUrl: 'ws://localhost:65028'        // AI Bridge URL
}
```

## Cloud Provider Integration

### Replicate

```bash
OLLAMA_CLOUD_ENDPOINT=https://api.replicate.com/v1
OLLAMA_CLOUD_API_KEY=r8_...
OLLAMA_CLOUD_MODEL=meta/llama-2-70b
```

### Modal

```bash
OLLAMA_CLOUD_ENDPOINT=https://modal.com/api/v1
OLLAMA_CLOUD_API_KEY=ak-...
OLLAMA_CLOUD_MODEL=llama3
```

### Self-Hosted

```bash
OLLAMA_CLOUD_ENDPOINT=https://your-server.com:11434
# No API key needed for basic auth
OLLAMA_CLOUD_MODEL=llama2
```

## Troubleshooting

### Cloud Connection Issues

```bash
# Check cloud endpoint health
node -e "import('./src/clients/ollama-cloud-client.js').then(async m => {
  const client = new m.OllamaCloudClient();
  const health = await client.healthCheck();
  console.log(health);
  await client.close();
})"
```

### Fallback Not Working

1. Ensure local Ollama is running:

   ```bash
   ollama serve
   ```

2. Verify fallback is enabled:

   ```bash
   echo $OLLAMA_FALLBACK_TO_LOCAL  # Should be 'true' or unset
   ```

3. Check local endpoint:
   ```bash
   curl http://localhost:11434/api/tags
   ```

### Circuit Breaker Open

The circuit breaker opens after 3 consecutive failures. Wait 60 seconds for it to reset, or restart the agent:

```bash
npm run start:ollama-cloud
```

## Performance Optimization

### Connection Pooling

The cloud client uses HTTP keep-alive and connection pooling for better performance:

```javascript
{
  performance: {
    connectionPooling: true,
    keepAlive: true,
    maxSockets: 10,
    maxFreeSockets: 5
  }
}
```

### Streaming for Large Responses

Use streaming for responses > 100 tokens to reduce latency:

```javascript
// Instead of:
const result = await client.generate({ prompt, num_predict: 1000 });

// Use:
const result = await client.generateStream({ prompt, num_predict: 1000 }, onToken);
```

### Caching

Implement response caching for repeated queries:

```javascript
const cache = new Map();

function getCachedOrGenerate(prompt) {
  if (cache.has(prompt)) {
    return cache.get(prompt);
  }

  const result = await client.generate({ prompt });
  cache.set(prompt, result);
  return result;
}
```

## Security Best Practices

1. **Never commit API keys** - Use environment variables only
2. **Use HTTPS endpoints** - Avoid unencrypted cloud connections
3. **Implement rate limiting** - Prevent API quota exhaustion
4. **Monitor costs** - Track cloud API usage
5. **Rotate keys regularly** - Update API keys every 90 days

## Testing

### Run All Tests

```bash
npm test tests/ollama-cloud-client.test.js
npm test tests/ollama-cloud-agent.test.js
npm test tests/provider-factory.test.js
```

### Coverage Report

```bash
npm run test:coverage
```

### Integration Testing

```bash
# Start services
npm run start:bridge &
npm run start:ollama-cloud &

# Run integration tests
npm test tests/integration/ollama-cloud-integration.test.js
```

## Monitoring & Metrics

### Agent Metrics

```javascript
const metrics = agent.getMetrics();
console.log({
  totalRequests: metrics.totalRequests,
  successRate: metrics.successfulRequests / metrics.totalRequests,
  averageLatency: metrics.averageLatency,
  fallbackRate: metrics.fallbackRequests / metrics.totalRequests,
});
```

### Health Dashboard

The AI Orchestrator UI (electron app) includes real-time monitoring:

```bash
npm start  # Launch Electron app
```

Dashboard shows:

- Cloud endpoint status
- Real-time latency graphs
- Request success/failure rates
- Circuit breaker state
- Fallback statistics

## Migration from Local-Only

### Before (Local Only)

```javascript
import { A2AOllamaAgent } from './src/agents/a2a-ollama-agent.js';

const agent = new A2AOllamaAgent();
await agent.connect();
```

### After (Cloud with Fallback)

```javascript
import { OllamaCloudAgent } from './src/agents/ollama-cloud-agent.js';

const agent = new OllamaCloudAgent({
  cloudEndpoint: process.env.OLLAMA_CLOUD_ENDPOINT,
  fallbackToLocal: true,
});
await agent.connect();
```

No other code changes required! The agent maintains the same interface.

## FAQ

**Q: Can I use multiple cloud providers?**
A: Yes, create multiple agent instances with different endpoints.

**Q: Does streaming work with all cloud providers?**
A: WebSocket streaming requires WebSocket support on the cloud endpoint. HTTP streaming (SSE) works with all providers.

**Q: How do I disable fallback?**
A: Set `OLLAMA_FALLBACK_TO_LOCAL=false` or pass `fallbackToLocal: false` in config.

**Q: What happens if both cloud and local fail?**
A: The agent returns an error response with details about both failures.

**Q: Can I use this with the Electron UI?**
A: Yes! The cloud agent integrates seamlessly with the AI Orchestrator dashboard.

## Support

- GitHub Issues: https://github.com/Scarmonit/LLM/issues
- Documentation: `/docs/OLLAMA_CLOUD_GUIDE.md`
- Main README: `/README.md`
- CLAUDE.md: `/electron/CLAUDE.md`

## License

ISC - Same as parent project

---

**Last Updated**: 2025-10-21
**Version**: 1.0.0
