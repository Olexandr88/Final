#!/usr/bin/env node
/**
 * Interactive Development Environment Setup Tool
 *
 * Automates the detection, installation, and verification of development tools
 * using Windows Package Manager (WinGet), PowerShell, and WSL integration.
 *
 * Usage:
 *   node setup-dev-environment.js                    # Interactive mode
 *   node setup-dev-environment.js --profile web-frontend
 *   node setup-dev-environment.js --profile python-dev --install
 *   node setup-dev-environment.js --list-profiles
 */

import { DevEnvironmentOrchestrator, DEV_PROFILES } from './src/tools/dev-environment-orchestrator.js';
import { createInterface } from 'readline';

// Colors for terminal output
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  gray: '\x1b[90m'
};

function log(message, color = COLORS.reset) {
  console.log(`${color}${message}${COLORS.reset}`);
}

function section(title) {
  console.log('\n' + COLORS.bright + COLORS.cyan + '='.repeat(70) + COLORS.reset);
  log(title, COLORS.bright + COLORS.cyan);
  console.log(COLORS.bright + COLORS.cyan + '='.repeat(70) + COLORS.reset + '\n');
}

function subsection(title) {
  console.log('\n' + COLORS.blue + title + COLORS.reset);
  console.log(COLORS.gray + '-'.repeat(70) + COLORS.reset);
}

/**
 * Display banner
 */
function displayBanner() {
  console.log(COLORS.bright + COLORS.cyan);
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                  ║');
  console.log('║        🚀 AUTOMATED DEVELOPMENT ENVIRONMENT SETUP 🚀              ║');
  console.log('║                                                                  ║');
  console.log('║  Powered by Windows Integration (WinGet + PowerShell + WSL)     ║');
  console.log('║                                                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╚');
  console.log(COLORS.reset + '\n');
}

/**
 * List available profiles
 */
function listProfiles() {
  section('📦 Available Development Profiles');

  const profiles = DevEnvironmentOrchestrator.getProfiles();

  profiles.forEach((profile, index) => {
    log(`${index + 1}. ${profile.name}`, COLORS.bright);
    log(`   ID: ${profile.id}`, COLORS.cyan);
    log(`   ${profile.description}`, COLORS.gray);
    log(`   Tools: ${profile.toolCount} total (${profile.requiredCount} required)`, COLORS.blue);

    // Show tools list
    const tools = DEV_PROFILES[profile.id].tools;
    tools.forEach(tool => {
      const required = tool.required ? COLORS.red + '(required)' + COLORS.reset : COLORS.gray + '(optional)' + COLORS.reset;
      log(`     • ${tool.name} ${required}`, COLORS.gray);
    });
    console.log();
  });
}

/**
 * Setup progress indicator
 */
