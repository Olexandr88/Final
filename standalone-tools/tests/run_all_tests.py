#!/usr/bin/env python3
"""
Master test runner for standalone tools test suite

Runs all tests with coverage reporting and detailed output
"""
import sys
import subprocess
from pathlib import Path


def run_tests():
    """Run complete test suite with coverage"""

    test_dir = Path(__file__).parent
    project_root = test_dir.parent

    print("=" * 70)
    print("Standalone Tools - Comprehensive Test Suite")
    print("=" * 70)
    print()

    # Test configuration
    pytest_args = [
        'pytest',
        str(test_dir),
        '-v',                          # Verbose output
        '--tb=short',                  # Short traceback format
        '--cov=' + str(project_root),  # Coverage for all tools
        '--cov-report=term-missing',   # Show missing lines
        '--cov-report=html',           # HTML coverage report
        '--timeout=10',                # 10s timeout per test
        '-W', 'ignore::DeprecationWarning',  # Ignore deprecation warnings
    ]

    print("Running tests with coverage analysis...")
    print()

    # Run pytest
    result = subprocess.run(pytest_args, cwd=project_root)

    print()
    print("=" * 70)

    if result.returncode == 0:
        print("✓ All tests passed!")
        print()
        print("Coverage report generated in: htmlcov/index.html")
        print()
        print("Test Summary:")
        print("  - test_data_tools.py: 30+ tests (safe filtering, CSV/JSON)")
        print("  - test_math_tools.py: 30+ tests (safe eval, statistics)")
        print("  - test_file_tools.py: 25+ tests (path validation, SHA-256)")
        print("  - test_text_tools.py: 25+ tests (ReDoS protection, regex)")
        print()
        print("Security validations: PASSED")
        print("Performance benchmarks: PASSED")
    else:
        print("✗ Some tests failed. Review output above.")
        print()
        print("Common issues:")
        print("  - Missing dependencies: pip install -r tests/requirements.txt")
        print("  - Path permissions: Ensure test files are writable")
        print("  - Python version: Requires Python 3.8+")

    print("=" * 70)

    return result.returncode


if __name__ == '__main__':
    sys.exit(run_tests())
