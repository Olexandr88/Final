#!/usr/bin/env node

/**
 * LLMPacks CLI - Command-line interface for LLMPacks build system
 * Inspired by Nixpacks and Cloud Native Buildpacks
 *
 * @module llmpacks/cli
 */

import { program } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { LLMPacks } from './index.js';
import { createExampleConfig } from './config-loader.js';
import { validateDockerAvailable } from './docker-builder.js';
import { logger } from '../utils/logger.js';

const VERSION = '1.0.0';

/**
 * Format bytes to human-readable size
 * @param {number} bytes - Byte count
 * @returns {string} Formatted size
 */
function formatSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Detect command - Auto-detect project type
 */
program
  .command('detect')
  .description('Auto-detect project language and framework')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const spinner = ora('Detecting project type...').start();

    try {
      const packs = new LLMPacks({ projectPath: options.path });
      const detected = await packs.detect();

      spinner.succeed('Detection complete');

      if (options.json) {
        console.log(JSON.stringify(detected, null, 2));
      } else {
        console.log('\n' + chalk.bold('Detection Result:'));
        console.log(chalk.cyan('  Provider:   ') + detected.provider.name);
        console.log(chalk.cyan('  Version:    ') + (detected.version || 'latest'));
        console.log(chalk.cyan('  Confidence: ') + detected.confidence.toFixed(1) + '%');
        if (detected.packageManager) {
          console.log(chalk.cyan('  Pkg Manager:') + detected.packageManager);
        }
        console.log('');
      }
    } catch (error) {
      spinner.fail('Detection failed');
      console.error(chalk.red('\nError: ') + error.message);
      process.exit(1);
    }
  });

/**
 * Plan command - Generate build plan
 */
program
  .command('plan')
  .description('Generate build plan for project')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const spinner = ora('Generating build plan...').start();

    try {
      const packs = new LLMPacks({ projectPath: options.path });
      const plan = await packs.plan();

      spinner.succeed('Build plan generated');

      if (options.json) {
        console.log(JSON.stringify(plan, null, 2));
      } else {
        console.log('\n' + chalk.bold('Build Plan:'));
        console.log(chalk.cyan('  Provider:  ') + plan.provider);
        console.log(chalk.cyan('  Version:   ') + plan.version);
        console.log(chalk.cyan('  Cache Key: ') + plan.cacheKey);
        console.log('\n' + chalk.bold('Phases:'));

        for (const phase of plan.phases) {
          console.log(chalk.yellow(`\n  ${phase.name}:`));
          if (phase.commands) {
            phase.commands.forEach(cmd => console.log(chalk.gray(`    ${cmd}`)));
          }
          if (phase.command) {
            console.log(chalk.gray(`    ${phase.command}`));
          }
        }
        console.log('');
      }
    } catch (error) {
      spinner.fail('Plan generation failed');
      console.error(chalk.red('\nError: ') + error.message);
      process.exit(1);
    }
  });

/**
 * Build command - Build Docker image
 */
program
  .command('build')
  .description('Build Docker image from project')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('-n, --name <name>', 'Image name', 'llm-framework')
  .option('-t, --tag <tag>', 'Image tag', 'latest')
  .option('--push', 'Push image to registry')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    // Validate Docker is available
    const dockerSpinner = ora('Checking Docker...').start();
    const dockerAvailable = await validateDockerAvailable();

    if (!dockerAvailable) {
      dockerSpinner.fail('Docker not available');
      console.error(chalk.red('\nError: Docker is not installed or not running'));
      console.error(chalk.gray('Install Docker: https://docs.docker.com/get-docker/'));
      process.exit(1);
    }
    dockerSpinner.succeed('Docker ready');

    const spinner = ora('Building Docker image...').start();

    try {
      const packs = new LLMPacks({ projectPath: options.path });

      spinner.text = 'Detecting project...';
      await packs.detect();

      spinner.text = 'Generating build plan...';
      await packs.plan();

      spinner.text = 'Building Docker image...';
      const result = await packs.build({
        imageName: options.name,
        tag: options.tag,
        push: options.push
      });

      spinner.succeed('Docker image built successfully');

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log('\n' + chalk.bold('Build Result:'));
        console.log(chalk.cyan('  Image:  ') + result.imageName);
        console.log(chalk.cyan('  Size:   ') + formatSize(result.size));
        console.log(chalk.cyan('  Layers: ') + result.layers);
        console.log(chalk.cyan('  ID:     ') + result.imageId.substring(7, 19));

        if (result.pushed) {
          console.log(chalk.green('\n✓ Image pushed to registry'));
        }

        console.log('\n' + chalk.bold('Run with:'));
        console.log(chalk.gray(`  docker run -p 3000:3000 ${result.imageName}`));
        console.log('');
      }
    } catch (error) {
      spinner.fail('Build failed');
      console.error(chalk.red('\nError: ') + error.message);
      process.exit(1);
    }
  });

/**
 * Init command - Create example configuration
 */
program
  .command('init')
  .description('Create example llmpacks.toml configuration')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('--provider <provider>', 'Provider type (nodejs, electron, python)', 'nodejs')
  .action(async (options) => {
    const spinner = ora('Creating configuration...').start();

    try {
      const configPath = await createExampleConfig(options.path, options.provider);

      spinner.succeed('Configuration created');

      console.log('\n' + chalk.green('✓') + ' Created: ' + chalk.cyan(configPath));
      console.log(chalk.gray('  Edit this file to customize your build\n'));
    } catch (error) {
      spinner.fail('Init failed');
      console.error(chalk.red('\nError: ') + error.message);
      process.exit(1);
    }
  });

/**
 * Info command - Show project and system information
 */
program
  .command('info')
  .description('Show project and system information')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .action(async (options) => {
    const spinner = ora('Gathering information...').start();

    try {
      const packs = new LLMPacks({ projectPath: options.path });
      await packs.detect();
      await packs.loadConfiguration();

      const dockerAvailable = await validateDockerAvailable();

      spinner.succeed('Information gathered');

      console.log('\n' + chalk.bold('Project Information:'));
      console.log(chalk.cyan('  Path:       ') + options.path);
      console.log(chalk.cyan('  Provider:   ') + packs.detected.provider.name);
      console.log(chalk.cyan('  Version:    ') + packs.detected.version);
      if (packs.detected.packageManager) {
        console.log(chalk.cyan('  Pkg Manager:') + packs.detected.packageManager);
      }

      console.log('\n' + chalk.bold('Configuration:'));
      if (packs.config && Object.keys(packs.config).length > 0) {
        console.log(chalk.green('  ✓ llmpacks.toml found'));
        console.log(chalk.cyan('    Variables: ') + Object.keys(packs.config.variables || {}).length);
        console.log(chalk.cyan('    Phases:    ') + Object.keys(packs.config.phases || {}).length);
      } else {
        console.log(chalk.gray('  No configuration file (using defaults)'));
      }

      console.log('\n' + chalk.bold('System:'));
      console.log(chalk.cyan('  Docker:     ') + (dockerAvailable ? chalk.green('✓ Available') : chalk.red('✗ Not available')));
      console.log(chalk.cyan('  LLMPacks:   ') + VERSION);
      console.log('');
    } catch (error) {
      spinner.fail('Failed to gather information');
      console.error(chalk.red('\nError: ') + error.message);
      process.exit(1);
    }
  });

// Set up program
program
  .name('llmpacks')
  .description('LLMPacks - Zero-config build system for LLM Framework')
  .version(VERSION);

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
