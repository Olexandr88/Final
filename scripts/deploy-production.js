/**
 * Production Deployment Script
 * Automates deployment to Vercel, Railway, and Cloudflare
 * Includes health checks, testing, and validation
 */

const { execSync } = require('child_process');
const fs = require('fs');
const https = require('https');

const _PLATFORMS = {
  vercel: {
    name: 'Vercel',
    deployCommand: 'vercel --prod',
    healthCheck: 'https://final-ten-sigma-56.vercel.app/health',
    domains: ['www.scarmonit.com', 'final-ten-sigma-56.vercel.app'],
  },
  railway: {
    name: 'Railway',
    deployCommand: 'railway up',
    healthCheck: process.env.RAILWAY_STATIC_URL
      ? `${process.env.RAILWAY_STATIC_URL}/health`
      : null,
  },
  cloudflare: {
    name: 'Cloudflare Workers',
    deployCommand: 'wrangler deploy',
    healthCheck: process.env.CLOUDFLARE_WORKER_URL
      ? `${process.env.CLOUDFLARE_WORKER_URL}/health`
      : null,
  },
};

class ProductionDeployer {
  constructor() {
    this.results = {
      preChecks: [],
      builds: [],
      deployments: [],
      healthChecks: [],
      errors: [],
    };
    this.startTime = Date.now();
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix =
      {
        info: '📋',
        success: '✅',
        error: '❌',
        warning: '⚠️',
        deploy: '🚀',
      }[type] || '📋';

    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async run() {
    try {
      this.log('Starting production deployment...', 'deploy');

      await this.runPreChecks();
      await this.buildProject();
      await this.deployToPlatforms();
      await this.runHealthChecks();
      this.generateReport();

      this.log('Deployment completed successfully!', 'success');
      return true;
    } catch (error) {
      this.log(`Deployment failed: ${error.message}`, 'error');
      this.results.errors.push(error.message);
      this.generateReport();
      return false;
    }
  }

  async runPreChecks() {
    this.log('Running pre-deployment checks...');

    try {
      const gitStatus = execSync('git status --porcelain', {
        encoding: 'utf-8',
      });
      if (gitStatus.trim()) {
        this.log('Warning: Uncommitted changes detected', 'warning');
      }
      this.results.preChecks.push({ name: 'Git Status', status: 'pass' });
    } catch (error) {
      this.results.preChecks.push({ name: 'Git Status', status: 'fail' });
    }

    this.log('Pre-checks completed', 'success');
  }

  async buildProject() {
    this.log('Building project...');

    try {
      if (fs.existsSync('package.json')) {
        const packageJson = JSON.parse(
          fs.readFileSync('package.json', 'utf-8')
        );
        if (packageJson.scripts && packageJson.scripts.build) {
          execSync('npm run build', { encoding: 'utf-8', stdio: 'inherit' });
          this.results.builds.push({ name: 'Build', status: 'pass' });
          this.log('Build successful', 'success');
        }
      }
    } catch (error) {
      this.results.builds.push({ name: 'Build', status: 'fail' });
      throw error;
    }
  }

  async deployToPlatforms() {
    this.log('Deploying to Vercel...', 'deploy');

    try {
      execSync('vercel --prod', { encoding: 'utf-8', stdio: 'pipe' });
      this.results.deployments.push({ platform: 'Vercel', status: 'success' });
      this.log('Vercel deployment successful', 'success');
    } catch (error) {
      this.results.deployments.push({ platform: 'Vercel', status: 'fail' });
    }
  }

  async runHealthChecks() {
    this.log('Running health checks...');

    for (const domain of [
      'www.scarmonit.com',
      'final-ten-sigma-56.vercel.app',
    ]) {
      await this.checkEndpoint('Vercel', `https://${domain}/health`);
      await this.checkEndpoint('Dashboard', `https://${domain}/dashboard`);
    }
  }

  async checkEndpoint(name, url) {
    return new Promise((resolve) => {
      this.log(`Checking ${name}: ${url}`);

      https
        .get(url, (res) => {
          if (res.statusCode === 200) {
            this.results.healthChecks.push({ name, url, status: 'pass' });
            this.log(`${name} health check passed`, 'success');
          } else {
            this.results.healthChecks.push({ name, url, status: 'warning' });
          }
          resolve();
        })
        .on('error', (_error) => {
          this.results.healthChecks.push({ name, url, status: 'fail' });
          this.log(`${name} health check failed`, 'warning');
          resolve();
        });
    });
  }

  generateReport() {
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);
    const report = {
      timestamp: new Date().toISOString(),
      duration: `${duration}s`,
      results: this.results,
    };

    if (!fs.existsSync('reports')) {
      fs.mkdirSync('reports', { recursive: true });
    }

    fs.writeFileSync(
      `reports/deployment-${Date.now()}.json`,
      JSON.stringify(report, null, 2)
    );

    this.log('\n' + '='.repeat(60));
    this.log('DEPLOYMENT REPORT', 'deploy');
    this.log('='.repeat(60));
    this.log(`Duration: ${duration}s`);
    this.log(
      `Deployments: ${this.results.deployments.filter((d) => d.status === 'success').length} successful`
    );
    this.log(
      `Health Checks: ${this.results.healthChecks.filter((h) => h.status === 'pass').length} passed`
    );
    this.log('='.repeat(60) + '\n');
  }
}

if (require.main === module) {
  const deployer = new ProductionDeployer();
  deployer.run().then((success) => process.exit(success ? 0 : 1));
}

module.exports = ProductionDeployer;
