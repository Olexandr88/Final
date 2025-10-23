# Microsoft Foundry Local Integration Guide

## Overview

This guide covers the integration of **Microsoft Foundry Local** into the LLM Multi-Provider Framework. Foundry Local provides local NPU/GPU-accelerated AI inference with privacy-focused, offline-capable features.

## What is Microsoft Foundry Local?

Foundry Local is a local AI inference platform that leverages:

- **NPU (Neural Processing Unit)** acceleration on AMD, Intel, and Qualcomm hardware
- **GPU acceleration** via DirectML/CUDA
- **CPU fallback** for universal compatibility
- **ONNX Runtime** for optimized model execution
- **Windows ML** integration for native Windows performance
- **Privacy-first** design - all data stays on your device
- **Offline capability** - works without internet connection

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────┐
│                   LLM Framework                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────────┐      ┌──────────────────┐       │
│  │ FoundryLocalClient│──────│FoundryLocalAgent │       │
│  │                  │      │     (A2A)        │       │
│  │ - OpenAI API     │      │ - WebSocket      │       │
│  │ - Model caching  │      │ - Queue mgmt     │       │
│  │ - Streaming      │      │ - History mgmt   │       │
│  └──────────────────┘      └──────────────────┘       │
│           │                         │                   │
│           └─────────────┬───────────┘                   │
│                         │                               │
├─────────────────────────┼───────────────────────────────┤
│                         ▼                               │
│              ┌─────────────────────┐                    │
│              │ foundry-local-sdk   │                    │
│              └─────────────────────┘                    │
│                         │                               │
├─────────────────────────┼───────────────────────────────┤
│                         ▼                               │
│         ┌──────────────────────────────┐               │
│         │  Foundry Local Service       │               │
│         │  (Windows Service)           │               │
│         ├──────────────────────────────┤               │
│         │  ONNX Runtime + Windows ML   │               │
│         └──────────────────────────────┘               │
│                         │                               │
│                         ▼                               │
│         ┌──────────────────────────────┐               │
│         │    Hardware Layer            │               │
│         │  NPU → GPU → CPU (priority)  │               │
│         └──────────────────────────────┘               │
└─────────────────────────────────────────────────────────┘
```

### Key Features

- **OpenAI-compatible API** - Works with existing OpenAI client code
- **Automatic hardware detection** - Selects best available hardware (NPU > GPU > CPU)
- **Model caching** - 10-minute TTL to reduce re-initialization overhead
- **Streaming support** - Real-time token-by-token responses
- **Conversation history** - Multi-turn conversations with context
- **Request queuing** - Max 2 concurrent requests for NPU memory constraints
- **Graceful degradation** - Falls back to CPU if NPU/GPU unavailable

## Installation

### Prerequisites

1. **Windows 10/11** (NPU/GPU support requires Windows)
2. **Node.js 18+**
3. **Foundry Local service** installed and running

### Install Foundry Local Service

Download and install from [Microsoft Foundry Local Releases](https://github.com/microsoft/Foundry-Local/releases):

```powershell
# Download latest release (example: v0.8.94)
# Install the MSI package
# Service starts automatically after installation
```

Verify service is running:

```powershell
# Check if service is running
Get-Service -Name "FoundryLocal" | Select-Object Status
```

### Install npm Dependencies

```bash
npm install
```

This installs `foundry-local-sdk@^0.5.0` along with other dependencies.

## Configuration

### Environment Variables

Add to your `.env` file:

```bash
# Microsoft Foundry Local Configuration
FOUNDRY_LOCAL_DEFAULT_MODEL=phi-3.5-mini
FOUNDRY_LOCAL_MODEL_TTL=600000          # 10 minutes
FOUNDRY_LOCAL_AUTO_START=true
FOUNDRY_LOCAL_HARDWARE_PREFERENCE=auto  # auto|cpu|gpu|npu
FOUNDRY_AGENT_ID=foundry-local-agent-1
```

### Constants Configuration

Default settings are in `src/config/constants.js`:

```javascript
export const LLM = {
  FOUNDRY_LOCAL: {
    DEFAULT_MODEL: 'phi-3.5-mini',
    DEFAULT_TEMPERATURE: 0.7,
    DEFAULT_MAX_TOKENS: 1024,
    MODEL_TTL_MS: 600000,              // 10 minutes
    AUTO_START: true,
    HARDWARE_PREFERENCE: 'auto',       // auto|cpu|gpu|npu
    REQUEST_TIMEOUT_MS: 30000,
    MAX_CONCURRENT_REQUESTS: 2,        // NPU memory constraint
  },
};
```

## Usage

### Basic Client Usage

```javascript
import { FoundryLocalClient } from './src/clients/foundry-local-client.js';

