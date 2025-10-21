import MCPIntegration from './src/mcp/mcp-integration.js';

async function orchestrateCodeAnalysis() {
  const mcpIntegration = new MCPIntegration();

  // 1. Add the CodeAnalysisServer
  const codeServerConfig = {
    name: 'CodeAnalysisServer',
    transport: 'stdio', // Using stdio for local process communication
    command: 'node',
    args: ['./mcp-servers/code-analysis-server.js'],
    tools: ['analyze_code'],
  };
  await mcpIntegration.addServer(codeServerConfig);

  // 2. Connect to the CodeAnalysisServer
  await mcpIntegration.connect('CodeAnalysisServer');

  // 3. Call the 'analyze_code' tool
  console.log('\n--- Analyzing code via CodeAnalysisServer ---');
  const repositoryUrl = 'https://github.com/my-org/my-app.git';
  const branch = 'main';

  const analysisResult = await mcpIntegration.callTool(
    'CodeAnalysisServer',
    'analyze_code',
    { repositoryUrl, branch }
  );

  console.log('Code Analysis Result:', analysisResult);

  // 4. Disconnect from the server
  await mcpIntegration.disconnect('CodeAnalysisServer');
}

orchestrateCodeAnalysis().catch(console.error);
