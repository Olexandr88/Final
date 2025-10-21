# Message Broker Integration Architecture

## Executive Summary

This document outlines the comprehensive strategy for replacing the current WebSocket-based AI Bridge with a production-grade message broker system. The design prioritizes reliability, scalability, and backward compatibility while maintaining low latency for agent-to-agent communication.

## Current System Analysis

### AI Bridge (WebSocket Hub)
- **WebSocket Server**: Port 56427 (configurable)
- **HTTP API**: Port 65038 (configurable)
- **Message Storage**: In-memory circular buffer (50 messages default)
- **Queue System**: Per-client queues (max 50 messages per client)
- **Delivery**: Best-effort, no persistence
- **Patterns**: Point-to-point and broadcast

### Key Metrics
- **Message Latency**: <120ms average
- **Memory Baseline**: <100MB idle
- **Connection Setup**: <200ms
- **Throughput**: ~100 messages/second currently

### Limitations
1. No message persistence (lost on restart)
2. No delivery guarantees
3. No replay capability beyond circular buffer
4. Limited scalability (single server)
5. No built-in dead letter queue
6. Manual circuit breaker implementation
7. No message ordering guarantees across clients

---

## Message Broker Evaluation

### 1. Redis Pub/Sub + Streams

**Pros:**
- Extremely low latency (~1-2ms)
- Simple deployment (single binary)
- Excellent Node.js support (ioredis)
- Built-in pub/sub for broadcasts
- Streams provide persistence and replay
- Consumer groups for load balancing
- Minimal operational overhead
- Can run alongside existing infrastructure

**Cons:**
- No guaranteed delivery by default
- Limited message retention (memory-based)
- No complex routing (but sufficient for A2A)
- Requires manual dead letter queue implementation

**Verdict**: RECOMMENDED - Best fit for this use case

**Use Cases:**
- Real-time agent communication
- Low-latency message passing
- Simple pub/sub patterns
- Moderate persistence requirements

---

### 2. RabbitMQ

**Pros:**
- Rich routing capabilities (exchanges, bindings)
- Strong delivery guarantees (ACKs, confirms)
- Built-in dead letter exchanges
- Mature ecosystem and tooling
- Good Node.js support (amqplib)
- Persistent messages by default
- Priority queues

**Cons:**
- Higher latency (~5-10ms)
- More complex to configure and maintain
- Heavier resource footprint
- Steeper learning curve
- May be overkill for A2A use case

**Verdict**: ALTERNATIVE - Use if strong guarantees required

**Use Cases:**
- Mission-critical workflows
- Complex routing requirements
- Strong ordering guarantees needed
- Enterprise environments

---

### 3. Apache Kafka

**Pros:**
- Exceptional throughput (millions of messages/sec)
- Long-term message retention
- Strong ordering guarantees per partition
- Built for high-scale distributed systems
- Excellent for event sourcing

**Cons:**
- Significant operational complexity (ZooKeeper/KRaft)
- Higher latency (~5-15ms)
- Heavy resource requirements (Java-based)
- Overkill for current scale
- Complex Node.js clients

**Verdict**: NOT RECOMMENDED - Too complex for current needs

**Use Cases:**
- Massive scale (thousands of agents)
- Long-term audit logs
- Event sourcing architectures
- Big data pipelines

---

## Recommended Architecture: Redis Hybrid Model

### Design Philosophy
Use Redis for real-time communication with strategic persistence, maintaining WebSocket connections for low-latency delivery while Redis handles message durability and routing.

### Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     AI Bridge (Enhanced)                     │
│  ┌────────────────┐         ┌──────────────────────────┐   │
│  │   WebSocket    │◄────────┤  Redis Message Broker    │   │
│  │   Server       │         │  - Pub/Sub Channels      │   │
│  │   (Port 56427) │─────────►  - Streams (Persistence) │   │
│  └────────────────┘         │  - Consumer Groups       │   │
│                              └──────────────────────────┘   │
│  ┌────────────────┐         ┌──────────────────────────┐   │
│  │   HTTP API     │         │  Dead Letter Queue       │   │
│  │   (Port 65038) │◄────────┤  (Redis Stream)          │   │
│  └────────────────┘         └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                    │                        ▲
                    │                        │
         ┌──────────┴────────────┬───────────┴───────────┐
         ▼                       ▼                       ▼
   ┌─────────┐            ┌─────────┐           ┌─────────┐
   │ Agent 1 │            │ Agent 2 │           │ Agent N │
   │ (Ollama)│            │(Claude) │           │ (Custom)│
   └─────────┘            └─────────┘           └─────────┘
