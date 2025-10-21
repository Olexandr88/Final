#!/usr/bin/env node
/**
 * SESSION RESET & COMPRESSION TOOL
 * Implements context management and session handoff
 */

const fs = require('fs');
const path = require('path');
const ContextManager = require('./context-manager');

class SessionManager {
  constructor(projectRoot = process.cwd()) {
    this.root = projectRoot;
    this.contextManager = new ContextManager(projectRoot);
    this.sessionDir = path.join(this.root, '.claude-sessions');
  }

  // Save current session state
  async saveSession(name = null) {
    const sessionName = name || `session-${Date.now()}`;

    console.log(`💾 Saving session: ${sessionName}\n`);

    // Generate comprehensive summary
    const summary = await this.contextManager.summarizeSession(sessionName);

    // Save active files state
    const state = {
      name: sessionName,
      timestamp: new Date().toISOString(),
      summary: summary.summary,
      environment: this.captureEnvironment(),
      recommendations: this.generateRecommendations(),
    };

    const stateFile = path.join(this.sessionDir, `${sessionName}-state.json`);
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

    console.log('✓ Session saved:');
    console.log(`  Summary: ${summary.file}`);
    console.log(`  State: ${stateFile}`);

    return state;
  }

  // Load previous session
  loadSession(name = null) {
    if (!fs.existsSync(this.sessionDir)) {
      console.log('No previous sessions found');
      return null;
    }

    let sessionFile;

    if (name) {
      sessionFile = path.join(this.sessionDir, `${name}-state.json`);
    } else {
      // Load most recent
      const files = fs
        .readdirSync(this.sessionDir)
        .filter((f) => f.endsWith('-state.json'))
        .sort()
        .reverse();

      if (files.length === 0) {
        console.log('No session state files found');
        return null;
      }

      sessionFile = path.join(this.sessionDir, files[0]);
    }

    if (!fs.existsSync(sessionFile)) {
      console.log(`Session not found: ${sessionFile}`);
      return null;
    }

    const state = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));

    console.log(`📂 Loading session: ${state.name}`);
    console.log(`   Saved: ${state.timestamp}`);
    console.log(`   Next steps: ${state.recommendations.nextSteps.length} items\n`);

    return state;
  }

  // Generate handoff prompt for new session
  generateHandoffPrompt(sessionState) {
    const state = sessionState || this.loadSession();

    if (!state) {
      return 'No previous session to hand off from.';
    }

    return `
# Session Handoff

## Previous Session: ${state.name}
**Date:** ${state.timestamp}

## What Was Done
${state.summary.changes.log}

## Current State
- Context Size: ${state.summary.contextSize.estimatedTokens.toLocaleString()} tokens
- Issues: ${state.summary.issues.length} detected
- Environment: ${state.environment.node} Node, ${state.environment.os}

## Outstanding Issues
${state.summary.issues
  .map(
    (issue, i) => `
${i + 1}. **${issue.type}**: ${issue.message || issue.count + ' items'}
`
  )
  .join('\n')}

## Next Steps (Priority Order)
${state.recommendations.nextSteps
  .map(
    (step, i) => `
${i + 1}. ${step}
`
  )
  .join('\n')}

## Recommendations
${state.recommendations.focus || 'Continue with next steps above'}

---

**Context has been reset. Use this summary to continue work efficiently.**
`.trim();
  }

  captureEnvironment() {
    const env = {
      node: process.version,
      platform: process.platform,
      os: process.platform,
      cwd: this.root,
    };

    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(this.root, 'package.json'), 'utf8'));
      env.projectName = pkg.name;
      env.version = pkg.version;
    } catch {}

    return env;
  }

  generateRecommendations() {
    const recs = {
      nextSteps: [],
      focus: '',
    };

    const contextSize = this.contextManager.estimateContextSize();

    if (contextSize.estimatedTokens > 80000) {
      recs.focus = 'Context is large - consider breaking into smaller modules';
    }

    // Check project state
    const summary = this.contextManager.summarizeSession();

    if (summary.summary.issues.length > 0) {
      recs.focus = 'Focus on resolving outstanding issues before new features';
      recs.nextSteps.push('Fix detected issues');
    }

    recs.nextSteps.push(...summary.summary.nextSteps);

    return recs;
  }

  // List all sessions
  listSessions() {
    if (!fs.existsSync(this.sessionDir)) {
      console.log('No sessions directory');
      return [];
    }

    const sessions = fs
      .readdirSync(this.sessionDir)
      .filter((f) => f.endsWith('-state.json'))
      .map((f) => {
        try {
          const state = JSON.parse(fs.readFileSync(path.join(this.sessionDir, f), 'utf8'));
          return {
            name: state.name,
            timestamp: state.timestamp,
            issues: state.summary.issues.length,
            nextSteps: state.recommendations.nextSteps.length,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return sessions;
  }

  // Clean old sessions
  cleanOldSessions(keepLast = 10) {
    const sessions = this.listSessions();

    if (sessions.length <= keepLast) {
      console.log(`Only ${sessions.length} sessions - nothing to clean`);
      return 0;
    }

    const toDelete = sessions.slice(keepLast);
    let deleted = 0;

    toDelete.forEach((session) => {
      const stateFile = path.join(this.sessionDir, `${session.name}-state.json`);
      const summaryFile = path.join(this.sessionDir, `${session.name}.md`);

      try {
        if (fs.existsSync(stateFile)) {
          fs.unlinkSync(stateFile);
          deleted++;
        }
        if (fs.existsSync(summaryFile)) {
          fs.unlinkSync(summaryFile);
        }
      } catch (err) {
        console.error(`Error deleting ${session.name}:`, err.message);
      }
    });

    console.log(`✓ Cleaned ${deleted} old sessions`);
    return deleted;
  }
}

// CLI
if (require.main === module) {
  const command = process.argv[2];
  const manager = new SessionManager();

  if (command === 'save') {
    const name = process.argv[3];
    manager.saveSession(name).then(() => {
      console.log('\n✓ Session saved successfully');
    });
  } else if (command === 'load') {
    const name = process.argv[3];
    const state = manager.loadSession(name);

    if (state) {
      console.log(manager.generateHandoffPrompt(state));
    }
  } else if (command === 'list') {
    const sessions = manager.listSessions();
    console.log(`Found ${sessions.length} sessions:\n`);
    sessions.forEach((s, i) => {
      console.log(`${i + 1}. ${s.name}`);
      console.log(`   ${s.timestamp}`);
      console.log(`   Issues: ${s.issues} | Next steps: ${s.nextSteps}\n`);
    });
  } else if (command === 'clean') {
    const keep = parseInt(process.argv[3]) || 10;
    manager.cleanOldSessions(keep);
  } else {
    console.log('Session Manager - Context reset and compression');
    console.log('\nUsage:');
    console.log('  session-manager.js save [name]     - Save current session');
    console.log('  session-manager.js load [name]     - Load session (latest if no name)');
    console.log('  session-manager.js list            - List all sessions');
    console.log('  session-manager.js clean [keep]    - Clean old sessions (keep last 10)');
  }
}

module.exports = SessionManager;