function setupProgressTracking(orchestrator) {
  let currentStep = '';
  let progressBar = '';

  orchestrator.on('initialized', (status) => {
    log('✓ Initialized', COLORS.green);
    log(`  WinGet: ${status.winget ? '✓' : '✗'}`, status.winget ? COLORS.green : COLORS.yellow);
    log(`  WSL: ${status.wsl ? '✓' : '✗'}`, status.wsl ? COLORS.green : COLORS.yellow);
    log(`  PowerShell: ${status.powershell ? '✓' : '✗'}`, status.powershell ? COLORS.green : COLORS.yellow);
  });

  orchestrator.on('detection:start', ({ profile }) => {
    subsection('🔍 Detecting Installed Tools');
    currentStep = 'detection';
  });

  orchestrator.on('detection:found', ({ tool }) => {
    log(`  ✓ ${tool} (installed)`, COLORS.green);
  });

  orchestrator.on('detection:missing', ({ tool, required }) => {
    const color = required ? COLORS.yellow : COLORS.gray;
    const label = required ? '(required)' : '(optional)';
    log(`  ✗ ${tool} ${label}`, color);
  });

  orchestrator.on('detection:complete', ({ detected, missing, requiredMissing }) => {
    console.log();
    log(`Detection complete:`, COLORS.bright);
    log(`  • Found: ${detected}`, COLORS.green);
    log(`  • Missing: ${missing} (${requiredMissing} required)`, missing > 0 ? COLORS.yellow : COLORS.gray);
  });

  orchestrator.on('install:start', ({ count }) => {
    subsection('📦 Installing Missing Tools');
    log(`Installing ${count} package(s)...`, COLORS.blue);
  });

  orchestrator.on('install:progress', ({ current, total, tool }) => {
    const percentage = Math.round((current / total) * 100);
    const filled = Math.round(percentage / 2);
    progressBar = '█'.repeat(filled) + '░'.repeat(50 - filled);
    process.stdout.write(`\r  [${progressBar}] ${percentage}% - ${tool}`);
  });

  orchestrator.on('install:success', ({ tool }) => {
    process.stdout.write('\r' + ' '.repeat(100) + '\r');
    log(`  ✓ ${tool} installed successfully`, COLORS.green);
  });

  orchestrator.on('install:failed', ({ tool, error }) => {
    process.stdout.write('\r' + ' '.repeat(100) + '\r');
    log(`  ✗ ${tool} failed: ${error}`, COLORS.red);
  });

  orchestrator.on('install:complete', ({ installed, failed }) => {
    console.log();
    log(`Installation complete:`, COLORS.bright);
    log(`  • Installed: ${installed}`, COLORS.green);
    if (failed > 0) {
      log(`  • Failed: ${failed}`, COLORS.red);
    }
  });

  orchestrator.on('verify:start', ({ count }) => {
    subsection('✅ Verifying Installations');
    log(`Verifying ${count} tool(s)...`, COLORS.blue);
  });

  orchestrator.on('verify:success', ({ tool, version }) => {
    log(`  ✓ ${tool}: ${version}`, COLORS.green);
  });

  orchestrator.on('verify:failed', ({ tool }) => {
    log(`  ✗ ${tool}: verification failed`, COLORS.yellow);
  });

  orchestrator.on('verify:complete', ({ verified, failed }) => {
    console.log();
    log(`Verification complete:`, COLORS.bright);
    log(`  • Verified: ${verified}`, COLORS.green);
    if (failed > 0) {
      log(`  • Failed: ${failed}`, COLORS.yellow);
    }
  });

  orchestrator.on('wsl:test:start', ({ count }) => {
    subsection('🐧 Testing in WSL');
    log(`Testing ${count} tool(s) in Linux environment...`, COLORS.blue);
  });

  orchestrator.on('wsl:test:success', ({ tool }) => {
    log(`  ✓ ${tool} works in WSL`, COLORS.green);
  });

  orchestrator.on('wsl:test:failed', ({ tool }) => {
    log(`  ✗ ${tool} not available in WSL`, COLORS.gray);
  });

  orchestrator.on('wsl:test:complete', ({ tested, failed }) => {
    console.log();
    log(`WSL testing complete:`, COLORS.bright);
    log(`  • Working: ${tested}`, COLORS.green);
    log(`  • Not available: ${failed}`, COLORS.gray);
  });
}

/**
 * Display final report
 */
function displayReport(report) {
  section('📊 Setup Report');

  // System information
  subsection('System Information');
  log(`  Platform: ${report.system.platform}`, COLORS.cyan);
  log(`  WinGet Available: ${report.system.wingetAvailable ? '✓' : '✗'}`,
    report.system.wingetAvailable ? COLORS.green : COLORS.yellow);
  log(`  WSL Available: ${report.system.wslAvailable ? '✓' : '✗'}`,
    report.system.wslAvailable ? COLORS.green : COLORS.gray);
  log(`  PowerShell Available: ${report.system.powershellAvailable ? '✓' : '✗'}`,
    report.system.powershellAvailable ? COLORS.green : COLORS.yellow);

  // Environment summary
  subsection('Environment Summary');
  log(`  Tools Detected: ${report.environment.detected}`, COLORS.green);
  log(`  Tools Missing: ${report.environment.missing}`,
    report.environment.missing > 0 ? COLORS.yellow : COLORS.green);
  log(`  Tools Installed: ${report.environment.installed}`, COLORS.green);
  if (report.environment.failed > 0) {
    log(`  Installation Failures: ${report.environment.failed}`, COLORS.red);
  }
  log(`  Tools Verified: ${report.environment.verified}`, COLORS.green);

  // Verified tools with versions
  if (report.details.verified.length > 0) {
    subsection('Verified Tools');
    report.details.verified.forEach(tool => {
      log(`  ✓ ${tool.name}: ${tool.version}`, COLORS.green);
    });
  }

  // Failed installations
  if (report.details.failed.length > 0) {
    subsection('Failed Installations');
    report.details.failed.forEach(failure => {
      log(`  ✗ ${failure.name}: ${failure.error}`, COLORS.red);
    });
  }

  // Missing tools
  if (report.details.missing.length > 0) {
    subsection('Still Missing');
    report.details.missing.forEach(tool => {
      const label = tool.required ? '(required)' : '(optional)';
      log(`  • ${tool.name} ${label}`, tool.required ? COLORS.yellow : COLORS.gray);
    });
  }

  // Success/Warning message
  console.log();
  if (report.environment.missing === 0 && report.environment.failed === 0) {
    log('✅ Your development environment is fully configured!', COLORS.bright + COLORS.green);
  } else if (report.details.missing.filter(t => t.required).length > 0) {
    log('⚠️  Some required tools are still missing', COLORS.bright + COLORS.yellow);
    log('   Run with --install flag to automatically install them', COLORS.gray);
  } else {
    log('✅ All required tools are installed!', COLORS.bright + COLORS.green);
  }

  console.log();
}

