/**
 * IntelliSense Provider for Monaco Editor
 * AI-powered code completion and suggestions
 * @module ide/features/intellisense-provider
 */

import { logger } from '../../utils/logger.js';

/**
 * IntelliSense Provider
 * Registers completion, hover, and signature help providers with Monaco
 */
export class IntelliSenseProvider {
  constructor(monaco, aiIntegration) {
    this.monaco = monaco;
    this.ai = aiIntegration;
    this.providers = [];
    this.debounceTimers = new Map();
  }

  /**
   * Register all IntelliSense providers
   */
  registerProviders() {
    const languages = ['javascript', 'typescript', 'python', 'json'];

    for (const language of languages) {
      this._registerCompletionProvider(language);
      this._registerHoverProvider(language);
      this._registerCodeActionProvider(language);
      this._registerSignatureHelpProvider(language);
    }

    logger.info('[IntelliSense] Providers registered', { languages });
  }

  /**
   * Register completion provider (AI-powered autocomplete)
   * @private
   */
  _registerCompletionProvider(language) {
    const provider = this.monaco.languages.registerCompletionItemProvider(language, {
      triggerCharacters: ['.', '(', '{', '[', ' ', '"', "'"],

      provideCompletionItems: async (model, position, context, token) => {
        try {
          // Get code context
          const textBeforeCursor = model.getValueInRange({
            startLineNumber: Math.max(1, position.lineNumber - 10),
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column
          });

          const currentLine = model.getLineContent(position.lineNumber);
          const wordInfo = model.getWordAtPosition(position);

          // Debounce AI requests
          const debounceKey = `${model.uri.toString()}-${position.lineNumber}`;
          if (this.debounceTimers.has(debounceKey)) {
            clearTimeout(this.debounceTimers.get(debounceKey));
          }

          return new Promise((resolve) => {
            const timer = setTimeout(async () => {
              this.debounceTimers.delete(debounceKey);

              // Get AI completions
              const aiSuggestions = await this.ai.getCompletions({
                code: textBeforeCursor,
                language,
                position: {
                  line: position.lineNumber,
                  column: position.column
                },
                currentLine,
                word: wordInfo?.word
              });

              // Convert to Monaco suggestions format
              const suggestions = aiSuggestions.map((item, index) => ({
                label: item.label || item.text,
                kind: this._getCompletionKind(item.kind),
                detail: item.detail || 'AI suggestion',
                documentation: item.documentation || '',
                insertText: item.insertText || item.text,
                range: {
                  startLineNumber: position.lineNumber,
                  startColumn: wordInfo?.startColumn || position.column,
                  endLineNumber: position.lineNumber,
                  endColumn: wordInfo?.endColumn || position.column
                },
                sortText: `0000${index}`, // Prioritize AI suggestions
                filterText: item.filterText || item.text,
                preselect: index === 0, // Preselect first suggestion
                additionalTextEdits: item.additionalEdits || []
              }));

              resolve({
                suggestions,
                incomplete: false
              });
            }, 300); // 300ms debounce

            this.debounceTimers.set(debounceKey, timer);
          });
        } catch (error) {
          logger.error('[IntelliSense] Completion failed', { error: error.message });
          return { suggestions: [] };
        }
      }
    });

    this.providers.push(provider);
  }

  /**
   * Register hover provider (show documentation on hover)
   * @private
   */
  _registerHoverProvider(language) {
    const provider = this.monaco.languages.registerHoverProvider(language, {
      provideHover: async (model, position) => {
        try {
          const wordInfo = model.getWordAtPosition(position);
          if (!wordInfo) return null;

          const word = wordInfo.word;
          const line = model.getLineContent(position.lineNumber);

          // Get AI-powered documentation
          const docs = await this.ai.generateDocs({
            code: line,
            language,
            word,
            style: 'inline'
          });

          if (!docs) return null;

          return {
            range: new this.monaco.Range(
              position.lineNumber,
              wordInfo.startColumn,
              position.lineNumber,
              wordInfo.endColumn
            ),
            contents: [
              { value: `**${word}**` },
              { value: docs }
            ]
          };
        } catch (error) {
          logger.error('[IntelliSense] Hover failed', { error: error.message });
          return null;
        }
      }
    });

    this.providers.push(provider);
  }

