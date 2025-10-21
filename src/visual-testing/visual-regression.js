/**
 * Visual Regression Testing for UI
 * Implements the Vibe Coding pattern for UI validation
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export class VisualRegressionTester {
  constructor(options = {}) {
    this.screenshotDir = options.screenshotDir || path.join(process.cwd(), '.screenshots');
    this.baselineDir = path.join(this.screenshotDir, 'baseline');
    this.currentDir = path.join(this.screenshotDir, 'current');
    this.diffDir = path.join(this.screenshotDir, 'diff');
    this.browserPath = options.browserPath;
    this.port = options.port || 3000;

    this._ensureDirectories();
  }

  /**
   * Capture screenshot of URL/route
   */
  async captureScreenshot(route, name, options = {}) {
    const url = `http://localhost:${this.port}${route}`;
    const filename = `${name}.png`;
    const outputPath = path.join(this.currentDir, filename);

    const viewport = options.viewport || { width: 1920, height: 1080 };
    const waitFor = options.waitFor || 1000;

    try {
      // Using Playwright for screenshots (can be swapped with Puppeteer)
      const command = `npx playwright screenshot "${url}" "${outputPath}" --wait-for-timeout=${waitFor} --viewport-size=${viewport.width},${viewport.height}`;

      execSync(command, { stdio: 'inherit' });

      console.log(`✓ Screenshot captured: ${filename}`);

      return {
        path: outputPath,
        name,
        route,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error(`Failed to capture screenshot for ${route}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Compare screenshot with baseline
   */
  async compareWithBaseline(name) {
    const currentPath = path.join(this.currentDir, `${name}.png`);
    const baselinePath = path.join(this.baselineDir, `${name}.png`);
    const diffPath = path.join(this.diffDir, `${name}-diff.png`);

    if (!fs.existsSync(currentPath)) {
      throw new Error(`Current screenshot not found: ${name}`);
    }

    if (!fs.existsSync(baselinePath)) {
      console.log(`No baseline found for ${name}. Creating baseline...`);
      await fs.promises.copyFile(currentPath, baselinePath);
      return {
        status: 'baseline_created',
        name,
        baselinePath,
      };
    }

    try {
      // Use pixelmatch or similar tool for comparison
      const command = `npx pixelmatch "${baselinePath}" "${currentPath}" "${diffPath}" 0.1`;

      execSync(command, { stdio: 'pipe' });

      return {
        status: 'identical',
        name,
        diffPath: null,
      };
    } catch (error) {
      // pixelmatch exits with code 1 when differences found
      return {
        status: 'different',
        name,
        diffPath,
        message: 'Visual differences detected',
      };
    }
  }

  /**
   * Analyze screenshot and extract differences
   */
  async analyzeScreenshot(screenshotPath, designSpec = null) {
    if (!fs.existsSync(screenshotPath)) {
      throw new Error(`Screenshot not found: ${screenshotPath}`);
    }

    const analysis = {
      path: screenshotPath,
      timestamp: Date.now(),
      issues: [],
    };

    // Basic analysis (can be enhanced with AI vision models)
    try {
      // Check image dimensions
      const stats = fs.statSync(screenshotPath);
      analysis.size = stats.size;

      // If design spec provided, compare colors, spacing, etc.
      if (designSpec) {
        analysis.issues = this._compareWithSpec(screenshotPath, designSpec);
      }

      return analysis;
    } catch (error) {
      console.error(`Failed to analyze screenshot: ${error.message}`);
      throw error;
    }
  }

  /**
   * Compare screenshot with design specification
   */
  _compareWithSpec(screenshotPath, spec) {
    const issues = [];

    // This is a placeholder - in real implementation, would use:
    // - OCR to extract text and verify font sizes
    // - Color analysis to verify brand colors
    // - Layout analysis to verify spacing/alignment
    // - Claude Vision API to get AI feedback

    // Example checks:
    if (spec.colors) {
      // Would verify colors match spec
      issues.push({
        type: 'color',
        severity: 'warning',
        message: 'Button color verification needed',
      });
    }

    if (spec.spacing) {
      // Would verify spacing matches spec
      issues.push({
        type: 'spacing',
        severity: 'info',
        message: 'Verify spacing between cards',
      });
    }

    return issues;
  }

  /**
   * Run full visual regression test suite
   */
  async runTestSuite(routes, options = {}) {
    const results = {
      passed: [],
      failed: [],
      baseline_created: [],
      timestamp: Date.now(),
    };

    for (const route of routes) {
      const name = route.name || route.path.replace(/\//g, '-') || 'index';

      try {
        // Capture screenshot
        await this.captureScreenshot(route.path, name, options);

        // Compare with baseline
        const comparison = await this.compareWithBaseline(name);

        if (comparison.status === 'identical') {
          results.passed.push({ name, route: route.path });
        } else if (comparison.status === 'baseline_created') {
          results.baseline_created.push({ name, route: route.path });
        } else {
          results.failed.push({
            name,
            route: route.path,
            diffPath: comparison.diffPath,
          });
        }
      } catch (error) {
        results.failed.push({
          name,
          route: route.path,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Update baseline with current screenshots
   */
  async updateBaseline(names = null) {
    const currentFiles = await fs.promises.readdir(this.currentDir);
    const filesToUpdate = names
      ? currentFiles.filter((f) => names.some((n) => f.startsWith(n)))
      : currentFiles;

    for (const file of filesToUpdate) {
      const currentPath = path.join(this.currentDir, file);
      const baselinePath = path.join(this.baselineDir, file);

      await fs.promises.copyFile(currentPath, baselinePath);
      console.log(`✓ Updated baseline: ${file}`);
    }

    return filesToUpdate.length;
  }

  /**
   * Generate visual regression report
   */
  async generateReport(results) {
    const reportPath = path.join(this.screenshotDir, 'report.html');

    let html = `
<!DOCTYPE html>
<html>
<head>
  <title>Visual Regression Test Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    .summary { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0; }
    .passed { color: green; }
    .failed { color: red; }
    .baseline { color: blue; }
    .result-section { margin: 20px 0; }
    .screenshot { max-width: 400px; border: 1px solid #ccc; margin: 10px; }
  </style>
</head>
<body>
  <h1>Visual Regression Test Report</h1>
  <div class="summary">
    <p><strong>Test Date:</strong> ${new Date(results.timestamp).toLocaleString()}</p>
    <p class="passed">✓ Passed: ${results.passed.length}</p>
    <p class="failed">✗ Failed: ${results.failed.length}</p>
    <p class="baseline">● Baselines Created: ${results.baseline_created.length}</p>
  </div>
`;

    if (results.failed.length > 0) {
      html += '<div class="result-section"><h2>Failed Tests</h2>';
      for (const item of results.failed) {
        html += `<div><strong>${item.name}</strong> (${item.route})`;
        if (item.diffPath && fs.existsSync(item.diffPath)) {
          html += `<br><img src="${path.relative(this.screenshotDir, item.diffPath)}" class="screenshot">`;
        }
        html += '</div>';
      }
      html += '</div>';
    }

    html += '</body></html>';

    await fs.promises.writeFile(reportPath, html, 'utf-8');
    console.log(`✓ Report generated: ${reportPath}`);

    return reportPath;
  }

  /**
   * Ensure required directories exist
   */
  _ensureDirectories() {
    [this.screenshotDir, this.baselineDir, this.currentDir, this.diffDir].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true }); // Keep sync for constructor
      }
    });
  }
}

export default VisualRegressionTester;
