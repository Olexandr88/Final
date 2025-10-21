#!/usr/bin/env python3
"""
Comprehensive test suite for Python A2A MCP Client

Tests all async/concurrent/parallel execution patterns:
- asyncio event loop
- concurrent.futures executors
- multiprocessing pool
- uvloop integration
- Message routing and handling
"""

import asyncio
import json
import sys
import time
import unittest
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
from multiprocessing import Pool
from unittest.mock import AsyncMock, MagicMock, Mock, patch
from pathlib import Path

# Add src directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'src' / 'integrations'))

# Import after path modification
try:
    from python_a2a_mcp_client import (
        A2AEnvelope,
        A2AMCPClient,
        BaseA2AMCPClient,
        ClientStats,
        ExecutorMixin,
        MultiprocessingMixin,
        RuntimeMode,
        setup_runtime
    )
except ImportError as e:
    print(f"Import error: {e}")
    print(f"Python path: {sys.path}")
    raise


class TestA2AEnvelope(unittest.TestCase):
    """Test A2A envelope data structure"""

    def test_default_envelope(self):
        """Test envelope with default values"""
        envelope = A2AEnvelope()

        self.assertIsNotNone(envelope.id)
        self.assertIsNotNone(envelope.timestamp)
        self.assertEqual(envelope.intent, "agent.message")
        self.assertEqual(envelope.channel, "default")
        self.assertEqual(envelope.priority, "normal")
        self.assertEqual(envelope.from_agent, "python-client")
        self.assertEqual(envelope.role, "agent")
        self.assertIsNone(envelope.to_agent)
        self.assertEqual(envelope.context, {})
        self.assertEqual(envelope.payload, {})

    def test_custom_envelope(self):
        """Test envelope with custom values"""
        envelope = A2AEnvelope(
            intent="task.execute",
            from_agent="agent-1",
            to_agent="agent-2",
            task_id="task-123",
            payload={"data": "test"},
            tools=["tool-1", "tool-2"]
        )

        self.assertEqual(envelope.intent, "task.execute")
        self.assertEqual(envelope.from_agent, "agent-1")
        self.assertEqual(envelope.to_agent, "agent-2")
        self.assertEqual(envelope.task_id, "task-123")
        self.assertEqual(envelope.payload, {"data": "test"})
        self.assertEqual(envelope.tools, ["tool-1", "tool-2"])

    def test_envelope_to_dict(self):
        """Test envelope serialization to dict"""
        envelope = A2AEnvelope(
            intent="test.message",
            from_agent="sender",
            to_agent="receiver",
            payload={"key": "value"}
        )

        result = envelope.to_dict()

        self.assertIsInstance(result, dict)
        self.assertEqual(result["intent"], "test.message")
        self.assertEqual(result["from"], "sender")
        self.assertEqual(result["to"], "receiver")
        self.assertEqual(result["payload"], {"key": "value"})
        self.assertIn("id", result)
        self.assertIn("timestamp", result)


class TestClientStats(unittest.TestCase):
    """Test client statistics tracking"""

    def test_default_stats(self):
        """Test default statistics"""
        stats = ClientStats()

        self.assertEqual(stats.messages_sent, 0)
        self.assertEqual(stats.messages_received, 0)
        self.assertEqual(stats.errors, 0)
        self.assertIsNone(stats.connected_at)
        self.assertIsNone(stats.last_seen)
        self.assertEqual(stats.avg_latency_ms, 0.0)

    def test_stats_update(self):
        """Test statistics updates"""
        stats = ClientStats()

        stats.messages_sent = 10
        stats.messages_received = 15
        stats.errors = 2
        stats.avg_latency_ms = 45.5

        self.assertEqual(stats.messages_sent, 10)
        self.assertEqual(stats.messages_received, 15)
        self.assertEqual(stats.errors, 2)
        self.assertEqual(stats.avg_latency_ms, 45.5)


class TestExecutorMixin(unittest.IsolatedAsyncioTestCase):
    """Test ExecutorMixin concurrent execution"""

    class TestClient(ExecutorMixin):
        def __init__(self):
            super().__init__(max_workers=4)

    async def test_thread_executor_initialization(self):
        """Test thread executor is initialized"""
        client = self.TestClient()

        self.assertIsInstance(client.thread_executor, ThreadPoolExecutor)
        self.assertIsInstance(client.process_executor, ProcessPoolExecutor)

        await client.shutdown_executors()

    async def test_run_in_thread(self):
        """Test running blocking function in thread"""
        client = self.TestClient()

        def blocking_func(x):
            time.sleep(0.1)
            return x * 2

        result = await client.run_in_thread(blocking_func, 5)
        self.assertEqual(result, 10)

        await client.shutdown_executors()

    async def test_run_in_process(self):
        """Test running CPU-bound function in process"""
        client = self.TestClient()

        def cpu_bound_func(x):
            return sum(range(x))

        result = await client.run_in_process(cpu_bound_func, 100)
        self.assertEqual(result, 4950)

        await client.shutdown_executors()

    async def test_map_parallel_threads(self):
        """Test parallel mapping with threads"""
        client = self.TestClient()

        def square(x):
            return x ** 2

        items = [1, 2, 3, 4, 5]
        results = await client.map_parallel_threads(square, items)

        self.assertEqual(results, [1, 4, 9, 16, 25])

        await client.shutdown_executors()

    async def test_map_parallel_processes(self):
        """Test parallel mapping with processes"""
        client = self.TestClient()

        def cube(x):
            return x ** 3

        items = [1, 2, 3, 4]
        results = await client.map_parallel_processes(cube, items)

        self.assertEqual(results, [1, 8, 27, 64])

        await client.shutdown_executors()


