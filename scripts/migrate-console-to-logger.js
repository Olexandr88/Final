#!/usr/bin/env node
/**
 * Automated Console.log to Logger Migration Script
 * Cycle 5 Optimization: Replace 911 console.* calls with Winston logger
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import path from 'path';

const migrations = [
  { pattern: /console\.log\((.*?)\);/g, replacement: 'logger.info($1);' },
  { pattern: /console\.warn\((.*?)\);/g, replacement: 'logger.warn($1);' },
  { pattern: /console\.error\((.*?)\);/g, replacement: 'logger.error($1);' },
  { pattern: /console\.debug\((.*?)\);/g, replacement: 'logger.debug($1);' },
  { pattern: /console\.info\((.*?)\);/g, replacement: 'logger.info($1);' },
];

async function migrateFile(filePath) {
  let content = readFileSync(filePath, 'utf-8');
  let changed = false;

  // Check if file uses console.*
  const hasConsole = /console\.(log|warn|error|debug|info)\(/.test(content);
  if (!hasConsole) {
    return { changed: false, filePath };
  }

  // Apply migrations
  migrations.forEach(({ pattern, replacement }) => {
    if (pattern.test(content)) {
      content = content.replace(pattern, replacement);
      changed = true;
    }
  });

  if (changed) {
    // Ensure logger import exists
    const hasLoggerImport =
      content.includes('import { logger }') || content.includes('import logger from');

    if (!hasLoggerImport) {
      // Calculate relative path to logger
      const fileDir = path.dirname(filePath);
      const loggerPath = path.resolve('C:/Users/scarm/src/utils/logger.js');
      let relativePath = path.relative(fileDir, loggerPath);
      relativePath = relativePath.replace(/\\/g, '/');

      if (!relativePath.startsWith('.')) {
        relativePath = './' + relativePath;
      }

      // Add import at the top after other imports
      const lines = content.split('\n');
      let importInsertIndex = 0;

      // Find last import statement
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('import ')) {
          importInsertIndex = i + 1;
        }
      }

      lines.splice(importInsertIndex, 0, `import { logger } from '${relativePath}';`);
      content = lines.join('\n');
    }

    writeFileSync(filePath, content, 'utf-8');
  }

  return { changed, filePath };
}

async function main() {
  console.log('🔧 Console.log to Logger Migration\n');
  console.log('Scanning src/agents/ directory...\n');

  // Start with agents directory (highest impact)
  const files = await glob('src/agents/**/*.js', { absolute: true });

  console.log(`Found ${files.length} files to analyze\n`);

  let migratedCount = 0;
  const results = [];

  for (const file of files) {
    const result = await migrateFile(file);
    results.push(result);

    if (result.changed) {
      migratedCount++;
      console.log(`✅ Migrated: ${path.relative(process.cwd(), result.filePath)}`);
    }
  }

  console.log(`\n📊 Migration Summary:`);
  console.log(`   Total files scanned: ${files.length}`);
  console.log(`   Files migrated: ${migratedCount}`);
  console.log(`   Unchanged: ${files.length - migratedCount}`);

  if (migratedCount > 0) {
    console.log('\n✅ Migration complete! Run tests to verify.');
    console.log('   Next: npm test');
  } else {
    console.log('\n✅ No console.* calls found in agents directory.');
  }
}

main().catch((error) => {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
});
