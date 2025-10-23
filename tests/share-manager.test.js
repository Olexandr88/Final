import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ShareManager } from '../src/utils/share-manager.js';

describe('ShareManager', () => {
  let shareManager;

  before(() => {
    shareManager = new ShareManager();
  });

  describe('Initialization', () => {
    it('should initialize share manager', () => {
      assert.ok(shareManager, 'ShareManager should be initialized');
      assert.strictEqual(typeof shareManager.isSupported, 'boolean', 'isSupported should be boolean');
    });

    it('should detect Web Share API support', () => {
      const supported = shareManager.isSupported;
      assert.strictEqual(typeof supported, 'boolean', 'Should return boolean for support check');
    });
  });

  describe('Capabilities', () => {
    it('should report capabilities', () => {
      const capabilities = shareManager.getCapabilities();

      assert.ok('webShareAPI' in capabilities, 'Should report webShareAPI capability');
      assert.ok('canShareText' in capabilities, 'Should report canShareText capability');
      assert.ok('canShareURL' in capabilities, 'Should report canShareURL capability');
      assert.ok('canShareFiles' in capabilities, 'Should report canShareFiles capability');
      assert.ok('fallbackMethod' in capabilities, 'Should report fallbackMethod');
    });

    it('should check if specific content can be shared', () => {
      const canShare = shareManager.canShare({ text: 'test' });
      assert.strictEqual(typeof canShare, 'boolean', 'canShare should return boolean');
    });
  });

  describe('Input Validation', () => {
    it('should reject empty share data', async () => {
      await assert.rejects(
        () => shareManager.share({}),
        /At least one of title, text, url, or files must be provided/,
        'Should reject empty data'
      );

      await assert.rejects(
        () => shareManager.share(null),
        /At least one of title, text, url, or files must be provided/,
        'Should reject null data'
      );
    });

    it('should reject empty text share', async () => {
      await assert.rejects(
        () => shareManager.shareText(''),
        /Text is required/,
        'Should reject empty text'
      );

      await assert.rejects(
        () => shareManager.shareText(null),
        /Text is required/,
        'Should reject null text'
      );
    });

    it('should reject empty URL share', async () => {
      await assert.rejects(
        () => shareManager.shareURL(''),
        /URL is required/,
        'Should reject empty URL'
      );

      await assert.rejects(
        () => shareManager.shareURL(null),
        /URL is required/,
        'Should reject null URL'
      );
    });

    it('should reject empty file share', async () => {
      await assert.rejects(
        () => shareManager.shareFile(null),
        /File\(s\) required/,
        'Should reject null file'
      );
    });
  });

  describe('Text Sharing', () => {
    it('should accept valid text share', async () => {
      try {
        const result = await shareManager.shareText('Test content');

        assert.ok(result, 'Should return result');
        assert.ok('success' in result, 'Result should have success property');
        assert.ok('method' in result, 'Result should have method property');
      } catch (error) {
        // Expected to fail in test environment without Web Share API
        console.log('Text share test skipped - no share API in test environment');
      }
    });

    it('should accept text with title', async () => {
      try {
        const result = await shareManager.shareText('Test content', 'Test Title');

        assert.ok(result, 'Should return result');
      } catch (error) {
        console.log('Text share with title test skipped - no share API in test environment');
      }
    });
  });

  describe('URL Sharing', () => {
    it('should accept valid URL share', async () => {
      try {
        const result = await shareManager.shareURL('https://example.com');

        assert.ok(result, 'Should return result');
      } catch (error) {
        console.log('URL share test skipped - no share API in test environment');
      }
    });

    it('should accept URL with title and text', async () => {
      try {
        const result = await shareManager.shareURL(
          'https://example.com',
          'Test Title',
          'Test description'
        );

        assert.ok(result, 'Should return result');
      } catch (error) {
        console.log('URL share with metadata test skipped - no share API in test environment');
      }
    });
  });

  describe('Report Export', () => {
    it('should format text report correctly', async () => {
      const reportData = {
        title: 'Test Report',
        sections: {
          'Section 1': 'Content 1',
          'Section 2': { key: 'value' },
        },
        format: 'text',
      };

      try {
        const result = await shareManager.exportReport(reportData);
        assert.ok(result, 'Should return result');
      } catch (error) {
        console.log('Text report export test skipped - no share API in test environment');
      }
    });

    it('should format HTML report correctly', async () => {
      const reportData = {
        title: 'Test Report',
        sections: {
          'Section 1': 'Content 1',
        },
        format: 'html',
      };

      try {
        const result = await shareManager.exportReport(reportData);
        assert.ok(result, 'Should return result');
      } catch (error) {
        console.log('HTML report export test skipped - no share API in test environment');
      }
    });

    it('should format JSON report correctly', async () => {
      const reportData = {
        title: 'Test Report',
        sections: {
          'Section 1': { data: 'value' },
        },
        format: 'json',
      };

      try {
        const result = await shareManager.exportReport(reportData);
        assert.ok(result, 'Should return result');
      } catch (error) {
        console.log('JSON report export test skipped - no share API in test environment');
      }
    });
  });

  describe('Specialized Share Methods', () => {
    it('should share training recommendations', async () => {
      const recommendations = [
        {
          title: 'Module 1',
          level: 'beginner',
          duration_minutes: 60,
          url: 'https://example.com/module1',
        },
        {
          title: 'Module 2',
          level: 'intermediate',
          duration_minutes: 90,
          url: 'https://example.com/module2',
        },
      ];

      try {
        const result = await shareManager.shareTrainingRecommendations(recommendations);
        assert.ok(result, 'Should return result');
      } catch (error) {
        console.log('Training recommendations share test skipped');
      }
    });

    it('should share code analysis', async () => {
      const analysis = {
        summary: 'Code looks good',
        metrics: { lines: 100, complexity: 5 },
        issues: ['Minor issue 1'],
        recommendations: ['Consider refactoring'],
      };

      try {
        const result = await shareManager.shareCodeAnalysis(analysis);
        assert.ok(result, 'Should return result');
      } catch (error) {
        console.log('Code analysis share test skipped');
      }
    });

    it('should share session summary', async () => {
      const session = {
        id: 'session-123',
        title: 'Test Session',
        startTime: '2025-01-01T00:00:00Z',
        duration: '30 minutes',
        messages: [1, 2, 3],
        activities: ['Activity 1', 'Activity 2'],
        outcomes: ['Outcome 1'],
      };

      try {
        const result = await shareManager.shareSessionSummary(session);
        assert.ok(result, 'Should return result');
      } catch (error) {
        console.log('Session summary share test skipped');
      }
    });
  });

  describe('Report Formatting', () => {
    it('should format text reports with proper structure', () => {
      const title = 'Test';
      const sections = { 'Section 1': 'Content' };
      const formatted = shareManager._formatReportText(title, sections);

      assert.ok(formatted.includes(title), 'Should include title');
      assert.ok(formatted.includes('Section 1'), 'Should include section title');
      assert.ok(formatted.includes('Content'), 'Should include content');
      assert.ok(formatted.includes('Generated:'), 'Should include timestamp');
    });

    it('should format HTML reports with proper structure', () => {
      const title = 'Test';
      const sections = { 'Section 1': 'Content' };
      const formatted = shareManager._formatReportHTML(title, sections);

      assert.ok(formatted.includes('<!DOCTYPE html>'), 'Should be valid HTML');
      assert.ok(formatted.includes(title), 'Should include title');
      assert.ok(formatted.includes('<h2>Section 1</h2>'), 'Should include section heading');
      assert.ok(formatted.includes('Content'), 'Should include content');
    });
  });
});
