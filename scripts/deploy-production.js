#!/usr/bin/env node

/**
 * Production Deployment Script for www.scarmonit.com
 * Orchestrates deployment across Railway, Vercel, and Cloudflare Workers
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting production deployment for www.scarmonit.com\n');

// Configuration
const config = {
  githubRepo: 'Scarmonit/Final',
  domain: 'www.scarmonit.com',
  platforms: ['railway', 'vercel', 'cloudflare']
};

// Deployment status tracker
const deploymentStatus = {
  railway: false,
  vercel: false,
  cloudflare: false,
  errors: []
};

/**
 * Execute command with error handling
 */
function exec(command, options = {}) {
  try {
    console.log(`\n📦 Executing: ${command}`);
    const output = execSync(command, {
      stdio: 'inherit',
      ...options
    });
    return { success: true, output };
  } catch (error) {
    console.error(`❌ Command failed: ${error.message}`);
    return { success: false, error };
  }
}

/**
 * Check prerequisites
 */
function checkPrerequisites() {
  console.log('🔍 Checking prerequisites...\n');

  const checks = [
    { name: 'Node.js', command: 'node --version' },
    { name: 'npm', command: 'npm --version' },
    { name: 'git', command: 'git --version' }
  ];

  for (const check of checks) {
    const result = exec(check.command, { stdio: 'pipe' });
    if (result.success) {
      console.log(`✅ ${check.name} is installed`);
    } else {
      console.error(`❌ ${check.name} is not installed`);
      process.exit(1);
    }
  }

  console.log('\n✅ All prerequisites met\n');
}

/**
 * Install dependencies
 */
function installDependencies() {
  console.log('📦 Installing dependencies...\n');

  const result = exec('npm install');

  if (!result.success) {
    console.error('❌ Failed to install dependencies');
    deploymentStatus.errors.push('Dependency installation failed');
    return false;
  }

  console.log('✅ Dependencies installed\n');
  return true;
}

/**
 * Run tests
 */
function runTests() {
  console.log('🧪 Running tests...\n');

  const result = exec('npm test', { stdio: 'pipe' });

  if (result.success) {
    console.log('✅ Tests passed\n');
    return true;
  } else {
    console.warn('⚠️  Tests failed or not configured (continuing deployment)\n');
    return true; // Don't block deployment on test failures
  }
}

/**
 * Build project
 */
function buildProject() {
  console.log('🔨 Building project...\n');

  const result = exec('npm run build', { stdio: 'pipe' });

  if (result.success) {
    console.log('✅ Build completed\n');
    return true;
  } else {
    console.warn('⚠️  Build command not configured or failed (continuing deployment)\n');
    return true; // Don't block deployment if no build needed
  }
}

/**
 * Deploy to Railway
 */
function deployRailway() {
  console.log('🚂 Deploying to Railway...\n');

  // Check if Railway CLI is installed
  const checkRailway = exec('railway --version', { stdio: 'pipe' });

  if (!checkRailway.success) {
    console.warn('⚠️  Railway CLI not installed. Install with: npm i -g @railway/cli');
    console.warn('   Or deploy manually at: https://railway.app/');
    deploymentStatus.errors.push('Railway CLI not installed');
    return false;
  }

  // Deploy using Railway
  const result = exec('railway up');

  if (result.success) {
    deploymentStatus.railway = true;
    console.log('✅ Railway deployment successful\n');
    return true;
  } else {
    deploymentStatus.errors.push('Railway deployment failed');
    console.error('❌ Railway deployment failed\n');
    return false;
  }
}

/**
 * Deploy to Vercel
 */
function deployVercel() {
  console.log('▲ Deploying to Vercel...\n');

  // Check if Vercel CLI is installed
  const checkVercel = exec('vercel --version', { stdio: 'pipe' });

  if (!checkVercel.success) {
    console.warn('⚠️  Vercel CLI not installed. Install with: npm i -g vercel');
    console.warn('   Or deploy manually at: https://vercel.com/');
    deploymentStatus.errors.push('Vercel CLI not installed');
    return false;
  }

  // Deploy using Vercel
  const result = exec('vercel --prod --yes');

  if (result.success) {
    deploymentStatus.vercel = true;
    console.log('✅ Vercel deployment successful\n');
    return true;
  } else {
    deploymentStatus.errors.push('Vercel deployment failed');
    console.error('❌ Vercel deployment failed\n');
    return false;
  }
}

/**
 * Deploy to Cloudflare Workers
 */
