#!/usr/bin/env python3
"""
Python A2A MCP Client - Functional Programming Enhanced Edition

Extends the base A2A MCP client with functional programming paradigms:
- returns: Type-safe error handling with Result/Maybe monads
- cytoolz: High-performance functional utilities (C-speed)
- funcy: Production-ready decorators (retry, timeout, caching)
- more-itertools: Advanced message batching and windowing

Architecture:
- FunctionalA2AMCPClient: Extends A2AMCPClient with functional capabilities
- Railway-oriented programming for error propagation
- Declarative message processing pipelines
- Type-safe operations with monadic composition
"""

import asyncio
import json
import logging
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any, Callable, Dict, Iterable, List, Optional, TypeVar

# Base client imports
from python_a2a_mcp_client import (
    A2AEnvelope,
    A2AMCPClient,
    BaseA2AMCPClient,
    ClientStats,
    RuntimeMode,
    setup_runtime,
)

# Functional programming libraries
from returns.result import Result, Success, Failure
from returns.maybe import Maybe, Some, Nothing
from returns.pipeline import pipe
from returns.io import IOResultE, IOSuccess, IOFailure
from returns.curry import curry
from returns.iterables import Fold

from cytoolz import (
    pipe as toolz_pipe,
    compose,
    thread_first,
    thread_last,
    partition_all,
    sliding_window,
    frequencies,
    groupby,
    curry as toolz_curry,
)
from cytoolz.curried import map as cmap, filter as cfilter, reduce as creduce

from funcy import (
    retry,
    timeout,
    post_processing,
    decorator,
    cached_property,
    once,
    collecting,
    chunks,
    first,
    last,
)

from more_itertools import (
    chunked,
    windowed,
    peekable,
    consume,
    distribute,
    interleave,
    partition,
    before_and_after,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Type variables
T = TypeVar("T")
E = TypeVar("E")


# ============================================================================
# FUNCTIONAL UTILITIES - Railway-Oriented Programming
# ============================================================================


@dataclass
class EnvelopeValidationError(Exception):
    """Error raised when envelope validation fails"""

    field: str
    message: str
    envelope_id: Optional[str] = None


@dataclass
class MessageProcessingError(Exception):
    """Error raised during message processing pipeline"""

    stage: str
    message: str
    original_error: Optional[Exception] = None


def validate_envelope(envelope: A2AEnvelope) -> Result[A2AEnvelope, EnvelopeValidationError]:
    """
    Validate envelope structure using Result monad.
    Returns Success(envelope) or Failure(error).
    """
    # Check required fields
    if not envelope.intent:
        return Failure(
            EnvelopeValidationError(
                field="intent",
                message="Intent is required",
                envelope_id=envelope.id,
            )
        )

    if not envelope.from_agent:
        return Failure(
            EnvelopeValidationError(
                field="from_agent",
                message="from_agent is required",
                envelope_id=envelope.id,
            )
        )

    # Intent pattern validation
    if not envelope.intent.count(".") >= 1:
        return Failure(
            EnvelopeValidationError(
                field="intent",
                message="Intent must follow pattern: namespace.action",
                envelope_id=envelope.id,
            )
        )

    return Success(envelope)


def serialize_envelope(envelope: A2AEnvelope) -> Result[str, Exception]:
    """Serialize envelope to JSON string"""
    try:
        return Success(json.dumps({"type": "envelope", "envelope": envelope.to_dict()}))
    except Exception as e:
        return Failure(e)


def parse_envelope_data(data: Dict[str, Any]) -> Result[A2AEnvelope, Exception]:
    """Parse envelope from incoming message data"""
    try:
        if isinstance(data, list) and len(data) == 2 and data[0] == "env":
            envelope_data = data[1]
        elif data.get("type") == "envelope":
            envelope_data = data.get("envelope", {})
        else:
            return Failure(ValueError("Invalid envelope format"))

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
            trace=envelope_data.get("trace", {}),
        )

        return Success(envelope)
    except Exception as e:
        return Failure(e)


# ============================================================================
# FUNCTIONAL MESSAGE PROCESSING PIPELINES
# ============================================================================


