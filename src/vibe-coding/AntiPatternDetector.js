/**
 * Anti-Pattern Detection System
 * Detects and warns about the "Seven Deadly Sins" of agentic development
 */

import { EventEmitter } from 'events';

export class AntiPatternDetector extends EventEmitter {
  constructor() {
    super();
    this.detectors = new Map();
    this.initializeDetectors();
  }

  initializeDetectors() {
    this.registerDetector('vague-prompting', this.detectVaguePrompting.bind(this));
    this.registerDetector('monolithic-tasking', this.detectMonolithicTasking.bind(this));
    this.registerDetector('context-neglect', this.detectContextNeglect.bind(this));
    this.registerDetector('blind-trust', this.detectBlindTrust.bind(this));
    this.registerDetector('environmental-contamination', this.detectEnvironmentalContamination.bind(this));
    this.registerDetector('tool-ignorance', this.detectToolIgnorance.bind(this));
    this.registerDetector('premature-vibing', this.detectPrematureVibing.bind(this));
  }

  registerDetector(name, detectorFn) {
    this.detectors.set(name, detectorFn);
  }

  async detectAll(context) {
    const results = {
      timestamp: Date.now(),
      violations: [],
      warnings: [],
      score: 100
    };

    for (const [name, detector] of this.detectors) {
      try {
        const detection = await detector(context);

        if (detection.violated) {
          results.violations.push({
            type: name,
            severity: detection.severity || 'high',
            message: detection.message,
            recommendation: detection.recommendation
          });

          results.score -= detection.penalty || 15;
        }

        if (detection.warning) {
          results.warnings.push({
            type: name,
            message: detection.message,
            recommendation: detection.recommendation
          });

          results.score -= detection.penalty || 5;
        }

      } catch (error) {
        this.emit('detector:error', { name, error });
      }
    }

    results.score = Math.max(0, results.score);
    results.grade = this.calculateGrade(results.score);

    this.emit('detection:complete', results);
    return results;
  }

  detectVaguePrompting(context) {
    const prompt = context.prompt || context.task || '';

    const issues = [];
    let violated = false;

    if (prompt.length < 20) {
      issues.push('Prompt is too short');
      violated = true;
    }

    const vagueWords = ['stuff', 'things', 'something', 'somehow', 'maybe', 'kinda', 'sort of'];
    const hasVagueLanguage = vagueWords.some(word => prompt.toLowerCase().includes(word));

    if (hasVagueLanguage) {
      issues.push('Contains vague language');
      violated = true;
    }

    const hasNoSpecifics = !prompt.match(/\b(file|function|class|variable|table|column|endpoint|route)\b/i);

    if (hasNoSpecifics && prompt.length > 0 && prompt.length < 100) {
      issues.push('Lacks specific technical details');
      violated = true;
    }

    if (violated) {
      return {
        violated: true,
        severity: 'critical',
        message: `Vague prompting detected: ${issues.join(', ')}`,
        recommendation: 'Be specific: mention files, functions, tech stack, and desired outcome',
        penalty: 20
      };
    }

    return { violated: false };
  }

  detectMonolithicTasking(context) {
    const prompt = context.prompt || context.task || '';

    const monolithicIndicators = [
      /build.*entire/i,
      /implement.*whole/i,
      /create.*complete/i,
      /build.*full/i,
      /entire.*system/i,
      /whole.*application/i
    ];

    const isMonolithic = monolithicIndicators.some(pattern => pattern.test(prompt));

    const featureCount = (prompt.match(/\band\b/gi) || []).length;
    const hasManyFeatures = featureCount > 3;

    if (isMonolithic || hasManyFeatures) {
      return {
        violated: true,
        severity: 'high',
        message: `Monolithic task detected: Task appears too large and complex`,
        recommendation: 'Break down into smaller, incremental tasks (use Explore → Plan → Code → Commit)',
        penalty: 18
      };
    }

    return { violated: false };
  }

  detectContextNeglect(context) {
    const conversationLength = context.conversationLength || 0;
    const lastClearAt = context.lastClearAt || 0;
    const messagesSinceClear = conversationLength - lastClearAt;

    if (messagesSinceClear > 50) {
      return {
        violated: true,
        severity: 'high',
        message: `Context window bloat: ${messagesSinceClear} messages since last clear`,
        recommendation: 'Use /clear or /compact to manage context window',
        penalty: 15
      };
    }

    if (messagesSinceClear > 30) {
      return {
        warning: true,
        message: `Context getting large: ${messagesSinceClear} messages`,
        recommendation: 'Consider using /compact to summarize',
        penalty: 5
      };
    }

    return { violated: false };
  }

