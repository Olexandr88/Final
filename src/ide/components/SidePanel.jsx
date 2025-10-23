/**
 * Side Panel Component
 * Displays different views based on active activity
 */

import React, { useState, useEffect } from 'react';
import './SidePanel.css';
import shortcutsData from '../data/shortcuts.json';
import snippetsData from '../data/snippets.json';
import {
  getRecentFiles,
  getCollapsedWidgets,
  setWidgetCollapsed,
  getFavoriteSnippets,
  toggleFavoriteSnippet,
  getRelativeTime
} from '../utils/localStorage.js';

const SidePanel = ({ view, width, onResize, onFileOpen, aiConnected }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = (e) => {
    setIsDragging(true);
    e.preventDefault();
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const newWidth = e.clientX - 48; // Subtract activity bar width
    if (newWidth >= 200 && newWidth <= 600) {
      onResize(newWidth);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging]);

  const renderView = () => {
    switch (view) {
      case 'explorer':
        return <ExplorerView onFileOpen={onFileOpen} />;
      case 'search':
        return <SearchView />;
      case 'git':
        return <GitView />;
      case 'documentation':
        return <DocumentationView />;
      case 'ai-assistant':
        return <AIAssistantView connected={aiConnected} />;
      case 'extensions':
        return <ExtensionsView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <div>Select a view</div>;
    }
  };

  return (
    <div className="side-panel" style={{ width: `${width}px` }}>
      <div className="side-panel-content">
        {renderView()}
      </div>
      <div
        className="side-panel-resize-handle"
        onMouseDown={handleMouseDown}
      />
    </div>
  );
};

// Explorer View
const ExplorerView = ({ onFileOpen }) => {
  return (
    <div className="panel-view">
      <div className="panel-header">
        <h3>Explorer</h3>
      </div>
      <div className="panel-body">
        <div className="file-tree">
          <div className="file-tree-message">
            Open a folder to start exploring
          </div>
          <button className="btn-primary">Open Folder</button>
        </div>
      </div>
    </div>
  );
};

// Search View
const SearchView = () => {
  return (
    <div className="panel-view">
      <div className="panel-header">
        <h3>Search</h3>
      </div>
      <div className="panel-body">
        <input
          type="text"
          className="search-input"
          placeholder="Search..."
        />
        <div className="search-results">
          <p>No results</p>
        </div>
      </div>
    </div>
  );
};

// Git View
const GitView = () => {
  return (
    <div className="panel-view">
      <div className="panel-header">
        <h3>Source Control</h3>
      </div>
      <div className="panel-body">
        <div className="git-status">
          <p>No repository detected</p>
        </div>
      </div>
    </div>
  );
};

