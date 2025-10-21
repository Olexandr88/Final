import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

const configFilePath = path.join(process.cwd(), 'mcp-config.json');
const orchestratorScriptPath = path.join(process.cwd(), 'orchestrate-full-pipeline.js');

async function startMcpSystem() {
  console.log('\n--- MCP System Process Manager Starting ---');

  let serverConfigs = [];
  try {
    const configFileContent = await fs.readFile(configFilePath, 'utf-8');
    serverConfigs = JSON.parse(configFileContent);
    console.log(`Loaded ${serverConfigs.length} server configurations from mcp-config.json.`);
  } catch (error) {
    console.error(
      `Failed to load mcp-config.json: ${error.message}. Please ensure the file exists and is valid JSON.`
    );
    process.exit(1);
  }

  const serverProcesses = [];

  // --- Start Servers ---
  console.log('\n--- Spawning MCP Servers ---');
  for (const config of serverConfigs) {
    const serverPath = path.join(process.cwd(), config.args[0]);
    console.log(`Spawning ${config.name} (${serverPath})...`);

    let serverProcess;
    const env = { ...process.env };

    if (config.name === 'CodeAnalysisServer' && config.transport === 'http') {
      env.CODE_ANALYSIS_PORT = new URL(config.url).port || 3001;
    }

    serverProcess = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'], // Capture stdio for all servers for logging
      env: env,
      cwd: process.cwd(),
    });

    serverProcess.stdout.on('data', (data) => {
      process.stdout.write(`[${config.name}]: ${data.toString()}`);
    });

    serverProcess.stderr.on('data', (data) => {
      process.stderr.write(`[${config.name} ERROR]: ${data.toString()}`);
    });

    serverProcess.on('close', (code) => {
      console.log(`[${config.name}]: Exited with code ${code}`);
    });

    serverProcesses.push({ name: config.name, process: serverProcess });
  }

  console.log('Waiting for servers to initialize (5 seconds)...');
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // --- Run Orchestration Pipeline ---
  console.log('\n--- Running Orchestration Pipeline ---');
  const orchestratorProcess = spawn('node', [orchestratorScriptPath], {
    stdio: 'inherit', // Inherit stdio to see orchestrator output directly
    env: process.env,
    cwd: process.cwd(),
  });

  await new Promise((resolve) => {
    orchestratorProcess.on('close', (code) => {
      console.log(`\n--- Orchestration Pipeline Exited with code ${code} ---`);
      resolve();
    });
  });

  // --- Terminate Servers ---
  console.log('\n--- Terminating MCP Servers ---');
  for (const server of serverProcesses) {
    console.log(`Terminating ${server.name}...`);
    server.process.kill();
  }
  console.log('All MCP servers terminated.');

  console.log('\n--- MCP System Process Manager Finished ---');
}

startMcpSystem().catch(console.error);
