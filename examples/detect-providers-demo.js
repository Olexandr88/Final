#!/usr/bin/env node
/**
 * MCP Provider Detector Demo
 * Demonstrates auto-detection of available LLM providers
 */

import { ProviderDetector } from '../src/mcp/provider-detector.js';

async function main() {
  console.log('🔍 LLM Provider Auto-Detection Demo\n');
  console.log('=' .repeat(60));

  const detector = new ProviderDetector();

  // Basic detection (fast)
  console.log('\n1️⃣  Basic Detection (Configuration Only)');
  console.log('-' .repeat(60));
  const basicResults = await detector.detectProviders({
    includeHealth: false,
    includeModels: false
  });

  console.log(`\nFound ${basicResults.summary.total} providers:`);
  console.log(`  ✓ Configured: ${basicResults.summary.configured}`);
  console.log(`  ✓ Available: ${basicResults.summary.available}`);
  console.log(`  ✓ Healthy: ${basicResults.summary.healthy}\n`);

  for (const provider of basicResults.providers) {
    const status = provider.healthy ? '✅' : provider.configured ? '⚠️' : '❌';
    console.log(`${status} ${provider.displayName}`);
    console.log(`   Configured: ${provider.configured}`);
    console.log(`   Available: ${provider.available}`);
    console.log(`   Capabilities: ${provider.capabilities.join(', ')}`);
    if (provider.error) {
      console.log(`   Error: ${provider.error}`);
    }
    console.log();
  }

  // Full detection with health checks (slower)
  console.log('\n2️⃣  Full Detection (With Health Checks)');
  console.log('-' .repeat(60));
  console.log('⏳ Running health checks (this may take a few seconds)...\n');

  const fullResults = await detector.detectProviders({
    includeHealth: true,
    includeModels: true
  });

  for (const provider of fullResults.providers) {
    if (provider.healthy) {
      console.log(`✅ ${provider.displayName} - HEALTHY`);
      console.log(`   Endpoint: ${provider.endpoint || 'SDK-based'}`);

      if (provider.metadata.healthCheck) {
        console.log(`   Health Check: ${provider.metadata.healthCheck}`);
      }

      if (provider.models && provider.models.length > 0) {
        console.log(`   Models: ${provider.models.slice(0, 3).join(', ')}${provider.models.length > 3 ? '...' : ''}`);
      }

      if (provider.metadata.defaultModel) {
        console.log(`   Default Model: ${provider.metadata.defaultModel}`);
      }

      console.log();
    }
  }

  // Show MCP tool definition
  console.log('\n3️⃣  MCP Tool Definition');
  console.log('-' .repeat(60));
  const toolDef = ProviderDetector.getToolDefinition();
  console.log(JSON.stringify(toolDef, null, 2));

  // Example MCP tool execution
  console.log('\n4️⃣  MCP Tool Execution Example');
  console.log('-' .repeat(60));
  const mcpResult = await detector.executeTool({
    includeHealth: false,
    includeModels: false
  });

  console.log('MCP Response Format:');
  console.log(mcpResult.content[0].text.substring(0, 500) + '...\n');

  // Recommendations
  console.log('\n5️⃣  Recommendations');
  console.log('-' .repeat(60));

  const configured = fullResults.providers.filter(p => p.configured);
  const unconfigured = fullResults.providers.filter(p => !p.configured);
  const unhealthy = fullResults.providers.filter(p => p.configured && !p.healthy);

  if (configured.length === 0) {
    console.log('⚠️  No providers are configured!');
    console.log('   Add API keys to your .env file:');
    unconfigured.forEach(p => {
      if (p.name !== 'ollama') {
        console.log(`   - ${p.displayName}: Set ${this.providers[p.name].envVar}`);
      }
    });
  } else {
    console.log(`✅ ${configured.length} provider(s) configured`);
  }

  if (unhealthy.length > 0) {
    console.log(`\n⚠️  ${unhealthy.length} configured provider(s) unhealthy:`);
    unhealthy.forEach(p => {
      console.log(`   - ${p.displayName}: ${p.error}`);
    });
  }

  if (fullResults.providers.find(p => p.name === 'ollama' && !p.available)) {
    console.log('\n💡 Ollama is not running. Start it with: ollama serve');
  }

  console.log('\n' + '=' .repeat(60));
  console.log('✨ Detection complete!\n');
}

main().catch(console.error);
