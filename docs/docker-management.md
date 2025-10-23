# Docker Management Dashboard

A comprehensive Docker management interface for the LLM Multi-Provider Framework, inspired by [lazydocker](https://github.com/jesseduffield/lazydocker).

## Features

### Container Management
- **Lifecycle Control**: Start, stop, restart, pause, unpause, and remove containers
- **Real-time Monitoring**: Live CPU, memory, network I/O, and disk stats
- **Log Streaming**: Real-time log viewing with search and auto-scroll
- **Interactive Shell**: Exec into containers with full TTY support via xterm.js
- **Bulk Operations**: Manage multiple containers simultaneously

### Image Management
- **Image Discovery**: List all local Docker images with size and creation date
- **Pull Images**: Download images from Docker Hub and other registries
- **Image Cleanup**: Remove unused images to free disk space
- **Layer Inspection**: View image layers and history

### Volume Management
- **Volume Discovery**: List all Docker volumes with usage information
- **Volume Cleanup**: Remove unused volumes
- **Mount Inspection**: See which containers are using which volumes

### Network Management
- **Network Discovery**: List all Docker networks and their drivers
- **Network Creation**: Create custom networks for container communication
- **Topology View**: Visualize container network connections

### Docker Compose Support
- **Project Detection**: Automatically detect docker-compose.yml files
- **Service Management**: Start/stop entire Compose projects
- **Service Scaling**: Scale services up or down
- **Multi-container Logs**: View aggregated logs from all services

### AI Bridge Integration
- **Agent Coordination**: Docker events broadcast to all AI agents
- **Autonomous Management**: AI agents can control Docker based on system state
- **A2A MCP Protocol**: Distributed Docker management across nodes
- **Memory Integration**: Learn from Docker patterns and optimize

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Renderer Process                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  docker-dashboard.html (UI)                         │   │
│  │  ├─ Container List (table)                          │   │
│  │  ├─ Detail View (tabs)                              │   │
│  │  │  ├─ Overview                                     │   │
│  │  │  ├─ Logs (streaming)                             │   │
│  │  │  ├─ Stats (Chart.js graphs)                      │   │
│  │  │  ├─ Environment                                  │   │
│  │  │  └─ Terminal (xterm.js)                          │   │
│  │  └─ Actions (buttons)                               │   │
│  └─────────────────────────────────────────────────────┘   │
│                            ▲ WebSocket                       │
│                            │ (port 65030)                    │
└────────────────────────────┼────────────────────────────────┘
                             │
┌────────────────────────────┼────────────────────────────────┐
│                    Electron Main Process                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  docker-events-emitter.js (WebSocket Server)        │  │
│  └──────────────────────────────────────────────────────┘  │
│                            ▲                                 │
│                            │ Events                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  docker-manager.js (Business Logic)                  │  │
│  │  ├─ Container polling (2s intervals)                 │  │
│  │  ├─ Stats collection (1s intervals)                  │  │
│  │  ├─ Event emission                                   │  │
│  │  └─ LRU caching                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                            ▲                                 │
│                            │ API calls                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  docker-client.js (Dockerode Wrapper)                │  │
│  │  ├─ Container operations                             │  │
│  │  ├─ Image operations                                 │  │
│  │  ├─ Volume operations                                │  │
│  │  └─ Network operations                               │  │
│  └──────────────────────────────────────────────────────┘  │
│                            ▲                                 │
└────────────────────────────┼────────────────────────────────┘
                             │ Docker API
                             ▼
                    ┌──────────────────┐
                    │  Docker Daemon   │
                    │  (unix socket /  │
                    │   named pipe)    │
                    └──────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              AI Bridge Integration (port 65028)              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  docker-monitoring-agent.js                          │  │
│  │  ├─ Subscribes to Docker events                      │  │
│  │  ├─ Reports to other agents                          │  │
│  │  └─ Receives Docker control commands                 │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Installation

### Prerequisites

1. **Docker**: Ensure Docker is installed and running
   - Windows: Docker Desktop for Windows
   - macOS: Docker Desktop for Mac
   - Linux: Docker Engine

2. **Node.js**: Version 18+ required (project uses Node.js 22.21.0)

### Install Dependencies

```bash
npm install
```

This will install:
- `dockerode@^4.0.2` - Docker Engine API client
- `chart.js@^4.4.0` - Real-time stats visualization
- `xterm@^5.3.0` - Terminal emulator
- `xterm-addon-fit@^0.8.0` - Terminal resize addon
- `node-pty@^1.0.0` - PTY for interactive shells

### Configuration

Environment variables (optional):

```bash
# Custom Docker socket/host
export DOCKER_HOST=tcp://192.168.1.100:2376

# TLS certificates for remote Docker
export DOCKER_CERT_PATH=/path/to/certs

# Custom socket path (Unix)
export DOCKER_SOCKET=/var/run/docker.sock
```

## Usage

### Launch Dashboard

From Electron app:
1. Go to **View** → **Docker Dashboard**
2. Dashboard opens in new window

From command line:
```bash
npm run electron
# Then open Docker Dashboard from menu
```

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+R` | Reload dashboard |
| `Ctrl+L` | Clear selected container logs |
| `Ctrl+T` | Open terminal for selected container |
| `Ctrl+F` | Focus search/filter |
| `↑/↓` | Navigate container list |
| `Enter` | View selected container details |
| `Space` | Toggle container (start/stop) |
| `Delete` | Remove selected container (with confirmation) |

### Container Actions

**From List View:**
- **Start**: Click play button (▶) or press `Space` on stopped container
- **Stop**: Click stop button (■) or press `Space` on running container
- **Restart**: Click restart button (↻)
- **Remove**: Click delete button (🗑) or press `Delete`

**From Detail View:**
- **View Logs**: Switch to "Logs" tab
- **View Stats**: Switch to "Stats" tab for CPU/memory graphs
- **Open Terminal**: Switch to "Terminal" tab, click "Connect"
- **View Environment**: Switch to "Environment" tab

### Log Viewer

- **Auto-scroll**: Enabled by default (disable with checkbox)
- **Search**: Use search box to filter log lines
- **Clear**: Click "Clear" button to reset view
- **Download**: Click "Download" to save logs to file

### Stats Graphs

- **CPU Usage**: Line graph showing CPU percentage over time
- **Memory Usage**: Line graph showing memory MB over time
- **Network I/O**: Dual-line graph (rx/tx bytes per second)
- **Time Window**: Last 60 seconds (configurable)

## API Reference

### DockerClient

```javascript
import { DockerClient } from './src/docker/docker-client.js';

const client = new DockerClient();

// Ping Docker daemon
const isAvailable = await client.ping();

// List containers
const containers = await client.listContainers();

// Start container
await client.startContainer('container_id');

// Get container stats
const stats = await client.getContainerStats('container_id');

// Stream logs
const logStream = await client.getContainerLogs('container_id', {
  follow: true,
  tail: 100
});
```

### DockerManager

```javascript
import { DockerManager } from './src/docker/docker-manager.js';

const manager = new DockerManager();

// Start polling
await manager.start();

// Listen to events
manager.on('container:started', (container) => {
  console.log('Container started:', container.name);
});

manager.on('container:stats', ({ id, stats }) => {
  console.log(`CPU: ${stats.cpuPercent}%`);
});

// Stop polling
await manager.stop();
```

### Docker Events Emitter

```javascript
import { DockerEventsEmitter } from './src/docker/docker-events-emitter.js';

const emitter = new DockerEventsEmitter(manager);

// Start WebSocket server
await emitter.start(65030);

// Stop server
await emitter.stop();
```

## Development

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests (requires Docker)
npm run test:integration

# With coverage
npm run test:coverage
```

### Linting

```bash
# Check for issues
npm run lint

# Auto-fix
npm run lint:fix
```

### Building

```bash
# Development build
npm run build

# Production build
npm run build:optimized
```

## Troubleshooting

### Docker daemon not available

**Error**: `Docker daemon not available`

**Solution**:
1. Ensure Docker is running (`docker ps` should work)
2. Check Docker socket permissions:
   - Linux: Add user to `docker` group: `sudo usermod -aG docker $USER`
   - Windows: Ensure Docker Desktop is running
3. Verify `DOCKER_HOST` environment variable if using remote Docker

### Permission denied accessing Docker socket

**Error**: `Error: connect EACCES /var/run/docker.sock`

**Solution (Linux)**:
```bash
# Add current user to docker group
sudo usermod -aG docker $USER

# Restart session or run
newgrp docker
```

### WebSocket connection failed

**Error**: `WebSocket connection to 'ws://localhost:65030' failed`

**Solution**:
1. Check if Docker Manager is running
2. Verify port 65030 is not in use by another process
3. Check firewall settings

### Stats not updating

**Issue**: Container stats graphs are frozen

**Solution**:
1. Verify container is running
2. Check browser console for WebSocket errors
3. Restart Docker Manager

### Terminal not connecting

**Issue**: Terminal tab shows "Failed to connect"

**Solution**:
1. Ensure container has `/bin/bash` or `/bin/sh`
2. Check container is running
3. Verify `node-pty` is installed correctly

## Performance Tuning

### Polling Intervals

Edit `src/config/constants.js`:

```javascript
export const DOCKER_CONFIG = {
  POLL_INTERVAL_CONTAINERS: 2000, // 2 seconds
  POLL_INTERVAL_STATS: 1000,      // 1 second
  STATS_HISTORY_LENGTH: 60,        // 60 data points
  LOG_BUFFER_SIZE: 10000,          // 10k lines
  CACHE_TTL: 300000,               // 5 minutes
  MAX_CONCURRENT_STATS: 10         // Parallel stats collection
};
```

### Memory Optimization

For large deployments (100+ containers):

```javascript
// Reduce stats history
STATS_HISTORY_LENGTH: 30  // 30 seconds instead of 60

// Increase cache TTL
CACHE_TTL: 600000  // 10 minutes

// Limit concurrent stats collection
MAX_CONCURRENT_STATS: 5
```

### UI Performance

For large container lists:

- Enable virtual scrolling (automatically activates for >50 containers)
- Disable auto-refresh during heavy operations
- Use filters to show only relevant containers

## Security

### Docker Socket Access

- **Main Process Only**: Docker socket never exposed to renderer process
- **IPC Boundary**: All Docker operations go through IPC handlers
- **Input Validation**: All user inputs sanitized before Docker API calls

### Command Injection Prevention

- **No Shell Commands**: Uses dockerode APIs exclusively
- **Parameterized Execution**: docker exec uses parameterized commands
- **Escape Special Characters**: All strings escaped before use

### Credential Management

- **OS Keychain**: Registry credentials stored in system keychain
- **No Logging**: Passwords and tokens never logged
- **Credential Helpers**: Support for docker-credential-* helpers

### Content Security Policy

Renderer process CSP:
```javascript
"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:65030"
```

## Contributing

### Code Style

- Follow existing code conventions (ESLint rules)
- 2-space indentation
- Single quotes for strings
- Semicolons required
- Max line length: 100 characters

### Testing Requirements

- All new features must have unit tests
- Integration tests for Docker API interactions
- Minimum 85% code coverage

### Pull Request Process

1. Create feature branch: `git checkout -b feat/your-feature`
2. Implement changes with tests
3. Run linting and tests: `npm run lint && npm test`
4. Commit with conventional commits: `feat: add container restart button`
5. Push and create PR to `main` branch

## License

ISC - Same as parent project (LLM Multi-Provider Framework)

## Credits

- Inspired by [lazydocker](https://github.com/jesseduffield/lazydocker) by Jesse Duffield
- Built for the [LLM Multi-Provider Framework](https://github.com/Scarmonit/LLM)
- Docker API integration via [dockerode](https://github.com/apocas/dockerode)

## Support

- **Issues**: https://github.com/Scarmonit/LLM/issues
- **Discussions**: https://github.com/Scarmonit/LLM/discussions
- **Email**: scarmonit@gmail.com

---

**Last Updated**: 2025-10-23
**Version**: 1.0.0
**Feature Branch**: feat/docker-management-dashboard
