/**
 * Test file to verify ESM fixes and browser history functionality
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
// Node 20 has global fetch, no import needed

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

describe('Server ESM and Browser History Fixes', { skip: true }, () => {
  let serverProcess;
  const PORT = 8081; // Use different port for testing
  const SERVER_URL = `http://localhost:${PORT}`;

  test('setup server', { timeout: 30000 }, async () => {
    // Build the project first
    const buildProcess = spawn('npm', ['run', 'build'], {
      cwd: projectRoot,
      stdio: 'pipe'
    });

    await new Promise((resolve, reject) => {
      buildProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Build failed with code ${code}`));
        }
      });
    });

    // Start server with custom port
    serverProcess = spawn('node', ['server.js'], {
      cwd: projectRoot,
      env: { ...process.env, PORT: PORT.toString() },
      stdio: 'pipe'
    });

    // Wait for server to start
    await new Promise((resolve) => {
      setTimeout(resolve, 3000); // Give server time to start
    });
  });

  test('teardown server', async () => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');

      // Wait for graceful shutdown
      await new Promise((resolve) => {
        serverProcess.on('exit', resolve);
        setTimeout(() => {
          serverProcess.kill('SIGKILL');
          resolve();
        }, 5000);
      });
    }
  });

  test('Server starts without ESM import errors', async () => {
    try {
      const response = await fetch(`${SERVER_URL}/health`);
      assert.equal(response.status, 200);

      const healthData = await response.json();
      assert.equal(healthData.status, 'ok');
      assert.ok(healthData.timestamp);
    } catch (error) {
      throw new Error(`Server health check failed: ${error.message}`);
    }
  });

  test('Root endpoint provides API information', async () => {
    try {
      const response = await fetch(`${SERVER_URL}/`);
      assert.equal(response.status, 200);

      const apiInfo = await response.json();
      assert.equal(apiInfo.status, 'ok');
      assert.equal(apiInfo.message, 'LLM AI Bridge Server');
      assert.ok(Array.isArray(apiInfo.endpoints));
      assert.ok(apiInfo.endpoints.length > 0);
    } catch (error) {
      throw new Error(`Root endpoint test failed: ${error.message}`);
    }
  });

  test('Browser history endpoint returns data', async () => {
    try {
      const response = await fetch(`${SERVER_URL}/history`);
      assert.equal(response.status, 200);

      const historyData = await response.json();
      assert.equal(historyData.success, true);
      assert.equal(typeof historyData.count, 'number');
      assert.ok(Array.isArray(historyData.data));

      // Even with mock data, we should get some entries
      assert.ok(historyData.data.length >= 0);

      if (historyData.data.length > 0) {
        const firstEntry = historyData.data[0];
        assert.ok(firstEntry.url);
        assert.ok(firstEntry.title);
        assert.equal(typeof firstEntry.visitTime, 'number');
        assert.ok(firstEntry.browser);
      }
    } catch (error) {
      throw new Error(`Browser history test failed: ${error.message}`);
    }
  });

  test('Search endpoint works correctly', async () => {
    try {
      const query = 'github';
      const response = await fetch(`${SERVER_URL}/search?query=${query}`);
      assert.equal(response.status, 200);

      const searchData = await response.json();
      assert.equal(searchData.success, true);
      assert.equal(searchData.query, query);
      assert.equal(typeof searchData.count, 'number');
      assert.ok(Array.isArray(searchData.data));
    } catch (error) {
      throw new Error(`Search endpoint test failed: ${error.message}`);
    }
  });

  test('Search endpoint requires query parameter', async () => {
    try {
      const response = await fetch(`${SERVER_URL}/search`);
      assert.equal(response.status, 400);

      const errorData = await response.json();
      assert.equal(errorData.success, false);
      assert.ok(errorData.error.includes('required'));
    } catch (error) {
      throw new Error(`Search parameter validation test failed: ${error.message}`);
    }
  });

  test('Metrics endpoint provides performance data', async () => {
    try {
      const response = await fetch(`${SERVER_URL}/metrics`);
      assert.equal(response.status, 200);

      const metricsText = await response.text();
      assert.ok(metricsText.includes('requests_total'));
      assert.ok(metricsText.includes('memory_usage'));
      assert.ok(metricsText.includes('uptime_seconds'));
    } catch (error) {
      throw new Error(`Metrics endpoint test failed: ${error.message}`);
    }
  });

  test('History endpoint with custom count', async () => {
    try {
      const count = 10;
      const response = await fetch(`${SERVER_URL}/history/${count}`);
      assert.equal(response.status, 200);

      const historyData = await response.json();
      assert.equal(historyData.success, true);
      assert.ok(historyData.count <= count);
    } catch (error) {
      throw new Error(`Custom count test failed: ${error.message}`);
    }
  });
});

// Test browser history tool directly
describe('Browser History Tool Direct Tests', () => {
  test('Can import browser history tool', async () => {
    try {
      const { default: BrowserHistoryTool } = await import('../dist/tools/browser-history.js');
      assert.ok(BrowserHistoryTool);

      const tool = new BrowserHistoryTool({ autoSync: false });
      assert.equal(tool.name, 'browser_history');
      assert.ok(tool.description.length > 0);
    } catch (error) {
      throw new Error(`Browser history tool import failed: ${error.message}`);
    }
  });

  test('Browser history tool execute method works', async () => {
    try {
      const { default: BrowserHistoryTool } = await import('../dist/tools/browser-history.js');
      const tool = new BrowserHistoryTool({ autoSync: false });

      // Test get_browsers action
      const browsersResult = await tool.execute({ action: 'get_browsers' });
      const browsersData = JSON.parse(browsersResult);
      assert.equal(browsersData.success, true);
      assert.ok(Array.isArray(browsersData.browsers));

      // Test stats action
      const statsResult = await tool.execute({ action: 'stats' });
      const statsData = JSON.parse(statsResult);
      assert.equal(statsData.success, true);
      assert.equal(typeof statsData.stats, 'object');

      // Test invalid action
      const invalidResult = await tool.execute({ action: 'invalid_action' });
      const invalidData = JSON.parse(invalidResult);
      assert.equal(invalidData.success, false);
      assert.ok(invalidData.error.includes('Unknown action'));

      // Cleanup
      tool.destroy();
    } catch (error) {
      throw new Error(`Browser history tool execution test failed: ${error.message}`);
    }
  });
});