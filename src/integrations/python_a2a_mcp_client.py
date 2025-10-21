#!/usr/bin/env python3
"""
Python A2A MCP Client with Async/Concurrent/Parallel Execution Support

Integrates with the LLM Framework's AI Bridge WebSocket server providing:
- asyncio for async I/O and event loops
- concurrent.futures for parallel execution
- multiprocessing for CPU-bound tasks
- uvloop for ultra-fast event loop (optional)
- trio for alternative async runtime (optional)
- twisted for event-driven networking (optional)
- eventlet for WSGI support (optional)
- gevent for greenlet-based concurrency (optional)

Architecture:
- BaseA2AMCPClient: Core async client using asyncio
- ExecutorMixin: Adds concurrent.futures support
- MultiprocessingMixin: Adds multiprocessing pool
- RuntimeSelector: Allows switching between asyncio/uvloop/trio/twisted
"""

import asyncio
import json
import logging
import sys
from abc import ABC, abstractmethod
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from multiprocessing import Manager, Pool
from typing import Any, Callable, Dict, List, Optional, Set, Union
from uuid import uuid4

import websockets
from websockets.client import WebSocketClientProtocol

# Optional high-performance/alternative runtime dependencies
try:
    import uvloop
    UVLOOP_AVAILABLE = True
except ImportError:
    UVLOOP_AVAILABLE = False

try:
    import trio
    TRIO_AVAILABLE = True
except ImportError:
    TRIO_AVAILABLE = False

try:
    from twisted.internet import asyncioreactor
    TWISTED_AVAILABLE = True
except ImportError:
    TWISTED_AVAILABLE = False

try:
    import eventlet
    EVENTLET_AVAILABLE = True
except ImportError:
    EVENTLET_AVAILABLE = False

try:
    import gevent
    from gevent import monkey
    GEVENT_AVAILABLE = True
except ImportError:
    GEVENT_AVAILABLE = False


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class RuntimeMode(Enum):
    """Supported async runtime modes"""
    ASYNCIO = "asyncio"
    UVLOOP = "uvloop"
    TRIO = "trio"
    TWISTED = "twisted"
    EVENTLET = "eventlet"
    GEVENT = "gevent"


@dataclass
class A2AEnvelope:
    """A2A message envelope matching JavaScript implementation"""
    id: str = field(default_factory=lambda: str(uuid4()))
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    intent: str = "agent.message"
    task_id: Optional[str] = None
    channel: str = "default"
    priority: str = "normal"
    from_agent: str = "python-client"
    role: str = "agent"
    to_agent: Optional[str] = None
    reply_to: Optional[str] = None
    context: Dict[str, Any] = field(default_factory=dict)
    payload: Dict[str, Any] = field(default_factory=dict)
    tools: List[str] = field(default_factory=list)
    attachments: List[Dict[str, Any]] = field(default_factory=list)
    trace: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            "id": self.id,
            "timestamp": self.timestamp,
            "intent": self.intent,
            "taskId": self.task_id,
            "channel": self.channel,
            "priority": self.priority,
            "from": self.from_agent,
            "role": self.role,
            "to": self.to_agent,
            "replyTo": self.reply_to,
            "context": self.context,
            "payload": self.payload,
            "tools": self.tools,
            "attachments": self.attachments,
            "trace": self.trace
        }


@dataclass
class ClientStats:
    """Client performance statistics"""
    messages_sent: int = 0
    messages_received: int = 0
    errors: int = 0
    connected_at: Optional[str] = None
    last_seen: Optional[str] = None
    avg_latency_ms: float = 0.0