const client = new FoundryLocalClient({
  defaultModel: 'phi-3.5-mini',
  modelTTL: 600000,
  hardwarePreference: 'auto',
});

// Initialize with default model
const initResult = await client.initialize();
if (initResult.success) {
  console.log('Model ready:', initResult.modelInfo);
}

// Send chat request (streaming)
const result = await client.chat(
  [{ role: 'user', content: 'Hello, how are you?' }],
  { stream: true }
);

for await (const chunk of result.stream) {
  const content = chunk.choices[0]?.delta?.content;
  if (content) {
    process.stdout.write(content);
  }
}
```

### Non-Streaming Chat

```javascript
const result = await client.chat(
  [
    { role: 'user', content: 'Explain quantum computing in one sentence' }
  ],
  { stream: false, max_tokens: 100 }
);

console.log(result.response.choices[0].message.content);
```

### Conversation History

```javascript
const messages = [
  { role: 'user', content: 'My favorite color is blue' },
  { role: 'assistant', content: 'That\'s great! Blue is a calming color.' },
  { role: 'user', content: 'What is my favorite color?' }
];

const result = await client.chat(messages, { stream: false });
console.log(result.response.choices[0].message.content);
// Expected: "Your favorite color is blue"
```

### A2A Agent Usage

Start the Foundry Local agent:

```bash
npm run agent:foundry
```

The agent:
- Connects to AI Bridge on `ws://localhost:65028`
- Registers with capabilities: `chat`, `local-inference`, `npu-acceleration`, `offline-capable`
- Handles incoming chat queries with streaming support
- Maintains conversation history per conversationId
- Queues requests when max concurrency (2) is reached

### API Routes (Express.js)

```javascript
import express from 'express';
import { FoundryLocalClient } from './src/clients/foundry-local-client.js';

const app = express();
const foundryClient = new FoundryLocalClient();

app.post('/api/foundry/chat', async (req, res) => {
  const { messages, stream = true } = req.body;

  try {
    const result = await foundryClient.chat(messages, { stream });

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      for await (const chunk of result.stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }
      res.end();
    } else {
      res.json(result.response);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000);
```

## Supported Models

Foundry Local currently supports these models optimized for NPU/GPU:

- **phi-3.5-mini** (default) - 3.8B parameters, 2.5GB, fast inference
- **phi-3-mini** - 3.8B parameters, 2GB
- **phi-3-small** - 7B parameters, 4GB
- **phi-3-medium** - 14B parameters, 8GB (GPU recommended)

Model availability depends on what's cached in Foundry Local service.

## Hardware Requirements

### Minimum

- **CPU**: x64 processor with AVX2 support
- **RAM**: 8GB
- **Storage**: 5GB for models
- **OS**: Windows 10 (1809+) or Windows 11

### Recommended

- **NPU**: Intel AI Boost, AMD XDNA, or Qualcomm Hexagon NPU
- **GPU**: DirectX 12 compatible GPU with 4GB+ VRAM
- **RAM**: 16GB
- **Storage**: SSD with 10GB+ free space

## Performance

### Inference Speed (phi-3.5-mini)

| Hardware | Tokens/sec | Latency (first token) |
|----------|------------|----------------------|
| NPU      | 40-60      | ~150ms               |
| GPU      | 30-50      | ~200ms               |
| CPU      | 10-20      | ~500ms               |

### Memory Usage

- **Model loaded**: 2.5GB - 8GB (depending on model)
- **Agent process**: ~100MB baseline
- **Per-request overhead**: ~50MB peak

## Error Handling

### Service Not Running

```javascript
const isRunning = client.isServiceRunning();
if (!isRunning) {
  console.error('Foundry Local service not running!');
  console.error('Start the service: Get-Service -Name "FoundryLocal" | Start-Service');
  process.exit(1);
}
```

