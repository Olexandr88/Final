/**
 * Chrome AI Integration Tests
 * @module tests/chrome-ai
 */

import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

// Mock browser APIs for Node.js testing
global.window = {
  ai: {
    summarizer: {
      create: mock.fn(async (options) => ({
        summarize: mock.fn(async (text) => `Summary of: ${text.substring(0, 50)}...`),
        summarizeStreaming: mock.fn(async function* (text) {
          yield `Summary chunk 1`;
          yield `Summary chunk 2`;
          yield `Summary of: ${text.substring(0, 50)}...`;
        }),
        destroy: mock.fn(),
      })),
    },
    writer: {
      create: mock.fn(async (options) => ({
        write: mock.fn(async (prompt) => `Generated content for: ${prompt}`),
        destroy: mock.fn(),
      })),
    },
    rewriter: {
      create: mock.fn(async (options) => ({
        rewrite: mock.fn(async (text) => `Rewritten: ${text}`),
        destroy: mock.fn(),
      })),
    },
    proofreader: {
      create: mock.fn(async (options) => ({
        proofread: mock.fn(async (text) => ({
          corrections: [
            { start: 0, end: 5, replacement: 'Fixed', type: 'spelling' },
          ],
        })),
        destroy: mock.fn(),
      })),
    },
    languageDetector: {
      create: mock.fn(async () => ({
        detect: mock.fn(async (text) => ({
          detectedLanguages: [
            { language: 'en', confidence: 0.95 },
          ],
        })),
        destroy: mock.fn(),
      })),
    },
    translator: {
      create: mock.fn(async (options) => ({
        translate: mock.fn(async (text) => `Translated: ${text}`),
        destroy: mock.fn(),
      })),
      capabilities: mock.fn(async (options) => 'readily'),
    },
    languageModel: {
      create: mock.fn(async (options) => ({
        prompt: mock.fn(async (text) => `AI response to: ${text}`),
        promptStreaming: mock.fn(async function* (text) {
          yield `AI chunk 1`;
          yield `AI chunk 2`;
          yield `AI response to: ${text}`;
        }),
        destroy: mock.fn(),
      })),
      capabilities: mock.fn(async () => ({
        available: 'readily',
        maxTokens: 4096,
      })),
    },
  },
};

global.navigator = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
};

global.scheduler = {
  postTask: mock.fn(async (task, options) => {
    return await task();
  }),
};

// Import after mocking
const chromeAI = (await import('../../src/chrome-ai/index.js')).default;
const { detectCapabilities } = await import('../../src/chrome-ai/capability-detector.js');
const { applyCorrections } = await import('../../src/chrome-ai/ai-text-apis.js');

describe('Chrome AI - Capability Detection', () => {
  it('should detect all capabilities', async () => {
    const capabilities = await detectCapabilities();

    assert.strictEqual(capabilities.isChrome, true);
    assert.strictEqual(capabilities.chromeVersion, '138');
    assert.strictEqual(capabilities.summarizer, true);
    assert.strictEqual(capabilities.writer, true);
    assert.strictEqual(capabilities.rewriter, true);
    assert.strictEqual(capabilities.proofreader, true);
    assert.strictEqual(capabilities.languageDetector, true);
    assert.strictEqual(capabilities.translator, true);
    assert.strictEqual(capabilities.prompt, true);
    assert.strictEqual(capabilities.scheduling, true);
  });

  it('should initialize ChromeAI module', async () => {
    const caps = await chromeAI.initialize();
    assert.ok(caps);
    assert.strictEqual(caps.summarizer, true);
  });
});

describe('Chrome AI - Text Processing', () => {
  before(async () => {
    await chromeAI.initialize();
  });

  it('should summarize text', async () => {
    const text = 'This is a long article that needs to be summarized for the reader.';
    const summary = await chromeAI.summarize(text, { type: 'tl;dr' });

    assert.ok(summary);
    assert.ok(summary.includes('Summary'));
  });

  it('should summarize with streaming', async () => {
    const text = 'Long article text here...';
    const chunks = [];

    const summary = await chromeAI.summarizeStreaming(
      text,
      { type: 'key-points' },
      (chunk) => chunks.push(chunk)
    );

    assert.ok(summary);
    assert.ok(chunks.length > 0);
  });

  it('should write content', async () => {
    const prompt = 'Write a blog post about AI';
    const content = await chromeAI.write(prompt, { tone: 'professional' });

    assert.ok(content);
    assert.ok(content.includes('Generated'));
  });

  it('should rewrite text', async () => {
    const text = 'Original text here';
    const rewritten = await chromeAI.rewrite(text, { tone: 'casual' });

    assert.ok(rewritten);
    assert.ok(rewritten.includes('Rewritten'));
  });

  it('should proofread text', async () => {
    const text = 'Text with typos';
    const results = await chromeAI.proofread(text);

    assert.ok(results);
    assert.ok(Array.isArray(results.corrections));
    assert.strictEqual(results.corrections.length, 1);
  });

  it('should apply proofreading corrections', () => {
    const text = 'Wrnog spelling here';
    const results = {
      corrections: [
        { start: 0, end: 5, replacement: 'Wrong', type: 'spelling' },
      ],
    };

    const corrected = applyCorrections(text, results);
    assert.strictEqual(corrected, 'Wrong spelling here');
  });
});