class BaseA2AMCPClient(ABC):
    """
    Base async A2A MCP client using asyncio.
    Connects to AI Bridge WebSocket server and handles message routing.
    """

    def __init__(
        self,
        bridge_url: str = "ws://localhost:65028",
        client_id: Optional[str] = None,
        role: str = "agent",
        labels: Optional[List[str]] = None,
        tools: Optional[List[str]] = None,
        intents: Optional[List[str]] = None,
        auth_token: Optional[str] = None,
        max_concurrent_tasks: int = 10,
        runtime_mode: RuntimeMode = RuntimeMode.ASYNCIO
    ):
        self.bridge_url = bridge_url
        self.client_id = client_id or f"py-{uuid4()}"
        self.role = role
        self.labels = labels or []
        self.tools = tools or []
        self.intents = intents or ["*"]
        self.auth_token = auth_token
        self.max_concurrent_tasks = max_concurrent_tasks
        self.runtime_mode = runtime_mode

        self.ws: Optional[WebSocketClientProtocol] = None
        self.stats = ClientStats()
        self.message_handlers: Dict[str, Callable] = {}
        self.intent_handlers: Dict[str, Callable] = {}
        self._running = False
        self._tasks: Set[asyncio.Task] = set()

        logger.info(f"Initialized {self.__class__.__name__} (runtime: {runtime_mode.value})")

    async def connect(self) -> None:
        """Establish WebSocket connection and register with bridge"""
        try:
            logger.info(f"Connecting to AI Bridge at {self.bridge_url}")
            self.ws = await websockets.connect(
                self.bridge_url,
                max_size=2 * 1024 * 1024,  # 2MB max payload
                ping_interval=30,
                ping_timeout=10
            )

            # Register with bridge
            registration = {
                "type": "register",
                "clientId": self.client_id,
                "role": self.role,
                "labels": self.labels,
                "tools": self.tools,
                "intents": self.intents,
                "authToken": self.auth_token,
                "maxConcurrentTasks": self.max_concurrent_tasks
            }

            await self.ws.send(json.dumps(registration))
            logger.info(f"Sent registration for client {self.client_id}")

            # Wait for registration confirmation
            response = await self.ws.recv()
            data = json.loads(response)

            if data.get("type") == "registered":
                self.stats.connected_at = datetime.utcnow().isoformat()
                logger.info(f"✓ Registered as {self.client_id} ({self.role})")
                await self.on_registered(data)
            elif data.get("type") == "error":
                raise ConnectionError(f"Registration failed: {data.get('error')}")

        except Exception as e:
            logger.error(f"Connection failed: {e}")
            raise

    async def disconnect(self) -> None:
        """Close WebSocket connection gracefully"""
        self._running = False

        # Cancel all pending tasks
        for task in self._tasks:
            task.cancel()

        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)

        if self.ws:
            await self.ws.close()
            logger.info(f"Disconnected client {self.client_id}")

    async def send_envelope(self, envelope: A2AEnvelope) -> None:
        """Send an envelope to the bridge"""
        if not self.ws:
            raise ConnectionError("Not connected to bridge")

        message = {
            "type": "envelope",
            "envelope": envelope.to_dict()
        }

        send_start = asyncio.get_event_loop().time()
        await self.ws.send(json.dumps(message))
        latency_ms = (asyncio.get_event_loop().time() - send_start) * 1000

        self.stats.messages_sent += 1
        self.stats.avg_latency_ms = (
            (self.stats.avg_latency_ms * (self.stats.messages_sent - 1) + latency_ms)
            / self.stats.messages_sent
        )

        logger.debug(f"Sent envelope {envelope.id} (latency: {latency_ms:.2f}ms)")

    async def send_batch(self, envelopes: List[A2AEnvelope]) -> None:
        """Send multiple envelopes in one batch"""
        if not self.ws:
            raise ConnectionError("Not connected to bridge")

        if len(envelopes) > 100:
            raise ValueError("Maximum 100 envelopes per batch")

        message = {
            "type": "envelope_batch",
            "envelopes": [env.to_dict() for env in envelopes]
        }

        await self.ws.send(json.dumps(message))
        self.stats.messages_sent += len(envelopes)

        logger.info(f"Sent batch of {len(envelopes)} envelopes")

    async def listen(self) -> None:
        """Listen for incoming messages from bridge"""
        if not self.ws:
            raise ConnectionError("Not connected to bridge")

        self._running = True
        logger.info("Listening for messages...")

        try:
            async for message in self.ws:
                if not self._running:
                    break

                try:
                    data = json.loads(message)
                    await self._handle_message(data)
                except json.JSONDecodeError as e:
                    logger.error(f"Invalid JSON received: {e}")
                    self.stats.errors += 1
                except Exception as e:
                    logger.error(f"Error handling message: {e}")
                    self.stats.errors += 1

        except websockets.exceptions.ConnectionClosed:
            logger.info("Connection closed by server")
        except Exception as e:
            logger.error(f"Error in listen loop: {e}")
            raise

    async def _handle_message(self, data: Dict[str, Any]) -> None:
        """Handle incoming message from bridge"""
        self.stats.messages_received += 1
        self.stats.last_seen = datetime.utcnow().isoformat()

        message_type = data.get("type")

        # Handle envelope messages
        if isinstance(data, list) and len(data) == 2 and data[0] == "env":
            envelope_data = data[1]
            envelope = A2AEnvelope(
                id=envelope_data.get("id"),
                timestamp=envelope_data.get("timestamp"),
                intent=envelope_data.get("intent", "agent.message"),
                task_id=envelope_data.get("taskId"),
                channel=envelope_data.get("channel", "default"),
                priority=envelope_data.get("priority", "normal"),
                from_agent=envelope_data.get("from"),
                role=envelope_data.get("role", "agent"),
                to_agent=envelope_data.get("to"),
                reply_to=envelope_data.get("replyTo"),
                context=envelope_data.get("context", {}),
                payload=envelope_data.get("payload", {}),
                tools=envelope_data.get("tools", []),
                attachments=envelope_data.get("attachments", []),
                trace=envelope_data.get("trace", {})
            )

            # Route to intent handler
            handler = self.intent_handlers.get(envelope.intent) or self.intent_handlers.get("*")
            if handler:
                # Create task for handler (non-blocking)
                task = asyncio.create_task(handler(envelope))
                self._tasks.add(task)
                task.add_done_callback(self._tasks.discard)
            else:
                logger.warning(f"No handler for intent: {envelope.intent}")

        # Handle typed messages
        elif message_type:
            handler = self.message_handlers.get(message_type)
            if handler:
                await handler(data)
            else:
                logger.debug(f"Unhandled message type: {message_type}")

    def on_intent(self, intent: str, handler: Callable) -> None:
        """Register a handler for a specific intent"""
        self.intent_handlers[intent] = handler
        logger.info(f"Registered handler for intent: {intent}")

    def on_message(self, message_type: str, handler: Callable) -> None:
        """Register a handler for a specific message type"""
        self.message_handlers[message_type] = handler
        logger.info(f"Registered handler for message type: {message_type}")

    async def heartbeat(self, interval: int = 30) -> None:
        """Send periodic heartbeats to bridge"""
        while self._running:
            try:
                if self.ws and not self.ws.closed:
                    await self.ws.send(json.dumps({"type": "heartbeat"}))
                    logger.debug("Sent heartbeat")
            except Exception as e:
                logger.error(f"Heartbeat failed: {e}")

            await asyncio.sleep(interval)

    async def run(self) -> None:
        """Main run loop - connect, listen, and handle graceful shutdown"""
        try:
            await self.connect()

            # Start heartbeat task
            heartbeat_task = asyncio.create_task(self.heartbeat())

            # Listen for messages
            await self.listen()

            # Cleanup
            heartbeat_task.cancel()
            await heartbeat_task

        except KeyboardInterrupt:
            logger.info("Received interrupt signal")
        except Exception as e:
            logger.error(f"Error in run loop: {e}")
            raise
        finally:
            await self.disconnect()

    @abstractmethod
    async def on_registered(self, data: Dict[str, Any]) -> None:
        """Called when registration is successful"""
        pass


