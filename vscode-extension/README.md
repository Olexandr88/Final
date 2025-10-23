# LLM Framework Companion - VS Code Extension

Connect your VS Code editor to the LLM Multi-Provider Framework AI Bridge for intelligent code assistance powered by Claude, Ollama, and Jules.

## Features

- **Intelligent Code Operations**
  - Explain selected code with AI-powered analysis
  - Refactor code following best practices
  - Generate comprehensive unit tests automatically

- **Real-time Agent Communication**
  - Chat interface for direct agent interaction
  - View all connected agents in sidebar tree view
  - Status bar shows connection status and agent count

- **Seamless Integration**
  - WebSocket connection to AI Bridge (port 65028)
  - Context-aware suggestions based on current file
  - Auto-reconnection with exponential backoff

## Prerequisites

**IMPORTANT**: This extension requires the LLM Framework AI Bridge to be running.

1. Clone and set up the main framework:
   ```bash
   git clone https://github.com/Scarmonit/LLM.git
   cd LLM
   npm install
   ```

2. Start the AI Bridge:
   ```bash
   npm run start:bridge
   ```

3. (Optional) Start agents:
   ```bash
   npm run agent:claude    # Start Claude agent
   npm run agent:ollama    # Start Ollama agent
   ```

## Installation

### From Source

1. Clone this repository:
   ```bash
   cd vscode-extension
   npm install
   ```

2. Compile TypeScript:
   ```bash
   npm run compile
   ```

3. Open in VS Code and press F5 to launch Extension Development Host

### From VSIX Package (Future)

```bash
code --install-extension llm-framework-companion-1.0.0.vsix
```

## Configuration

Open VS Code settings and configure:

```json
{
  "llmFramework.aiBridgeUrl": "ws://localhost:65028",
  "llmFramework.autoConnect": true,
  "llmFramework.showStatusBar": true,
  "llmFramework.preferredAgent": "claude-agent-1"
}
```

### Configuration Options

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `aiBridgeUrl` | string | `ws://localhost:65028` | AI Bridge WebSocket URL |
| `autoConnect` | boolean | `true` | Auto-connect on extension activation |
| `showStatusBar` | boolean | `true` | Show connection status in status bar |
| `preferredAgent` | string | `null` | Preferred agent ID for task routing |

## Usage

### Commands

All commands are available via Command Palette (Ctrl+Shift+P / Cmd+Shift+P):

- **LLM: Explain Selected Code** - Get detailed explanation of highlighted code
- **LLM: Refactor Selected Code** - AI-powered refactoring suggestions
- **LLM: Generate Tests for Code** - Create unit tests automatically
- **LLM: Ask Agent Question** - Open chat dialog for general questions
- **LLM: Connect to AI Bridge** - Manually connect to AI Bridge
- **LLM: Disconnect from AI Bridge** - Disconnect from AI Bridge
- **LLM: Refresh Agent List** - Refresh connected agents tree view

### Context Menu

Right-click on selected code to access:
- Explain Selected Code
- Refactor Selected Code
- Generate Tests for Code

### Sidebar Views

**Agents View**: Shows all connected agents with their status, version, and capabilities.

**Chat View**: Interactive chat panel for conversations with AI agents.

### Status Bar

The status bar item (bottom right) shows:
- ✅ `$(check) LLM (3 agents)` - Connected with agent count
- 🔄 `$(sync~spin) LLM Connecting...` - Connecting to bridge
- ❌ `$(x) LLM Disconnected` - Not connected (click to connect)

## Examples

### Explain Code

1. Select a code block
2. Right-click → "LLM: Explain Selected Code"
3. Explanation opens in new markdown document

### Refactor Code

1. Select code to refactor
2. Command Palette → "LLM: Refactor Selected Code"
3. Choose "Replace" to update current file or "Show in New File"

### Generate Tests

1. Select function/class to test
2. Command Palette → "LLM: Generate Tests for Code"
3. Tests open in new file (framework auto-detected from package.json)

### Chat with Agent

1. Click chat icon in sidebar
2. Type question in input field
3. Responses appear in chat history

## Architecture

```
┌─────────────────────┐
│   VS Code Editor    │
│  ┌───────────────┐  │
│  │  Extension    │  │
│  │  (Client)     │  │
│  └───────┬───────┘  │
└──────────┼──────────┘
           │ WebSocket
           │ (port 65028)
┌──────────▼──────────┐
│    AI Bridge        │
│  (Coordinator)      │
└──────────┬──────────┘
           │
    ┌──────┴──────┬──────────┐
    ▼             ▼          ▼
┌────────┐  ┌─────────┐  ┌──────┐
│ Claude │  │ Ollama  │  │Jules │
│ Agent  │  │ Agent   │  │Agent │
└────────┘  └─────────┘  └──────┘
```

## Troubleshooting

### Extension not connecting

1. Verify AI Bridge is running:
   ```bash
   npm run start:bridge
   ```

2. Check WebSocket URL in settings:
   ```json
   "llmFramework.aiBridgeUrl": "ws://localhost:65028"
   ```

3. Check port 65028 is not blocked by firewall

### Commands not working

1. Ensure you're connected (status bar shows green check)
2. Check at least one agent is running (`npm run agent:claude`)
3. View Output panel → "LLM Framework" for error logs

### No agents showing in sidebar

1. Refresh agent list: Command Palette → "LLM: Refresh Agent List"
2. Verify agents are connected to bridge (check main framework logs)
3. Restart extension: Command Palette → "Developer: Reload Window"

### Tests generation uses wrong framework

The extension auto-detects test frameworks from `package.json`. If detection fails:
- Manually install your preferred framework
- Ensure it's in `devDependencies`
- Supported: jest, mocha, vitest, playwright

## Development

### Build from Source

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode
npm run watch

# Lint
npm run lint

# Package extension
npm run package
```

### Project Structure

```
vscode-extension/
├── src/
│   ├── extension.ts              # Main entry point
│   ├── aiBridgeClient.ts        # WebSocket client
│   ├── agentsTreeProvider.ts    # Agent tree view
│   ├── chatPanelProvider.ts     # Chat webview
│   └── commands/
│       └── index.ts             # Command handlers
├── package.json                  # Extension manifest
├── tsconfig.json                 # TypeScript config
└── webpack.config.js             # Bundler config
```

### Testing

```bash
npm test
```

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feat/my-feature`
3. Make changes and add tests
4. Run linter: `npm run lint`
5. Commit: `git commit -m 'feat: add my feature'`
6. Push: `git push origin feat/my-feature`
7. Open Pull Request

## License

ISC

## Links

- [Main LLM Framework Repository](https://github.com/Scarmonit/LLM)
- [VS Code Extension API](https://code.visualstudio.com/api)
- [Report Issues](https://github.com/Scarmonit/LLM/issues)

## Acknowledgments

- Built with VS Code Extension API
- Powered by Anthropic Claude, Ollama, and Jules
- WebSocket communication via `ws` library
