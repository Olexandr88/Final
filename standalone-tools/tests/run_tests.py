#!/usr/bin/env python3
"""
Convenient test runner script with various options
Usage: python tests/run_tests.py [options]
"""

import sys
import subprocess
import argparse
from pathlib import Path


def run_command(cmd, description):
    """Run a command and print results"""
    print(f"\n{'='*70}")
    print(f"  {description}")
    print(f"{'='*70}\n")

    result = subprocess.run(cmd, shell=True)
    return result.returncode == 0


def main():
    parser = argparse.ArgumentParser(
        description="Run standalone tools test suite",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python tests/run_tests.py                    # Run all tests
  python tests/run_tests.py --fast             # Skip slow tests
  python tests/run_tests.py --coverage         # Generate coverage report
  python tests/run_tests.py --security         # Run only security tests
  python tests/run_tests.py --module text      # Test only text_tools
  python tests/run_tests.py --parallel         # Run tests in parallel
        """
    )

    parser.add_argument(
        '--module',
        choices=['text', 'data', 'file', 'math'],
        help='Run tests for specific module only'
    )

    parser.add_argument(
        '--fast',
        action='store_true',
        help='Skip slow tests'
    )

    parser.add_argument(
        '--security',
        action='store_true',
        help='Run only security tests'
    )

    parser.add_argument(
        '--performance',
        action='store_true',
        help='Run only performance tests'
    )

    parser.add_argument(
        '--coverage',
        action='store_true',
        help='Generate coverage report'
    )

    parser.add_argument(
        '--html',
        action='store_true',
        help='Generate HTML test report'
    )

    parser.add_argument(
        '--parallel',
        action='store_true',
        help='Run tests in parallel'
    )

    parser.add_argument(
        '--verbose',
        '-v',
        action='count',
        default=0,
        help='Increase verbosity (can be used multiple times)'
    )

    parser.add_argument(
        '--debug',
        action='store_true',
        help='Run with debugger on failure'
    )

    parser.add_argument(
        '--profile',
        action='store_true',
        help='Profile test execution'
    )

    args = parser.parse_args()

    # Build pytest command
    cmd_parts = ['pytest']

    # Module selection
    if args.module:
        module_map = {
            'text': 'tests/test_text_tools.py',
            'data': 'tests/test_data_tools.py',
            'file': 'tests/test_file_tools.py',
            'math': 'tests/test_math_tools.py'
        }
        cmd_parts.append(module_map[args.module])

    # Verbosity
    if args.verbose > 0:
        cmd_parts.append('-' + 'v' * min(args.verbose, 2))

    # Markers
    markers = []
    if args.fast:
        markers.append('not slow')
    if args.security:
        markers.append('security')
    if args.performance:
        markers.append('performance')

    if markers:
        cmd_parts.append(f'-m "{" and ".join(markers)}"')

    # Coverage
    if args.coverage:
        cmd_parts.extend([
            '--cov=.',
            '--cov-report=html',
            '--cov-report=term-missing'
        ])

    # HTML report
    if args.html:
        cmd_parts.append('--html=tests/report.html')

    # Parallel execution
    if args.parallel:
        cmd_parts.append('-n auto')

    # Debug mode
    if args.debug:
        cmd_parts.append('--pdb')

    # Profile mode
    if args.profile:
        cmd_parts.append('--durations=20')

    # Build final command
    cmd = ' '.join(cmd_parts)

    # Run tests
    success = run_command(cmd, "Running Test Suite")

    # Post-test actions
    if success:
        print("\n✓ All tests passed!")

        if args.coverage:
            print("\n📊 Coverage report generated: htmlcov/index.html")

        if args.html:
            print("\n📄 Test report generated: tests/report.html")

        return 0
    else:
        print("\n✗ Some tests failed!")
        return 1


if __name__ == '__main__':
    sys.exit(main())
