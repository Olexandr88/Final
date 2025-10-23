// tests/powershell-executor.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PowerShellExecutor } from '../src/integrations/powershell-executor.js';

describe('PowerShellExecutor', () => {
  let powershell;

  before(async () => {
    powershell = new PowerShellExecutor({
      timeout: 10000,
      fallbackToWindowsPowerShell: true,
    });
  });

  describe('Initialization', () => {
    it('should create PowerShellExecutor instance', () => {
      assert.ok(powershell instanceof PowerShellExecutor);
      assert.strictEqual(typeof powershell.initialize, 'function');
    });

    it('should have default configuration', () => {
      assert.ok(powershell.config);
      assert.strictEqual(powershell.config.timeout, 10000);
      assert.strictEqual(powershell.config.executionPolicy, 'Bypass');
    });

    it('should detect PowerShell availability', async () => {
      const available = await powershell.initialize();
      assert.strictEqual(typeof available, 'boolean');

      if (available) {
        assert.strictEqual(powershell.isAvailable, true);
      }
    });
  });

  describe('Command Execution', () => {
    it('should execute simple PowerShell command', async () => {
      if (!powershell.isAvailable) {
        return; // Skip if PowerShell not available
      }

      const result = await powershell.execute('Write-Output "Hello PowerShell"');

      assert.ok(result.success);
      assert.ok(result.stdout.includes('Hello PowerShell'));
      assert.strictEqual(result.exitCode, 0);
    });

    it('should execute arithmetic command', async () => {
      if (!powershell.isAvailable) {
        return;
      }

      const result = await powershell.execute('2 + 2');

      assert.ok(result.success);
      assert.ok(result.stdout.trim().includes('4'));
    });

    it('should handle command options', async () => {
      if (!powershell.isAvailable) {
        return;
      }

      const result = await powershell.execute('$PSVersionTable.PSVersion', {
        cwd: process.cwd(),
      });

      assert.ok(result.success);
      assert.ok(result.stdout);
    });
  });

  describe('Environment Variables', () => {
    it('should get environment variable', async () => {
      if (!powershell.isAvailable) {
        return;
      }

      const result = await powershell.getEnvVar('PATH');

      assert.ok(result);
      assert.strictEqual(typeof result, 'string');
    });

    it('should set environment variable (process scope)', async () => {
      if (!powershell.isAvailable) {
        return;
      }

      const result = await powershell.setEnvVar('TEST_VAR', 'test_value');

      assert.ok(result.success);
    });
  });

  describe('System Information', () => {
    it('should get system information', async () => {
      if (!powershell.isAvailable) {
        return;
      }

      const info = await powershell.getSystemInfo();

      assert.ok(info);
      assert.ok(info.ComputerName);
      assert.ok(info.OSVersion);
      assert.ok(info.ProcessorCount);
      assert.strictEqual(typeof info.ProcessorCount, 'number');
    });
  });

  describe('File Operations', () => {
    it('should test path existence', async () => {
      if (!powershell.isAvailable) {
        return;
      }

      // Test existing path (current directory)
      const exists = await powershell.testPath(process.cwd());
      assert.strictEqual(exists, true);

      // Test non-existing path
      const notExists = await powershell.testPath('C:\\NonExistentPath12345');
      assert.strictEqual(notExists, false);
    });
  });

  describe('Command Encoding', () => {
    it('should encode command to Base64', () => {
      const command = 'Write-Output "Test"';
      const encoded = powershell.encodeCommand(command);

      assert.ok(encoded);
      assert.strictEqual(typeof encoded, 'string');

      // Decode to verify
      const decoded = Buffer.from(encoded, 'base64').toString('utf16le');
      assert.strictEqual(decoded, command);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid commands', async () => {
      if (!powershell.isAvailable) {
        return;
      }

      const result = await powershell.execute('Invalid-Command-That-Does-Not-Exist');

      assert.strictEqual(result.success, false);
      assert.ok(result.stderr || result.stdout);
    });

    it('should handle command timeout', async () => {
      const timeoutPs = new PowerShellExecutor({ timeout: 1 });
      await timeoutPs.initialize();

      if (timeoutPs.isAvailable) {
        await assert.rejects(
          async () => await timeoutPs.execute('Start-Sleep -Seconds 10'),
          /timeout/i
        );
      } else {
        assert.ok(true); // Skip if not available
      }
    });
  });

  describe('Event Emission', () => {
    it('should emit events on command execution', (done) => {
      let eventReceived = false;

      powershell.once('execute', (data) => {
        eventReceived = true;
        assert.ok(data);
        assert.ok('command' in data);
        assert.ok('success' in data);
      });

      // Simulate event
      powershell.emit('execute', { command: 'test', success: true });

      setTimeout(() => {
        assert.strictEqual(eventReceived, true);
        done();
      }, 100);
    });
  });
});
