# A2A Agent Documentation

## Available Agents

### 1. Ollama Agent (`a2a-ollama-agent.js`)
**Purpose:** Local LLM inference using Ollama

**Features:**
- Connects to local Ollama instance
- Supports multiple models (llama2, llama3, gemma, etc.)
- Automatic retry on connection failure
- Configurable response length and context window

**Configuration:**
```bash
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama2
BRIDGE_WS=ws://localhost:65028
```

**Performance Optimizations:**
- Context window: 2048 tokens (configurable)
- Max response: 512 tokens
- Heartbeat interval: 90 seconds
- Request timeout: 30 seconds

### 2. Claude Agent (`a2a-claude-agent.js`)
**Purpose:** Integration with Anthropic Claude API

**Configuration:**
```bash
ANTHROPIC_API_KEY=your_key_here
BRIDGE_WS=ws://localhost:65028
```

### 3. Code Analyzer Agent (`code-analyzer-agent.js`)
**Purpose:** AST-based code analysis

**Features:**
- Static code analysis
- Pattern detection
- Code metrics

## Agent Development Guide

### Creating a New Agent

1. **Basic Structure:**
```javascript
import WebSocket from 'ws';

class MyAgent {
  constructor() {
    this.agentId = 'my-agent-id';
    this.ws = null;
    this.connect();
  }

  connect() {
    this.ws = new WebSocket('ws://localhost:65028');

    this.ws.on('open', () => {
      this.register();
    });

    this.ws.on('message', async (data) => {
      const msg = JSON.parse(data.toString());
      await this.handleMessage(msg);
    });
  }

  register() {
    this.ws.send(JSON.stringify({
      type: 'register',
      clientId: this.agentId,
      role: 'agent',
      intents: ['your.intent.here']
    }));
  }

  async handleMessage(msg) {
    // Handle incoming messages
  }
}
```

2. **Add to Control Center whitelist** (`a2a-control-center.js`):
```javascript
const VALID_AGENTS = {
  'myagent': { script: 'src/agents/my-agent.js', name: 'My Agent' }
};
```

3. **Add to Dashboard UI** (`a2a-dashboard.html`):
```html
<div class="agent-card">
  <div class="agent-header">
    <span class="agent-name">🔥 My Agent</span>
    <div class="agent-controls">
      <button class="btn btn-success btn-sm" onclick="startAgent('myagent')">Start</button>
      <button class="btn btn-danger btn-sm" onclick="stopAgent('myagent')">Stop</button>
    </div>
  </div>
  <div style="font-size: 12px; color: #888;">Description of agent</div>
</div>
```

## Performance Best Practices

1. **Connection Management:**
   - Use heartbeat intervals >= 60 seconds
   - Implement automatic reconnection with exponential backoff
   - Clean up resources on shutdown

2. **Message Handling:**
   - Validate message structure before processing
   - Implement timeouts for external API calls
   - Use error boundaries to prevent crashes

3. **Resource Optimization:**
   - Limit response size
   - Use streaming for large outputs
   - Implement request queuing for rate limiting

4. **Security:**
   - Validate all inputs
   - Never expose API keys in logs
   - Use environment variables for configuration
   - Sanitize error messages in production

## Testing Agents

Run the integration test:
```bash
node test-control-center-live.js
```

Check individual agent:
```bash
node src/agents/a2a-ollama-agent.js
```

Monitor via Control Center GUI or HTTP API:
```bash
curl http://localhost:65029/agents
curl http://localhost:65029/api/status
```
