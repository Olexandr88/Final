/**
 * Secure Credential Management
 * Manages API keys and secrets with encryption
 */

import crypto from 'crypto';
import { logger } from '../utils/logger.js';

export class CredentialManager {
  constructor() {
    // Use system-specific encryption key (in production, use KMS)
    this.encryptionKey = this._deriveKey();
    this.credentials = new Map();

    // Patterns for detecting secrets in logs/outputs
    this.SECRET_PATTERNS = [
      /sk-[a-zA-Z0-9]{48}/g, // Anthropic API keys
      /gsk_[a-zA-Z0-9]{52}/g, // Groq API keys
      /ghp_[a-zA-Z0-9]{36}/g, // GitHub tokens
      /AKIA[0-9A-Z]{16}/g, // AWS access keys
      /sk-[a-zA-Z0-9-]{48}/g, // OpenAI keys
    ];
  }

  /**
   * Derive encryption key from system info
   * @private
   */
  _deriveKey() {
    const secret = process.env.ENCRYPTION_SECRET || 'default-dev-secret-CHANGE-ME';
    return crypto.scryptSync(secret, 'salt', 32);
  }

  /**
   * Store credential securely
   * @param {string} key - Credential key
   * @param {string} value - Credential value
   */
  store(key, value) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    this.credentials.set(key, {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    });

    logger.info('Credential stored', { key });
  }

  /**
   * Retrieve credential
   * @param {string} key - Credential key
   * @returns {string|null} Decrypted credential
   */
  retrieve(key) {
    const stored = this.credentials.get(key);
    if (!stored) {
      return null;
    }

    try {
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        this.encryptionKey,
        Buffer.from(stored.iv, 'hex')
      );

      decipher.setAuthTag(Buffer.from(stored.authTag, 'hex'));

      let decrypted = decipher.update(stored.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.error('Failed to decrypt credential', { key, error: error.message });
      return null;
    }
  }

  /**
   * Redact secrets from text
   * @param {string} text - Text to redact
   * @returns {string} Redacted text
   */
  redactSecrets(text) {
    if (typeof text !== 'string') {
      return text;
    }

    let redacted = text;

    for (const pattern of this.SECRET_PATTERNS) {
      redacted = redacted.replace(pattern, '***REDACTED***');
    }

    // Redact common environment variables
    redacted = redacted.replace(/API_KEY=[\w-]+/gi, 'API_KEY=***REDACTED***');
    redacted = redacted.replace(/PASSWORD=[\w-]+/gi, 'PASSWORD=***REDACTED***');
    redacted = redacted.replace(/SECRET=[\w-]+/gi, 'SECRET=***REDACTED***');

    return redacted;
  }

  /**
   * Scan text for exposed secrets
   * @param {string} text - Text to scan
   * @returns {Array<Object>} Found secrets
   */
  scanForSecrets(text) {
    const findings = [];

    for (const pattern of this.SECRET_PATTERNS) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        findings.push({
          pattern: pattern.source,
          position: match.index,
          length: match[0].length
        });
      }
    }

    return findings;
  }
}

export const credentialManager = new CredentialManager();
