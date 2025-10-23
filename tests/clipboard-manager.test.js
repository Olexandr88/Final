import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ClipboardManager } from '../src/utils/clipboard-manager.js';

describe('ClipboardManager', () => {
  let clipboardManager;

  before(() => {
    clipboardManager = new ClipboardManager();
  });

  after(() => {
    clipboardManager.clearHistory();
  });

  beforeEach(() => {
    clipboardManager.clearHistory();
  });

  describe('Initialization', () => {
    it('should initialize clipboard manager', () => {
      assert.ok(clipboardManager, 'ClipboardManager should be initialized');
      assert.ok(Array.isArray(clipboardManager.history), 'History should be an array');
    });

    it('should detect environment correctly', () => {
      const isElectron = clipboardManager.isElectron;
      assert.strictEqual(typeof isElectron, 'boolean', 'isElectron should be boolean');
    });
  });

  describe('Capabilities', () => {
    it('should report capabilities', () => {
      const capabilities = clipboardManager.getCapabilities();

      assert.ok('copyText' in capabilities, 'Should report copyText capability');
      assert.ok('copyHTML' in capabilities, 'Should report copyHTML capability');
      assert.ok('copyImage' in capabilities, 'Should report copyImage capability');
      assert.ok('pasteText' in capabilities, 'Should report pasteText capability');
      assert.ok('pasteHTML' in capabilities, 'Should report pasteHTML capability');
      assert.ok('history' in capabilities, 'Should report history capability');
      assert.ok('isElectron' in capabilities, 'Should report isElectron flag');
    });

    it('should check if clipboard API is available', () => {
      const isAvailable = clipboardManager.isAvailable();
      assert.strictEqual(typeof isAvailable, 'boolean', 'isAvailable should return boolean');
    });
  });

  describe('Copy Operations', () => {
    it('should validate copy input', async () => {
      await assert.rejects(
        () => clipboardManager.copy(null),
        /Text must be a non-empty string/,
        'Should reject null input'
      );

      await assert.rejects(
        () => clipboardManager.copy(''),
        /Text must be a non-empty string/,
        'Should reject empty string'
      );

      await assert.rejects(
        () => clipboardManager.copy(123),
        /Text must be a non-empty string/,
        'Should reject non-string input'
      );
    });

    it('should add copy operation to history', async () => {
      const testText = 'Test clipboard content';

      try {
        await clipboardManager.copy(testText, { silent: true });

        const history = clipboardManager.getHistory();
        assert.ok(history.length > 0, 'History should have entries');

        const lastEntry = history[0];
        assert.strictEqual(lastEntry.type, 'text', 'Entry type should be text');
        assert.strictEqual(lastEntry.data, testText, 'Entry data should match input');
        assert.ok(lastEntry.timestamp, 'Entry should have timestamp');
      } catch (error) {
        if (error.message.includes('No clipboard API available')) {
          console.log('Skipping test - no clipboard API available in test environment');
        } else {
          throw error;
        }
      }
    });

    it('should maintain history limit', async () => {
      const MAX_HISTORY = 10;

      try {
        // Add more than MAX_HISTORY items
        for (let i = 0; i < 15; i++) {
          await clipboardManager.copy(`Test ${i}`, { silent: true });
        }

        const history = clipboardManager.getHistory();
        assert.ok(history.length <= MAX_HISTORY, `History should not exceed ${MAX_HISTORY} items`);

        // Most recent should be first
        const firstEntry = history[0];
        assert.strictEqual(firstEntry.data, 'Test 14', 'Most recent item should be first');
      } catch (error) {
        if (error.message.includes('No clipboard API available')) {
          console.log('Skipping test - no clipboard API available in test environment');
        } else {
          throw error;
        }
      }
    });
  });

  describe('HTML Operations', () => {
    it('should validate HTML input', async () => {
      await assert.rejects(
        () => clipboardManager.copyHTML(null),
        /HTML must be a non-empty string/,
        'Should reject null input'
      );

      await assert.rejects(
        () => clipboardManager.copyHTML(''),
        /HTML must be a non-empty string/,
        'Should reject empty string'
      );
    });

    it('should copy HTML with plain text fallback', async () => {
      const testHTML = '<p>Test <strong>HTML</strong> content</p>';
      const plainText = 'Test HTML content';

      try {
        await clipboardManager.copyHTML(testHTML, plainText);

        const history = clipboardManager.getHistory();
        const lastEntry = history[0];
        assert.strictEqual(lastEntry.type, 'html', 'Entry type should be html');
      } catch (error) {
        if (error.message.includes('No clipboard API available') ||
            error.message.includes('not supported')) {
          console.log('Skipping test - HTML clipboard not supported in test environment');
        } else {
          throw error;
        }
      }
    });
  });

  describe('Image Operations', () => {
    it('should validate image input', async () => {
      await assert.rejects(
        () => clipboardManager.copyImage(null),
        /Image data is required/,
        'Should reject null input'
      );
    });

    it('should handle image data URI', async () => {
      // Simple 1x1 transparent PNG data URI
      const imageDataURI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      try {
        await clipboardManager.copyImage(imageDataURI);

        const history = clipboardManager.getHistory();
        const lastEntry = history[0];
        assert.strictEqual(lastEntry.type, 'image', 'Entry type should be image');
      } catch (error) {
        if (error.message.includes('Image clipboard not supported')) {
          console.log('Skipping test - image clipboard not supported in test environment');
        } else {
          throw error;
        }
      }
    });
  });

  describe('History Management', () => {
    it('should get history with limit', async () => {
      try {
        await clipboardManager.copy('Test 1', { silent: true });
        await clipboardManager.copy('Test 2', { silent: true });
        await clipboardManager.copy('Test 3', { silent: true });

        const limitedHistory = clipboardManager.getHistory(2);
        assert.strictEqual(limitedHistory.length, 2, 'Should return limited history');

        const fullHistory = clipboardManager.getHistory();
        assert.strictEqual(fullHistory.length, 3, 'Should return full history when no limit');
      } catch (error) {
        if (error.message.includes('No clipboard API available')) {
          console.log('Skipping test - no clipboard API available in test environment');
        } else {
          throw error;
        }
      }
    });

    it('should clear history', () => {
      clipboardManager.history = [{ type: 'test', data: 'test' }];
      clipboardManager.clearHistory();

      assert.strictEqual(clipboardManager.history.length, 0, 'History should be empty');
    });
  });

  describe('Clear Operations', () => {
    it('should clear clipboard', async () => {
      try {
        const result = await clipboardManager.clear();
        assert.strictEqual(typeof result, 'boolean', 'Clear should return boolean');
      } catch (error) {
        if (error.message.includes('No clipboard API available')) {
          console.log('Skipping test - no clipboard API available in test environment');
        } else {
          throw error;
        }
      }
    });
  });

  describe('Silent Mode', () => {
    it('should support silent copy option', async () => {
      try {
        await clipboardManager.copy('Silent test', { silent: true });

        const history = clipboardManager.getHistory();
        assert.ok(history.length > 0, 'Should still add to history in silent mode');
      } catch (error) {
        if (error.message.includes('No clipboard API available')) {
          console.log('Skipping test - no clipboard API available in test environment');
        } else {
          throw error;
        }
      }
    });
  });
});