/**
 * Interactive profile selection
 */
async function selectProfileInteractively() {
  const profiles = DevEnvironmentOrchestrator.getProfiles();

  console.log('\n' + COLORS.bright + 'Select a development profile:' + COLORS.reset + '\n');

  profiles.forEach((profile, index) => {
    log(`  ${index + 1}. ${profile.name}`, COLORS.cyan);
    log(`     ${profile.description}`, COLORS.gray);
  });

  console.log();

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(COLORS.bright + 'Enter profile number (1-' + profiles.length + '): ' + COLORS.reset, (answer) => {
      rl.close();
      const index = parseInt(answer) - 1;
      if (index >= 0 && index < profiles.length) {
        resolve(profiles[index].id);
      } else {
        log('Invalid selection. Using "minimal" profile.', COLORS.yellow);
        resolve('minimal');
      }
    });
  });
}

/**
 * Main function
 */
async function main() {
  displayBanner();

  // Parse command line arguments
  const args = process.argv.slice(2);
  const flags = {
    profile: null,
    install: false,
    verify: true,
    testWSL: false,
    requiredOnly: false,
    listProfiles: false,
    interactive: args.length === 0
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--profile' && args[i + 1]) {
      flags.profile = args[++i];
    } else if (arg === '--install') {
      flags.install = true;
    } else if (arg === '--no-verify') {
      flags.verify = false;
    } else if (arg === '--test-wsl') {
      flags.testWSL = true;
    } else if (arg === '--required-only') {
      flags.requiredOnly = true;
    } else if (arg === '--list-profiles') {
      flags.listProfiles = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: node setup-dev-environment.js [options]

Options:
  --profile <name>      Select profile (web-frontend, web-fullstack, python-dev, devops, minimal)
  --install             Automatically install missing tools
  --required-only       Install only required tools (skip optional)
  --test-wsl            Test installations in WSL environment
  --no-verify           Skip verification step
  --list-profiles       List all available profiles
  --help, -h            Show this help message

Examples:
  node setup-dev-environment.js
  node setup-dev-environment.js --list-profiles
  node setup-dev-environment.js --profile web-frontend
  node setup-dev-environment.js --profile python-dev --install
  node setup-dev-environment.js --profile devops --install --required-only
      `);
      return;
    }
  }

  // List profiles and exit
  if (flags.listProfiles) {
    listProfiles();
    return;
  }

  // Interactive mode or use specified profile
  if (!flags.profile) {
    if (flags.interactive) {
      flags.profile = await selectProfileInteractively();
    } else {
      log('No profile specified. Use --profile <name> or run without arguments for interactive mode.', COLORS.yellow);
      return;
    }
  }

  // Verify profile exists
  if (!DEV_PROFILES[flags.profile]) {
    log(`Error: Unknown profile "${flags.profile}"`, COLORS.red);
    log('Run with --list-profiles to see available profiles', COLORS.gray);
    return;
  }

  // Initialize orchestrator
  const orchestrator = new DevEnvironmentOrchestrator({
    autoInstall: flags.install,
    verifyInstallations: flags.verify,
    testInWSL: flags.testWSL
  });

  // Setup progress tracking
  setupProgressTracking(orchestrator);

  try {
    // Run setup
    section(`🚀 Setting Up: ${DEV_PROFILES[flags.profile].name}`);

    const report = await orchestrator.setupEnvironment(flags.profile, {
      install: flags.install,
      verify: flags.verify,
      testWSL: flags.testWSL,
      requiredOnly: flags.requiredOnly
    });

    // Display final report
    displayReport(report);

    // Save report to file
    const reportFile = `dev-environment-report-${Date.now()}.json`;
    await import('fs/promises').then(fs =>
      fs.writeFile(reportFile, JSON.stringify(report, null, 2))
    );

    log(`📄 Full report saved to: ${reportFile}`, COLORS.gray);

  } catch (error) {
    log(`\n❌ Setup failed: ${error.message}`, COLORS.bright + COLORS.red);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run
main().catch(error => {
  console.error('\n' + COLORS.bright + COLORS.red + '❌ Fatal error:' + COLORS.reset, error.message);
  process.exit(1);
});
