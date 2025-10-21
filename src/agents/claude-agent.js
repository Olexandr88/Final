#!/usr/bin/env node
import Anthropic from '@anthropic-ai/sdk';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';

dotenv.config();

const BRIDGE_WS = process.env.BRIDGE_WS || 'ws://localhost:4567';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  logger.error('❌ ANTHROPIC_API_KEY not found in environment');
  process.exit(1);
}

class ClaudeAgent {
  constructor() {
    this.client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    this.ws = null;
    this.conversationHistory = new Map(); // taskId -> messages[]
  }

  async connect() {
    logger.info('🤖 Claude Agent connecting to bridge...');
    this.ws = new WebSocket(BRIDGE_WS);

    await new Promise((resolve, reject) => {
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
    });

    // Register with bridge
    this.ws.send(
      JSON.stringify({
        type: 'register',
        clientId: 'claude-agent',
        role: 'assistant',
        skills: ['chat', 'code', 'analysis', 'summarize'],
        intents: ['user.message', 'agent.prompt', 'task.assign'],
      })
    );

    await new Promise((r) => this.ws.once('message', r));
    logger.info('✅ Claude Agent registered and ready\n');

    this.setupHandlers();
  }

  setupHandlers() {
    this.ws.on('message', async (data) => {
      const msg = JSON.parse(data.toString());
      if (Array.isArray(msg) && msg[0] === 'env') {
        await this.handleEnvelope(msg[1]);
      }
    });

    this.ws.on('close', () => {
      logger.info('🔌 Disconnected from bridge');
      process.exit(0);
    });

    this.ws.on('error', (err) => {
      logger.error('❌ WebSocket error:', err.message);
    });
  }

  async handleEnvelope(envelope) {
    logger.info(`📬 Received ${envelope.intent} from ${envelope.from}`);

    try {
      let userMessage = null;

      if (envelope.payload?.text) {
        userMessage = envelope.payload.text;
      } else if (envelope.payload?.prompt) {
        userMessage = envelope.payload.prompt;
      } else if (envelope.payload?.goal) {
        userMessage = envelope.payload.goal;
      }

      if (!userMessage) {
        logger.info('⚠️  No message content found');
        return;
      }

      // Get or create conversation history
      const taskId = envelope.taskId || envelope.from;
      if (!this.conversationHistory.has(taskId)) {
        this.conversationHistory.set(taskId, []);
      }
      const history = this.conversationHistory.get(taskId);

      history.push({
        role: 'user',
        content: userMessage,
      });

      logger.info(`💭 Thinking...`);

      // Call Claude API
      const response = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: history,
      });

      const assistantMessage = response.content[0].text;
      history.push({
        role: 'assistant',
        content: assistantMessage,
      });

      logger.info(`✅ Response generated (${assistantMessage.length} chars)\n`);

      // Send response back
      this.ws.send(
        JSON.stringify({
          type: 'envelope',
          envelope: {
            intent: 'agent.response',
            from: 'claude-agent',
            to: envelope.from,
            taskId: envelope.taskId,
            replyTo: envelope.id,
            payload: {
              text: assistantMessage,
              model: 'claude-3-5-sonnet-20241022',
              usage: {
                input_tokens: response.usage.input_tokens,
                output_tokens: response.usage.output_tokens,
              },
            },
          },
        })
      );

      // Keep history manageable
      if (history.length > 20) {
        history.splice(0, history.length - 20);
      }
    } catch (error) {
      logger.error('❌ Error processing message:', error.message);

      // Send error response
      this.ws.send(
        JSON.stringify({
          type: 'envelope',
          envelope: {
            intent: 'agent.error',
            from: 'claude-agent',
            to: envelope.from,
            taskId: envelope.taskId,
            replyTo: envelope.id,
            payload: {
              error: error.message,
            },
          },
        })
      );
    }
  }
}

const agent = new ClaudeAgent();
agent.connect().catch((err) => {
  logger.error('❌ Failed to connect:', err.message);
  process.exit(1);
});

process.on('SIGINT', () => {
  logger.info('\n👋 Shutting down...');
  process.exit(0);
});
