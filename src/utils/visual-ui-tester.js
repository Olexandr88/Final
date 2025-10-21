import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs-extra';
import path from 'path';

/**
 * Visual UI Tester - Screenshot-based UI testing
 * Allows Claude to see and analyze UIs
 */
export class VisualUITester extends EventEmitter {
  constructor(options = {}) {
    super();
    this.screenshotDir = options.screenshotDir || path.join(process.cwd(), '.screenshots');
    this.browserPath = options.browserPath; // Path to browser executable
    this.defaultViewport = options.viewport || { width: 1920, height: 1080 };
    this.compareThreshold = options.compareThreshold || 0.1; // 10% difference
  }

  /**
   * Initialize tester
   */
  async initialize() {
    await fs.ensureDir(this.screenshotDir);
  }

  /**
   * Launch app and take screenshot
   */
  async captureUI(url, options = {}) {
    const {
      viewport = this.defaultViewport,
      selector = null,
      waitFor = null,
      fullPage = false
    } = options;

    const screenshotPath = path.join(
      this.screenshotDir,
      `screenshot-${Date.now()}.png`
    );

    // Use Playwright or Puppeteer to capture
    const script = this.generateCaptureScript(url, screenshotPath, {
      viewport,
      selector,
      waitFor,
      fullPage
    });

    await this.executeScript(script);

    return {
      path: screenshotPath,
      url,
      timestamp: new Date(),
      viewport
    };
  }

  /**
   * Generate browser automation script
   */
  generateCaptureScript(url, screenshotPath, options) {
    // Generate Playwright script
    return `
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: ${JSON.stringify(options.viewport)}
  });
  const page = await context.newPage();

  await page.goto('${url}');

  ${options.waitFor ? `await page.waitForSelector('${options.waitFor}');` : ''}

  ${options.selector
      ? `await page.locator('${options.selector}').screenshot({ path: '${screenshotPath}' });`
      : `await page.screenshot({ path: '${screenshotPath}', fullPage: ${options.fullPage} });`
    }

  await browser.close();
})();
`;
  }

  /**
   * Execute browser script
   */
  async executeScript(script) {
    return new Promise((resolve, reject) => {
      const tmpScript = path.join(this.screenshotDir, `capture-${Date.now()}.js`);

      fs.writeFileSync(tmpScript, script);

      const child = spawn('node', [tmpScript], {
        cwd: process.cwd(),
        env: process.env
      });

      let output = '';
      let error = '';

      child.stdout.on('data', data => {
        output += data.toString();
      });

      child.stderr.on('data', data => {
        error += data.toString();
      });

      child.on('close', code => {
        fs.remove(tmpScript).catch(() => { }); // Cleanup

        if (code === 0) {
          resolve({ output });
        } else {
          reject(new Error(`Screenshot capture failed: ${error}`));
        }
      });
    });
  }

  /**
   * Compare screenshots
   */
  async compareScreenshots(screenshot1Path, screenshot2Path) {
    // Use pixelmatch or similar library for comparison
    // For now, return mock comparison

    const script = `
const fs = require('fs');
const PNG = require('pngjs').PNG;
const pixelmatch = require('pixelmatch');

const img1 = PNG.sync.read(fs.readFileSync('${screenshot1Path}'));
const img2 = PNG.sync.read(fs.readFileSync('${screenshot2Path}'));

const { width, height } = img1;
const diff = new PNG({ width, height });

const numDiffPixels = pixelmatch(
  img1.data,
  img2.data,
  diff.data,
  width,
  height,
  { threshold: 0.1 }
);

const diffPath = '${path.join(this.screenshotDir, `diff-${Date.now()}.png`)}';
fs.writeFileSync(diffPath, PNG.sync.write(diff));

console.log(JSON.stringify({
  diffPixels: numDiffPixels,
  totalPixels: width * height,
  diffPercentage: (numDiffPixels / (width * height)) * 100,
  diffPath
}));
`;

    try {
      const result = await this.executeScript(script);
      const comparison = JSON.parse(result.output.trim());

      return {
        different: comparison.diffPercentage > this.compareThreshold,
        diffPercentage: comparison.diffPercentage,
        diffPixels: comparison.diffPixels,
        diffImagePath: comparison.diffPath
      };
    } catch (err) {
      console.error('Screenshot comparison failed:', err.message);
      return null;
    }
  }

  /**
   * Analyze UI from screenshot
   * Generate analysis that Claude can use
   */
  async analyzeUI(screenshotPath, referenceSpec = null) {
    // This would integrate with Claude Vision API
    // For now, return structure for analysis

    const analysis = {
      screenshotPath,
      timestamp: new Date(),
      elements: await this.detectElements(screenshotPath),
      colors: await this.extractColors(screenshotPath),
      layout: await this.analyzeLayout(screenshotPath),
      accessibility: await this.checkAccessibility(screenshotPath)
    };

    // If reference spec provided, compare
    if (referenceSpec) {
      analysis.comparison = this.compareToSpec(analysis, referenceSpec);
    }

    return analysis;
  }

