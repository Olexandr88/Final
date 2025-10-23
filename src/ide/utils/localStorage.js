/**
 * localStorage Utilities
 * Helper functions for persisting IDE state
 */

const KEYS = {
  RECENT_FILES: 'llm-ide-recent-files',
  COLLAPSED_WIDGETS: 'llm-ide-collapsed-widgets',
  FAVORITE_SNIPPETS: 'llm-ide-favorite-snippets',
  THEME: 'llm-ide-theme',
  SIDEBAR_WIDTH: 'llm-ide-sidebar-width',
  BOTTOM_PANEL_HEIGHT: 'llm-ide-bottom-panel-height'
};

/**
 * Recent Files Management
 */

export function getRecentFiles() {
  try {
    const stored = localStorage.getItem(KEYS.RECENT_FILES);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error reading recent files:', error);
    return [];
  }
}

export function addRecentFile(file) {
  try {
    const recentFiles = getRecentFiles();

    // Remove existing entry if present
    const filtered = recentFiles.filter(f => f.path !== file.path);

    // Add to beginning
    filtered.unshift({
      ...file,
      timestamp: Date.now()
    });

    // Limit to 10 most recent
    const limited = filtered.slice(0, 10);

    localStorage.setItem(KEYS.RECENT_FILES, JSON.stringify(limited));
  } catch (error) {
    console.error('Error adding recent file:', error);
  }
}

export function clearRecentFiles() {
  try {
    localStorage.removeItem(KEYS.RECENT_FILES);
  } catch (error) {
    console.error('Error clearing recent files:', error);
  }
}

/**
 * Widget Collapse State Management
 */

export function getCollapsedWidgets() {
  try {
    const stored = localStorage.getItem(KEYS.COLLAPSED_WIDGETS);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error('Error reading collapsed widgets:', error);
    return {};
  }
}

export function setWidgetCollapsed(widgetId, collapsed) {
  try {
    const collapsedWidgets = getCollapsedWidgets();
    collapsedWidgets[widgetId] = collapsed;
    localStorage.setItem(KEYS.COLLAPSED_WIDGETS, JSON.stringify(collapsedWidgets));
  } catch (error) {
    console.error('Error setting widget collapsed state:', error);
  }
}

/**
 * Favorite Snippets Management
 */

export function getFavoriteSnippets() {
  try {
    const stored = localStorage.getItem(KEYS.FAVORITE_SNIPPETS);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error reading favorite snippets:', error);
    return [];
  }
}

export function toggleFavoriteSnippet(snippetId) {
  try {
    const favorites = getFavoriteSnippets();
    const index = favorites.indexOf(snippetId);

    if (index === -1) {
      // Add to favorites
      favorites.push(snippetId);
    } else {
      // Remove from favorites
      favorites.splice(index, 1);
    }

    localStorage.setItem(KEYS.FAVORITE_SNIPPETS, JSON.stringify(favorites));
  } catch (error) {
    console.error('Error toggling favorite snippet:', error);
  }
}

/**
 * Utility Functions
 */

export function getRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) {
    return 'Just now';
  } else if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  } else if (hours < 24) {
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  } else if (days === 1) {
    return 'Yesterday';
  } else if (days < 7) {
    return `${days} days ago`;
  } else {
    const date = new Date(timestamp);
    return date.toLocaleDateString();
  }
}

/**
 * Theme Management
 */

export function getTheme() {
  try {
    return localStorage.getItem(KEYS.THEME) || 'llm-dark';
  } catch (error) {
    console.error('Error reading theme:', error);
    return 'llm-dark';
  }
}

export function setTheme(theme) {
  try {
    localStorage.setItem(KEYS.THEME, theme);
  } catch (error) {
    console.error('Error setting theme:', error);
  }
}

/**
 * UI Preferences
 */

export function getSidebarWidth() {
  try {
    const stored = localStorage.getItem(KEYS.SIDEBAR_WIDTH);
    return stored ? parseInt(stored, 10) : 300;
  } catch (error) {
    console.error('Error reading sidebar width:', error);
    return 300;
  }
}

export function setSidebarWidth(width) {
  try {
    localStorage.setItem(KEYS.SIDEBAR_WIDTH, width.toString());
  } catch (error) {
    console.error('Error setting sidebar width:', error);
  }
}

export function getBottomPanelHeight() {
  try {
    const stored = localStorage.getItem(KEYS.BOTTOM_PANEL_HEIGHT);
    return stored ? parseInt(stored, 10) : 200;
  } catch (error) {
    console.error('Error reading bottom panel height:', error);
    return 200;
  }
}

export function setBottomPanelHeight(height) {
  try {
    localStorage.setItem(KEYS.BOTTOM_PANEL_HEIGHT, height.toString());
  } catch (error) {
    console.error('Error setting bottom panel height:', error);
  }
}