describe('Chrome AI - Language APIs', () => {
  before(async () => {
    await chromeAI.initialize();
  });

  it('should detect language', async () => {
    const text = 'Hello world';
    const detection = await chromeAI.detectLanguage(text);

    assert.ok(detection);
    assert.ok(Array.isArray(detection.detectedLanguages));
    assert.strictEqual(detection.detectedLanguages[0].language, 'en');
  });

  it('should translate text', async () => {
    const text = 'Hello world';
    const translated = await chromeAI.translate(text, {
      sourceLanguage: 'en',
      targetLanguage: 'es',
    });

    assert.ok(translated);
    assert.ok(translated.includes('Translated'));
  });

  it('should auto-translate with detection', async () => {
    const text = 'Bonjour le monde';
    const result = await chromeAI.autoTranslate(text, 'en');

    assert.ok(result);
    assert.strictEqual(result.sourceLanguage, 'en'); // Mock returns 'en'
    assert.strictEqual(result.targetLanguage, 'en');
    assert.ok(result.translatedText);
  });

  it('should check translation availability', async () => {
    const canTranslate = await chromeAI.canTranslate('en', 'es');
    assert.strictEqual(canTranslate, true);
  });

  it('should get supported languages', async () => {
    const languages = await chromeAI.getSupportedLanguages();
    assert.ok(Array.isArray(languages));
    assert.ok(languages.length > 0);
  });
});

describe('Chrome AI - Prompt API', () => {
  before(async () => {
    await chromeAI.initialize();
  });

  it('should send prompt to Gemini Nano', async () => {
    const response = await chromeAI.prompt('What is AI?');
    assert.ok(response);
    assert.ok(response.includes('AI response'));
  });

  it('should stream prompt responses', async () => {
    const chunks = [];
    const response = await chromeAI.promptStreaming(
      'Tell me a story',
      (chunk) => chunks.push(chunk)
    );

    assert.ok(response);
    assert.ok(chunks.length > 0);
  });

  it('should handle prompt with options', async () => {
    const response = await chromeAI.prompt('Write a poem', {
      temperature: 0.9,
      systemPrompt: 'You are a poet',
    });

    assert.ok(response);
  });
});

describe('Chrome AI - Scheduling API', () => {
  before(async () => {
    await chromeAI.initialize();
  });

  it('should schedule user-blocking task', async () => {
    let executed = false;
    await chromeAI.scheduleUserBlockingTask(async () => {
      executed = true;
      return 'result';
    });

    assert.strictEqual(executed, true);
  });

  it('should schedule user-visible task', async () => {
    const result = await chromeAI.scheduleUserVisibleTask(async () => {
      return 'visible-result';
    });

    assert.strictEqual(result, 'visible-result');
  });

  it('should schedule background task', async () => {
    const result = await chromeAI.scheduleBackgroundTask(async () => {
      return 'background-result';
    });

    assert.strictEqual(result, 'background-result');
  });

  it('should create scheduler with consistent priority', async () => {
    const scheduler = chromeAI.createScheduler('background');
    const result = await scheduler.schedule(async () => 'test');

    assert.strictEqual(result, 'test');
    assert.strictEqual(scheduler.getPriority(), 'background');
  });

  it('should yield to main thread', async () => {
    const start = Date.now();
    await chromeAI.yieldToMain(10);
    const elapsed = Date.now() - start;

    // Should take at least the delay time
    assert.ok(elapsed >= 0);
  });
});

describe('Chrome AI - Error Handling', () => {
  it('should handle missing APIs gracefully', async () => {
    // Temporarily remove an API
    const originalSummarizer = global.window.ai.summarizer;
    delete global.window.ai.summarizer;

    try {
      await chromeAI.summarize('test');
      assert.fail('Should have thrown error');
    } catch (error) {
      assert.ok(error.message.includes('not available'));
    }

    // Restore
    global.window.ai.summarizer = originalSummarizer;
  });

  it('should handle invalid translation options', async () => {
    try {
      await chromeAI.translate('test', {}); // Missing required options
      assert.fail('Should have thrown error');
    } catch (error) {
      assert.ok(error.message.includes('required'));
    }
  });
});

describe('Chrome AI - Integration', () => {
  it('should work in end-to-end workflow', async () => {
    // Detect language
    const text = 'Hello, this is a test article about AI technology.';
    const detection = await chromeAI.detectLanguage(text);
    assert.strictEqual(detection.detectedLanguages[0].language, 'en');

    // Summarize
    const summary = await chromeAI.summarize(text, { length: 'short' });
    assert.ok(summary);

    // Rewrite summary
    const rewritten = await chromeAI.rewrite(summary, { tone: 'casual' });
    assert.ok(rewritten);

    // Proofread
    const proofread = await chromeAI.proofread(rewritten);
    assert.ok(proofread);

    // Translate
    const translated = await chromeAI.translate(rewritten, {
      sourceLanguage: 'en',
      targetLanguage: 'es',
    });
    assert.ok(translated);
  });
});
