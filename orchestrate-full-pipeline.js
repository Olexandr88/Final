import MCPIntegration from './src/mcp/mcp-integration.js';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';

// Global store for discovered tool definitions
const discoveredToolDefinitions = {};

// Helper function for basic parameter validation
function validateParams(toolName, params, toolDefinition) {
  if (!toolDefinition || !toolDefinition.parameters || !toolDefinition.parameters.properties) {
    console.warn(`Warning: No parameter schema found for tool '${toolName}'. Skipping validation.`);
    return true; // Cannot validate without schema
  }

  const requiredParams = toolDefinition.parameters.required || [];
  const missingParams = requiredParams.filter((param) => !(param in params));

  if (missingParams.length > 0) {
    throw new Error(
      `Validation Error for tool '${toolName}': Missing required parameters: ${missingParams.join(', ')}`
    );
  }
  return true;
}

// Helper function to find a tool by intent
function findTool(intent, preferredServer = null) {
  let bestMatch = null;
  let bestMatchServer = null;

  // Prioritize preferred server if specified
  if (preferredServer && discoveredToolDefinitions[preferredServer]) {
    for (const toolName in discoveredToolDefinitions[preferredServer]) {
      const tool = discoveredToolDefinitions[preferredServer][toolName];
      if (tool.description && tool.description.toLowerCase().includes(intent.toLowerCase())) {
        return { serverName: preferredServer, toolName, toolDefinition: tool };
      }
    }
  }

  // Search all servers
  for (const serverName in discoveredToolDefinitions) {
    if (serverName === 'built-in') continue; // Skip built-in for intent-based search for now
    for (const toolName in discoveredToolDefinitions[serverName]) {
      const tool = discoveredToolDefinitions[serverName][toolName];
      if (tool.description && tool.description.toLowerCase().includes(intent.toLowerCase())) {
        // Simple heuristic: first match wins, or could be more sophisticated
        return { serverName, toolName, toolDefinition: tool };
      }
    }
  }

  // Fallback to exact name match if no description match
  for (const serverName in discoveredToolDefinitions) {
    if (serverName === 'built-in') continue;
    for (const toolName in discoveredToolDefinitions[serverName]) {
      if (toolName.toLowerCase() === intent.toLowerCase()) {
        return {
          serverName,
          toolName,
          toolDefinition: discoveredToolDefinitions[serverName][toolName],
        };
      }
    }
  }

  throw new Error(`No tool found for intent: '${intent}'`);
}

async function getSystemInfoStep(mcpIntegration) {
  console.log('\n--- Step 1: Get System Info ---');
  const toolName = 'get_system_info';
  const toolDef =
    discoveredToolDefinitions['built-in'] && discoveredToolDefinitions['built-in'][toolName];
  validateParams(toolName, {}, toolDef);
  const systemInfo = await mcpIntegration.executeBuiltInTool(toolName);
  console.log('System Info:', systemInfo);
  return systemInfo;
}

async function codeAnalysisStep(mcpIntegration) {
  console.log('\n--- Step 2: Code Analysis ---');
  const intent = 'analyze code';
  const { serverName, toolName, toolDefinition } = findTool(intent, 'CodeAnalysisServer');
  const repositoryUrl = 'https://github.com/my-org/my-app.git';
  const branch = 'main';
  const params = { repositoryUrl, branch };
  validateParams(toolName, params, toolDefinition);
  const analysisResult = await mcpIntegration.callTool(serverName, toolName, params);
  console.log('Code Analysis Result:', analysisResult);
  return analysisResult;
}