```

### Redis Components

#### 1. Pub/Sub Channels
**Purpose**: Real-time broadcast and point-to-point delivery

**Channels:**
- `agent:broadcast` - System-wide broadcasts
- `agent:{clientId}` - Direct messages to specific agent
- `agent:intent:{intent}` - Intent-based routing (e.g., `agent:intent:code.analyze`)
- `agent:channel:{channel}` - Channel-based groups
- `bridge:control` - Bridge control messages

**Message Format:**
```json
{
  "id": "uuid-v4",
  "timestamp": "ISO-8601",
  "intent": "agent.message",
  "taskId": "task-uuid",
  "channel": "default",
  "priority": "normal",
  "from": "agent-id",
  "to": "agent-id-or-null",
  "payload": {},
  "trace": {}
}
```

#### 2. Redis Streams (Persistence)
**Purpose**: Message persistence, replay, and audit trail

**Streams:**
- `messages:all` - Complete message history (trimmed to 10k messages)
- `messages:task:{taskId}` - Task-specific message history
- `messages:agent:{agentId}` - Agent-specific inbox
- `messages:dlq` - Dead letter queue for failed messages

**Consumer Groups:**
- `bridge-consumers` - AI Bridge consumers
- `analyzer-consumers` - Analysis agent consumers
- `monitor-consumers` - Monitoring/audit consumers

**Stream Features:**
- **MAXLEN ~10000**: Automatic trimming to prevent memory bloat
- **Consumer Groups**: Multiple consumers, at-least-once delivery
- **XACK**: Explicit acknowledgment for reliability
- **XPENDING**: Track unprocessed messages

#### 3. Dead Letter Queue (DLQ)
**Stream**: `messages:dlq`

**When Messages Enter DLQ:**
- Agent offline for >5 minutes
- Delivery retries exhausted (3 attempts)
- Processing errors (exception thrown)
- Invalid message format
- Circuit breaker open

**DLQ Entry Format:**
```json
{
  "originalMessage": {},
  "error": "Error description",
  "attempts": 3,
  "firstAttempt": "timestamp",
  "lastAttempt": "timestamp",
  "reason": "max_retries|offline|invalid|circuit_open"
}
```

---

## Message Patterns

### Pattern 1: Point-to-Point (Direct Messaging)
```
Agent A → Redis Channel (agent:{clientId}) → Agent B
         ↓
    Redis Stream (messages:all) [audit]
```

**Flow:**
1. Agent A sends message to Redis
2. Bridge publishes to channel `agent:B`
3. Message persisted to stream `messages:all`
4. Agent B subscribes to `agent:B`, receives message
5. Agent B ACKs message

**Delivery Guarantee**: At-least-once

### Pattern 2: Broadcast
```
Agent A → Redis Channel (agent:broadcast) → All Agents
         ↓
    Redis Stream (messages:all) [audit]
```

**Flow:**
1. Agent A publishes to `agent:broadcast`
2. All subscribed agents receive message
3. Message persisted to stream

**Delivery Guarantee**: Best-effort (pub/sub)

### Pattern 3: Intent-Based Routing
```
Agent A → Redis Channel (agent:intent:code.analyze) → Agents with intent
         ↓
    Redis Stream (messages:task:{id})