class ExecutorMixin:
    """
    Mixin adding concurrent.futures support for parallel execution.
    Useful for I/O-bound tasks that don't require async/await.
    """

    def __init__(self, *args, max_workers: int = 10, **kwargs):
        super().__init__(*args, **kwargs)
        self.thread_executor = ThreadPoolExecutor(max_workers=max_workers)
        self.process_executor = ProcessPoolExecutor(max_workers=max_workers)
        logger.info(f"Initialized ExecutorMixin (workers: {max_workers})")

    async def run_in_thread(self, func: Callable, *args, **kwargs) -> Any:
        """Run a blocking function in a thread pool"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.thread_executor, func, *args, **kwargs)

    async def run_in_process(self, func: Callable, *args, **kwargs) -> Any:
        """Run a CPU-bound function in a process pool"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.process_executor, func, *args, **kwargs)

    async def map_parallel_threads(self, func: Callable, items: List[Any]) -> List[Any]:
        """Map function over items in parallel using threads"""
        loop = asyncio.get_event_loop()
        tasks = [loop.run_in_executor(self.thread_executor, func, item) for item in items]
        return await asyncio.gather(*tasks)

    async def map_parallel_processes(self, func: Callable, items: List[Any]) -> List[Any]:
        """Map function over items in parallel using processes"""
        loop = asyncio.get_event_loop()
        tasks = [loop.run_in_executor(self.process_executor, func, item) for item in items]
        return await asyncio.gather(*tasks)

    async def shutdown_executors(self) -> None:
        """Shutdown all executors gracefully"""
        self.thread_executor.shutdown(wait=True)
        self.process_executor.shutdown(wait=True)
        logger.info("Executors shut down")


