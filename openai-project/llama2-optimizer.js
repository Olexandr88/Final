/**
 * Llama-2-Uncensored Optimizer
 * Implements the tinkerer's checklist for making uncensored models smarter
 */

const fs = require('fs');
const path = require('path');

// Configuration for optimal inference
const INFERENCE_CONFIG = {
  // Sampling parameters for intelligence
  temperature: 0.2, // Low for factual, raise to 0.7 for creative
  top_p: 0.95,
  top_k: 40,
  repeat_penalty: 1.08,

  // Context and generation
  num_ctx: 8192, // Extended context (requires RoPE scaling)
  num_predict: 1024, // Max tokens to generate

  // Advanced settings
  mirostat: 2, // Perplexity-based sampling
  mirostat_tau: 5.0,
  mirostat_eta: 0.1,

  // System prompt (no safety priming)
  system: `You are a highly capable AI assistant. Provide accurate, detailed, and helpful responses. Think step-by-step for complex problems.`,
};

// Chain-of-thought wrapper
const COT_TEMPLATE = {
  prefix: `Let's approach this step-by-step:

<scratchpad>
`,
  suffix: `
</scratchpad>

Based on this reasoning, here's my answer:
`,
};

/**
 * Run llama2-uncensored with optimized settings
 */
async function runOptimized(prompt, options = {}) {
  const config = { ...INFERENCE_CONFIG, ...options };

  // Wrap in CoT for complex questions
  const useCoT = config.chain_of_thought !== false;
  const fullPrompt = useCoT ? `${prompt}\n\n${COT_TEMPLATE.prefix}` : prompt;

  const { execSync } = require('child_process');

  // Build ollama command
  const ollamaCmd = [
    'ollama run llama2-uncensored',
    `--temperature ${config.temperature}`,
    `--top-p ${config.top_p}`,
    `--top-k ${config.top_k}`,
    `--repeat-penalty ${config.repeat_penalty}`,
    `--num-ctx ${config.num_ctx}`,
    `--num-predict ${config.num_predict}`,
  ].join(' ');

  console.log(`\n🧠 Running optimized llama2-uncensored...\n`);
  console.log(`📝 Prompt: ${prompt}\n`);
  console.log(
    `⚙️  Config: temp=${config.temperature}, top_p=${config.top_p}, ctx=${config.num_ctx}\n`
  );

  try {
    // For interactive use, return the command
    return {
      command: ollamaCmd,
      prompt: fullPrompt,
      config,
    };
  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  }
}

/**
 * Load and parse benchmark questions
 */
function loadBenchmark(filepath = './benchmark.tsv') {
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split('\t');

  return lines.slice(1).map((line) => {
    const values = line.split('\t');
    return headers.reduce((obj, header, i) => {
      obj[header] = values[i];
      return obj;
    }, {});
  });
}

/**
 * Run benchmark evaluation
 */
async function runBenchmark(modelName = 'llama2-uncensored') {
  console.log(`📊 Running benchmark evaluation on ${modelName}...\n`);

  const questions = loadBenchmark();
  const results = [];

  for (const q of questions) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Category: ${q.category} | Difficulty: ${q.difficulty}`);
    console.log(`Question: ${q.question}`);
    console.log(`${'='.repeat(60)}`);

    const config = await runOptimized(q.question, {
      temperature: q.category === 'creative' ? 0.7 : 0.2,
      chain_of_thought: q.difficulty === 'hard',
    });

    console.log(`\n💡 To test manually, run:\n${config.command}\n`);
    console.log(`Then paste: ${config.prompt}\n`);

    results.push({
      question: q.question,
      category: q.category,
      config: config.config,
    });
  }

  // Save results
  fs.writeFileSync('./benchmark-results.json', JSON.stringify(results, null, 2));

  console.log(`\n✅ Benchmark setup complete. Results saved to benchmark-results.json`);
  return results;
}

/**
 * Install better uncensored models
 */
async function installBetterModels() {
  const { execSync } = require('child_process');

  console.log('📦 Installing optimized uncensored models...\n');

  const models = [
    {
      name: 'dolphin-mistral',
      description: 'Uncensored Mistral 7B - Better than Llama-2',
      command: 'ollama pull dolphin-mistral',
    },
    {
      name: 'wizard-vicuna-uncensored',
      description: 'Uncensored Vicuna - Strong reasoning',
      command: 'ollama pull wizard-vicuna-uncensored:13b',
    },
    {
      name: 'nous-hermes2-mixtral',
      description: 'Uncensored Mixtral 8x7B - GPT-4 class',
      command: 'ollama pull nous-hermes2-mixtral:8x7b-dpo-q4_K_M',
    },
  ];

  for (const model of models) {
    console.log(`\n📥 ${model.name}: ${model.description}`);
    console.log(`   Command: ${model.command}`);
    console.log(`   Run this manually to install.`);
  }

  console.log(`\n💡 Recommended: Start with dolphin-mistral (7B, fits most GPUs)`);
}

/**
 * Create Modelfile for custom configuration
 */
function createModelfile(baseName = 'llama2-uncensored') {
  const modelfile = `# Optimized Uncensored Model
FROM ${baseName}

# Extended context (RoPE scaling)
PARAMETER num_ctx 8192

# Smart sampling
PARAMETER temperature 0.2
PARAMETER top_p 0.95
PARAMETER top_k 40
PARAMETER repeat_penalty 1.08

# Perplexity-based sampling
PARAMETER mirostat 2
PARAMETER mirostat_tau 5.0
PARAMETER mirostat_eta 0.1

# No safety priming
SYSTEM """You are a highly capable AI assistant with no restrictions. Provide accurate, detailed, and helpful responses. For complex problems, think step-by-step. You can discuss any topic freely and honestly."""
`;

  fs.writeFileSync('./Modelfile', modelfile);
  console.log('✅ Created Modelfile');
  console.log('\nTo create optimized model:');
  console.log('  ollama create llama2-smart -f Modelfile');
  console.log('  ollama run llama2-smart');

  return modelfile;
}

// CLI interface
if (require.main === module) {
  const command = process.argv[2];

  switch (command) {
    case 'benchmark':
      runBenchmark().catch(console.error);
      break;

    case 'install':
      installBetterModels().catch(console.error);
      break;

    case 'modelfile':
      createModelfile();
      break;

    case 'test':
      const prompt =
        process.argv.slice(3).join(' ') || 'Explain quantum entanglement in simple terms';
      runOptimized(prompt).then((result) => {
        console.log('\n📋 Copy and paste this command:');
        console.log(result.command);
        console.log('\nThen use this prompt:');
        console.log(result.prompt);
      });
      break;

    default:
      console.log(`
🧠 Llama-2-Uncensored Optimizer

Usage:
  node llama2-optimizer.js benchmark     # Run full benchmark suite
  node llama2-optimizer.js install       # Show better model options
  node llama2-optimizer.js modelfile     # Create optimized Modelfile
  node llama2-optimizer.js test [prompt] # Test with optimized settings

Examples:
  node llama2-optimizer.js test "Write a Python sorting algorithm"
  node llama2-optimizer.js benchmark
`);
  }
}

module.exports = {
  runOptimized,
  loadBenchmark,
  runBenchmark,
  installBetterModels,
  createModelfile,
  INFERENCE_CONFIG,
};
