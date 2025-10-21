/**
 * Vibe Coding System - Complete Implementation
 * Based on "The Vibe Coder's Compass" guide
 *
 * A production-ready system for agentic development with Claude Code
 */

// Core Components
export { SubAgentManager, createSpecializedAgents } from './agents/subagent-manager.js';
export { HooksManager, createBuiltInHooks, loadHooksFromConfig } from './hooks/hooks-manager.js';
export { ContextManager } from './context/context-manager.js';
export { VisualRegressionTester } from './visual-testing/visual-regression.js';
export { CodebaseAnalyzer } from './codebase/codebase-analyzer.js';

// Advanced Features
export { PluginManager } from './plugins/plugin-manager.js';
export { TDDOrchestrator } from './workflows/tdd-orchestrator.js';
export { MCPIntegration } from './mcp/mcp-integration.js';
export { WorkflowTemplates } from './workflows/workflow-templates.js';

// Unified System
export { VibeCodingSystem } from './vibe-coding-integrator.js';

/**
 * Quick Start: Initialize complete Vibe Coding environment
 */
export async function initializeVibeCodingEnvironment(options = {}) {
  const { VibeCodingSystem } = await import('./vibe-coding-integrator.js');

  console.log('🚀 Initializing Vibe Coding Environment...\n');

  const system = new VibeCodingSystem(options);
  await system.initialize();

  console.log('✅ Vibe Coding Environment Ready\n');

  return system;
}

export default { initializeVibeCodingEnvironment };