async function deploymentWorkflowStep(mcpIntegration, repositoryUrl) {
  console.log('\n--- Step 3: Code Analysis Passed. Proceeding with Deployment Workflow ---');

  // File Operations (e.g., prepare deployment artifacts)
  console.log('\n--- Step 3a: File Operations ---');

  // List files in a temporary directory before writing
  const tempDir = os.tmpdir();
  console.log(`Listing files in temporary directory: ${tempDir}`);
  let {
    serverName: serverNameFile,
    toolName: toolNameList,
    toolDefinition: toolDefList,
  } = findTool('list files', 'FileOperationServer');
  let paramsList = { directoryPath: tempDir };
  validateParams(toolNameList, paramsList, toolDefList);
  const listFilesResult = await mcpIntegration.callTool(serverNameFile, toolNameList, paramsList);
  console.log('List Files Result:', listFilesResult);

  const tempFilePath = path.join(tempDir, `mcp_deployment_artifact_${Date.now()}.txt`);
  const artifactContent = `Deployment artifact for ${repositoryUrl} v1.0.0`;

  let {
    serverName: serverNameWrite,
    toolName: toolNameWrite,
    toolDefinition: toolDefWrite,
  } = findTool('write content to file', 'FileOperationServer');
  let paramsWrite = { filepath: tempFilePath, content: artifactContent };
  validateParams(toolNameWrite, paramsWrite, toolDefWrite);
  const writeResult = await mcpIntegration.callTool(serverNameWrite, toolNameWrite, paramsWrite);
  console.log('Artifact Write Result:', writeResult);

  let {
    serverName: serverNameRead,
    toolName: toolNameRead,
    toolDefinition: toolDefRead,
  } = findTool('read file contents', 'FileOperationServer');
  let paramsRead = { filepath: tempFilePath };
  validateParams(toolNameRead, paramsRead, toolDefRead);
  const readResult = await mcpIntegration.callTool(serverNameRead, toolNameRead, paramsRead);
  console.log('Artifact Read Result:', readResult);

  // Execute Command (e.g., build or package)
  console.log('\n--- Step 3b: Execute Build Command ---');
  let {
    serverName: serverNameCommand,
    toolName: toolNameCommand,
    toolDefinition: toolDefCommand,
  } = findTool('execute shell command', 'CommandExecutionServer');
  let paramsCommand = { command: 'echo Building application...' };
  validateParams(toolNameCommand, paramsCommand, toolDefCommand);
  const buildCommandResult = await mcpIntegration.callTool(
    serverNameCommand,
    toolNameCommand,
    paramsCommand
  );
  console.log('Build Command Result:', buildCommandResult);

  // Deployment
  console.log('\n--- Step 3c: Application Deployment ---');
  let {
    serverName: serverNameDeploy,
    toolName: toolNameDeploy,
    toolDefinition: toolDefDeploy,
  } = findTool('deploy application', 'DeploymentServer');
  const appName = 'MyWebApp';
  const version = '1.0.0';
  const environment = 'production';
  const targetRegion = 'us-east-1';
  let paramsDeploy = { appName, version, environment, targetRegion };
  validateParams(toolNameDeploy, paramsDeploy, toolDefDeploy);
  const deploymentResult = await mcpIntegration.callTool(
    serverNameDeploy,
    toolNameDeploy,
    paramsDeploy
  );
  console.log('Deployment Result:', deploymentResult);

  // Post-Deployment Verification
  console.log('\n--- Step 3d: Post-Deployment Verification (Health Checks) ---');
  let {
    serverName: serverNameMonitor,
    toolName: toolNameMonitor,
    toolDefinition: toolDefMonitor,
  } = findTool('run health checks', 'MonitoringServer');
  let paramsMonitor = { appName, environment };
  validateParams(toolNameMonitor, paramsMonitor, toolDefMonitor);
  const healthCheckResult = await mcpIntegration.callTool(
    serverNameMonitor,
    toolNameMonitor,
    paramsMonitor
  );
  console.log('Health Check Result:', healthCheckResult);

  if (healthCheckResult.status === 'healthy') {
    console.log('Application is healthy after deployment!');
  } else {
    console.log('WARNING: Application is unhealthy after deployment. Initiating rollback...');
    let {
      serverName: serverNameRollback,
      toolName: toolNameRollback,
      toolDefinition: toolDefRollback,
    } = findTool('rollback application', 'DeploymentServer');
    let paramsRollback = { appName, previousVersion: version, environment };
    validateParams(toolNameRollback, paramsRollback, toolDefRollback);
    const rollbackResult = await mcpIntegration.callTool(
      serverNameRollback,
      toolNameRollback,
      paramsRollback
    );
    console.log('Rollback Result:', rollbackResult);
    if (rollbackResult.status === 'success') {
      console.log('Automated rollback completed successfully.');
    } else {
      console.log('ERROR: Automated rollback failed. Manual intervention required.');
    }
  }

  // Clean up artifact
  let {
    serverName: serverNameDelete,
    toolName: toolNameDelete,
    toolDefinition: toolDefDelete,
  } = findTool('delete a specified file', 'FileOperationServer');
  let paramsDelete = { filepath: tempFilePath };
  validateParams(toolNameDelete, paramsDelete, toolDefDelete);
  await mcpIntegration.callTool(serverNameDelete, toolNameDelete, paramsDelete);
  console.log('Artifact Cleaned Up.');

  return deploymentResult;
}

