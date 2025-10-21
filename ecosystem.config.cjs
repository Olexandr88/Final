/**
 * PM2 Ecosystem Configuration
 * Production-grade process management for AI Bridge and agents
 */
module.exports = {
  apps: [
    // AI Bridge - Central WebSocket hub
    {
      name: 'ai-bridge',
      script: 'src/ai-bridge.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        AI_BRIDGE_PORT: 65028,
        AI_BRIDGE_HTTP_PORT: 65029,
        LOG_LEVEL: 'info',
        NODE_OPTIONS: '--max-old-space-size=512',
      },
      max_memory_restart: '500M',
      min_uptime: '10s',
      max_restarts: 10,
      autorestart: true,
      watch: false,
      error_file: 'logs/ai-bridge-error.log',
      out_file: 'logs/ai-bridge-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      kill_timeout: 5000,
    },

    // Claude Agent
    {
      name: 'claude-agent',
      script: 'src/agents/a2a-claude-agent.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        BRIDGE_WS: 'ws://localhost:65028',
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=384',
      },
      max_memory_restart: '400M',
      min_uptime: '10s',
      autorestart: true,
      restart_delay: 5000,
      error_file: 'logs/claude-agent-error.log',
      out_file: 'logs/claude-agent-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },

    // Ollama Agent
    {
      name: 'ollama-agent',
      script: 'src/agents/a2a-ollama-agent.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        BRIDGE_WS: 'ws://localhost:65028',
        OLLAMA_MODEL: 'llama2',
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=512',
      },
      max_memory_restart: '600M',
      min_uptime: '10s',
      autorestart: true,
      restart_delay: 5000,
      error_file: 'logs/ollama-agent-error.log',
      out_file: 'logs/ollama-agent-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },

    // Code Analyzer Agent
    {
      name: 'code-analyzer',
      script: 'src/agents/code-analyzer-agent.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        BRIDGE_WS: 'ws://localhost:65028',
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=300',
      },
      max_memory_restart: '300M',
      min_uptime: '10s',
      autorestart: true,
      restart_delay: 5000,
      error_file: 'logs/code-analyzer-error.log',
      out_file: 'logs/code-analyzer-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },

    // Security Agent
    {
      name: 'security-agent',
      script: 'src/agents/security-agent-1.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        BRIDGE_WS: 'ws://localhost:65028',
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=384',
      },
      max_memory_restart: '400M',
      min_uptime: '10s',
      autorestart: true,
      restart_delay: 5000,
      error_file: 'logs/security-agent-error.log',
      out_file: 'logs/security-agent-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },

    // Performance Monitor Agent
    {
      name: 'perf-monitor',
      script: 'src/agents/perf-monitor-1.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        BRIDGE_WS: 'ws://localhost:65028',
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=256',
      },
      max_memory_restart: '300M',
      min_uptime: '10s',
      autorestart: true,
      restart_delay: 5000,
      error_file: 'logs/perf-monitor-error.log',
      out_file: 'logs/perf-monitor-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },

    // Test Generator Agent
    {
      name: 'test-gen',
      script: 'src/agents/test-gen-1.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        BRIDGE_WS: 'ws://localhost:65028',
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=256',
      },
      max_memory_restart: '300M',
      min_uptime: '10s',
      autorestart: true,
      restart_delay: 5000,
      error_file: 'logs/test-gen-error.log',
      out_file: 'logs/test-gen-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },

    // Documentation Generator Agent
    {
      name: 'doc-gen',
      script: 'src/agents/doc-gen-1.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        BRIDGE_WS: 'ws://localhost:65028',
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=256',
      },
      max_memory_restart: '300M',
      min_uptime: '10s',
      autorestart: true,
      restart_delay: 5000,
      error_file: 'logs/doc-gen-error.log',
      out_file: 'logs/doc-gen-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],

  deploy: {
    production: {
      user: 'node',
      host: 'localhost',
      ref: 'origin/main',
      repo: 'https://github.com/Scarmonit/LLM.git',
      path: '/var/www/llm-framework',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.cjs --env production',
    },
  },
};
