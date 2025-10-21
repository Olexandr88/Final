import MCPIntegration from './src/mcp/mcp-integration.js';

async function orchestrateDeployment() {
  const mcpIntegration = new MCPIntegration();

  // 1. Add the DeploymentServer
  const deploymentServerConfig = {
    name: 'DeploymentServer',
    transport: 'stdio', // Using stdio for local process communication
    command: 'node',
    args: ['./mcp-servers/deployment-server.js'],
    tools: ['deploy'],
  };
  await mcpIntegration.addServer(deploymentServerConfig);

  // 2. Connect to the DeploymentServer
  await mcpIntegration.connect('DeploymentServer');

  // 3. Call the 'deploy' tool
  console.log('\n--- Deploying an application via DeploymentServer ---');
  const appName = 'MyWebApp';
  const version = '1.0.0';
  const environment = 'production';
  const targetRegion = 'us-east-1';

  const deploymentResult = await mcpIntegration.callTool(
    'DeploymentServer',
    'deploy',
    { appName, version, environment, targetRegion }
  );

  console.log('Deployment Result:', deploymentResult);

  // 4. Disconnect from the server
  await mcpIntegration.disconnect('DeploymentServer');
}

orchestrateDeployment().catch(console.error);