async function orchestrateFullPipeline() {
  const mcpIntegration = new MCPIntegration();

  // --- Load Server Configurations ---
  console.log('\n--- Loading Server Configurations ---');
  let serverConfigs = [];
  try {
    const configPath = path.join(process.cwd(), 'mcp-config.json');
    const configFileContent = await fs.readFile(configPath, 'utf-8');
    serverConfigs = JSON.parse(configFileContent);
    console.log(`Loaded ${serverConfigs.length} server configurations from mcp-config.json.`);
  } catch (error) {
    console.error(
      `Failed to load mcp-config.json: ${error.message}. Please ensure the file exists and is valid JSON.`
    );
    process.exit(1);
  }

  // --- 1. Add and Connect to all MCP Servers ---
  console.log('\n--- Adding and Connecting to MCP Servers ---');
  for (const config of serverConfigs) {
    try {
      await mcpIntegration.addServer(config);
      await mcpIntegration.connect(config.name);
      console.log(`✓ Connected to ${config.name}. Discovering tools...`);
      const discovered = await mcpIntegration.listServerTools(config.name);
      discoveredToolDefinitions[config.name] = {};
      discovered.forEach((tool) => {
        discoveredToolDefinitions[config.name][tool.name] = tool;
      });
    } catch (error) {
      console.error(
        `Failed to connect to ${config.name}: ${error.message}. Please ensure the server is running.`
      );
      // Depending on criticality, you might want to exit here or mark server as unavailable
    }
  }

  // Store built-in tool definitions
  discoveredToolDefinitions['built-in'] = {};
  mcpIntegration.builtInTools.forEach((tool, name) => {
    discoveredToolDefinitions['built-in'][name] = tool.definition;
  });

  // --- 2. Execute Multi-Step Workflow ---
  try {
    const systemInfo = await getSystemInfoStep(mcpIntegration);
    const analysisResult = await codeAnalysisStep(mcpIntegration);

    // Conditional Deployment based on Analysis
    if (
      analysisResult.status === 'success' &&
      analysisResult.qualityScore >= 70 &&
      analysisResult.criticalIssues === 0
    ) {
      await deploymentWorkflowStep(mcpIntegration, 'https://github.com/my-org/my-app.git');
    } else {
      console.log(
        '\n--- Step 3: Code Analysis Failed or did not meet quality gates. Halting deployment. ---'
      );
    }
  } catch (error) {
    console.error('\n--- Orchestration Error: ---', error);
  } finally {
    // --- 3. Disconnect from all servers ---
    console.log('\n--- Disconnecting from MCP Servers ---');
    for (const config of serverConfigs) {
      try {
        await mcpIntegration.disconnect(config.name);
      } catch (error) {
        console.error(`Failed to disconnect from ${config.name}: ${error.message}`);
      }
    }
    console.log('All servers disconnected.');
  }
}

orchestrateFullPipeline().catch(console.error);
