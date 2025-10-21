// api/websocket.js - Vercel Edge Function for WebSocket Proxy
// Proxies WebSocket connections from dashboard to AI Bridge (port 65028)

export const config = {
  runtime: 'edge',
};

const AI_BRIDGE_WS_URL = process.env.AI_BRIDGE_WS_URL || 'ws://localhost:65028';
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

export default async function handler(req) {
  const upgradeHeader = req.headers.get('Upgrade');

  if (upgradeHeader !== 'websocket') {
    return new Response('Expected WebSocket', { status: 426 });
  }

  try {
    // Upgrade to WebSocket
    const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);

    // Connect to AI Bridge
    const bridgeSocket = new WebSocket(AI_BRIDGE_WS_URL);
    let heartbeatTimer = null;

    // Client -> Bridge forwarding
    clientSocket.onmessage = (event) => {
      if (bridgeSocket.readyState === WebSocket.OPEN) {
        bridgeSocket.send(event.data);
      }
    };

    // Bridge -> Client forwarding
    bridgeSocket.onmessage = (event) => {
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(event.data);
      }
    };

    // Connection established
    clientSocket.onopen = () => {
      console.log('[WS Proxy] Client connected');

      // Start heartbeat to keep connection alive
      heartbeatTimer = setInterval(() => {
        if (bridgeSocket.readyState === WebSocket.OPEN) {
          bridgeSocket.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        }
      }, HEARTBEAT_INTERVAL);
    };

    bridgeSocket.onopen = () => {
      console.log('[WS Proxy] Connected to AI Bridge');

      // Request initial agent status
      bridgeSocket.send(JSON.stringify({ 
        type: 'request.status', 
        source: 'dashboard',
        timestamp: Date.now() 
      }));
    };

    // Error handling
    clientSocket.onerror = (error) => {
      console.error('[WS Proxy] Client error:', error);
    };

    bridgeSocket.onerror = (error) => {
      console.error('[WS Proxy] Bridge error:', error);
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.close(1011, 'Bridge connection error');
      }
    };

    // Cleanup on disconnect
    const cleanup = () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }
      if (bridgeSocket.readyState === WebSocket.OPEN) {
        bridgeSocket.close();
      }
    };

    clientSocket.onclose = () => {
      console.log('[WS Proxy] Client disconnected');
      cleanup();
    };

    bridgeSocket.onclose = () => {
      console.log('[WS Proxy] Bridge disconnected');
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.close(1011, 'Bridge connection closed');
      }
      cleanup();
    };

    return response;
  } catch (error) {
    console.error('[WS Proxy] Error:', error);
    return new Response('WebSocket upgrade failed', { status: 500 });
  }
}
