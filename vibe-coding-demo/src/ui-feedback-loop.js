#!/usr/bin/env node
/**
 * UI ITERATIVE FEEDBACK LOOP
 * Automates the screenshot -> analyze -> fix -> repeat cycle
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class UIFeedbackLoop {
  constructor(htmlFile, referenceImage = null) {
    this.htmlFile = htmlFile;
    this.referenceImage = referenceImage;
    this.iterations = [];
    this.maxIterations = 10;
  }

  async iterate() {
    let iteration = 1;
    let issues = [];

    console.log('🎨 Starting UI Feedback Loop\n');

    do {
      console.log(`--- Iteration ${iteration} ---`);

      const result = await this.analyzeUI();
      this.iterations.push(result);

      console.log(`Screenshot: ${result.screenshot}`);
      console.log(`Issues: ${result.issues.length}`);

      if (result.issues.length === 0) {
        console.log('✓ No issues found - UI is perfect!');
        break;
      }

      console.log('\nIssues detected:');
      result.issues.forEach((issue, i) => {
        console.log(`  ${i + 1}. ${issue.description}`);
        if (issue.suggestion) {
          console.log(`     → ${issue.suggestion}`);
        }
      });

      issues = result.issues;
      iteration++;

      if (iteration > this.maxIterations) {
        console.log('\n⚠ Max iterations reached');
        break;
      }
    } while (issues.length > 0);

    return this.generateReport();
  }

  async analyzeUI() {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`file://${path.resolve(this.htmlFile)}`);

    // Take screenshot
    const screenshotPath = path.join(
      __dirname,
      '../screenshots',
      `iteration-${this.iterations.length + 1}.png`
    );
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // Analyze page
    const analysis = await page.evaluate(() => {
      const issues = [];

      // Check buttons
      const buttons = document.querySelectorAll('button');
      buttons.forEach((btn, i) => {
        const style = window.getComputedStyle(btn);
        if (style.cursor !== 'pointer') {
          issues.push({
            element: 'button',
            index: i,
            description: `Button ${i} missing cursor:pointer`,
            suggestion: 'Add cursor: pointer to button styles',
          });
        }
      });

      // Check contrast
      const body = window.getComputedStyle(document.body);
      const elements = document.querySelectorAll('p, span, div, h1, h2, h3');

      elements.forEach((el) => {
        const style = window.getComputedStyle(el);
        if (style.color === style.backgroundColor) {
          issues.push({
            element: el.tagName.toLowerCase(),
            description: 'Text color same as background - invisible text',
            suggestion: 'Fix color contrast',
          });
        }
      });

      // Check for missing alt text
      const images = document.querySelectorAll('img');
      images.forEach((img, i) => {
        if (!img.alt) {
          issues.push({
            element: 'img',
            index: i,
            description: `Image ${i} missing alt text`,
            suggestion: 'Add descriptive alt attribute for accessibility',
          });
        }
      });

      // Check font loading
      const fontsLoaded = document.fonts.status === 'loaded';
      if (!fontsLoaded) {
        issues.push({
          element: 'fonts',
          description: 'Fonts not fully loaded',
          suggestion: 'Ensure font-display: swap or preload fonts',
        });
      }

      // Measure performance
      const metrics = {
        width: document.body.scrollWidth,
        height: document.body.scrollHeight,
        backgroundColor: body.backgroundColor,
        textColor: body.color,
      };

      return { issues, metrics };
    });

    await browser.close();

    return {
      screenshot: screenshotPath,
      issues: analysis.issues,
      metrics: analysis.metrics,
      timestamp: new Date().toISOString(),
    };
  }

  generateReport() {
    const report = {
      totalIterations: this.iterations.length,
      finalState: this.iterations[this.iterations.length - 1],
      improvements: this.calculateImprovements(),
      screenshots: this.iterations.map((i) => i.screenshot),
    };

    const reportPath = path.join(__dirname, '../screenshots', 'feedback-loop-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log('\n📊 Feedback Loop Report:');
    console.log(`Total Iterations: ${report.totalIterations}`);
    console.log(`Issues Resolved: ${report.improvements.resolved}`);
    console.log(`Final Issues: ${report.finalState.issues.length}`);
    console.log(`\nReport saved: ${reportPath}`);

    return report;
  }

  calculateImprovements() {
    if (this.iterations.length < 2) {
      return { resolved: 0, remaining: this.iterations[0]?.issues.length || 0 };
    }

    const first = this.iterations[0].issues.length;
    const last = this.iterations[this.iterations.length - 1].issues.length;

    return {
      resolved: first - last,
      remaining: last,
      iterations: this.iterations.length,
    };
  }

  // Generate fix suggestions for Claude
  generateFixPrompt() {
    if (this.iterations.length === 0) return '';

    const latest = this.iterations[this.iterations.length - 1];

    return `
## UI Issues to Fix

Screenshot: ${latest.screenshot}

### Issues Detected:
${latest.issues
  .map(
    (issue, i) => `
${i + 1}. **${issue.description}**
   ${issue.suggestion ? `Fix: ${issue.suggestion}` : ''}
`
  )
  .join('\n')}

### Current Metrics:
- Dimensions: ${latest.metrics.width}x${latest.metrics.height}px
- Background: ${latest.metrics.backgroundColor}
- Text Color: ${latest.metrics.textColor}

Please fix these issues and run the feedback loop again to verify.
`.trim();
  }
}

// CLI
if (require.main === module) {
  const htmlFile = process.argv[2];

  if (!htmlFile) {
    console.log('Usage: ui-feedback-loop.js <html-file> [reference-image]');
    process.exit(1);
  }

  const referenceImage = process.argv[3];
  const loop = new UIFeedbackLoop(htmlFile, referenceImage);

  loop
    .iterate()
    .then((report) => {
      console.log('\n✓ Feedback loop complete');
      process.exit(report.finalState.issues.length === 0 ? 0 : 1);
    })
    .catch((err) => {
      console.error('Error:', err);
      process.exit(1);
    });
}

module.exports = UIFeedbackLoop;
