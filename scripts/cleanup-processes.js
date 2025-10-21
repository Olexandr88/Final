#!/usr/bin/env node
/**
 * Process Cleanup Utility
 * Kills zombie Node.js processes and cleans up test artifacts
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { unlinkSync, existsSync, readdirSync, statSync, rmSync } from 'fs';
import { join } from 'path';

const execAsync = promisify(exec);

const isWindows = process.platform === 'win32';

async function killNodeProcesses() {
  console.log('🔍 Scanning for zombie Node processes...');

  try {
    if (isWindows) {
      // Kill all node.exe except the current process
      const currentPid = process.pid;
      const { stdout } = await execAsync('tasklist | findstr node.exe');
      const processes = stdout.split('\n').filter((line) => line.includes('node.exe'));

      console.log(`Found ${processes.length} Node processes`);

      for (const proc of processes) {
        const match = proc.match(/node\.exe\s+(\d+)/);
        if (match) {
          const pid = parseInt(match[1]);
          if (pid !== currentPid) {
            try {
              await execAsync(`taskkill //F //PID ${pid}`);
              console.log(`✓ Killed process ${pid}`);
            } catch (err) {
              // Process already dead, ignore
            }
          }
        }
      }
    } else {
      // Unix-like systems
      const { stdout } = await execAsync(`ps aux | grep node | grep -v grep`);
      const processes = stdout.split('\n').filter((line) => line.trim());

      console.log(`Found ${processes.length} Node processes`);

      for (const proc of processes) {
        const parts = proc.trim().split(/\s+/);
        const pid = parseInt(parts[1]);
        if (pid !== process.pid) {
          try {
            await execAsync(`kill -9 ${pid}`);
            console.log(`✓ Killed process ${pid}`);
          } catch (err) {
            // Process already dead, ignore
          }
        }
      }
    }
  } catch (error) {
    console.error('Error killing processes:', error.message);
  }
}

function cleanupTestArtifacts() {
  console.log('\n🧹 Cleaning up test artifacts...');

  const artifacts = [
    '.claude-sessions',
    'tests/.test-sessions',
    'test-output.txt',
    'test-results.txt',
    'test-pid.txt',
    'test-final.txt',
    'test-run-output.txt',
    'test_output.txt',
  ];

  let cleaned = 0;

  for (const artifact of artifacts) {
    if (existsSync(artifact)) {
      try {
        const stats = statSync(artifact);
        if (stats.isDirectory()) {
          rmSync(artifact, { recursive: true, force: true });
        } else {
          unlinkSync(artifact);
        }
        console.log(`✓ Removed ${artifact}`);
        cleaned++;
      } catch (err) {
        console.warn(`⚠ Could not remove ${artifact}: ${err.message}`);
      }
    }
  }

  console.log(`\n✅ Cleaned ${cleaned} artifacts`);
}

function cleanupTempFiles() {
  console.log('\n🗑️  Cleaning temporary files...');

  const tempPatterns = ['variableContent', 'NUL', '*.tmp', '*.log.old'];

  let cleaned = 0;

  for (const pattern of tempPatterns) {
    if (existsSync(pattern)) {
      try {
        unlinkSync(pattern);
        console.log(`✓ Removed ${pattern}`);
        cleaned++;
      } catch (err) {
        // Ignore
      }
    }
  }

  console.log(`✅ Cleaned ${cleaned} temp files`);
}

async function main() {
  console.log('🚀 Starting cleanup process...\n');

  await killNodeProcesses();
  cleanupTestArtifacts();
  cleanupTempFiles();

  console.log('\n✨ Cleanup complete!\n');
}

main().catch((err) => {
  console.error('❌ Cleanup failed:', err);
  process.exit(1);
});
