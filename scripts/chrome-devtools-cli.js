#!/usr/bin/env node
/**
 * Chrome DevTools CLI Wrapper
 * Command-line utilities for Chrome DevTools Bridge
 *
 * @module chrome-devtools-cli
 */

import { program } from 'commander';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';

const BRIDGE_URL = process.env.CHROME_BRIDGE_URL || 'http://localhost:65030';

/**
 * Make HTTP request to bridge
 */
async function callBridge(endpoint, method = 'GET', body = null) {
  const url = `${BRIDGE_URL}${endpoint}`;

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!data.success && data.error) {
      throw new Error(data.error);
    }

    return data;
  } catch (error) {
    console.error(`❌ Bridge request failed: ${error.message}`);
    console.error(`   Make sure Chrome DevTools Bridge is running: npm run start:chrome-bridge`);
    process.exit(1);
  }
}

/**
 * Call Chrome DevTools tool
 */
async function callTool(toolName, args) {
  return callBridge(`/tools/${toolName}`, 'POST', args);
}

// CLI Program
program
  .name('chrome-cli')
  .description('Chrome DevTools CLI for Claude Code')
  .version('1.0.0');

// Navigate command
program
  .command('navigate <url>')
  .description('Navigate Chrome to a URL')
  .action(async (url) => {
    console.log(`🌐 Navigating to ${url}...`);
    const result = await callBridge('/navigate', 'POST', { url });
    console.log('✅ Navigation complete');
    if (result.result) {
      console.log(JSON.stringify(result.result, null, 2));
    }
  });

// Screenshot command
program
  .command('screenshot [filename]')
  .description('Take a screenshot of current page')
  .option('-f, --fullPage', 'Capture full page')
  .option('--selector <selector>', 'Screenshot specific element')
  .action(async (filename, options) => {
    console.log('📸 Taking screenshot...');

    const args = {};
    if (options.fullPage) args.fullPage = true;
    if (options.selector) args.selector = options.selector;

    const result = await callBridge('/screenshot', 'POST', args);

    if (result.result && result.result.content) {
      const content = result.result.content;

      // Extract base64 data if present
      let base64Data = content;
      if (Array.isArray(content) && content[0]?.type === 'image') {
        base64Data = content[0].data;
      }

      // Save to file
      const outputFile = filename || `screenshot-${Date.now()}.png`;
      const buffer = Buffer.from(base64Data, 'base64');
      await fs.writeFile(outputFile, buffer);

      console.log(`✅ Screenshot saved: ${outputFile}`);
    } else {
      console.log('✅ Screenshot complete');
      console.log(JSON.stringify(result.result, null, 2));
    }
  });

// Click command
program
  .command('click <selector>')
  .description('Click an element on the page')
  .action(async (selector) => {
    console.log(`🖱️ Clicking ${selector}...`);
    const result = await callBridge('/click', 'POST', { selector });
    console.log('✅ Click complete');
    if (result.result) {
      console.log(JSON.stringify(result.result, null, 2));
    }
  });

// Fill command
program
  .command('fill <selector> <value>')
  .description('Fill a form field')
  .action(async (selector, value) => {
    console.log(`✍️ Filling ${selector} with "${value}"...`);
    const result = await callTool('fill', { selector, value });
    console.log('✅ Fill complete');
    if (result.result) {
      console.log(JSON.stringify(result.result, null, 2));
    }
  });

// Evaluate command
program
  .command('eval <script>')
  .description('Execute JavaScript in the page')
  .action(async (script) => {
    console.log('⚙️ Evaluating JavaScript...');
    const result = await callBridge('/evaluate', 'POST', { script });
    console.log('✅ Evaluation complete');
    if (result.result) {
      console.log(JSON.stringify(result.result, null, 2));
    }
  });

// Console command
program
  .command('console')
  .description('Get console messages')
  .action(async () => {
    console.log('📋 Getting console messages...');
    const result = await callTool('console_get_messages', {});
    console.log('✅ Console messages:');
    if (result.result) {
      console.log(JSON.stringify(result.result, null, 2));
    }
  });

// List tools command
program
  .command('tools')
  .description('List available Chrome DevTools tools')
  .action(async () => {
    console.log('🔧 Available Chrome DevTools tools:\n');
    const result = await callBridge('/tools', 'GET');

    if (result.tools) {
      for (const tool of result.tools) {
        console.log(`  ${tool.name}`);
        if (tool.description) {
          console.log(`    ${tool.description}`);
        }
        console.log('');
      }
    }
  });

// Custom tool call
program
  .command('call <tool> [args...]')
  .description('Call any Chrome DevTools tool with JSON args')
  .action(async (tool, args) => {
    console.log(`🔧 Calling tool: ${tool}...`);

    let parsedArgs = {};
    if (args.length > 0) {
      try {
        // Try to parse as JSON
        parsedArgs = JSON.parse(args.join(' '));
      } catch {
        // If not JSON, treat as key-value pairs
        for (let i = 0; i < args.length; i += 2) {
          const key = args[i].replace(/^--/, '');
          const value = args[i + 1];
          parsedArgs[key] = value;
        }
      }
    }

    const result = await callTool(tool, parsedArgs);
    console.log('✅ Tool call complete');
    console.log(JSON.stringify(result.result, null, 2));
  });

// Health check
program
  .command('health')
  .description('Check bridge health status')
  .action(async () => {
    try {
      const result = await callBridge('/health', 'GET');
      console.log('✅ Bridge is healthy');
      console.log(`   Initialized: ${result.initialized}`);
      console.log(`   Tools available: ${result.tools}`);
    } catch (error) {
      console.log('❌ Bridge is not responding');
      process.exit(1);
    }
  });

// Parse arguments
program.parse();
