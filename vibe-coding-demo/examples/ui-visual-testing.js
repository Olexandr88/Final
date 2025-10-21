#!/usr/bin/env node
/**
 * VISUAL UI TESTING WORKFLOW
 *
 * Demonstrates the iterative UI design process from the vibe coding series:
 * 1. Claude generates UI code
 * 2. Renders it in headless browser
 * 3. Takes screenshot
 * 4. Analyzes against design spec
 * 5. Iterates until perfect
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function visualUITest(htmlFile, referenceImage = null) {
  console.log('=== Visual UI Testing Workflow ===\n');

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Set viewport for consistent screenshots
  await page.setViewport({ width: 1280, height: 720 });

  // Load the HTML file
  const htmlPath = path.resolve(htmlFile);
  await page.goto(`file://${htmlPath}`);

  console.log(`✓ Loaded: ${htmlFile}`);

  // Take screenshot
  const screenshotPath = path.join(__dirname, '../screenshots', `${Date.now()}.png`);
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true });

  console.log(`✓ Screenshot saved: ${screenshotPath}`);

  // Analyze the page (simulated - in real workflow, Claude would analyze this)
  const analysis = await page.evaluate(() => {
    const issues = [];

    // Check for common design issues
    const buttons = document.querySelectorAll('button');
    buttons.forEach((btn, i) => {
      const style = window.getComputedStyle(btn);
      if (style.cursor !== 'pointer') {
        issues.push(`Button ${i}: Missing cursor:pointer`);
      }
    });

    // Check color contrast (simplified)
    const body = window.getComputedStyle(document.body);
    const bgColor = body.backgroundColor;
    const color = body.color;

    // Check if fonts are loaded
    const fonts = document.fonts;
    const fontsStatus = fonts.status;

    return {
      title: document.title,
      bodyBg: bgColor,
      textColor: color,
      fontsLoaded: fontsStatus === 'loaded',
      buttonCount: buttons.length,
      issues,
      dimensions: {
        width: document.body.scrollWidth,
        height: document.body.scrollHeight,
      },
    };
  });

  console.log('\n=== Analysis Results ===');
  console.log(`Title: ${analysis.title}`);
  console.log(`Dimensions: ${analysis.dimensions.width}x${analysis.dimensions.height}px`);
  console.log(`Background: ${analysis.bodyBg}`);
  console.log(`Text Color: ${analysis.textColor}`);
  console.log(`Fonts Loaded: ${analysis.fontsLoaded ? '✓' : '✗'}`);
  console.log(`Buttons: ${analysis.buttonCount}`);

  if (analysis.issues.length > 0) {
    console.log('\n⚠ Issues Found:');
    analysis.issues.forEach((issue) => console.log(`  - ${issue}`));
  } else {
    console.log('\n✓ No issues detected');
  }

  await browser.close();

  return {
    screenshotPath,
    analysis,
  };
}

// Example usage
if (require.main === module) {
  const htmlFile = process.argv[2] || path.join(__dirname, 'sample-ui.html');

  visualUITest(htmlFile)
    .then((result) => {
      console.log('\n=== Next Steps ===');
      console.log('1. Review screenshot at:', result.screenshotPath);
      console.log('2. Compare with design spec');
      console.log('3. Prompt Claude to fix issues');
      console.log('4. Run this script again to verify');
      console.log('\nVibe Coding Workflow: Iterate until perfect!');
    })
    .catch((err) => {
      console.error('Error:', err);
      process.exit(1);
    });
}

module.exports = visualUITest;
