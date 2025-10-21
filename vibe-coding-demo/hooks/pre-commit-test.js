#!/usr/bin/env node
/**
 * PRE-COMMIT HOOK: Run tests before allowing commits
 *
 * Prevents commits with failing tests. This ensures Claude
 * (or humans) can't commit broken code.
 */

const { execSync } = require('child_process');

function preCommitHook(event) {
  const { message } = event;

  console.log(`[Hook] Running tests before commit: "${message}"`);

  try {
    // Run tests
    execSync('npm test', {
      stdio: 'inherit',
      cwd: __dirname + '/..',
    });

    console.log('[Hook] ✓ Tests passed - commit allowed');
    return { allow: true };
  } catch (error) {
    console.error('[Hook] ✗ Tests failed - commit blocked');
    console.error('Fix the tests before committing.');
    return {
      allow: false,
      reason: 'Tests must pass before committing',
    };
  }
}

if (require.main === module) {
  const event = JSON.parse(process.argv[2] || '{}');
  const result = preCommitHook(event);
  console.log(JSON.stringify(result));
  process.exit(result.allow ? 0 : 1);
}

module.exports = preCommitHook;
