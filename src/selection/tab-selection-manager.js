import {
  saveSelection,
  getLatestSelections,
  getSelectionCount,
  searchSelections,
} from '../selection-store.js';

export default class TabSelectionManager {
  constructor(options = {}) {
    this.maxSelections = options.maxSelections || 100;
    this.selections = new Map();
    this.performance = { captureLatency: [], analysisLatency: [] };
  }

  async optimizeCurrentTab(tabId, metrics) {
    return { tabId, performance: { suggestions: ['Reduce memory usage', 'Optimize images'] } };
  }

  async handleTextSelection(tabId, text, metadata = {}) {
    const startTime = Date.now();
    const analysis = {
      tabId,
      text,
      language: /[a-zA-Z]/.test(text) ? 'en' : 'unknown',
      wordCount: text.split(/\s+/).length,
      charCount: text.length,
      sentiment: this.analyzeSentiment(text),
      timestamp: new Date().toISOString(),
      metadata,
      suggestions: ['Save to clipboard', 'Share'],
      preview: text.slice(0, 50),
    };

    // Store in-memory for quick access
    this.selections.set(`${tabId}-${Date.now()}`, analysis);

    // Persist to SQLite database
    try {
      const selectionId = saveSelection({
        url: metadata.url || `tab://${tabId}`,
        title: metadata.title || `Tab ${tabId}`,
        selected_text: text,
        source: metadata.source || 'tab-manager',
      });
      analysis.selectionId = selectionId;
    } catch (error) {
      console.error('Failed to save selection to database:', error);
    }

    this.performance.captureLatency.push(Date.now() - startTime);
    return analysis;
  }

  analyzeSentiment(text) {
    const positive = ['amazing', 'excellent', 'great', 'wonderful', 'fantastic'];
    const negative = ['bad', 'terrible', 'awful', 'poor', 'horrible'];
    const lower = text.toLowerCase();
    const posCount = positive.filter((w) => lower.includes(w)).length;
    const negCount = negative.filter((w) => lower.includes(w)).length;
    if (posCount > negCount) return 'positive';
    if (negCount > posCount) return 'negative';
    return 'neutral';
  }

  getPerformanceMetrics() {
    const { captureLatency } = this.performance;
    return {
      avgCaptureLatency:
        captureLatency.length > 0
          ? captureLatency.reduce((a, b) => a + b, 0) / captureLatency.length
          : 0,
      maxCaptureLatency: Math.max(...captureLatency, 0),
      totalSelections: this.selections.size,
      persistedSelections: getSelectionCount(),
    };
  }

  getLatestSelections(limit = 10) {
    return getLatestSelections(limit);
  }

  searchSelections(query, limit = 50) {
    return searchSelections(query, limit);
  }

  getStorageStats() {
    const totalCount = getSelectionCount();
    const recent = getLatestSelections(5);
    return {
      totalSelections: totalCount,
      recentSelections: recent.length,
      oldestSelection: recent.length > 0 ? recent[recent.length - 1]?.created_at : null,
      newestSelection: recent.length > 0 ? recent[0]?.created_at : null,
    };
  }
}
