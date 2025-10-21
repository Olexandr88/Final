const fs = require('fs');
const path = require('path');

console.log('Applying critical security fixes...\n');

// Priority 1
console.log('Priority 1: Command Injection Bypass');
const sandboxPath = path.join(process.cwd(), 'src', 'security', 'command-sandbox.js');
let content1 = fs.readFileSync(sandboxPath, 'utf8');

const newMethod = `
  _detectShellOperators(command) {
    const SHELL_OPERATORS = ['&&', '||', ';', '|', '>', '<', '>>', '<<', '$(', String.fromCharCode(96), '${', '&', String.fromCharCode(10), String.fromCharCode(13,10)];
    const WINDOWS_OPERATORS = ['&', '%', '^'];
    for (const op of SHELL_OPERATORS) {
      if (command.includes(op)) return { valid: false, reason: 'Shell operator: ' + op, severity: 'HIGH' };
    }
    if (process.platform === 'win32') {
      for (const op of WINDOWS_OPERATORS) {
        if (command.includes(op)) return { valid: false, reason: 'Win operator: ' + op, severity: 'HIGH' };
      }
    }
    const ENCODED = ['%26%26', '%7C%7C', '%3B', '%7C', '%3E', '%3C', '%0A', '%0D', '%24%28', '%60', '%24%7B'];
    const upper = command.toUpperCase();
    for (const e of ENCODED) {
      if (upper.includes(e)) return { valid: false, reason: 'Encoded: ' + e, severity: 'CRITICAL' };
    }
    const HTML = ['&amp;', '&#38;', '&#x26;', '&lt;', '&#60;', '&#x3C;', '&gt;', '&#62;', '&#x3E;', '&semi;', '&#59;', '&#x3B;'];
    for (const h of HTML) {
      if (command.includes(h)) return { valid: false, reason: 'HTML entity: ' + h, severity: 'CRITICAL' };
    }
    return { valid: true };
  }
`;

const marker = '  /**\n   * Validate and sanitize command before execution';
let idx = content1.indexOf(marker);
content1 = content1.substring(0, idx) + newMethod + '\n' + content1.substring(idx);

const oldPattern = '    // Check for shell operators (command chaining)\n    const SHELL_OPERATORS';
idx = content1.indexOf(oldPattern);
const endIdx = content1.indexOf('    }', idx) + 5;
const before = content1.substring(0, idx);
const after = content1.substring(endIdx);
content1 = before + '    const operatorCheck = this._detectShellOperators(command);\n    if (!operatorCheck.valid) return operatorCheck;\n' + after;

fs.writeFileSync(sandboxPath, content1, 'utf8');
console.log('Done P1\n');

// Priority 2
console.log('Priority 2: Path Traversal');
let content2 = fs.readFileSync(sandboxPath, 'utf8');

const newValidatePath = `  validatePath(filePath) {
    if (!filePath || typeof filePath !== 'string') {
      return { valid: false, reason: 'Invalid path type', severity: 'HIGH' };
    }
    if (filePath.startsWith('\\\\') || filePath.startsWith('//')) {
      return { valid: false, reason: 'UNC paths blocked', severity: 'CRITICAL' };
    }
    if (filePath.includes(':') && !filePath.match(/^[A-Za-z]:\\/)) {
      return { valid: false, reason: 'NTFS ADS blocked', severity: 'CRITICAL' };
    }
    let normalized;
    try {
      normalized = path.normalize(filePath);
      normalized = path.resolve(normalized);
    } catch (error) {
      return { valid: false, reason: 'Normalize failed', severity: 'HIGH' };
    }
    if (normalized.includes('..') || filePath.includes('..')) {
      return { valid: false, reason: 'Path traversal', severity: 'CRITICAL' };
    }
    const isAllowed = this.config.allowedPaths.some(ap => {
      const resolved = path.resolve(ap);
      return normalized.startsWith(resolved);
    });
    if (!isAllowed) {
      return { valid: false, reason: 'Outside allowed paths', severity: 'HIGH', path: normalized };
    }
    const SENS = ['C:\\Windows\\System32', 'C:\\Windows\\SysWOW64', 'C:\\Program Files', process.env.APPDATA, process.env.LOCALAPPDATA].filter(Boolean);
    for (const s of SENS) {
      if (normalized.toLowerCase().startsWith(path.resolve(s).toLowerCase())) {
        return { valid: false, reason: 'Sensitive dir', severity: 'CRITICAL', path: normalized };
      }
    }
    return { valid: true, path: normalized };
  }`;

idx = content2.indexOf('  validatePath(filePath) {');
const endIdx2 = content2.indexOf('  }', content2.indexOf('return { valid: true, path: resolved };')) + 3;
content2 = content2.substring(0, idx) + newValidatePath + content2.substring(endIdx2);

fs.writeFileSync(sandboxPath, content2, 'utf8');
console.log('Done P2\n');

// Priority 3
console.log('Priority 3: Secrets Redaction');
const execPath = path.join(process.cwd(), 'src', 'tools', 'secure-tool-executor.js');
let content3 = fs.readFileSync(execPath, 'utf8');

const newRedact = `  _redactSecrets(result) {
    if (!result) return result;
    const redacted = JSON.parse(JSON.stringify(result));
    const redactDeep = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map(item => redactDeep(item));
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string') {
          obj[k] = credentialManager.redactSecrets(v);
        } else if (typeof v === 'object' && v !== null) {
          obj[k] = redactDeep(v);
        }
      }
      return obj;
    };
    if (redacted.stdout) redacted.stdout = credentialManager.redactSecrets(redacted.stdout);
    if (redacted.stderr) redacted.stderr = credentialManager.redactSecrets(redacted.stderr);
    if (redacted.content) redacted.content = credentialManager.redactSecrets(redacted.content);
    if (redacted.error) {
      if (typeof redacted.error === 'string') {
        redacted.error = credentialManager.redactSecrets(redacted.error);
      } else if (typeof redacted.error === 'object') {
        if (redacted.error.message) redacted.error.message = credentialManager.redactSecrets(redacted.error.message);
        if (redacted.error.stack) redacted.error.stack = credentialManager.redactSecrets(redacted.error.stack);
      }
    }
    return redactDeep(redacted);
  }`;

idx = content3.indexOf('  _redactSecrets(result) {');
const endIdx3 = content3.indexOf('  }', content3.indexOf('return redacted;')) + 3;
content3 = content3.substring(0, idx) + newRedact + content3.substring(endIdx3);

fs.writeFileSync(execPath, content3, 'utf8');
console.log('Done P3\n');

console.log('All fixes applied!');
