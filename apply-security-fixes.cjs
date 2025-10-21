const fs = require('fs');
const path = require('path');

console.log('Applying critical security fixes...\n');

// Priority 1
console.log('Priority 1: Command Injection Bypass');
const sp = path.join(process.cwd(), 'src', 'security', 'command-sandbox.js');
let c = fs.readFileSync(sp, 'utf8');

const newMethod = `
  _detectShellOperators(command) {
    const ops = ['&&', '||', ';', '|', '>', '<', '$' + '(', '\`', '$' + '{', '&', '\n', '\r\n'];
    for (const o of ops) {
      if (command.includes(o)) return {valid: false, reason: 'Operator: ' + o, severity: 'HIGH'};
    }
    const enc = ['%26%26', '%7C%7C', '%3B', '%7C', '%3E', '%3C', '%0A', '%0D', '%24%28', '%60', '%24%7B'];
    const upper = command.toUpperCase();
    for (const e of enc) {
      if (upper.includes(e)) return {valid: false, reason: 'Encoded: ' + e, severity: 'CRITICAL'};
    }
    const html = ['&amp;', '&#38;', '&lt;', '&#60;', '&gt;', '&#62;', '&semi;', '&#59;'];
    for (const h of html) {
      if (command.includes(h)) return {valid: false, reason: 'HTML: ' + h, severity: 'CRITICAL'};
    }
    return {valid: true};
  }
`;

const marker = '  /**\n   * Validate and sanitize command before execution';
let idx = c.indexOf(marker);
c = c.substring(0, idx) + newMethod + '\n' + c.substring(idx);

let os = c.indexOf('    // Check for shell operators (command chaining)');
let oe = c.indexOf('    }', os) + 5;
const newCheck = '    const operatorCheck = this._detectShellOperators(command);\n    if (!operatorCheck.valid) return operatorCheck;\n';
c = c.substring(0, os) + newCheck + c.substring(oe);

fs.writeFileSync(sp, c, 'utf8');
console.log('[OK] Enhanced shell operator detection\n');

// Priority 2
console.log('Priority 2: Windows Path Traversal');
c = fs.readFileSync(sp, 'utf8');

const newValidatePath = `  validatePath(filePath) {
    if (!filePath || typeof filePath !== 'string') {
      return {valid: false, reason: 'Invalid path type', severity: 'HIGH'};
    }
    if (filePath.startsWith('\\\\') || filePath.startsWith('//')) {
      return {valid: false, reason: 'UNC paths not allowed', severity: 'CRITICAL'};
    }
    if (filePath.includes(':') && !filePath.match(/^[A-Za-z]:\\/)) {
      return {valid: false, reason: 'NTFS ADS not allowed', severity: 'CRITICAL'};
    }
    let normalized;
    try {
      normalized = path.normalize(filePath);
      normalized = path.resolve(normalized);
    } catch (error) {
      return {valid: false, reason: 'Normalize failed: ' + error.message, severity: 'HIGH'};
    }
    if (normalized.includes('..') || filePath.includes('..')) {
      return {valid: false, reason: 'Path traversal detected', severity: 'CRITICAL'};
    }
    const isAllowed = this.config.allowedPaths.some(ap => {
      const resolved = path.resolve(ap);
      return normalized.startsWith(resolved);
    });
    if (!isAllowed) {
      return {valid: false, reason: 'Path outside allowed directories', severity: 'HIGH', path: normalized};
    }
    const SENS = ['C:\\Windows\\System32', 'C:\\Windows\\SysWOW64', 'C:\\Program Files', process.env.APPDATA, process.env.LOCALAPPDATA].filter(Boolean);
    for (const s of SENS) {
      const ns = path.resolve(s).toLowerCase();
      if (normalized.toLowerCase().startsWith(ns)) {
        return {valid: false, reason: 'Sensitive directory denied', severity: 'CRITICAL', path: normalized};
      }
    }
    return {valid: true, path: normalized};
  }
`;

let vpStart = c.indexOf('  validatePath(filePath) {');
let vpEnd = c.indexOf('    return { valid: true, path: resolved };') + 43 + 4;
c = c.substring(0, vpStart) + newValidatePath + c.substring(vpEnd);

fs.writeFileSync(sp, c, 'utf8');
console.log('[OK] Enhanced path validation\n');

// Priority 3
console.log('Priority 3: Deep Secrets Redaction');
const ep = path.join(process.cwd(), 'src', 'tools', 'secure-tool-executor.js');
let ec = fs.readFileSync(ep, 'utf8');

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
  }
`;

let rsStart = ec.indexOf('  _redactSecrets(result) {');
let rsEnd = ec.indexOf('    return redacted;', rsStart) + 19 + 4;
ec = ec.substring(0, rsStart) + newRedact + ec.substring(rsEnd);

fs.writeFileSync(ep, ec, 'utf8');
console.log('[OK] Deep recursive secrets redaction\n');

console.log('[SUCCESS] All critical security fixes applied!');
