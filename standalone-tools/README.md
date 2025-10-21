# Standalone Tools

A comprehensive collection of standalone utility tools for Node.js - **no MCP dependencies required**. Just pure JavaScript utilities that you can run directly.

## Features

### 🔤 Text Processing
- Regex matching and replacement
- Cryptographic hashing (MD5, SHA1, SHA256, SHA512)
- Encoding/decoding (Base64, Hex, URL, HTML)
- Text analysis (word count, reading time, etc.)
- Text diffing

### 📊 Data Manipulation
- JSON querying and transformation
- CSV ↔ JSON conversion
- JSON sorting and filtering
- Data flattening and restructuring

### 📁 File System Operations
- File search with regex patterns
- File statistics and analysis
- Batch file renaming
- Directory listing with sorting
- Duplicate file detection

### 🔢 Math & Statistics
- Safe mathematical expression evaluation
- Statistical analysis (mean, median, mode, stddev, etc.)
- Number base conversion
- Random number generation
- Percentage calculations

### ⏰ Date & Time
- Date calculations (add, subtract, diff)
- Timezone conversion
- Date parsing and formatting
- Current time in multiple formats

### 🛠️ Utilities
- UUID generation (v1, v4)
- Random string generation
- Sleep/delay utility

## Installation

```bash
cd standalone-tools
npm install  # No external dependencies!
```

## Usage

### Command Line Interface

```bash
node tools.js <command> [arguments...]
```

### Examples

#### Text Processing
```bash
# Hash a password
node tools.js hash "password123" sha256

# Base64 encode
node tools.js encode "Hello World" base64

# Regex match email addresses
node tools.js regex-match "Email: user@example.com" "\\b[\\w.-]+@[\\w.-]+\\.\\w+\\b"

# Analyze text
node tools.js analyze-text "Your text here" words chars readingTime
```

#### Data Manipulation
```bash
# Query JSON
node tools.js json-query '{"users":[{"name":"Alice"}]}' "users[0].name"

# Convert CSV to JSON
node tools.js csv-to-json "name,age\nAlice,30\nBob,25" true

# Pretty print JSON
node tools.js json-transform '{"name":"Alice","age":30}' pretty

# Sort JSON array
node tools.js json-sort '[{"name":"Bob","age":25},{"name":"Alice","age":30}]' age asc
```

#### File Operations
```bash
# Search for JavaScript files
node tools.js file-search ./src "\\.js$" 3

# Get file statistics
node tools.js file-stats ./package.json

# Batch rename files (dry run)
node tools.js file-rename ./photos "IMG_" "Photo_" true

# List directory contents sorted by size
node tools.js file-list ./documents size

# Find duplicate files
node tools.js file-duplicates ./downloads 3
```

#### Math & Statistics
```bash
# Calculate expression
node tools.js calculate "(100 + 50) * 2 / 3" 2

# Statistical analysis
node tools.js statistics "10,20,30,40,50" mean median stddev

# Convert number bases
node tools.js convert-base "FF" 16 10

# Generate random numbers
node tools.js random-numbers 5 1 100 0

# Calculate percentage
node tools.js percentage 75 100 2
```

#### Date & Time
```bash
# Add days to date
node tools.js date-calc add "2024-01-01T00:00:00Z" 7 days

# Convert timezone
node tools.js timezone-convert "2024-01-01T14:00:00" "America/New_York" "Europe/London"

# Get current time
node tools.js current-time iso

# Parse date
node tools.js parse-date "2024-01-01"
```

#### Utilities
```bash
# Generate UUIDs
node tools.js uuid v4 5

# Generate random string
node tools.js random-string 32 alphanumeric
```

## Programmatic Usage

You can also import and use the tools in your Node.js code:

```javascript
import { TextTools } from './text-tools.js';
import { DataTools } from './data-tools.js';
import { FileTools } from './file-tools.js';
import { MathTools } from './math-tools.js';
import { DateTimeTools, UtilityTools } from './datetime-tools.js';

// Text processing
const hashResult = TextTools.hashText('password123', 'sha256');
console.log(hashResult.hash);

// Data manipulation
const jsonResult = DataTools.jsonQuery('{"name":"Alice"}', 'name');
console.log(jsonResult.result);

// File operations
const searchResult = await FileTools.searchFiles('./src', '\\.js$');
console.log(searchResult.results);

// Math
const calcResult = MathTools.calculate('(100 + 50) * 2', { precision: 2 });
console.log(calcResult.result);

// Date/time
const dateResult = DateTimeTools.dateCalc('add', '2024-01-01', '7', 'days');
console.log(dateResult.result);

// Utilities
const uuidResult = UtilityTools.generateUUID({ version: 'v4', count: 1 });
console.log(uuidResult.results);
```

## Tool Categories

### TextTools
- `regexMatch(text, pattern, flags)`
- `regexReplace(text, pattern, replacement, flags)`
- `hashText(text, algorithm)`
- `encodeDecode(text, operation, format)`
- `analyzeText(text, metrics)`
- `diffText(text1, text2, format)`

### DataTools
- `jsonQuery(json, query)`
- `jsonTransform(json, operation)`
- `csvToJson(csv, hasHeader)`
- `jsonToCsv(json, includeHeader)`
- `sortJson(json, key, order)`
- `filterJson(json, filterFn)`

### FileTools
- `searchFiles(directory, pattern, options)`
- `getStats(path, options)`
- `batchRename(directory, pattern, replacement, options)`
- `listDirectory(directory, options)`
- `findDuplicates(directory, options)`

### MathTools
- `calculate(expression, options)`
- `statistics(data, measures)`
- `convertBase(number, fromBase, toBase)`
- `randomNumbers(options)`
- `percentage(value, total, options)`

### DateTimeTools
- `dateCalc(operation, date, value, unit)`
- `timezoneConvert(time, fromZone, toZone)`
- `getCurrentTime(format)`
- `parseDate(dateString)`

### UtilityTools
- `generateUUID(options)`
- `randomString(length, charset)`
- `sleep(milliseconds)`

## Response Format

All tools return a consistent JSON response format:

```javascript
{
  "success": true,  // or false
  "result": ...,    // the actual result
  "error": "..."    // only present if success is false
}
```

## Requirements

- Node.js >= 18.0.0
- No external dependencies!

## License

ISC

## Author

Parker Dunn (scarmonit@gmail.com)
