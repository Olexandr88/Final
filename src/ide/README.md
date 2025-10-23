# LLM Framework IDE

AI-powered Integrated Development Environment built with Monaco Editor, React, and Electron, featuring real-time Claude/Ollama integration for intelligent code assistance.

## Features

### Core Functionality
- **Monaco Editor Integration**: Full VS Code editor experience
- **Multi-Language Support**: JavaScript, TypeScript, Python, JSON, Markdown, HTML, CSS, YAML
- **Tab Management**: Multiple file editing with split views
- **Syntax Highlighting**: Advanced syntax highlighting for all supported languages
- **Custom Themes**: LLM Dark and LLM Light themes

### AI-Powered Features
- **Code Completion**: Real-time AI suggestions via Claude/Ollama
- **Intelligent IntelliSense**: Context-aware code completion
- **Auto-Fix**: AI-powered error detection and automatic fixes
- **Code Refactoring**: Smart refactoring suggestions
- **Documentation Generation**: Automatic JSDoc/docstring generation
- **Code Analysis**: Security, performance, and best practices checks

### User Interface
- **Activity Bar**: Quick navigation to Explorer, Search, Git, AI Assistant, Extensions, Settings
- **Side Panel**: File explorer, search results, source control, AI chat
- **Editor Area**: Monaco-powered code editor with tabs
- **Bottom Panel**: Terminal, output, problems, debug console, AI chat
- **Status Bar**: File info, language, encoding, AI connection status

## Architecture

```
src/ide/
├── core/
│   └── monaco-editor-core.js       # Monaco initialization & management
├── features/
│   ├── ai-integration.js           # AI Bridge WebSocket connection
│   └── intellisense-provider.js    # AI-powered IntelliSense
├── components/
│   ├── IDELayout.jsx               # Main layout component
│   ├── ActivityBar.jsx             # Left navigation bar
│   ├── EditorArea.jsx              # Code editor with tabs
│   └── *.css                       # Component styles
├── main.js                         # Electron main process
├── preload.js                      # Electron preload script
└── package.json                    # Dependencies & scripts
```

## Installation

```bash
cd src/ide
npm install
```

## Development

```bash
# Start in development mode
npm run dev

# Build Monaco editor
npm run build:monaco

# Build React components
npm run build:react

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

## Building

```bash
# Build for Windows
npm run package

# Build for all platforms
npm run package:all
```

## Requirements

- **Node.js**: >= 18.0.0
- **AI Bridge**: Running on ws://localhost:65028 (optional, for AI features)
- **Electron**: >= 28.0.0

## AI Integration

The IDE connects to the LLM Framework's AI Bridge for intelligent features:

### Setup AI Bridge

```bash
# Start AI Bridge (from project root)
npm run start:bridge

# Start Claude agent
npm run agent:claude

