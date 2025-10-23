# Windows Development Environment Integration

Complete integration of Microsoft Windows development tools with the LLM Multi-Provider Framework.

## Overview

This integration enables AI agents to leverage Windows-native development tools through the AI Bridge system, providing seamless cross-platform development workflows.

## Features

### 1. WinGet Package Manager (`winget-manager.js`)

Programmatic access to Windows Package Manager for dependency management.

**Capabilities:**
- Search for packages across multiple sources
- Install/upgrade/uninstall packages
- List installed packages
- Get detailed package information
- Intelligent caching (5-minute TTL)
- Event-driven architecture

**Usage:**

```javascript
import { WinGetManager } from './src/integrations/winget-manager.js';

const winget = new WinGetManager();
await winget.initialize();

// Search for packages
const packages = await winget.search('nodejs', { exact: false });

// Install package
await winget.install('OpenJS.NodeJS', { silent: true });

// Upgrade all packages
await winget.upgrade('all', { includeUnknown: true });

// List installed packages
const installed = await winget.list();
```

### 2. WSL Bridge (`wsl-bridge.js`)

Execute Linux commands from Windows Node.js through Windows Subsystem for Linux.

**Capabilities:**
- Execute arbitrary Linux commands
- Automatic path conversion (Windows ↔ WSL)
- Multi-distribution support
- Distribution lifecycle management
- Node.js script execution in WSL

**Usage:**

```javascript
import { WSLBridge } from './src/integrations/wsl-bridge.js';

const wsl = new WSLBridge();
await wsl.initialize();

// Execute Linux command
const result = await wsl.execute('ls -la /mnt/c/Users');

// Execute with specific distribution
await wsl.execute('apt update', { distro: 'Ubuntu-22.04', user: 'root' });

// Path conversion
const pathUtils = wsl.getPathUtils();
const wslPath = pathUtils.toWSL('C:\\Users\\scarm\\project');
// Returns: /mnt/c/Users/scarm/project

// List distributions
const distros = await wsl.listDistros();
```

### 3. PowerShell Executor (`powershell-executor.js`)

Execute PowerShell commands and scripts with full automation support.

**Capabilities:**
- PowerShell Core and Windows PowerShell support
- Automatic fallback mechanism
- Environment variable management
- System information retrieval
- File operations and hashing
- Command encoding for safe execution

**Usage:**

```javascript
import { PowerShellExecutor } from './src/integrations/powershell-executor.js';

const powershell = new PowerShellExecutor();
await powershell.initialize();

// Execute command
const result = await powershell.execute('Get-Process | Select-Object -First 5');

// Execute script file
await powershell.executeScript('./scripts/setup.ps1', ['arg1', 'arg2']);

// Get system info
const sysInfo = await powershell.getSystemInfo();

// Environment variables
const path = await powershell.getEnvVar('PATH');
await powershell.setEnvVar('MY_VAR', 'value');

// File hash
const hash = await powershell.getFileHash('C:\\file.txt', 'SHA256');
```

### 4. Windows Development Agent (`windows-dev-agent.js`)

AI Bridge agent that exposes Windows development capabilities to the agent ecosystem.

**Capabilities:**
- `windows.package.install` - Install packages via WinGet
- `windows.package.search` - Search WinGet packages
- `windows.package.upgrade` - Upgrade packages
- `windows.package.list` - List installed packages
- `windows.wsl.execute` - Execute WSL commands
- `windows.wsl.list` - List WSL distributions
- `windows.powershell.execute` - Execute PowerShell
- `windows.system.info` - Get system information

**Usage:**

```bash
# Start the Windows Development Agent
npm run agent:windows-dev
```

```javascript
// Agent automatically connects to AI Bridge and registers capabilities
// Other agents can request Windows operations via the bridge

// From another agent:
bridge.sendMessage({
  type: 'task:execute',
  data: {
    taskId: 'task-123',
    capability: 'windows.package.install',
    params: {
      packageId: 'Git.Git',
      options: { silent: true }
    }
  }
});
```