// AI Assistant View
const AIAssistantView = ({ connected }) => {
  return (
    <div className="panel-view">
      <div className="panel-header">
        <h3>AI Assistant</h3>
        <div className={`ai-status ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? '🟢' : '🔴'}
        </div>
      </div>
      <div className="panel-body">
        <div className="ai-chat">
          {connected ? (
            <>
              <div className="chat-messages">
                <div className="chat-message assistant">
                  <div className="message-content">
                    Hello! I'm your AI coding assistant powered by Claude. How can I help you today?
                  </div>
                </div>
              </div>
              <div className="chat-input-container">
                <input
                  type="text"
                  className="chat-input"
                  placeholder="Ask me anything..."
                />
                <button className="btn-send">Send</button>
              </div>
            </>
          ) : (
            <div className="ai-disconnected">
              <p>AI Bridge is not connected</p>
              <p>Start the AI Bridge to enable AI features</p>
              <code>npm run start:bridge</code>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Extensions View
const ExtensionsView = () => {
  return (
    <div className="panel-view">
      <div className="panel-header">
        <h3>Extensions</h3>
      </div>
      <div className="panel-body">
        <input
          type="text"
          className="search-input"
          placeholder="Search extensions..."
        />
        <div className="extensions-list">
          <p>No extensions installed</p>
        </div>
      </div>
    </div>
  );
};

// Settings View
const SettingsView = () => {
  return (
    <div className="panel-view">
      <div className="panel-header">
        <h3>Settings</h3>
      </div>
      <div className="panel-body">
        <div className="settings-list">
          <div className="setting-item">
            <label>Theme</label>
            <select>
              <option>LLM Dark</option>
              <option>LLM Light</option>
            </select>
          </div>
          <div className="setting-item">
            <label>Font Size</label>
            <input type="number" defaultValue="14" min="8" max="24" />
          </div>
          <div className="setting-item">
            <label>Tab Size</label>
            <input type="number" defaultValue="2" min="2" max="8" />
          </div>
        </div>
      </div>
    </div>
  );
};

// Documentation View
const DocumentationView = () => {
  const [collapsedWidgets, setCollapsedWidgets] = useState(() => getCollapsedWidgets());
  const [recentFiles, setRecentFiles] = useState(() => getRecentFiles());
  const [favoriteSnippets, setFavoriteSnippets] = useState(() => getFavoriteSnippets());
  const [selectedSnippet, setSelectedSnippet] = useState(null);

  const toggleWidget = (widgetId) => {
    const isCollapsed = !collapsedWidgets[widgetId];
    setWidgetCollapsed(widgetId, isCollapsed);
    setCollapsedWidgets({ ...collapsedWidgets, [widgetId]: isCollapsed });
  };

  const handleToggleFavorite = (snippetId) => {
    toggleFavoriteSnippet(snippetId);
    setFavoriteSnippets(getFavoriteSnippets());
  };

  const handleCopySnippet = (code) => {
    navigator.clipboard.writeText(code);
  };

  return (
    <div className="panel-view documentation-view">
      <div className="panel-header">
        <h3>Documentation & Reference</h3>
      </div>
      <div className="panel-body">
        {/* Keyboard Shortcuts Widget */}
        <div className="doc-widget">
          <div
            className="doc-widget-header"
            onClick={() => toggleWidget('shortcuts')}
          >
            <span className="widget-icon">{collapsedWidgets['shortcuts'] ? '▶' : '▼'}</span>
            <h4>Keyboard Shortcuts</h4>
          </div>
          {!collapsedWidgets['shortcuts'] && (
            <div className="doc-widget-content">
              {Object.entries(shortcutsData).map(([category, shortcuts]) => (
                <div key={category} className="shortcut-category">
                  <div className="category-title">{category}</div>
                  {shortcuts.map((shortcut, idx) => (
                    <div key={idx} className="shortcut-item">
                      <span className="shortcut-action">{shortcut.action}</span>
                      <span className="shortcut-keys">
                        {shortcut.keys.map((key, i) => (
                          <React.Fragment key={i}>
                            <kbd className="key">{key}</kbd>
                            {i < shortcut.keys.length - 1 && <span className="key-plus">+</span>}
                          </React.Fragment>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Files Widget */}
        <div className="doc-widget">
          <div
            className="doc-widget-header"
            onClick={() => toggleWidget('recent')}
          >
            <span className="widget-icon">{collapsedWidgets['recent'] ? '▶' : '▼'}</span>
            <h4>Recent Files</h4>
          </div>
          {!collapsedWidgets['recent'] && (
            <div className="doc-widget-content">
              {recentFiles.length === 0 ? (
                <div className="empty-state">No recent files</div>
              ) : (
                recentFiles.map((file, idx) => (
                  <div key={idx} className="recent-file-item">
                    <span className="file-icon">📄</span>
                    <div className="file-info">
                      <div className="file-name">{file.name}</div>
                      <div className="file-meta">{getRelativeTime(file.timestamp)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Code Snippets Widget */}
        <div className="doc-widget">
          <div
            className="doc-widget-header"
            onClick={() => toggleWidget('snippets')}
          >
            <span className="widget-icon">{collapsedWidgets['snippets'] ? '▶' : '▼'}</span>
            <h4>Code Snippets</h4>
          </div>
          {!collapsedWidgets['snippets'] && (
            <div className="doc-widget-content">
              {Object.entries(snippetsData).map(([category, snippets]) => (
                <div key={category} className="snippet-category">
                  <div className="category-title">{category}</div>
                  {snippets.map((snippet, idx) => {
                    const snippetId = `${category}-${idx}`;
                    const isFavorite = favoriteSnippets.includes(snippetId);
                    return (
                      <div key={idx} className="snippet-item">
                        <div className="snippet-header">
                          <span className="snippet-name">{snippet.name}</span>
                          <div className="snippet-actions">
                            <button
                              className={`btn-icon ${isFavorite ? 'favorite' : ''}`}
                              onClick={() => handleToggleFavorite(snippetId)}
                              title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                            >
                              {isFavorite ? '★' : '☆'}
                            </button>
                            <button
                              className="btn-icon"
                              onClick={() => setSelectedSnippet(selectedSnippet === snippetId ? null : snippetId)}
                              title="View code"
                            >
                              {selectedSnippet === snippetId ? '▲' : '▼'}
                            </button>
                          </div>
                        </div>
                        {selectedSnippet === snippetId && (
                          <div className="snippet-code-container">
                            <div className="snippet-code-header">
                              <span className="code-language">{snippet.language}</span>
                              <button
                                className="btn-copy"
                                onClick={() => handleCopySnippet(snippet.code)}
                                title="Copy to clipboard"
                              >
                                📋 Copy
                              </button>
                            </div>
                            <pre className="snippet-code">
                              <code>{snippet.code}</code>
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Reference Widget */}
        <div className="doc-widget">
          <div
            className="doc-widget-header"
            onClick={() => toggleWidget('reference')}
          >
            <span className="widget-icon">{collapsedWidgets['reference'] ? '▶' : '▼'}</span>
            <h4>Quick Reference</h4>
          </div>
          {!collapsedWidgets['reference'] && (
            <div className="doc-widget-content">
              <div className="reference-section">
                <h5>AI Bridge API</h5>
                <div className="api-item">
                  <div className="api-signature">
                    <code>window.aiBridge.connect(url)</code>
                  </div>
                  <div className="api-description">
                    Connect to AI Bridge WebSocket server. Default: ws://localhost:65028
                  </div>
                </div>
                <div className="api-item">
                  <div className="api-signature">
                    <code>window.aiBridge.send(ws, message)</code>
                  </div>
                  <div className="api-description">
                    Send message to AI Bridge. Message must be JSON serializable.
                  </div>
                </div>
              </div>

              <div className="reference-section">
                <h5>Monaco Editor API</h5>
                <div className="api-item">
                  <div className="api-signature">
                    <code>editor.getSelection()</code>
                  </div>
                  <div className="api-description">
                    Get current text selection range
                  </div>
                </div>
                <div className="api-item">
                  <div className="api-signature">
                    <code>editor.getValue()</code>
                  </div>
                  <div className="api-description">
                    Get entire editor content
                  </div>
                </div>
              </div>

              <div className="reference-section">
                <h5>Electron IPC</h5>
                <div className="api-item">
                  <div className="api-signature">
                    <code>window.electron.readFile(path)</code>
                  </div>
                  <div className="api-description">
                    Read file from filesystem (returns Promise)
                  </div>
                </div>
                <div className="api-item">
                  <div className="api-signature">
                    <code>window.electron.writeFile(path, content)</code>
                  </div>
                  <div className="api-description">
                    Write file to filesystem (returns Promise)
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SidePanel;
