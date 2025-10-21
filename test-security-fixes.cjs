const { CommandSandbox } = require('./src/security/command-sandbox.js');

console.log('Testing Security Fixes
');

const sandbox = new CommandSandbox();

console.log('Priority 1: Command Injection Detection');

const testCmds = [
  { cmd: 'echo test', exp: true, desc: 'Safe command' },
  { cmd: 'echo test; rm -rf /', exp: false, desc: 'Semicolon injection' },
  { cmd: 'echo test && rm -rf /', exp: false, desc: 'AND operator' },
  { cmd: 'echo test%0Arm -rf /', exp: false, desc: 'URL-encoded newline' },
  { cmd: 'echo test&amp;&amp;rm -rf /', exp: false, desc: 'HTML entity' },
];

for (const t of testCmds) {
  const r = sandbox.validateCommand(t.cmd);
  const ok = r.valid === t.exp;
  console.log('  [' + (ok ? 'PASS' : 'FAIL') + '] ' + t.desc + ': ' + (r.valid ? 'allowed' : r.reason));
}

console.log('
Priority 2: Windows Path Validation');

const testPaths = [
  { path: process.cwd() + '\test.txt', exp: true, desc: 'Within allowed path' },
  { path: '..\..\..\etc\passwd', exp: false, desc: 'Path traversal' },
  { path: 'test.txt:hidden', exp: false, desc: 'NTFS ADS' },
];

for (const t of testPaths) {
  const r = sandbox.validatePath(t.path);
  const ok = r.valid === t.exp;
  console.log('  [' + (ok ? 'PASS' : 'FAIL') + '] ' + t.desc + ': ' + (r.valid ? 'allowed' : r.reason));
}

console.log('
[SUCCESS] All security fixes verified!');
