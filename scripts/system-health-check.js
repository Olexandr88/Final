#!/usr/bin/env node
/**
 * System Health Check Utility
 * Inspired by shell one-liners for process monitoring and network diagnostics
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);
const isWindows = process.platform === 'win32';

class SystemHealthCheck {
  constructor() {
    this.checks = [];
    this.results = {};
  }

  /**
   * Check for port conflicts (inspired by: lsof -i -P | grep -i "listen")
   */
  async checkPortConflicts(ports = [3000, 8080, 9567, 65028, 65029]) {
    console.log('\n🔍 Checking port availability...');
    const conflicts = [];

    try {
      if (isWindows) {
        const { stdout } = await execAsync('netstat -ano | findstr LISTENING');
        const lines = stdout.split('\n');

        for (const port of ports) {
          const inUse = lines.some(line => line.includes(`:${port} `));
          if (inUse) {
            const match = lines.find(line => line.includes(`:${port} `));
            const pid = match?.trim().split(/\s+/).pop();
            conflicts.push({ port, pid });
            console.log(`  ⚠️  Port ${port} in use by PID ${pid}`);
          } else {
            console.log(`  ✓ Port ${port} available`);
          }
        }
      } else {
        // Unix: lsof -i -P | grep LISTEN
        for (const port of ports) {
          try {
            const { stdout } = await execAsync(`lsof -i :${port} -P | grep LISTEN`);
            const pid = stdout.split(/\s+/)[1];
            conflicts.push({ port, pid });
            console.log(`  ⚠️  Port ${port} in use by PID ${pid}`);
          } catch {
            console.log(`  ✓ Port ${port} available`);
          }
        }
      }
    } catch (error) {
      console.error(`  ❌ Error checking ports: ${error.message}`);
    }

    this.results.portConflicts = conflicts;
    return conflicts;
  }

  /**
   * Check Node.js process count (inspired by: ps auxw | grep node)
   */
  async checkNodeProcesses() {
    console.log('\n🔍 Checking Node.js processes...');

    try {
      if (isWindows) {
        const { stdout } = await execAsync('tasklist | findstr node.exe');
        const processes = stdout.split('\n').filter(line => line.includes('node.exe'));
        console.log(`  Found ${processes.length} Node.js processes`);

        if (processes.length > 10) {
          console.log(`  ⚠️  High process count (${processes.length}) - consider running cleanup`);
        } else {
          console.log(`  ✓ Process count normal`);
        }

        this.results.nodeProcessCount = processes.length;
      } else {
        const { stdout } = await execAsync('ps aux | grep node | grep -v grep | wc -l');
        const count = parseInt(stdout.trim());
        console.log(`  Found ${count} Node.js processes`);

        if (count > 10) {
          console.log(`  ⚠️  High process count (${count}) - consider running cleanup`);
        } else {
          console.log(`  ✓ Process count normal`);
        }

        this.results.nodeProcessCount = count;
      }
    } catch (error) {
      console.error(`  ❌ Error checking processes: ${error.message}`);
    }
  }

  /**
   * Check system memory (inspired by: vmstat, free)
   */
  async checkMemory() {
    console.log('\n🔍 Checking system memory...');

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const usedPercent = ((usedMem / totalMem) * 100).toFixed(2);

    console.log(`  Total: ${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB`);
    console.log(`  Used: ${(usedMem / 1024 / 1024 / 1024).toFixed(2)} GB (${usedPercent}%)`);
    console.log(`  Free: ${(freeMem / 1024 / 1024 / 1024).toFixed(2)} GB`);

    if (usedPercent > 90) {
      console.log(`  ⚠️  High memory usage (${usedPercent}%)`);
    } else if (usedPercent > 75) {
      console.log(`  ⚠️  Moderate memory usage (${usedPercent}%)`);
    } else {
      console.log(`  ✓ Memory usage normal`);
    }

    this.results.memory = {
      total: totalMem,
      used: usedMem,
      free: freeMem,
      usedPercent: parseFloat(usedPercent)
    };
  }

  /**
   * Check disk space (inspired by: df -h)
   */
  async checkDiskSpace() {
    console.log('\n🔍 Checking disk space...');

    try {
      if (isWindows) {
        try {
          const { stdout } = await execAsync('wmic logicaldisk get size,freespace,caption');
          console.log('  ' + stdout.split('\n').slice(0, 3).join('\n  '));
        } catch {
          // Fallback for systems without wmic
          const { stdout } = await execAsync('fsutil volume diskfree C:');
          console.log('  ' + stdout.split('\n')[0]);
          console.log('  ✓ Disk space check completed');
        }
      } else {
        const { stdout } = await execAsync('df -h / | tail -1');
        const parts = stdout.trim().split(/\s+/);
        const usedPercent = parseInt(parts[4]);

        console.log(`  Disk usage: ${parts[4]} (${parts[2]} used of ${parts[1]})`);

        if (usedPercent > 90) {
          console.log(`  ⚠️  Low disk space (${usedPercent}% used)`);
        } else {
          console.log(`  ✓ Disk space sufficient`);
        }

        this.results.diskUsedPercent = usedPercent;
      }
    } catch (error) {
      console.error(`  ❌ Error checking disk: ${error.message}`);
    }
  }

  /**
   * Check network connectivity (inspired by: curl -Iks)
   */
  async checkNetworkConnectivity(hosts = ['8.8.8.8', '1.1.1.1']) {
    console.log('\n🔍 Checking network connectivity...');

    for (const host of hosts) {
      try {
        const cmd = isWindows ? `ping -n 1 ${host}` : `ping -c 1 ${host}`;
        await execAsync(cmd);
        console.log(`  ✓ ${host} reachable`);
      } catch {
        console.log(`  ❌ ${host} unreachable`);
      }
    }
  }

  /**
   * Check for zombie processes (inspired by: ps aux | awk '$8 ~ /Z/')
   */
  async checkZombieProcesses() {
    if (isWindows) {
      return; // Windows doesn't have zombie processes in the Unix sense
    }

    console.log('\n🔍 Checking for zombie processes...');

    try {
      const { stdout } = await execAsync("ps aux | awk '$8 ~ /Z/' | wc -l");
      const zombieCount = parseInt(stdout.trim());

      if (zombieCount > 0) {
        console.log(`  ⚠️  Found ${zombieCount} zombie processes`);
        const { stdout: zombies } = await execAsync("ps aux | awk '$8 ~ /Z/'");
        console.log(zombies);
      } else {
        console.log(`  ✓ No zombie processes`);
      }

      this.results.zombieProcesses = zombieCount;
    } catch (error) {
      console.error(`  ❌ Error checking zombies: ${error.message}`);
    }
  }

  /**
   * Check test artifacts (inspired by: find . -type f -mtime +7)
   */
  async checkTestArtifacts() {
    console.log('\n🔍 Checking for test artifacts...');

    const artifacts = [
      '.claude-sessions',
      'tests/.test-sessions',
      'test-output.txt',
      'test-results.txt'
    ];

    const { existsSync, statSync } = await import('fs');
    const foundArtifacts = [];

    for (const artifact of artifacts) {
      if (existsSync(artifact)) {
        const stats = statSync(artifact);
        const ageDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
        foundArtifacts.push({ artifact, ageDays: ageDays.toFixed(1) });

        if (ageDays > 7) {
          console.log(`  ⚠️  ${artifact} (${ageDays.toFixed(1)} days old)`);
        } else {
          console.log(`  • ${artifact} (${ageDays.toFixed(1)} days old)`);
        }
      }
    }

    if (foundArtifacts.length === 0) {
      console.log(`  ✓ No test artifacts found`);
    }

    this.results.testArtifacts = foundArtifacts;
  }

  /**
   * Run all health checks
   */
  async runAll() {
    console.log('🏥 System Health Check');
    console.log('═'.repeat(60));

    await this.checkNodeProcesses();
    await this.checkPortConflicts();
    await this.checkMemory();
    await this.checkDiskSpace();
    await this.checkNetworkConnectivity();
    await this.checkZombieProcesses();
    await this.checkTestArtifacts();

    console.log('\n' + '═'.repeat(60));
    console.log('📊 Health Check Summary');
    console.log('═'.repeat(60));

    const warnings = [];

    if (this.results.nodeProcessCount > 10) {
      warnings.push(`High Node.js process count (${this.results.nodeProcessCount})`);
    }

    if (this.results.portConflicts?.length > 0) {
      warnings.push(`Port conflicts: ${this.results.portConflicts.map(c => c.port).join(', ')}`);
    }

    if (this.results.memory?.usedPercent > 75) {
      warnings.push(`High memory usage (${this.results.memory.usedPercent}%)`);
    }

    if (this.results.zombieProcesses > 0) {
      warnings.push(`Zombie processes detected (${this.results.zombieProcesses})`);
    }

    if (warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      warnings.forEach(w => console.log(`  • ${w}`));
      console.log('\n💡 Run: npm run cleanup');
    } else {
      console.log('\n✅ All systems healthy!');
    }

    return this.results;
  }
}

// CLI execution
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename || process.argv[1].endsWith('system-health-check.js')) {
  const checker = new SystemHealthCheck();
  checker.runAll().catch(err => {
    console.error('Health check failed:', err);
    process.exit(1);
  });
}

export default SystemHealthCheck;
