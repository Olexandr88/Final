/**
 * Status Bar Component
 * Bottom status bar showing file info, language, AI status
 */

import React from 'react';
import './StatusBar.css';

const StatusBar = ({ activeFile, theme, aiConnected, onToggleBottomPanel }) => {
  const getLanguageLabel = (language) => {
    const labels = {
      'javascript': 'JavaScript',
      'typescript': 'TypeScript',
      'python': 'Python',
      'json': 'JSON',
      'markdown': 'Markdown',
      'html': 'HTML',
      'css': 'CSS',
      'yaml': 'YAML'
    };
    return labels[language] || language.toUpperCase();
  };

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        <div className="status-item">
          <span className="status-icon">🔌</span>
          <span className={`status-text ${aiConnected ? 'connected' : 'disconnected'}`}>
            {aiConnected ? 'AI Bridge Connected' : 'AI Bridge Disconnected'}
          </span>
        </div>

        {activeFile && (
          <>
            <div className="status-separator"></div>
            <div className="status-item">
              <span className="status-icon">📄</span>
              <span className="status-text">{activeFile.name}</span>
            </div>

            <div className="status-separator"></div>
            <div className="status-item">
              <span className="status-text">
                {getLanguageLabel(activeFile.language || 'text')}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="status-bar-right">
        <button
          className="status-item status-button"
          onClick={onToggleBottomPanel}
          title="Toggle Bottom Panel"
        >
          <span className="status-icon">📋</span>
          <span className="status-text">Terminal</span>
        </button>

        <div className="status-separator"></div>

        <div className="status-item">
          <span className="status-text">{theme === 'llm-dark' ? '🌙 Dark' : '☀️ Light'}</span>
        </div>

        <div className="status-separator"></div>

        <div className="status-item">
          <span className="status-text">LLM Framework IDE v1.0.0</span>
        </div>
      </div>
    </div>
  );
};

export default StatusBar;
