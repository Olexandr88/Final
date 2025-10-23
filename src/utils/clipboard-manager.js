/**
 * Clipboard Manager - Universal clipboard operations for browser, Electron, and Node.js
 * Implements Async Clipboard API with fallbacks and history tracking
 * @module clipboard-manager
 */

import { logger } from './logger.js';

/**
 * Maximum number of clipboard history items to maintain
 */
const MAX_HISTORY_SIZE = 10;

/**
 * Clipboard Manager class providing cross-platform clipboard operations
 */
export class ClipboardManager {
  constructor() {
    this.history = [];
    this.isElectron = this._detectElectron();
    this.electronAPI = null;

    if (this.isElectron && typeof window !== 'undefined' && window.electronAPI?.clipboard) {
      this.electronAPI = window.electronAPI.clipboard;
      logger.info('ClipboardManager initialized with Electron API');
    } else {
      logger.info('ClipboardManager initialized with Web API');
    }
  }

  /**
   * Detect if running in Electron environment
   * @private
   * @returns {boolean} True if Electron environment detected
   */
  _detectElectron() {
    if (typeof navigator !== 'undefined' && navigator.userAgent) {
      return navigator.userAgent.toLowerCase().includes('electron');
    }
    if (typeof process !== 'undefined' && process.versions) {
      return !!process.versions.electron;
    }
    return false;
  }

  /**
   * Add item to clipboard history
   * @private
   * @param {Object} item - Clipboard item
   */
  _addToHistory(item) {
    const historyEntry = {
      ...item,
      timestamp: new Date().toISOString(),
    };

    this.history.unshift(historyEntry);

    if (this.history.length > MAX_HISTORY_SIZE) {
      this.history = this.history.slice(0, MAX_HISTORY_SIZE);
    }

    logger.debug('Added to clipboard history', {
      type: item.type,
      size: item.data?.length || 0,
      historySize: this.history.length,
    });
  }

  /**
   * Copy text to clipboard
   * @param {string} text - Text to copy
   * @param {Object} [options] - Options
   * @param {boolean} [options.silent=false] - Suppress logging
   * @returns {Promise<boolean>} True if successful
   */
  async copy(text, options = {}) {
    const { silent = false } = options;

    try {
      if (!text || typeof text !== 'string') {
        throw new Error('Text must be a non-empty string');
      }

      // Try Electron API first
      if (this.electronAPI) {
        await this.electronAPI.writeText(text);
        this._addToHistory({ type: 'text', data: text });
        if (!silent) {
          logger.info('Text copied to clipboard (Electron)', { length: text.length });
        }
        return true;
      }

      // Try modern Async Clipboard API
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        this._addToHistory({ type: 'text', data: text });
        if (!silent) {
          logger.info('Text copied to clipboard (Web API)', { length: text.length });
        }
        return true;
      }

      // Fallback to execCommand
      if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);

