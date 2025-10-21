import fs from 'fs';

const filePath = 'C:\Users\scarm\src\security\command-sandbox.js';
const content = fs.readFileSync(filePath, 'utf8');

// New method to insert before validateCommand
const newMethod = `
  /**
   * Detect shell operators including encoded and obfuscated variants
   * @private
   */
  _detectShellOperators(command) {
    // Direct shell operators
    const SHELL_OPERATORS = [
      '&&', '||', ';', '|', '>', '<', '>>', '<<',
      '$(', '\`', '\${', '&', '\n', '\r\n'
    ];

    // Windows-specific operators
    const WINDOWS_OPERATORS = [
      '&', '%', '^'
    ];

    // Check direct operators
    for (const operator of SHELL_OPERATORS) {
      if (command.includes(operator)) {
        return {
          valid: false,
          reason: \`Shell operator not allowed: \${operator}\`,
          severity: 'HIGH'
        };
      }
    }

    // Check Windows operators on Windows
    if (process.platform === 'win32') {
      for (const operator of WINDOWS_OPERATORS) {
        if (command.includes(operator)) {
          return {
            valid: false,
            reason: \`Windows shell operator not allowed: \${operator}\`,
            severity: 'HIGH'
          };
        }
      }
    }

    // Check URL-encoded variants
    const ENCODED_OPERATORS = [
      '%26%26', // &&
      '%7C%7C', // ||
      '%3B',    // ;
      '%7C',    // |
      '%3E',    // >
      '%3C',    // <
      '%0A',    // \n
      '%0D',    // \r
      '%24%28', // $(
      '%60',    // \`
      '%24%7B'  // \${
    ];

    const upperCommand = command.toUpperCase();
    for (const encoded of ENCODED_OPERATORS) {
      if (upperCommand.includes(encoded)) {
        return {
          valid: false,
          reason: \`Encoded shell operator detected: \${encoded}\`,
          severity: 'CRITICAL'
        };
      }
    }

    // Check for HTML entity encoding
    const HTML_ENTITIES = [
      '&amp;', '&#38;', '&#x26;',
      '&lt;', '&#60;', '&#x3C;',
      '&gt;', '&#62;', '&#x3E;',
      '&semi;', '&#59;', '&#x3B;'
    ];

    for (const entity of HTML_ENTITIES) {
      if (command.includes(entity)) {
        return {
          valid: false,
          reason: \`HTML entity encoding detected: \${entity}\`,
          severity: 'CRITICAL'
        };
      }
    }

    // Check for Unicode homoglyphs (lookalike characters)
    const HOMOGLYPHS = {
      '\u037E': ';', // Greek question mark looks like semicolon
      '\u0589': ':', // Armenian full stop
      '\uFF1B': ';', // Fullwidth semicolon
      '\uFF5C': '|', // Fullwidth vertical bar
      '\u2223': '|'  // Divides operator
    };

    for (const [glyph, meaning] of Object.entries(HOMOGLYPHS)) {
      if (command.includes(glyph)) {
        return {
          valid: false,
          reason: \`Unicode homoglyph detected (\${meaning})\`,
          severity: 'CRITICAL'
        };
      }
    }

    return { valid: true };
  }
`;

// Find where to insert (before validateCommand method)
const lines = content.split('\n');
let insertLineNumber = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('Validate and sanitize command before execution')) {
    insertLineNumber = i - 1; // Insert just before the JSDoc comment
    break;
  }
}

if (insertLineNumber === -1) {
  console.error('Could not find validateCommand method');
  process.exit(1);
}

// Insert the new method
lines.splice(insertLineNumber, 0, ...newMethod.split('\n'));

// Now find and replace the old shell operator check
let inOldCheckBlock = false;
let blockStartLine = -1;
let blockEndLine = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('// Check for shell operators (command chaining)')) {
    blockStartLine = i;
    inOldCheckBlock = true;
  }
  if (inOldCheckBlock && lines[i].trim() === '}') {
    // Check if this is the closing brace of the for loop
    if (lines[i-1].includes('severity:') || lines[i-1].includes('};')) {
      blockEndLine = i + 1; // Include the closing brace
      break;
    }
  }
}

if (blockStartLine !== -1 && blockEndLine !== -1) {
  // Replace the old block with the new check
  const newCheckLines = [
    '    // Check for shell operators (ENHANCED with encoding detection)',
    '    const operatorCheck = this._detectShellOperators(command);',
    '    if (!operatorCheck.valid) {',
    '      return operatorCheck;',
    '    }',
    ''
  ];
  
  lines.splice(blockStartLine, blockEndLine - blockStartLine, ...newCheckLines);
}

const finalContent = lines.join('\n');
fs.writeFileSync(filePath, finalContent, 'utf8');
console.log('✅ Priority 1 fix applied: Enhanced shell operator detection');
console.log('   - Added comprehensive encoding detection (URL, HTML entities, Unicode)');
console.log('   - Added Windows-specific operator detection');
console.log('   - Added newline injection prevention');