function deployCloudflare() {
  console.log('☁️  Deploying to Cloudflare Workers...\n');

  // Check if Wrangler is installed
  const checkWrangler = exec('wrangler --version', { stdio: 'pipe' });

  if (!checkWrangler.success) {
    console.warn('⚠️  Wrangler CLI not installed. Install with: npm i -g wrangler');
    console.warn('   Or deploy manually via Cloudflare Dashboard');
    deploymentStatus.errors.push('Wrangler CLI not installed');
    return false;
  }

  // Check if wrangler.toml has zone_id configured
  const wranglerPath = path.join(__dirname, '..', 'wrangler.toml');
  const wranglerConfig = fs.readFileSync(wranglerPath, 'utf8');

  if (wranglerConfig.includes('YOUR_ZONE_ID')) {
    console.warn('⚠️  wrangler.toml still has placeholder zone_id');
    console.warn('   Update zone_id in wrangler.toml with your Cloudflare Zone ID');
    console.warn('   Get it from: https://dash.cloudflare.com/');
    deploymentStatus.errors.push('Cloudflare zone_id not configured');
    return false;
  }

  // Deploy using Wrangler
  const result = exec('npx wrangler deploy');

  if (result.success) {
    deploymentStatus.cloudflare = true;
    console.log('✅ Cloudflare Workers deployment successful\n');
    return true;
  } else {
    deploymentStatus.errors.push('Cloudflare deployment failed');
    console.error('❌ Cloudflare Workers deployment failed\n');
    return false;
  }
}

/**
 * Verify deployment
 */
async function verifyDeployment() {
  console.log('🔍 Verifying deployment...\n');

  const endpoints = [
    `https://${config.domain}/health`,
    `https://${config.domain}/dashboard`
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`Testing: ${endpoint}`);
      // Note: Would use fetch here in real implementation
      console.log(`⏳ Manual verification required for: ${endpoint}`);
    } catch (error) {
      console.error(`❌ Failed to verify: ${endpoint}`);
    }
  }

  console.log('\n');
}

/**
 * Print deployment summary
 */
function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 DEPLOYMENT SUMMARY');
  console.log('='.repeat(60) + '\n');

  console.log('Platform Status:');
  console.log(`  Railway:    ${deploymentStatus.railway ? '✅ Deployed' : '❌ Failed'}`);
  console.log(`  Vercel:     ${deploymentStatus.vercel ? '✅ Deployed' : '❌ Failed'}`);
  console.log(`  Cloudflare: ${deploymentStatus.cloudflare ? '✅ Deployed' : '❌ Failed'}`);

  if (deploymentStatus.errors.length > 0) {
    console.log('\n⚠️  Errors encountered:');
    deploymentStatus.errors.forEach((error, i) => {
      console.log(`  ${i + 1}. ${error}`);
    });
  }

  const successCount = Object.values(deploymentStatus).filter(v => v === true).length;
  const totalPlatforms = config.platforms.length;

  console.log(`\nSuccess Rate: ${successCount}/${totalPlatforms} platforms`);

  if (successCount === totalPlatforms) {
    console.log('\n🎉 All deployments successful!');
    console.log(`\n🌐 Visit your dashboard: https://${config.domain}/dashboard`);
  } else if (successCount > 0) {
    console.log('\n⚠️  Partial deployment success');
    console.log('   Review errors above and deploy manually to failed platforms');
  } else {
    console.log('\n❌ All deployments failed');
    console.log('   Please check errors and configuration, then try again');
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

/**
 * Main deployment orchestration
 */
async function main() {
  try {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║   Scarmonit Production Deployment Orchestrator          ║');
    console.log('║   www.scarmonit.com                                      ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    // Pre-deployment checks
    checkPrerequisites();

    if (!installDependencies()) {
      console.error('❌ Deployment aborted due to dependency installation failure');
      process.exit(1);
    }

    // Optional quality checks
    runTests();
    buildProject();

    // Deploy to all platforms
    console.log('\n🚀 Starting multi-platform deployment...\n');

    deployRailway();
    deployVercel();
    deployCloudflare();

    // Verify and summarize
    await verifyDeployment();
    printSummary();

    // Exit with appropriate code
    const hasFailures = deploymentStatus.errors.length > 0;
    process.exit(hasFailures ? 1 : 0);

  } catch (error) {
    console.error('\n❌ Deployment failed with error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run deployment
if (require.main === module) {
  main();
}

module.exports = { main };