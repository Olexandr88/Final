// tests/wsl-bridge.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { WSLBridge } from '../src/integrations/wsl-bridge.js';

describe('WSLBridge', () => {
  let wsl;

  before(async () => {
    wsl = new WSLBridge({
      timeout: 10000,
    });
  });

  describe('Initialization', () => {
    it('should create WSLBridge instance', () => {
      assert.ok(wsl instanceof WSLBridge);
      assert.strictEqual(typeof wsl.initialize, 'function');
    });

    it('should have default configuration', () => {
      assert.ok(wsl.config);
      assert.strictEqual(wsl.config.timeout, 10000);
    });

    it('should only be available on Windows', async () => {
      const available = await wsl.initialize();

      if (process.platform === 'win32') {
        assert.strictEqual(typeof available, 'boolean');
      } else {
        assert.strictEqual(available, false);
        assert.strictEqual(wsl.isAvailable, false);
      }
    });
  });

  describe('Path Conversion', () => {
    it('should convert Windows path to WSL path', () => {
      const windowsPath = 'C:\\Users\\scarm\\project\\file.js';
      const wslPath = wsl._convertToWSLPath(windowsPath);

      assert.strictEqual(wslPath, '/mnt/c/Users/scarm/project/file.js');
    });

    it('should convert WSL path to Windows path', () => {
      const wslPath = '/mnt/c/Users/scarm/project/file.js';
      const windowsPath = wsl._convertToWindowsPath(wslPath);

      assert.strictEqual(windowsPath, 'C:\\Users\\scarm\\project\\file.js');
    });

    it('should handle lowercase drive letters', () => {
      const windowsPath = 'c:\\test\\file.txt';
      const wslPath = wsl._convertToWSLPath(windowsPath);

      assert.strictEqual(wslPath, '/mnt/c/test/file.txt');
    });

    it('should provide path utility functions', () => {
      const utils = wsl.getPathUtils();

      assert.ok(utils);
      assert.strictEqual(typeof utils.toWSL, 'function');
      assert.strictEqual(typeof utils.toWindows, 'function');

      const testPath = 'C:\\test';
      const converted = utils.toWSL(testPath);
      assert.strictEqual(converted, '/mnt/c/test');
    });
  });

  describe('Distribution Management', () => {
    it('should parse distribution list', () => {
      const mockOutput = `
  NAME            STATE           VERSION
* Ubuntu-22.04    Running         2
  Debian          Stopped         2
      `;

      const distros = wsl._parseDistroList(mockOutput);

      assert.ok(Array.isArray(distros));
      assert.strictEqual(distros.length, 2);

      assert.strictEqual(distros[0].name, 'Ubuntu-22.04');
      assert.strictEqual(distros[0].state, 'Running');
      assert.strictEqual(distros[0].version, '2');
      assert.strictEqual(distros[0].isDefault, true);

      assert.strictEqual(distros[1].name, 'Debian');
      assert.strictEqual(distros[1].state, 'Stopped');
      assert.strictEqual(distros[1].isDefault, false);
    });
  });

  describe('Command Execution on WSL', () => {
    it('should execute simple Linux command', async () => {
      if (process.platform !== 'win32' || !wsl.isAvailable) {
        return; // Skip if not on Windows or WSL not available
      }

      const result = await wsl.execute('echo "Hello WSL"');

      assert.ok(result.success);
      assert.ok(result.stdout.includes('Hello WSL'));
      assert.strictEqual(result.exitCode, 0);
    });

    it('should handle command with options', async () => {
      if (process.platform !== 'win32' || !wsl.isAvailable) {
        return;
      }

      const result = await wsl.execute('pwd', {
        distro: wsl.config.defaultDistro,
      });

      assert.ok(result.success);
      assert.ok(result.stdout);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid commands', async () => {
      if (process.platform !== 'win32' || !wsl.isAvailable) {
        return;
      }

      await assert.rejects(
        async () => await wsl.execute('invalid-command-that-does-not-exist'),
        Error
      );
    });

    it('should handle command timeout', async () => {
      const timeoutWsl = new WSLBridge({ timeout: 1 });
      await timeoutWsl.initialize();

      if (process.platform === 'win32' && timeoutWsl.isAvailable) {
        await assert.rejects(
          async () => await timeoutWsl.execute('sleep 10'),
          /timeout/i
        );
      } else {
        assert.ok(true); // Skip on non-Windows
      }
    });
  });

  describe('Event Emission', () => {
    it('should emit events on command execution', (done) => {
      let eventReceived = false;

      wsl.once('execute', (data) => {
        eventReceived = true;
        assert.ok(data);
        assert.ok('command' in data);
        assert.ok('success' in data);
      });

      // Simulate event
      wsl.emit('execute', { command: 'test', success: true });

      setTimeout(() => {
        assert.strictEqual(eventReceived, true);
        done();
      }, 100);
    });
  });
});
