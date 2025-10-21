#!/usr/bin/env node

/**
 * Standalone Tools CLI
 * Main entry point for all standalone utility tools
 */

import { TextTools } from './text-tools.js';
import { DataTools } from './data-tools.js';
import { FileTools } from './file-tools.js';
import { MathTools } from './math-tools.js';
import { DateTimeTools, UtilityTools } from './datetime-tools.js';

const TOOLS = {
  // Text Processing
  'regex-match': (args) => TextTools.regexMatch(...args),
  'regex-replace': (args) => TextTools.regexReplace(...args),
  'hash': (args) => TextTools.hashText(...args),
  'encode': (args) => TextTools.encodeDecode(args[0], 'encode', args[1]),
  'decode': (args) => TextTools.encodeDecode(args[0], 'decode', args[1]),
  'analyze-text': (args) => TextTools.analyzeText(args[0], args.slice(1)),
  'diff-text': (args) => TextTools.diffText(...args),

  // Data Manipulation
  'json-query': (args) => DataTools.jsonQuery(...args),
  'json-transform': (args) => DataTools.jsonTransform(...args),
  'csv-to-json': (args) => DataTools.csvToJson(args[0], args[1] !== 'false'),
  'json-to-csv': (args) => DataTools.jsonToCsv(args[0], args[1] !== 'false'),
  'json-sort': (args) => DataTools.sortJson(...args),
  'json-filter': (args) => DataTools.filterJson(...args),

  // File System (async)
  'file-search': async (args) => await FileTools.searchFiles(args[0], args[1], {
    maxDepth: args[2] ? parseInt(args[2]) : 3
  }),
  'file-stats': async (args) => await FileTools.getStats(args[0]),
  'file-rename': async (args) => await FileTools.batchRename(args[0], args[1], args[2], {
    dryRun: args[3] !== 'false'
  }),
  'file-list': async (args) => await FileTools.listDirectory(args[0], { sortBy: args[1] }),
  'file-duplicates': async (args) => await FileTools.findDuplicates(args[0], {
    maxDepth: args[1] ? parseInt(args[1]) : 3
  }),

  // Math & Statistics
  'calculate': (args) => MathTools.calculate(args[0], {
    precision: args[1] ? parseInt(args[1]) : 2
  }),
  'statistics': (args) => {
    const data = args[0].split(',').map(n => parseFloat(n.trim()));
    return MathTools.statistics(data, args.slice(1).length ? args.slice(1) : ['all']);
  },
  'convert-base': (args) => MathTools.convertBase(args[0], parseInt(args[1]), parseInt(args[2])),
  'random-numbers': (args) => MathTools.randomNumbers({
    count: args[0] ? parseInt(args[0]) : 1,
    min: args[1] ? parseFloat(args[1]) : 0,
    max: args[2] ? parseFloat(args[2]) : 100,
    decimals: args[3] ? parseInt(args[3]) : 0
  }),
  'percentage': (args) => MathTools.percentage(parseFloat(args[0]), parseFloat(args[1]), {
    precision: args[2] ? parseInt(args[2]) : 2
  }),

  // Date & Time
  'date-calc': (args) => DateTimeTools.dateCalc(...args),
  'timezone-convert': (args) => DateTimeTools.timezoneConvert(...args),
  'current-time': (args) => DateTimeTools.getCurrentTime(args[0]),
  'parse-date': (args) => DateTimeTools.parseDate(args[0]),

  // Utilities
  'uuid': (args) => UtilityTools.generateUUID({
    version: args[0] || 'v4',
    count: args[1] ? parseInt(args[1]) : 1
  }),
  'random-string': (args) => UtilityTools.randomString(
    args[0] ? parseInt(args[0]) : 16,
    args[1]
  )
};

function showHelp() {
  console.log(`
Standalone Tools CLI
====================

Usage: node tools.js <command> [arguments...]

TEXT PROCESSING
  regex-match <text> <pattern> [flags]
  regex-replace <text> <pattern> <replacement> [flags]
  hash <text> [algorithm]              - Algorithms: md5, sha1, sha256, sha512
  encode <text> [format]               - Formats: base64, hex, url, html
  decode <text> [format]
  analyze-text <text> [metrics...]     - Metrics: chars, words, lines, sentences, readingTime
  diff-text <text1> <text2> [format]   - Formats: unified, json

DATA MANIPULATION
  json-query <json> <query>            - Query: "users[0].name"
  json-transform <json> <operation>    - Operations: pretty, minify, keys, values, flatten
  csv-to-json <csv> [hasHeader]
  json-to-csv <json> [includeHeader]
  json-sort <json> <key> [order]       - Order: asc, desc
  json-filter <json> <filterFunction>

FILE SYSTEM
  file-search <directory> <pattern> [maxDepth]
  file-stats <path>
  file-rename <directory> <pattern> <replacement> [dryRun]
  file-list <directory> [sortBy]       - SortBy: name, size, modified
  file-duplicates <directory> [maxDepth]

MATH & STATISTICS
  calculate <expression> [precision]
  statistics <comma-separated-numbers> [measures...]
  convert-base <number> <fromBase> <toBase>
  random-numbers [count] [min] [max] [decimals]
  percentage <value> <total> [precision]

DATE & TIME
  date-calc <operation> <date> <value> [unit]
  timezone-convert <time> <fromZone> <toZone>
  current-time [format]                - Formats: iso, unix, timestamp, utc, local
  parse-date <date>

UTILITIES
  uuid [version] [count]               - Versions: v1, v4
  random-string [length] [charset]     - Charsets: numeric, alpha, alphanumeric, hex

EXAMPLES
  node tools.js hash "password123" sha256
  node tools.js calculate "(100 + 50) * 2" 2
  node tools.js json-query '{"name":"Alice"}' name
  node tools.js uuid v4 5
  node tools.js file-search ./src "\\.js$" 3
  node tools.js statistics "10,20,30,40,50" mean median
  node tools.js encode "Hello World" base64
  node tools.js date-calc add "2024-01-01" 7 days
`);
}

async function main() {
  const [,, command, ...args] = process.argv;

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    showHelp();
    process.exit(0);
  }

  const tool = TOOLS[command];

  if (!tool) {
    console.error(`Unknown command: ${command}`);
    console.error('Run "node tools.js help" for usage information');
    process.exit(1);
  }

  try {
    const result = await tool(args);
    console.log(JSON.stringify(result, null, 2));

    if (result.success === false) {
      process.exit(1);
    }
  } catch (error) {
    console.error(JSON.stringify({
      success: false,
      error: error.message
    }, null, 2));
    process.exit(1);
  }
}

main();