```

**Flow:**
1. Agent A sends message with intent `code.analyze`
2. Bridge publishes to `agent:intent:code.analyze`
3. Analyzer agents subscribed to intent receive message
4. Consumer group ensures one agent processes it

**Delivery Guarantee**: At-least-once via consumer groups

### Pattern 4: Request/Response (RPC)
```
Agent A → Redis + replyTo → Agent B
Agent A ← Redis Channel ← Agent B
```

**Flow:**
1. Agent A sends message with `replyTo: agent-a-rpc-{uuid}`
2. Agent A subscribes to temporary channel
3. Agent B processes and publishes response to `replyTo` channel
4. Agent A receives response

**Delivery Guarantee**: At-most-once (timeout-based)

---

## Implementation Plan

### Phase 1: Foundation (Week 1)
**Goal**: Redis infrastructure and basic integration

**Tasks:**
1. Install and configure Redis 7.x
   - Enable persistence (RDB + AOF)
   - Configure memory limits
   - Set up monitoring

2. Create Redis client wrapper (`src/utils/redis-client.js`)
   ```javascript
   import { createClient } from 'redis';

   export class RedisClient {
     constructor(config) {
       this.client = createClient(config);
       this.subscriber = this.client.duplicate();
       this.publisher = this.client.duplicate();
     }

     async publish(channel, message) { }
     async subscribe(channel, handler) { }
     async streamAdd(stream, message) { }
     async streamRead(stream, consumerGroup, consumerId) { }
     async streamAck(stream, consumerGroup, messageId) { }
   }
   ```

3. Implement basic pub/sub bridge
   - Publish to Redis on `acceptEnvelope()`
   - Subscribe to relevant channels
   - Maintain WebSocket connections for delivery

**Deliverable**: Redis-backed pub/sub working alongside existing WebSocket

---

### Phase 2: Stream Persistence (Week 2)
**Goal**: Add message persistence and replay

**Tasks:**
1. Implement stream writing
   - Add all messages to `messages:all` stream
   - Add task messages to `messages:task:{id}` streams
   - Implement stream trimming (MAXLEN ~10000)

2. Implement consumer groups
   - Create consumer groups for agents
   - Implement XREAD with consumer groups
   - Add XACK for message acknowledgment

3. Create replay API
   - HTTP endpoint for message replay
   - WebSocket command for live replay
   - Filter by agent, task, intent, time range

**Deliverable**: Full message history with replay capability

---

### Phase 3: Dead Letter Queue (Week 3)
**Goal**: Reliable error handling

**Tasks:**
1. Implement DLQ stream
   - Move failed messages to `messages:dlq`
   - Track retry attempts
   - Log failure reasons

2. Create DLQ management API
   - List DLQ messages
   - Retry messages
   - Archive messages
   - DLQ metrics endpoint

3. Add circuit breaker integration
   - Automatic DLQ routing when circuit open
   - Health-based retry logic

**Deliverable**: Production-grade error handling

---

### Phase 4: Advanced Features (Week 4)
**Goal**: Performance and operational improvements

**Tasks:**
1. Message prioritization
   - Priority-based delivery
   - Separate high-priority channel

2. Batching and compression
   - Batch message publishing
   - Redis-level compression

3. Monitoring and metrics
   - Prometheus metrics exporter
   - Redis monitoring dashboard
   - Lag monitoring for consumer groups

**Deliverable**: Optimized, observable system

---

### Phase 5: Migration and Cutover (Week 5)
**Goal**: Production deployment

**Tasks:**
1. Backward compatibility mode
   - Dual-write (WebSocket + Redis)
   - Feature flag for gradual rollout

2. Load testing
   - Benchmark throughput
   - Latency testing
   - Failure scenario testing

3. Documentation
   - Operational runbook
   - Agent migration guide
   - Troubleshooting guide

**Deliverable**: Production-ready system with safe cutover

---

## Migration Strategy

### Backward Compatibility Approach

**Hybrid Mode (Default for 30 days):**
- WebSocket connections remain active
- Messages written to both WebSocket and Redis
- Agents can use either protocol
- Bridge monitors both channels

**Configuration:**
```javascript
// src/config/constants.js
export const MESSAGE_BROKER_CONFIG = {
  mode: 'hybrid', // 'websocket', 'redis', 'hybrid'
  redis: {
    enabled: true,
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    streamTTL: 86400 * 7, // 7 days
    maxStreamLength: 10000,
    consumerGroupPrefix: 'bridge',
  },
  websocket: {
    enabled: true,
    port: Number(process.env.AI_BRIDGE_PORT) || 56427,
  },
  dlq: {
    maxRetries: 3,
    retryDelay: 5000, // 5s
    enabled: true,
  }
};
```

### Agent Migration

**Step 1: Update Agent Libraries**
```javascript
// src/agents/base-agent.js
export class BaseAgent {
  constructor(config) {
    this.protocol = config.protocol || 'websocket'; // 'websocket' or 'redis'
    this.bridgeUrl = config.bridgeUrl;
    this.redisUrl = config.redisUrl;

    if (this.protocol === 'redis') {
      this.initRedisConnection();
    } else {
      this.initWebSocketConnection();
    }
  }

