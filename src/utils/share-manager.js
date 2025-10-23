/**
 * Share Manager - Web Share API wrapper with fallbacks
 * Implements Web Share API for sharing content across platforms
 * @module share-manager
 */

import { logger } from './logger.js';
import clipboardManager from './clipboard-manager.js';

/**
 * Share Manager class providing cross-platform content sharing
 */
export class ShareManager {
  constructor() {
    this.isSupported = this._checkSupport();
    logger.info('ShareManager initialized', { supported: this.isSupported });
  }

  /**
   * Check if Web Share API is supported
   * @private
   * @returns {boolean} True if supported
   */
  _checkSupport() {
    return typeof navigator !== 'undefined' && !!navigator.share;
  }

  /**
   * Check if content can be shared
   * @param {Object} data - Data to share
   * @returns {boolean} True if can share
   */
  canShare(data = {}) {
    if (!this.isSupported) {
      return false;
    }

    try {
      return navigator.canShare ? navigator.canShare(data) : true;
    } catch (error) {
      logger.debug('canShare check failed', { error: error.message });
      return false;
    }
  }

  /**
   * Share content using Web Share API or fallback
   * @param {Object} data - Data to share
   * @param {string} [data.title] - Title
   * @param {string} [data.text] - Text content
   * @param {string} [data.url] - URL to share
   * @param {Array<File>} [data.files] - Files to share
   * @returns {Promise<Object>} Share result
   */
  async share(data) {
    try {
      if (!data || (!data.title && !data.text && !data.url && !data.files)) {
        throw new Error('At least one of title, text, url, or files must be provided');
      }

      // Try Web Share API
      if (this.isSupported && this.canShare(data)) {
        await navigator.share(data);
        logger.info('Content shared via Web Share API', {
          hasTitle: !!data.title,
          hasText: !!data.text,
          hasURL: !!data.url,
          fileCount: data.files?.length || 0,
        });
        return { success: true, method: 'web-share-api' };
      }

      // Fallback methods
      return await this._fallbackShare(data);
    } catch (error) {
      if (error.name === 'AbortError') {
        logger.info('Share cancelled by user');
        return { success: false, error: 'cancelled', message: 'Share cancelled by user' };
      }

      logger.error('Share failed', { error: error.message });
      throw new Error(`Share failed: ${error.message}`);
    }
  }

  /**
   * Fallback share methods when Web Share API is unavailable
   * @private
   * @param {Object} data - Data to share
   * @returns {Promise<Object>} Share result
   */
  async _fallbackShare(data) {
    // Try to build shareable text
    let shareText = '';
    if (data.title) shareText += `${data.title}\n\n`;
    if (data.text) shareText += `${data.text}\n\n`;
    if (data.url) shareText += data.url;

    if (shareText.trim()) {
      // Copy to clipboard as fallback
      await clipboardManager.copy(shareText.trim());
      logger.info('Content copied to clipboard (fallback)', { length: shareText.length });
      return {
        success: true,
        method: 'clipboard',
        message: 'Content copied to clipboard. You can now paste it wherever you need.',
      };
    }

    throw new Error('No shareable content available');
  }

  /**
   * Share plain text
   * @param {string} text - Text to share
   * @param {string} [title] - Optional title
   * @returns {Promise<Object>} Share result
   */
  async shareText(text, title = null) {
    if (!text) {
      throw new Error('Text is required');
    }

    return await this.share({
      text,
      ...(title && { title }),
    });
  }

  /**
   * Share URL
   * @param {string} url - URL to share
   * @param {string} [title] - Optional title
   * @param {string} [text] - Optional description
   * @returns {Promise<Object>} Share result
   */
  async shareURL(url, title = null, text = null) {
    if (!url) {
      throw new Error('URL is required');
    }

    return await this.share({
      url,
      ...(title && { title }),
      ...(text && { text }),
    });
  }

  /**
   * Share file(s)
   * @param {File|Array<File>} files - File(s) to share
   * @param {string} [title] - Optional title
   * @param {string} [text] - Optional description
   * @returns {Promise<Object>} Share result
   */
  async shareFile(files, title = null, text = null) {
    if (!files) {
      throw new Error('File(s) required');
    }

    const fileArray = Array.isArray(files) ? files : [files];

    if (!this.canShare({ files: fileArray })) {
      throw new Error('File sharing not supported on this device');
    }

    return await this.share({
      files: fileArray,
      ...(title && { title }),
      ...(text && { text }),
    });
  }

