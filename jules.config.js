/**
 * Jules Automation Configuration
 *
 * This configuration file defines how Jules operates within the repository
 * for automated fixing, optimization, and continuous monitoring.
 */

module.exports = {
  // Core Jules Configuration
  version: '1.0.0',
  enabled: true,

  // Automation Settings
  automation: {
    // Automatically fix common issues when detected
    autoFix: true,

    // Automatically optimize code and configurations
    autoOptimize: true,

    // Automatically validate repository health
    autoValidate: true,

    // Enable continuous monitoring
    continuousMonitoring: true,

    // Run on every commit
    runOnCommit: true,

    // Run on pull requests
    runOnPullRequest: true,
  },

  // Health Checks Configuration
  checks: {
    // Check for syntax errors in code files
    syntax: {
      enabled: true,
      fileTypes: ['.js', '.json', '.yml', '.yaml', '.md'],
      severity: 'error',
    },

    // Check for dependency issues
    dependencies: {
      enabled: true,
      checkUpdates: true,
      checkVulnerabilities: true,
      severity: 'warning',
    },

    // Check for security vulnerabilities
    security: {
      enabled: true,
      scanDependencies: true,
      scanCode: true,
      severity: 'critical',
    },

    // Check for performance issues
    performance: {
      enabled: true,
      profileCode: false,
      checkBuildTimes: true,
      severity: 'info',
    },

    // Check workflow configurations
    workflows: {
      enabled: true,
      validateYAML: true,
      checkPermissions: true,
      severity: 'error',
    },

    // Check code quality
    codeQuality: {
      enabled: true,
      checkComplexity: true,
      checkDuplication: true,
      severity: 'warning',
    },
  },

  // Auto-fix Rules
  fixes: {
    // Automatically fix formatting issues
    formatting: true,

    // Automatically fix simple syntax errors
    syntax: true,

    // Automatically update dependencies to patch versions
    dependencies: false,

    // Automatically fix workflow configuration issues
    workflows: true,

    // Automatically fix common security issues
    security: true,
  },

  // Optimization Settings
  optimization: {
    // Optimize workflow run times
    workflows: true,

    // Optimize dependency tree
    dependencies: true,

    // Optimize build processes
    builds: true,

    // Remove unused code
    deadCode: false,
  },

  // Notification Configuration
  notifications: {
    // Notify on successful operations
    onSuccess: {
      enabled: true,
      channels: ['console', 'workflow'],
    },

    // Notify on failures
    onFailure: {
      enabled: true,
      channels: ['console', 'workflow', 'commit-status'],
    },

    // Notify when fixes are applied
    onFix: {
      enabled: true,
      channels: ['console', 'workflow'],
    },

    // Notify on critical issues
    onCritical: {
      enabled: true,
      channels: ['console', 'workflow', 'commit-status'],
    },
  },

  // Integration Settings
  integrations: {
    // GitHub Actions integration
    githubActions: {
      enabled: true,
      workflowFile: '.github/workflows/blank.yml',
      runOnPush: true,
      runOnPR: true,
    },

    // CI/CD integration
    cicd: {
      enabled: true,
      platform: 'github-actions',
      autoTrigger: true,
    },

    // Git hooks integration
    gitHooks: {
      enabled: false,
      preCommit: false,
      prePush: false,
    },
  },

  // Reporting Configuration
  reporting: {
    // Generate detailed reports
    detailed: true,

    // Include metrics in reports
    includeMetrics: true,

    // Report format
    format: 'markdown',

    // Save reports to file
    saveToFile: false,

    // Report location
    outputPath: './reports/jules-report.md',
  },

  // Exclusions
  exclude: {
    // Files to exclude from checks
    files: ['node_modules/**', 'dist/**', 'build/**', '.git/**', '*.min.js'],

    // Directories to exclude
    directories: ['node_modules', 'dist', 'build', '.git'],
  },

  // Advanced Settings
  advanced: {
    // Maximum concurrent operations
    maxConcurrency: 4,

    // Timeout for operations (ms)
    timeout: 300000,

    // Retry failed operations
    retryOnFailure: true,

    // Maximum retry attempts
    maxRetries: 3,

    // Enable verbose logging
    verbose: false,

    // Enable debug mode
    debug: false,
  },
};