  /**
   * Detect UI elements (mock - would use CV or browser automation)
   */
  async detectElements(screenshotPath) {
    // In production, use browser automation to get DOM
    return {
      buttons: [],
      inputs: [],
      text: [],
      images: []
    };
  }

  /**
   * Extract dominant colors
   */
  async extractColors(screenshotPath) {
    // Use color-thief or similar
    return {
      primary: '#3B82F6',
      secondary: '#8B5CF6',
      background: '#FFFFFF'
    };
  }

  /**
   * Analyze layout structure
   */
  async analyzeLayout(screenshotPath) {
    return {
      type: 'grid',
      columns: 12,
      gaps: { row: '16px', column: '16px' }
    };
  }

  /**
   * Check accessibility
   */
  async checkAccessibility(screenshotPath) {
    // Would use axe-core or similar
    return {
      issues: [],
      score: 95
    };
  }

  /**
   * Compare UI to design spec
   */
  compareToSpec(analysis, spec) {
    const differences = [];

    // Compare colors
    if (spec.colors) {
      for (const [key, expectedColor] of Object.entries(spec.colors)) {
        if (analysis.colors[key] !== expectedColor) {
          differences.push({
            type: 'color',
            element: key,
            expected: expectedColor,
            actual: analysis.colors[key]
          });
        }
      }
    }

    // Compare layout
    if (spec.layout) {
      if (spec.layout.gaps !== analysis.layout.gaps) {
        differences.push({
          type: 'layout',
          property: 'gaps',
          expected: spec.layout.gaps,
          actual: analysis.layout.gaps
        });
      }
    }

    return {
      matches: differences.length === 0,
      differences
    };
  }

  /**
   * Iterative UI improvement loop
   */
  async iterativeImprovement(url, designSpec, maxIterations = 5) {
    const iterations = [];

    for (let i = 0; i < maxIterations; i++) {
      // Capture current state
      const screenshot = await this.captureUI(url);

      // Analyze
      const analysis = await this.analyzeUI(screenshot.path, designSpec);

      iterations.push({
        iteration: i + 1,
        screenshot: screenshot.path,
        analysis
      });

      // If matches spec, we're done
      if (analysis.comparison?.matches) {
        this.emit('ui-improved', { iterations, success: true });
        return {
          success: true,
          iterations,
          finalScreenshot: screenshot.path
        };
      }

      // Generate improvement suggestions
      const suggestions = this.generateImprovements(analysis.comparison.differences);

      this.emit('ui-iteration', {
        iteration: i + 1,
        differences: analysis.comparison.differences,
        suggestions
      });

      // In real implementation, Claude would apply these improvements
      // and we'd wait for the app to update
      await this.waitForChanges();
    }

    // Max iterations reached
    this.emit('ui-improved', { iterations, success: false });
    return {
      success: false,
      iterations,
      message: 'Max iterations reached without matching spec'
    };
  }

  /**
   * Generate improvement suggestions from differences
   */
  generateImprovements(differences) {
    return differences.map(diff => {
      switch (diff.type) {
        case 'color':
          return {
            action: 'update-css',
            selector: `.${diff.element}`,
            property: 'color',
            value: diff.expected
          };

        case 'layout':
          return {
            action: 'update-css',
            selector: '.container',
            property: diff.property,
            value: diff.expected
          };

        default:
          return {
            action: 'manual-review',
            description: `Review ${diff.type} difference`
          };
      }
    });
  }

  /**
   * Wait for UI changes to apply
   */
  async waitForChanges(ms = 2000) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get screenshot history
   */
  async getScreenshotHistory() {
    const files = await fs.readdir(this.screenshotDir);
    const screenshots = files
      .filter(f => f.startsWith('screenshot-') && f.endsWith('.png'))
      .map(f => ({
        path: path.join(this.screenshotDir, f),
        timestamp: this.extractTimestamp(f)
      }))
      .sort((a, b) => b.timestamp - a.timestamp);

    return screenshots;
  }

  /**
   * Extract timestamp from filename
   */
  extractTimestamp(filename) {
    const match = filename.match(/screenshot-(\d+)\.png/);
    return match ? parseInt(match[1]) : 0;
  }

  /**
   * Clean up old screenshots
   */
  async cleanupOldScreenshots(keepLast = 10) {
    const history = await this.getScreenshotHistory();

    if (history.length > keepLast) {
      const toDelete = history.slice(keepLast);

      for (const screenshot of toDelete) {
        await fs.remove(screenshot.path);
      }

      return toDelete.length;
    }

    return 0;
  }
}

export default VisualUITester;
