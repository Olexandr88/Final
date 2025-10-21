import test from 'node:test';
import assert from 'node:assert/strict';
import ReActAgent, {
  parseReActOutput,
  executeToolCall,
  runReActLoop,
  formatToolResponse,
} from '../src/react-tool-reasoning.js';

test('ReActAgent returns final answer when LLM provides finish output', async () => {
  const llm = { generate: async () => 'Final Answer: done' };
  const agent = new ReActAgent({ tools: {}, llm });
  const result = await agent.run('Any task');
  assert.strictEqual(result.answer, 'done');
  assert.strictEqual(result.steps, 0);
});

test('ReActAgent uses tool when LLM selects one', async () => {
  let stage = 0;
  const tools = {
    calculator: async (expr) => Function(`return (${expr})`)(),
  };
  const llm = {
    async generate() {
      stage += 1;
      if (stage === 1) {
        return 'Thought: compute\nAction: calculator\nAction Input: 6*7';
      }
      return 'Final Answer: 42';
    },
  };
  const agent = new ReActAgent({ tools, llm });
  const result = await agent.run('Compute 6*7');
  assert.strictEqual(result.answer, '42');
});

test('parseReActOutput extracts thought and observation', () => {
  const parsed = parseReActOutput('Thought: search\nAction: search[AI]\nObservation: found');
  assert.strictEqual(parsed.thought, 'search');
  assert.strictEqual(parsed.action, 'search[AI]');
  assert.strictEqual(parsed.observation, 'found');
});

test('executeToolCall returns tool result and throws for missing tool', async () => {
  const tools = {
    upper: (value) => value.toUpperCase(),
  };
  const value = await executeToolCall('upper', 'hello', tools);
  assert.strictEqual(value, 'HELLO');
  await assert.rejects(executeToolCall('missing', '', tools));
});

test('runReActLoop delegates to ReActAgent', async () => {
  const tools = {};
  const llm = { generate: async () => 'Final Answer: success' };
  const result = await runReActLoop('task', tools, llm, 2);
  assert.strictEqual(result.answer, 'success');
});

test('formatToolResponse formats value', () => {
  const formatted = formatToolResponse('calculator', 42);
  assert.ok(formatted.includes('calculator'));
  assert.ok(formatted.includes('42'));
});