  async initRedisConnection() {
    this.redis = new RedisClient(this.redisUrl);
    await this.redis.connect();
    await this.subscribe();
  }

  async subscribe() {
    // Subscribe to personal channel
    await this.redis.subscribe(`agent:${this.agentId}`, this.handleMessage.bind(this));

    // Subscribe to broadcasts
    await this.redis.subscribe('agent:broadcast', this.handleMessage.bind(this));

    // Subscribe to intents
    for (const intent of this.intents) {
      await this.redis.subscribe(`agent:intent:${intent}`, this.handleMessage.bind(this));
    }
  }
}
```

**Step 2: Feature Flag Rollout**
1. Week 1: 10% of agents on Redis
2. Week 2: 50% of agents on Redis
3. Week 3: 100% of agents on Redis
4. Week 4: WebSocket monitoring only
5. Week 5: WebSocket deprecated

---

## Performance Comparison

### Expected Metrics (Redis vs Current)

| Metric | Current (WebSocket) | Redis Hybrid | Redis Only | Target |
|--------|---------------------|--------------|------------|--------|
| Message Latency (p50) | 120ms | 130ms | 15ms | <50ms |
| Message Latency (p99) | 500ms | 550ms | 100ms | <200ms |
| Throughput | 100 msg/s | 200 msg/s | 5000 msg/s | >500 msg/s |
| Memory (Idle) | 100MB | 150MB | 120MB | <200MB |
| Memory (Load) | 250MB | 350MB | 300MB | <500MB |
| Connection Setup | 200ms | 220ms | 50ms | <200ms |
| Delivery Guarantee | None | At-least-once | At-least-once | At-least-once |
| Message Persistence | None | 7 days | 7 days | 7 days |
| Max Clients | ~100 | ~100 | ~10,000 | >1000 |

### Latency Breakdown (Redis Hybrid)

```
Agent → Redis Publish: 1-2ms
Bridge → Redis Subscribe: <1ms
Bridge → WebSocket Send: 5-10ms
Network RTT: 100-150ms (if remote)
───────────────────────────────
Total (Local): ~15-20ms
Total (Remote): ~120-160ms
```

---

## Code Examples

### 1. Enhanced AI Bridge with Redis

```javascript
// src/ai-bridge-redis.js
import { createClient } from 'redis';
import { AIBridge } from './ai-bridge.js';

export class AIBridgeRedis extends AIBridge {
  constructor(config) {
    super(config);

    // Redis clients
    this.redisPublisher = createClient({ url: config.redisUrl });
    this.redisSubscriber = this.redisPublisher.duplicate();
    this.redisConsumer = this.redisPublisher.duplicate();

    this.streamName = 'messages:all';
    this.dlqStream = 'messages:dlq';
    this.consumerGroup = 'bridge-consumers';
    this.consumerId = `bridge-${process.pid}`;
  }

  async initialize() {
    await Promise.all([
      this.redisPublisher.connect(),
      this.redisSubscriber.connect(),
      this.redisConsumer.connect()
    ]);

    // Create consumer group if not exists
    try {
      await this.redisConsumer.xGroupCreate(
        this.streamName,
        this.consumerGroup,
        '0',
        { MKSTREAM: true }
      );
    } catch (err) {
      if (!err.message.includes('BUSYGROUP')) throw err;
    }

    // Subscribe to broadcast channel
    await this.redisSubscriber.subscribe('agent:broadcast', (message) => {
      this.handleRedisMessage(JSON.parse(message));
    });

    // Start stream consumer
    this.startStreamConsumer();

    this.logger.log('[Bridge Redis] Initialized');
  }

  async acceptEnvelope(envelope, options = {}) {
    // Call parent for WebSocket delivery (hybrid mode)
    const enriched = super.acceptEnvelope(envelope, options);

    // Publish to Redis
    await this.publishToRedis(enriched);

    // Persist to stream
    await this.persistToStream(enriched);

    return enriched;
  }

