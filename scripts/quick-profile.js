#!/usr/bin/env node
/**
 * Quick Performance Profiler
 * Inspired by: top, vmstat, iostat, ps patterns from shell one-liners
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import { performance } from 'perf_hooks';

const execAsync = promisify(exec);
const isWindows = process.platform === 'win32';

class QuickProfiler {
  constructor() {
    this.samples = [];
    this.startTime = Date.now();
  }

  /**
   * Get CPU usage per process (inspired by: ps hax -o user | sort | uniq -c)
   */
  async getCPUStats() {
    const cpus = os.cpus();
    const load = os.loadavg();

    return {
      cores: cpus.length,
      model: cpus[0].model,
      speed: cpus[0].speed,
      loadAvg1m: load[0],
      loadAvg5m: load[1],
      loadAvg15m: load[2],
      usage: cpus.map((cpu, i) => {
        const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
        const idle = cpu.times.idle;
        const usage = (((total - idle) / total) * 100).toFixed(2);
        return { core: i, usage: parseFloat(usage) };
      }),
    };
  }

  /**
   * Get memory statistics (inspired by: vmstat)
   */
  getMemoryStats() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;

    return {
      total: total,
      free: free,
      used: used,
      usedPercent: ((used / total) * 100).toFixed(2),
      totalGB: (total / 1024 / 1024 / 1024).toFixed(2),
      usedGB: (used / 1024 / 1024 / 1024).toFixed(2),
      freeGB: (free / 1024 / 1024 / 1024).toFixed(2),
    };
  }

  /**
   * Get process memory (inspired by: ps aux --sort=-rss | head)
   */
  async getTopProcessesByMemory(limit = 10) {
    try {
      if (isWindows) {
        const { stdout } = await execAsync('tasklist /FO CSV /NH | sort /R');
        const lines = stdout.split('\n').slice(0, limit);
        return lines.map((line) => {
          const parts = line.replace(/"/g, '').split(',');
          return {
            name: parts[0],
            pid: parts[1],
            mem: parts[4],
          };
        });
      } else {
        const { stdout } = await execAsync(
          `ps aux --sort=-rss | head -${limit + 1} | tail -${limit}`
        );
        return stdout.split('\n').map((line) => {
          const parts = line.trim().split(/\s+/);
          return {
            user: parts[0],
            pid: parts[1],
            cpu: parts[2],
            mem: parts[3],
            command: parts[10],
          };
        });
      }
    } catch (error) {
      return [];
    }
  }

  /**
   * Sample system metrics
   */
  async sample() {
    const timestamp = Date.now();
    const cpu = await this.getCPUStats();
    const memory = this.getMemoryStats();

    const sample = {
      timestamp,
      cpu,
      memory,
    };

    this.samples.push(sample);
    return sample;
  }

  /**
   * Display real-time stats (inspired by: top)
   */
  displayStats(sample) {
    console.clear();
    console.log('⚡ Quick System Profile');
    console.log('═'.repeat(70));
    console.log(`Time: ${new Date(sample.timestamp).toLocaleTimeString()}`);
    console.log(`Uptime: ${(os.uptime() / 3600).toFixed(2)} hours`);
    console.log();

    console.log('💻 CPU');
    console.log('─'.repeat(70));
    console.log(`Cores: ${sample.cpu.cores} @ ${sample.cpu.speed} MHz`);
    console.log(
      `Load Average: ${sample.cpu.loadAvg1m.toFixed(2)}, ${sample.cpu.loadAvg5m.toFixed(2)}, ${sample.cpu.loadAvg15m.toFixed(2)}`
    );

    // Display CPU bar chart
    sample.cpu.usage.forEach(({ core, usage }) => {
      const barLength = Math.round(usage / 2); // Scale to 50 chars max
      const bar = '█'.repeat(barLength) + '░'.repeat(50 - barLength);
      console.log(`Core ${core}: [${bar}] ${usage}%`);
    });

    console.log();
    console.log('🧠 Memory');
    console.log('─'.repeat(70));
    console.log(`Total: ${sample.memory.totalGB} GB`);
    console.log(`Used:  ${sample.memory.usedGB} GB (${sample.memory.usedPercent}%)`);
    console.log(`Free:  ${sample.memory.freeGB} GB`);

    const memBarLength = Math.round(sample.memory.usedPercent / 2);
    const memBar = '█'.repeat(memBarLength) + '░'.repeat(50 - memBarLength);
    console.log(`[${memBar}] ${sample.memory.usedPercent}%`);

    console.log();
    console.log('Press Ctrl+C to stop');
    console.log('═'.repeat(70));
  }

  /**
   * Monitor in real-time (inspired by: watch)
   */
  async monitor(intervalMs = 2000, duration = null) {
    console.log('Starting real-time monitoring...\n');

    const startTime = Date.now();
    const interval = setInterval(async () => {
      const sample = await this.sample();
      this.displayStats(sample);

      if (duration && Date.now() - startTime > duration) {
        clearInterval(interval);
        this.generateReport();
      }
    }, intervalMs);

    // Handle Ctrl+C
    process.on('SIGINT', () => {
      clearInterval(interval);
      console.log('\n\nMonitoring stopped.');
      this.generateReport();
      process.exit(0);
    });

    // Keep process alive
    if (!duration) {
      await new Promise(() => {}); // Forever
    } else {
      await new Promise((resolve) => setTimeout(resolve, duration));
    }
  }

  /**
   * Generate summary report
   */
  generateReport() {
    if (this.samples.length === 0) {
      console.log('No samples collected.');
      return;
    }

    console.log('\n\n📊 Performance Summary');
    console.log('═'.repeat(70));

    const cpuAvgs = this.samples.map(
      (s) => s.cpu.usage.reduce((sum, c) => sum + c.usage, 0) / s.cpu.usage.length
    );
    const memUsages = this.samples.map((s) => parseFloat(s.memory.usedPercent));

    console.log('\n🎯 Averages:');
    console.log(`CPU Usage: ${(cpuAvgs.reduce((a, b) => a + b, 0) / cpuAvgs.length).toFixed(2)}%`);
    console.log(
      `Memory Usage: ${(memUsages.reduce((a, b) => a + b, 0) / memUsages.length).toFixed(2)}%`
    );

    console.log('\n📈 Peaks:');
    console.log(`Max CPU: ${Math.max(...cpuAvgs).toFixed(2)}%`);
    console.log(`Max Memory: ${Math.max(...memUsages).toFixed(2)}%`);

    console.log('\n📉 Minimums:');
    console.log(`Min CPU: ${Math.min(...cpuAvgs).toFixed(2)}%`);
    console.log(`Min Memory: ${Math.min(...memUsages).toFixed(2)}%`);

    console.log('\n⏱️  Sample Statistics:');
    console.log(`Total Samples: ${this.samples.length}`);
    console.log(`Duration: ${((Date.now() - this.startTime) / 1000).toFixed(2)}s`);
    console.log(
      `Sample Rate: ${(this.samples.length / ((Date.now() - this.startTime) / 1000)).toFixed(2)} samples/sec`
    );
  }

  /**
   * Quick snapshot
   */
  async snapshot() {
    console.log('📸 System Snapshot');
    console.log('═'.repeat(70));

    const sample = await this.sample();

    console.log('\n💻 CPU:');
    console.log(`  Cores: ${sample.cpu.cores}`);
    console.log(`  Model: ${sample.cpu.model}`);
    console.log(
      `  Load: ${sample.cpu.loadAvg1m.toFixed(2)}, ${sample.cpu.loadAvg5m.toFixed(2)}, ${sample.cpu.loadAvg15m.toFixed(2)}`
    );
    const avgCpu = sample.cpu.usage.reduce((sum, c) => sum + c.usage, 0) / sample.cpu.usage.length;
    console.log(`  Avg Usage: ${avgCpu.toFixed(2)}%`);

    console.log('\n🧠 Memory:');
    console.log(`  Total: ${sample.memory.totalGB} GB`);
    console.log(`  Used: ${sample.memory.usedGB} GB (${sample.memory.usedPercent}%)`);
    console.log(`  Free: ${sample.memory.freeGB} GB`);

    console.log('\n🖥️  System:');
    console.log(`  Platform: ${os.platform()}`);
    console.log(`  Architecture: ${os.arch()}`);
    console.log(`  Hostname: ${os.hostname()}`);
    console.log(`  Uptime: ${(os.uptime() / 3600).toFixed(2)} hours`);

    console.log('\n🔝 Top Processes by Memory:');
    const topProcs = await this.getTopProcessesByMemory(5);
    topProcs.forEach((proc, i) => {
      if (isWindows) {
        console.log(`  ${i + 1}. ${proc.name} (PID: ${proc.pid}) - ${proc.mem}`);
      } else {
        console.log(`  ${i + 1}. ${proc.command} - CPU: ${proc.cpu}%, Mem: ${proc.mem}%`);
      }
    });

    console.log('\n' + '═'.repeat(70));
  }
}

// CLI execution
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename || process.argv[1].endsWith('quick-profile.js')) {
  const profiler = new QuickProfiler();
  const mode = process.argv[2] || 'snapshot';

  if (mode === 'monitor') {
    const interval = parseInt(process.argv[3]) || 2000;
    const duration = parseInt(process.argv[4]) || null;
    profiler.monitor(interval, duration);
  } else if (mode === 'snapshot') {
    profiler.snapshot();
  } else {
    console.log('Usage:');
    console.log('  node quick-profile.js snapshot          - Take single snapshot');
    console.log('  node quick-profile.js monitor [ms]      - Monitor continuously');
    console.log('  node quick-profile.js monitor 1000 30000 - Monitor for 30 seconds');
  }
}

export default QuickProfiler;
