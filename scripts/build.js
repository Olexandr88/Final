import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Starting build process...');

const distDir = path.join(__dirname, '../dist');

// 1. Clean the dist directory
if (fs.existsSync(distDir)) {
  console.log('Cleaning dist directory...');
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir);

// 2. Simulate creating a build artifact
console.log('Creating build artifact...');
fs.writeFileSync(path.join(distDir, 'bundle.js'), 'console.log("This is a simulated build artifact.");');

// 3. Create another artifact for demonstration
fs.writeFileSync(path.join(distDir, 'styles.css'), '/* This is a simulated CSS file */');


console.log('Build process completed successfully.');
console.log(`Artifacts are in ${distDir}`);
