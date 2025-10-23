/**
 * Title Bar Component
 * Custom title bar for Electron window
 */

import React from 'react';
import './TitleBar.css';

const TitleBar = ({ theme, onThemeChange }) => {
  const handleMinimize = () => {
    if (window.electron) {
      window.electron.minimize();
    }
  };

  const handleMaximize = () => {
    if (window.electron) {
      window.electron.maximize();
    }
  };

  const handleClose = () => {
    if (window.electron) {
      window.electron.close();
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === 'llm-dark' ? 'llm-light' : 'llm-dark';
    onThemeChange(newTheme);
  };

  return (
    <div className="title-bar">
      <div className="title-bar-drag">
        <div className="title-bar-icon">
          <span>🤖</span>
        </div>
        <div className="title-bar-title">
          LLM Framework IDE
        </div>
      </div>

      <div className="title-bar-controls">
        <button
          className="title-bar-button"
          onClick={toggleTheme}
          title="Toggle Theme"
        >
          {theme === 'llm-dark' ? '☀️' : '🌙'}
        </button>

        <button
          className="title-bar-button"
          onClick={handleMinimize}
          title="Minimize"
        >
          <span className="control-icon">─</span>
        </button>

        <button
          className="title-bar-button"
          onClick={handleMaximize}
          title="Maximize"
        >
          <span className="control-icon">□</span>
        </button>

        <button
          className="title-bar-button close"
          onClick={handleClose}
          title="Close"
        >
          <span className="control-icon">×</span>
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
