#!/usr/bin/env node
/**
 * Test client to send messages to Claude agent via A2A
 */

import WebSocket from 'ws';
import { logger } from '../utils/logger.js';

const BRIDGE_URL = 'ws://localhost:4567';
const CLIENT_ID = 'test-client';

class TestClient {
  constructor() {
    this.ws = new WebSocket(BRIDGE_URL);

    this.ws.on('open', () => {
      logger.info('✅ Connected to A2A Bridge\n');

      // Register
      this.ws.send(
        JSON.stringify({
          type: 'register',
          clientId: CLIENT_ID,
          role: 'test-client',
        })
      );
    });

    this.ws.on('message', (data) => {
      const msg = JSON.parse(data);

      if (msg.type === 'registered') {
        logger.info('✅ Registered as test-client\n');
        this.runTests();
      }

      if (msg[0] === 'env') {
        const envelope = msg[1];
        if (envelope.intent === 'ai.response') {
          logger.info('\n📬 Received response from Claude:');
          logger.info('━'.repeat(60));
          logger.info(envelope.payload.response);
          logger.info('━'.repeat(60));
          logger.info(`Model: ${envelope.payload.model}`);
          logger.info(`Agent: ${envelope.payload.agent}`);
          logger.info(`Time: ${envelope.payload.processed_at}\n`);
        }
      }
    });
  }

  runTests() {
    logger.info('🧪 Sending test message to Claude agent...\n');

    // Test 1: Simple question
    setTimeout(() => {
      logger.info('Test 1: Asking Claude a question via A2A');
      this.sendMessage('claude-agent-1', {
        message: 'Explain in one sentence what an agent-to-agent system is.',
        system: 'You are a helpful AI assistant. Be concise.',
      });
    }, 1000);

    // Test 2: Another question
    setTimeout(() => {
      logger.info('\nTest 2: Asking Claude to analyze something');
      this.sendMessage('claude-agent-1', {
        query: 'What are the benefits of multi-agent AI systems? List 3 benefits.',
        system: 'You are an AI expert. Be specific and concise.',
      });
    }, 5000);
  }

  sendMessage(targetAgent, payload) {
    this.ws.send(
      JSON.stringify({
        type: 'envelope',
        envelope: {
          from: CLIENT_ID,
          to: targetAgent,
          intent: 'ai.query',
          payload,
        },
      })
    );
  }
}

new TestClient();

setTimeout(() => {
  logger.info('\n✅ Tests complete. Press Ctrl+C to exit.');
}, 15000);
