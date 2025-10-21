#!/usr/bin/env node

/**
 * Data Manipulation Tools
 * Standalone utilities for JSON, CSV, and data transformation
 */

export class DataTools {
  /**
   * Query JSON data using path syntax
   */
  static jsonQuery(jsonString, query) {
    try {
      const data = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;

      // Simple path query (e.g., "users[0].name")
      const result = query.split('.').reduce((obj, key) => {
        // Handle array indices
        const arrayMatch = key.match(/(\w+)\[(\d+)\]/);
        if (arrayMatch) {
          return obj[arrayMatch[1]][parseInt(arrayMatch[2])];
        }
        return obj?.[key];
      }, data);

      return {
        success: true,
        query,
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
   * Transform JSON data
   */
  static jsonTransform(jsonString, operation = 'pretty') {
    try {
      const data = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
      let result;

      switch (operation) {
        case 'pretty':
          result = JSON.stringify(data, null, 2);
          break;

        case 'minify':
          result = JSON.stringify(data);
          break;

        case 'keys':
          result = Object.keys(data);
          break;

        case 'values':
          result = Object.values(data);
          break;

        case 'flatten':
          result = this._flattenObject(data);
          break;

        case 'entries':
          result = Object.entries(data);
          break;

        default:
          throw new Error('Invalid operation. Use: pretty, minify, keys, values, flatten, entries');
      }

      return {
        success: true,
        operation,
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
   * Convert CSV to JSON
   */
  static csvToJson(csvString, hasHeader = true) {
    try {
      const lines = csvString.trim().split('\n');
      const headers = hasHeader
        ? lines
            .shift()
            .split(',')
            .map((h) => h.trim())
        : null;

      const result = lines.map((line, index) => {
        const values = line.split(',').map((v) => v.trim());

        if (hasHeader) {
          return headers.reduce((obj, header, i) => {
            obj[header] = values[i];
            return obj;
          }, {});
        } else {
          return values;
        }
      });

      return {
        success: true,
        hasHeader,
        rowCount: result.length,
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
   * Convert JSON to CSV
   */
  static jsonToCsv(jsonString, includeHeader = true) {
    try {
      const data = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
      const array = Array.isArray(data) ? data : [data];

      if (array.length === 0) {
        return {
          success: true,
          result: '',
        };
      }

      const headers = Object.keys(array[0]);
      const rows = array.map((obj) =>
        headers
          .map((header) => {
            const value = obj[header];
            return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
          })
          .join(',')
      );

      const csv = includeHeader ? [headers.join(','), ...rows].join('\n') : rows.join('\n');

      return {
        success: true,
        rowCount: array.length,
        columnCount: headers.length,
        result: csv,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Sort JSON array by key
   */
  static sortJson(jsonString, key, order = 'asc') {
    try {
      const data = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;

      if (!Array.isArray(data)) {
        throw new Error('Data must be an array');
      }

      const sorted = [...data].sort((a, b) => {
        const aVal = a[key];
        const bVal = b[key];

        if (typeof aVal === 'string') {
          return order === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }

        return order === 'asc' ? aVal - bVal : bVal - aVal;
      });

      return {
        success: true,
        key,
        order,
        result: sorted,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Filter JSON array
   */
  static filterJson(jsonString, filterFn) {
    try {
      const data = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;

      if (!Array.isArray(data)) {
        throw new Error('Data must be an array');
      }

      // Parse filter function string if provided
      const filter =
        typeof filterFn === 'string' ? new Function('item', `return ${filterFn}`) : filterFn;

      const filtered = data.filter(filter);

      return {
        success: true,
        originalCount: data.length,
        filteredCount: filtered.length,
        result: filtered,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Helper method
  static _flattenObject(obj, prefix = '') {
    return Object.keys(obj).reduce((acc, key) => {
      const pre = prefix.length ? `${prefix}.` : '';

      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        Object.assign(acc, this._flattenObject(obj[key], pre + key));
      } else {
        acc[pre + key] = obj[key];
      }

      return acc;
    }, {});
  }
}

// CLI Interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , command, ...args] = process.argv;

  const commands = {
    query: () => {
      const [json, query] = args;
      console.log(JSON.stringify(DataTools.jsonQuery(json, query), null, 2));
    },
    transform: () => {
      const [json, operation] = args;
      console.log(JSON.stringify(DataTools.jsonTransform(json, operation), null, 2));
    },
    'csv-to-json': () => {
      const [csv, hasHeader] = args;
      console.log(JSON.stringify(DataTools.csvToJson(csv, hasHeader !== 'false'), null, 2));
    },
    'json-to-csv': () => {
      const [json, includeHeader] = args;
      console.log(JSON.stringify(DataTools.jsonToCsv(json, includeHeader !== 'false'), null, 2));
    },
    sort: () => {
      const [json, key, order] = args;
      console.log(JSON.stringify(DataTools.sortJson(json, key, order), null, 2));
    },
    filter: () => {
      const [json, filterFn] = args;
      console.log(JSON.stringify(DataTools.filterJson(json, filterFn), null, 2));
    },
  };

  if (commands[command]) {
    commands[command]();
  } else {
    console.log('Data Tools - Available commands:');
    console.log('  query <json> <query>');
    console.log('  transform <json> <operation>');
    console.log('  csv-to-json <csv> [hasHeader]');
    console.log('  json-to-csv <json> [includeHeader]');
    console.log('  sort <json> <key> [order]');
    console.log('  filter <json> <filterFunction>');
  }
}
