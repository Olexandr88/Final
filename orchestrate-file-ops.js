import MCPIntegration from './src/mcp/mcp-integration.js';
import path from 'path';
import os from 'os';

async function orchestrateFileOperations() {
  const mcpIntegration = new MCPIntegration();

  // 1. Add the FileOperationServer
  const fileServerConfig = {
    name: 'FileOperationServer',
    transport: 'stdio', // Using stdio for local process communication
    command: 'node',
    args: ['./mcp-servers/file-operation-server.js'],
    tools: ['read_file', 'write_file', 'delete_file'],
  };
  await mcpIntegration.addServer(fileServerConfig);

  // 2. Connect to the FileOperationServer
  await mcpIntegration.connect('FileOperationServer');

  // Define a temporary file path
  const tempFilePath = path.join(os.tmpdir(), `mcp_test_file_${Date.now()}.txt`);
  const fileContent = 'Hello from MCP FileOperationServer!';

  try {
    // 3. Call the 'write_file' tool
    console.log('\n--- Writing a file via FileOperationServer ---');
    const writeResult = await mcpIntegration.callTool(
      'FileOperationServer',
      'write_file',
      { filepath: tempFilePath, content: fileContent }
    );
    console.log('File Write Result:', writeResult);

    // 4. Call the 'read_file' tool
    console.log('\n--- Reading a file via FileOperationServer ---');
    const readResult = await mcpIntegration.callTool(
      'FileOperationServer',
      'read_file',
      { filepath: tempFilePath }
    );
    console.log('File Read Result:', readResult);

  } catch (error) {
    console.error('Orchestration Error:', error);
  } finally {
    // 5. Call the 'delete_file' tool (cleanup)
    console.log('\n--- Deleting a file via FileOperationServer ---');
    const deleteResult = await mcpIntegration.callTool(
      'FileOperationServer',
      'delete_file',
      { filepath: tempFilePath }
    );
    console.log('File Delete Result:', deleteResult);

    // 6. Disconnect from the server
    await mcpIntegration.disconnect('FileOperationServer');
  }
}

orchestrateFileOperations().catch(console.error);
