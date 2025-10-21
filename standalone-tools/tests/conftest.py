"""
Shared pytest fixtures and configuration for standalone-tools tests
"""

import pytest
import os
import tempfile
import shutil
from pathlib import Path


@pytest.fixture
def temp_dir():
    """Create a temporary directory for file operations"""
    temp_path = tempfile.mkdtemp()
    yield Path(temp_path)
    shutil.rmtree(temp_path, ignore_errors=True)


@pytest.fixture
def sample_text():
    """Sample text for text processing tests"""
    return """Lorem ipsum dolor sit amet, consectetur adipiscing elit.
Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.

Visit https://example.com or email test@example.com for more information.
Contact support@example.org for assistance."""


@pytest.fixture
def sample_json_data():
    """Sample JSON data for data manipulation tests"""
    return {
        "users": [
            {"id": 1, "name": "Alice", "age": 30, "email": "alice@example.com"},
            {"id": 2, "name": "Bob", "age": 25, "email": "bob@example.com"},
            {"id": 3, "name": "Charlie", "age": 35, "email": "charlie@example.com"}
        ],
        "metadata": {
            "total": 3,
            "timestamp": "2023-01-01T00:00:00Z"
        }
    }


@pytest.fixture
def sample_csv_data():
    """Sample CSV data for conversion tests"""
    return """name,age,city
Alice,30,New York
Bob,25,Los Angeles
Charlie,35,Chicago"""


@pytest.fixture
def sample_numbers():
    """Sample numeric data for statistics tests"""
    return [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]


@pytest.fixture
def create_test_files(temp_dir):
    """Create sample files for file system tests"""
    files = []

    # Create text files
    for i in range(3):
        file_path = temp_dir / f"test_file_{i}.txt"
        file_path.write_text(f"Content of file {i}")
        files.append(file_path)

    # Create Python files
    for i in range(2):
        file_path = temp_dir / f"script_{i}.py"
        file_path.write_text(f"# Python script {i}\nprint('Hello')")
        files.append(file_path)

    # Create subdirectory with files
    subdir = temp_dir / "subdir"
    subdir.mkdir()
    subfile = subdir / "nested.txt"
    subfile.write_text("Nested content")
    files.append(subfile)

    # Create duplicate file
    duplicate = temp_dir / "duplicate.txt"
    duplicate.write_text("Content of file 0")  # Same as test_file_0.txt
    files.append(duplicate)

    return files


@pytest.fixture
def mock_large_dataset():
    """Generate a large dataset for performance testing"""
    return [i for i in range(10000)]


@pytest.fixture
def malicious_inputs():
    """Common malicious input patterns for security testing"""
    return {
        'sql_injection': "'; DROP TABLE users; --",
        'xss': "<script>alert('XSS')</script>",
        'path_traversal': "../../../etc/passwd",
        'command_injection': "; rm -rf /",
        'null_byte': "file\x00.txt",
        'unicode_exploits': "\u202e\u0000\uFEFF",
        'buffer_overflow': "A" * 100000,
        'format_string': "%s%s%s%s%s%s%s%s%s%s",
        'ldap_injection': "*)(uid=*",
        'xml_bomb': "<!DOCTYPE lolz [<!ENTITY lol 'lol'><!ENTITY lol1 '&lol;&lol;'>]>"
    }


@pytest.fixture
def edge_case_strings():
    """Edge case strings for text processing"""
    return {
        'empty': '',
        'whitespace': '   \t\n  ',
        'unicode': 'こんにちは世界 🌍🚀',
        'special_chars': '!@#$%^&*()_+-=[]{}|;:,.<>?/',
        'very_long': 'x' * 10000,
        'mixed_newlines': 'line1\nline2\r\nline3\rline4',
        'null_bytes': 'text\x00with\x00nulls',
        'rtl': 'مرحبا بالعالم',
        'emoji': '👨‍👩‍👧‍👦🏳️‍🌈',
        'zero_width': 'test\u200Bword'
    }


@pytest.fixture
def performance_thresholds():
    """Performance benchmarks for various operations"""
    return {
        'small_operation': 0.01,  # 10ms
        'medium_operation': 0.1,   # 100ms
        'large_operation': 1.0,    # 1 second
        'file_operation': 0.5,     # 500ms
        'network_operation': 2.0   # 2 seconds
    }


# Pytest configuration
def pytest_configure(config):
    """Configure pytest with custom markers"""
    config.addinivalue_line(
        "markers", "slow: marks tests as slow (deselect with '-m \"not slow\"')"
    )
    config.addinivalue_line(
        "markers", "security: marks tests as security-focused"
    )
    config.addinivalue_line(
        "markers", "performance: marks tests as performance benchmarks"
    )
    config.addinivalue_line(
        "markers", "integration: marks tests as integration tests"
    )


def pytest_collection_modifyitems(config, items):
    """Auto-mark slow tests based on test name"""
    for item in items:
        if "performance" in item.nodeid or "large" in item.nodeid:
            item.add_marker(pytest.mark.slow)
        if "security" in item.nodeid or "malicious" in item.nodeid:
            item.add_marker(pytest.mark.security)
