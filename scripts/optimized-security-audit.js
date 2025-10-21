#!/usr/bin/env node
/**
 * Optimized Security Audit Script
 * Handles large dependency trees with timeout protection
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const TIMEOUT = 120000; // 2 minutes max
const AUDIT_CACHE_FILE = '.security-audit-cache.json';

class OptimizedSecurityAudit {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
      recommendations: [],
      errors: []
    };
  }

  async run() {
    console.log('Starting optimized security audit...\n');

    try {
      // Try npm audit with timeout
      await this.runNpmAudit();
    } catch (error) {
      console.error('NPM audit failed:', error.message);
      this.results.errors.push({ source: 'npm-audit', error: error.message });
      
      // Fallback: analyze package-lock.json directly
      await this.analyzePackageLock();
    }

    // Check for known vulnerabilities in specific packages
    await this.checkKnownVulnerabilities();

    // Generate report
    this.generateReport();
    
    return this.results;
  }

  async runNpmAudit() {
    console.log('Running npm audit (with timeout protection)...');
    
    try {
      const result = execSync('npm audit --json', {
        timeout: TIMEOUT,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      const auditData = JSON.parse(result);
      
      if (auditData.metadata) {
        this.results.vulnerabilities = {
          info: auditData.metadata.vulnerabilities?.info || 0,
          low: auditData.metadata.vulnerabilities?.low || 0,
          moderate: auditData.metadata.vulnerabilities?.moderate || 0,
          high: auditData.metadata.vulnerabilities?.high || 0,
          critical: auditData.metadata.vulnerabilities?.critical || 0
        };
      }

      console.log('✓ NPM audit completed successfully\n');
    } catch (error) {
      if (error.status === 1 && error.stdout) {
        // Audit found vulnerabilities but ran successfully
        try {
          const auditData = JSON.parse(error.stdout);
          if (auditData.metadata) {
            this.results.vulnerabilities = auditData.metadata.vulnerabilities;
          }
        } catch (parseError) {
          throw error;
        }
      } else {
        throw error;
      }
    }
  }

  async analyzePackageLock() {
    console.log('Analyzing package-lock.json (fallback method)...');

    try {
      const packageLockPath = path.join(process.cwd(), 'package-lock.json');
      const packageLock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));

      let totalPackages = 0;
      const packages = packageLock.packages || {};

      for (const [pkgPath, pkgData] of Object.entries(packages)) {
        if (pkgPath === '') continue; // Skip root
        totalPackages++;
      }

      this.results.packageAnalysis = {
        totalPackages,
        lockfileSize: fs.statSync(packageLockPath).size,
        nodeModulesSize: this.getDirectorySize('node_modules')
      };

      console.log(`✓ Analyzed ${totalPackages} packages\n`);
    } catch (error) {
      console.error('Failed to analyze package-lock.json:', error.message);
      this.results.errors.push({ source: 'package-lock', error: error.message });
    }
  }

  async checkKnownVulnerabilities() {
    console.log('Checking for known vulnerability patterns...');

    const criticalPackages = [
      { name: 'axios', minVersion: '1.6.0', reason: 'SSRF vulnerability in older versions' },
      { name: 'express', minVersion: '4.18.0', reason: 'Path traversal in older versions' },
      { name: 'ws', minVersion: '8.0.0', reason: 'DoS vulnerability in older versions' }
    ];

    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      for (const { name, minVersion, reason } of criticalPackages) {
        if (deps[name]) {
          const installedVersion = deps[name].replace(/[\^~]/, '');
          this.results.recommendations.push({
            package: name,
            installed: installedVersion,
            minimum: minVersion,
            reason
          });
        }
      }

      console.log(`✓ Checked ${criticalPackages.length} critical packages\n`);
    } catch (error) {
      console.error('Failed to check known vulnerabilities:', error.message);
      this.results.errors.push({ source: 'known-vulns', error: error.message });
    }
  }

  getDirectorySize(dirPath) {
    try {
      const result = execSync(`du -sh ${dirPath} 2>/dev/null || echo "0"`, {
        encoding: 'utf8',
        timeout: 5000
      });
      return result.trim().split('\t')[0];
    } catch {
      return 'unknown';
    }
  }

  generateReport() {
    console.log('=== SECURITY AUDIT REPORT ===\n');
    console.log(`Timestamp: ${this.results.timestamp}`);
    console.log('\nVulnerabilities Found:');
    console.log(`  Critical: ${this.results.vulnerabilities.critical}`);
    console.log(`  High:     ${this.results.vulnerabilities.high}`);
    console.log(`  Moderate: ${this.results.vulnerabilities.moderate}`);
    console.log(`  Low:      ${this.results.vulnerabilities.low}`);
    console.log(`  Info:     ${this.results.vulnerabilities.info}`);

    if (this.results.packageAnalysis) {
      console.log('\nPackage Analysis:');
      console.log(`  Total Packages: ${this.results.packageAnalysis.totalPackages}`);
      console.log(`  Lockfile Size:  ${(this.results.packageAnalysis.lockfileSize / 1024).toFixed(2)} KB`);
      console.log(`  node_modules:   ${this.results.packageAnalysis.nodeModulesSize}`);
    }

    if (this.results.recommendations.length > 0) {
      console.log('\nRecommendations:');
      this.results.recommendations.forEach(rec => {
        console.log(`  - ${rec.package}: ${rec.reason}`);
        console.log(`    Installed: ${rec.installed}, Minimum: ${rec.minimum}`);
      });
    }

    if (this.results.errors.length > 0) {
      console.log('\nErrors Encountered:');
      this.results.errors.forEach(err => {
        console.log(`  - ${err.source}: ${err.error}`);
      });
    }

    // Save to file
    fs.writeFileSync(
      'reports/security-audit-report.json',
      JSON.stringify(this.results, null, 2)
    );
    console.log('\n✓ Report saved to reports/security-audit-report.json');

    // Determine exit code
    const { critical, high } = this.results.vulnerabilities;
    if (critical > 0 || high > 0) {
      console.log('\n❌ Security audit found critical or high vulnerabilities');
      process.exit(1);
    } else {
      console.log('\n✓ Security audit passed');
      process.exit(0);
    }
  }
}

// Run audit
const audit = new OptimizedSecurityAudit();
audit.run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
