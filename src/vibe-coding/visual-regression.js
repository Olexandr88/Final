/**
 * Vibe Coding Visual Regression Testing
 * Screenshot analysis and UI comparison using headless browser
 */

import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export class VisualRegressionTester extends EventEmitter {
  constructor(options = {}) {
    super();
    this.screenshotDir = options.screenshotDir || './screenshots';
    this.browserPath = options.browserPath;
    this.viewport = options.viewport || { width: 1920, height: 1080 };
  }

  async initialize() {
    if (!existsSync(this.screenshotDir)) {
      await mkdir(this.screenshotDir, { recursive: true });
    }
  }

  async captureScreenshot(url, options = {}) {
    await this.initialize();

    const timestamp = Date.now();
    const filename = options.filename || `screenshot-${timestamp}.png`;
    const filepath = path.join(this.screenshotDir, filename);

    const command = this.buildScreenshotCommand(url, filepath, options);

    try {
      await execAsync(command);
      this.emit('screenshot:captured', { url, filepath });

      return {
        filepath,
        url,
        timestamp,
        metadata: options.metadata || {}
      };
    } catch (error) {
      this.emit('screenshot:error', { url, error });
      throw error;
    }
  }

  buildScreenshotCommand(url, filepath, options) {
    const selector = options.selector || 'body';
    const waitFor = options.waitFor || 2000;

    if (process.platform === 'win32') {
      return `powershell -Command "Start-Process chrome -ArgumentList '--headless','--screenshot=${filepath}','--window-size=${this.viewport.width},${this.viewport.height}','${url}'"`;
    } else {
      return `google-chrome --headless --screenshot="${filepath}" --window-size=${this.viewport.width},${this.viewport.height} "${url}"`;
    }
  }

  async compareScreenshots(baseline, current) {
    const differences = {
      identical: baseline === current,
      changes: []
    };

    if (baseline === current) {
      return differences;
    }

    try {
      const baselineData = await readFile(baseline);
      const currentData = await readFile(current);

      differences.identical = baselineData.equals(currentData);

      if (!differences.identical) {
        differences.changes.push({
          type: 'visual-diff',
          description: 'Screenshots differ',
          baseline,
          current
        });
      }

      this.emit('comparison:complete', differences);
      return differences;
    } catch (error) {
      this.emit('comparison:error', error);
      throw error;
    }
  }

  async analyzeUI(screenshotPath, designSpec = {}) {
    const analysis = {
      screenshot: screenshotPath,
      timestamp: Date.now(),
      issues: [],
      recommendations: []
    };

    if (designSpec.expectedColors) {
      analysis.recommendations.push({
        type: 'color-check',
        description: 'Verify color values match design spec',
        expected: designSpec.expectedColors
      });
    }

    if (designSpec.spacing) {
      analysis.recommendations.push({
        type: 'spacing-check',
        description: 'Verify spacing matches design spec',
        expected: designSpec.spacing
      });
    }

    if (designSpec.typography) {
      analysis.recommendations.push({
        type: 'typography-check',
        description: 'Verify font sizes and families',
        expected: designSpec.typography
      });
    }

    this.emit('analysis:complete', analysis);
    return analysis;
  }

  async captureAndCompare(url, baselineName, options = {}) {
    const baselinePath = path.join(this.screenshotDir, `${baselineName}-baseline.png`);
    const currentPath = path.join(this.screenshotDir, `${baselineName}-current.png`);

    const current = await this.captureScreenshot(url, {
      ...options,
      filename: `${baselineName}-current.png`
    });

    if (!existsSync(baselinePath)) {
      await writeFile(baselinePath, await readFile(currentPath));
      return {
        baseline: baselinePath,
        current: currentPath,
        firstRun: true,
        differences: { identical: true, changes: [] }
      };
    }

    const differences = await this.compareScreenshots(baselinePath, currentPath);

    return {
      baseline: baselinePath,
      current: currentPath,
      firstRun: false,
      differences
    };
  }

  async iterativeUITest(url, designSpec, maxIterations = 10) {
    const results = [];

    for (let i = 0; i < maxIterations; i++) {
      const screenshot = await this.captureScreenshot(url, {
        filename: `iteration-${i}.png`,
        metadata: { iteration: i }
      });

      const analysis = await this.analyzeUI(screenshot.filepath, designSpec);

      results.push({
        iteration: i,
        screenshot: screenshot.filepath,
        analysis
      });

      if (analysis.issues.length === 0) {
        this.emit('test:passed', { iteration: i, results });
        break;
      }

      this.emit('iteration:complete', { iteration: i, analysis });
    }

    return results;
  }

  async cleanup(olderThan = 7 * 24 * 60 * 60 * 1000) {
    const { readdirSync, statSync, unlinkSync } = await import('fs');

    const now = Date.now();
    const files = readdirSync(this.screenshotDir);

    let removed = 0;

    for (const file of files) {
      const filepath = path.join(this.screenshotDir, file);
      const stats = statSync(filepath);

      if (now - stats.mtimeMs > olderThan) {
        unlinkSync(filepath);
        removed++;
      }
    }

    this.emit('cleanup:complete', { removed });
    return removed;
  }
}

export default VisualRegressionTester;
