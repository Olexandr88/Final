#!/usr/bin/env node
/**
 * Quick Ollama usage script - uses optimized AI Bridge
 */

const BRIDGE_HTTP = 'http://localhost:65038';

async function askOllama(prompt, model = 'llama3') {
  console.log(`🤖 Asking ${model}: ${prompt}\n`);

  const response = await fetch(`${BRIDGE_HTTP}/api/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: 'ollama-agent-1',
      intent: 'ai.query',
      payload: {
        message: prompt,
        model: model,
      },
    }),
  });

  const result = await response.json();
  console.log('✅ Request queued:', result.envelope.id);

  // Wait a bit and check history
  setTimeout(async () => {
    const historyRes = await fetch(`${BRIDGE_HTTP}/history`);
    const history = await historyRes.json();

    const myMessage = history.find((h) => h.id === result.envelope.id);
    if (myMessage?.response) {
      console.log('\n📨 Response:');
      console.log(myMessage.response);
    } else {
      console.log('\n⏳ Response pending... check http://localhost:65038/history');
    }
  }, 2000);
}

// Get prompt from command line or use default
const prompt =
  process.argv.slice(2).join(' ') || 'Explain async/await in JavaScript in 2 sentences';
const model = process.env.OLLAMA_MODEL || 'llama3';

askOllama(prompt, model).catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
