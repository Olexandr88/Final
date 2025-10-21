#!/usr/bin/env node
import crypto from 'crypto';

/**
 * Text Processing Tools
 * Standalone utilities for regex, hashing, encoding/decoding, and text analysis
 */

export class TextTools {
  /**
   * Match text against regex pattern
   */
  static regexMatch(text, pattern, flags = '') {
    try {
      const regex = new RegExp(pattern, flags);
      const matches = [];

      if (flags.includes('g')) {
        let match;
        while ((match = regex.exec(text)) !== null) {
          matches.push({
            match: match[0],
            index: match.index,
            groups: match.slice(1),
          });
        }
      } else {
        const match = text.match(regex);
        if (match) {
          matches.push({
            match: match[0],
            index: match.index,
            groups: match.slice(1),
          });
        }
      }

      return {
        success: true,
        matches,
        count: matches.length,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Replace text using regex pattern
   */
  static regexReplace(text, pattern, replacement, flags = '') {
    try {
      const regex = new RegExp(pattern, flags);
      const result = text.replace(regex, replacement);

      return {
        success: true,
        original: text,
        result,
        changed: text !== result,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Hash text using various algorithms
   */
  static hashText(text, algorithm = 'sha256') {
    try {
      const validAlgorithms = ['md5', 'sha1', 'sha256', 'sha512'];

      if (!validAlgorithms.includes(algorithm)) {
        throw new Error(`Invalid algorithm. Use: ${validAlgorithms.join(', ')}`);
      }

      const hash = crypto.createHash(algorithm).update(text).digest('hex');

      return {
        success: true,
        algorithm,
        hash,
        length: hash.length,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Encode/decode text in various formats
   */
  static encodeDecode(text, operation = 'encode', format = 'base64') {
    try {
      let result;

      switch (format) {
        case 'base64':
          result =
            operation === 'encode'
              ? Buffer.from(text).toString('base64')
              : Buffer.from(text, 'base64').toString('utf-8');
          break;

        case 'hex':
          result =
            operation === 'encode'
              ? Buffer.from(text).toString('hex')
              : Buffer.from(text, 'hex').toString('utf-8');
          break;

        case 'url':
          result = operation === 'encode' ? encodeURIComponent(text) : decodeURIComponent(text);
          break;

        case 'html':
          if (operation === 'encode') {
            result = text
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
          } else {
            result = text
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'");
          }
          break;

        default:
          throw new Error('Invalid format. Use: base64, hex, url, html');
      }

      return {
        success: true,
        operation,
        format,
        original: text,
        result,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Analyze text metrics
   */
  static analyzeText(text, metrics = ['all']) {
    const results = {};

    if (metrics.includes('all') || metrics.includes('chars')) {
      results.characters = text.length;
      results.charactersNoSpaces = text.replace(/\s/g, '').length;
    }

    if (metrics.includes('all') || metrics.includes('words')) {
      results.words = text
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 0).length;
    }

    if (metrics.includes('all') || metrics.includes('lines')) {
      results.lines = text.split('\n').length;
    }

    if (metrics.includes('all') || metrics.includes('sentences')) {
      results.sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
    }

    if (metrics.includes('all') || metrics.includes('paragraphs')) {
      results.paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length;
    }

    if (metrics.includes('all') || metrics.includes('readingTime')) {
      const wordsPerMinute = 200;
      results.readingTimeMinutes = Math.ceil(
        (results.words || text.trim().split(/\s+/).length) / wordsPerMinute
      );
    }

    return {
      success: true,
      metrics: results,
    };
  }

  /**
   * Compare two texts and show differences
   */
  static diffText(text1, text2, format = 'unified') {
    const lines1 = text1.split('\n');
    const lines2 = text2.split('\n');
    const diff = [];

    const maxLen = Math.max(lines1.length, lines2.length);

    for (let i = 0; i < maxLen; i++) {
      const line1 = lines1[i] || '';
      const line2 = lines2[i] || '';

      if (line1 !== line2) {
        if (format === 'unified') {
          if (line1) diff.push(`- ${line1}`);
          if (line2) diff.push(`+ ${line2}`);
        } else {
          diff.push({
            line: i + 1,
            old: line1,
            new: line2,
          });
        }
      }
    }

    return {
      success: true,
      format,
      differences: diff,
      identical: diff.length === 0,
    };
  }
}

// CLI Interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , command, ...args] = process.argv;

  const commands = {
    'regex-match': () => {
      const [text, pattern, flags] = args;
      console.log(JSON.stringify(TextTools.regexMatch(text, pattern, flags), null, 2));
    },
    'regex-replace': () => {
      const [text, pattern, replacement, flags] = args;
      console.log(
        JSON.stringify(TextTools.regexReplace(text, pattern, replacement, flags), null, 2)
      );
    },
    hash: () => {
      const [text, algorithm] = args;
      console.log(JSON.stringify(TextTools.hashText(text, algorithm), null, 2));
    },
    encode: () => {
      const [text, format] = args;
      console.log(JSON.stringify(TextTools.encodeDecode(text, 'encode', format), null, 2));
    },
    decode: () => {
      const [text, format] = args;
      console.log(JSON.stringify(TextTools.encodeDecode(text, 'decode', format), null, 2));
    },
    analyze: () => {
      const [text, ...metrics] = args;
      console.log(
        JSON.stringify(TextTools.analyzeText(text, metrics.length ? metrics : ['all']), null, 2)
      );
    },
    diff: () => {
      const [text1, text2, format] = args;
      console.log(JSON.stringify(TextTools.diffText(text1, text2, format), null, 2));
    },
  };

  if (commands[command]) {
    commands[command]();
  } else {
    console.log('Text Tools - Available commands:');
    console.log('  regex-match <text> <pattern> [flags]');
    console.log('  regex-replace <text> <pattern> <replacement> [flags]');
    console.log('  hash <text> [algorithm]');
    console.log('  encode <text> [format]');
    console.log('  decode <text> [format]');
    console.log('  analyze <text> [metrics...]');
    console.log('  diff <text1> <text2> [format]');
  }
}