  async publishToRedis(envelope) {
    const message = JSON.stringify(envelope);

    if (envelope.to) {
      // Point-to-point
      await this.redisPublisher.publish(`agent:${envelope.to}`, message);
    } else {
      // Broadcast
      await this.redisPublisher.publish('agent:broadcast', message);
    }

    // Intent-based routing
    if (envelope.intent) {
      await this.redisPublisher.publish(`agent:intent:${envelope.intent}`, message);
    }
  }

  async persistToStream(envelope) {
    // Add to main stream
    await this.redisPublisher.xAdd(
      this.streamName,
      '*',
      { data: JSON.stringify(envelope) },
      { TRIM: { strategy: 'MAXLEN', threshold: 10000, strategyModifier: '~' } }
    );

    // Add to task stream if applicable
    if (envelope.taskId) {
      await this.redisPublisher.xAdd(
        `messages:task:${envelope.taskId}`,
        '*',
        { data: JSON.stringify(envelope) },
        { TRIM: { strategy: 'MAXLEN', threshold: 1000 } }
      );
    }
  }

  async startStreamConsumer() {
    const consumeMessages = async () => {
      try {
        const messages = await this.redisConsumer.xReadGroup(
          this.consumerGroup,
          this.consumerId,
          [{ key: this.streamName, id: '>' }],
          { COUNT: 10, BLOCK: 5000 }
        );

        if (messages) {
          for (const { messages: msgs } of messages) {
            for (const { id, message } of msgs) {
              await this.processStreamMessage(id, message);
            }
          }
        }
      } catch (err) {
        this.logger.error('[Bridge Redis] Stream consumer error:', err);
      }

      // Continue consuming
      setImmediate(consumeMessages);
    };

    consumeMessages();
  }

  async processStreamMessage(messageId, message) {
    try {
      const envelope = JSON.parse(message.data);

      // Deliver via WebSocket (hybrid mode)
      if (this.clients.has(envelope.to)) {
        this._sendEnvelope(envelope.to, envelope);
      }

      // Acknowledge
      await this.redisConsumer.xAck(this.streamName, this.consumerGroup, messageId);
    } catch (err) {
      this.logger.error('[Bridge Redis] Process message error:', err);
      // Move to DLQ
      await this.moveToDLQ(messageId, message, err);
    }
  }

  async moveToDLQ(messageId, message, error) {
    await this.redisPublisher.xAdd(
      this.dlqStream,
      '*',
      {
        originalMessage: message.data,
        originalId: messageId,
        error: error.message,
        timestamp: new Date().toISOString()
      }
    );
  }

  async getHistory(options = {}) {
    const { limit = 100, start = '-', end = '+' } = options;

    const messages = await this.redisConsumer.xRange(
      this.streamName,
      start,
      end,
      { COUNT: limit }
    );

    return messages.map(({ id, message }) => ({
      id,
      ...JSON.parse(message.data)
    }));
  }

  async replayMessage(messageId, targetClient) {
    const [message] = await this.redisConsumer.xRange(
      this.streamName,
      messageId,
      messageId
    );

    if (message) {
      const envelope = JSON.parse(message.message.data);
      envelope.context = { ...envelope.context, replay: true };
      await this.publishToRedis({ ...envelope, to: targetClient });
    }
  }
}
```

### 2. Redis Agent Base Class

```javascript
// src/agents/redis-agent-base.js
import { createClient } from 'redis';

export class RedisAgentBase {
  constructor(config) {
    this.agentId = config.agentId;
    this.intents = config.intents || [];
    this.redisUrl = config.redisUrl || 'redis://localhost:6379';

    this.subscriber = createClient({ url: this.redisUrl });
    this.publisher = createClient({ url: this.redisUrl });

    this.messageHandlers = new Map();
  }

  async connect() {
    await Promise.all([
      this.subscriber.connect(),
      this.publisher.connect()
    ]);

    // Subscribe to personal channel
    await this.subscriber.subscribe(
      `agent:${this.agentId}`,
      this.handleMessage.bind(this)
    );

    // Subscribe to broadcasts
    await this.subscriber.subscribe(
      'agent:broadcast',
      this.handleMessage.bind(this)
    );

    // Subscribe to intents
    for (const intent of this.intents) {
      await this.subscriber.subscribe(
        `agent:intent:${intent}`,
        this.handleMessage.bind(this)
      );
    }

    console.log(`[${this.agentId}] Connected to Redis bridge`);
  }

