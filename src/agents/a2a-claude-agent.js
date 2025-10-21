#!/usr/bin/env node
/**
 * Real Claude Agent for A2A System
 * Connects to A2A bridge and uses actual Claude API to respond
 */

import WebSocket from 'ws';
import { ClaudeClient } from '../claude-client.js';
import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';

dotenv.config();

const BRIDGE_URL = process.env.BRIDGE_WS || 'ws://localhost:65028';
const AGENT_ID = process.env.AGENT_ID || 'claude-agent-1';

class A2AClaudeAgent {
  constructor() {
    this.agentId = AGENT_ID;
    this.claude = new ClaudeClient();
    this.ws = null;
    this.conversationHistory = new Map();

    logger.info(`🤖 Starting Claude Agent: ${this.agentId}`);
    this.connect();
  }

  connect() {
    this.ws = new WebSocket(BRIDGE_URL);

    this.ws.on('open', () => {
      logger.info(`✅ Connected to A2A Bridge at ${BRIDGE_URL}`);
      this.register();
    });

    this.ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data);
        await this.handleMessage(msg);
      } catch (error) {
        logger.error('❌ Error handling message:', error.message);
      }
    });

    this.ws.on('error', (error) => {
      logger.error('❌ WebSocket error:', error.message);
    });

    this.ws.on('close', () => {
      logger.info('🔌 Disconnected from A2A Bridge');
      setTimeout(() => this.connect(), 5000);
    });

    // Heartbeat - optimized interval
    setInterval(() => {
      if (this.ws.readyState === 1) {
        this.ws.send(JSON.stringify({ type: 'heartbeat' }));
      }
    }, 60000);
  }

  register() {
    const registration = {
      type: 'register',
      clientId: this.agentId,
      role: 'ai-assistant',
      labels: ['claude', 'llm', 'ai'],
      tools: ['conversation', 'analysis', 'reasoning'],
      intents: ['ai.query', 'ai.analyze', 'ai.converse'],
      maxConcurrentTasks: 3
    };

    this.ws.send(JSON.stringify(registration));
    logger.info(`📝 Registered as ${this.agentId}`);
  }

  async handleMessage(msg) {
    if (msg.type === 'registered') {
      logger.info('✅ Registration confirmed');
      logger.info(`   Client ID: ${msg.client.id}`);
      logger.info(`   Role: ${msg.client.role}`);
      logger.info('🎧 Listening for messages...\n');
      return;
    }

    if (msg[0] === 'env') {
      const envelope = msg[1];
      await this.handleEnvelope(envelope);
    }
  }

  async handleEnvelope(envelope) {
    const { from, to, intent, payload, id } = envelope;

    // Only respond to messages directed at us
    if (to !== this.agentId && to !== null) return;

    logger.info(`\n📨 Received message from ${from}`);
    logger.info(`   Intent: ${intent}`);
    logger.info(`   Payload:`, JSON.stringify(payload).slice(0, 100));

    try {
      // Get conversation context
      const conversationKey = from;
      let history = this.conversationHistory.get(conversationKey) || [];

      // Build prompt
      const userMessage = payload.message || payload.query ||
        payload.question || JSON.stringify(payload);
      const systemPrompt = payload.system ||
        'You are a helpful AI assistant in a multi-agent system. ' +
        'Provide concise, accurate responses.';

      logger.info(`🤔 Processing with Claude...`);

      // Call actual Claude API
      const response = await this.claude.sendMessage(userMessage, systemPrompt);

      logger.info(`✅ Claude responded (${response.length} chars)`);
      logger.info(`   Response preview: ${response.slice(0, 100)}...`);

      // Store in history
      history.push({ role: 'user', content: userMessage });
      history.push({ role: 'assistant', content: response });
      this.conversationHistory.set(conversationKey, history.slice(-10)); // Keep last 10 messages

      // Send response back
      const responseEnvelope = {
        type: 'envelope',
        envelope: {
          from: this.agentId,
          to: from,
          intent: 'ai.response',
          replyTo: id,
          payload: {
            response,
            model: this.claude.model,
            agent: this.agentId,
            processed_at: new Date().toISOString()
          }
        }
      };

      this.ws.send(JSON.stringify(responseEnvelope));
      logger.info(`📤 Sent response back to ${from}\n`);

    } catch (error) {
      logger.error(`❌ Error processing message:`, error.message);

      // Send error response
      const errorEnvelope = {
        type: 'envelope',
        envelope: {
          from: this.agentId,
          to: from,
          intent: 'ai.error',
          replyTo: id,
          payload: {
            error: error.message,
            agent: this.agentId
          }
        }
      };
      this.ws.send(JSON.stringify(errorEnvelope));
    }
  }
}

// Start agent
new A2AClaudeAgent();

// Handle shutdown
process.on('SIGINT', () => {
  logger.info('\n👋 Shutting down Claude Agent...');
  process.exit(0);
});
