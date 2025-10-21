#!/usr/bin/env node

/**
 * Network Analyzer - Advanced network monitoring and analysis
 * Based on shell_one_liners.sh network commands (blocks 180-240)
 * Defensive security use only - monitoring and analysis
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile } from 'fs/promises';

const execAsync = promisify(exec);

const NETWORK_COMMANDS = {
  'monitor-port': {
    desc: 'Monitor specific port traffic (requires admin)',
    async run(args) {
      const port = args[0] || '443';
      console.log(`📡 Monitoring port ${port} traffic...`);
      console.log('Note: This is a Windows system. Use Wireshark or tcpdump equivalent.\n');
      console.log(`Recommended: netsh trace start capture=yes tracefile=port${port}.etl`);
      console.log(`Stop with: netsh trace stop`);
    }
  },

  'scan-ports': {
    desc: 'Quick port scan (defensive only)',
    async run(args) {
      const target = args[0] || '127.0.0.1';
      const startPort = parseInt(args[1]) || 1;
      const endPort = parseInt(args[2]) || 1000;

      console.log(`🔍 Scanning ${target} ports ${startPort}-${endPort}\n`);
      console.log('⚠️  Defensive security only - only scan systems you own!\n');

      const openPorts = [];

      for (let port = startPort; port <= Math.min(endPort, startPort + 100); port++) {
        try {
          // Test connection to port
          const { stdout, stderr } = await execAsync(
            `powershell "Test-NetConnection -ComputerName ${target} -Port ${port} -InformationLevel Quiet -WarningAction SilentlyContinue"`,
            { timeout: 1000 }
          );

          if (stdout.trim() === 'True') {
            openPorts.push(port);
            console.log(`  ✅ Port ${port} - OPEN`);
          }
        } catch (err) {
          // Port closed or timeout
        }
      }

      console.log(`\n📊 Summary: ${openPorts.length} open ports found`);
      if (openPorts.length > 0) {
        console.log(`Open ports: ${openPorts.join(', ')}`);
      }
    }
  },

  'dns-lookup': {
    desc: 'DNS lookup with multiple resolvers',
    async run(args) {
      const domain = args[0] || 'google.com';

      console.log(`🌐 DNS Lookup: ${domain}\n`);

      // Block 229-235 - DNS queries
      const resolvers = [
        { name: 'Cloudflare', ip: '1.1.1.1' },
        { name: 'Google', ip: '8.8.8.8' },
        { name: 'Quad9', ip: '9.9.9.9' }
      ];

      for (const resolver of resolvers) {
        try {
          const { stdout } = await execAsync(
            `nslookup ${domain} ${resolver.ip}`,
            { timeout: 3000 }
          );

          const addresses = stdout.match(/Address(?:es)?:\s+([^\r\n]+)/g);
          if (addresses) {
            console.log(`${resolver.name} (${resolver.ip}):`);
            addresses.forEach(addr => {
              const ip = addr.split(':')[1]?.trim();
              if (ip && ip !== resolver.ip) {
                console.log(`  → ${ip}`);
              }
            });
          }
        } catch (err) {
          console.log(`${resolver.name}: ❌ Failed`);
        }
      }
    }
  },

  'dns-reverse': {
    desc: 'Reverse DNS lookup',
    async run(args) {
      const ip = args[0] || '8.8.8.8';

      console.log(`🔄 Reverse DNS: ${ip}\n`);

      try {
        // Block 235 - Reverse lookup
        const { stdout } = await execAsync(`nslookup ${ip}`);

        const nameMatch = stdout.match(/Name:\s+([^\r\n]+)/);
        if (nameMatch) {
          console.log(`✅ Hostname: ${nameMatch[1].trim()}`);
        } else {
          console.log('❌ No hostname found');
        }
      } catch (err) {
        console.log('❌ Lookup failed:', err.message);
      }
    }
  },

  'route-trace': {
    desc: 'Trace route to destination',
    async run(args) {
      const target = args[0] || 'google.com';
      const maxHops = args[1] || '30';

      console.log(`🗺️  Tracing route to ${target}\n`);

      try {
        const { stdout } = await execAsync(
          `tracert -h ${maxHops} ${target}`,
          { timeout: 60000 }
        );

        console.log(stdout);
      } catch (err) {
        console.log('❌ Trace failed:', err.message);
      }
    }
  },

  'connections-summary': {
    desc: 'Summarize active connections by IP',
    async run() {
      console.log('🌐 Active Connections Summary\n');

      try {
        // Block 225 - Connection summary (adapted for Windows)
        const { stdout } = await execAsync(
          'netstat -an | findstr ESTABLISHED'
        );

        const connections = new Map();
        stdout.split('\n').forEach(line => {
          const match = line.match(/(\d+\.\d+\.\d+\.\d+):(\d+)/);
          if (match && match[1] !== '127.0.0.1' && !match[1].startsWith('0.0.0.0')) {
            const ip = match[1];
            connections.set(ip, (connections.get(ip) || 0) + 1);
          }
        });

        const sorted = [...connections.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20);

        console.log('Top IPs by connection count:\n');
        sorted.forEach(([ip, count]) => {
          const bar = '█'.repeat(Math.min(count, 50));
          console.log(`${ip.padEnd(15)} ${String(count).padStart(3)} ${bar}`);
        });

        console.log(`\nTotal unique IPs: ${connections.size}`);
      } catch (err) {
        console.log('❌ Error:', err.message);
      }
    }
  },

  'port-watch': {
    desc: 'Watch specific port for connections',
    async run(args) {
      const port = args[0] || '443';
      const interval = parseInt(args[1]) || 2;

      console.log(`👁️  Watching port ${port} (refresh every ${interval}s)`);
      console.log('Press Ctrl+C to stop\n');

      const watch = async () => {
        try {
          const { stdout } = await execAsync(
            `netstat -an | findstr :${port}`
          );

          process.stdout.write('\x1Bc'); // Clear screen
          console.log(`Port ${port} Connections - ${new Date().toLocaleTimeString()}\n`);
          console.log(stdout || 'No connections');
        } catch (err) {
          console.log('No connections');
        }
      };

      // Initial watch
      await watch();

      // Repeat
      const watchInterval = setInterval(watch, interval * 1000);

      // Cleanup on exit
      process.on('SIGINT', () => {
        clearInterval(watchInterval);
        console.log('\n\nStopped watching');
        process.exit(0);
      });
    }
  },

  'bandwidth-monitor': {
    desc: 'Monitor network bandwidth usage',
    async run(args) {
      const interface_name = args[0] || 'Ethernet';
      const interval = parseInt(args[1]) || 5;

      console.log(`📊 Bandwidth Monitor: ${interface_name}\n`);
      console.log('Press Ctrl+C to stop\n');

      let prevStats = null;

      const monitor = async () => {
        try {
          const { stdout } = await execAsync(
            `powershell "Get-NetAdapterStatistics -Name '${interface_name}' | Select-Object Name,ReceivedBytes,SentBytes"`
          );

          const lines = stdout.split('\n');
          const dataLine = lines.find(l => l.includes(interface_name));

          if (dataLine) {
            const parts = dataLine.trim().split(/\s+/);
            const received = parseInt(parts[1]) || 0;
            const sent = parseInt(parts[2]) || 0;

            if (prevStats) {
              const rxDiff = received - prevStats.received;
              const txDiff = sent - prevStats.sent;

              const rxSpeed = (rxDiff / interval / 1024 / 1024).toFixed(2);
              const txSpeed = (txDiff / interval / 1024 / 1024).toFixed(2);

              console.log(`${new Date().toLocaleTimeString()}`);
              console.log(`  ⬇️  Download: ${rxSpeed} MB/s`);
              console.log(`  ⬆️  Upload:   ${txSpeed} MB/s`);
              console.log('');
            }

            prevStats = { received, sent };
          }
        } catch (err) {
          console.log('Error reading stats:', err.message);
        }
      };

      // Run monitor
      await monitor();
      const monitorInterval = setInterval(monitor, interval * 1000);

      process.on('SIGINT', () => {
        clearInterval(monitorInterval);
        console.log('\nStopped monitoring');
        process.exit(0);
      });
    }
  },

  'whois': {
    desc: 'WHOIS lookup for domain or IP',
    async run(args) {
      const target = args[0] || 'google.com';

      console.log(`🔍 WHOIS Lookup: ${target}\n`);

      try {
        // Use web API since Windows doesn't have whois by default
        const { stdout } = await execAsync(
          `powershell "Invoke-RestMethod -Uri 'https://www.whois.com/whois/${target}'"`,
          { timeout: 10000 }
        );

        console.log('Note: Use https://whois.com for detailed info');
        console.log('Or install whois tool for command-line access');
      } catch (err) {
        console.log('Tip: Use online whois service or install whois utility');
        console.log(`https://whois.com/whois/${target}`);
      }
    }
  },

  'http-headers': {
    desc: 'Fetch HTTP headers from URL',
    async run(args) {
      const url = args[0] || 'https://google.com';

      console.log(`📄 HTTP Headers: ${url}\n`);

      try {
        // Block 154-156 - HTTP header inspection
        const { stdout } = await execAsync(
          `curl -Iks "${url}"`,
          { timeout: 10000 }
        );

        console.log(stdout);
      } catch (err) {
        console.log('❌ Error fetching headers');
        console.log('Tip: Install curl or use PowerShell:');
        console.log(`  Invoke-WebRequest -Uri "${url}" -Method Head`);
      }
    }
  },

  'ssl-check': {
    desc: 'Quick SSL/TLS certificate check',
    async run(args) {
      const domain = args[0] || 'google.com';
      const port = args[1] || '443';

      console.log(`🔒 SSL/TLS Check: ${domain}:${port}\n`);

      try {
        // Block 100 - SSL check
        const { stdout } = await execAsync(
          `powershell "$cert = [Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}; $req = [Net.HttpWebRequest]::Create('https://${domain}'); $req.GetResponse(); Write-Output $req.ServicePoint.Certificate"`,
          { timeout: 10000 }
        );

        console.log('✅ SSL/TLS connection successful');
        console.log('\nFor detailed certificate info, use: npm run ssl:helper check-cert');
      } catch (err) {
        console.log('❌ SSL/TLS check failed:', err.message);
      }
    }
  }
};

async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  console.log('🌐 Network Analyzer (Defensive Security)\n');

  if (!command || command === 'help') {
    console.log('Available commands:\n');
    Object.entries(NETWORK_COMMANDS).forEach(([name, cmd]) => {
      console.log(`  ${name.padEnd(22)} - ${cmd.desc}`);
    });

    console.log('\nUsage: node scripts/network-analyzer.js <command> [args]');
    console.log('\nExamples:');
    console.log('  node scripts/network-analyzer.js dns-lookup google.com');
    console.log('  node scripts/network-analyzer.js scan-ports 127.0.0.1 1 100');
    console.log('  node scripts/network-analyzer.js connections-summary');
    console.log('  node scripts/network-analyzer.js port-watch 65028');
    console.log('\n⚠️  Defensive security use only!');
    return;
  }

  const cmd = NETWORK_COMMANDS[command];
  if (!cmd) {
    console.log(`❌ Unknown command: ${command}`);
    console.log('Run "node scripts/network-analyzer.js help" for available commands');
    process.exit(1);
  }

  await cmd.run(args);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
