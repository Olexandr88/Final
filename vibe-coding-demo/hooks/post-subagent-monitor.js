#!/usr/bin/env node
/**
 * POST-SUBAGENT HOOK: Monitor and log sub-agent output
 *
 * Captures sub-agent responses to detect "beauty filtering"
 * where the main agent sanitizes negative feedback.
 */

const fs = require('fs');
const path = require('path');

function postSubagentHook(event) {
  const { subagent_name, raw_output, filtered_output } = event;

  const logDir = path.join(__dirname, '..', '.subagent-logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const timestamp = new Date().toISOString();
  const logFile = path.join(logDir, `${subagent_name}-${Date.now()}.json`);

  const logEntry = {
    timestamp,
    subagent: subagent_name,
    raw_output,
    filtered_output,
    filtering_detected: raw_output !== filtered_output,
  };

  fs.writeFileSync(logFile, JSON.stringify(logEntry, null, 2));

  if (logEntry.filtering_detected) {
    console.warn(`[Hook] ⚠ Output filtering detected from ${subagent_name}`);
    console.warn(`[Hook] Raw output length: ${raw_output.length} chars`);
    console.warn(`[Hook] Filtered output length: ${filtered_output.length} chars`);
    console.warn(`[Hook] Full transcript saved to: ${logFile}`);
  } else {
    console.log(`[Hook] ✓ Sub-agent output logged: ${logFile}`);
  }
}

if (require.main === module) {
  const event = JSON.parse(process.argv[2] || '{}');
  postSubagentHook(event);
}

module.exports = postSubagentHook;