## Setup

### Prerequisites

- **Windows 10/11**: Required for WSL and WinGet features
- **Node.js 18+**: ES modules support
- **PowerShell Core** (optional): Better cross-platform support
- **WSL 2** (optional): For Linux command execution
- **WinGet** (optional): Usually pre-installed on Windows 11

### Installation

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables (`.env`):

```env
# Windows Development Agent
WINDOWS_DEV_AGENT_URL=ws://localhost:65028

# Optional: Override defaults
WINGET_ENABLED=true
WSL_ENABLED=true
PWSH_PATH=pwsh
DEFAULT_WSL_DISTRO=Ubuntu-22.04
```

3. Verify installation:

```bash
# Check WinGet
winget --version

# Check WSL
wsl --version

# Check PowerShell
pwsh --version
```

### Configuration

Edit `src/config/windows-constants.js` to customize:

```javascript
export const WINDOWS_CONFIG = {
  WINGET: {
    COMMAND_TIMEOUT: 30000,
    CACHE_TTL: 300000,
  },
  WSL: {
    COMMAND_TIMEOUT: 30000,
    DEFAULT_DISTRO: null,
  },
  POWERSHELL: {
    EXECUTION_POLICY: 'Bypass',
    FALLBACK_TO_WINDOWS_PS: true,
  },
};
```

## Testing

Run comprehensive test suite:

```bash
# Run all Windows integration tests
npm test tests/winget-manager.test.js
npm test tests/wsl-bridge.test.js
npm test tests/powershell-executor.test.js

# Run with coverage
npm run test:coverage
```

**Note**: Some tests require Windows platform and specific tools installed. Tests automatically skip when prerequisites are not available.

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────┐
│           AI Bridge (WebSocket Hub)                 │
│              ws://localhost:65028                   │
└───────────────┬─────────────────────────────────────┘
                │
                │ WebSocket Connection
                │
┌───────────────▼─────────────────────────────────────┐
│        Windows Development Agent                    │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │   WinGet     │  │  WSL Bridge  │  │PowerShell │ │
│  │   Manager    │  │              │  │ Executor  │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘ │
└─────────┼──────────────────┼────────────────┼───────┘
          │                  │                │
          │                  │                │
     ┌────▼────┐      ┌──────▼──────┐   ┌────▼────┐
     │ winget  │      │  wsl.exe    │   │  pwsh   │
     │   CLI   │      │             │   │   CLI   │
     └─────────┘      └─────────────┘   └─────────┘
```

### Event Flow

1. **Agent Registration**:
   - Windows Dev Agent connects to AI Bridge
   - Registers capabilities and metadata
   - Starts heartbeat mechanism

2. **Task Execution**:
   - Other agents send task requests to bridge
   - Bridge routes to Windows Dev Agent
   - Agent delegates to appropriate component (WinGet/WSL/PowerShell)
   - Results sent back through bridge

3. **Error Recovery**:
   - Automatic reconnection on disconnect
   - Retry mechanisms for transient failures
   - Graceful degradation when tools unavailable

## Performance

### Metrics

- **Cached Operations**: <500ms (WinGet search cache)
- **Fresh Queries**: <2s (WinGet package search)
- **WSL Commands**: <1s (simple commands)
- **PowerShell Scripts**: Varies by script complexity

### Optimization

1. **Caching Strategy**:
   - WinGet search results: 5-minute TTL
   - Automatic cache invalidation
   - LRU eviction policy

2. **Connection Pooling**:
   - Reuse PowerShell sessions (optional)
   - WSL process optimization
   - WebSocket keepalive

3. **Parallel Execution**:
   - Initialize components concurrently
   - Batch operations when possible
   - Non-blocking async operations

## Security

### Best Practices

1. **Execution Policy**: Set to `Bypass` for automation (sandboxed environment)
2. **Input Validation**: All commands validated before execution
3. **Path Sanitization**: Prevent path traversal attacks
4. **Timeout Enforcement**: All operations have timeouts
5. **Error Masking**: Sensitive info not exposed in errors

### Permissions

- WinGet: User-level permissions (no admin required for most operations)
- WSL: Respects WSL user permissions
- PowerShell: Execution policy can be configured

## Troubleshooting

### WinGet Not Found

```bash
# Check if WinGet is installed
winget --version