  /**
   * Export formatted report
   * @param {Object} reportData - Report data to export
   * @param {string} reportData.title - Report title
   * @param {Object} reportData.sections - Report sections
   * @param {string} [reportData.format='text'] - Export format (text, html, json)
   * @returns {Promise<Object>} Share result
   */
  async exportReport(reportData) {
    try {
      const { title, sections, format = 'text' } = reportData;

      let content = '';
      let contentType = 'text/plain';

      switch (format) {
        case 'html':
          content = this._formatReportHTML(title, sections);
          contentType = 'text/html';
          break;
        case 'json':
          content = JSON.stringify({ title, sections, timestamp: new Date().toISOString() }, null, 2);
          contentType = 'application/json';
          break;
        case 'text':
        default:
          content = this._formatReportText(title, sections);
          contentType = 'text/plain';
          break;
      }

      // Try to share as file
      if (this.isSupported && this.canShare({ files: [] })) {
        const blob = new Blob([content], { type: contentType });
        const fileName = `${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.${format === 'html' ? 'html' : format === 'json' ? 'json' : 'txt'}`;
        const file = new File([blob], fileName, { type: contentType });

        return await this.shareFile(file, title, `Report: ${title}`);
      }

      // Fallback to text share
      return await this.shareText(content, title);
    } catch (error) {
      logger.error('Export report failed', { error: error.message });
      throw new Error(`Export failed: ${error.message}`);
    }
  }

  /**
   * Format report as plain text
   * @private
   * @param {string} title - Report title
   * @param {Object} sections - Report sections
   * @returns {string} Formatted text
   */
  _formatReportText(title, sections) {
    let text = `${title}\n${'='.repeat(title.length)}\n\n`;
    text += `Generated: ${new Date().toLocaleString()}\n\n`;

    Object.entries(sections).forEach(([sectionTitle, content]) => {
      text += `${sectionTitle}\n${'-'.repeat(sectionTitle.length)}\n`;
      if (typeof content === 'object') {
        text += JSON.stringify(content, null, 2);
      } else {
        text += content;
      }
      text += '\n\n';
    });

    return text;
  }

  /**
   * Format report as HTML
   * @private
   * @param {string} title - Report title
   * @param {Object} sections - Report sections
   * @returns {string} Formatted HTML
   */
  _formatReportHTML(title, sections) {
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
    h2 { color: #555; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-top: 30px; }
    pre { background: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto; }
    .timestamp { color: #666; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p class="timestamp">Generated: ${new Date().toLocaleString()}</p>
`;

    Object.entries(sections).forEach(([sectionTitle, content]) => {
      html += `  <h2>${sectionTitle}</h2>\n`;
      if (typeof content === 'object') {
        html += `  <pre>${JSON.stringify(content, null, 2)}</pre>\n`;
      } else {
        html += `  <p>${content}</p>\n`;
      }
    });

    html += `</body>
</html>`;

    return html;
  }

  /**
   * Share training recommendations
   * @param {Array<Object>} recommendations - Training recommendations
   * @param {string} [format='text'] - Export format
   * @returns {Promise<Object>} Share result
   */
  async shareTrainingRecommendations(recommendations, format = 'text') {
    return await this.exportReport({
      title: 'Training Recommendations',
      sections: {
        'Recommended Modules': recommendations.map(r => ({
          title: r.title,
          level: r.level,
          duration: `${r.duration_minutes} minutes`,
          url: r.url,
        })),
        Summary: `${recommendations.length} training modules recommended based on your skills and interests`,
      },
      format,
    });
  }

  /**
   * Share code analysis results
   * @param {Object} analysis - Code analysis results
   * @param {string} [format='text'] - Export format
   * @returns {Promise<Object>} Share result
   */
  async shareCodeAnalysis(analysis, format = 'text') {
    return await this.exportReport({
      title: 'Code Analysis Results',
      sections: {
        Summary: analysis.summary || 'Code analysis completed',
        Metrics: analysis.metrics || {},
        Issues: analysis.issues || [],
        Recommendations: analysis.recommendations || [],
      },
      format,
    });
  }

  /**
   * Share session summary
   * @param {Object} session - Session data
   * @param {string} [format='text'] - Export format
   * @returns {Promise<Object>} Share result
   */
  async shareSessionSummary(session, format = 'text') {
    return await this.exportReport({
      title: `Session Summary: ${session.title || 'Untitled'}`,
      sections: {
        Overview: {
          sessionId: session.id,
          started: session.startTime,
          duration: session.duration || 'N/A',
          messagesCount: session.messages?.length || 0,
        },
        'Key Activities': session.activities || [],
        Outcomes: session.outcomes || [],
      },
      format,
    });
  }

  /**
   * Get share capabilities
   * @returns {Object} Share capabilities
   */
  getCapabilities() {
    return {
      webShareAPI: this.isSupported,
      canShareText: true,
      canShareURL: true,
      canShareFiles: this.isSupported && navigator.canShare ? navigator.canShare({ files: [] }) : false,
      fallbackMethod: 'clipboard',
    };
  }
}

// Create singleton instance
const shareManager = new ShareManager();

export default shareManager;