  /**
   * Register code action provider (quick fixes and refactorings)
   * @private
   */
  _registerCodeActionProvider(language) {
    const provider = this.monaco.languages.registerCodeActionProvider(language, {
      provideCodeActions: async (model, range, context) => {
        const actions = [];

        try {
          // AI-powered quick fixes for errors
          if (context.markers && context.markers.length > 0) {
            for (const marker of context.markers) {
              const fix = await this.ai.suggestFix({
                message: marker.message,
                severity: marker.severity,
                code: marker.code,
                range: {
                  startLine: marker.startLineNumber,
                  startColumn: marker.startColumn,
                  endLine: marker.endLineNumber,
                  endColumn: marker.endColumn
                },
                source: model.getValueInRange(range),
                language
              });

              if (fix && fix.edit) {
                actions.push({
                  title: `AI Fix: ${fix.description}`,
                  kind: 'quickfix',
                  edit: {
                    edits: [{
                      resource: model.uri,
                      edit: fix.edit
                    }]
                  },
                  isPreferred: true
                });
              }
            }
          }

          // AI-powered refactoring suggestions
          const code = model.getValueInRange(range);
          if (code && code.trim().length > 0) {
            const refactorings = await this.ai.getRefactorings({
              code,
              language,
              range: {
                startLine: range.startLineNumber,
                startColumn: range.startColumn,
                endLine: range.endLineNumber,
                endColumn: range.endColumn
              }
            });

            for (const refactoring of refactorings) {
              actions.push({
                title: `AI Refactor: ${refactoring.title}`,
                kind: 'refactor',
                edit: {
                  edits: [{
                    resource: model.uri,
                    edit: refactoring.edit
                  }]
                }
              });
            }

            // Generate documentation action
            actions.push({
              title: 'Generate AI Documentation',
              kind: 'refactor.rewrite',
              command: {
                id: 'ai.generateDocs',
                title: 'Generate Documentation',
                arguments: [model.uri, range]
              }
            });
          }

          return { actions, dispose: () => {} };
        } catch (error) {
          logger.error('[IntelliSense] Code actions failed', { error: error.message });
          return { actions: [] };
        }
      }
    });

    this.providers.push(provider);
  }

  /**
   * Register signature help provider (function parameter hints)
   * @private
   */
  _registerSignatureHelpProvider(language) {
    const provider = this.monaco.languages.registerSignatureHelpProvider(language, {
      signatureHelpTriggerCharacters: ['(', ','],
      signatureHelpRetriggerCharacters: [','],

      provideSignatureHelp: async (model, position, token, context) => {
        try {
          const textBeforeCursor = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column
          });

          // Extract function call context
          const match = textBeforeCursor.match(/(\w+)\s*\([^)]*$/);
          if (!match) return null;

          const functionName = match[1];

          // Get AI-powered signature information
          const result = await this.ai._request('signature-help', {
            functionName,
            context: textBeforeCursor,
            language
          });

          if (!result || !result.signatures) return null;

          return {
            signatures: result.signatures.map(sig => ({
              label: sig.label,
              documentation: sig.documentation,
              parameters: sig.parameters || []
            })),
            activeSignature: 0,
            activeParameter: result.activeParameter || 0
          };
        } catch (error) {
          logger.error('[IntelliSense] Signature help failed', { error: error.message });
          return null;
        }
      }
    });

    this.providers.push(provider);
  }

  /**
   * Get Monaco completion kind from AI suggestion type
   * @private
   */
  _getCompletionKind(kind) {
    const CompletionItemKind = this.monaco.languages.CompletionItemKind;

    const kindMap = {
      'method': CompletionItemKind.Method,
      'function': CompletionItemKind.Function,
      'constructor': CompletionItemKind.Constructor,
      'field': CompletionItemKind.Field,
      'variable': CompletionItemKind.Variable,
      'class': CompletionItemKind.Class,
      'interface': CompletionItemKind.Interface,
      'module': CompletionItemKind.Module,
      'property': CompletionItemKind.Property,
      'unit': CompletionItemKind.Unit,
      'value': CompletionItemKind.Value,
      'enum': CompletionItemKind.Enum,
      'keyword': CompletionItemKind.Keyword,
      'snippet': CompletionItemKind.Snippet,
      'text': CompletionItemKind.Text,
      'color': CompletionItemKind.Color,
      'file': CompletionItemKind.File,
      'reference': CompletionItemKind.Reference,
      'folder': CompletionItemKind.Folder,
      'enumMember': CompletionItemKind.EnumMember,
      'constant': CompletionItemKind.Constant,
      'struct': CompletionItemKind.Struct,
      'event': CompletionItemKind.Event,
      'operator': CompletionItemKind.Operator,
      'typeParameter': CompletionItemKind.TypeParameter
    };

    return kindMap[kind] || CompletionItemKind.Text;
  }

  /**
   * Dispose all providers
   */
  dispose() {
    for (const provider of this.providers) {
      provider.dispose();
    }
    this.providers = [];

    // Clear debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    logger.info('[IntelliSense] Providers disposed');
  }
}

export default IntelliSenseProvider;
