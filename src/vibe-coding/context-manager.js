/**
 * Vibe Coding Context Manager
 * Handles context compression, clearing, and summarization
 */

import { EventEmitter } from 'events';

export class ContextManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxContextSize = options.maxContextSize || 100000;
    this.compressionThreshold = options.compressionThreshold || 80000;
    this.sessions = new Map();
  }

  createSession(sessionId) {
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId);
    }

    const session = {
      id: sessionId,
      messages: [],
      summaries: [],
      metadata: {
        created: Date.now(),
        lastUpdated: Date.now(),
        tokenCount: 0
      }
    };

    this.sessions.set(sessionId, session);
    this.emit('session:created', session);
    return session;
  }

  addMessage(sessionId, message) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const enrichedMessage = {
      ...message,
      timestamp: Date.now(),
      tokenCount: this.estimateTokens(message.content)
    };

    session.messages.push(enrichedMessage);
    session.metadata.lastUpdated = Date.now();
    session.metadata.tokenCount += enrichedMessage.tokenCount;

    if (session.metadata.tokenCount > this.compressionThreshold) {
      this.compressSession(sessionId);
    }

    this.emit('message:added', { sessionId, message: enrichedMessage });
    return enrichedMessage;
  }

  estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }

  async compressSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const messagesToCompress = session.messages.slice(0, -10);

    if (messagesToCompress.length === 0) {
      return null;
    }

    const summary = this.generateSummary(messagesToCompress);

    session.summaries.push({
      timestamp: Date.now(),
      messageCount: messagesToCompress.length,
      summary,
      tokensSaved: messagesToCompress.reduce((sum, m) => sum + m.tokenCount, 0)
    });

    session.messages = session.messages.slice(-10);
    session.metadata.tokenCount = session.messages.reduce((sum, m) => sum + m.tokenCount, 0);

    this.emit('session:compressed', { sessionId, summary });
    return summary;
  }

  generateSummary(messages) {
    const codeChanges = [];
    const decisions = [];
    const issues = [];
    const features = [];

    for (const msg of messages) {
      const content = msg.content.toLowerCase();

      if (content.includes('edit') || content.includes('write') || content.includes('modify')) {
        codeChanges.push(this.extractCodeChange(msg));
      }

      if (content.includes('decision') || content.includes('chosen') || content.includes('approach')) {
        decisions.push(this.extractDecision(msg));
      }

      if (content.includes('error') || content.includes('bug') || content.includes('issue')) {
        issues.push(this.extractIssue(msg));
      }

      if (content.includes('feature') || content.includes('implement') || content.includes('add')) {
        features.push(this.extractFeature(msg));
      }
    }

    return {
      codeChanges: codeChanges.filter(Boolean),
      decisions: decisions.filter(Boolean),
      issues: issues.filter(Boolean),
      features: features.filter(Boolean),
      messageCount: messages.length,
      timespan: {
        start: messages[0]?.timestamp,
        end: messages[messages.length - 1]?.timestamp
      }
    };
  }

  extractCodeChange(message) {
    const content = message.content;
    const fileMatch = content.match(/(?:file|path):\s*([^\s]+)/i);
    const descMatch = content.match(/(?:changed?|modified?|updated?):\s*([^\n]+)/i);

    if (fileMatch || descMatch) {
      return {
        file: fileMatch?.[1],
        description: descMatch?.[1] || 'Code modification',
        timestamp: message.timestamp
      };
    }
    return null;
  }

  extractDecision(message) {
    const content = message.content;
    const match = content.match(/(?:decided?|chosen?):\s*([^\n]+)/i);
    if (match) {
      return {
        decision: match[1],
        timestamp: message.timestamp
      };
    }
    return null;
  }

  extractIssue(message) {
    const content = message.content;
    const match = content.match(/(?:error|bug|issue):\s*([^\n]+)/i);
    if (match) {
      return {
        issue: match[1],
        timestamp: message.timestamp
      };
    }
    return null;
  }

  extractFeature(message) {
    const content = message.content;
    const match = content.match(/(?:feature|implement|add):\s*([^\n]+)/i);
    if (match) {
      return {
        feature: match[1],
        timestamp: message.timestamp
      };
    }
    return null;
  }

  clearSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const finalSummary = this.generateSummary(session.messages);
    session.summaries.push({
      timestamp: Date.now(),
      messageCount: session.messages.length,
      summary: finalSummary,
      type: 'final'
    });

    session.messages = [];
    session.metadata.tokenCount = 0;
    session.metadata.lastUpdated = Date.now();

    this.emit('session:cleared', { sessionId, finalSummary });
    return finalSummary;
  }

  getSessionSummary(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    return {
      id: sessionId,
      messageCount: session.messages.length,
      summaryCount: session.summaries.length,
      tokenCount: session.metadata.tokenCount,
      created: session.metadata.created,
      lastUpdated: session.metadata.lastUpdated,
      summaries: session.summaries
    };
  }

  exportSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    return {
      ...session,
      exportedAt: Date.now()
    };
  }

  importSession(sessionData) {
    this.sessions.set(sessionData.id, sessionData);
    this.emit('session:imported', sessionData);
    return sessionData.id;
  }

  deleteSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.delete(sessionId);
      this.emit('session:deleted', { sessionId });
      return true;
    }
    return false;
  }

  listSessions() {
    return Array.from(this.sessions.keys()).map(id => this.getSessionSummary(id));
  }
}

export default ContextManager;
