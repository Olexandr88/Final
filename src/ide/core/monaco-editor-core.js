/**
 * Monaco Editor Core
 * Handles Monaco editor initialization, configuration, and lifecycle management
 * @module ide/core/monaco-editor-core
 */

import { logger } from '../../utils/logger.js';
import { EventEmitter } from 'events';

/**
 * Monaco Editor Core Manager
 * Manages Monaco editor instances and provides unified API
 */
export class MonacoEditorCore extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      theme: options.theme || 'vs-dark',
      fontSize: options.fontSize || 14,
      fontFamily: options.fontFamily || 'Consolas, "Courier New", monospace',
      lineHeight: options.lineHeight || 20,
      minimap: options.minimap ?? { enabled: true },
      scrollBeyondLastLine: options.scrollBeyondLastLine ?? false,
      formatOnPaste: options.formatOnPaste ?? true,
      formatOnType: options.formatOnType ?? true,
      autoClosingBrackets: options.autoClosingBrackets || 'always',
      autoClosingQuotes: options.autoClosingQuotes || 'always',
      tabSize: options.tabSize || 2,
      insertSpaces: options.insertSpaces ?? true,
      wordWrap: options.wordWrap || 'on',
      ...options
    };

    this.editors = new Map(); // id -> editor instance
    this.models = new Map(); // uri -> model instance
    this.monaco = null;
    this.initialized = false;
  }

  /**
   * Initialize Monaco editor library
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      logger.warn('[MonacoCore] Already initialized');
      return;
    }

    try {
      logger.info('[MonacoCore] Initializing Monaco editor...');

      // Load Monaco AMD loader
      await this._loadMonacoLoader();

      // Configure Monaco environment
      await this._configureMonaco();

      // Register languages
      this._registerLanguages();

      // Configure themes
      this._defineCustomThemes();

      this.initialized = true;
      this.emit('initialized');

      logger.info('[MonacoCore] Monaco editor initialized successfully');
    } catch (error) {
      logger.error('[MonacoCore] Initialization failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Load Monaco AMD loader
   * @private
   */
  async _loadMonacoLoader() {
    return new Promise((resolve, reject) => {
      if (window.monaco) {
        this.monaco = window.monaco;
        resolve();
        return;
      }

      const loaderScript = document.createElement('script');
      loaderScript.src = 'monaco-editor/min/vs/loader.js';
      loaderScript.onload = () => {
        window.require.config({
          paths: { vs: 'monaco-editor/min/vs' }
        });

        window.require(['vs/editor/editor.main'], () => {
          this.monaco = window.monaco;
          resolve();
        });
      };
      loaderScript.onerror = reject;
      document.head.appendChild(loaderScript);
    });
  }

  /**
   * Configure Monaco environment
   * @private
   */
  async _configureMonaco() {
    // Configure worker URLs for Web Workers
    window.MonacoEnvironment = {
      getWorkerUrl: (workerId, label) => {
        if (label === 'json') {
          return 'monaco-editor/min/vs/language/json/json.worker.js';
        }
        if (label === 'css' || label === 'scss' || label === 'less') {
          return 'monaco-editor/min/vs/language/css/css.worker.js';
        }
        if (label === 'html' || label === 'handlebars' || label === 'razor') {
          return 'monaco-editor/min/vs/language/html/html.worker.js';
        }
        if (label === 'typescript' || label === 'javascript') {
          return 'monaco-editor/min/vs/language/typescript/ts.worker.js';
        }
        return 'monaco-editor/min/vs/editor/editor.worker.js';
      }
    };
  }

  /**
   * Register supported languages
   * @private
   */
  _registerLanguages() {
    const languages = [
      {
        id: 'javascript',
        extensions: ['.js', '.mjs', '.cjs'],
        aliases: ['JavaScript', 'javascript', 'js']
      },
      {
        id: 'typescript',
        extensions: ['.ts', '.tsx'],
        aliases: ['TypeScript', 'typescript', 'ts']
      },
      {
        id: 'python',
        extensions: ['.py', '.pyw'],
        aliases: ['Python', 'python', 'py']
      },
      {
        id: 'json',
        extensions: ['.json'],
        aliases: ['JSON', 'json']
      },
      {
        id: 'markdown',
        extensions: ['.md', '.markdown'],
        aliases: ['Markdown', 'markdown']
      },
      {
        id: 'html',
        extensions: ['.html', '.htm'],
        aliases: ['HTML', 'html']
      },
      {
        id: 'css',
        extensions: ['.css'],
        aliases: ['CSS', 'css']
      },
      {
        id: 'yaml',
        extensions: ['.yaml', '.yml'],
        aliases: ['YAML', 'yaml']
      }
    ];

    logger.info('[MonacoCore] Registering languages', { count: languages.length });
    // Languages are auto-registered by Monaco, this is for future custom language support
  }

  /**
   * Define custom themes
   * @private
   */
  _defineCustomThemes() {
    // LLM Framework Dark Theme (inspired by VS Dark+)
    this.monaco.editor.defineTheme('llm-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'C586C0' },
        { token: 'string', foreground: 'CE9178' },
        { token: 'number', foreground: 'B5CEA8' },
        { token: 'function', foreground: 'DCDCAA' },
        { token: 'variable', foreground: '9CDCFE' },
        { token: 'type', foreground: '4EC9B0' }
      ],
      colors: {
        'editor.background': '#1E1E1E',
        'editor.foreground': '#D4D4D4',
        'editor.lineHighlightBackground': '#2A2A2A',
        'editorCursor.foreground': '#AEAFAD',
        'editor.selectionBackground': '#264F78',
        'editorLineNumber.foreground': '#858585'
      }
    });

    // LLM Framework Light Theme (inspired by VS Light+)
    this.monaco.editor.defineTheme('llm-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '008000', fontStyle: 'italic' },
        { token: 'keyword', foreground: '0000FF' },
        { token: 'string', foreground: 'A31515' },
        { token: 'number', foreground: '098658' },
        { token: 'function', foreground: '795E26' },
        { token: 'variable', foreground: '001080' },
        { token: 'type', foreground: '267F99' }
      ],
      colors: {
        'editor.background': '#FFFFFF',
        'editor.foreground': '#000000',
        'editor.lineHighlightBackground': '#F5F5F5',
        'editorCursor.foreground': '#000000',
        'editor.selectionBackground': '#ADD6FF',
        'editorLineNumber.foreground': '#237893'
      }
    });

    logger.info('[MonacoCore] Custom themes defined');
  }

  /**
   * Create a new editor instance
   * @param {HTMLElement} container - DOM element to mount editor
   * @param {Object} options - Editor-specific options
   * @returns {Object} Monaco editor instance
   */
  createEditor(container, options = {}) {
    if (!this.initialized) {
      throw new Error('[MonacoCore] Not initialized. Call initialize() first.');
    }

    const editorId = options.id || `editor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const editorOptions = {
        ...this.options,
        ...options,
        automaticLayout: true
      };

      const editor = this.monaco.editor.create(container, editorOptions);

      this.editors.set(editorId, editor);
      this.emit('editor-created', { id: editorId, editor });

      logger.info('[MonacoCore] Editor created', { id: editorId });

      return { id: editorId, editor };
    } catch (error) {
      logger.error('[MonacoCore] Failed to create editor', { error: error.message });
      throw error;
    }
  }

  /**
   * Create a diff editor instance
   * @param {HTMLElement} container - DOM element to mount editor
   * @param {Object} options - Editor-specific options
   * @returns {Object} Monaco diff editor instance
   */
  createDiffEditor(container, options = {}) {
    if (!this.initialized) {
      throw new Error('[MonacoCore] Not initialized. Call initialize() first.');
    }

    const editorId = options.id || `diff-editor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const editorOptions = {
        ...this.options,
        ...options,
        automaticLayout: true,
        enableSplitViewResizing: true,
        renderSideBySide: true
      };

      const editor = this.monaco.editor.createDiffEditor(container, editorOptions);

      this.editors.set(editorId, editor);
      this.emit('diff-editor-created', { id: editorId, editor });

      logger.info('[MonacoCore] Diff editor created', { id: editorId });

      return { id: editorId, editor };
    } catch (error) {
      logger.error('[MonacoCore] Failed to create diff editor', { error: error.message });
      throw error;
    }
  }

  /**
   * Create or get a text model
   * @param {string} content - File content
   * @param {string} language - Language ID
   * @param {string} uri - File URI
   * @returns {Object} Monaco text model
   */
  createModel(content, language, uri) {
    if (!this.initialized) {
      throw new Error('[MonacoCore] Not initialized. Call initialize() first.');
    }

    const modelUri = this.monaco.Uri.parse(uri);

    // Check if model already exists
    let model = this.monaco.editor.getModel(modelUri);

    if (model) {
      logger.debug('[MonacoCore] Reusing existing model', { uri });
      return model;
    }

    // Create new model
    model = this.monaco.editor.createModel(content, language, modelUri);
    this.models.set(uri, model);

    this.emit('model-created', { uri, model });
    logger.info('[MonacoCore] Model created', { uri, language });

    return model;
  }

  /**
   * Get editor instance by ID
   * @param {string} id - Editor ID
   * @returns {Object|null} Monaco editor instance
   */
  getEditor(id) {
    return this.editors.get(id) || null;
  }

  /**
   * Get model by URI
   * @param {string} uri - File URI
   * @returns {Object|null} Monaco text model
   */
  getModel(uri) {
    return this.models.get(uri) || null;
  }

  /**
   * Set editor theme
   * @param {string} theme - Theme name
   */
  setTheme(theme) {
    if (!this.initialized) {
      throw new Error('[MonacoCore] Not initialized. Call initialize() first.');
    }

    this.monaco.editor.setTheme(theme);
    this.options.theme = theme;
    this.emit('theme-changed', { theme });

    logger.info('[MonacoCore] Theme changed', { theme });
  }

  /**
   * Dispose editor instance
   * @param {string} id - Editor ID
   */
  disposeEditor(id) {
    const editor = this.editors.get(id);

    if (editor) {
      editor.dispose();
      this.editors.delete(id);
      this.emit('editor-disposed', { id });

      logger.info('[MonacoCore] Editor disposed', { id });
    }
  }

  /**
   * Dispose model
   * @param {string} uri - File URI
   */
  disposeModel(uri) {
    const model = this.models.get(uri);

    if (model) {
      model.dispose();
      this.models.delete(uri);
      this.emit('model-disposed', { uri });

      logger.info('[MonacoCore] Model disposed', { uri });
    }
  }

  /**
   * Dispose all editors and models
   */
  disposeAll() {
    logger.info('[MonacoCore] Disposing all editors and models');

    for (const [id, editor] of this.editors) {
      editor.dispose();
      this.emit('editor-disposed', { id });
    }

    for (const [uri, model] of this.models) {
      model.dispose();
      this.emit('model-disposed', { uri });
    }

    this.editors.clear();
    this.models.clear();

    logger.info('[MonacoCore] All editors and models disposed');
  }

  /**
   * Get Monaco API
   * @returns {Object} Monaco API
   */
  getMonaco() {
    return this.monaco;
  }

  /**
   * Get statistics
   * @returns {Object} Stats
   */
  getStats() {
    return {
      initialized: this.initialized,
      editorCount: this.editors.size,
      modelCount: this.models.size,
      theme: this.options.theme,
      editors: Array.from(this.editors.keys()),
      models: Array.from(this.models.keys())
    };
  }
}

export default MonacoEditorCore;
