import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ContextManager } from '../src/utils/context-manager.js';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_SESSION_ID = 'test-session-123';
const TEST_ROLE = 'test-agent';

// Test directories
const STATE_DIR = '.agent-locks/SESSION-STATE';
const HISTORY_DIR = '.agent-locks/SESSION-HISTORY';
const HANDOFF_DIR = '.agent-locks/HANDOFFS';
const CHECKPOINT_DIR = '.agent-locks/CHECKPOINTS';
const COORD_FILE = '.agent-locks/SESSION-COORDINATION.json';

describe('ContextManager', () => {
  let contextManager;

  before(async () => {
    // Clean up test directories before starting
    await cleanupTestDirectories();
  });

  after(async () => {
    // Clean up after all tests
    await cleanupTestDirectories();
  });

  beforeEach(() => {
    contextManager = new ContextManager(TEST_SESSION_ID, TEST_ROLE);
  });

  afterEach(async () => {
    // Clean up between tests
    await cleanupTestDirectories();
  });

  describe('Constructor', () => {
    it('should initialize with session ID and role', () => {
      assert.strictEqual(contextManager.sessionId, TEST_SESSION_ID);
      assert.strictEqual(contextManager.role, TEST_ROLE);
      assert.strictEqual(contextManager.tokenCount, 0);
      assert.ok(contextManager.lastCheckpoint);
      assert.ok(contextManager.stateFile.includes(TEST_SESSION_ID));
    });

    it('should set correct state file path', () => {
      assert.strictEqual(contextManager.stateFile, path.join(STATE_DIR, `${TEST_SESSION_ID}.json`));
    });
  });

  describe('estimateTokens()', () => {
    it('should estimate tokens for empty string', () => {
      const tokens = contextManager.estimateTokens('');
      assert.strictEqual(tokens, 0);
    });

    it('should estimate tokens for short text', () => {
      const text = 'Hello';
      const tokens = contextManager.estimateTokens(text);
      assert.strictEqual(tokens, Math.ceil(text.length / 4));
    });

    it('should estimate tokens for long text', () => {
      const text = 'a'.repeat(1000);
      const tokens = contextManager.estimateTokens(text);
      assert.strictEqual(tokens, 250); // 1000 / 4
    });

    it('should round up fractional tokens', () => {
      const text = 'abc'; // 3 chars = 0.75 tokens, should round to 1
      const tokens = contextManager.estimateTokens(text);
      assert.strictEqual(tokens, 1);
    });

    it('should handle unicode characters', () => {
      const text = '🚀🚀🚀'; // Each emoji is multiple bytes
      const tokens = contextManager.estimateTokens(text);
      assert.ok(tokens > 0);
    });
  });

  describe('updateTokenCount()', () => {
    it('should update token count with positive value', () => {
      contextManager.updateTokenCount(100);
      assert.strictEqual(contextManager.tokenCount, 100);
    });

    it('should accumulate token counts', () => {
      contextManager.updateTokenCount(100);
      contextManager.updateTokenCount(50);
      contextManager.updateTokenCount(25);
      assert.strictEqual(contextManager.tokenCount, 175);
    });

    it('should handle zero tokens', () => {
      contextManager.updateTokenCount(0);
      assert.strictEqual(contextManager.tokenCount, 0);
    });

    it('should handle negative values (decrement)', () => {
      contextManager.tokenCount = 100;
      contextManager.updateTokenCount(-50);
      assert.strictEqual(contextManager.tokenCount, 50);
    });

    it('should not trigger compression below threshold', () => {
      contextManager.updateTokenCount(100000); // Below 160000
      assert.strictEqual(contextManager.tokenCount, 100000);
    });

    it('should trigger compression at compression threshold', async () => {
      // Set token count just below threshold
      contextManager.tokenCount = 159999;

      // This should trigger compression
      contextManager.updateTokenCount(1);

      // Give async compression time to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Token count should be reduced (20% of 160000 = 32000)
      assert.ok(contextManager.tokenCount < 160000);
    });

    it('should trigger handoff at critical threshold', async () => {
      // Set token count just below critical
      contextManager.tokenCount = 179999;

      // This should trigger handoff
      contextManager.updateTokenCount(1);

      // Give async handoff time to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Check handoff file was created
      const handoffFiles = await getFilesInDir(HANDOFF_DIR);
      assert.ok(handoffFiles.length > 0);
    });
  });

  describe('getStatus()', () => {
    it('should return "healthy" for low token count', () => {
      contextManager.tokenCount = 100000;
      assert.strictEqual(contextManager.getStatus(), 'healthy');
    });

    it('should return "healthy" at boundary', () => {
      contextManager.tokenCount = 159999;
      assert.strictEqual(contextManager.getStatus(), 'healthy');
    });

    it('should return "warning" at compression threshold', () => {
      contextManager.tokenCount = 160000;
      assert.strictEqual(contextManager.getStatus(), 'warning');
    });

    it('should return "warning" between thresholds', () => {
      contextManager.tokenCount = 170000;
      assert.strictEqual(contextManager.getStatus(), 'warning');
    });

    it('should return "critical" at critical threshold', () => {
      contextManager.tokenCount = 180000;
      assert.strictEqual(contextManager.getStatus(), 'critical');
    });

    it('should return "critical" above critical threshold', () => {
      contextManager.tokenCount = 190000;
      assert.strictEqual(contextManager.getStatus(), 'critical');
    });
  });

  describe('saveState()', () => {
    it('should save state to disk', async () => {
      const currentTask = { description: 'Test task', progress: 50 };
      const criticalState = { key: 'value' };
      const nextSteps = ['Step 1', 'Step 2'];
      const filesModified = ['file1.js', 'file2.js'];
      const decisions = [{ timestamp: new Date().toISOString(), decision: 'Test decision' }];

      await contextManager.saveState(
        currentTask,
        criticalState,
        nextSteps,
        filesModified,
        decisions
      );

      // Verify file exists
      const fileExists = fsSync.existsSync(contextManager.stateFile);
      assert.ok(fileExists);

      // Verify content
      const content = await fs.readFile(contextManager.stateFile, 'utf-8');
      const state = JSON.parse(content);

      assert.strictEqual(state.sessionId, TEST_SESSION_ID);
      assert.strictEqual(state.role, TEST_ROLE);
      assert.deepStrictEqual(state.currentTask, currentTask);
      assert.deepStrictEqual(state.criticalState, criticalState);
      assert.deepStrictEqual(state.nextSteps, nextSteps);
      assert.deepStrictEqual(state.filesModified, filesModified);
      assert.deepStrictEqual(state.decisions, decisions);
      assert.ok(state.lastUpdate);
      assert.ok(state.context);
    });

    it('should include context metadata in saved state', async () => {
      contextManager.tokenCount = 150000;

      await contextManager.saveState({ description: 'Test' }, {}, [], [], []);

      const content = await fs.readFile(contextManager.stateFile, 'utf-8');
      const state = JSON.parse(content);

      assert.strictEqual(state.context.estimatedTokens, 150000);
      assert.strictEqual(state.context.status, 'healthy');
      assert.strictEqual(state.context.compressionNeeded, false);
      assert.ok(state.context.warningThreshold);
      assert.ok(state.context.criticalThreshold);
    });

    it('should indicate compression needed when above threshold', async () => {
      contextManager.tokenCount = 170000;

      await contextManager.saveState({}, {}, [], [], []);

      const content = await fs.readFile(contextManager.stateFile, 'utf-8');
      const state = JSON.parse(content);

      assert.strictEqual(state.context.compressionNeeded, true);
      assert.strictEqual(state.context.status, 'warning');
    });

    it('should create STATE_DIR if it does not exist', async () => {
      await cleanupTestDirectories();

      await contextManager.saveState({}, {}, [], [], []);

      const dirExists = fsSync.existsSync(STATE_DIR);
      assert.ok(dirExists);
    });

    it('should handle empty arrays and objects', async () => {
      await contextManager.saveState({}, {}, [], [], []);

      const content = await fs.readFile(contextManager.stateFile, 'utf-8');
      const state = JSON.parse(content);

      assert.deepStrictEqual(state.currentTask, {});
      assert.deepStrictEqual(state.criticalState, {});
      assert.deepStrictEqual(state.nextSteps, []);
      assert.deepStrictEqual(state.filesModified, []);
      assert.deepStrictEqual(state.decisions, []);
    });

    it('should handle null values gracefully', async () => {
      await contextManager.saveState(null, null, null, null, null);

      const content = await fs.readFile(contextManager.stateFile, 'utf-8');
      const state = JSON.parse(content);

      assert.strictEqual(state.currentTask, null);
      assert.strictEqual(state.criticalState, null);
      assert.strictEqual(state.nextSteps, null);
      assert.strictEqual(state.filesModified, null);
      assert.strictEqual(state.decisions, null);
    });
  });

  describe('loadState()', () => {
    it('should load previously saved state', async () => {
      const testState = {
        description: 'Test task',
        progress: 75,
      };

      contextManager.tokenCount = 120000;
      await contextManager.saveState(testState, {}, [], [], []);

      // Create new instance and load
      const newManager = new ContextManager(TEST_SESSION_ID, TEST_ROLE);
      const loadedState = await newManager.loadState();

      assert.ok(loadedState);
      assert.strictEqual(loadedState.sessionId, TEST_SESSION_ID);
      assert.strictEqual(loadedState.role, TEST_ROLE);
      assert.deepStrictEqual(loadedState.currentTask, testState);
      assert.strictEqual(newManager.tokenCount, 120000);
    });

    it('should return null if state file does not exist', async () => {
      const newManager = new ContextManager('non-existent-session', 'test');
      const state = await newManager.loadState();

      assert.strictEqual(state, null);
      assert.strictEqual(newManager.tokenCount, 0);
    });

    it('should handle corrupted state file', async () => {
      await fs.mkdir(STATE_DIR, { recursive: true });
      await fs.writeFile(contextManager.stateFile, 'invalid json content');

      const state = await contextManager.loadState();
      assert.strictEqual(state, null);
    });

    it('should restore token count from loaded state', async () => {
      contextManager.tokenCount = 175000;
      await contextManager.saveState({}, {}, [], [], []);

      contextManager.tokenCount = 0; // Reset
      await contextManager.loadState();

      assert.strictEqual(contextManager.tokenCount, 175000);
    });

    it('should default to 0 tokens if context not in state', async () => {
      const minimalState = {
        sessionId: TEST_SESSION_ID,
        role: TEST_ROLE,
      };

      await fs.mkdir(STATE_DIR, { recursive: true });
      await fs.writeFile(contextManager.stateFile, JSON.stringify(minimalState));

      await contextManager.loadState();
      assert.strictEqual(contextManager.tokenCount, 0);
    });
  });

  describe('compressContext()', () => {
    it('should create compression summary file', async () => {
      contextManager.tokenCount = 170000;
      await contextManager.compressContext();

      const historyPath = path.join(HISTORY_DIR, TEST_SESSION_ID);
      const files = await getFilesInDir(historyPath);

      assert.strictEqual(files.length, 1);
      assert.ok(files[0].endsWith('-summary.md'));
    });

    it('should reduce token count to 20%', async () => {
      contextManager.tokenCount = 170000;
      await contextManager.compressContext();

      assert.strictEqual(contextManager.tokenCount, 34000); // 170000 * 0.2
    });

    it('should update state file after compression', async () => {
      contextManager.tokenCount = 170000;
      await contextManager.compressContext();

      const content = await fs.readFile(contextManager.stateFile, 'utf-8');
      const state = JSON.parse(content);

      assert.ok(state.currentTask.description.includes('compressed'));
      assert.strictEqual(state.currentTask.progress, 100);
    });

    it('should include session info in summary', async () => {
      contextManager.tokenCount = 165000;
      await contextManager.compressContext();

      const historyPath = path.join(HISTORY_DIR, TEST_SESSION_ID);
      const files = await getFilesInDir(historyPath);
      const summaryContent = await fs.readFile(path.join(historyPath, files[0]), 'utf-8');

      assert.ok(summaryContent.includes(TEST_SESSION_ID));
      assert.ok(summaryContent.includes(TEST_ROLE));
      assert.ok(summaryContent.includes('165000'));
      assert.ok(summaryContent.includes('Context Compression'));
    });

    it('should handle multiple compressions', async () => {
      contextManager.tokenCount = 170000;
      await contextManager.compressContext();

      await new Promise((resolve) => setTimeout(resolve, 10));

      contextManager.tokenCount = 170000;
      await contextManager.compressContext();

      const historyPath = path.join(HISTORY_DIR, TEST_SESSION_ID);
      const files = await getFilesInDir(historyPath);

      assert.strictEqual(files.length, 2);
    });

    it('should create history directory if not exists', async () => {
      await cleanupTestDirectories();

      contextManager.tokenCount = 170000;
      await contextManager.compressContext();

      const dirExists = fsSync.existsSync(path.join(HISTORY_DIR, TEST_SESSION_ID));
      assert.ok(dirExists);
    });
  });

  describe('initiateHandoff()', () => {
    it('should create handoff document', async () => {
      await contextManager.saveState(
        { description: 'Active task', progress: 60 },
        { passcode: 'test123' },
        ['Step 1', 'Step 2'],
        ['file1.js', 'file2.js'],
        []
      );

      const handoffFile = await contextManager.initiateHandoff();

      assert.ok(handoffFile);
      // Normalize paths for cross-platform compatibility
      const normalizedHandoffFile = handoffFile.replace(/\\/g, '/');
      assert.ok(normalizedHandoffFile.includes(HANDOFF_DIR));

      const fileExists = fsSync.existsSync(handoffFile);
      assert.ok(fileExists);
    });

    it('should include session context in handoff', async () => {
      contextManager.tokenCount = 185000;
      await contextManager.saveState(
        { description: 'Critical task' },
        { passcode: 'abc123' },
        ['Next step'],
        ['modified.js'],
        []
      );

      const handoffFile = await contextManager.initiateHandoff();
      const content = await fs.readFile(handoffFile, 'utf-8');

      assert.ok(content.includes(TEST_SESSION_ID));
      assert.ok(content.includes(TEST_ROLE));
      assert.ok(content.includes('185000'));
      assert.ok(content.includes('Critical task'));
      assert.ok(content.includes('Next step'));
      assert.ok(content.includes('modified.js'));
    });

    it('should include recovery instructions', async () => {
      await contextManager.saveState({}, {}, [], [], []);
      const handoffFile = await contextManager.initiateHandoff();
      const content = await fs.readFile(handoffFile, 'utf-8');

      assert.ok(content.includes('Recovery Instructions'));
      assert.ok(content.includes('Read this handoff document'));
      assert.ok(content.includes('Load SESSION-STATE'));
      assert.ok(content.includes('TASK-QUEUE.json'));
    });

    it('should handle empty state gracefully', async () => {
      // Create coordination file to prevent error logs
      await fs.mkdir('.agent-locks', { recursive: true });
      await fs.writeFile(COORD_FILE, JSON.stringify({ sessions: {} }));

      const handoffFile = await contextManager.initiateHandoff();
      const content = await fs.readFile(handoffFile, 'utf-8');

      assert.ok(content.includes('Session Handoff'));
      assert.ok(content.includes(TEST_SESSION_ID));
    });

    it('should update coordination status', async () => {
      // Create coordination file first
      await fs.mkdir('.agent-locks', { recursive: true });
      await fs.writeFile(COORD_FILE, JSON.stringify({ sessions: {} }));

      await contextManager.saveState({}, {}, [], [], []);
      await contextManager.initiateHandoff();

      const coordContent = await fs.readFile(COORD_FILE, 'utf-8');
      const coord = JSON.parse(coordContent);

      assert.ok(coord.sessions[TEST_SESSION_ID]);
      assert.strictEqual(coord.sessions[TEST_SESSION_ID].status, 'CONTEXT_FULL');
      assert.ok(coord.sessions[TEST_SESSION_ID].handoffFile);
    });

    it('should return handoff file path', async () => {
      const handoffFile = await contextManager.initiateHandoff();

      assert.ok(typeof handoffFile === 'string');
      assert.ok(handoffFile.includes(TEST_SESSION_ID));
      assert.ok(handoffFile.endsWith('.md'));
    });
  });

  describe('createCheckpoint()', () => {
    it('should create checkpoint when conditions met', async () => {
      // Force checkpoint by setting lastCheckpoint to old time
      contextManager.lastCheckpoint = Date.now() - 31 * 60 * 1000; // 31 minutes ago
      contextManager.tokenCount = 100000;

      await contextManager.saveState({}, {}, [], [], []);
      await contextManager.createCheckpoint();

      const files = await getFilesInDir(CHECKPOINT_DIR);
      assert.ok(files.length > 0);
    });

    it('should not create checkpoint too frequently', async () => {
      contextManager.lastCheckpoint = Date.now();
      contextManager.tokenCount = 100000;

      await contextManager.saveState({}, {}, [], [], []);
      await contextManager.createCheckpoint();

      // Should not create checkpoint
      const dirExists = fsSync.existsSync(CHECKPOINT_DIR);
      assert.ok(!dirExists || (await getFilesInDir(CHECKPOINT_DIR)).length === 0);
    });

    it('should update lastCheckpoint after creation', async () => {
      const oldCheckpoint = Date.now() - 31 * 60 * 1000;
      contextManager.lastCheckpoint = oldCheckpoint;
      contextManager.tokenCount = 100000;

      await contextManager.saveState({}, {}, [], [], []);
      await contextManager.createCheckpoint();

      assert.ok(contextManager.lastCheckpoint > oldCheckpoint);
    });

    it('should include full state in checkpoint', async () => {
      contextManager.lastCheckpoint = Date.now() - 31 * 60 * 1000;
      contextManager.tokenCount = 120000;

      await contextManager.saveState(
        { description: 'Checkpoint test' },
        {},
        ['Step 1'],
        ['file.js'],
        []
      );
      await contextManager.createCheckpoint();

      const files = await getFilesInDir(CHECKPOINT_DIR);
      const checkpointContent = await fs.readFile(path.join(CHECKPOINT_DIR, files[0]), 'utf-8');
      const checkpoint = JSON.parse(checkpointContent);

      assert.strictEqual(checkpoint.sessionId, TEST_SESSION_ID);
      assert.strictEqual(checkpoint.role, TEST_ROLE);
      assert.strictEqual(checkpoint.context.estimatedTokens, 120000);
      assert.deepStrictEqual(checkpoint.currentTask, { description: 'Checkpoint test' });
    });
  });

  describe('updateCoordinationStatus()', () => {
    beforeEach(async () => {
      // Create coordination file
      await fs.mkdir('.agent-locks', { recursive: true });
      await fs.writeFile(COORD_FILE, JSON.stringify({ sessions: {} }));
    });

    it('should create session entry if not exists', async () => {
      await contextManager.updateCoordinationStatus('healthy');

      const content = await fs.readFile(COORD_FILE, 'utf-8');
      const coord = JSON.parse(content);

      assert.ok(coord.sessions[TEST_SESSION_ID]);
      assert.strictEqual(coord.sessions[TEST_SESSION_ID].status, 'healthy');
    });

    it('should update existing session', async () => {
      await contextManager.updateCoordinationStatus('healthy');
      contextManager.tokenCount = 180000;
      await contextManager.updateCoordinationStatus('critical');

      const content = await fs.readFile(COORD_FILE, 'utf-8');
      const coord = JSON.parse(content);

      assert.strictEqual(coord.sessions[TEST_SESSION_ID].status, 'critical');
      assert.strictEqual(coord.sessions[TEST_SESSION_ID].tokenCount, 180000);
    });

    it('should include handoff file when provided', async () => {
      const handoffPath = '/path/to/handoff.md';
      await contextManager.updateCoordinationStatus('CONTEXT_FULL', handoffPath);

      const content = await fs.readFile(COORD_FILE, 'utf-8');
      const coord = JSON.parse(content);

      assert.strictEqual(coord.sessions[TEST_SESSION_ID].handoffFile, handoffPath);
    });

    it('should update timestamp', async () => {
      await contextManager.updateCoordinationStatus('healthy');

      const content = await fs.readFile(COORD_FILE, 'utf-8');
      const coord = JSON.parse(content);

      assert.ok(coord.sessions[TEST_SESSION_ID].lastUpdate);

      const timestamp = new Date(coord.sessions[TEST_SESSION_ID].lastUpdate);
      assert.ok(timestamp instanceof Date);
      assert.ok(!isNaN(timestamp.getTime()));
    });

    it('should handle missing coordination file gracefully', async () => {
      await fs.unlink(COORD_FILE).catch(() => {});

      // Should not throw
      await contextManager.updateCoordinationStatus('healthy');
    });
  });

  describe('healthCheck()', () => {
    beforeEach(async () => {
      // Create coordination file
      await fs.mkdir('.agent-locks', { recursive: true });
      await fs.writeFile(COORD_FILE, JSON.stringify({ sessions: {} }));
    });

    it('should return health status object', async () => {
      contextManager.tokenCount = 100000;
      const health = await contextManager.healthCheck();

      assert.ok(health);
      assert.strictEqual(health.sessionId, TEST_SESSION_ID);
      assert.strictEqual(health.role, TEST_ROLE);
      assert.strictEqual(health.status, 'healthy');
      assert.strictEqual(health.tokenCount, 100000);
      assert.strictEqual(health.healthy, true);
    });

    it('should report unhealthy at warning threshold', async () => {
      contextManager.tokenCount = 170000;
      const health = await contextManager.healthCheck();

      assert.strictEqual(health.status, 'warning');
      assert.strictEqual(health.healthy, false);
    });

    it('should report unhealthy at critical threshold', async () => {
      contextManager.tokenCount = 185000;
      const health = await contextManager.healthCheck();

      assert.strictEqual(health.status, 'critical');
      assert.strictEqual(health.healthy, false);
    });

    it('should update coordination status', async () => {
      contextManager.tokenCount = 150000;
      await contextManager.healthCheck();

      const content = await fs.readFile(COORD_FILE, 'utf-8');
      const coord = JSON.parse(content);

      assert.strictEqual(coord.sessions[TEST_SESSION_ID].status, 'healthy');
      assert.strictEqual(coord.sessions[TEST_SESSION_ID].tokenCount, 150000);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete workflow: save -> load -> compress -> handoff', async () => {
      // Initial save
      contextManager.tokenCount = 100000;
      await contextManager.saveState(
        { description: 'Initial task', progress: 30 },
        { key: 'value' },
        ['Step 1', 'Step 2'],
        ['file1.js'],
        []
      );

      // Load in new instance
      const manager2 = new ContextManager(TEST_SESSION_ID, TEST_ROLE);
      const loaded = await manager2.loadState();
      assert.strictEqual(loaded.currentTask.description, 'Initial task');
      assert.strictEqual(manager2.tokenCount, 100000);

      // Trigger compression
      manager2.tokenCount = 170000;
      await manager2.compressContext();
      assert.strictEqual(manager2.tokenCount, 34000);

      // Verify compression history exists
      const historyFiles = await getFilesInDir(path.join(HISTORY_DIR, TEST_SESSION_ID));
      assert.ok(historyFiles.length > 0);

      // Trigger handoff
      manager2.tokenCount = 185000;
      const handoffFile = await manager2.initiateHandoff();
      assert.ok(handoffFile);

      // Verify handoff file exists
      const fileExists = fsSync.existsSync(handoffFile);
      assert.ok(fileExists);
    });

    it('should maintain consistency across multiple operations', async () => {
      // Multiple saves
      for (let i = 0; i < 5; i++) {
        contextManager.tokenCount = 100000 + i * 10000;
        await contextManager.saveState(
          { description: `Task ${i}`, progress: i * 20 },
          {},
          [`Step ${i}`],
          [`file${i}.js`],
          []
        );
      }

      // Load latest
      const loaded = await contextManager.loadState();
      assert.strictEqual(loaded.currentTask.description, 'Task 4');
      assert.strictEqual(contextManager.tokenCount, 140000);
    });

    it('should handle rapid token updates with threshold transitions', async () => {
      const updates = [
        50000, // healthy
        50000, // healthy (100k)
        50000, // healthy (150k)
        10000, // warning (160k) - triggers compression
        10000, // healthy after compression (~32k)
        50000, // healthy (82k)
        100000, // warning (182k)
      ];

      for (const update of updates) {
        contextManager.updateTokenCount(update);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // Should have compressed at least once
      const historyFiles = await getFilesInDir(path.join(HISTORY_DIR, TEST_SESSION_ID));
      assert.ok(historyFiles.length >= 1);
    });
  });
});

// Helper functions
async function cleanupTestDirectories() {
  const dirs = [STATE_DIR, HISTORY_DIR, HANDOFF_DIR, CHECKPOINT_DIR, '.agent-locks'];

  for (const dir of dirs) {
    try {
      if (fsSync.existsSync(dir)) {
        await fs.rm(dir, { recursive: true, force: true });
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

async function getFilesInDir(dirPath) {
  try {
    if (!fsSync.existsSync(dirPath)) {
      return [];
    }
    return await fs.readdir(dirPath);
  } catch (error) {
    return [];
  }
}
