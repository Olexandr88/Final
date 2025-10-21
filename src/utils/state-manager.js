/**
 * State Manager
 * Persistent state storage for system configuration
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class StateManager {
  constructor(stateFile = '.a2a-state.json') {
    this.stateFile = path.join(process.cwd(), stateFile);
    this.state = {
      bridge: {
        autoStart: false,
        lastStarted: null,
        wasRunning: false,
      },
      agents: {
        ollama: { autoStart: false, lastStarted: null, wasRunning: false },
        analyzer: { autoStart: false, lastStarted: null, wasRunning: false },
        claude: { autoStart: false, lastStarted: null, wasRunning: false },
      },
      preferences: {
        logLevel: 'INFO',
        metricsInterval: 10000,
        autoReconnect: true,
        maxRetries: 5,
      },
      lastShutdown: null,
      version: '1.0.0',
    };
    this.loaded = false;
  }

  async load() {
    try {
      if (existsSync(this.stateFile)) {
        const data = await fs.readFile(this.stateFile, 'utf-8');
        const loaded = JSON.parse(data);

        // Merge with defaults to handle version upgrades
        this.state = {
          ...this.state,
          ...loaded,
          bridge: { ...this.state.bridge, ...loaded.bridge },
          agents: { ...this.state.agents, ...loaded.agents },
          preferences: { ...this.state.preferences, ...loaded.preferences },
        };

        this.loaded = true;
        return this.state;
      }
    } catch (error) {
      console.error('Failed to load state:', error.message);
    }
    return this.state;
  }

  async save() {
    try {
      const data = JSON.stringify(this.state, null, 2);
      await fs.writeFile(this.stateFile, data, 'utf-8');
      return true;
    } catch (error) {
      console.error('Failed to save state:', error.message);
      return false;
    }
  }

  // Bridge state
  setBridgeRunning(isRunning) {
    this.state.bridge.wasRunning = isRunning;
    if (isRunning) {
      this.state.bridge.lastStarted = new Date().toISOString();
    }
  }

  setBridgeAutoStart(autoStart) {
    this.state.bridge.autoStart = autoStart;
  }

  shouldAutoStartBridge() {
    return this.state.bridge.autoStart || this.state.bridge.wasRunning;
  }

  // Agent state
  setAgentRunning(agentType, isRunning) {
    if (!this.state.agents[agentType]) {
      this.state.agents[agentType] = { autoStart: false, lastStarted: null, wasRunning: false };
    }
    this.state.agents[agentType].wasRunning = isRunning;
    if (isRunning) {
      this.state.agents[agentType].lastStarted = new Date().toISOString();
    }
  }

  setAgentAutoStart(agentType, autoStart) {
    if (!this.state.agents[agentType]) {
      this.state.agents[agentType] = { autoStart: false, lastStarted: null, wasRunning: false };
    }
    this.state.agents[agentType].autoStart = autoStart;
  }

  shouldAutoStartAgent(agentType) {
    return (
      this.state.agents[agentType]?.autoStart || this.state.agents[agentType]?.wasRunning || false
    );
  }

  getRunningAgents() {
    return Object.entries(this.state.agents)
      .filter(([_, config]) => config.wasRunning)
      .map(([type, _]) => type);
  }

  // Preferences
  setPreference(key, value) {
    this.state.preferences[key] = value;
  }

  getPreference(key, defaultValue = null) {
    return this.state.preferences[key] ?? defaultValue;
  }

  // Shutdown tracking
  recordShutdown() {
    this.state.lastShutdown = new Date().toISOString();
  }

  wasGracefulShutdown() {
    if (!this.state.lastShutdown) return false;

    // Consider graceful if shutdown was within last 5 minutes
    const shutdownTime = new Date(this.state.lastShutdown).getTime();
    const now = Date.now();
    return now - shutdownTime < 5 * 60 * 1000;
  }

  // Full state access
  getState() {
    return { ...this.state };
  }

  clear() {
    this.state = {
      bridge: { autoStart: false, lastStarted: null, wasRunning: false },
      agents: {
        ollama: { autoStart: false, lastStarted: null, wasRunning: false },
        analyzer: { autoStart: false, lastStarted: null, wasRunning: false },
        claude: { autoStart: false, lastStarted: null, wasRunning: false },
      },
      preferences: {
        logLevel: 'INFO',
        metricsInterval: 10000,
        autoReconnect: true,
        maxRetries: 5,
      },
      lastShutdown: null,
      version: '1.0.0',
    };
  }
}

export const stateManager = new StateManager();

export default StateManager;
