#!/usr/bin/env node

/**
 * Math and Statistics Tools
 * Standalone utilities for calculations and statistical analysis
 */

export class MathTools {
  /**
   * Safely evaluate mathematical expressions
   */
  static calculate(expression, options = {}) {
    try {
      const { precision = 2 } = options;

      // Sanitize expression - only allow numbers, operators, parentheses, and math functions
      const sanitized = expression.replace(/[^0-9+\-*/.()%\s]/g, '');

      if (sanitized !== expression) {
        throw new Error('Expression contains invalid characters');
      }

      // Use Function constructor for safe evaluation (better than eval)
      const result = new Function(`return ${sanitized}`)();

      if (typeof result !== 'number' || !isFinite(result)) {
        throw new Error('Expression did not evaluate to a valid number');
      }

      const rounded = Number(result.toFixed(precision));

      return {
        success: true,
        expression,
        result: rounded,
        rawResult: result,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Calculate statistical measures
   */
  static statistics(data, measures = ['all']) {
    try {
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('Data must be a non-empty array');
      }

      const numbers = data.map((n) => {
        const num = typeof n === 'string' ? parseFloat(n) : n;
        if (isNaN(num)) throw new Error(`Invalid number: ${n}`);
        return num;
      });

      const results = {};

      if (measures.includes('all') || measures.includes('mean')) {
        results.mean = this._mean(numbers);
      }

      if (measures.includes('all') || measures.includes('median')) {
        results.median = this._median(numbers);
      }

      if (measures.includes('all') || measures.includes('mode')) {
        results.mode = this._mode(numbers);
      }

      if (measures.includes('all') || measures.includes('min')) {
        results.min = Math.min(...numbers);
      }

      if (measures.includes('all') || measures.includes('max')) {
        results.max = Math.max(...numbers);
      }

      if (measures.includes('all') || measures.includes('range')) {
        results.range = Math.max(...numbers) - Math.min(...numbers);
      }

      if (measures.includes('all') || measures.includes('sum')) {
        results.sum = numbers.reduce((a, b) => a + b, 0);
      }

      if (measures.includes('all') || measures.includes('variance')) {
        results.variance = this._variance(numbers);
      }

      if (measures.includes('all') || measures.includes('stddev')) {
        results.standardDeviation = Math.sqrt(this._variance(numbers));
      }

      if (measures.includes('all') || measures.includes('quartiles')) {
        results.quartiles = this._quartiles(numbers);
      }

      results.count = numbers.length;

      return {
        success: true,
        measures: results,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Convert between number bases
   */
  static convertBase(number, fromBase, toBase) {
    try {
      const bases = [2, 8, 10, 16];

      if (!bases.includes(fromBase) || !bases.includes(toBase)) {
        throw new Error('Base must be 2, 8, 10, or 16');
      }

      // Convert to decimal first
      const decimal = parseInt(number.toString(), fromBase);

      if (isNaN(decimal)) {
        throw new Error('Invalid number for given base');
      }

      // Convert to target base
      const result = decimal.toString(toBase);

      return {
        success: true,
        original: number,
        fromBase,
        toBase,
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
   * Generate random numbers
   */
  static randomNumbers(options = {}) {
    const { count = 1, min = 0, max = 100, decimals = 0, unique = false } = options;

    try {
      const results = [];
      const seen = new Set();

      while (results.length < count) {
        let num = Math.random() * (max - min) + min;

        if (decimals === 0) {
          num = Math.floor(num);
        } else {
          num = Number(num.toFixed(decimals));
        }

        if (unique) {
          if (!seen.has(num)) {
            seen.add(num);
            results.push(num);
          }
        } else {
          results.push(num);
        }

        // Prevent infinite loop
        if (unique && seen.size >= max - min + 1) break;
      }

      return {
        success: true,
        count: results.length,
        min,
        max,
        results,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Calculate percentage
   */
  static percentage(value, total, options = {}) {
    try {
      const { precision = 2 } = options;

      const percent = (value / total) * 100;
      const rounded = Number(percent.toFixed(precision));

      return {
        success: true,
        value,
        total,
        percentage: rounded,
        formatted: `${rounded}%`,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Helper methods
  static _mean(numbers) {
    return numbers.reduce((a, b) => a + b, 0) / numbers.length;
  }

  static _median(numbers) {
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  static _mode(numbers) {
    const frequency = {};
    let maxFreq = 0;
    let modes = [];

    numbers.forEach((n) => {
      frequency[n] = (frequency[n] || 0) + 1;
      if (frequency[n] > maxFreq) {
        maxFreq = frequency[n];
        modes = [n];
      } else if (frequency[n] === maxFreq) {
        modes.push(n);
      }
    });

    return modes.length === numbers.length ? null : modes;
  }

  static _variance(numbers) {
    const mean = this._mean(numbers);
    return numbers.reduce((sum, n) => sum + Math.pow(n - mean, 2), 0) / numbers.length;
  }

  static _quartiles(numbers) {
    const sorted = [...numbers].sort((a, b) => a - b);
    const q1 = this._median(sorted.slice(0, Math.floor(sorted.length / 2)));
    const q2 = this._median(sorted);
    const q3 = this._median(sorted.slice(Math.ceil(sorted.length / 2)));

    return { q1, q2, q3 };
  }
}

// CLI Interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , command, ...args] = process.argv;

  const commands = {
    calc: () => {
      const [expression, precision] = args;
      console.log(
        JSON.stringify(
          MathTools.calculate(expression, {
            precision: precision ? parseInt(precision) : 2,
          }),
          null,
          2
        )
      );
    },
    stats: () => {
      const data = args[0].split(',').map((n) => parseFloat(n.trim()));
      const measures = args.slice(1);
      console.log(
        JSON.stringify(MathTools.statistics(data, measures.length ? measures : ['all']), null, 2)
      );
    },
    convert: () => {
      const [number, fromBase, toBase] = args;
      console.log(
        JSON.stringify(MathTools.convertBase(number, parseInt(fromBase), parseInt(toBase)), null, 2)
      );
    },
    random: () => {
      const [count, min, max, decimals] = args;
      console.log(
        JSON.stringify(
          MathTools.randomNumbers({
            count: count ? parseInt(count) : 1,
            min: min ? parseFloat(min) : 0,
            max: max ? parseFloat(max) : 100,
            decimals: decimals ? parseInt(decimals) : 0,
          }),
          null,
          2
        )
      );
    },
    percent: () => {
      const [value, total, precision] = args;
      console.log(
        JSON.stringify(
          MathTools.percentage(parseFloat(value), parseFloat(total), {
            precision: precision ? parseInt(precision) : 2,
          }),
          null,
          2
        )
      );
    },
  };

  if (commands[command]) {
    commands[command]();
  } else {
    console.log('Math Tools - Available commands:');
    console.log('  calc <expression> [precision]');
    console.log('  stats <comma-separated-numbers> [measures...]');
    console.log('  convert <number> <fromBase> <toBase>');
    console.log('  random [count] [min] [max] [decimals]');
    console.log('  percent <value> <total> [precision]');
  }
}
