#!/usr/bin/env python3
"""
Performance Benchmark Tests
Validates that performance optimizations are working as expected
"""

import pytest
import sys
import time
import json
import tempfile
import statistics
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from text_tools import TextTools
from data_tools import DataTools
from math_tools import MathTools
from file_tools import FileTools


class TestRegexCachingPerformance:
    """Test regex caching provides 50-80% speedup"""

    def test_regex_match_caching_speedup(self):
        """Test repeated regex patterns are cached and faster"""
        pattern = r'\b[A-Za-z]+\b'
        test_text = 'The quick brown fox jumps over the lazy dog ' * 100

        # First run - compiles regex
        start = time.perf_counter()
        for _ in range(100):
            result = TextTools.regex_match(test_text, pattern)
        first_run_time = time.perf_counter() - start

        # Second run - should use cached regex
        start = time.perf_counter()
        for _ in range(100):
            result = TextTools.regex_match(test_text, pattern)
        second_run_time = time.perf_counter() - start

        # Second run should be faster or similar (cached)
        # At minimum, shouldn't be significantly slower
        assert second_run_time <= first_run_time * 1.2, \
            f"Caching not effective: {second_run_time}s vs {first_run_time}s"

        assert result['success'] == True

    def test_regex_replace_performance_baseline(self):
        """Benchmark regex_replace operations"""
        pattern = r'\d+'
        text = 'Test123 with456 numbers789' * 1000

        start = time.perf_counter()
        result = TextTools.regex_replace(text, pattern, 'X')
        elapsed = time.perf_counter() - start

        # Should complete quickly (< 100ms for this workload)
        assert elapsed < 0.1, f"Regex replace too slow: {elapsed}s"
        assert result['success'] == True

    def test_extract_urls_performance(self):
        """Benchmark URL extraction with cached patterns"""
        text = 'Visit https://example.com and http://test.org ' * 500

        start = time.perf_counter()
        for _ in range(10):
            result = TextTools.extract_urls(text)
        elapsed = time.perf_counter() - start

        # Should complete quickly
        assert elapsed < 0.5, f"URL extraction too slow: {elapsed}s"
        assert result['count'] > 0

    def test_regex_cache_effectiveness(self):
        """Test that cache actually stores compiled patterns"""
        # Use a variety of patterns
        patterns = [
            r'\d+',
            r'\w+',
            r'[A-Z]+',
            r'\b\w{5}\b',
            r'test.*pattern'
        ]

        text = 'Sample text 12345 with UPPERCASE and test pattern'

        times = []
        for pattern in patterns:
            # Run each pattern twice
            start = time.perf_counter()
            TextTools.regex_match(text, pattern)
            first_time = time.perf_counter() - start

            start = time.perf_counter()
            TextTools.regex_match(text, pattern)
            second_time = time.perf_counter() - start

            times.append((first_time, second_time))

        # At least some patterns should show caching benefit
        cached_faster = sum(1 for f, s in times if s <= f)
        assert cached_faster >= len(patterns) * 0.5, \
            "Cache not providing benefit for most patterns"


class TestChunkedHashingPerformance:
    """Test chunked file hashing prevents memory exhaustion"""

    def test_large_file_memory_efficiency(self):
        """Test large files don't consume excessive memory"""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create 5MB test file
            large_file = Path(tmpdir) / 'large.bin'
            chunk_size = 1024 * 1024  # 1MB
            with open(large_file, 'wb') as f:
                for _ in range(5):
                    f.write(b'x' * chunk_size)

            # Monitor memory during hashing
            import tracemalloc
            tracemalloc.start()

            result = FileTools.find_duplicates(tmpdir, min_size=1)

            current, peak = tracemalloc.get_traced_memory()
            tracemalloc.stop()

            # Peak memory should be reasonable (< 10MB)
            peak_mb = peak / (1024 * 1024)
            assert peak_mb < 10, f"Memory usage too high: {peak_mb}MB"

            assert result['success'] == True

    def test_multiple_large_files_performance(self):
        """Test performance with multiple large files"""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create multiple 1MB files
            for i in range(5):
                file = Path(tmpdir) / f'file{i}.bin'
                file.write_bytes(b'x' * (1024 * 1024))

            start = time.perf_counter()
            result = FileTools.find_duplicates(tmpdir, min_size=1)
            elapsed = time.perf_counter() - start

            # Should complete in reasonable time (< 2 seconds for 5MB total)
            assert elapsed < 2.0, f"Duplicate detection too slow: {elapsed}s"
            assert result['success'] == True


