#!/usr/bin/env node
/**
 * PRE-BASH HOOK: Security guardrails for dangerous commands
 *
 * Blocks potentially destructive operations before Claude executes them.
 */

function preBashHook(event) {
  const { command } = event;

  // Dangerous command patterns
  const dangerousPatterns = [
    /rm\s+-rf\s+\//, // Recursive delete from root
    /rm\s+-rf\s+~\//, // Delete from home
    /dd\s+if=/, // Disk operations
    /mkfs/, // Format filesystem
    /:\(\)\{\s*:\|:&\s*\};:/, // Fork bomb
    />.*\/etc\//, // Overwrite system files
    /chmod\s+777/, // Insecure permissions
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      console.error(`[Hook] ✗ BLOCKED dangerous command: ${command}`);
      console.error(`[Hook] Pattern matched: ${pattern}`);
      return {
        allow: false,
        reason: `Dangerous command blocked by security hook: ${command}`,
      };
    }
  }

  // Warn about potentially risky commands
  const riskyPatterns = [
    { pattern: /rm\s+-rf/, message: 'Recursive delete detected' },
    { pattern: /sudo/, message: 'Elevated privileges requested' },
    { pattern: /curl.*\|\s*bash/, message: 'Piping web content to bash' },
  ];

  for (const { pattern, message } of riskyPatterns) {
    if (pattern.test(command)) {
      console.warn(`[Hook] ⚠ Warning: ${message}`);
      console.warn(`[Hook] Command: ${command}`);
    }
  }

  console.log(`[Hook] ✓ Command allowed: ${command}`);
  return { allow: true };
}

if (require.main === module) {
  const event = JSON.parse(process.argv[2] || '{}');
  const result = preBashHook(event);
  console.log(JSON.stringify(result));
  process.exit(result.allow ? 0 : 1);
}

module.exports = preBashHook;