  detectBlindTrust(context) {
    const hasVerification = context.hasVerification || false;
    const hasTests = context.hasTests || false;
    const hasManualReview = context.hasManualReview || false;

    if (!hasVerification && !hasTests && !hasManualReview) {
      return {
        violated: true,
        severity: 'high',
        message: 'Blind trust: No verification of AI output detected',
        recommendation: 'Always verify: run tests, review code, check claims',
        penalty: 20
      };
    }

    return { violated: false };
  }

  detectEnvironmentalContamination(context) {
    const workspacePath = context.workspacePath || '';
    const isIsolated = context.isIsolated || false;

    const dangerousPaths = [
      '/home/',
      '/Users/',
      'C:\\Users\\',
      '/projects/',
      '/workspace/'
    ];

    const inDangerousPath = dangerousPaths.some(p => workspacePath.includes(p));

    if (inDangerousPath && !isIsolated) {
      return {
        violated: true,
        severity: 'critical',
        message: 'Environmental contamination: Running in non-isolated directory',
        recommendation: 'Create dedicated claude-workspace directory for AI operations',
        penalty: 25
      };
    }

    return { violated: false };
  }

  detectToolIgnorance(context) {
    const hasClaudeMd = context.hasClaudeMd || false;
    const hasSubAgents = context.hasSubAgents || false;
    const hasHooks = context.hasHooks || false;
    const hasMCP = context.hasMCP || false;

    const toolCount = [hasClaudeMd, hasSubAgents, hasHooks, hasMCP].filter(Boolean).length;

    if (toolCount === 0 && context.taskComplexity === 'high') {
      return {
        violated: true,
        severity: 'high',
        message: 'Tool ignorance: Complex task without proper tooling',
        recommendation: 'Set up CLAUDE.md, sub-agents, hooks, and MCP connections',
        penalty: 18
      };
    }

    if (toolCount < 2 && context.taskComplexity === 'medium') {
      return {
        warning: true,
        message: 'Limited tooling for medium complexity task',
        recommendation: 'Consider adding CLAUDE.md and sub-agents',
        penalty: 8
      };
    }

    return { violated: false };
  }

  detectPrematureVibing(context) {
    const hasClaudeMd = context.hasClaudeMd || false;
    const hasPlan = context.hasPlan || false;
    const hasTests = context.hasTests || false;

    const readinessScore = [hasClaudeMd, hasPlan, hasTests].filter(Boolean).length;

    if (readinessScore === 0) {
      return {
        violated: true,
        severity: 'critical',
        message: 'Premature vibing: No structure in place before starting',
        recommendation: 'Create CLAUDE.md, write plan, set up tests BEFORE coding',
        penalty: 22
      };
    }

    if (readinessScore === 1) {
      return {
        warning: true,
        message: 'Insufficient structure for vibe coding',
        recommendation: 'Add planning and testing infrastructure',
        penalty: 10
      };
    }

    return { violated: false };
  }

  calculateGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  generateReport(detectionResults) {
    const report = {
      title: 'Vibe Coding Quality Report',
      timestamp: new Date(detectionResults.timestamp).toISOString(),
      score: detectionResults.score,
      grade: detectionResults.grade,
      summary: {
        violations: detectionResults.violations.length,
        warnings: detectionResults.warnings.length,
        status: detectionResults.grade === 'F' ? 'FAILED' : detectionResults.grade === 'D' ? 'POOR' : detectionResults.grade === 'C' ? 'ACCEPTABLE' : 'GOOD'
      },
      violations: detectionResults.violations,
      warnings: detectionResults.warnings,
      recommendations: this.generateRecommendations(detectionResults)
    };

    return report;
  }

  generateRecommendations(results) {
    const recommendations = [];

    if (results.violations.length > 0) {
      recommendations.push({
        priority: 'CRITICAL',
        action: 'Fix all violations before proceeding',
        details: results.violations.map(v => `- ${v.message}: ${v.recommendation}`)
      });
    }

    if (results.warnings.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        action: 'Address warnings to improve workflow quality',
        details: results.warnings.map(w => `- ${w.message}: ${w.recommendation}`)
      });
    }

    if (results.score < 70) {
      recommendations.push({
        priority: 'CRITICAL',
        action: 'Workflow quality below acceptable threshold',
        details: ['Review vibe coding best practices', 'Set up proper environment and tooling']
      });
    }

    return recommendations;
  }
}

export default AntiPatternDetector;