# Install WinGet (Windows 11: pre-installed)
# Windows 10: Download from Microsoft Store or GitHub
```

### WSL Not Available

```bash
# Enable WSL
wsl --install

# Check WSL version
wsl --version

# Update WSL
wsl --update
```

### PowerShell Core Not Found

```bash
# Install PowerShell Core
winget install Microsoft.PowerShell

# Or use Windows PowerShell (automatic fallback)
powershell
```

### Agent Connection Issues

1. Check AI Bridge is running: `npm run start:bridge`
2. Verify port 65028 is not blocked
3. Check firewall settings
4. Review agent logs for connection errors

## Examples

### Example 1: Install Development Tools

```javascript
import { WindowsDevAgent } from './src/agents/windows-dev-agent.js';

const agent = new WindowsDevAgent();
await agent.initialize();

// Install multiple tools
const tools = ['Git.Git', 'OpenJS.NodeJS', 'Microsoft.VisualStudioCode'];

for (const tool of tools) {
  await agent.installPackage({ packageId: tool, options: { silent: true } });
  console.log(`✓ Installed ${tool}`);
}
```

### Example 2: Cross-Platform Build

```javascript
// Build on Windows and test on WSL
const winget = new WinGetManager();
const wsl = new WSLBridge();

await winget.initialize();
await wsl.initialize();

// Install dependencies on Windows
await winget.install('Microsoft.VisualStudio.2022.BuildTools');

// Run tests in Linux (WSL)
const testResult = await wsl.execute('npm test', {
  cwd: '/mnt/c/Users/scarm/project'
});

console.log(`Tests: ${testResult.success ? 'PASS' : 'FAIL'}`);
```

### Example 3: Automated Environment Setup

```javascript
const powershell = new PowerShellExecutor();
await powershell.initialize();

// Setup script
const setupScript = `
  # Create project directory
  New-Item -ItemType Directory -Path "C:\\Dev\\MyProject" -Force

  # Set environment variables
  [Environment]::SetEnvironmentVariable("DEV_MODE", "true", "User")

  # Install Chocolatey packages
  choco install nodejs git vscode -y
`;

await powershell.execute(setupScript);
```

## Integration with AI Bridge

### Register Custom Capabilities

```javascript
// Add custom Windows capability
windowsDevAgent.capabilities['windows.custom.backup'] = async (params) => {
  const { source, destination } = params;

  return await windowsDevAgent.powershell.execute(`
    Copy-Item -Path "${source}" -Destination "${destination}" -Recurse
  `);
};
```

### Listen for Events

```javascript
windowsDevAgent.on('connected', () => {
  console.log('Windows Dev Agent online');
});

windowsDevAgent.on('task:complete', ({ taskId, result }) => {
  console.log(`Task ${taskId} completed:`, result);
});

windowsDevAgent.on('task:error', ({ taskId, error }) => {
  console.error(`Task ${taskId} failed:`, error.message);
});
```

## Contributing

### Adding New Features

1. Create new module in `src/integrations/`
2. Follow existing patterns (EventEmitter, async/await)
3. Add comprehensive tests
4. Update this documentation
5. Submit pull request

### Code Style

- ES Modules (import/export)
- JSDoc comments for all public APIs
- Async/await for async operations
- Event emission for important operations
- Comprehensive error handling

## License

ISC License - See LICENSE file for details

## Support

- GitHub Issues: https://github.com/Scarmonit/LLM/issues
- Email: scarmonit@gmail.com

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
**Author**: Parker Dunn (@Scarmonit)
