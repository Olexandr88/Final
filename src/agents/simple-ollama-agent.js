#!/usr/bin/env node
/**
 * Simple Ollama Agent - Minimal implementation for testing
 */

import WebSocket from 'ws';
import http from 'http';
import { logger } from '../utils/logger.js';

const BRIDGE_WS = process.env.BRIDGE_WS || 'ws://localhost:65028';
const AGENT_ID = process.env.AGENT_ID || `simple-ollama-${Date.now()}`;
const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';

class SimpleOllamaAgent {
  constructor() {
    this.agentId = AGENT_ID;
    this.ws = null;
    this.connected = false;
  }

  async connect() {
    logger.info(`🤖 ${this.agentId} connecting to ${BRIDGE_WS}`);

    this.ws = new WebSocket(BRIDGE_WS);

    this.ws.on('open', () => {
      logger.info(`✅ ${this.agentId} WebSocket connected`);
      this.register();
    });

    this.ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'registered') {
          this.connected = true;
          logger.info(`✅ ${this.agentId} registered with bridge`);
          return;
        }

        if (Array.isArray(msg) && msg[0] === 'env') {
          await this.handleMessage(msg[1]);
        }
      } catch (error) {
        logger.error('Message handling error', { error: error.message });
      }
    });

    this.ws.on('error', (error) => {
      logger.error(`WebSocket error`, { error: error.message });
    });

    this.ws.on('close', () => {
      logger.info(`🔌 ${this.agentId} disconnected`);
      this.connected = false;
    });

    // Start heartbeat
    setInterval(() => {
      if (this.connected) {
        this.ws.send(JSON.stringify({ type: 'heartbeat' }));
      }
    }, 30000);
  }

  register() {
    logger.info(`📝 Registering ${this.agentId}`);
    this.ws.send(
      JSON.stringify({
        type: 'register',
        clientId: this.agentId,
        role: 'ollama-assistant',
        labels: ['ollama', 'ai', 'assistant'],
        tools: ['query', 'chat'],
        intents: ['ai.query', 'code.analyze', 'file.read'],
        maxConcurrentTasks: 3,
      })
    );
  }

  async handleMessage(envelope) {
    const { from, intent, payload, id } = envelope;

    logger.info(`📨 Received: ${intent} from ${from}`);

    try {
      const userMessage = payload?.message || payload?.prompt || 'Hello';

      // Call Ollama
      const response = await this.callOllama(userMessage);

      // Send response back
      this.sendResponse(from, id, {
        response: response.text,
        model: MODEL,
        status: 'success',
      });
    } catch (error) {
      logger.error('Error handling message', { error: error.message });
      this.sendResponse(from, id, {
        error: error.message,
        status: 'error',
      });
    }
  }

  async callOllama(message) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: message }],
        stream: false,
      });

      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: 60000,
      };

      logger.info(`🦙 Calling Ollama (${MODEL}): ${message.slice(0, 50)}...`);

      const req = http.request(new URL('/api/chat', OLLAMA_URL), options, (res) => {
        let data = '';

        res.on('data', (chunk) => (data += chunk));

        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const text = parsed.message?.content || 'No response';
            logger.info(`✅ Ollama responded (${text.length} chars)`);
            resolve({ text, raw: parsed });
          } catch (error) {
            reject(new Error(`Failed to parse Ollama response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Ollama request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Ollama request timed out'));
      });

      req.write(postData);
      req.end();
    });
  }

  sendResponse(to, replyTo, payload) {
    this.ws.send(
      JSON.stringify({
        type: 'envelope',
        envelope: {
          from: this.agentId,
          to,
          intent: 'ai.response',
          replyTo,
          payload,
        },
      })
    );

    logger.info(`📤 Sent response to ${to}`);
  }
}

// Start agent
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  const agent = new SimpleOllamaAgent();

  agent.connect().catch((error) => {
    logger.error('Failed to start agent', { error: error.message });
    process.exit(1);
  });

  logger.info(`🚀 Simple Ollama Agent starting`, {
    agentId: AGENT_ID,
    model: MODEL,
    bridgeUrl: BRIDGE_WS,
  });
}

export default SimpleOllamaAgent;