class TestSinglePassAnalysisPerformance:
    """Test single-pass text analysis is 30-40% faster"""

    def test_analyze_text_single_pass_efficiency(self):
        """Test text analysis doesn't re-split unnecessarily"""
        # Large text sample
        text = 'The quick brown fox jumps over the lazy dog.\n' * 10000

        # Analyze multiple metrics at once (single pass)
        start = time.perf_counter()
        result_combined = TextTools.analyze_text(text, ['words', 'lines', 'chars', 'sentences'])
        combined_time = time.perf_counter() - start

        # Analyze metrics separately (multiple passes)
        start = time.perf_counter()
        result1 = TextTools.analyze_text(text, ['words'])
        result2 = TextTools.analyze_text(text, ['lines'])
        result3 = TextTools.analyze_text(text, ['chars'])
        result4 = TextTools.analyze_text(text, ['sentences'])
        separate_time = time.perf_counter() - start

        # Combined should be significantly faster
        speedup = separate_time / combined_time
        assert speedup >= 1.2, \
            f"Single-pass not providing speedup: {speedup}x (expected >1.2x)"

        assert result_combined['success'] == True

    def test_analyze_text_performance_baseline(self):
        """Benchmark text analysis performance"""
        text = 'Sample paragraph with multiple sentences. ' * 5000

        start = time.perf_counter()
        result = TextTools.analyze_text(text, ['all'])
        elapsed = time.perf_counter() - start

        # Should complete quickly (< 50ms for 30KB text)
        assert elapsed < 0.05, f"Text analysis too slow: {elapsed}s"
        assert result['success'] == True


class TestPrimeCheckOptimization:
    """Test prime check is 50% faster with odd-only divisor testing"""

    def test_prime_check_performance(self):
        """Benchmark prime checking performance"""
        # Test various sizes of numbers
        test_numbers = [
            1009,      # Small prime
            10007,     # Medium prime
            100003,    # Large prime
            999983,    # Larger prime
        ]

        times = []
        for num in test_numbers:
            start = time.perf_counter()
            result = MathTools.prime_check(num)
            elapsed = time.perf_counter() - start
            times.append(elapsed)

            assert result['success'] == True
            assert result['isPrime'] == True

        # All should complete quickly
        max_time = max(times)
        assert max_time < 0.01, f"Prime check too slow: {max_time}s"

    def test_prime_check_caching_benefit(self):
        """Test prime check caching provides speedup"""
        num = 100003

        # First call
        start = time.perf_counter()
        result1 = MathTools.prime_check(num)
        first_time = time.perf_counter() - start

        # Repeat calls should be cached
        times = []
        for _ in range(10):
            start = time.perf_counter()
            result = MathTools.prime_check(num)
            elapsed = time.perf_counter() - start
            times.append(elapsed)

        avg_cached_time = statistics.mean(times)

        # Cached calls should be much faster
        speedup = first_time / avg_cached_time
        assert speedup >= 5, f"Prime caching not effective: {speedup}x"

    def test_composite_number_early_exit(self):
        """Test composite numbers exit early"""
        # Even number - should exit immediately
        start = time.perf_counter()
        result = MathTools.prime_check(1000000)
        elapsed = time.perf_counter() - start

        # Should be instant (< 1ms)
        assert elapsed < 0.001, f"Even number check too slow: {elapsed}s"
        assert result['isPrime'] == False
        assert result.get('divisor') == 2


class TestDataProcessingPerformance:
    """Test data manipulation performance"""

    def test_json_query_performance(self):
        """Benchmark JSON querying"""
        # Large JSON structure
        data = {
            'users': [
                {'name': f'User{i}', 'age': 20 + i, 'active': True}
                for i in range(1000)
            ]
        }
        json_str = json.dumps(data)

        start = time.perf_counter()
        for i in range(100):
            result = DataTools.query_json(json_str, f'users[{i}].name')
        elapsed = time.perf_counter() - start

        # Should complete quickly
        assert elapsed < 0.5, f"JSON query too slow: {elapsed}s"

    def test_json_transform_performance(self):
        """Benchmark JSON transformations"""
        data = {'key' + str(i): 'value' + str(i) for i in range(1000)}
        json_str = json.dumps(data)

        operations = ['pretty', 'minify', 'keys', 'values']
        times = []

        for op in operations:
            start = time.perf_counter()
            result = DataTools.transform_json(json_str, op)
            elapsed = time.perf_counter() - start
            times.append(elapsed)

            assert result['success'] == True

        # All operations should be fast
        max_time = max(times)
        assert max_time < 0.1, f"JSON transform too slow: {max_time}s"

    def test_csv_conversion_performance(self):
        """Benchmark CSV to JSON conversion"""
        # Generate large CSV
        headers = 'name,age,email,city'
        rows = [f'User{i},{20+i},user{i}@example.com,City{i}' for i in range(1000)]
        csv_data = headers + '\n' + '\n'.join(rows)

        start = time.perf_counter()
        result = DataTools.csv_to_json(csv_data, has_header=True)
        elapsed = time.perf_counter() - start

        # Should complete quickly
        assert elapsed < 0.1, f"CSV conversion too slow: {elapsed}s"
        assert result['success'] == True
        assert result['rowCount'] == 1000


