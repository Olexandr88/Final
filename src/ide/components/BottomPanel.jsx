/**
 * Bottom Panel Component
 * Terminal, output, problems, debug console, AI chat
 */

import React, { useState } from 'react';
import './BottomPanel.css';

const BottomPanel = ({ height, onResize, onClose, aiConnected, onAICommand }) => {
  const [activeTab, setActiveTab] = useState('terminal');
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = (e) => {
    setIsDragging(true);
    e.preventDefault();
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const windowHeight = window.innerHeight;
    const newHeight = windowHeight - e.clientY - 24; // Subtract status bar height
    if (newHeight >= 100 && newHeight <= 600) {
      onResize(newHeight);
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

  const tabs = [
    { id: 'terminal', label: 'Terminal', icon: '💻' },
    { id: 'output', label: 'Output', icon: '📋' },
    { id: 'problems', label: 'Problems', icon: '⚠️' },
    { id: 'debug', label: 'Debug Console', icon: '🐛' },
    { id: 'ai-chat', label: 'AI Chat', icon: '🤖' }
  ];

  return (
    <div className="bottom-panel" style={{ height: `${height}px` }}>
      <div
        className="bottom-panel-resize-handle"
        onMouseDown={handleMouseDown}
      />

      <div className="bottom-panel-header">
        <div className="bottom-panel-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`bottom-panel-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label">{tab.label}</span>
            </button>
          ))}
        </div>

        <button
          className="bottom-panel-close"
          onClick={onClose}
          title="Close Panel"
        >
          ×
        </button>
      </div>

      <div className="bottom-panel-content">
        {activeTab === 'terminal' && <TerminalTab />}
        {activeTab === 'output' && <OutputTab />}
        {activeTab === 'problems' && <ProblemsTab />}
        {activeTab === 'debug' && <DebugTab />}
        {activeTab === 'ai-chat' && <AIChatTab connected={aiConnected} onAICommand={onAICommand} />}
      </div>
    </div>
  );
};

// Terminal Tab
const TerminalTab = () => {
  return (
    <div className="panel-tab-content">
      <div className="terminal">
        <div className="terminal-output">
          <div className="terminal-line">
            <span className="terminal-prompt">$</span>
            <span className="terminal-text">Welcome to LLM Framework IDE Terminal</span>
          </div>
          <div className="terminal-line">
            <span className="terminal-prompt">$</span>
            <span className="terminal-text">Type commands here...</span>
          </div>
        </div>
        <div className="terminal-input-line">
          <span className="terminal-prompt">$</span>
          <input
            type="text"
            className="terminal-input"
            placeholder="Type a command..."
            autoFocus
          />
        </div>
      </div>
    </div>
  );
};

// Output Tab
const OutputTab = () => {
  return (
    <div className="panel-tab-content">
      <div className="output-content">
        <div className="output-line">[INFO] IDE initialized successfully</div>
        <div className="output-line">[INFO] Monaco Editor loaded</div>
        <div className="output-line">[INFO] AI Bridge connection established</div>
      </div>
    </div>
  );
};

// Problems Tab
const ProblemsTab = () => {
  return (
    <div className="panel-tab-content">
      <div className="problems-list">
        <div className="problems-empty">
          <span className="problems-icon">✅</span>
          <span>No problems detected</span>
        </div>
      </div>
    </div>
  );
};

// Debug Tab
const DebugTab = () => {
  return (
    <div className="panel-tab-content">
      <div className="debug-console">
        <div className="debug-empty">
          <span className="debug-icon">🐛</span>
          <span>No debug session active</span>
        </div>
      </div>
    </div>
  );
};

// AI Chat Tab
const AIChatTab = ({ connected, onAICommand }) => {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hello! I\'m your AI coding assistant. Ask me anything about your code!'
    }
  ]);
  const [input, setInput] = useState('');

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = { role: 'user', content: input };
    setMessages([...messages, userMessage]);
    setInput('');

    if (connected) {
      try {
        // Simulate AI response (in real app, call onAICommand)
        setTimeout(() => {
          const aiMessage = {
            role: 'assistant',
            content: `I received your message: "${input}". This is a demo response. Connect to AI Bridge for real responses.`
          };
          setMessages(prev => [...prev, aiMessage]);
        }, 1000);
      } catch (error) {
        console.error('AI command failed:', error);
      }
    } else {
      const errorMessage = {
        role: 'assistant',
        content: 'AI Bridge is not connected. Please start the AI Bridge to enable AI features.'
      };
      setMessages([...messages, errorMessage]);
    }
  };

  return (
    <div className="panel-tab-content ai-chat-tab">
      <div className="ai-messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`ai-message ${msg.role}`}>
            <div className="message-role">{msg.role === 'user' ? '👤' : '🤖'}</div>
            <div className="message-text">{msg.content}</div>
          </div>
        ))}
      </div>
      <div className="ai-input-container">
        <input
          type="text"
          className="ai-input"
          placeholder="Ask AI about your code..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
        />
        <button className="ai-send-btn" onClick={handleSend}>
          Send
        </button>
      </div>
    </div>
  );
};

export default BottomPanel;