  async handleMessage(message) {
    try {
      const envelope = JSON.parse(message);

      // Check if message is for this agent
      if (envelope.to && envelope.to !== this.agentId) {
        return; // Not for us
      }

      // Call registered handler
      const handler = this.messageHandlers.get(envelope.intent);
      if (handler) {
        await handler(envelope);
      } else {
        await this.onMessage(envelope);
      }
    } catch (err) {
      console.error(`[${this.agentId}] Message handling error:`, err);
    }
  }

  async sendMessage(to, payload, options = {}) {
    const envelope = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      from: this.agentId,
      to,
      intent: options.intent || 'agent.message',
      payload,
      taskId: options.taskId,
      channel: options.channel || 'default',
      priority: options.priority || 'normal'
    };

    const message = JSON.stringify(envelope);

    if (to) {
      await this.publisher.publish(`agent:${to}`, message);
    } else {
      await this.publisher.publish('agent:broadcast', message);
    }

    return envelope;
  }

  registerHandler(intent, handler) {
    this.messageHandlers.set(intent, handler);
  }

  async onMessage(envelope) {
    // Override in subclass
    console.log(`[${this.agentId}] Received:`, envelope);
  }

  async disconnect() {
    await Promise.all([
      this.subscriber.quit(),
      this.publisher.quit()
    ]);
  }
}
```

### 3. DLQ Management API

```javascript
// HTTP endpoints for DLQ management

app.get('/api/dlq', async (req, res) => {
  const { limit = 100, start = '-', end = '+' } = req.query;

  const messages = await bridge.redisConsumer.xRange(
    bridge.dlqStream,
    start,
    end,
    { COUNT: limit }
  );

  res.json({
    count: messages.length,
    messages: messages.map(({ id, message }) => ({
      id,
      originalMessage: JSON.parse(message.originalMessage),
      error: message.error,
      timestamp: message.timestamp
    }))
  });
});

app.post('/api/dlq/:messageId/retry', async (req, res) => {
  const { messageId } = req.params;

  const [message] = await bridge.redisConsumer.xRange(
    bridge.dlqStream,
    messageId,
    messageId
  );

  if (!message) {
    return res.status(404).json({ error: 'Message not found in DLQ' });
  }

  // Republish to main stream
  const envelope = JSON.parse(message.message.originalMessage);
  await bridge.publishToRedis(envelope);

  // Remove from DLQ
  await bridge.redisConsumer.xDel(bridge.dlqStream, messageId);

  res.json({ success: true, messageId });
});

app.delete('/api/dlq/:messageId', async (req, res) => {
  const { messageId } = req.params;

  await bridge.redisConsumer.xDel(bridge.dlqStream, messageId);

  res.json({ success: true, messageId });
});
```

---

## Monitoring and Observability

### Prometheus Metrics

```javascript
// src/metrics/redis-metrics.js
export const redisMetrics = {
  messagesPublished: new Counter({
    name: 'redis_messages_published_total',
    help: 'Total messages published to Redis',
    labelNames: ['channel', 'intent']
  }),

  messagesConsumed: new Counter({
    name: 'redis_messages_consumed_total',
    help: 'Total messages consumed from Redis streams',
    labelNames: ['stream', 'consumer_group']
  }),

  streamLag: new Gauge({
    name: 'redis_stream_lag',
    help: 'Consumer group lag (pending messages)',
    labelNames: ['stream', 'consumer_group']
  }),

  dlqDepth: new Gauge({
    name: 'redis_dlq_depth',
    help: 'Number of messages in DLQ',
  }),

  publishLatency: new Histogram({
    name: 'redis_publish_duration_seconds',
    help: 'Redis publish latency',
    buckets: [0.001, 0.005, 0.010, 0.050, 0.100, 0.500, 1.0]
  })
};
```

### Health Checks

```javascript
app.get('/health/redis', async (req, res) => {
  try {
    // Check Redis connectivity
    const ping = await bridge.redisPublisher.ping();

    // Check stream lag
    const pending = await bridge.redisConsumer.xPending(
      bridge.streamName,
      bridge.consumerGroup
    );

    // Check DLQ depth
    const dlqInfo = await bridge.redisConsumer.xLen(bridge.dlqStream);

    const health = {
      status: 'healthy',
      redis: {
        connected: ping === 'PONG',
        streamLag: pending.pending,
        dlqDepth: dlqInfo
      },
      alerts: []
    };

    // Warn if lag is high
    if (pending.pending > 1000) {
      health.status = 'degraded';
      health.alerts.push('High stream lag detected');
    }

    // Warn if DLQ is growing
    if (dlqInfo > 100) {
      health.status = 'degraded';
      health.alerts.push('DLQ depth high');
    }

    res.json(health);
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      error: err.message
    });
  }
});
```

---

## Deployment Considerations

### Redis Configuration

```conf
# redis.conf (Production)

