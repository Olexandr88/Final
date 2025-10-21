#!/usr/bin/env node
/**
 * Network Diagnostics Utility
 * Based on shell one-liners: tcpdump, netstat, curl, lsof patterns
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import dns from 'dns/promises';
import net from 'net';

const execAsync = promisify(exec);
const isWindows = process.platform === 'win32';

class NetworkDiagnostics {
  constructor() {
    this.results = {};
  }

  /**
   * Check if port is available (inspired by: lsof -i :PORT)
   */
  async isPortAvailable(port) {
    return new Promise((resolve) => {
      const server = net.createServer();

      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close();
        resolve(true);
      });

      server.listen(port, '127.0.0.1');
    });
  }

  /**
   * Find process using port (inspired by: lsof -i :PORT)
   */
  async findProcessByPort(port) {
    try {
      if (isWindows) {
        const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
        const lines = stdout.split('\n').filter(line => line.includes('LISTENING'));
        if (lines.length === 0) return null;

        const pid = lines[0].trim().split(/\s+/).pop();
        const { stdout: taskInfo } = await execAsync(`tasklist /FI "PID eq ${pid}"`);
        const processName = taskInfo.split('\n')[3]?.split(/\s+/)[0];

        return { port, pid, process: processName };
      } else {
        // Unix: lsof -i :PORT -P
        const { stdout } = await execAsync(`lsof -i :${port} -P | grep LISTEN`);
        const parts = stdout.trim().split(/\s+/);
        return {
          port,
          pid: parts[1],
          process: parts[0]
        };
      }
    } catch {
      return null;
    }
  }

  /**
   * List all listening ports (inspired by: lsof -Pni4 | grep LISTEN)
   */
  async listListeningPorts() {
    console.log('\n🔍 Scanning listening ports...');

    try {
      if (isWindows) {
        const { stdout } = await execAsync('netstat -ano | findstr LISTENING');
        const lines = stdout.split('\n').filter(line => line.trim());

        const ports = new Map();

        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const address = parts[1];
          const pid = parts[4];

          if (address) {
            const port = address.split(':').pop();
            if (!ports.has(port)) {
              ports.set(port, { port, pid, address });
            }
          }
        }

        console.log(`  Found ${ports.size} listening ports`);
        return Array.from(ports.values()).slice(0, 20);
      } else {
        const { stdout } = await execAsync('lsof -Pni4 | grep LISTEN | head -20');
        const lines = stdout.split('\n').filter(line => line.trim());

        console.log(`  Found ${lines.length} listening ports`);
        return lines.map(line => {
          const parts = line.split(/\s+/);
          return {
            process: parts[0],
            pid: parts[1],
            port: parts[8]?.split(':').pop()
          };
        });
      }
    } catch (error) {
      console.error(`  ❌ Error: ${error.message}`);
      return [];
    }
  }

  /**
   * Test HTTP endpoint (inspired by: curl -Iks)
   */
  async testHttpEndpoint(url) {
    console.log(`\n🔍 Testing ${url}...`);

    try {
      const startTime = Date.now();
      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      });
      const duration = Date.now() - startTime;

      console.log(`  Status: ${response.status} ${response.statusText}`);
      console.log(`  Response time: ${duration}ms`);

      const headers = Object.fromEntries(response.headers.entries());
      console.log(`  Server: ${headers.server || 'Unknown'}`);
      console.log(`  Content-Type: ${headers['content-type'] || 'Unknown'}`);

      return { url, status: response.status, duration, headers };
    } catch (error) {
      console.log(`  ❌ Failed: ${error.message}`);
      return { url, error: error.message };
    }
  }

  /**
   * DNS lookup (inspired by: dig, host)
   */
  async dnsLookup(hostname) {
    console.log(`\n🔍 DNS lookup for ${hostname}...`);

    try {
      const addresses = await dns.resolve4(hostname);
      console.log(`  IPv4: ${addresses.join(', ')}`);

      try {
        const addresses6 = await dns.resolve6(hostname);
        console.log(`  IPv6: ${addresses6.join(', ')}`);
      } catch {
        // IPv6 not available
      }

      return { hostname, ipv4: addresses };
    } catch (error) {
      console.log(`  ❌ Failed: ${error.message}`);
      return { hostname, error: error.message };
    }
  }

  /**
   * Check network connections (inspired by: netstat -an | awk '/ESTABLISHED/')
   */
  async checkEstablishedConnections() {
    console.log('\n🔍 Active network connections...');

    try {
      if (isWindows) {
        const { stdout } = await execAsync('netstat -an | findstr ESTABLISHED');
        const lines = stdout.split('\n').filter(line => line.trim());

        console.log(`  Found ${lines.length} established connections`);

        // Count by remote IP
        const ipCounts = new Map();
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const remote = parts[2]?.split(':')[0];
          if (remote) {
            ipCounts.set(remote, (ipCounts.get(remote) || 0) + 1);
          }
        }

        const topConnections = Array.from(ipCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10);

        console.log('\n  Top remote addresses:');
        topConnections.forEach(([ip, count]) => {
          console.log(`    ${ip}: ${count} connections`);
        });

        return { total: lines.length, top: topConnections };
      } else {
        const { stdout } = await execAsync("netstat -an | awk '/ESTABLISHED/ { split($5,ip,\":\"); if (ip[1] !~ /^$/) print ip[1] }' | sort | uniq -c | sort -nr | head -10");
        console.log('\n  Top remote addresses:');
        console.log(stdout);
        return stdout;
      }
    } catch (error) {
      console.error(`  ❌ Error: ${error.message}`);
      return null;
    }
  }

  /**
   * Test WebSocket connection
   */
  async testWebSocket(wsUrl) {
    console.log(`\n🔍 Testing WebSocket ${wsUrl}...`);

    return new Promise((resolve) => {
      const startTime = Date.now();
      let ws;

      try {
        // Use dynamic import for ws library
        import('ws').then(({ default: WebSocket }) => {
          ws = new WebSocket(wsUrl);

          const timeout = setTimeout(() => {
            ws?.close();
            console.log('  ❌ Connection timeout');
            resolve({ wsUrl, success: false, error: 'Timeout' });
          }, 5000);

          ws.on('open', () => {
            clearTimeout(timeout);
            const duration = Date.now() - startTime;
            console.log(`  ✓ Connected in ${duration}ms`);
            ws.close();
            resolve({ wsUrl, success: true, duration });
          });

          ws.on('error', (error) => {
            clearTimeout(timeout);
            console.log(`  ❌ Failed: ${error.message}`);
            resolve({ wsUrl, success: false, error: error.message });
          });
        }).catch(error => {
          console.log(`  ⚠️  WebSocket library not available: ${error.message}`);
          resolve({ wsUrl, success: false, error: 'Library not available' });
        });
      } catch (error) {
        console.log(`  ❌ Failed: ${error.message}`);
        resolve({ wsUrl, success: false, error: error.message });
      }
    });
  }

  /**
   * Full network diagnostic report
   */
  async runDiagnostics(options = {}) {
    console.log('🌐 Network Diagnostics');
    console.log('═'.repeat(60));

    const {
      checkPorts = [3000, 8080, 9567, 65028, 65029],
      testUrls = ['http://localhost:3000/health'],
      testHosts = ['google.com'],
      checkWs = []
    } = options;

    // Check specific ports
    console.log('\n📡 Port Availability Check');
    console.log('─'.repeat(60));
    for (const port of checkPorts) {
      const available = await this.isPortAvailable(port);
      if (available) {
        console.log(`  ✓ Port ${port} available`);
      } else {
        const processInfo = await this.findProcessByPort(port);
        console.log(`  ⚠️  Port ${port} in use by ${processInfo?.process || 'unknown'} (PID: ${processInfo?.pid})`);
      }
    }

    // List all listening ports
    await this.listListeningPorts();

    // Test HTTP endpoints
    if (testUrls.length > 0) {
      console.log('\n🌍 HTTP Endpoint Tests');
      console.log('─'.repeat(60));
      for (const url of testUrls) {
        await this.testHttpEndpoint(url);
      }
    }

    // DNS lookups
    if (testHosts.length > 0) {
      console.log('\n🔎 DNS Lookups');
      console.log('─'.repeat(60));
      for (const host of testHosts) {
        await this.dnsLookup(host);
      }
    }

    // WebSocket tests
    if (checkWs.length > 0) {
      console.log('\n🔌 WebSocket Tests');
      console.log('─'.repeat(60));
      for (const wsUrl of checkWs) {
        await this.testWebSocket(wsUrl);
      }
    }

    // Active connections
    await this.checkEstablishedConnections();

    console.log('\n' + '═'.repeat(60));
    console.log('✅ Diagnostics complete\n');
  }
}

// CLI execution
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename || process.argv[1].endsWith('network-diagnostics.js')) {
  const diagnostics = new NetworkDiagnostics();

  const options = {
    checkPorts: [3000, 8080, 9567, 65028, 65029],
    testUrls: process.argv[2] ? [process.argv[2]] : [],
    testHosts: ['google.com', 'github.com'],
    checkWs: process.argv[3] ? [process.argv[3]] : []
  };

  diagnostics.runDiagnostics(options).catch(err => {
    console.error('Diagnostics failed:', err);
    process.exit(1);
  });
}

export default NetworkDiagnostics;