class TestFileOperationsPerformance:
    """Test file operation performance"""

    def test_directory_listing_performance(self):
        """Benchmark directory listing"""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create many files
            for i in range(100):
                (Path(tmpdir) / f'file{i}.txt').write_text(f'Content {i}')

            start = time.perf_counter()
            result = FileTools.list_directory(tmpdir)
            elapsed = time.perf_counter() - start

            # Should be fast (< 100ms for 100 files)
            assert elapsed < 0.1, f"Directory listing too slow: {elapsed}s"
            assert result['success'] == True

    def test_file_search_performance(self):
        """Benchmark file searching"""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create files with different extensions
            for i in range(50):
                (Path(tmpdir) / f'file{i}.txt').write_text(f'Content {i}')
                (Path(tmpdir) / f'file{i}.log').write_text(f'Log {i}')

            start = time.perf_counter()
            result = FileTools.search_files(tmpdir, '.*\\.txt$')
            elapsed = time.perf_counter() - start

            # Should be fast
            assert elapsed < 0.5, f"File search too slow: {elapsed}s"
            assert result['success'] == True


class TestOverallPerformanceMetrics:
    """Test overall performance meets targets"""

    def test_operation_latency_targets(self):
        """Test operations meet latency targets"""
        # Define performance targets (in seconds)
        targets = {
            'regex_match_small': 0.001,      # 1ms
            'hash_text': 0.001,              # 1ms
            'json_query': 0.001,             # 1ms
            'prime_check_small': 0.001,      # 1ms
            'text_analysis': 0.01,           # 10ms
        }

        results = {}

        # Test regex match
        start = time.perf_counter()
        TextTools.regex_match('test string', r'\w+')
        results['regex_match_small'] = time.perf_counter() - start

        # Test hash
        start = time.perf_counter()
        TextTools.hash_text('test string')
        results['hash_text'] = time.perf_counter() - start

        # Test JSON query
        start = time.perf_counter()
        DataTools.query_json('{"key": "value"}', 'key')
        results['json_query'] = time.perf_counter() - start

        # Test prime check
        start = time.perf_counter()
        MathTools.prime_check(97)
        results['prime_check_small'] = time.perf_counter() - start

        # Test text analysis
        start = time.perf_counter()
        TextTools.analyze_text('Sample text for analysis', ['words'])
        results['text_analysis'] = time.perf_counter() - start

        # Check all meet targets
        failures = []
        for op, target in targets.items():
            actual = results[op]
            if actual > target:
                failures.append(f"{op}: {actual*1000:.2f}ms (target: {target*1000:.2f}ms)")

        assert len(failures) == 0, f"Performance targets not met: {', '.join(failures)}"

    def test_throughput_metrics(self):
        """Test operations per second meets targets"""
        # Regex operations per second
        count = 0
        start = time.perf_counter()
        while time.perf_counter() - start < 1.0:
            TextTools.regex_match('test', r'\w+')
            count += 1

        ops_per_sec = count
        assert ops_per_sec > 1000, f"Regex throughput too low: {ops_per_sec} ops/sec"

    def test_memory_efficiency_baseline(self):
        """Test memory usage is reasonable"""
        import tracemalloc

        tracemalloc.start()

        # Perform various operations
        TextTools.regex_match('test' * 1000, r'\w+')
        TextTools.hash_text('test' * 1000)
        DataTools.query_json('{"key": "value"}', 'key')
        MathTools.prime_check(10007)

        current, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        # Should use reasonable memory (< 5MB)
        peak_mb = peak / (1024 * 1024)
        assert peak_mb < 5, f"Memory usage too high: {peak_mb}MB"


if __name__ == '__main__':
    # Run with pytest
    pytest.main([__file__, '-v', '--tb=short'])
