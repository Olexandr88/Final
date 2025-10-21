#!/usr/bin/env node
/**
 * Build AI Orchestrator Dashboard as Windows .exe
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

console.log('🚀 Building AI Orchestrator Dashboard...\n');

// Ensure output directory exists
const distDir = path.join(ROOT, 'dist');
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

try {
  console.log('📦 Step 1: Installing dependencies...');
  execSync('npm install', { cwd: ROOT, stdio: 'inherit' });

  console.log('\n🔨 Step 2: Building Electron app for Windows...');
  execSync('npm run package:orchestrator', { cwd: ROOT, stdio: 'inherit' });

  console.log('\n✅ Build complete!');
  console.log(`\n📁 Output: ${path.join(distDir, 'AI Orchestrator Dashboard.exe')}`);
  console.log('\n🎯 To run:');
  console.log('   1. Start AI Bridge: npm run bridge:start');
  console.log('   2. Run the .exe from dist/ folder');
  console.log('   3. Or run in dev mode: npm run orchestrator:dev\n');
} catch (error) {
  console.error('\n❌ Build failed:', error.message);
  process.exit(1);
}