# Start Ollama agent
npm run agent:ollama
```

### AI Features Configuration

```javascript
// src/ide/components/IDELayout.jsx
const aiIntegration = new AIIntegration({
  bridgeUrl: 'ws://localhost:65028',
  clientId: 'ide-client',
  preferredProvider: 'claude', // or 'ollama'
  enableCompletions: true,
  enableDiagnostics: true,
  enableRefactoring: true,
  enableDocGeneration: true
});
```

## Keyboard Shortcuts

### General
- `Ctrl+N` - New File
- `Ctrl+O` - Open File
- `Ctrl+S` - Save File
- `Ctrl+W` - Close File
- `Ctrl+Shift+P` - Command Palette

### AI Features
- `Ctrl+Shift+A` - Open AI Assistant
- `Ctrl+Shift+D` - Generate AI Documentation
- `Ctrl+Shift+R` - AI Refactor Selection
- `Ctrl+Space` - Trigger AI Completions

### Editor
- `Ctrl+F` - Find
- `Ctrl+H` - Replace
- `Ctrl+/` - Toggle Comment
- `Alt+Shift+F` - Format Document
- `F12` - Go to Definition

### View
- `Ctrl+B` - Toggle Sidebar
- `Ctrl+J` - Toggle Bottom Panel
- `Ctrl+K Ctrl+T` - Change Theme

## Monaco Editor Configuration

```javascript
const editor = monaco.createEditor(container, {
  theme: 'llm-dark',
  fontSize: 14,
  minimap: { enabled: true },
  lineNumbers: 'on',
  wordWrap: 'on',
  tabSize: 2,
  formatOnPaste: true,
  formatOnType: true,
  autoClosingBrackets: 'always',
  suggestOnTriggerCharacters: true,
  quickSuggestions: true,
  parameterHints: { enabled: true }
});
```

## IntelliSense Providers

### Completion Provider
Provides AI-powered code completions as you type:

```javascript
monaco.languages.registerCompletionItemProvider('javascript', {
  provideCompletionItems: async (model, position) => {
    const suggestions = await aiIntegration.getCompletions({
      code: model.getValueInRange(...),
      language: 'javascript',
      position
    });
    return { suggestions };
  }
});
```

### Hover Provider
Shows documentation on hover:

```javascript
monaco.languages.registerHoverProvider('javascript', {
  provideHover: async (model, position) => {
    const docs = await aiIntegration.generateDocs({
      code: model.getLineContent(position.lineNumber),
      language: 'javascript'
    });
    return { contents: [{ value: docs }] };
  }
});
```

### Code Action Provider
Provides quick fixes and refactorings:

```javascript
monaco.languages.registerCodeActionProvider('javascript', {
  provideCodeActions: async (model, range, context) => {
    const actions = [];

    // AI-powered quick fixes
    for (const marker of context.markers) {
      const fix = await aiIntegration.suggestFix(marker);
      actions.push({ title: `AI Fix: ${fix.description}`, edit: fix.edit });
    }

    return { actions };
  }
});
```

## Theming

### Creating Custom Themes

```javascript
monaco.editor.defineTheme('my-custom-theme', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'C586C0' },
    { token: 'string', foreground: 'CE9178' }
  ],
  colors: {
    'editor.background': '#1E1E1E',
    'editor.foreground': '#D4D4D4'
  }
});
```

### Switching Themes

```javascript
monaco.editor.setTheme('llm-dark');  // Dark theme
monaco.editor.setTheme('llm-light'); // Light theme
```

## Performance Optimization

### Memory Management
- Dispose unused editor instances
- Clear unused models
- Limit undo/redo history
- Use virtual scrolling for large files

### AI Request Optimization
- 300ms debounce on completions
- Cache AI responses (1 minute TTL)
- Batch diagnostic updates
- Throttle hover requests

### Worker Configuration
```javascript
window.MonacoEnvironment = {
  getWorkerUrl: (workerId, label) => {
    if (label === 'typescript' || label === 'javascript') {
      return 'monaco-editor/min/vs/language/typescript/ts.worker.js';
    }
    return 'monaco-editor/min/vs/editor/editor.worker.js';
  }
};
```

## Extending the IDE

### Adding New Languages

```javascript
// Register language
monaco.languages.register({
  id: 'rust',
  extensions: ['.rs'],
  aliases: ['Rust', 'rust']
});

// Register IntelliSense provider
intelliSense.registerCompletionProvider('rust');
```

### Adding Custom Commands

```javascript
editor.addAction({
  id: 'my.custom.action',
  label: 'My Custom Action',
  keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_M],
  run: (ed) => {
    // Custom action implementation
  }
});
```

## Troubleshooting

### Monaco Editor Not Loading
- Check that `monaco-editor` is installed: `npm install monaco-editor`
- Verify Monaco loader path in `monaco-editor-core.js`
- Check browser console for errors

### AI Features Not Working
- Ensure AI Bridge is running: `npm run start:bridge`
- Verify WebSocket connection: Check `ws://localhost:65028`
- Check browser console for connection errors
- Verify Claude/Ollama agent is running

### Performance Issues
- Reduce debounce delay for completions
- Disable minimap for large files
- Limit number of open files
- Clear AI response cache

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

ISC License - See main project LICENSE file

## Credits

- **Monaco Editor**: Microsoft
- **Electron**: GitHub
- **React**: Meta
- **LLM Integration**: Anthropic Claude, Ollama

## Support

For issues and questions:
- GitHub Issues: https://github.com/Scarmonit/LLM/issues
- Email: scarmonit@gmail.com

---

**Built with ❤️ for the LLM Framework**
