/**
 * Input Validation Layer
 * Validates and sanitizes all user inputs before processing
 */

import { logger } from '../utils/logger.js';

/**
 * Simple schema validation (avoiding external dependency for now)
 */
class SchemaValidator {
  validateObject(schema, data) {
    if (typeof data !== 'object' || data === null) {
      throw new Error('Input must be an object');
    }

    const errors = [];

    // Check required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in data)) {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }

    // Validate properties
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in data) {
          const value = data[key];

          // Type validation
          if (propSchema.type) {
            const actualType = Array.isArray(value) ? 'array' : typeof value;
            if (actualType !== propSchema.type) {
              errors.push(`Field ${key} must be of type ${propSchema.type}, got ${actualType}`);
            }
          }

          // String validations
          if (propSchema.type === 'string' && typeof value === 'string') {
            if (propSchema.minLength && value.length < propSchema.minLength) {
              errors.push(`Field ${key} must be at least ${propSchema.minLength} characters`);
            }
            if (propSchema.maxLength && value.length > propSchema.maxLength) {
              errors.push(`Field ${key} must be at most ${propSchema.maxLength} characters`);
            }
            if (propSchema.enum && !propSchema.enum.includes(value)) {
              errors.push(`Field ${key} must be one of: ${propSchema.enum.join(', ')}`);
            }
          }

          // Number validations
          if (propSchema.type === 'number' && typeof value === 'number') {
            if (propSchema.minimum !== undefined && value < propSchema.minimum) {
              errors.push(`Field ${key} must be at least ${propSchema.minimum}`);
            }
            if (propSchema.maximum !== undefined && value > propSchema.maximum) {
              errors.push(`Field ${key} must be at most ${propSchema.maximum}`);
            }
          }

          // Array validations
          if (propSchema.type === 'array' && Array.isArray(value)) {
            if (propSchema.items) {
              for (const item of value) {
                const itemType = typeof item;
                if (itemType !== propSchema.items.type) {
                  errors.push(`Array ${key} items must be of type ${propSchema.items.type}`);
                  break;
                }
              }
            }
          }
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.join('; ')}`);
    }

    return data;
  }
}

export class InputValidator {
  constructor() {
    this.validator = new SchemaValidator();

    // Command parameter schema
    this.commandSchema = {
      type: 'object',
      properties: {
        command: { type: 'string', minLength: 1, maxLength: 1000 },
        args: { type: 'array', items: { type: 'string' } },
        cwd: { type: 'string' },
        timeout: { type: 'number', minimum: 100, maximum: 300000 }
      },
      required: ['command']
    };

    // File operation schema
    this.fileSchema = {
      type: 'object',
      properties: {
        path: { type: 'string', minLength: 1, maxLength: 500 },
        content: { type: 'string', maxLength: 10 * 1024 * 1024 }, // 10MB max
        encoding: { type: 'string', enum: ['utf8', 'ascii', 'base64'] }
      },
      required: ['path']
    };

    // Git operation schema
    this.gitSchema = {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['status', 'diff', 'commit', 'log', 'branch'] },
        params: { type: 'object' }
      },
      required: ['operation']
    };
  }

  /**
   * Validate command parameters
   * @param {Object} input - Command input
   * @returns {Object} Validated input
   * @throws {Error} If validation fails
   */
  validateCommand(input) {
    try {
      const validated = this.validator.validateObject(this.commandSchema, input);

      // Additional sanitization
      validated.command = this.sanitizeString(validated.command);

      if (validated.args) {
        validated.args = validated.args.map(arg => this.sanitizeString(arg));
      }

      if (validated.cwd) {
        validated.cwd = this.sanitizePath(validated.cwd);
      }

      logger.debug('Input validated: command', { validated });
      return validated;

    } catch (error) {
      logger.error('Input validation failed: command', {
        error: error.message,
        input
      });
      throw new Error(`Invalid command input: ${error.message}`);
    }
  }

  /**
   * Validate file operation parameters
   * @param {Object} input - File operation input
   * @returns {Object} Validated input
   */
  validateFileOperation(input) {
    try {
      const validated = this.validator.validateObject(this.fileSchema, input);

      // Sanitize path
      validated.path = this.sanitizePath(validated.path);

      // Check for null bytes (path traversal technique)
      if (validated.path.includes('\0')) {
        throw new Error('Null byte in path');
      }

      logger.debug('Input validated: file operation', { validated });
      return validated;

    } catch (error) {
      logger.error('Input validation failed: file operation', {
        error: error.message,
        input
      });
      throw new Error(`Invalid file operation: ${error.message}`);
    }
  }

  /**
   * Validate Git operation parameters
   * @param {Object} input - Git operation input
   * @returns {Object} Validated input
   */
  validateGitOperation(input) {
    try {
      const validated = this.validator.validateObject(this.gitSchema, input);
      logger.debug('Input validated: git operation', { validated });
      return validated;

    } catch (error) {
      logger.error('Input validation failed: git operation', {
        error: error.message,
        input
      });
      throw new Error(`Invalid git operation: ${error.message}`);
    }
  }

  /**
   * Sanitize string input (remove dangerous characters)
   * @param {string} input - Input string
   * @returns {string} Sanitized string
   */
  sanitizeString(input) {
    if (typeof input !== 'string') {
      return '';
    }

    // Remove control characters except newline and tab
    let sanitized = input.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

    return sanitized;
  }

  /**
   * Sanitize file path
   * @param {string} filePath - File path
   * @returns {string} Sanitized path
   */
  sanitizePath(filePath) {
    if (typeof filePath !== 'string') {
      throw new Error('Path must be a string');
    }

    // Remove null bytes
    let sanitized = filePath.replace(/\0/g, '');

    // Remove leading/trailing whitespace
    sanitized = sanitized.trim();

    return sanitized;
  }
}

export const inputValidator = new InputValidator();