# Persistence
save 900 1
save 300 10
save 60 10000
appendonly yes
appendfsync everysec

# Memory
maxmemory 2gb
maxmemory-policy allkeys-lru

# Networking
bind 0.0.0.0
protected-mode yes
port 6379
tcp-backlog 511
timeout 300
tcp-keepalive 300

# Performance
hz 10
dynamic-hz yes
lazyfree-lazy-eviction yes
lazyfree-lazy-expire yes
lazyfree-lazy-server-del yes

# Streams
stream-node-max-bytes 4096
stream-node-max-entries 100
```

### Docker Compose

```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
      - ./redis.conf:/usr/local/etc/redis/redis.conf
    command: redis-server /usr/local/etc/redis/redis.conf
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

  ai-bridge:
    build: .
    ports:
      - "56427:56427"
      - "65038:65038"
    environment:
      - REDIS_URL=redis://redis:6379
      - MESSAGE_BROKER_MODE=redis
    depends_on:
      redis:
        condition: service_healthy
    restart: unless-stopped

volumes:
  redis-data:
```

### Environment Variables

```bash
# .env
REDIS_URL=redis://localhost:6379
MESSAGE_BROKER_MODE=hybrid  # websocket, redis, hybrid
REDIS_STREAM_TTL=604800  # 7 days
REDIS_MAX_STREAM_LENGTH=10000
REDIS_CONSUMER_GROUP=bridge-consumers
DLQ_MAX_RETRIES=3
DLQ_RETRY_DELAY=5000
```

---

## Testing Strategy

### Unit Tests

```javascript
// tests/redis-bridge.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { AIBridgeRedis } from '../src/ai-bridge-redis.js';
import { createClient } from 'redis';

describe('Redis Bridge', () => {
  let bridge;
  let redisClient;

  before(async () => {
    bridge = new AIBridgeRedis({
      redisUrl: 'redis://localhost:6379',
      logger: console
    });
    await bridge.initialize();

    redisClient = createClient({ url: 'redis://localhost:6379' });
    await redisClient.connect();
  });

  after(async () => {
    await bridge.close();
    await redisClient.quit();
  });

  it('should publish message to Redis channel', async () => {
    const envelope = {
      from: 'agent-a',
      to: 'agent-b',
      payload: { test: 'data' }
    };

    const messagePromise = new Promise((resolve) => {
      redisClient.subscribe('agent:agent-b', (message) => {
        resolve(JSON.parse(message));
      });
    });

    await bridge.acceptEnvelope(envelope);

    const received = await messagePromise;
    assert.strictEqual(received.from, 'agent-a');
    assert.strictEqual(received.to, 'agent-b');
  });

  it('should persist message to stream', async () => {
    const envelope = {
      from: 'agent-a',
      to: 'agent-b',
      payload: { test: 'data' }
    };

    await bridge.acceptEnvelope(envelope);

    const messages = await redisClient.xRange('messages:all', '-', '+', { COUNT: 1 });
    assert.ok(messages.length > 0);

    const stored = JSON.parse(messages[0].message.data);
    assert.strictEqual(stored.from, 'agent-a');
  });

  it('should move failed message to DLQ', async () => {
    const messageId = 'test-123';
    const message = { data: JSON.stringify({ test: 'fail' }) };
    const error = new Error('Test error');

    await bridge.moveToDLQ(messageId, message, error);

    const dlqMessages = await redisClient.xRange('messages:dlq', '-', '+');
    assert.ok(dlqMessages.length > 0);

    const dlqEntry = dlqMessages[dlqMessages.length - 1];
    assert.strictEqual(dlqEntry.message.error, 'Test error');
  });
});
```

### Load Tests

```javascript
// tests/load/redis-throughput.test.js
import { performance } from 'node:perf_hooks';

