/**
 * Model Comparison & Evaluation Tool
 * Compares multiple models on the same benchmark
 */

const fs = require('fs');
const { execSync } = require('child_process');

class ModelComparison {
  constructor() {
    this.models = [
      { name: 'llama2-uncensored', description: 'Base uncensored' },
      { name: 'llama2-smart', description: 'Optimized config' },
      { name: 'dolphin-mistral', description: 'Better uncensored base' },
    ];
    this.results = [];
  }

  /**
   * Load benchmark questions
   */
  loadBenchmark(filepath = './benchmark.tsv') {
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
   * Test single question on multiple models
   */
  async compareOnQuestion(question, models = this.models) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📊 COMPARISON TEST`);
    console.log(`Question: ${question.question}`);
    console.log(`Category: ${question.category} | Difficulty: ${question.difficulty}`);
    console.log(`${'='.repeat(70)}\n`);

    const comparison = {
      question: question.question,
      category: question.category,
      difficulty: question.difficulty,
      models: [],
    };

    for (const model of models) {
      console.log(`\n🤖 Testing: ${model.name} (${model.description})`);
      console.log(`${'─'.repeat(70)}`);

      const config = this.getOptimalConfig(question);
      const prompt = this.buildPrompt(question);

      // Generate test command
      const cmd = `ollama run ${model.name} "${prompt.replace(/"/g, '\\"')}" --temperature ${config.temperature} --top-p ${config.top_p} --top-k ${config.top_k} --repeat-penalty ${config.repeat_penalty}`;

      console.log(`📝 Command:\n${cmd}\n`);
      console.log(
        `⏱️  Run this and record:\n  - Response quality (1-5)\n  - Accuracy (correct/incorrect)\n  - Hallucination (yes/no)\n  - Speed (seconds)\n`
      );

      comparison.models.push({
        model: model.name,
        command: cmd,
        config,
      });
    }

    this.results.push(comparison);
    return comparison;
  }

  /**
   * Get optimal config for question type
   */
  getOptimalConfig(question) {
    const configs = {
      factual: { temperature: 0.1, top_p: 0.95, top_k: 40, repeat_penalty: 1.08 },
      creative: { temperature: 0.7, top_p: 0.95, top_k: 60, repeat_penalty: 1.05 },
      reasoning: { temperature: 0.2, top_p: 0.95, top_k: 40, repeat_penalty: 1.1 },
      code: { temperature: 0.15, top_p: 0.95, top_k: 40, repeat_penalty: 1.08 },
      default: { temperature: 0.3, top_p: 0.95, top_k: 40, repeat_penalty: 1.08 },
    };

    const category = question.category.split('_')[0];
    return configs[category] || configs.default;
  }

  /**
   * Build appropriate prompt for question
   */
  buildPrompt(question) {
    const basePrompt = question.question;

    // Add chain-of-thought for hard questions
    if (question.difficulty === 'hard') {
      return `${basePrompt}\n\nLet's think step-by-step:\n\n<scratchpad>\n`;
    }

    return basePrompt;
  }

  /**
   * Run full benchmark suite
   */
  async runFullBenchmark(modelName = null) {
    const questions = this.loadBenchmark();
    const modelsToTest = modelName ? this.models.filter((m) => m.name === modelName) : this.models;

    console.log(`\n🚀 FULL BENCHMARK RUN`);
    console.log(`Models: ${modelsToTest.map((m) => m.name).join(', ')}`);
    console.log(`Questions: ${questions.length}\n`);

    for (const question of questions) {
      await this.compareOnQuestion(question, modelsToTest);
      console.log(`\n${'━'.repeat(70)}\n`);
    }

    this.saveResults();
    this.generateReport();
  }

  /**
   * Save results to file
   */
  saveResults() {
    const filename = `./benchmark-comparison-${Date.now()}.json`;
    fs.writeFileSync(filename, JSON.stringify(this.results, null, 2));
    console.log(`\n✅ Results saved to ${filename}`);
  }

  /**
   * Generate comparison report
   */
  generateReport() {
    const report = `
# Model Comparison Report
Generated: ${new Date().toISOString()}

## Summary

Total Questions: ${this.results.length}
Models Tested: ${this.models.map((m) => m.name).join(', ')}

## Scoring Instructions

For each model response, rate:

1. **Quality (1-5)**
   - 5: Excellent, comprehensive, accurate
   - 4: Good, mostly accurate
   - 3: Acceptable, some issues
   - 2: Poor, significant problems
   - 1: Unusable

2. **Accuracy (✓/✗)**
   - ✓: Factually correct
   - ✗: Contains errors

3. **Hallucination (Yes/No)**
   - Yes: Makes up facts
   - No: Sticks to known info

4. **Speed (seconds)**
   - Time to first token + generation time

## Evaluation Template

\`\`\`
Question: [question text]
Model: [model name]
Quality: [ ] 1  [ ] 2  [ ] 3  [ ] 4  [ ] 5
Accuracy: [ ] ✓  [ ] ✗
Hallucination: [ ] Yes  [ ] No
Speed: _____ seconds
Notes: ________________________________
\`\`\`

## Analysis Framework

### Scoring Calculations
- **Overall Score** = (Quality × 20) + (Accuracy × 20) + (!Hallucination × 20) + (SpeedScore × 20)
- **SpeedScore** = 5 - min(seconds/2, 5)

### Comparison Metrics
- **Win Rate**: % of questions where model scored highest
- **Avg Quality**: Mean quality score
- **Accuracy Rate**: % of correct answers
- **Hallucination Rate**: % of hallucinated responses
- **Avg Speed**: Mean generation time

## Questions by Category

${this.results
  .map(
    (r, i) => `
### ${i + 1}. ${r.question}
**Category**: ${r.category} | **Difficulty**: ${r.difficulty}

${r.models
  .map(
    (m) => `
#### ${m.model}
\`\`\`bash
${m.command}
\`\`\`
Config: temp=${m.config.temperature}, top_p=${m.config.top_p}
`
  )
  .join('\n')}
`
  )
  .join('\n')}

## Recommended Next Steps

1. **Install better models if needed:**
   \`\`\`bash
   ollama pull dolphin-mistral
   ollama pull nous-hermes2-mixtral:8x7b
   \`\`\`

2. **Create custom optimized model:**
   \`\`\`bash
   ollama create my-smart-model -f Modelfile
   \`\`\`

3. **Fine-tune on your domain:**
   - Collect 1K+ Q/A pairs
   - Use axolotl or llama-recipes
   - Train for 3 epochs

4. **Implement RAG for factual queries:**
   - Vector DB (ChromaDB, Pinecone)
   - Embed docs and retrieve context
   - Reduces hallucination 50-80%

---
*Auto-generated by model-comparison.js*
`;

    const filename = `./BENCHMARK-REPORT.md`;
    fs.writeFileSync(filename, report);
    console.log(`✅ Report saved to ${filename}\n`);
  }

  /**
   * Quick test - single question, all models
   */
  async quickTest(questionText) {
    const question = {
      question: questionText,
      category: 'test',
      difficulty: 'medium',
    };

    await this.compareOnQuestion(question);
  }
}

// CLI
if (require.main === module) {
  const comparison = new ModelComparison();
  const command = process.argv[2];

  (async () => {
    switch (command) {
      case 'full':
        await comparison.runFullBenchmark();
        break;

      case 'quick':
        const question = process.argv.slice(3).join(' ');
        await comparison.quickTest(question || 'What is the capital of France?');
        break;

      case 'model':
        const modelName = process.argv[3];
        await comparison.runFullBenchmark(modelName);
        break;

      default:
        console.log(`
📊 Model Comparison Tool

Usage:
  node model-comparison.js full              # Run full benchmark
  node model-comparison.js quick [question]  # Quick single test
  node model-comparison.js model [name]      # Test single model

Examples:
  node model-comparison.js full
  node model-comparison.js quick "Explain quantum computing"
  node model-comparison.js model llama2-smart

Available models:
${comparison.models.map((m) => `  - ${m.name}: ${m.description}`).join('\n')}
`);
    }
  })();
}

module.exports = ModelComparison;