class MessagePipeline:
    """
    Declarative message processing pipelines using cytoolz.
    Provides composable, pure functions for message transformation.
    """

    @staticmethod
    @toolz_curry
    def filter_by_intent(pattern: str, envelope: A2AEnvelope) -> bool:
        """Filter envelopes by intent pattern (curried)"""
        return envelope.intent.startswith(pattern)

    @staticmethod
    @toolz_curry
    def filter_by_priority(priority: str, envelope: A2AEnvelope) -> bool:
        """Filter envelopes by priority level"""
        priority_order = {"low": 0, "normal": 1, "high": 2, "critical": 3}
        return priority_order.get(envelope.priority, 0) >= priority_order.get(priority, 0)

    @staticmethod
    @toolz_curry
    def enrich_with_context(context: Dict[str, Any], envelope: A2AEnvelope) -> A2AEnvelope:
        """Add context to envelope (curried)"""
        envelope.context.update(context)
        return envelope

    @staticmethod
    @toolz_curry
    def map_payload(transform: Callable, envelope: A2AEnvelope) -> A2AEnvelope:
        """Transform envelope payload (curried)"""
        envelope.payload = transform(envelope.payload)
        return envelope

    @staticmethod
    def extract_payload(envelope: A2AEnvelope) -> Dict[str, Any]:
        """Extract payload from envelope"""
        return envelope.payload

    @staticmethod
    def group_by_intent(envelopes: Iterable[A2AEnvelope]) -> Dict[str, List[A2AEnvelope]]:
        """Group envelopes by intent using cytoolz"""
        return groupby(lambda e: e.intent, envelopes)

    @staticmethod
    def count_by_priority(envelopes: Iterable[A2AEnvelope]) -> Dict[str, int]:
        """Count envelopes by priority"""
        return frequencies(cmap(lambda e: e.priority, envelopes))


# ============================================================================
# BATCH PROCESSING WITH MORE-ITERTOOLS
# ============================================================================


class BatchProcessor:
    """
    Advanced message batching using more-itertools.
    Provides efficient windowing, chunking, and streaming operations.
    """

    @staticmethod
    def batch_messages(
        messages: Iterable[A2AEnvelope], batch_size: int = 50
    ) -> Iterable[List[A2AEnvelope]]:
        """
        Batch messages into chunks of specified size.
        Uses more-itertools.chunked for memory-efficient streaming.
        """
        return chunked(messages, batch_size)

    @staticmethod
    def sliding_window_messages(
        messages: Iterable[A2AEnvelope], window_size: int = 3
    ) -> Iterable[tuple]:
        """
        Create sliding window over messages for pattern detection.
        Useful for detecting message sequences or correlations.
        """
        return windowed(messages, window_size)

    @staticmethod
    def peek_priority(messages: Iterable[A2AEnvelope]) -> tuple[Optional[A2AEnvelope], Iterable]:
        """
        Peek at next message without consuming iterator.
        Useful for priority-based routing decisions.
        """
        peekable_messages = peekable(messages)
        try:
            next_msg = peekable_messages.peek()
            return (next_msg, peekable_messages)
        except StopIteration:
            return (None, peekable_messages)

    @staticmethod
    def partition_by_priority(
        messages: Iterable[A2AEnvelope],
    ) -> tuple[Iterable[A2AEnvelope], Iterable[A2AEnvelope]]:
        """
        Partition messages into high-priority and normal-priority streams.
        Returns (high_priority, normal_priority) iterables.
        """
        return partition(lambda m: m.priority in ("high", "critical"), messages)

    @staticmethod
    def distribute_to_workers(
        messages: Iterable[A2AEnvelope], num_workers: int = 4
    ) -> List[Iterable[A2AEnvelope]]:
        """
        Distribute messages round-robin to N workers.
        Returns list of N message iterables for parallel processing.
        """
        return list(distribute(num_workers, messages))


# ============================================================================
# FUNCTIONAL A2A MCP CLIENT
# ============================================================================


