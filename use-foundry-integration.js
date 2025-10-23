/**
 * Complete Foundry Local Integration Usage Guide
 * Shows all ways to use the integration in your LLM framework
 */

console.log('🚀 Microsoft Foundry Local - Complete Integration Guide\n');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('📦 INSTALLATION\n');
console.log('Step 1: Install Foundry Local Service');
console.log('  Download: https://github.com/microsoft/Foundry-Local/releases/tag/v0.8.94');
console.log('  Install: foundry-local-v0.8.94.msi');
console.log('  Verify: Get-Service -Name "FoundryLocal"\n');

console.log('Step 2: Install npm dependencies');
console.log('  npm install  # Installs foundry-local-sdk@^0.5.0\n');

console.log('═══════════════════════════════════════════════════════════\n');
console.log('🎯 USAGE OPTIONS\n');

console.log('Option 1: Direct Client Usage (Simple)');
console.log('─────────────────────────────────────────');
console.log(`
import { FoundryLocalClient } from './src/clients/foundry-local-client.js';

const client = new FoundryLocalClient();
await client.initialize('phi-3.5-mini');

// Streaming chat
const result = await client.chat([
  { role: 'user', content: 'Hello!' }
], { stream: true });

for await (const chunk of result.stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
`);

console.log('\nOption 2: A2A Agent (Multi-Agent System)');
console.log('─────────────────────────────────────────');
console.log(`
# Terminal 1: Start AI Bridge
npm run bridge:start

# Terminal 2: Start Foundry Agent
npm run agent:foundry

# Terminal 3: Start other agents
npm run agent:ollama
npm run agent:claude

# Now all agents can communicate via WebSocket!
`);

console.log('\nOption 3: Express API Integration');
console.log('─────────────────────────────────────────');
console.log(`
import express from 'express';
import { FoundryLocalClient } from './src/clients/foundry-local-client.js';

const app = express();
const foundry = new FoundryLocalClient();

app.post('/api/foundry/chat', async (req, res) => {
  const result = await foundry.chat(req.body.messages, {
    stream: req.body.stream ?? true
  });
  
  if (req.body.stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    for await (const chunk of result.stream) {
      res.write(\`data: \${JSON.stringify(chunk)}\n\n\`);
    }
    res.end();
  } else {
    res.json(result.response);
  }
});
`);

console.log('\nOption 4: Electron Integration');
console.log('─────────────────────────────────────────');
console.log(`
// In your Electron renderer process
const ws = new WebSocket('ws://localhost:65028');

ws.send(JSON.stringify({
  type: 'chat',
  data: {
    query: 'Hello from Electron!',
    conversationId: 'electron-main',
    stream: true
  }
}));

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'response-chunk') {
    console.log(msg.data.content);
  }
};
`);

console.log('\n═══════════════════════════════════════════════════════════\n');
console.log('⚡ PERFORMANCE COMPARISON\n');

console.log('┌──────────┬──────────────┬──────────────────┬────────────┐');
console.log('│ Hardware │ Tokens/sec   │ First Token      │ Best For   │');
console.log('├──────────┼──────────────┼──────────────────┼────────────┤');
console.log('│ NPU      │ 40-60        │ ~150ms           │ Laptops    │');
console.log('│ GPU      │ 30-50        │ ~200ms           │ Desktops   │');
console.log('│ CPU      │ 10-20        │ ~500ms           │ Fallback   │');
console.log('└──────────┴──────────────┴──────────────────┴────────────┘\n');

console.log('💡 NPU advantage: Low power consumption + high performance\n');

console.log('═══════════════════════════════════════════════════════════\n');
console.log('🔧 CONFIGURATION\n');

console.log('Environment Variables (.env):');
console.log(`
FOUNDRY_LOCAL_DEFAULT_MODEL=phi-3.5-mini
FOUNDRY_LOCAL_MODEL_TTL=600000
FOUNDRY_LOCAL_AUTO_START=true
FOUNDRY_LOCAL_HARDWARE_PREFERENCE=auto  # auto|cpu|gpu|npu
FOUNDRY_AGENT_ID=foundry-local-agent-1
BRIDGE_WS=ws://localhost:65028
`);

console.log('Constants (src/config/constants.js):');
console.log(`
LLM.FOUNDRY_LOCAL = {
  DEFAULT_MODEL: 'phi-3.5-mini',
  DEFAULT_TEMPERATURE: 0.7,
  DEFAULT_MAX_TOKENS: 1024,
  MODEL_TTL_MS: 600000,
  AUTO_START: true,
  HARDWARE_PREFERENCE: 'auto',
  REQUEST_TIMEOUT_MS: 30000,
  MAX_CONCURRENT_REQUESTS: 2
}
`);

console.log('\n═══════════════════════════════════════════════════════════\n');
console.log('🎨 FEATURES\n');

console.log('✅ OpenAI-compatible API - Works with existing code');
console.log('✅ Hardware auto-detection - NPU → GPU → CPU priority');
console.log('✅ Model caching - 10-minute TTL reduces overhead');
console.log('✅ Streaming support - Real-time token-by-token');
console.log('✅ Conversation history - Multi-turn chats with context');
console.log('✅ Request queuing - Max 2 concurrent for NPU');
console.log('✅ Privacy-first - All data stays on device');
console.log('✅ Offline capable - No internet required\n');

console.log('═══════════════════════════════════════════════════════════\n');
console.log('📚 DOCUMENTATION\n');

console.log('Files created:');
console.log('  📄 src/clients/foundry-local-client.js - Main client');
console.log('  📄 src/agents/foundry-local-agent.js - A2A agent');
console.log('  📄 tests/foundry-local-client.test.js - Unit tests');
console.log('  📄 tests/integration/foundry-local-integration.test.js - Integration tests');
console.log('  📄 docs/FOUNDRY_LOCAL_INTEGRATION.md - Full guide\n');

console.log('NPM Scripts:');
console.log('  npm run agent:foundry - Start Foundry Local agent');
console.log('  npm run bridge:start - Start AI Bridge');
console.log('  npm test tests/foundry-local-client.test.js - Run unit tests');
console.log('  node demo-foundry-local.js - Run live demo\n');

console.log('═══════════════════════════════════════════════════════════\n');
console.log('🚀 QUICK START\n');

console.log('Terminal 1:');
console.log('  npm run bridge:start\n');

console.log('Terminal 2:');
console.log('  npm run agent:foundry\n');

console.log('Terminal 3:');
console.log('  node demo-foundry-local.js\n');

console.log('═══════════════════════════════════════════════════════════\n');
console.log('✨ Integration complete and ready to use!\n');
console.log('Install Foundry Local service to activate NPU/GPU acceleration.\n');
