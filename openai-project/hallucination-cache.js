/**
 * Hallucination Cache Layer
 * Stores factual claims with embeddings in vector DB
 * Detects contradictions and triggers fact-checking
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class HallucinationCache {
  constructor(options = {}) {
    this.options = {
      cacheDir: options.cacheDir || './cache',
      similarityThreshold: options.similarityThreshold || 0.85,
      embeddingProvider: options.embeddingProvider || 'local',
      autoCorrect: options.autoCorrect || true,
      ...options,
    };

    this.cache = new Map();
    this.claimHistory = [];
    this.initCache();
  }

  /**
   * Initialize cache directory and load existing data
   */
  initCache() {
    if (!fs.existsSync(this.options.cacheDir)) {
      fs.mkdirSync(this.options.cacheDir, { recursive: true });
    }

    const cacheFile = path.join(this.options.cacheDir, 'claims.json');
    if (fs.existsSync(cacheFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
        this.claimHistory = data.claims || [];
        console.log(`✅ Loaded ${this.claimHistory.length} cached claims`);
      } catch (error) {
        console.error('Error loading cache:', error.message);
      }
    }
  }

  /**
   * Extract factual claims from text using simple NLP
   * In production, use spaCy or similar for proper triple extraction
   */
  extractClaims(text) {
    const claims = [];

    // Simple sentence splitting
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

    for (const sentence of sentences) {
      const trimmed = sentence.trim();

      // Skip questions and commands
      if (trimmed.match(/^(what|who|where|when|why|how|do|can|should)/i)) {
        continue;
      }

      // Look for factual patterns
      const patterns = [
        // "X is Y"
        /(.+?)\s+(?:is|are|was|were)\s+(.+)/i,
        // "X has Y"
        /(.+?)\s+(?:has|have|had)\s+(.+)/i,
        // "X + verb + Y"
        /(.+?)\s+(?:invented|discovered|created|founded|built)\s+(.+)/i,
        // Numbers and dates
        /(.+?)\s+(?:in|during|at)\s+(\d{4})/,
        /(.+?)\s+(?:is|are|was|were)\s+(\d+)/,
      ];

      for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match) {
          claims.push({
            subject: match[1].trim(),
            predicate:
              match[0].match(
                /\s+(is|are|was|were|has|have|had|invented|discovered|created|founded|built)\s+/
              )?.[1] || 'relates to',
            object: match[2].trim(),
            fullSentence: trimmed,
            timestamp: new Date().toISOString(),
          });
          break;
        }
      }
    }

    return claims;
  }

  /**
   * Simple embedding function (cosine similarity on character n-grams)
   * In production, use OpenAI embeddings or sentence-transformers
   */
  async embedText(text) {
    // Simple character-based embedding
    const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    const ngrams = this.getNGrams(normalized, 3);

    // Create frequency vector
    const vector = {};
    for (const ngram of ngrams) {
      vector[ngram] = (vector[ngram] || 0) + 1;
    }

    return {
      text,
      vector,
      hash: this.hashText(text),
    };
  }

  /**
   * Get n-grams from text
   */
  getNGrams(text, n = 3) {
    const ngrams = [];
    for (let i = 0; i <= text.length - n; i++) {
      ngrams.push(text.slice(i, i + n));
    }
    return ngrams;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(vec1, vec2) {
    const keys = new Set([...Object.keys(vec1), ...Object.keys(vec2)]);

    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    for (const key of keys) {
      const v1 = vec1[key] || 0;
      const v2 = vec2[key] || 0;

      dotProduct += v1 * v2;
      mag1 += v1 * v1;
      mag2 += v2 * v2;
    }

    if (mag1 === 0 || mag2 === 0) return 0;
    return dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));
  }

  /**
   * Hash text for quick lookups
   */
  hashText(text) {
    return crypto.createHash('md5').update(text.toLowerCase()).digest('hex');
  }

  /**
   * Check claim against cache
   */
  async checkClaim(claim) {
    const embedding = await this.embedText(claim.fullSentence);

    // Search for similar claims
    const similarClaims = [];

    for (const cachedClaim of this.claimHistory) {
      if (!cachedClaim.embedding) continue;

      const similarity = this.cosineSimilarity(embedding.vector, cachedClaim.embedding.vector);

      if (similarity > this.options.similarityThreshold) {
        similarClaims.push({
          claim: cachedClaim,
          similarity,
        });
      }
    }

    // Check for contradictions
    const contradictions = similarClaims.filter((sc) => {
      return this.areContradictory(claim, sc.claim);
    });

    return {
      claim,
      embedding,
      similarClaims,
      contradictions,
      needsFactCheck: contradictions.length > 0,
    };
  }

  /**
   * Detect if two claims contradict each other
   */
  areContradictory(claim1, claim2) {
    // Same subject, different objects
    const sameSub = this.similarWords(claim1.subject, claim2.subject);
    const samePred = this.similarWords(claim1.predicate, claim2.predicate);
    const diffObj = !this.similarWords(claim1.object, claim2.object);

    if (sameSub && samePred && diffObj) {
      return true;
    }

    // Check for negation patterns
    const hasNegation1 = /\b(not|no|never|none)\b/i.test(claim1.fullSentence);
    const hasNegation2 = /\b(not|no|never|none)\b/i.test(claim2.fullSentence);

    if (hasNegation1 !== hasNegation2) {
      const sim = this.cosineSimilarity(
        claim1.embedding?.vector || {},
        claim2.embedding?.vector || {}
      );
      if (sim > 0.7) return true;
    }

    return false;
  }

  /**
   * Check word similarity
   */
  similarWords(word1, word2) {
    const w1 = word1.toLowerCase().trim();
    const w2 = word2.toLowerCase().trim();

    if (w1 === w2) return true;

    // Levenshtein distance
    const distance = this.levenshtein(w1, w2);
    const maxLen = Math.max(w1.length, w2.length);

    return distance / maxLen < 0.3; // 70% similarity
  }

  /**
   * Levenshtein distance
   */
  levenshtein(a, b) {
    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Process response and check for hallucinations
   */
  async processResponse(response, prompt) {
    console.log('\n🔍 Checking for hallucinations...\n');

    const claims = this.extractClaims(response);
    console.log(`   Extracted ${claims.length} factual claims`);

    const results = [];
    let hallucinationCount = 0;

    for (const claim of claims) {
      const check = await this.checkClaim(claim);

      if (check.needsFactCheck) {
        hallucinationCount++;
        console.log(`   ⚠️  Possible hallucination detected:`);
        console.log(`      "${claim.fullSentence}"`);
        console.log(`      Contradicts: "${check.contradictions[0].claim.fullSentence}"`);
      }

      // Add to cache
      check.embedding = await this.embedText(claim.fullSentence);
      this.claimHistory.push({
        ...claim,
        embedding: check.embedding,
        verified: !check.needsFactCheck,
      });

      results.push(check);
    }

    console.log(
      `   ${hallucinationCount > 0 ? '⚠️' : '✅'} ${hallucinationCount} potential hallucinations found\n`
    );

    return {
      claims,
      results,
      hallucinationDetected: hallucinationCount > 0,
      hallucinationRate: claims.length > 0 ? hallucinationCount / claims.length : 0,
      recommendation:
        hallucinationCount > 0
          ? 'Fact-check recommended. Consider re-prompting with sources.'
          : 'Response appears factually consistent.',
    };
  }

  /**
   * Save cache to disk
   */
  saveCache() {
    const cacheFile = path.join(this.options.cacheDir, 'claims.json');
    fs.writeFileSync(
      cacheFile,
      JSON.stringify(
        {
          claims: this.claimHistory,
          savedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );

    console.log(`✅ Saved ${this.claimHistory.length} claims to cache`);
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const verified = this.claimHistory.filter((c) => c.verified).length;
    const unverified = this.claimHistory.length - verified;

    return {
      total: this.claimHistory.length,
      verified,
      unverified,
      accuracy: this.claimHistory.length > 0 ? verified / this.claimHistory.length : 1.0,
    };
  }
}

/**
 * Auto-eval mode: Re-verify low-confidence claims
 */
async function autoEval() {
  const cache = new HallucinationCache();

  console.log('\n🔄 Auto-Eval Mode: Re-verifying low-confidence claims\n');
  console.log('='.repeat(70));

  const lowConfidence = cache.claimHistory.filter((c) => !c.verified || c.confidence < 0.8);

  console.log(`Found ${lowConfidence.length} claims needing verification\n`);

  const corrected = [];

  for (const claim of lowConfidence) {
    console.log(`\n📝 Re-verifying: "${claim.fullSentence}"`);

    // In production: query fact-checking API, Wikipedia, etc.
    // For now: mark for manual review
    corrected.push({
      original: claim,
      needsReview: true,
      timestamp: new Date().toISOString(),
    });
  }

  // Save corrected claims for SFT
  const sftFile = path.join(cache.options.cacheDir, 'sft-corrections.jsonl');
  const sftData = corrected.map((c) => ({
    prompt: `Verify this claim: ${c.original.fullSentence}`,
    completion: '[Corrected answer would go here]',
    metadata: {
      original_claim: c.original,
      timestamp: c.timestamp,
    },
  }));

  fs.appendFileSync(sftFile, sftData.map((d) => JSON.stringify(d)).join('\n') + '\n');

  console.log(`\n✅ Saved ${corrected.length} corrections to ${sftFile}`);
  console.log(`📊 Total verified claims: ${cache.claimHistory.length}`);

  // Check if we should trigger rebuild
  const verifiedCount = cache.claimHistory.filter((c) => c.verified).length;

  if (verifiedCount >= 500) {
    console.log(`\n🚀 TRIGGER: ${verifiedCount} verified claims - ready for fine-tune!`);
    process.exit(42); // Signal to cron that rebuild is ready
  }

  process.exit(0);
}

/**
 * Generate SFT training file from verified claims
 */
async function generateSFT() {
  const cache = new HallucinationCache();
  const verified = cache.claimHistory.filter((c) => c.verified);

  console.log(`\n📚 Generating SFT file from ${verified.length} verified claims\n`);

  const sftData = verified.map((claim) => ({
    instruction: `Answer this question accurately: ${claim.subject} ${claim.predicate}?`,
    input: '',
    output: `${claim.subject} ${claim.predicate} ${claim.object}.`,
    metadata: {
      verified: true,
      timestamp: claim.timestamp,
    },
  }));

  const outputFile = path.join(cache.options.cacheDir, 'verified-claims-sft.json');
  fs.writeFileSync(outputFile, JSON.stringify(sftData, null, 2));

  console.log(`✅ Generated ${outputFile}`);
  console.log(`   ${sftData.length} training examples ready`);
  console.log(`\n📝 Next: Use with axolotl or llama-recipes for fine-tuning`);

  return outputFile;
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--eval')) {
    autoEval().catch(console.error);
    return;
  }

  if (args.includes('--generate-sft')) {
    generateSFT().catch(console.error);
    return;
  }

  const cache = new HallucinationCache();

  const testResponses = [
    {
      prompt: 'What is the capital of France?',
      response: 'The capital of France is Paris. Paris is located on the Seine River.',
    },
    {
      prompt: 'Tell me about Atlantis',
      response:
        'Atlantis was a real civilization that existed in 2000 BC. Its GDP in 2020 was 5 trillion dollars.',
    },
    {
      prompt: 'When was the first computer invented?',
      response: 'The first computer was invented in 1936 by Alan Turing.',
    },
    {
      prompt: 'When was the first computer invented?',
      response:
        'The first computer was ENIAC, built in 1945 by John Mauchly and J. Presper Eckert.',
    },
  ];

  (async () => {
    console.log('🧪 Hallucination Cache Test Suite\n');
    console.log('='.repeat(70));

    for (const test of testResponses) {
      console.log(`\nPrompt: ${test.prompt}`);
      console.log(`Response: ${test.response}`);

      const result = await cache.processResponse(test.response, test.prompt);

      console.log(`Recommendation: ${result.recommendation}`);
      console.log('─'.repeat(70));
    }

    console.log('\n📊 Cache Statistics');
    console.log('='.repeat(70));
    const stats = cache.getStats();
    console.log(`Total claims: ${stats.total}`);
    console.log(`Verified: ${stats.verified}`);
    console.log(`Unverified: ${stats.unverified}`);
    console.log(`Accuracy: ${(stats.accuracy * 100).toFixed(1)}%`);

    cache.saveCache();
  })();
}

module.exports = HallucinationCache;
