/**
 * Side Panel Component
 * Displays different views based on active activity
 */

import React, { useState } from 'react';
import './SidePanel.css';

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

export default SidePanel;
