# Changelog

All notable changes to the LLM Framework Companion extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2025-10-23

### Added

#### Core Features
- WebSocket client for AI Bridge connection (port 65028)
- Agent registration as 'vscode-client' with capabilities
- Auto-reconnection with exponential backoff (max 5 attempts)
- Heartbeat mechanism (15-second interval) for connection health
- Request-response pattern with timeout handling (30s default)

#### Commands
- **Explain Code**: AI-powered code explanation with context
- **Refactor Code**: Intelligent refactoring suggestions
- **Generate Tests**: Automatic test generation with framework detection
- **Ask Agent**: Interactive question dialog with context
- **Connect/Disconnect Bridge**: Manual connection management
- **Refresh Agents**: Force refresh of agent list

#### UI Components
- Status bar item showing connection status and agent count
- Agents tree view with expandable agent details
- Chat panel webview for direct agent interaction
- Context menu integration for code operations
- Command palette integration for all commands

#### Configuration
- `llmFramework.aiBridgeUrl` - AI Bridge WebSocket URL
- `llmFramework.autoConnect` - Auto-connect on activation
- `llmFramework.showStatusBar` - Toggle status bar visibility
- `llmFramework.preferredAgent` - Preferred agent routing

#### Developer Experience
- TypeScript with strict mode
- ESLint configuration
- Webpack bundling for production
- Source maps for debugging
- Comprehensive JSDoc documentation

### Technical Details

#### Agent Communication
- JSON-based message protocol
- Metadata support (requestId, timestamp, targetAgent)
- Event-driven architecture (EventEmitter)
- Message type routing (agent.register, agent.list, task.*, response, error)

#### Test Framework Detection
- Auto-detect from package.json dependencies
- Supported: Jest, Mocha, Vitest, Playwright
- Fallback to Jest if no framework detected

#### Agent Visualization
- Icon mapping: Claude (sparkle), Ollama (circuit-board), Jules (robot)
- Status indicators: active (green check), inactive (circle outline)
- Collapsible details: Status, Version, Capabilities

#### Error Handling
- Graceful WebSocket error recovery
- User-friendly error messages
- Timeout protection for all async operations
- Cleanup on extension deactivation

### Known Limitations

- Requires AI Bridge to be running externally
- Single concurrent connection per VS Code window
- Chat history limited to last 10 messages
- No offline mode (requires active bridge connection)

### Dependencies

- `ws@^8.16.0` - WebSocket client library
- `@types/vscode@^1.85.0` - VS Code API types
- `typescript@^5.3.0` - TypeScript compiler
- `webpack@^5.89.0` - Module bundler

### Security

- No API keys stored in extension
- All authentication handled by AI Bridge
- WebSocket connections limited to localhost by default
- Input validation on all user-provided data

---

## Future Roadmap

### Planned for v1.1.0
- [ ] Streaming response support for long-running operations
- [ ] Multi-file context for code operations
- [ ] Inline code suggestions (similar to Copilot)
- [ ] Custom prompt templates
- [ ] Agent preference per workspace
- [ ] Chat history persistence

### Planned for v1.2.0
- [ ] Code lens integration
- [ ] Hover provider for quick explanations
- [ ] Diagnostic provider for code issues
- [ ] Settings UI panel
- [ ] Agent performance metrics
- [ ] Custom agent creation wizard

### Planned for v2.0.0
- [ ] Multi-agent collaboration workflows
- [ ] Visual Studio (full IDE) support
- [ ] Remote bridge connection support
- [ ] Offline mode with local models
- [ ] Extension API for third-party integrations
- [ ] Telemetry and analytics (opt-in)

---

[Unreleased]: https://github.com/Scarmonit/LLM/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Scarmonit/LLM/releases/tag/vscode-ext-v1.0.0
