#!/usr/bin/env node

/**
 * Network Debugging Utility
 * Based on shell_one_liners.sh patterns for network diagnostics
 * Provides tcpdump-like, lsof-like, and netstat analysis
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const COMMANDS = {
  'listening': {
    desc: 'Show all listening ports (lsof -Pni4 equivalent)',
    async run() {
      console.log('🔌 Listening Ports:\n');
      try {
        const { stdout } = await execAsync('netstat -ano | findstr LISTENING');
        const ports = new Map();

        stdout.split('\n').forEach(line => {
          const match = line.match(/:(\d+)\s+.*LISTENING\s+(\d+)/);
          if (match) {
            const [, port, pid] = match;
            if (!ports.has(port)) {
              ports.set(port, { port, pid, proto: 'TCP' });
            }
          }
        });

        console.log('  Port  PID    Protocol');
        console.log('  ' + '─'.repeat(40));
        [...ports.values()]
          .sort((a, b) => parseInt(a.port) - parseInt(b.port))
          .forEach(({ port, pid, proto }) => {
            console.log(`  ${port.padStart(5)} ${pid.padStart(6)} ${proto}`);
          });
      } catch (err) {
        console.log('  Error:', err.message);
      }
    }
  },

  'established': {
    desc: 'Show established connections grouped by IP',
    async run() {
      console.log('🌐 Established Connections:\n');
      try {
        // Based on shell_one_liners.sh block 225
        const { stdout } = await execAsync('netstat -ano | findstr ESTABLISHED');
        const connections = new Map();

        stdout.split('\n').forEach(line => {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 4) {
            const remote = parts[2];
            const match = remote.match(/(\d+\.\d+\.\d+\.\d+):(\d+)/);
            if (match) {
              const ip = match[1];
              if (ip !== '127.0.0.1') {
                connections.set(ip, (connections.get(ip) || 0) + 1);
              }
            }
          }
        });

        const sorted = [...connections.entries()].sort((a, b) => b[1] - a[1]);

        console.log('  IP Address      Connections  Graph');
        console.log('  ' + '─'.repeat(60));
        sorted.forEach(([ip, count]) => {
          const bar = '█'.repeat(Math.min(count, 30));
          console.log(`  ${ip.padEnd(15)} ${count.toString().padStart(4)}         ${bar}`);
        });
      } catch (err) {
        console.log('  No established connections');
      }
    }
  },

  'connections-watch': {
    desc: 'Watch connections on specific port (like watch + netstat)',
    async run(args) {
      const port = args[0] || '443';
      console.log(`👀 Watching connections on port ${port} (Ctrl+C to stop)\n`);

      const watch = async () => {
        try {
          const { stdout } = await execAsync(
            `netstat -ano | findstr :${port} | findstr ESTABLISHED`
          );

          const connections = new Set();
          stdout.split('\n').forEach(line => {
            const match = line.match(/(\d+\.\d+\.\d+\.\d+):\d+/);
            if (match) connections.add(match[1]);
          });

          console.clear();
          console.log(`🌐 Port ${port} - ${new Date().toLocaleTimeString()}\n`);
          console.log(`  Active connections: ${connections.size}\n`);

          [...connections].sort().forEach(ip => {
            console.log(`  ${ip}`);
          });
        } catch {
          console.log('  No connections');
        }
      };

      // Watch every 2 seconds
      setInterval(watch, 2000);
      await watch();
    }
  },

  'port-kill': {
    desc: 'Kill process using specific port (lsof -i:<port> equivalent)',
    async run(args) {
      const port = args[0];
      if (!port) {
        console.log('❌ Usage: network-debug port-kill <port>');
        return;
      }

      console.log(`💀 Killing processes on port ${port}...\n`);

      try {
        // Based on shell_one_liners.sh block 73
        const { stdout } = await execAsync(
          `netstat -ano | findstr :${port} | findstr LISTENING`
        );

        const match = stdout.match(/LISTENING\s+(\d+)/);
        if (match) {
          const pid = match[1];
          console.log(`  Found PID: ${pid}`);
          await execAsync(`taskkill /PID ${pid} /F`);
          console.log(`  ✅ Process ${pid} killed`);
        } else {
          console.log(`  ❌ No process found on port ${port}`);
        }
      } catch (err) {
        console.log(`  ❌ Error: ${err.message}`);
      }
    }
  },

  'dns-resolve': {
    desc: 'Resolve domain with multiple DNS servers',
    async run(args) {
      const domain = args[0] || 'google.com';
      const dnsServers = ['8.8.8.8', '1.1.1.1', '9.9.9.9'];

      console.log(`🌍 DNS Resolution for: ${domain}\n`);

      for (const dns of dnsServers) {
        try {
          // Based on shell_one_liners.sh block 229
          const { stdout } = await execAsync(`nslookup ${domain} ${dns}`);
          console.log(`📡 ${dns}:`);
          const lines = stdout.split('\n').filter(l =>
            l.includes('Address') && !l.includes(dns)
          );
          lines.forEach(l => console.log(`  ${l.trim()}`));
          console.log('');
        } catch {
          console.log(`  ❌ Failed to resolve via ${dns}\n`);
        }
      }
    }
  },

  'http-headers': {
    desc: 'Fetch HTTP headers for domain (curl -Iks equivalent)',
    async run(args) {
      const domain = args[0] || 'google.com';
      console.log(`🌐 HTTP Headers for: ${domain}\n`);

      for (const proto of ['http', 'https']) {
        try {
          // Based on shell_one_liners.sh block 154
          const { stdout } = await execAsync(
            `powershell "Invoke-WebRequest -Uri '${proto}://${domain}' -Method HEAD -UseBasicParsing | Select-Object StatusCode, Headers | Format-List"`,
            { timeout: 5000 }
          );
          console.log(`${proto.toUpperCase()}://${domain}`);
          console.log(stdout);
        } catch (err) {
          console.log(`  ❌ ${proto}: ${err.message}\n`);
        }
      }
    }
  },

  'local-ip': {
    desc: 'Show local IP addresses',
    async run() {
      console.log('🏠 Local IP Addresses:\n');
      try {
        const { stdout } = await execAsync('ipconfig');
        const lines = stdout.split('\n').filter(l =>
          l.includes('IPv4') || l.includes('IPv6')
        );
        lines.forEach(l => console.log(`  ${l.trim()}`));
      } catch (err) {
        console.log('  Error:', err.message);
      }
    }
  }
};

async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  console.log('🛰️  Network Debugging Utility\n');

  if (!command || command === 'help') {
    console.log('Available commands:\n');
    Object.entries(COMMANDS).forEach(([name, cmd]) => {
      console.log(`  ${name.padEnd(20)} - ${cmd.desc}`);
    });
    console.log('\nUsage: node scripts/network-debug.js <command> [args]');
    console.log('\nExamples:');
    console.log('  node scripts/network-debug.js listening');
    console.log('  node scripts/network-debug.js port-kill 3000');
    console.log('  node scripts/network-debug.js dns-resolve example.com');
    return;
  }

  const cmd = COMMANDS[command];
  if (!cmd) {
    console.log(`❌ Unknown command: ${command}`);
    console.log('Run "node scripts/network-debug.js help" for available commands');
    process.exit(1);
  }

  await cmd.run(args);
}

main().catch(console.error);
