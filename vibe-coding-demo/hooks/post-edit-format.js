#!/usr/bin/env node
/**
 * POST-EDIT HOOK: Auto-format files after Claude edits them
 *
 * This hook runs Prettier on any file Claude modifies to ensure
 * consistent formatting without relying on the AI to remember.
 */

const { execSync } = require('child_process');
const path = require('path');

function postEditHook(event) {
  const { file_path } = event;

  // Only format certain file types
  const formattableExtensions = ['.js', '.ts', '.jsx', '.tsx', '.json', '.css', '.md'];
  const ext = path.extname(file_path);

  if (!formattableExtensions.includes(ext)) {
    console.log(`[Hook] Skipping format for ${file_path} (not a formattable file)`);
    return;
  }

  try {
    console.log(`[Hook] Auto-formatting ${file_path}...`);
    execSync(`npx prettier --write "${file_path}"`, {
      stdio: 'inherit',
      cwd: __dirname + '/..',
    });
    console.log(`[Hook] ✓ Formatted ${file_path}`);
  } catch (error) {
    console.error(`[Hook] ✗ Failed to format ${file_path}:`, error.message);
  }
}

// Claude Code calls this with event data
if (require.main === module) {
  const event = JSON.parse(process.argv[2] || '{}');
  postEditHook(event);
}

module.exports = postEditHook;
