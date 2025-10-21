#!/usr/bin/env node

/**
 * Ollama Autonomous Agent
 * Runs an autonomous agent using Ollama's local LLM
 */

const { spawn } = require('child_process');

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'llama2';

console.log('Starting Ollama Autonomous Agent...');
console.log(`Ollama Host: ${OLLAMA_HOST}`);
console.log(`Model: ${MODEL}`);

// Start the Ollama server in the background
const ollamaServer = spawn('ollama', ['serve'], {
  env: { ...process.env, OLLAMA_HOST },
  stdio: 'inherit'
});

ollamaServer.on('error', (err) => {
  console.error('Failed to start Ollama server:', err);
  process.exit(1);
});

// Wait for server to be ready
setTimeout(() => {
  console.log('Ollama server started successfully');
  console.log('Agent is now running in autonomous mode...');
  
  // Keep the process alive
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down...');
    ollamaServer.kill();
    process.exit(0);
  });
  
  process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down...');
    ollamaServer.kill();
    process.exit(0);
  });
}, 3000);

// Prevent process from exiting
setInterval(() => {
  console.log(`[${new Date().toISOString()}] Agent heartbeat - Running`);
}, 30000);
