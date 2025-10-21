#!/usr/bin/env node

/**
 * SSL/TLS Helper - Certificate and key management utilities
 * Based on shell_one_liners.sh OpenSSL commands (blocks 100-138)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile } from 'fs/promises';

const execAsync = promisify(exec);

const SSL_COMMANDS = {
  'check-cert': {
    desc: 'Check SSL certificate details',
    async run(args) {
      const url = args[0] || 'google.com';
      const port = args[1] || '443';

      console.log(`🔐 Checking SSL certificate for ${url}:${port}\n`);

      try {
        // Block 100 - Basic SSL check
        const { stdout } = await execAsync(
          `echo | openssl s_client -connect ${url}:${port} -showcerts 2>nul`
        );

        // Parse certificate info
        const certMatch = stdout.match(
          /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/
        );
        if (certMatch) {
          console.log('✅ Certificate found');

          // Extract details
          if (stdout.includes('subject=')) {
            const subject = stdout.match(/subject=([^\n]+)/)?.[1];
            console.log(`Subject: ${subject}`);
          }

          if (stdout.includes('issuer=')) {
            const issuer = stdout.match(/issuer=([^\n]+)/)?.[1];
            console.log(`Issuer: ${issuer}`);
          }

          if (stdout.includes('Verify return code:')) {
            const verify = stdout.match(/Verify return code: ([^\n]+)/)?.[1];
            console.log(`Verify: ${verify}`);
          }
        } else {
          console.log('❌ No certificate found');
        }
      } catch (err) {
        console.log('❌ Error:', err.message);
      }
    },
  },

  'gen-key': {
    desc: 'Generate RSA private key',
    async run(args) {
      const bits = args[0] || '2048';
      const output = args[1] || 'private.key';

      console.log(`🔑 Generating ${bits}-bit RSA key...\n`);

      try {
        // Block 106 - Generate RSA key
        await execAsync(`openssl genrsa -out ${output} ${bits}`);
        console.log(`✅ Key generated: ${output}`);
        console.log(`Bits: ${bits}`);
      } catch (err) {
        console.log('❌ Error:', err.message);
        console.log('Note: Requires OpenSSL installed');
      }
    },
  },

  'gen-csr': {
    desc: 'Generate Certificate Signing Request',
    async run(args) {
      const keyFile = args[0] || 'private.key';
      const csrFile = args[1] || 'request.csr';

      console.log(`📝 Generating CSR from ${keyFile}...\n`);

      try {
        // Block 113 - Generate CSR from existing key
        await execAsync(`openssl req -out ${csrFile} -new -key ${keyFile}`);
        console.log(`✅ CSR generated: ${csrFile}`);
      } catch (err) {
        console.log('❌ Error:', err.message);
      }
    },
  },

  'check-key': {
    desc: 'Verify private key',
    async run(args) {
      const keyFile = args[0] || 'private.key';

      console.log(`🔍 Checking private key: ${keyFile}\n`);

      try {
        // Block 110 - Check RSA key
        await execAsync(`openssl rsa -check -in ${keyFile} -noout`);
        console.log(`✅ Key is valid`);

        // Get key details
        const { stdout } = await execAsync(`openssl rsa -noout -text -in ${keyFile}`);
        const bitsMatch = stdout.match(/Private-Key: \((\d+) bit/);
        if (bitsMatch) {
          console.log(`Bits: ${bitsMatch[1]}`);
        }
      } catch (err) {
        console.log('❌ Invalid key or error:', err.message);
      }
    },
  },

  'extract-pubkey': {
    desc: 'Extract public key from private key',
    async run(args) {
      const privKey = args[0] || 'private.key';
      const pubKey = args[1] || 'public.key';

      console.log(`🔓 Extracting public key...\n`);

      try {
        // Block 111 - Extract public key
        await execAsync(`openssl rsa -pubout -in ${privKey} -out ${pubKey}`);
        console.log(`✅ Public key extracted: ${pubKey}`);
      } catch (err) {
        console.log('❌ Error:', err.message);
      }
    },
  },

  'self-signed': {
    desc: 'Generate self-signed certificate',
    async run(args) {
      const keyFile = args[0] || 'domain.key';
      const certFile = args[1] || 'domain.crt';
      const days = args[2] || '365';

      console.log(`📜 Generating self-signed certificate...\n`);

      try {
        // Block 124 - Self-signed cert
        await execAsync(`openssl req -key ${keyFile} -nodes -x509 -days ${days} -out ${certFile}`);
        console.log(`✅ Certificate generated: ${certFile}`);
        console.log(`Valid for: ${days} days`);
      } catch (err) {
        console.log('❌ Error:', err.message);
        console.log('Tip: Generate key first with gen-key command');
      }
    },
  },

  'verify-cert': {
    desc: 'Verify certificate matches key',
    async run(args) {
      const keyFile = args[0] || 'private.key';
      const certFile = args[1] || 'certificate.crt';

      console.log(`🔗 Verifying certificate matches key...\n`);

      try {
        // Block 137 - Verify cert/key match via modulus
        const { stdout: keyMod } = await execAsync(
          `openssl rsa -noout -modulus -in ${keyFile} | openssl md5`
        );
        const { stdout: certMod } = await execAsync(
          `openssl x509 -noout -modulus -in ${certFile} | openssl md5`
        );

        if (keyMod.trim() === certMod.trim()) {
          console.log(`✅ Certificate and key MATCH`);
          console.log(`Hash: ${keyMod.trim()}`);
        } else {
          console.log(`❌ Certificate and key DO NOT MATCH`);
          console.log(`Key hash:  ${keyMod.trim()}`);
          console.log(`Cert hash: ${certMod.trim()}`);
        }
      } catch (err) {
        console.log('❌ Error:', err.message);
      }
    },
  },

  'cert-info': {
    desc: 'Show detailed certificate information',
    async run(args) {
      const certFile = args[0] || 'certificate.crt';

      console.log(`📋 Certificate Information: ${certFile}\n`);

      try {
        // Block 135 - Show cert details
        const { stdout } = await execAsync(`openssl x509 -noout -text -in ${certFile}`);

        // Parse important fields
        const lines = stdout.split('\n');
        let inSubject = false;
        let inIssuer = false;

        console.log('Certificate Details:');
        lines.forEach((line) => {
          if (line.includes('Subject:')) {
            console.log(`\n  ${line.trim()}`);
          } else if (line.includes('Issuer:')) {
            console.log(`  ${line.trim()}`);
          } else if (line.includes('Not Before:')) {
            console.log(`\n  ${line.trim()}`);
          } else if (line.includes('Not After :')) {
            console.log(`  ${line.trim()}`);
          } else if (line.includes('Public-Key:')) {
            console.log(`\n  ${line.trim()}`);
          } else if (line.includes('Signature Algorithm:')) {
            console.log(`  ${line.trim()}`);
          }
        });
      } catch (err) {
        console.log('❌ Error:', err.message);
      }
    },
  },

  'convert-pem-der': {
    desc: 'Convert PEM to DER format',
    async run(args) {
      const pemFile = args[0] || 'cert.pem';
      const derFile = args[1] || 'cert.der';

      console.log(`🔄 Converting ${pemFile} to DER format...\n`);

      try {
        // Block 132 - PEM to DER
        await execAsync(`openssl x509 -in ${pemFile} -outform der -out ${derFile}`);
        console.log(`✅ Converted to: ${derFile}`);
      } catch (err) {
        console.log('❌ Error:', err.message);
      }
    },
  },

  'convert-der-pem': {
    desc: 'Convert DER to PEM format',
    async run(args) {
      const derFile = args[0] || 'cert.der';
      const pemFile = args[1] || 'cert.pem';

      console.log(`🔄 Converting ${derFile} to PEM format...\n`);

      try {
        // Block 131 - DER to PEM
        await execAsync(`openssl x509 -in ${derFile} -inform der -outform pem -out ${pemFile}`);
        console.log(`✅ Converted to: ${pemFile}`);
      } catch (err) {
        console.log('❌ Error:', err.message);
      }
    },
  },

  'test-ssl': {
    desc: 'Test SSL/TLS connection to server',
    async run(args) {
      const host = args[0] || 'google.com';
      const port = args[1] || '443';

      console.log(`🔐 Testing SSL/TLS connection to ${host}:${port}\n`);

      try {
        // Block 100-104 - Various SSL tests
        const { stdout } = await execAsync(
          `echo | openssl s_client -connect ${host}:${port} -showcerts -tlsextdebug -status 2>nul`,
          { timeout: 5000 }
        );

        console.log('Connection Details:');

        if (stdout.includes('Protocol  :')) {
          const proto = stdout.match(/Protocol  : ([^\n]+)/)?.[1];
          console.log(`  Protocol: ${proto}`);
        }

        if (stdout.includes('Cipher    :')) {
          const cipher = stdout.match(/Cipher    : ([^\n]+)/)?.[1];
          console.log(`  Cipher: ${cipher}`);
        }

        if (stdout.includes('Verify return code:')) {
          const verify = stdout.match(/Verify return code: ([^\n]+)/)?.[1];
          console.log(`  Verification: ${verify}`);
        }

        console.log('\n✅ Connection successful');
      } catch (err) {
        console.log('❌ Connection failed:', err.message);
      }
    },
  },
};

async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  console.log('🔐 SSL/TLS Helper\n');

  if (!command || command === 'help') {
    console.log('Available commands:\n');
    Object.entries(SSL_COMMANDS).forEach(([name, cmd]) => {
      console.log(`  ${name.padEnd(18)} - ${cmd.desc}`);
    });

    console.log('\nUsage: node scripts/ssl-helper.js <command> [args]');
    console.log('\nExamples:');
    console.log('  node scripts/ssl-helper.js check-cert google.com 443');
    console.log('  node scripts/ssl-helper.js gen-key 2048 mykey.key');
    console.log('  node scripts/ssl-helper.js test-ssl example.com');
    console.log('\nNote: Requires OpenSSL installed and in PATH');
    return;
  }

  const cmd = SSL_COMMANDS[command];
  if (!cmd) {
    console.log(`❌ Unknown command: ${command}`);
    console.log('Run "node scripts/ssl-helper.js help" for available commands');
    process.exit(1);
  }

  await cmd.run(args);
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
