#!/usr/bin/env node
/**
 * Continue-Ollama MCP Server Setup Verification
 *
 * This script verifies that the Continue-Ollama MCP server is properly
 * configured and ready to use with the Continue VS Code extension.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFile, access } from 'fs/promises';
import { constants } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const STATUS = {
  PASS: '✅',
  FAIL: '❌',
  WARN: '⚠️',
  INFO: 'ℹ️',
};

async function checkFileExists(filePath, description) {
  try {
    await access(filePath, constants.F_OK);
    console.log(`${STATUS.PASS} ${description}: ${filePath}`);
    return true;
  } catch {
    console.log(`${STATUS.FAIL} ${description} not found: ${filePath}`);
    return false;
  }
}

async function checkConfigFile(filePath, requiredFields, description) {
  try {
    const content = await readFile(filePath, 'utf-8');
    console.log(`${STATUS.PASS} ${description} exists`);

    // Check for required fields
    const missingFields = requiredFields.filter((field) => !content.includes(field));
    if (missingFields.length > 0) {
      console.log(`${STATUS.WARN} ${description} missing fields: ${missingFields.join(', ')}`);
      return false;
    }

    console.log(`${STATUS.PASS} ${description} has all required fields`);
    return true;
  } catch (error) {
    console.log(`${STATUS.FAIL} Failed to read ${description}: ${error.message}`);
    return false;
  }
}

async function testMCPServer() {
  console.log(`${STATUS.INFO} Testing MCP server connection...`);

  const transport = new StdioClientTransport({
    command: 'node',
    args: ['src/mcp/continue-ollama-server.js'],
    env: {
      ...process.env,
      OLLAMA_ENDPOINT: 'http://localhost:11434',
      OLLAMA_DEFAULT_MODEL: 'llama3',
      LOG_LEVEL: 'info',
    },
  });

  const client = new Client(
    {
      name: 'verify-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  try {
    await client.connect(transport);
    console.log(`${STATUS.PASS} MCP server connected successfully`);

    // List tools
    const toolsResult = await client.listTools();
    console.log(`${STATUS.PASS} Found ${toolsResult.tools.length} tools:`);
    toolsResult.tools.forEach((tool) => {
      console.log(`   - ${tool.name}`);
    });

    // Test list_models
    const modelsResult = await client.callTool({
      name: 'list_models',
      arguments: { refresh: true },
    });

    const parsedResponse = JSON.parse(modelsResult.content[0].text);
    console.log(`${STATUS.PASS} Detected ${parsedResponse.models?.length || 0} Ollama models`);

    await client.close();
    return true;
  } catch (error) {
    console.log(`${STATUS.FAIL} MCP server test failed: ${error.message}`);
    return false;
  }
}

async function checkOllama() {
  console.log(`${STATUS.INFO} Checking Ollama service...`);

  try {
    const response = await fetch('http://localhost:11434/api/tags');
    if (response.ok) {
      const data = await response.json();
      console.log(`${STATUS.PASS} Ollama running with ${data.models?.length || 0} models`);
      return true;
    }
  } catch (error) {
    console.log(`${STATUS.FAIL} Ollama not accessible: ${error.message}`);
    return false;
  }

  return false;
}

async function main() {
  console.log('\n🔍 Continue-Ollama MCP Server Verification\n');
  console.log('='.repeat(60));

  const results = {
    configFiles: true,
    mcpServer: true,
    ollama: true,
  };

  // Check configuration files
  console.log('\n📁 Configuration Files\n');

  const homeDir = homedir();
  const configFiles = [
    {
      path: join(homeDir, '.continue', 'config.yaml'),
      description: 'Main Continue config (YAML)',
      required: ['continue-ollama', 'modelContextProtocolServers'],
    },
    {
      path: join(homeDir, '.continue', 'config.json'),
      description: 'User Continue config (JSON)',
      required: ['"agentMode": true'],
    },
  ];

  for (const { path, description, required } of configFiles) {
    const exists = await checkFileExists(path, description);
    if (exists) {
      const valid = await checkConfigFile(path, required, description);
      if (!valid) results.configFiles = false;
    } else {
      results.configFiles = false;
    }
  }

  // Check Ollama service
  console.log('\n🤖 Ollama Service\n');
  results.ollama = await checkOllama();

  // Test MCP server
  console.log('\n🔧 MCP Server Functionality\n');
  results.mcpServer = await testMCPServer();

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Verification Summary\n');

  console.log(`Configuration Files: ${results.configFiles ? STATUS.PASS : STATUS.FAIL}`);
  console.log(`Ollama Service:      ${results.ollama ? STATUS.PASS : STATUS.FAIL}`);
  console.log(`MCP Server:          ${results.mcpServer ? STATUS.PASS : STATUS.FAIL}`);

  const allPassed = results.configFiles && results.ollama && results.mcpServer;

  if (allPassed) {
    console.log(`\n${STATUS.PASS} All checks passed! Continue-Ollama MCP is ready to use.\n`);
    console.log('📋 Next Steps:');
    console.log('   1. Restart VS Code completely (close all windows)');
    console.log('   2. Open VS Code and check Continue extension');
    console.log('   3. Look for "continue-ollama" in the MCP tools list');
    console.log('   4. Test a tool: Type "@ollama list_models" in Continue chat\n');
  } else {
    console.log(`\n${STATUS.WARN} Some checks failed. Please review the errors above.\n`);
    console.log('💡 Troubleshooting:');
    if (!results.ollama) {
      console.log('   - Start Ollama: Run "ollama serve" or start Ollama Desktop app');
    }
    if (!results.configFiles) {
      console.log('   - Check configuration files exist and have required fields');
    }
    if (!results.mcpServer) {
      console.log('   - Verify MCP server file exists: src/mcp/continue-ollama-server.js');
      console.log('   - Check MCP SDK is installed: npm list @modelcontextprotocol/sdk');
    }
    console.log('');
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error(`\n${STATUS.FAIL} Verification failed:`, error.message);
  process.exit(1);
});