class FunctionalA2AMCPClient(A2AMCPClient):
    """
    Enhanced A2A MCP Client with functional programming patterns.

    Features:
    - Railway-oriented error handling with returns.Result
    - Declarative message pipelines with cytoolz
    - Production-ready decorators with funcy
    - Advanced batching with more-itertools
    - Type-safe operations with monadic composition
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.pipeline = MessagePipeline()
        self.batch_processor = BatchProcessor()
        logger.info("Initialized FunctionalA2AMCPClient with functional capabilities")

    # ========================================================================
    # RAILWAY-ORIENTED SEND OPERATIONS
    # ========================================================================

    @retry(tries=3, errors=(ConnectionError, TimeoutError), timeout=1)
    @timeout(5)
    async def send_envelope_safe(self, envelope: A2AEnvelope) -> Result[None, Exception]:
        """
        Send envelope with railway-oriented error handling.
        Returns Result[None, Exception] for type-safe error propagation.
        """
        try:
            # Validation pipeline
            validation_result = validate_envelope(envelope)

            if isinstance(validation_result, Failure):
                logger.error(f"Validation failed: {validation_result.failure()}")
                return validation_result

            # Serialization pipeline
            serialization_result = serialize_envelope(validation_result.unwrap())

            if isinstance(serialization_result, Failure):
                logger.error(f"Serialization failed: {serialization_result.failure()}")
                return serialization_result

            # Send via WebSocket
            if not self.ws or self.ws.closed:
                return Failure(ConnectionError("Not connected to bridge"))

            await self.ws.send(serialization_result.unwrap())
            self.stats.messages_sent += 1

            return Success(None)

        except Exception as e:
            logger.error(f"Send failed: {e}")
            return Failure(e)

    @retry(tries=3, errors=(ConnectionError,))
    async def send_batch_safe(
        self, envelopes: List[A2AEnvelope]
    ) -> Result[int, Exception]:
        """
        Send batch with validation and error recovery.
        Returns Result[int, Exception] where int is number of successfully sent messages.
        """
        try:
            # Validate all envelopes
            validated = []
            for env in envelopes:
                result = validate_envelope(env)
                if isinstance(result, Success):
                    validated.append(result.unwrap())
                else:
                    logger.warning(f"Skipping invalid envelope: {result.failure()}")

            if not validated:
                return Failure(ValueError("No valid envelopes to send"))

            # Send batch
            await self.send_batch(validated)

            return Success(len(validated))

        except Exception as e:
            return Failure(e)

    # ========================================================================
    # DECLARATIVE MESSAGE PROCESSING PIPELINES
    # ========================================================================

    def process_task_messages(self, messages: Iterable[A2AEnvelope]) -> List[Dict[str, Any]]:
        """
        Process task messages using declarative cytoolz pipeline.

        Pipeline:
        1. Filter messages with intent starting with "task."
        2. Filter by priority >= "high"
        3. Enrich with processing context
        4. Extract payloads
        5. Return list of payloads
        """
        return toolz_pipe(
            messages,
            cfilter(self.pipeline.filter_by_intent("task.")),
            cfilter(self.pipeline.filter_by_priority("high")),
            cmap(self.pipeline.enrich_with_context({"processed_by": self.client_id})),
            cmap(self.pipeline.extract_payload),
            list,
        )

    def process_agent_messages_composed(
        self, messages: Iterable[A2AEnvelope]
    ) -> List[A2AEnvelope]:
        """
        Process agent messages using composed pipeline.
        Demonstrates function composition with cytoolz.compose.
        """
        process = compose(
            list,
            cmap(self.pipeline.enrich_with_context({"agent": self.client_id})),
            cfilter(self.pipeline.filter_by_intent("agent.")),
        )

        return process(messages)

    # ========================================================================
    # ADVANCED BATCH PROCESSING
    # ========================================================================

    async def process_in_batches(
        self, messages: Iterable[A2AEnvelope], batch_size: int = 50
    ) -> List[Result[int, Exception]]:
        """
        Process messages in batches with parallel execution.
        Returns list of Results indicating success/failure per batch.
        """
        results = []

        for batch in self.batch_processor.batch_messages(messages, batch_size):
            result = await self.send_batch_safe(batch)
            results.append(result)

            # Log batch result
            if isinstance(result, Success):
                logger.info(f"Batch sent: {result.unwrap()} messages")
            else:
                logger.error(f"Batch failed: {result.failure()}")

        return results

    async def process_with_sliding_window(
        self, messages: Iterable[A2AEnvelope], window_size: int = 3
    ) -> List[List[A2AEnvelope]]:
        """
        Process messages using sliding window for pattern detection.
        Useful for detecting message sequences or correlations.
        """
        windows = []

        for window in self.batch_processor.sliding_window_messages(messages, window_size):
            # Filter out None values (at the end of iterator)
            valid_messages = [msg for msg in window if msg is not None]

            if len(valid_messages) == window_size:
                # Detect patterns (example: all messages from same agent)
                if len(set(msg.from_agent for msg in valid_messages)) == 1:
                    logger.info(
                        f"Pattern detected: {window_size} messages from {valid_messages[0].from_agent}"
                    )
                    windows.append(valid_messages)

        return windows

    async def route_by_priority(self, messages: Iterable[A2AEnvelope]) -> tuple[int, int]:
        """
        Route messages to different processing paths based on priority.
        Returns (high_priority_count, normal_priority_count).
        """
        high_priority, normal_priority = self.batch_processor.partition_by_priority(messages)

        # Process high-priority messages immediately
        high_results = await self.process_in_batches(high_priority, batch_size=10)
        high_count = sum(r.unwrap() for r in high_results if isinstance(r, Success))

        # Process normal-priority messages in larger batches
        normal_results = await self.process_in_batches(normal_priority, batch_size=100)
        normal_count = sum(r.unwrap() for r in normal_results if isinstance(r, Success))

        return (high_count, normal_count)

    # ========================================================================
    # PARALLEL PROCESSING WITH WORKER DISTRIBUTION
    # ========================================================================

    async def distribute_to_workers(
        self, messages: Iterable[A2AEnvelope], num_workers: int = 4
    ) -> List[Result[int, Exception]]:
        """
        Distribute messages to multiple workers for parallel processing.
        Returns list of Results, one per worker.
        """
        message_streams = self.batch_processor.distribute_to_workers(messages, num_workers)

        # Process each stream in parallel
        async def process_stream(stream):
            return await self.send_batch_safe(list(stream))

        tasks = [process_stream(stream) for stream in message_streams]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Convert exceptions to Failures
        return [
            r if isinstance(r, (Success, Failure)) else Failure(r) for r in results
        ]

    # ========================================================================
    # CACHED PROPERTIES (FUNCY)
    # ========================================================================

    @cached_property
    def message_statistics(self) -> Dict[str, Any]:
        """
        Cached property providing message statistics.
        Computed once and cached using funcy.cached_property.
        """
        return {
            "total_sent": self.stats.messages_sent,
            "total_received": self.stats.messages_received,
            "error_rate": (
                self.stats.errors / max(self.stats.messages_received, 1)
            ),
            "avg_latency_ms": self.stats.avg_latency_ms,
        }


# ============================================================================
# EXAMPLE USAGE
# ============================================================================


async def example_functional_usage():
    """
    Example demonstrating functional programming patterns with A2A MCP client.
    """

    # Create functional client
    client = FunctionalA2AMCPClient(
        bridge_url="ws://localhost:65028",
        client_id="python-functional-client",
        role="agent",
        labels=["python", "functional", "type-safe"],
        tools=["data-processing", "pipeline-execution"],
        intents=["task.*", "agent.*"],
        max_concurrent_tasks=20,
        runtime_mode=RuntimeMode.ASYNCIO,
    )

    # ========================================================================
    # EXAMPLE 1: Railway-Oriented Send
    # ========================================================================

    envelope = A2AEnvelope(
        intent="task.execute",
        from_agent=client.client_id,
        payload={"data": [1, 2, 3, 4, 5]},
    )

    result = await client.send_envelope_safe(envelope)

    if isinstance(result, Success):
        logger.info("✓ Message sent successfully")
    else:
        logger.error(f"✗ Send failed: {result.failure()}")

    # ========================================================================
    # EXAMPLE 2: Declarative Message Pipeline
    # ========================================================================

    # Simulate incoming messages
    incoming = [
        A2AEnvelope(intent="task.execute", from_agent="agent-1", priority="high"),
        A2AEnvelope(intent="task.process", from_agent="agent-2", priority="critical"),
        A2AEnvelope(intent="agent.message", from_agent="agent-3", priority="normal"),
        A2AEnvelope(intent="task.complete", from_agent="agent-1", priority="high"),
    ]

    # Process using declarative pipeline
    task_payloads = client.process_task_messages(incoming)
    logger.info(f"Processed {len(task_payloads)} task messages")

    # ========================================================================
    # EXAMPLE 3: Batch Processing with Results
    # ========================================================================

    messages = [
        A2AEnvelope(
            intent="task.batch", from_agent=client.client_id, payload={"item": i}
        )
        for i in range(200)
    ]

    batch_results = await client.process_in_batches(messages, batch_size=50)

    successful = sum(1 for r in batch_results if isinstance(r, Success))
    logger.info(f"Batches: {len(batch_results)}, Successful: {successful}")

    # ========================================================================
    # EXAMPLE 4: Priority Routing
    # ========================================================================

    mixed_priority = [
        A2AEnvelope(intent="task.urgent", from_agent=client.client_id, priority="critical"),
        A2AEnvelope(intent="task.normal", from_agent=client.client_id, priority="normal"),
        A2AEnvelope(intent="task.important", from_agent=client.client_id, priority="high"),
    ] * 10

    high_count, normal_count = await client.route_by_priority(mixed_priority)
    logger.info(f"Routed: {high_count} high-priority, {normal_count} normal-priority")

    # ========================================================================
    # EXAMPLE 5: Parallel Worker Distribution
    # ========================================================================

    large_batch = [
        A2AEnvelope(intent="task.parallel", from_agent=client.client_id, payload={"id": i})
        for i in range(1000)
    ]

    worker_results = await client.distribute_to_workers(large_batch, num_workers=4)
    total_processed = sum(r.unwrap() for r in worker_results if isinstance(r, Success))
    logger.info(f"Parallel processing: {total_processed} messages across 4 workers")

    # ========================================================================
    # EXAMPLE 6: Cached Statistics
    # ========================================================================

    stats = client.message_statistics  # Computed once, cached
    logger.info(f"Statistics: {stats}")

    # Shutdown
    await client.shutdown()


if __name__ == "__main__":
    # Setup runtime (use uvloop if available for max performance)
    import sys

    try:
        import uvloop

        setup_runtime(RuntimeMode.UVLOOP)
    except ImportError:
        setup_runtime(RuntimeMode.ASYNCIO)

    # Run functional example
    try:
        asyncio.run(example_functional_usage())
    except KeyboardInterrupt:
        logger.info("Shutdown requested")
