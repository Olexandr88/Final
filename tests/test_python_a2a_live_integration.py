#!/usr/bin/env python3
"""
Live integration test for Python A2A MCP Client
Connects to running AI Bridge on ws://localhost:65028
"""

import asyncio
import sys
from pathlib import Path

# Add src directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'src' / 'integrations'))

from python_a2a_mcp_client import A2AMCPClient, A2AEnvelope


async def test_live_connection():
    """Test actual connection to running AI Bridge"""
    print("🔌 Testing live connection to AI Bridge...")

    client = A2AMCPClient(
        bridge_url="ws://localhost:65028",
        client_id="python-test-client",
        role="agent",
        labels=["test", "python"],
        tools=["test-tool"]
    )

    try:
        # Connect to bridge
        print("   Connecting to ws://localhost:65028...")
        await client.connect()
        print("   ✓ Connected successfully")

        # Wait for registration
        await asyncio.sleep(0.5)
        print(f"   ✓ Registered as: {client.client_id}")
        print(f"   ✓ Connected at: {client.stats.connected_at}")

        # Send test envelope
        print("\n📤 Sending test envelope...")
        envelope = A2AEnvelope(
            intent="test.message",
            from_agent=client.client_id,
            to_agent="ai-bridge",
            payload={"test": "Hello from Python A2A Client!"}
        )

        await client.send_envelope(envelope)
        print(f"   ✓ Sent envelope: {envelope.id}")
        print(f"   ✓ Messages sent: {client.stats.messages_sent}")
        print(f"   ✓ Avg latency: {client.stats.avg_latency_ms:.2f}ms")

        # Send batch of envelopes
        print("\n📦 Sending batch of 5 envelopes...")
        envelopes = [
            A2AEnvelope(
                intent=f"test.batch.{i}",
                from_agent=client.client_id,
                payload={"index": i, "data": f"Batch message {i}"}
            )
            for i in range(5)
        ]

        await client.send_batch(envelopes)
        print(f"   ✓ Sent batch of {len(envelopes)} envelopes")
        print(f"   ✓ Total messages sent: {client.stats.messages_sent}")
        print(f"   ✓ Avg latency: {client.stats.avg_latency_ms:.2f}ms")

        # Test thread executor
        print("\n🧵 Testing thread executor...")
        def blocking_task(x):
            return x * 10

        result = await client.run_in_thread(blocking_task, 7)
        print(f"   ✓ Thread executor result: {result}")
        assert result == 70, f"Expected 70, got {result}"

        # Test thread pool mapping
        print("\n🔢 Testing thread pool mapping...")
        results = await client.map_parallel_threads(lambda x: x ** 2, [1, 2, 3, 4, 5])
        print(f"   ✓ Parallel thread mapping result: {results}")
        assert results == [1, 4, 9, 16, 25], f"Expected [1, 4, 9, 16, 25], got {results}"

        # Print final stats
        print("\n📊 Final Statistics:")
        print(f"   Messages sent: {client.stats.messages_sent}")
        print(f"   Messages received: {client.stats.messages_received}")
        print(f"   Errors: {client.stats.errors}")
        print(f"   Avg latency: {client.stats.avg_latency_ms:.2f}ms")
        print(f"   Connected at: {client.stats.connected_at}")
        print(f"   Last seen: {client.stats.last_seen}")

        print("\n✅ All live integration tests passed!")
        return True

    except Exception as e:
        print(f"\n❌ Live integration test failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        print("\n🔌 Shutting down client...")
        await client.shutdown()
        print("   ✓ Client shutdown complete")


async def main():
    """Main test runner"""
    print("=" * 60)
    print("Python A2A MCP Client - Live Integration Test")
    print("=" * 60)
    print()

    success = await test_live_connection()

    print()
    print("=" * 60)
    if success:
        print("RESULT: ✅ LIVE INTEGRATION TEST PASSED")
    else:
        print("RESULT: ❌ LIVE INTEGRATION TEST FAILED")
    print("=" * 60)

    return 0 if success else 1


if __name__ == '__main__':
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