class MultiprocessingMixin:
    """
    Mixin adding multiprocessing Pool support for heavy CPU-bound tasks.
    Uses shared memory for efficient inter-process communication.
    """

    def __init__(self, *args, pool_size: int = 4, **kwargs):
        super().__init__(*args, **kwargs)
        self.pool_size = pool_size
        self.mp_pool: Optional[Pool] = None
        self.mp_manager: Optional[Manager] = None
        logger.info(f"Initialized MultiprocessingMixin (pool size: {pool_size})")

    def init_multiprocessing(self) -> None:
        """Initialize multiprocessing pool and manager"""
        self.mp_manager = Manager()
        self.mp_pool = Pool(processes=self.pool_size)
        logger.info("Multiprocessing pool initialized")

    async def map_multiprocess(self, func: Callable, items: List[Any]) -> List[Any]:
        """Map function over items using multiprocessing pool"""
        if not self.mp_pool:
            self.init_multiprocessing()

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, self.mp_pool.map, func, items)
        return result

    def get_shared_dict(self) -> Dict:
        """Get a shared dictionary for inter-process communication"""
        if not self.mp_manager:
            self.init_multiprocessing()
        return self.mp_manager.dict()

    def get_shared_list(self) -> List:
        """Get a shared list for inter-process communication"""
        if not self.mp_manager:
            self.init_multiprocessing()
        return self.mp_manager.list()

    def shutdown_multiprocessing(self) -> None:
        """Shutdown multiprocessing pool"""
        if self.mp_pool:
            self.mp_pool.close()
            self.mp_pool.join()
        if self.mp_manager:
            self.mp_manager.shutdown()
        logger.info("Multiprocessing pool shut down")


