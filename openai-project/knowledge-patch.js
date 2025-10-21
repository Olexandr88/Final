/**
 * Live Knowledge Cut-off Patch
 * Adds @search() capability + hallucination checking
 * Makes 2020-era model answer 2024 questions accurately
 */

const ToolRuntime = require('./tool-runtime.js');
const HallucinationCache = require('./hallucination-cache.js');

class KnowledgePatch {
  constructor(options = {}) {
    this.options = {
      modelName: options.modelName || 'llama2-smart-q3',
      searchEnabled: options.searchEnabled !== false,
      cacheEnabled: options.cacheEnabled !== false,
      preferSources: options.preferSources !== false,
      ...options,
    };

    this.toolRuntime = new ToolRuntime();
    this.cache = new HallucinationCache();
  }

  /**
   * Detect if question requires current knowledge
   */
  needsCurrentKnowledge(question) {
    const currentPatterns = [
      /\b(current|latest|recent|today|now|2024|2025)\b/i,
      /\b(price|cost|value) of\b/i,
      /\bwhat(?:'s| is) (?:the )?(?:current|latest)\b/i,
      /\bhow much (?:is|does|are)\b/i,
      /\bwhen (?:did|was|is)\b.*\b(release|launch|announce)\b/i,
    ];

    return currentPatterns.some((pattern) => pattern.test(question));
  }

  /**
   * Search for current information
   */
  async searchCurrent(query) {
    if (!this.options.searchEnabled) {
      return { success: false, error: 'Search disabled' };
    }

    console.log(`\n🔍 Searching for current information: "${query}"`);

    const searchResult = await this.toolRuntime.executeSearch(query);

    if (!searchResult.success) {
      console.log(`   ❌ Search failed: ${searchResult.error}`);
      return searchResult;
    }

    console.log(`   ✅ Found ${searchResult.count} results`);

    // Format search results
    const formatted = searchResult.snippets
      .map((s, i) => `[${i + 1}] ${s.title}\n    ${s.url}`)
      .join('\n\n');

    return {
      success: true,
      query,
      snippets: searchResult.snippets,
      formatted,
      count: searchResult.count,
    };
  }

  /**
   * Generate answer with current knowledge
   */
  async answerWithSources(question) {
    console.log(`\n🧠 Knowledge Patch: Generating answer with sources`);
    console.log(`   Question: ${question}`);

    // Step 1: Get parametric answer (model's internal knowledge)
    console.log(`\n   📚 Step 1: Getting parametric answer...`);

    const { execSync } = require('child_process');

    const parametricAnswer = execSync(
      `ollama run ${this.options.modelName} "${question.replace(/"/g, '\\"')}"`,
      { encoding: 'utf-8', timeout: 30000 }
    ).trim();

    console.log(`   ✅ Parametric answer: ${parametricAnswer.slice(0, 100)}...`);

    // Step 2: Check if current knowledge needed
    if (this.needsCurrentKnowledge(question)) {
      console.log(`\n   🌐 Step 2: Fetching current information...`);

      const searchResult = await this.searchCurrent(question);

      if (searchResult.success && searchResult.count > 0) {
        // Step 3: Re-generate with sources
        console.log(`\n   🔄 Step 3: Re-generating with sources...`);

        const contextWithSources = `<current-knowledge>
The following information is from recent web sources (${new Date().toISOString().split('T')[0]}):

${searchResult.formatted}
</current-knowledge>

Question: ${question}

Instructions:
1. Prefer information from <current-knowledge> over parametric memory
2. Cite sources when using current information
3. If current knowledge contradicts your training, trust the current sources

Answer:`;

        const enhancedAnswer = execSync(
          `ollama run ${this.options.modelName} "${contextWithSources.replace(/"/g, '\\"')}"`,
          { encoding: 'utf-8', timeout: 30000 }
        ).trim();

        // Step 4: Hallucination check
        if (this.options.cacheEnabled) {
          console.log(`\n   🔍 Step 4: Checking for hallucinations...`);

          const hallCheck = await this.cache.processResponse(enhancedAnswer, question);

          if (hallCheck.hallucinationDetected) {
            console.log(`   ⚠️  Possible hallucination detected!`);
            console.log(`   💡 Recommendation: ${hallCheck.recommendation}`);
          } else {
            console.log(`   ✅ No hallucinations detected`);
          }

          return {
            success: true,
            question,
            parametricAnswer,
            sources: searchResult.snippets,
            answer: enhancedAnswer,
            hallucinationCheck: hallCheck,
            usedCurrentKnowledge: true,
          };
        }

        return {
          success: true,
          question,
          parametricAnswer,
          sources: searchResult.snippets,
          answer: enhancedAnswer,
          usedCurrentKnowledge: true,
        };
      }
    }

    // No current knowledge needed or search failed
    console.log(`\n   ✅ Using parametric answer (no current sources needed)`);

    return {
      success: true,
      question,
      answer: parametricAnswer,
      usedCurrentKnowledge: false,
    };
  }

  /**
   * Process text with @search() calls
   */
  async processWithSearch(generatedText) {
    const searchPattern = /@search\(([^)]+)\)/g;
    let match;
    const searches = [];

    while ((match = searchPattern.exec(generatedText)) !== null) {
      const query = match[1].trim();
      searches.push({
        query,
        placeholder: match[0],
      });
    }

    if (searches.length === 0) {
      return {
        text: generatedText,
        enhanced: false,
      };
    }

    console.log(`\n🔍 Found ${searches.length} @search() calls`);

    let enhancedText = generatedText;

    for (const search of searches) {
      const result = await this.searchCurrent(search.query);

      if (result.success) {
        const replacement = `\n<search-results query="${search.query}">\n${result.formatted}\n</search-results>\n`;
        enhancedText = enhancedText.replace(search.placeholder, replacement);
      }
    }

    return {
      text: enhancedText,
      enhanced: true,
      searchesPerformed: searches.length,
    };
  }

