/**
 * Monaco Editor Download Script
 * Downloads and sets up Monaco Editor assets
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONACO_VERSION = '0.45.0';
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const MONACO_DIR = path.join(DIST_DIR, 'monaco-editor');

console.log('📦 Setting up Monaco Editor...');

// Create directories
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

if (!fs.existsSync(MONACO_DIR)) {
  fs.mkdirSync(MONACO_DIR, { recursive: true });
}

// Copy Monaco Editor files from node_modules
const monacoSource = path.resolve(__dirname, '..', 'node_modules', 'monaco-editor');

if (!fs.existsSync(monacoSource)) {
  console.error('❌ Monaco Editor not found in node_modules');
  console.error('   Run: npm install monaco-editor');
  process.exit(1);
}

// Copy min directory (contains workers and core files)
const minSource = path.join(monacoSource, 'min');
const minDest = path.join(MONACO_DIR, 'min');

if (fs.existsSync(minSource)) {
  console.log('📋 Copying Monaco Editor files...');
  copyRecursive(minSource, minDest);
  console.log('✅ Monaco Editor files copied successfully');
} else {
  console.error('❌ Monaco Editor min directory not found');
  process.exit(1);
}

// Create index.html if it doesn't exist
const indexPath = path.join(DIST_DIR, 'index.html');
if (!fs.existsSync(indexPath)) {
  console.log('📄 Creating index.html...');
  fs.writeFileSync(indexPath, `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';">
  <title>LLM Framework IDE</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      overflow: hidden;
    }

    #root {
      width: 100vw;
      height: 100vh;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script src="./renderer.js"></script>
</body>
</html>
`);
  console.log('✅ index.html created');
}

console.log('✅ Monaco Editor setup complete!');
console.log('');
console.log('Next steps:');
console.log('  1. npm run build:react  (Build React application)');
console.log('  2. npm run dev          (Start in development mode)');

/**
 * Recursively copy directory
 */
function copyRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
