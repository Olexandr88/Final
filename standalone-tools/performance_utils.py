#!/usr/bin/env python3
"""
Performance Utilities
Caching, profiling, and performance monitoring tools for standalone tools
"""

import time
import functools
import sys
from typing import Callable, Any, Dict
from contextlib import contextmanager


class PerformanceMonitor:
    """Performance monitoring and profiling utilities"""

    def __init__(self):
        self.metrics = {}

    @contextmanager
    def measure(self, operation_name: str):
        """Context manager to measure execution time"""
        start_time = time.perf_counter()
        start_memory = self._get_memory_usage()

        try:
            yield
        finally:
            end_time = time.perf_counter()
            end_memory = self._get_memory_usage()

            elapsed = end_time - start_time
            memory_delta = end_memory - start_memory

            if operation_name not in self.metrics:
                self.metrics[operation_name] = {
                    'count': 0,
                    'total_time': 0,
                    'min_time': float('inf'),
                    'max_time': 0,
                    'total_memory': 0
                }

            metric = self.metrics[operation_name]
            metric['count'] += 1
            metric['total_time'] += elapsed
            metric['min_time'] = min(metric['min_time'], elapsed)
            metric['max_time'] = max(metric['max_time'], elapsed)
            metric['total_memory'] += memory_delta

    def _get_memory_usage(self) -> int:
        """Get current memory usage in bytes"""
        try:
            import psutil
            import os
            process = psutil.Process(os.getpid())
            return process.memory_info().rss
        except ImportError:
            return 0

    def get_report(self) -> Dict[str, Any]:
        """Generate performance report"""
        report = {}

        for operation, metric in self.metrics.items():
            count = metric['count']
            avg_time = metric['total_time'] / count if count > 0 else 0

            report[operation] = {
                'executions': count,
                'total_time_ms': round(metric['total_time'] * 1000, 2),
                'avg_time_ms': round(avg_time * 1000, 2),
                'min_time_ms': round(metric['min_time'] * 1000, 2),
                'max_time_ms': round(metric['max_time'] * 1000, 2),
                'total_memory_mb': round(metric['total_memory'] / 1024 / 1024, 2)
            }

        return report

    def reset(self):
        """Reset all metrics"""
        self.metrics = {}


def timeit(func: Callable) -> Callable:
    """Decorator to time function execution"""
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = func(*args, **kwargs)
        elapsed = time.perf_counter() - start

        # Add timing info to result if it's a dict
        if isinstance(result, dict):
            result['_performance'] = {
                'execution_time_ms': round(elapsed * 1000, 2)
            }

        return result

    return wrapper


def profile_decorator(monitor: PerformanceMonitor, operation_name: str = None):
    """Decorator to profile function with monitor"""
    def decorator(func: Callable) -> Callable:
        name = operation_name or func.__name__

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            with monitor.measure(name):
                return func(*args, **kwargs)

        return wrapper

    return decorator


class CacheStats:
    """Track cache hit/miss statistics"""

    def __init__(self):
        self.hits = 0
        self.misses = 0
        self.size = 0

    def record_hit(self):
        self.hits += 1

    def record_miss(self):
        self.misses += 1

    def set_size(self, size: int):
        self.size = size

    def get_stats(self) -> Dict[str, Any]:
        total = self.hits + self.misses
        hit_rate = (self.hits / total * 100) if total > 0 else 0

        return {
            'hits': self.hits,
            'misses': self.misses,
            'total_requests': total,
            'hit_rate_percent': round(hit_rate, 2),
            'cache_size': self.size
        }

    def reset(self):
        self.hits = 0
        self.misses = 0


def get_lru_cache_info(func: Callable) -> Dict[str, Any]:
    """Get LRU cache statistics for a cached function"""
    if hasattr(func, 'cache_info'):
        info = func.cache_info()
        return {
            'hits': info.hits,
            'misses': info.misses,
            'maxsize': info.maxsize,
            'currsize': info.currsize,
            'hit_rate_percent': round(info.hits / (info.hits + info.misses) * 100, 2) if (info.hits + info.misses) > 0 else 0
        }
    return {}


def benchmark_function(func: Callable, iterations: int = 1000, *args, **kwargs) -> Dict[str, Any]:
    """Benchmark a function over multiple iterations"""
    times = []

    # Warmup
    for _ in range(10):
        func(*args, **kwargs)

    # Actual benchmark
    for _ in range(iterations):
        start = time.perf_counter()
        func(*args, **kwargs)
        elapsed = time.perf_counter() - start
        times.append(elapsed)

    times.sort()

    return {
        'iterations': iterations,
        'total_time_ms': round(sum(times) * 1000, 2),
        'avg_time_ms': round((sum(times) / iterations) * 1000, 4),
        'min_time_ms': round(min(times) * 1000, 4),
        'max_time_ms': round(max(times) * 1000, 4),
        'median_time_ms': round(times[iterations // 2] * 1000, 4),
        'p95_time_ms': round(times[int(iterations * 0.95)] * 1000, 4),
        'p99_time_ms': round(times[int(iterations * 0.99)] * 1000, 4)
    }


def compare_implementations(name1: str, func1: Callable, name2: str, func2: Callable,
                           iterations: int = 1000, *args, **kwargs) -> Dict[str, Any]:
    """Compare two implementations of the same function"""
    print(f"Benchmarking {name1}...")
    results1 = benchmark_function(func1, iterations, *args, **kwargs)

    print(f"Benchmarking {name2}...")
    results2 = benchmark_function(func2, iterations, *args, **kwargs)

    speedup = results1['avg_time_ms'] / results2['avg_time_ms']
    faster = name2 if speedup > 1 else name1

    return {
        name1: results1,
        name2: results2,
        'comparison': {
            'speedup': round(speedup, 2),
            'faster': faster,
            'improvement_percent': round(abs(speedup - 1) * 100, 2)
        }
    }


class MemoryTracker:
    """Track memory usage changes"""

    def __init__(self):
        self.start_memory = 0
        self.peak_memory = 0

    def start(self):
        """Start tracking"""
        self.start_memory = self._get_memory()
        self.peak_memory = self.start_memory

    def update_peak(self):
        """Update peak memory"""
        current = self._get_memory()
        self.peak_memory = max(self.peak_memory, current)

    def get_usage(self) -> Dict[str, Any]:
        """Get memory usage statistics"""
        current = self._get_memory()

        return {
            'current_mb': round(current / 1024 / 1024, 2),
            'start_mb': round(self.start_memory / 1024 / 1024, 2),
            'peak_mb': round(self.peak_memory / 1024 / 1024, 2),
            'delta_mb': round((current - self.start_memory) / 1024 / 1024, 2)
        }

    def _get_memory(self) -> int:
        """Get current memory usage in bytes"""
        try:
            import psutil
            import os
            process = psutil.Process(os.getpid())
            return process.memory_info().rss
        except ImportError:
            return 0


if __name__ == '__main__':
    print("""
Performance Utilities - Usage Examples:

1. Time a function:
   @timeit
   def my_function():
       ...

2. Monitor performance:
   monitor = PerformanceMonitor()
   with monitor.measure('operation'):
       do_work()
   print(monitor.get_report())

3. Check LRU cache stats:
   stats = get_lru_cache_info(cached_function)

4. Benchmark function:
   results = benchmark_function(my_func, 1000, arg1, arg2)

5. Compare implementations:
   comparison = compare_implementations('old', old_func, 'new', new_func, 1000)
""")
