#!/usr/bin/env node
/**
 * SUB-AGENT OUTPUT MONITOR
 * Detects "beauty filtering" where main agent sanitizes sub-agent feedback
 */

const fs = require('fs');
const path = require('path');

class AgentMonitor {
  constructor(logDir = '.subagent-logs') {
    this.logDir = logDir;
    this.filteringDetected = false;
  }

  // Monitor sub-agent interaction
  monitor(event) {
    const { agent, rawOutput, filteredOutput, timestamp } = event;

    const analysis = this.analyzeFiltering(rawOutput, filteredOutput);

    const record = {
      timestamp: timestamp || new Date().toISOString(),
      agent,
      rawLength: rawOutput.length,
      filteredLength: filteredOutput.length,
      filtering: analysis,
      rawOutput,
      filteredOutput
    };

    this.saveLog(agent, record);

    if (analysis.detected) {
      this.filteringDetected = true;
      this.alertFiltering(record);
    }

    return analysis;
  }

  analyzeFiltering(raw, filtered) {
    const analysis = {
      detected: false,
      severity: 'none',
      changes: []
    };

    // Length difference
    const lengthDiff = Math.abs(raw.length - filtered.length);
    const percentDiff = (lengthDiff / raw.length) * 100;

    if (percentDiff > 20) {
      analysis.detected = true;
      analysis.changes.push(`Output reduced by ${percentDiff.toFixed(1)}%`);
    }

    // Content analysis
    const criticalKeywords = [
      'bug', 'error', 'issue', 'problem', 'warning',
      'security', 'vulnerability', 'critical', 'fail',
      'broken', 'incorrect', 'wrong', 'bad'
    ];

    const rawCritical = this.countKeywords(raw, criticalKeywords);
    const filteredCritical = this.countKeywords(filtered, criticalKeywords);

    if (rawCritical > filteredCritical) {
      analysis.detected = true;
      analysis.changes.push(`Critical keywords reduced from ${rawCritical} to ${filteredCritical}`);
      analysis.severity = 'high';
    }

    // Negative sentiment filtering
    const negativePatterns = [
      /poorly\s+designed/gi,
      /serious\s+bug/gi,
      /major\s+issue/gi,
      /not\s+recommended/gi,
      /avoid/gi,
      /dangerous/gi
    ];

    const rawNegative = negativePatterns.filter(p => p.test(raw)).length;
    const filteredNegative = negativePatterns.filter(p => p.test(filtered)).length;

    if (rawNegative > filteredNegative) {
      analysis.detected = true;
      analysis.changes.push(`Negative feedback filtered (${rawNegative} -> ${filteredNegative})`);
      if (analysis.severity !== 'high') analysis.severity = 'medium';
    }

    // Exact match check
    if (raw !== filtered && !analysis.detected) {
      analysis.detected = true;
      analysis.changes.push('Content modified but no specific patterns detected');
      analysis.severity = 'low';
    }

    return analysis;
  }

  countKeywords(text, keywords) {
    let count = 0;
    const lowerText = text.toLowerCase();
    keywords.forEach(keyword => {
      const regex = new RegExp(keyword, 'gi');
      const matches = lowerText.match(regex);
      if (matches) count += matches.length;
    });
    return count;
  }

  saveLog(agent, record) {
    const dir = path.join(this.logDir);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const logFile = path.join(dir, `${agent}-${Date.now()}.json`);
    fs.writeFileSync(logFile, JSON.stringify(record, null, 2));

    return logFile;
  }

  alertFiltering(record) {
    console.warn('\n⚠️  SUB-AGENT OUTPUT FILTERING DETECTED ⚠️');
    console.warn(`Agent: ${record.agent}`);
    console.warn(`Severity: ${record.filtering.severity.toUpperCase()}`);
    console.warn(`Changes:`);
    record.filtering.changes.forEach(change => {
      console.warn(`  - ${change}`);
    });
    console.warn('\n⚡ Recommendation: Review raw sub-agent output for critical feedback\n');
  }

  // Generate report of all filtering incidents
  generateReport() {
    if (!fs.existsSync(this.logDir)) {
      return { totalLogs: 0, filteringIncidents: 0 };
    }

    const logs = fs.readdirSync(this.logDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          return JSON.parse(fs.readFileSync(path.join(this.logDir, f), 'utf8'));
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const filteringIncidents = logs.filter(log => log.filtering?.detected);

    const report = {
      totalLogs: logs.length,
      filteringIncidents: filteringIncidents.length,
      filteringRate: logs.length > 0 ? (filteringIncidents.length / logs.length * 100).toFixed(1) : 0,
      bySeverity: {
        high: filteringIncidents.filter(i => i.filtering.severity === 'high').length,
        medium: filteringIncidents.filter(i => i.filtering.severity === 'medium').length,
        low: filteringIncidents.filter(i => i.filtering.severity === 'low').length
      },
      incidents: filteringIncidents.map(i => ({
        agent: i.agent,
        timestamp: i.timestamp,
        severity: i.filtering.severity,
        changes: i.filtering.changes
      }))
    };

    return report;
  }

  // Simulate filtering for demonstration
  static demo() {
    const monitor = new AgentMonitor();

    console.log('Demo: Sub-Agent Output Monitoring\n');

    // Scenario 1: Heavy filtering
    const scenario1 = {
      agent: 'code-reviewer',
      rawOutput: 'Critical security vulnerability found in authentication module. The password hashing is poorly designed and uses MD5 which is broken. This is a serious bug that must be fixed immediately. Additionally, there are 5 other major issues with input validation that could lead to SQL injection.',
      filteredOutput: 'The authentication module looks good overall. Just some minor improvements needed for security best practices.',
      timestamp: new Date().toISOString()
    };

    console.log('Scenario 1: Code Review with Heavy Filtering');
    monitor.monitor(scenario1);

    // Scenario 2: No filtering
    const scenario2 = {
      agent: 'test-specialist',
      rawOutput: 'Test suite is comprehensive with 95% coverage. All tests passing. Good use of mocking and edge case handling.',
      filteredOutput: 'Test suite is comprehensive with 95% coverage. All tests passing. Good use of mocking and edge case handling.',
      timestamp: new Date().toISOString()
    };

    console.log('\nScenario 2: Test Review with No Filtering');
    monitor.monitor(scenario2);

    // Generate report
    console.log('\n=== Monitoring Report ===');
    const report = monitor.generateReport();
    console.log(JSON.stringify(report, null, 2));
  }
}

// CLI
if (require.main === module) {
  const command = process.argv[2];

  if (command === 'demo') {
    AgentMonitor.demo();
  } else if (command === 'report') {
    const monitor = new AgentMonitor();
    const report = monitor.generateReport();
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('Usage: agent-monitor.js [demo|report]');
  }
}

module.exports = AgentMonitor;
