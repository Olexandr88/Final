/**
 * Activity Bar Component
 * Left-side navigation bar with icons for different views
 */

import React from 'react';
import './ActivityBar.css';

const ActivityBar = ({ activeView, onViewChange }) => {
  const views = [
    {
      id: 'explorer',
      icon: '📁',
      title: 'Explorer',
      shortcut: 'Ctrl+Shift+E'
    },
    {
      id: 'search',
      icon: '🔍',
      title: 'Search',
      shortcut: 'Ctrl+Shift+F'
    },
    {
      id: 'git',
      icon: '🌿',
      title: 'Source Control',
      shortcut: 'Ctrl+Shift+G'
    },
    {
      id: 'documentation',
      icon: '📚',
      title: 'Documentation',
      shortcut: 'Ctrl+Shift+H'
    },
    {
      id: 'ai-assistant',
      icon: '🤖',
      title: 'AI Assistant',
      shortcut: 'Ctrl+Shift+A'
    },
    {
      id: 'extensions',
      icon: '🧩',
      title: 'Extensions',
      shortcut: 'Ctrl+Shift+X'
    },
    {
      id: 'settings',
      icon: '⚙️',
      title: 'Settings',
      shortcut: 'Ctrl+,'
    }
  ];

  return (
    <div className="activity-bar">
      <div className="activity-bar-items">
        {views.map(view => (
          <button
            key={view.id}
            className={`activity-bar-item ${activeView === view.id ? 'active' : ''}`}
            onClick={() => onViewChange(view.id)}
            title={`${view.title} (${view.shortcut})`}
            data-view={view.id}
          >
            <span className="activity-bar-icon">{view.icon}</span>
            <span className="activity-bar-label">{view.title}</span>
          </button>
        ))}
      </div>

      <div className="activity-bar-bottom">
        <button
          className="activity-bar-item"
          title="Account"
        >
          <span className="activity-bar-icon">👤</span>
        </button>
      </div>
    </div>
  );
};

export default ActivityBar;
