/**
 * Editor Area Component
 * Main code editing area with tab management
 */

import React, { useEffect, useRef, useState } from 'react';
import './EditorArea.css';

const EditorArea = ({
  monaco,
  openFiles,
  activeFile,
  onFileChange,
  onFileClose,
  onAICommand
}) => {
  const editorContainerRef = useRef(null);
  const editorInstanceRef = useRef(null);
  const [editorReady, setEditorReady] = useState(false);

  // Initialize editor when Monaco is ready
  useEffect(() => {
    if (!monaco || !editorContainerRef.current || editorInstanceRef.current) {
      return;
    }

    try {
      const { editor } = monaco.createEditor(editorContainerRef.current, {
        value: activeFile?.content || '// Start coding...',
        language: activeFile?.language || 'javascript',
        theme: 'llm-dark',
        automaticLayout: true,
        minimap: { enabled: true },
        fontSize: 14,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        tabSize: 2,
        insertSpaces: true,
        formatOnPaste: true,
        formatOnType: true,
        suggestOnTriggerCharacters: true,
        quickSuggestions: {
          other: true,
          comments: false,
          strings: true
        },
        parameterHints: {
          enabled: true
        },
        contextmenu: true,
        mouseWheelZoom: true,
        folding: true,
        foldingStrategy: 'indentation',
        showFoldingControls: 'always',
        matchBrackets: 'always',
        autoClosingBrackets: 'always',
        autoClosingQuotes: 'always',
        autoIndent: 'full'
      });

      editorInstanceRef.current = editor;
      setEditorReady(true);

      // Register keyboard shortcuts
      editor.addAction({
        id: 'ai.generateDocs',
        label: 'Generate AI Documentation',
        keybindings: [
          monaco.getMonaco().KeyMod.CtrlCmd | monaco.getMonaco().KeyMod.Shift | monaco.getMonaco().KeyCode.KeyD
        ],
        contextMenuGroupId: 'ai',
        contextMenuOrder: 1,
        run: async (ed) => {
          const selection = ed.getSelection();
          const selectedText = ed.getModel().getValueInRange(selection);

          if (selectedText) {
            try {
              const docs = await onAICommand('docs', {
                code: selectedText,
                language: activeFile?.language || 'javascript'
              });

              if (docs) {
                ed.executeEdits('ai-docs', [{
                  range: new monaco.getMonaco().Range(
                    selection.startLineNumber,
                    1,
                    selection.startLineNumber,
                    1
                  ),
                  text: docs + '\n'
                }]);
              }
            } catch (error) {
              console.error('[Editor] AI docs generation failed:', error);
            }
          }
        }
      });

      editor.addAction({
        id: 'ai.refactor',
        label: 'AI Refactor Code',
        keybindings: [
          monaco.getMonaco().KeyMod.CtrlCmd | monaco.getMonaco().KeyMod.Shift | monaco.getMonaco().KeyCode.KeyR
        ],
        contextMenuGroupId: 'ai',
        contextMenuOrder: 2,
        run: async (ed) => {
          const selection = ed.getSelection();
          const selectedText = ed.getModel().getValueInRange(selection);

          if (selectedText) {
            try {
              const refactorings = await onAICommand('refactor', {
                code: selectedText,
                language: activeFile?.language || 'javascript',
                range: {
                  startLine: selection.startLineNumber,
                  startColumn: selection.startColumn,
                  endLine: selection.endLineNumber,
                  endColumn: selection.endColumn
                }
              });

              if (refactorings && refactorings.length > 0) {
                // Apply first refactoring suggestion
                const refactoring = refactorings[0];
                ed.executeEdits('ai-refactor', [{
                  range: selection,
                  text: refactoring.newCode
                }]);
              }
            } catch (error) {
              console.error('[Editor] AI refactoring failed:', error);
            }
          }
        }
      });

      console.log('[EditorArea] Editor initialized');
    } catch (error) {
      console.error('[EditorArea] Failed to initialize editor:', error);
    }

    return () => {
      if (editorInstanceRef.current) {
        editorInstanceRef.current.dispose();
        editorInstanceRef.current = null;
        setEditorReady(false);
      }
    };
  }, [monaco]);

  // Update editor when active file changes
  useEffect(() => {
    if (!editorInstanceRef.current || !activeFile) {
      return;
    }

    const editor = editorInstanceRef.current;
    const monacoApi = monaco.getMonaco();

    // Create or get model for this file
    const uri = monacoApi.Uri.parse(activeFile.path);
    let model = monacoApi.editor.getModel(uri);

    if (!model) {
      model = monaco.createModel(
        activeFile.content || '',
        activeFile.language || 'javascript',
        activeFile.path
      );
    }

    // Set model to editor
    editor.setModel(model);

    // Update language if needed
    if (model.getLanguageId() !== activeFile.language) {
      monacoApi.editor.setModelLanguage(model, activeFile.language);
    }

    console.log('[EditorArea] Active file changed:', activeFile.path);
  }, [activeFile, monaco]);

  // Handle file tab click
  const handleTabClick = (file) => {
    onFileChange(file);
  };

  // Handle file tab close
  const handleTabClose = (e, file) => {
    e.stopPropagation();
    onFileClose(file);
  };

  // Get file icon based on extension
  const getFileIcon = (filename) => {
    const ext = filename.split('.').pop();
    const iconMap = {
      'js': '📄',
      'jsx': '⚛️',
      'ts': '🔷',
      'tsx': '⚛️',
      'py': '🐍',
      'json': '📋',
      'md': '📝',
      'html': '🌐',
      'css': '🎨',
      'yaml': '⚙️',
      'yml': '⚙️'
    };

    return iconMap[ext] || '📄';
  };

  return (
    <div className="editor-area">
      <div className="editor-tabs">
        {openFiles.map(file => (
          <div
            key={file.path}
            className={`editor-tab ${activeFile?.path === file.path ? 'active' : ''}`}
            onClick={() => handleTabClick(file)}
          >
            <span className="tab-icon">{getFileIcon(file.name)}</span>
            <span className="tab-label">{file.name}</span>
            <button
              className="tab-close"
              onClick={(e) => handleTabClose(e, file)}
              title="Close"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="editor-container" ref={editorContainerRef}>
        {!monaco && (
          <div className="editor-loading">
            <div className="loading-spinner"></div>
            <p>Loading Monaco Editor...</p>
          </div>
        )}

        {monaco && openFiles.length === 0 && (
          <div className="editor-welcome">
            <h2>LLM Framework IDE</h2>
            <p>AI-powered code editor with Claude integration</p>
            <div className="welcome-shortcuts">
              <h3>Quick Actions:</h3>
              <ul>
                <li><kbd>Ctrl+N</kbd> New File</li>
                <li><kbd>Ctrl+O</kbd> Open File</li>
                <li><kbd>Ctrl+Shift+A</kbd> AI Assistant</li>
                <li><kbd>Ctrl+Shift+D</kbd> Generate AI Docs</li>
                <li><kbd>Ctrl+Shift+R</kbd> AI Refactor</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EditorArea;