### Model Initialization Failed

```javascript
const initResult = await client.initialize('phi-3.5-mini');
if (!initResult.success) {
  console.error('Initialization failed:', initResult.error);
  // Try fallback model
  const fallbackResult = await client.initialize('phi-3-mini');
}
```

### Request Timeout

```javascript
try {
  const result = await client.chat(messages, {
    stream: false,
    max_tokens: 2048,
  });
} catch (error) {
  if (error.message.includes('timeout')) {
    console.error('Request timed out - try reducing max_tokens or using streaming');
  }
}
```

## Testing

### Unit Tests

```bash
npm run test -- tests/foundry-local-client.test.js
```

Unit tests use mocking and run without requiring the service.

### Integration Tests

```bash
# Start Foundry Local service first
npm run test -- tests/integration/foundry-local-integration.test.js
```

Integration tests automatically skip if service is unavailable.

## Integration Points

### With Existing Framework

1. **LLM Clients** - Follows same pattern as `ollama-client.js` and `claude-client.js`
2. **A2A Agents** - Compatible with existing `a2a-ollama-agent.js` architecture
3. **AI Bridge** - Connects to same WebSocket hub (`ws://localhost:65028`)
4. **Session Management** - Uses `session-coordinator.js` for multi-session support
5. **Logging** - Integrates with `src/utils/logger.js` (Winston)

### Router Configuration

Add to Express router:

```javascript
import { FoundryLocalClient } from './clients/foundry-local-client.js';

const foundryRouter = express.Router();
const foundryClient = new FoundryLocalClient();

foundryRouter.post('/chat', async (req, res) => {
  // Handle chat request
});

foundryRouter.get('/models', async (req, res) => {
  const models = await foundryClient.listCachedModels();
  res.json({ models });
});

app.use('/api/foundry', foundryRouter);
```

## Troubleshooting

### Issue: "Service not running"

**Solution**:
```powershell
Get-Service -Name "FoundryLocal" | Start-Service
```

### Issue: "Model not found"

**Solution**:
```bash
# Check cached models
const models = await client.listCachedModels();
console.log(models);

# Use available model name
await client.initialize(models[0].name);
```

### Issue: High memory usage

**Solution**:
- Reduce `MODEL_TTL_MS` to unload models faster
- Set `MAX_CONCURRENT_REQUESTS` to 1
- Use smaller models (phi-3-mini instead of phi-3-medium)

### Issue: Slow inference on CPU

**Solution**:
- Verify NPU/GPU drivers are installed
- Check `hardwarePreference` is set to `auto` or `npu`
- Reduce `max_tokens` in chat requests

## Security & Privacy

### Privacy Features

- **Local-only processing** - No data sent to cloud
- **Offline capable** - Works without internet
- **No telemetry** - Microsoft does not collect inference data
- **Model isolation** - Each model runs in isolated process

### Best Practices

1. **Environment variables** - Never commit `.env` with sensitive config
2. **Rate limiting** - Implement rate limiting on API routes
3. **Input validation** - Validate all user input before sending to model
4. **Resource limits** - Set `max_tokens` limits to prevent DoS
5. **Authentication** - Require authentication for API endpoints

## Roadmap

- [ ] Support for additional Phi-4 models
- [ ] Multimodal support (vision + text)
- [ ] Function calling support
- [ ] Model fine-tuning API
- [ ] Advanced caching strategies
- [ ] Cross-platform support (macOS, Linux)

## References

- [Microsoft Foundry Local GitHub](https://github.com/microsoft/Foundry-Local)
- [foundry-local-sdk Documentation](https://github.com/microsoft/Foundry-Local/tree/main/samples/js)
- [ONNX Runtime Documentation](https://onnxruntime.ai/)
- [Windows ML Documentation](https://docs.microsoft.com/en-us/windows/ai/)

## Support

For issues specific to:

- **Foundry Local service**: [GitHub Issues](https://github.com/microsoft/Foundry-Local/issues)
- **LLM Framework integration**: [Project GitHub Issues](https://github.com/Scarmonit/LLM/issues)

---

**Last Updated**: 2025-10-23
**Version**: 1.0.0
