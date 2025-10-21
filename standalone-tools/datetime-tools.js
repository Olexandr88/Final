#!/usr/bin/env node

/**
 * Date/Time and Utility Tools
 * Standalone utilities for date calculations, timezone conversion, and UUID generation
 */

export class DateTimeTools {
  /**
   * Perform date calculations
   */
  static dateCalc(operation, dateString, value, unit = 'days') {
    try {
      const date = dateString ? new Date(dateString) : new Date();

      if (isNaN(date.getTime())) {
        throw new Error('Invalid date string');
      }

      const val = parseInt(value);
      let result = new Date(date);

      switch (operation) {
        case 'add':
          result = this._addToDate(date, val, unit);
          break;

        case 'subtract':
          result = this._addToDate(date, -val, unit);
          break;

        case 'diff':
          const endDate = new Date(value);
          if (isNaN(endDate.getTime())) {
            throw new Error('Invalid end date string');
          }
          return this._dateDiff(date, endDate, unit);

        case 'format':
          return {
            success: true,
            operation,
            original: date.toISOString(),
            result: this._formatDate(date, value || 'YYYY-MM-DD')
          };

        default:
          throw new Error('Invalid operation. Use: add, subtract, diff, format');
      }

      return {
        success: true,
        operation,
        original: date.toISOString(),
        result: result.toISOString(),
        formatted: this._formatDate(result, 'YYYY-MM-DD HH:mm:ss')
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Convert time between timezones
   */
  static timezoneConvert(timeString, fromZone, toZone) {
    try {
      const date = new Date(timeString);

      if (isNaN(date.getTime())) {
        throw new Error('Invalid time string');
      }

      // Create formatters for different timezones
      const fromFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: fromZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });

      const toFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: toZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });

      return {
        success: true,
        original: {
          time: fromFormatter.format(date),
          timezone: fromZone
        },
        converted: {
          time: toFormatter.format(date),
          timezone: toZone
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get current time in various formats
   */
  static getCurrentTime(format = 'iso') {
    const now = new Date();

    const formats = {
      iso: now.toISOString(),
      unix: Math.floor(now.getTime() / 1000),
      timestamp: now.getTime(),
      utc: now.toUTCString(),
      local: now.toLocaleString(),
      date: now.toDateString(),
      time: now.toTimeString()
    };

    return {
      success: true,
      format,
      result: formats[format] || formats.iso,
      all: formats
    };
  }

  /**
   * Parse and validate date
   */
  static parseDate(dateString) {
    try {
      const date = new Date(dateString);

      if (isNaN(date.getTime())) {
        throw new Error('Invalid date string');
      }

      return {
        success: true,
        input: dateString,
        parsed: {
          iso: date.toISOString(),
          unix: Math.floor(date.getTime() / 1000),
          year: date.getFullYear(),
          month: date.getMonth() + 1,
          day: date.getDate(),
          hour: date.getHours(),
          minute: date.getMinutes(),
          second: date.getSeconds(),
          dayOfWeek: date.toLocaleDateString('en-US', { weekday: 'long' })
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Helper methods
  static _addToDate(date, value, unit) {
    const result = new Date(date);

    switch (unit) {
      case 'years':
        result.setFullYear(result.getFullYear() + value);
        break;
      case 'months':
        result.setMonth(result.getMonth() + value);
        break;
      case 'days':
        result.setDate(result.getDate() + value);
        break;
      case 'hours':
        result.setHours(result.getHours() + value);
        break;
      case 'minutes':
        result.setMinutes(result.getMinutes() + value);
        break;
      case 'seconds':
        result.setSeconds(result.getSeconds() + value);
        break;
      default:
        throw new Error('Invalid unit. Use: years, months, days, hours, minutes, seconds');
    }

    return result;
  }

  static _dateDiff(date1, date2, unit) {
    const diff = date2.getTime() - date1.getTime();

    const units = {
      milliseconds: diff,
      seconds: diff / 1000,
      minutes: diff / (1000 * 60),
      hours: diff / (1000 * 60 * 60),
      days: diff / (1000 * 60 * 60 * 24),
      weeks: diff / (1000 * 60 * 60 * 24 * 7)
    };

    return {
      success: true,
      operation: 'diff',
      start: date1.toISOString(),
      end: date2.toISOString(),
      difference: units[unit] || units.days,
      unit: unit || 'days',
      all: units
    };
  }

  static _formatDate(date, format) {
    const pad = (n) => String(n).padStart(2, '0');

    const replacements = {
      'YYYY': date.getFullYear(),
      'MM': pad(date.getMonth() + 1),
      'DD': pad(date.getDate()),
      'HH': pad(date.getHours()),
      'mm': pad(date.getMinutes()),
      'ss': pad(date.getSeconds())
    };

    let result = format;
    for (const [key, value] of Object.entries(replacements)) {
      result = result.replace(key, value);
    }

    return result;
  }
}

export class UtilityTools {
  /**
   * Generate UUIDs
   */
  static generateUUID(options = {}) {
    const { version = 'v4', count = 1 } = options;

    try {
      const results = [];

      for (let i = 0; i < count; i++) {
        if (version === 'v4') {
          results.push(this._uuidV4());
        } else if (version === 'v1') {
          results.push(this._uuidV1());
        } else {
          throw new Error('Invalid version. Use: v1, v4');
        }
      }

      return {
        success: true,
        version,
        count,
        results: count === 1 ? results[0] : results
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate random strings
   */
  static randomString(length = 16, charset = 'alphanumeric') {
    try {
      const charsets = {
        numeric: '0123456789',
        alpha: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
        alphanumeric: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
        hex: '0123456789abcdef',
        custom: charset
      };

      const chars = charsets[charset] || charsets.alphanumeric;
      let result = '';

      for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      return {
        success: true,
        length,
        charset,
        result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Sleep/delay utility
   */
  static async sleep(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
  }

  // Helper methods
  static _uuidV4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  static _uuidV1() {
    const timestamp = new Date().getTime();
    const random = Math.random() * 0x3fff;

    return 'xxxxxxxx-xxxx-1xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c, i) => {
      let r;
      if (i < 8) {
        r = (timestamp + Math.random() * 16) % 16 | 0;
      } else {
        r = Math.random() * 16 | 0;
      }
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

// CLI Interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const [,, command, ...args] = process.argv;

  const commands = {
    'date-calc': () => {
      const [operation, date, value, unit] = args;
      console.log(JSON.stringify(DateTimeTools.dateCalc(operation, date, value, unit), null, 2));
    },
    'timezone': () => {
      const [time, fromZone, toZone] = args;
      console.log(JSON.stringify(DateTimeTools.timezoneConvert(time, fromZone, toZone), null, 2));
    },
    'now': () => {
      const [format] = args;
      console.log(JSON.stringify(DateTimeTools.getCurrentTime(format), null, 2));
    },
    'parse-date': () => {
      const [date] = args;
      console.log(JSON.stringify(DateTimeTools.parseDate(date), null, 2));
    },
    'uuid': () => {
      const [version, count] = args;
      console.log(JSON.stringify(UtilityTools.generateUUID({
        version,
        count: count ? parseInt(count) : 1
      }), null, 2));
    },
    'random-string': () => {
      const [length, charset] = args;
      console.log(JSON.stringify(UtilityTools.randomString(
        length ? parseInt(length) : 16,
        charset
      ), null, 2));
    }
  };

  if (commands[command]) {
    commands[command]();
  } else {
    console.log('DateTime & Utility Tools - Available commands:');
    console.log('  date-calc <operation> <date> <value> [unit]');
    console.log('  timezone <time> <fromZone> <toZone>');
    console.log('  now [format]');
    console.log('  parse-date <date>');
    console.log('  uuid [version] [count]');
    console.log('  random-string [length] [charset]');
  }
}