class TestMultiprocessingMixin(unittest.IsolatedAsyncioTestCase):
    """Test MultiprocessingMixin for CPU-bound tasks"""

    class TestClient(MultiprocessingMixin):
        def __init__(self):
            super().__init__(pool_size=2)

    async def test_multiprocessing_initialization(self):
        """Test multiprocessing pool initialization"""
        client = self.TestClient()
        client.init_multiprocessing()

        self.assertIsNotNone(client.mp_pool)
        self.assertIsNotNone(client.mp_manager)

        client.shutdown_multiprocessing()

    async def test_map_multiprocess(self):
        """Test multiprocessing map"""
        client = self.TestClient()

        def double(x):
            return x * 2

        items = [1, 2, 3, 4, 5]
        results = await client.map_multiprocess(double, items)

        self.assertEqual(results, [2, 4, 6, 8, 10])

        client.shutdown_multiprocessing()

    async def test_shared_dict(self):
        """Test shared dictionary for IPC"""
        client = self.TestClient()
        shared = client.get_shared_dict()

        shared['key'] = 'value'
        self.assertEqual(shared['key'], 'value')

        client.shutdown_multiprocessing()

    async def test_shared_list(self):
        """Test shared list for IPC"""
        client = self.TestClient()
        shared = client.get_shared_list()

        shared.append(1)
        shared.append(2)
        self.assertEqual(list(shared), [1, 2])

        client.shutdown_multiprocessing()


class TestBaseA2AMCPClient(unittest.IsolatedAsyncioTestCase):
    """Test base A2A MCP client"""

    class MockClient(BaseA2AMCPClient):
        async def on_registered(self, data):
            self.registration_data = data

    @patch('websockets.connect')
    async def test_client_initialization(self, mock_connect):
        """Test client initialization"""
        client = self.MockClient(
            bridge_url="ws://localhost:65028",
            client_id="test-client",
            role="agent",
            labels=["test"],
            tools=["tool1"],
            max_concurrent_tasks=5
        )

        self.assertEqual(client.bridge_url, "ws://localhost:65028")
        self.assertEqual(client.client_id, "test-client")
        self.assertEqual(client.role, "agent")
        self.assertEqual(client.labels, ["test"])
        self.assertEqual(client.tools, ["tool1"])
        self.assertEqual(client.max_concurrent_tasks, 5)

    @patch('websockets.connect')
    async def test_connect_and_register(self, mock_connect):
        """Test connection and registration"""
        mock_ws = AsyncMock()
        mock_ws.recv = AsyncMock(return_value=json.dumps({
            "type": "registered",
            "clientId": "test-client",
            "client": {"id": "test-client", "role": "agent"}
        }))
        mock_connect.return_value = mock_ws

        client = self.MockClient(client_id="test-client")
        await client.connect()

        # Verify registration was sent
        mock_ws.send.assert_called_once()
        call_args = json.loads(mock_ws.send.call_args[0][0])
        self.assertEqual(call_args["type"], "register")
        self.assertEqual(call_args["clientId"], "test-client")

        # Verify connected
        self.assertIsNotNone(client.stats.connected_at)

    @patch('websockets.connect')
    async def test_send_envelope(self, mock_connect):
        """Test sending envelope"""
        mock_ws = AsyncMock()
        mock_ws.closed = False
        mock_ws.recv = AsyncMock(return_value=json.dumps({
            "type": "registered",
            "clientId": "test-client"
        }))
        mock_connect.return_value = mock_ws

        client = self.MockClient(client_id="test-client")
        await client.connect()

        envelope = A2AEnvelope(
            intent="test.message",
            from_agent="test-client",
            to_agent="other-client",
            payload={"data": "test"}
        )

        await client.send_envelope(envelope)

        # Verify envelope was sent
        self.assertEqual(client.stats.messages_sent, 1)
        self.assertGreater(client.stats.avg_latency_ms, 0)

    @patch('websockets.connect')
    async def test_send_batch(self, mock_connect):
        """Test sending batch of envelopes"""
        mock_ws = AsyncMock()
        mock_ws.closed = False
        mock_ws.recv = AsyncMock(return_value=json.dumps({
            "type": "registered",
            "clientId": "test-client"
        }))
        mock_connect.return_value = mock_ws

        client = self.MockClient(client_id="test-client")
        await client.connect()

        envelopes = [
            A2AEnvelope(intent="test.1", payload={"index": 1}),
            A2AEnvelope(intent="test.2", payload={"index": 2}),
            A2AEnvelope(intent="test.3", payload={"index": 3})
        ]

        await client.send_batch(envelopes)

        # Verify batch was sent
        self.assertEqual(client.stats.messages_sent, 3)

    @patch('websockets.connect')
    async def test_intent_handler(self, mock_connect):
        """Test intent handler registration and execution"""
        mock_ws = AsyncMock()
        mock_ws.recv = AsyncMock(return_value=json.dumps({
            "type": "registered",
            "clientId": "test-client"
        }))
        mock_connect.return_value = mock_ws

        client = self.MockClient(client_id="test-client")
        await client.connect()

        # Register handler
        handler_called = False
        received_envelope = None

        async def test_handler(envelope):
            nonlocal handler_called, received_envelope
            handler_called = True
            received_envelope = envelope

        client.on_intent("test.intent", test_handler)

        # Simulate receiving envelope
        envelope_data = {
            "id": "env-123",
            "intent": "test.intent",
            "from": "sender",
            "payload": {"test": "data"}
        }

        await client._handle_message(["env", envelope_data])

        # Wait for handler to execute
        await asyncio.sleep(0.1)

        # Verify handler was called
        self.assertTrue(handler_called)
        self.assertIsNotNone(received_envelope)
        self.assertEqual(received_envelope.intent, "test.intent")