async function loadTest() {
  const bridge = new AIBridgeRedis({ redisUrl: 'redis://localhost:6379' });
  await bridge.initialize();

  const messageCount = 10000;
  const concurrency = 100;

  const start = performance.now();

  const batches = [];
  for (let i = 0; i < messageCount; i += concurrency) {
    const batch = [];
    for (let j = 0; j < concurrency && i + j < messageCount; j++) {
      batch.push(bridge.acceptEnvelope({
        from: 'load-test',
        to: 'agent-test',
        payload: { index: i + j }
      }));
    }
    await Promise.all(batch);
  }

  const duration = (performance.now() - start) / 1000;
  const throughput = messageCount / duration;

  console.log(`Processed ${messageCount} messages in ${duration.toFixed(2)}s`);
  console.log(`Throughput: ${throughput.toFixed(0)} msg/s`);

  await bridge.close();
}

loadTest();
```

---

## Rollback Plan

### If Redis Integration Fails

**Scenario**: Redis performance worse than expected, critical bugs, operational issues

**Rollback Steps:**

1. **Immediate (5 minutes)**
   ```bash
   # Set environment variable
   export MESSAGE_BROKER_MODE=websocket

   # Restart bridge
   npm run bridge:start
   ```

2. **Configuration Revert**
   ```javascript
   // src/config/constants.js
   export const MESSAGE_BROKER_CONFIG = {
     mode: 'websocket', // Switch back
     redis: {
       enabled: false,  // Disable Redis
     },
     websocket: {
       enabled: true,
     }
   };
   ```

3. **Agent Rollback**
   - Agents automatically fallback to WebSocket if Redis unavailable
   - No code changes required (backward compatible)

4. **Data Preservation**
   - Keep Redis running in read-only mode
   - Export messages for audit
   - Maintain DLQ for analysis

5. **Post-Mortem**
   - Analyze failure reasons
   - Review metrics and logs
   - Plan remediation
   - Re-test before retry

---

## Success Criteria

### Phase 1 Success (Foundation)
- [ ] Redis pub/sub functional
- [ ] Messages delivered via both WebSocket and Redis
- [ ] No performance degradation vs baseline
- [ ] All tests passing

### Phase 2 Success (Persistence)
- [ ] All messages persisted to streams
- [ ] Replay API functional
- [ ] Consumer groups working
- [ ] Stream trimming operational

### Phase 3 Success (DLQ)
- [ ] DLQ capturing failed messages
- [ ] Retry mechanism working
- [ ] DLQ API functional
- [ ] Circuit breaker integrated

### Phase 4 Success (Production Ready)
- [ ] Throughput >500 msg/s
- [ ] p99 latency <200ms
- [ ] Memory usage <500MB under load
- [ ] Prometheus metrics exported
- [ ] Health checks passing

### Phase 5 Success (Migration Complete)
- [ ] All agents migrated to Redis
- [ ] WebSocket deprecated
- [ ] Zero message loss during migration
- [ ] Operations team trained
- [ ] Documentation complete

---

## Conclusion

**Recommendation**: Implement Redis-based message broker with hybrid migration strategy.

**Key Benefits:**
1. **Low Latency**: 10-20ms for local Redis, suitable for real-time A2A
2. **Persistence**: 7-day message retention with replay capability
3. **Reliability**: At-least-once delivery with DLQ
4. **Scalability**: 5000+ msg/s throughput, 10k+ concurrent agents
5. **Simplicity**: Single Redis instance, minimal operational overhead
6. **Backward Compatible**: Gradual migration with zero downtime

**Timeline**: 5 weeks from start to production deployment

**Risk**: Low - Hybrid mode ensures safe rollback at any time

**Next Steps:**
1. Approve architecture
2. Provision Redis infrastructure
3. Begin Phase 1 implementation
4. Set up monitoring and alerting
5. Schedule migration milestones

---

*Document Version: 1.0*
*Last Updated: 2025-10-20*
*Author: DevOps Architecture Team*
