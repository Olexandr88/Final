# Multi-Session Discovery & Communication

## Overview

The **Session Discovery System** enables multiple Claude Code sessions to automatically discover and communicate with each other via the AI Bridge WebSocket hub. This creates a collaborative environment where different sessions can coordinate work, share state, and avoid conflicts.

## Features

✅ **Automatic Discovery** - Sessions automatically announce their presence and discover other active sessions
✅ **Real-time Heartbeats** - Health monitoring with automatic stale session cleanup
✅ **Direct Messaging** - Send messages to specific sessions
✅ **Broadcasting** - Announce to all sessions simultaneously
✅ **Capability Matching** - Find sessions with specific capabilities (e.g., "typescript", "docker")
✅ **File Coordination** - Prevent conflicts with distributed locking
✅ **Web Dashboard** - Visual monitoring of all active sessions
✅ **CLI Monitor** - Interactive terminal-based session monitor

## Quick Start

### 1. Start the AI Bridge

The AI Bridge must be running for session discovery to work:

```bash
npm run start:bridge
```

This starts the WebSocket hub on `ws://localhost:65028` and HTTP API on `http://localhost:65029`.

### 2. Monitor Active Sessions

#### Option A: Web Dashboard

```bash
npm run session:dashboard
```

Opens a beautiful web dashboard at `http://localhost:8080` showing:

- All discovered sessions in real-time
- Session health status
- Capabilities
- Direct messaging interface

#### Option B: CLI Monitor (Interactive)

```bash
npm run session:monitor:i
```

Interactive terminal monitor with commands:

- `list` - Show all sessions
- `stats` - Display statistics
- `details <id>` - Session details
- `send <id> <message>` - Send message
- `broadcast <message>` - Broadcast to all
- `refresh` - Force refresh

#### Option C: One-time List

```bash
npm run session:list
npm run session:stats
```

### 3. Enable in Your Code

#### Auto-initialization (Recommended)

```javascript
import { initSessionAwareness } from './src/session-aware-integration.js';

// Initialize with defaults
const aware = await initSessionAwareness({
  sessionName: 'MyProject',
  capabilities: ['typescript', 'react'],
  metadata: {
    description: 'Working on the frontend',
  },
});

// Now you can discover and communicate
const sessions = aware.getSessions();
console.log(`Discovered ${sessions.length} other sessions`);
```

#### Manual Control

```javascript
import SessionDiscoveryService from './src/session-discovery.js';

const discovery = new SessionDiscoveryService({
  sessionName: 'Backend-API-Dev',
  capabilities: ['nodejs', 'express', 'postgresql'],
  metadata: {
    port: 3000,
    env: 'development',
  },
});

// Event handlers
discovery.on('sessionDiscovered', (session) => {
  console.log(`Found: ${session.sessionName}`);
});

discovery.on('sessionMessage', ({ fromSession, payload }) => {
  console.log(`Message from ${fromSession.sessionName}:`, payload);
});

// Connect
await discovery.connect();
```

## Common Use Cases

### 1. Avoid File Conflicts

Multiple sessions editing the same file? The session coordinator prevents conflicts:

```javascript
import { initSessionAwareness } from './src/session-aware-integration.js';

const aware = await initSessionAwareness({ useCoordinator: true });

// Coordinate file access
await aware.coordinateFileAccess(
  'src/app.js',
  async () => {
    // Only one session can edit at a time
    await fs.promises.writeFile('src/app.js', newContent);
  },
  'write'
);
```

### 2. Find Specialized Sessions

Looking for a session with specific capabilities?

```javascript
// Find all sessions that can work with Docker
const dockerSessions = aware.findCapability('docker');

if (dockerSessions.length > 0) {
  // Send deployment request
  aware.sendToSession(dockerSessions[0].sessionId, {
    type: 'deploy_request',
    image: 'myapp:latest',
  });
}
```

### 3. Broadcast Status Updates

```javascript
// Notify all sessions of important events
aware.broadcast({
  type: 'build_complete',
  status: 'success',
  buildTime: '42s',
  timestamp: new Date().toISOString(),
});
```

### 4. Session-to-Session Messaging