  /**
   * Smart routing: decide if search is needed
   */
  async smartAnswer(question) {
    // Check cache first
    if (this.options.cacheEnabled) {
      const cached = this.cache.claimHistory.find((c) =>
        c.fullSentence.toLowerCase().includes(question.toLowerCase().slice(0, 30))
      );

      if (cached && cached.verified) {
        console.log(`\n💾 Cache hit! Using verified answer`);
        return {
          success: true,
          question,
          answer: cached.fullSentence,
          fromCache: true,
        };
      }
    }

    // Determine if current knowledge needed
    if (this.needsCurrentKnowledge(question)) {
      console.log(`\n🌐 Current knowledge required - using search`);
      return await this.answerWithSources(question);
    } else {
      console.log(`\n📚 Parametric knowledge sufficient`);

      const { execSync } = require('child_process');
      const answer = execSync(
        `ollama run ${this.options.modelName} "${question.replace(/"/g, '\\"')}"`,
        { encoding: 'utf-8', timeout: 30000 }
      ).trim();

      return {
        success: true,
        question,
        answer,
        usedCurrentKnowledge: false,
      };
    }
  }
}

// CLI usage
if (require.main === module) {
  const patch = new KnowledgePatch();

  const testQuestions = [
    'What is the capital of France?', // Parametric
    'What is the current price of Bitcoin?', // Current
    'Who won the 2024 Super Bowl?', // Current
    'Explain quantum computing', // Parametric
  ];

  (async () => {
    console.log('🧪 Knowledge Patch Test Suite\n');
    console.log('='.repeat(70));

    for (const question of testQuestions) {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`Question: ${question}`);
      console.log('─'.repeat(70));

      const needsCurrent = patch.needsCurrentKnowledge(question);
      console.log(`Needs current knowledge: ${needsCurrent ? 'YES' : 'NO'}`);

      console.log(`\n💡 In production, this would:`);
      if (needsCurrent) {
        console.log(`   1. Search for: "${question}"`);
        console.log(`   2. Inject results into context`);
        console.log(`   3. Generate answer with sources`);
        console.log(`   4. Check for hallucinations`);
      } else {
        console.log(`   1. Use parametric knowledge`);
        console.log(`   2. Generate answer directly`);
      }
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log('\n✅ Knowledge Patch module ready');
    console.log('\nUsage:');
    console.log('  const KnowledgePatch = require("./knowledge-patch.js");');
    console.log('  const patch = new KnowledgePatch();');
    console.log('  const result = await patch.smartAnswer("Your question");');
    console.log('');
    console.log('Features:');
    console.log('  ✅ Auto-detects current vs. parametric questions');
    console.log('  ✅ Web search integration (DuckDuckGo)');
    console.log('  ✅ Source citation in answers');
    console.log('  ✅ Hallucination checking');
    console.log('  ✅ @search() token support');
    console.log('  ✅ 100% local (except web search)');
  })();
}

module.exports = KnowledgePatch;
