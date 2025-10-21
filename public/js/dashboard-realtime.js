// public/js/dashboard-realtime.js
// Real-time WebSocket connection manager for Scarmonit AI Dashboard

class DashboardRealtimeClient {
  constructor(options = {}) {
    this.wsUrl = options.wsUrl || this.getWebSocketUrl();
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Start at 1 second
    this.maxReconnectDelay = 60000; // Max 60 seconds
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.connectionTimeout = 30000; // 30 seconds
    this.isConnected = false;
    this.listeners = {};

    // Callbacks
    this.onConnected = options.onConnected || (() => {});
    this.onDisconnected = options.onDisconnected || (() => {});
    this.onMessage = options.onMessage || (() => {});
    this.onError = options.onError || (() => {});
  }

  getWebSocketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/api/websocket`;
  }

  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[Dashboard RT] Already connected');
      return;
    }

    console.log(`[Dashboard RT] Connecting to ${this.wsUrl}...`);

    try {
      this.ws = new WebSocket(this.wsUrl);

      // Connection timeout
      const connectionTimer = setTimeout(() => {
        if (this.ws.readyState !== WebSocket.OPEN) {
          console.warn('[Dashboard RT] Connection timeout');
          this.ws.close();
          this.scheduleReconnect();
        }
      }, this.connectionTimeout);

      this.ws.onopen = () => {
        clearTimeout(connectionTimer);
        console.log('[Dashboard RT] Connected!');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.onConnected();
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          console.error('[Dashboard RT] Message parse error:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[Dashboard RT] WebSocket error:', error);
        this.onError(error);
      };

      this.ws.onclose = (event) => {
        clearTimeout(connectionTimer);
        this.stopHeartbeat();
        this.isConnected = false;

        console.log(`[Dashboard RT] Disconnected (code: ${event.code})`);
        this.onDisconnected();

        // Reconnect unless it was a normal closure
        if (event.code !== 1000) {
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      console.error('[Dashboard RT] Connection error:', error);
      this.onError(error);
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Dashboard RT] Max reconnection attempts reached');
      this.onError(new Error('Max reconnection attempts reached'));
      return;
    }

    this.reconnectAttempts++;

    // Exponential backoff with jitter
    const jitter = Math.random() * 1000;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1) + jitter,
      this.maxReconnectDelay
    );

    console.log(`[Dashboard RT] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping', timestamp: Date.now() });
      }
    }, 30000); // 30 seconds
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  handleMessage(data) {
    // Handle pong responses
    if (data.type === 'pong') {
      return;
    }

    // Emit to listeners
    this.onMessage(data);

    // Emit to specific event listeners
    if (this.listeners[data.type]) {
      this.listeners[data.type].forEach(callback => callback(data));
    }
  }

  on(eventType, callback) {
    if (!this.listeners[eventType]) {
      this.listeners[eventType] = [];
    }
    this.listeners[eventType].push(callback);
  }

  off(eventType, callback) {
    if (this.listeners[eventType]) {
      this.listeners[eventType] = this.listeners[eventType].filter(cb => cb !== callback);
    }
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('[Dashboard RT] Cannot send - not connected');
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
  }
}

// Export for use in dashboard
window.DashboardRealtimeClient = DashboardRealtimeClient;