```javascript
// Send message to specific session
const backendSession = aware.getSession('Backend-API');

if (backendSession) {
  aware.sendToSession(backendSession.sessionId, {
    type: 'api_request',
    endpoint: '/users',
    method: 'POST',
  });
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    AI Bridge Hub                        │
│           (WebSocket: ws://localhost:65028)             │
│           (HTTP: http://localhost:65029)                │
└─────────────────────────────────────────────────────────┘
         ▲              ▲              ▲              ▲
         │              │              │              │
    ┌────┴───┐    ┌────┴───┐    ┌────┴───┐    ┌────┴───┐
    │Session1│    │Session2│    │Session3│    │Dashboard│
    │Frontend│    │Backend │    │DevOps  │    │Monitor  │
    └────────┘    └────────┘    └────────┘    └────────┘
```

### Components

1. **AI Bridge** - Central WebSocket hub for all communication
2. **Session Discovery Service** - Announces presence, discovers others
3. **Session Coordinator** - Distributed locking for file safety
4. **Session Aware Integration** - Unified API for easy usage
5. **Session Monitor CLI** - Terminal-based monitoring
6. **Web Dashboard** - Visual session monitoring

## Events

Sessions emit the following events:

```javascript
discovery.on('sessionDiscovered', (session) => {
  // New session found
  console.log(session.sessionName, session.capabilities);
});

discovery.on('sessionDeparted', (session) => {
  // Session disconnected
  console.log(`${session.sessionName} left`);
});

discovery.on('sessionMessage', ({ fromSession, payload }) => {
  // Direct message received
  console.log(`Message from ${fromSession.sessionName}:`, payload);
});

discovery.on('sessionHeartbeat', (session) => {
  // Session sent heartbeat (every 10s)
});

discovery.on('sessionStale', (session) => {
  // Session hasn't sent heartbeat in 30s
});

discovery.on('error', (error) => {
  // Error occurred
});

discovery.on('disconnected', () => {
  // Lost connection to bridge
});

discovery.on('registered', (client) => {
  // Successfully registered with bridge
});
```

## Configuration

### Environment Variables

```bash
# AI Bridge URL (default: ws://localhost:65028)
export AI_BRIDGE_URL=ws://localhost:65028

# Session settings
export SESSION_HEARTBEAT_INTERVAL=10000  # 10 seconds
export SESSION_STALE_THRESHOLD=30000     # 30 seconds
```

### Programmatic Configuration

```javascript
const discovery = new SessionDiscoveryService({
  bridgeUrl: 'ws://localhost:65028',
  sessionId: null, // Auto-generated if not provided
  sessionName: 'MySession',
  capabilities: ['typescript'],
  metadata: { custom: 'data' },
  heartbeatInterval: 10000, // 10 seconds
  staleThreshold: 30000, // 30 seconds
  logger: console,
});
```

## API Reference

### SessionDiscoveryService

#### Methods

```javascript
// Connect to AI Bridge
await discovery.connect();

// Disconnect and cleanup
await discovery.disconnect();

// Get all discovered sessions
const sessions = discovery.getSessions();
// Returns: Array<{sessionId, sessionName, capabilities, metadata, lastSeen, ...}>

// Get specific session
const session = discovery.getSession(sessionId);

// Send message to specific session
discovery.sendToSession(targetSessionId, payload);

// Broadcast to all sessions
discovery.broadcast(payload);

// Get statistics
const stats = discovery.getStats();
// Returns: {messagesReceived, messagesSent, sessionsDiscovered, sessionsDeparted, activeSessions, ...}
```

### SessionAwareIntegration

#### Methods

```javascript
// Initialize (returns this for chaining)
await aware.init(options);

// Get discovery service
const discovery = aware.discover();

// Get coordinator
const coordinator = aware.coordinate();

// Get all sessions
const sessions = aware.getSessions();

// Get session by ID or name
const session = aware.getSession('Frontend-Dev');

// Send message
aware.sendToSession('sessionId', payload);

// Broadcast
aware.broadcast(payload);

// Find capability
const sessions = aware.findCapability('docker');

// Coordinate file access
await aware.coordinateFileAccess(
  filePath,
  async () => {
    // Your operation
  },
  'write'
);

// Get statistics
const stats = aware.getStats();

// Format session list
const formatted = aware.formatSessionList();

// Cleanup
await aware.cleanup();
```

