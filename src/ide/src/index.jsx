/**
 * LLM Framework IDE - React Entry Point
 * Initializes the React application and renders the main IDE layout
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import IDELayout from '../components/IDELayout.jsx';
import '../components/global.css';

/**
 * Initialize the IDE
 */
function initializeIDE() {
  console.log('[IDE] Initializing LLM Framework IDE...');

  // Get root element
  const rootElement = document.getElementById('root');

  if (!rootElement) {
    console.error('[IDE] Root element not found');
    return;
  }

  // Create React root
  const root = ReactDOM.createRoot(rootElement);

  // Render IDE
  root.render(
    <React.StrictMode>
      <IDELayout />
    </React.StrictMode>
  );

  console.log('[IDE] IDE initialized successfully');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeIDE);
} else {
  initializeIDE();
}
