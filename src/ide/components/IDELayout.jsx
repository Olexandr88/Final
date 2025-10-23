/**
 * IDE Main Layout Component
 * Visual Studio-inspired layout with activity bar, sidebar, editor, and panels
 */

import React, { useState, useEffect, useRef } from 'react';
import { MonacoEditorCore } from '../core/monaco-editor-core.js';
import { AIIntegration } from '../features/ai-integration.js';
import { IntelliSenseProvider } from '../features/intellisense-provider.js';
import ActivityBar from './ActivityBar.jsx';
import SidePanel from './SidePanel.jsx';
import EditorArea from './EditorArea.jsx';
import BottomPanel from './BottomPanel.jsx';
import StatusBar from './StatusBar.jsx';
import TitleBar from './TitleBar.jsx';
import './IDELayout.css';

/**
 * Main IDE Layout Component
 */
const IDELayout = () => {
  const [theme, setTheme] = useState('llm-dark');
  const [activeView, setActiveView] = useState('explorer');
  const [sidePanelWidth, setSidePanelWidth] = useState(250);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(200);
  const [bottomPanelVisible, setBottomPanelVisible] = useState(true);
  const [openFiles, setOpenFiles] = useState([]);
  const [activeFile, setActiveFile] = useState(null);
  const [aiConnected, setAiConnected] = useState(false);

  const monacoRef = useRef(null);
  const aiIntegrationRef = useRef(null);
  const intelliSenseRef = useRef(null);

  // Initialize Monaco and AI integration
  useEffect(() => {
    const init = async () => {
      try {
        // Initialize Monaco Editor
        monacoRef.current = new MonacoEditorCore({ theme });
        await monacoRef.current.initialize();

        // Initialize AI Integration
        aiIntegrationRef.current = new AIIntegration({
          bridgeUrl: 'ws://localhost:65028',
          clientId: `ide-${Date.now()}`,
          preferredProvider: 'claude'
        });

        // Connect to AI Bridge
        await aiIntegrationRef.current.connect();
        setAiConnected(true);

        // Setup IntelliSense
        const monaco = monacoRef.current.getMonaco();
        intelliSenseRef.current = new IntelliSenseProvider(
          monaco,
          aiIntegrationRef.current
        );
        intelliSenseRef.current.registerProviders();

        console.log('[IDE] Initialized successfully');
      } catch (error) {
        console.error('[IDE] Initialization failed:', error);
        setAiConnected(false);
      }
    };

    init();

    // Cleanup on unmount
    return () => {
      if (monacoRef.current) {
        monacoRef.current.disposeAll();
      }
      if (aiIntegrationRef.current) {
        aiIntegrationRef.current.disconnect();
      }
      if (intelliSenseRef.current) {
        intelliSenseRef.current.dispose();
      }
    };
  }, []);

  // Handle theme change
  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    if (monacoRef.current) {
      monacoRef.current.setTheme(newTheme);
    }
  };

  // Handle file open
  const handleFileOpen = (file) => {
    if (!openFiles.find(f => f.path === file.path)) {
      setOpenFiles([...openFiles, file]);
    }
    setActiveFile(file);
  };

  // Handle file close
  const handleFileClose = (file) => {
    const newOpenFiles = openFiles.filter(f => f.path !== file.path);
    setOpenFiles(newOpenFiles);

    if (activeFile?.path === file.path) {
      setActiveFile(newOpenFiles[newOpenFiles.length - 1] || null);
    }
  };

  // Handle AI command
  const handleAICommand = async (command, params) => {
    if (!aiIntegrationRef.current || !aiConnected) {
      console.warn('[IDE] AI not connected');
      return;
    }

    try {
      switch (command) {
        case 'complete':
          return await aiIntegrationRef.current.getCompletions(params);
        case 'fix':
          return await aiIntegrationRef.current.suggestFix(params);
        case 'refactor':
          return await aiIntegrationRef.current.getRefactorings(params);
        case 'docs':
          return await aiIntegrationRef.current.generateDocs(params);
        case 'analyze':
          return await aiIntegrationRef.current.analyzeCode(params);
        default:
          console.warn('[IDE] Unknown AI command:', command);
      }
    } catch (error) {
      console.error('[IDE] AI command failed:', error);
      throw error;
    }
  };

  return (
    <div className="ide-layout" data-theme={theme}>
      <TitleBar
        theme={theme}
        onThemeChange={handleThemeChange}
      />

      <div className="ide-main">
        <ActivityBar
          activeView={activeView}
          onViewChange={setActiveView}
        />

        <SidePanel
          view={activeView}
          width={sidePanelWidth}
          onResize={setSidePanelWidth}
          onFileOpen={handleFileOpen}
          aiConnected={aiConnected}
        />

        <div className="ide-content">
          <EditorArea
            monaco={monacoRef.current}
            openFiles={openFiles}
            activeFile={activeFile}
            onFileChange={setActiveFile}
            onFileClose={handleFileClose}
            onAICommand={handleAICommand}
          />

          {bottomPanelVisible && (
            <BottomPanel
              height={bottomPanelHeight}
              onResize={setBottomPanelHeight}
              onClose={() => setBottomPanelVisible(false)}
              aiConnected={aiConnected}
              onAICommand={handleAICommand}
            />
          )}
        </div>
      </div>

      <StatusBar
        activeFile={activeFile}
        theme={theme}
        aiConnected={aiConnected}
        onToggleBottomPanel={() => setBottomPanelVisible(!bottomPanelVisible)}
      />
    </div>
  );
};

export default IDELayout;