## Demo

Run the multi-session demo to see it in action:

```bash
node scripts/demo-multi-session.js
```

This creates 3 simulated sessions (Frontend, Backend, DevOps) that discover each other and exchange messages.

## Troubleshooting

### Sessions not discovering each other

1. **Check AI Bridge is running:**

   ```bash
   curl http://localhost:65029/health
   ```

2. **Verify WebSocket connection:**

   ```bash
   # Should show connected clients
   curl http://localhost:65029/api/clients
   ```

3. **Check for port conflicts:**

   ```bash
   # Windows
   netstat -ano | findstr :65028

   # Linux/Mac
   lsof -i :65028
   ```

### High memory usage

If you have many long-running sessions, they accumulate history. The AI Bridge automatically cleans up stale sessions and limits history size.

Configure limits in `.env`:

```bash
AI_BRIDGE_HISTORY_LIMIT=50          # Max history entries
AI_BRIDGE_MAX_QUEUE=50              # Max queued messages per client
AI_BRIDGE_CLIENT_TTL_MS=600000      # Client TTL (10 minutes)
```

### Sessions marked as stale

Sessions send heartbeats every 10 seconds. If a session doesn't send a heartbeat for 30 seconds, it's marked stale. This can happen if:

- The session process is suspended
- Network issues
- High CPU load preventing heartbeat

Increase the threshold if needed:

```javascript
const discovery = new SessionDiscoveryService({
  staleThreshold: 60000, // 60 seconds
});
```

## Integration with Existing Code

Add session awareness to any existing Claude Code workflow:

```javascript
import { initSessionAwareness } from './src/session-aware-integration.js';

// Existing code
async function myWorkflow() {
  // Add session awareness
  const aware = await initSessionAwareness({
    sessionName: 'MyWorkflow',
    capabilities: ['analysis', 'refactoring'],
  });

  // Your existing workflow
  await doWork();

  // Cleanup
  await aware.cleanup();
}
```

## Best Practices

1. **Always cleanup** - Call `await discovery.disconnect()` or `await aware.cleanup()` before exiting
2. **Use descriptive session names** - Makes it easier to identify sessions
3. **Declare capabilities** - Helps other sessions find you
4. **Handle messages gracefully** - Don't assume message format
5. **Monitor health** - Use the dashboard or CLI to spot issues
6. **Coordinate file access** - Use the coordinator to prevent conflicts
7. **Keep metadata minimal** - Don't include large objects in metadata

## Advanced Usage

### Custom Message Handlers

```javascript
discovery.on('sessionMessage', ({ fromSession, payload }) => {
  switch (payload.type) {
    case 'build_request':
      handleBuildRequest(payload);
      break;
    case 'deploy_request':
      handleDeployRequest(payload);
      break;
    case 'status_check':
      // Respond with status
      discovery.sendToSession(fromSession.sessionId, {
        type: 'status_response',
        status: 'healthy',
        metrics: getMetrics(),
      });
      break;
  }
});
```

### Session Pools

Create pools of specialized sessions:

```javascript
// Find all sessions with specific capability
const buildSessions = aware.findCapability('build');
const testSessions = aware.findCapability('test');
const deploySessions = aware.findCapability('deploy');

// Distribute work
async function runPipeline() {
  // Build
  if (buildSessions.length > 0) {
    await aware.sendToSession(buildSessions[0].sessionId, {
      type: 'build',
      target: 'production',
    });
  }

  // Wait for build...

  // Test
  if (testSessions.length > 0) {
    await aware.sendToSession(testSessions[0].sessionId, {
      type: 'test',
      suite: 'integration',
    });
  }

  // Deploy
  if (deploySessions.length > 0) {
    await aware.sendToSession(deploySessions[0].sessionId, {
      type: 'deploy',
      environment: 'staging',
    });
  }
}
```

## Contributing

Improvements welcome! Key areas:

- More robust error handling
- Persistence of session history
- Session groups/channels
- Authentication/authorization
- Load balancing across sessions
- Session migration/handoff

## License

ISC

---

**Questions?** Check the main project README or create an issue.
