import MCPIntegration from './src/mcp/mcp-integration.js';

async function orchestrateCommandExecution() {
  const mcpIntegration = new MCPIntegration();

  // 1. Add the CommandExecutionServer
  const commandServerConfig = {
    name: 'CommandExecutionServer',
    transport: 'stdio', // Assuming stdio for local process communication
    command: 'node',
    args: ['./mcp-servers/command-execution-server.js'],
    tools: ['execute_command'],
  };
  await mcpIntegration.addServer(commandServerConfig);

  // 2. Connect to the CommandExecutionServer
  await mcpIntegration.connect('CommandExecutionServer');

  // 3. Call the 'execute_command' tool
  console.log('\n--- Executing a command via CommandExecutionServer ---');
  const commandToExecute = 'node -v';
  const result = await mcpIntegration.callTool('CommandExecutionServer', 'execute_command', {
    command: commandToExecute,
  });

  console.log('Command Execution Result:', result);

  // 4. Disconnect from the server
  await mcpIntegration.disconnect('CommandExecutionServer');
}

orchestrateCommandExecution().catch(console.error);