        if (success) {
          this._addToHistory({ type: 'text', data: text });
          if (!silent) {
            logger.info('Text copied to clipboard (execCommand fallback)', { length: text.length });
          }
          return true;
        }
      }

      throw new Error('No clipboard API available');
    } catch (error) {
      logger.error('Failed to copy text to clipboard', {
        error: error.message,
        length: text?.length || 0,
      });
      throw new Error(`Copy failed: ${error.message}`);
    }
  }

  /**
   * Copy HTML content to clipboard
   * @param {string} html - HTML content to copy
   * @param {string} [plainText] - Plain text fallback
   * @returns {Promise<boolean>} True if successful
   */
  async copyHTML(html, plainText = null) {
    try {
      if (!html || typeof html !== 'string') {
        throw new Error('HTML must be a non-empty string');
      }

      // Try Electron API
      if (this.electronAPI?.writeHTML) {
        await this.electronAPI.writeHTML(html);
        this._addToHistory({ type: 'html', data: html });
        logger.info('HTML copied to clipboard (Electron)', { length: html.length });
        return true;
      }

      // Try modern Async Clipboard API with ClipboardItem
      if (typeof navigator !== 'undefined' && navigator.clipboard?.write) {
        const htmlBlob = new Blob([html], { type: 'text/html' });
        const textBlob = new Blob([plainText || html.replace(/<[^>]*>/g, '')], { type: 'text/plain' });

        const clipboardItem = new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob,
        });

        await navigator.clipboard.write([clipboardItem]);
        this._addToHistory({ type: 'html', data: html });
        logger.info('HTML copied to clipboard (Web API)', { length: html.length });
        return true;
      }

      // Fallback to plain text copy
      logger.warn('HTML clipboard not supported, falling back to plain text');
      return await this.copy(plainText || html.replace(/<[^>]*>/g, ''));
    } catch (error) {
      logger.error('Failed to copy HTML to clipboard', {
        error: error.message,
        length: html?.length || 0,
      });
      throw new Error(`Copy HTML failed: ${error.message}`);
    }
  }

  /**
   * Copy image to clipboard
   * @param {Blob|string} imageData - Image blob or base64 data URI
   * @returns {Promise<boolean>} True if successful
   */
  async copyImage(imageData) {
    try {
      if (!imageData) {
        throw new Error('Image data is required');
      }

      // Try Electron API
      if (this.electronAPI?.writeImage) {
        if (typeof imageData === 'string') {
          await this.electronAPI.writeImage(imageData);
        } else {
          // Convert Blob to base64 data URI for Electron
          const reader = new FileReader();
          const dataURI = await new Promise((resolve, reject) => {
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(imageData);
          });
          await this.electronAPI.writeImage(dataURI);
        }
        this._addToHistory({ type: 'image', data: '[Image]' });
        logger.info('Image copied to clipboard (Electron)');
        return true;
      }

      // Try modern Async Clipboard API
      if (typeof navigator !== 'undefined' && navigator.clipboard?.write) {
        let blob = imageData;
        if (typeof imageData === 'string') {
          // Convert data URI to Blob
          const response = await fetch(imageData);
          blob = await response.blob();
        }

        const clipboardItem = new ClipboardItem({ [blob.type]: blob });
        await navigator.clipboard.write([clipboardItem]);
        this._addToHistory({ type: 'image', data: '[Image]' });
        logger.info('Image copied to clipboard (Web API)');
        return true;
      }

      throw new Error('Image clipboard not supported');
    } catch (error) {
      logger.error('Failed to copy image to clipboard', { error: error.message });
      throw new Error(`Copy image failed: ${error.message}`);
    }
  }

  /**
   * Paste text from clipboard
   * @returns {Promise<string>} Clipboard text content
   */
  async paste() {
    try {
      // Try Electron API first
      if (this.electronAPI?.readText) {
        const text = await this.electronAPI.readText();
        logger.debug('Text pasted from clipboard (Electron)', { length: text.length });
        return text;
      }

      // Try modern Async Clipboard API
      if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        logger.debug('Text pasted from clipboard (Web API)', { length: text.length });
        return text;
      }

      throw new Error('No clipboard read API available');
    } catch (error) {
      logger.error('Failed to paste from clipboard', { error: error.message });
      throw new Error(`Paste failed: ${error.message}`);
    }
  }

  /**
   * Paste HTML content from clipboard
   * @returns {Promise<string>} Clipboard HTML content
   */
  async pasteHTML() {
    try {
      // Try Electron API
      if (this.electronAPI?.readHTML) {
        const html = await this.electronAPI.readHTML();
        logger.debug('HTML pasted from clipboard (Electron)', { length: html.length });
        return html;
      }

      // Try modern Async Clipboard API
      if (typeof navigator !== 'undefined' && navigator.clipboard?.read) {
        const clipboardItems = await navigator.clipboard.read();
        for (const item of clipboardItems) {
          if (item.types.includes('text/html')) {
            const blob = await item.getType('text/html');
            const html = await blob.text();
            logger.debug('HTML pasted from clipboard (Web API)', { length: html.length });
            return html;
          }
        }
      }

      // Fallback to plain text
      logger.warn('HTML clipboard read not supported, falling back to plain text');
      return await this.paste();
    } catch (error) {
      logger.error('Failed to paste HTML from clipboard', { error: error.message });
      throw new Error(`Paste HTML failed: ${error.message}`);
    }
  }

  /**
   * Get clipboard history
   * @param {number} [limit=MAX_HISTORY_SIZE] - Maximum number of items to return
   * @returns {Array<Object>} Clipboard history
   */
  getHistory(limit = MAX_HISTORY_SIZE) {
    return this.history.slice(0, limit);
  }

  /**
   * Clear clipboard
   * @returns {Promise<boolean>} True if successful
   */
  async clear() {
    try {
      await this.copy('');
      logger.info('Clipboard cleared');
      return true;
    } catch (error) {
      logger.error('Failed to clear clipboard', { error: error.message });
      return false;
    }
  }

  /**
   * Clear clipboard history
   */
  clearHistory() {
    this.history = [];
    logger.info('Clipboard history cleared');
  }

  /**
   * Check if clipboard API is available
   * @returns {boolean} True if clipboard API is available
   */
  isAvailable() {
    return !!(
      this.electronAPI ||
      (typeof navigator !== 'undefined' && navigator.clipboard) ||
      (typeof document !== 'undefined' && document.execCommand)
    );
  }

  /**
   * Get clipboard capabilities
   * @returns {Object} Clipboard capabilities
   */
  getCapabilities() {
    return {
      copyText: this.isAvailable(),
      copyHTML: !!(
        this.electronAPI?.writeHTML ||
        (typeof navigator !== 'undefined' && navigator.clipboard?.write)
      ),
      copyImage: !!(
        this.electronAPI?.writeImage ||
        (typeof navigator !== 'undefined' && navigator.clipboard?.write)
      ),
      pasteText: !!(
        this.electronAPI?.readText ||
        (typeof navigator !== 'undefined' && navigator.clipboard?.readText)
      ),
      pasteHTML: !!(
        this.electronAPI?.readHTML ||
        (typeof navigator !== 'undefined' && navigator.clipboard?.read)
      ),
      history: true,
      isElectron: this.isElectron,
    };
  }
}

// Create singleton instance
const clipboardManager = new ClipboardManager();

export default clipboardManager;