class A2AMCPClient(ExecutorMixin, MultiprocessingMixin, BaseA2AMCPClient):
    """
    Full-featured A2A MCP client with all async/concurrent/parallel capabilities.

    Features:
    - asyncio for async I/O
    - concurrent.futures for parallel threads/processes
    - multiprocessing for heavy CPU workloads
    - Optional uvloop for 2-4x performance boost
    """

    async def on_registered(self, data: Dict[str, Any]) -> None:
        """Handle successful registration"""
        client_info = data.get("client", {})
        history = data.get("history", [])

        logger.info(f"Registration successful!")
        logger.info(f"  Client ID: {client_info.get('id')}")
        logger.info(f"  Role: {client_info.get('role')}")
        logger.info(f"  Tools: {client_info.get('tools')}")
        logger.info(f"  Intents: {client_info.get('intents')}")
        logger.info(f"  History size: {len(history)} messages")

    async def shutdown(self) -> None:
        """Graceful shutdown of all executors and connections"""
        await self.disconnect()
        await self.shutdown_executors()
        self.shutdown_multiprocessing()
        logger.info("Client shutdown complete")


def setup_runtime(mode: RuntimeMode) -> None:
    """Setup the async runtime based on selected mode"""
    if mode == RuntimeMode.UVLOOP:
        if not UVLOOP_AVAILABLE:
            raise ImportError("uvloop not installed. Install with: pip install uvloop")
        uvloop.install()
        logger.info("✓ Using uvloop for ultra-fast event loop")

    elif mode == RuntimeMode.TRIO:
        if not TRIO_AVAILABLE:
            raise ImportError("trio not installed. Install with: pip install trio")
        logger.warning("Trio support is experimental - use asyncio compatibility layer")

    elif mode == RuntimeMode.TWISTED:
        if not TWISTED_AVAILABLE:
            raise ImportError("twisted not installed. Install with: pip install twisted")
        asyncioreactor.install()
        logger.info("✓ Using Twisted reactor")

    elif mode == RuntimeMode.GEVENT:
        if not GEVENT_AVAILABLE:
            raise ImportError("gevent not installed. Install with: pip install gevent")
        monkey.patch_all()
        logger.info("✓ Using gevent with monkey patching")

    elif mode == RuntimeMode.EVENTLET:
        if not EVENTLET_AVAILABLE:
            raise ImportError("eventlet not installed. Install with: pip install eventlet")
        eventlet.monkey_patch()
        logger.info("✓ Using eventlet with monkey patching")


async def example_usage():
    """Example usage demonstrating all capabilities"""

    # Create client with all features
    client = A2AMCPClient(
        bridge_url="ws://localhost:65028",
        client_id="python-demo-client",
        role="agent",
        labels=["python", "async", "parallel"],
        tools=["data-processing", "ml-inference"],
        intents=["agent.message", "task.execute"],
        max_concurrent_tasks=20,
        runtime_mode=RuntimeMode.UVLOOP if UVLOOP_AVAILABLE else RuntimeMode.ASYNCIO
    )

    # Register intent handlers
    async def handle_message(envelope: A2AEnvelope):
        logger.info(f"Received: {envelope.intent} from {envelope.from_agent}")
        logger.info(f"Payload: {envelope.payload}")

        # Example: Send reply
        reply = A2AEnvelope(
            intent="agent.response",
            from_agent=client.client_id,
            to_agent=envelope.from_agent,
            reply_to=envelope.id,
            payload={"status": "processed", "result": "success"}
        )
        await client.send_envelope(reply)

    async def handle_task(envelope: A2AEnvelope):
        logger.info(f"Executing task: {envelope.task_id}")

        # Example: Run CPU-bound task in process pool
        def heavy_computation(data):
            import time
            time.sleep(1)  # Simulate heavy work
            return sum(data)

        result = await client.run_in_process(heavy_computation, list(range(1000)))
        logger.info(f"Task result: {result}")

    client.on_intent("agent.message", handle_message)
    client.on_intent("task.execute", handle_task)

    # Run client
    await client.run()


if __name__ == "__main__":
    # Setup runtime
    runtime = RuntimeMode.UVLOOP if UVLOOP_AVAILABLE else RuntimeMode.ASYNCIO
    setup_runtime(runtime)

    # Run example
    try:
        asyncio.run(example_usage())
    except KeyboardInterrupt:
        logger.info("Shutdown requested")
