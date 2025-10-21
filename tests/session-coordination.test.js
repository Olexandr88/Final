import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import SessionCoordinator from '../src/session-coordinator.js';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Session Coordination', () => {
  let coordinator;
  const testDir = path.join(__dirname, '.test-sessions');
  const testFile = path.join(testDir, 'test-file.txt');

  before(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  after(() => {
    if (coordinator) {
      coordinator.cleanup();
    }
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should register a new session', () => {
    coordinator = new SessionCoordinator();
    const sessionId = coordinator.initialize();

    assert.ok(sessionId);
    assert.strictEqual(typeof sessionId, 'string');
    assert.ok(sessionId.length > 0);
  });

  it('should list active sessions', () => {
    const sessions = coordinator.listSessions();

    assert.ok(Array.isArray(sessions));
    assert.ok(sessions.length > 0);
    assert.ok(sessions[0].id);
    assert.ok(sessions[0].pid);
    assert.ok('isCurrentSession' in sessions[0]);
  });

  it('should acquire and release file lock', async () => {
    fs.writeFileSync(testFile, 'initial content');

    await coordinator.safeWrite(testFile, async () => {
      const content = fs.readFileSync(testFile, 'utf8');
      fs.writeFileSync(testFile, content + '\nmodified');
    });

    const finalContent = fs.readFileSync(testFile, 'utf8');
    assert.ok(finalContent.includes('modified'));
  });

  it('should prevent concurrent writes to same file', async () => {
    fs.writeFileSync(testFile, 'start\n');

    const writes = [];
    for (let i = 0; i < 5; i++) {
      writes.push(
        coordinator.safeWrite(testFile, async () => {
          const content = fs.readFileSync(testFile, 'utf8');
          // Simulate some work
          await new Promise((resolve) => setTimeout(resolve, 50));
          fs.writeFileSync(testFile, content + `write-${i}\n`);
        })
      );
    }

    await Promise.all(writes);

    const finalContent = fs.readFileSync(testFile, 'utf8');
    const lines = finalContent.trim().split('\n');

    // Should have start + 5 writes
    assert.strictEqual(lines.length, 6);
    assert.strictEqual(lines[0], 'start');
  });

  it('should detect lock conflicts', async () => {
    fs.writeFileSync(testFile, 'test');

    // Start a write operation that holds the lock
    const writeLock = coordinator.lockManager.acquireLock(testFile, 'write', 10000);

    await writeLock;

    // Check for conflict
    const conflict = coordinator.checkConflicts(testFile);
    assert.strictEqual(conflict, null); // We own the lock

    // Release it
    await coordinator.lockManager.releaseLock(testFile);
  });

  it('should format session list', () => {
    const output = coordinator.formatSessionList();

    assert.ok(output.includes('Active Claude Sessions'));
    assert.ok(output.includes('Session:'));
    assert.ok(output.includes('PID:'));
    assert.ok(output.includes('Uptime:'));
  });

  it('should format lock list', async () => {
    fs.writeFileSync(testFile, 'test');

    await coordinator.lockManager.acquireLock(testFile, 'write', 5000);

    const output = coordinator.formatLockList();
    assert.ok(output.includes('Current Session Locks'));
    assert.ok(output.includes(testFile));
    assert.ok(output.includes('Type: write'));

    await coordinator.lockManager.releaseLock(testFile);
  });

  it('should get session info', () => {
    const sessionId = coordinator.getCurrentSessionId();
    const info = coordinator.getSessionInfo(sessionId);

    assert.ok(info);
    assert.strictEqual(info.id, sessionId);
    assert.strictEqual(info.pid, process.pid);
    assert.strictEqual(info.status, 'active');
  });

  it('should cleanup stale sessions', async () => {
    // Wait for heartbeat to run
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const sessions = coordinator.listSessions();
    // All sessions should still be active (heartbeat is running)
    sessions.forEach((session) => {
      assert.ok(session.lastHeartbeatAge < 10000);
    });
  }, 10000);
});

describe('Multi-Session Coordination', () => {
  const testFile = path.join(__dirname, '.test-sessions', 'concurrent-test.txt');

  before(() => {
    const testDir = path.dirname(testFile);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  it('should coordinate multiple processes', async () => {
    fs.writeFileSync(testFile, '0\n');

    // Create a simple script that uses session coordination (ESM format)
    const scriptPath = path.join(__dirname, '.test-sessions', 'worker.js');
    fs.writeFileSync(
      scriptPath,
      `
      import SessionCoordinator from '../src/session-coordinator.js';
      import fs from 'fs';

      const coordinator = new SessionCoordinator();
      coordinator.initialize();

      async function work() {
        const testFile = process.argv[2];
        const workerId = process.argv[3];

        for (let i = 0; i < 3; i++) {
          await coordinator.safeWrite(testFile, async () => {
            const content = fs.readFileSync(testFile, 'utf8');
            const count = parseInt(content.trim()) || 0;
            fs.writeFileSync(testFile, (count + 1) + '\\n');
            console.log(\`Worker \${workerId}: incremented to \${count + 1}\`);
          });
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        coordinator.cleanup();
      }

      work().catch(console.error);
    `
    );

    // Spawn 3 worker processes
    const workers = [];
    for (let i = 0; i < 3; i++) {
      const worker = spawn('node', [scriptPath, testFile, i], {
        stdio: 'inherit',
      });
      workers.push(
        new Promise((resolve, reject) => {
          worker.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Worker ${i} exited with code ${code}`));
          });
        })
      );
    }

    // Wait for all workers to complete
    await Promise.all(workers);

    // Check final count (should be 9: 3 workers × 3 increments each)
    const finalContent = fs.readFileSync(testFile, 'utf8');
    const finalCount = parseInt(finalContent.trim());
    assert.strictEqual(finalCount, 9);

    // Cleanup
    fs.unlinkSync(scriptPath);
  }, 30000);
});