class TestA2AMCPClient(unittest.IsolatedAsyncioTestCase):
    """Test full-featured A2A MCP client"""

    @patch('websockets.connect')
    async def test_full_client_initialization(self, mock_connect):
        """Test full client with all mixins"""
        client = A2AMCPClient(
            bridge_url="ws://localhost:65028",
            client_id="full-client",
            role="agent",
            max_workers=4,
            pool_size=2
        )

        # Verify all components initialized
        self.assertIsNotNone(client.thread_executor)
        self.assertIsNotNone(client.process_executor)
        self.assertEqual(client.pool_size, 2)

    @patch('websockets.connect')
    async def test_parallel_execution(self, mock_connect):
        """Test parallel execution capabilities"""
        mock_ws = AsyncMock()
        mock_ws.recv = AsyncMock(return_value=json.dumps({
            "type": "registered",
            "clientId": "full-client"
        }))
        mock_connect.return_value = mock_ws

        client = A2AMCPClient(client_id="full-client")
        await client.connect()

        # Test thread pool
        def blocking_task(x):
            return x * 10

        result = await client.run_in_thread(blocking_task, 5)
        self.assertEqual(result, 50)

        # Test process pool
        def cpu_task(x):
            return x ** 2

        result = await client.run_in_process(cpu_task, 7)
        self.assertEqual(result, 49)

        await client.shutdown()


class TestRuntimeSetup(unittest.TestCase):
    """Test runtime mode selection"""

    def test_asyncio_runtime(self):
        """Test default asyncio runtime"""
        setup_runtime(RuntimeMode.ASYNCIO)
        # Should not raise any errors

    @unittest.skipIf(not hasattr(sys, 'pypy_version_info'), "uvloop not available in test env")
    def test_uvloop_runtime(self):
        """Test uvloop runtime setup"""
        try:
            setup_runtime(RuntimeMode.UVLOOP)
        except ImportError:
            self.skipTest("uvloop not installed")


class TestPerformance(unittest.IsolatedAsyncioTestCase):
    """Performance benchmarks for async/concurrent operations"""

    async def test_concurrent_message_processing(self):
        """Benchmark concurrent message processing"""
        class BenchmarkClient(A2AMCPClient):
            async def on_registered(self, data):
                pass

        with patch('websockets.connect') as mock_connect:
            mock_ws = AsyncMock()
            mock_ws.recv = AsyncMock(return_value=json.dumps({
                "type": "registered",
                "clientId": "bench-client"
            }))
            mock_ws.closed = False
            mock_connect.return_value = mock_ws

            client = BenchmarkClient(client_id="bench-client")
            await client.connect()

            # Send 100 envelopes
            start = time.time()

            envelopes = [
                A2AEnvelope(intent=f"test.{i}", payload={"index": i})
                for i in range(100)
            ]

            await client.send_batch(envelopes)

            elapsed = time.time() - start

            # Should process 100 envelopes in under 1 second
            self.assertLess(elapsed, 1.0)

            await client.shutdown()


if __name__ == '__main__':
    unittest.main()
