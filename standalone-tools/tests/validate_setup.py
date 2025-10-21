#!/usr/bin/env python3
"""
Validate test environment setup
Run this to ensure everything is configured correctly before running tests
"""

import sys
import subprocess
from pathlib import Path


def check_section(title):
    """Print section header"""
    print(f"\n{'='*70}")
    print(f"  {title}")
    print(f"{'='*70}\n")


def check_python_version():
    """Verify Python version"""
    check_section("Python Version")
    version = sys.version_info
    print(f"Python {version.major}.{version.minor}.{version.micro}")

    if version.major < 3 or (version.major == 3 and version.minor < 8):
        print("❌ Python 3.8+ required")
        return False

    print("✓ Python version OK")
    return True


def check_module_imports():
    """Verify all tool modules can be imported"""
    check_section("Module Imports")

    modules = [
        'text_tools',
        'data_tools',
        'file_tools',
        'math_tools'
    ]

    all_ok = True
    for module in modules:
        try:
            __import__(module)
            print(f"✓ {module}.py can be imported")
        except ImportError as e:
            print(f"❌ {module}.py import failed: {e}")
            all_ok = False

    return all_ok


def check_pytest():
    """Verify pytest is installed"""
    check_section("Pytest Installation")

    try:
        result = subprocess.run(
            ['pytest', '--version'],
            capture_output=True,
            text=True,
            check=True
        )
        print(result.stdout.strip())
        print("✓ pytest is installed")
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("❌ pytest is not installed")
        print("Install with: pip install -r tests/requirements-test.txt")
        return False


def check_test_dependencies():
    """Check if test dependencies are installed"""
    check_section("Test Dependencies")

    dependencies = [
        'pytest',
        'pytest_cov',
        'pytest_timeout',
    ]

    all_ok = True
    for dep in dependencies:
        try:
            __import__(dep)
            print(f"✓ {dep} is installed")
        except ImportError:
            print(f"❌ {dep} is not installed")
            all_ok = False

    if not all_ok:
        print("\nInstall missing dependencies with:")
        print("  pip install -r tests/requirements-test.txt")

    return all_ok


def check_test_files():
    """Verify all test files exist"""
    check_section("Test Files")

    test_files = [
        'tests/test_text_tools.py',
        'tests/test_data_tools.py',
        'tests/test_file_tools.py',
        'tests/test_math_tools.py',
        'tests/conftest.py',
    ]

    all_ok = True
    for test_file in test_files:
        path = Path(test_file)
        if path.exists():
            print(f"✓ {test_file} exists")
        else:
            print(f"❌ {test_file} not found")
            all_ok = False

    return all_ok


def count_tests():
    """Count total number of tests"""
    check_section("Test Collection")

    try:
        result = subprocess.run(
            ['pytest', '--collect-only', '-q'],
            capture_output=True,
            text=True,
            check=True
        )

        # Parse output to count tests
        output = result.stdout
        lines = output.strip().split('\n')

        # Last line usually shows count
        if lines:
            print(lines[-1])

        print("✓ Tests can be collected")
        return True
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print(f"❌ Could not collect tests: {e}")
        return False


def run_quick_test():
    """Run a quick smoke test"""
    check_section("Quick Smoke Test")

    try:
        result = subprocess.run(
            ['pytest', 'tests/', '-k', 'test_simple', '-v', '--tb=short'],
            capture_output=True,
            text=True,
            timeout=30
        )

        print(result.stdout)

        if result.returncode == 0:
            print("\n✓ Smoke test passed")
            return True
        else:
            print("\n❌ Smoke test failed")
            return False
    except subprocess.TimeoutExpired:
        print("❌ Smoke test timed out")
        return False
    except Exception as e:
        print(f"❌ Could not run smoke test: {e}")
        return False


def print_summary(checks):
    """Print validation summary"""
    check_section("Validation Summary")

    total = len(checks)
    passed = sum(checks.values())

    print(f"Passed: {passed}/{total} checks")

    if passed == total:
        print("\n✓ All checks passed! Ready to run tests.")
        print("\nRun tests with:")
        print("  pytest                    # All tests")
        print("  pytest -v                 # Verbose")
        print("  pytest --cov=.           # With coverage")
        print("  python tests/run_tests.py # Using test runner")
    else:
        print("\n❌ Some checks failed. Fix issues before running tests.")

    return passed == total


def main():
    """Run all validation checks"""
    print("Standalone Tools - Test Environment Validation")
    print("=" * 70)

    checks = {}

    checks['Python Version'] = check_python_version()
    checks['Module Imports'] = check_module_imports()
    checks['Pytest'] = check_pytest()
    checks['Dependencies'] = check_test_dependencies()
    checks['Test Files'] = check_test_files()

    # Only run these if basic checks pass
    if all(checks.values()):
        checks['Test Collection'] = count_tests()
        checks['Smoke Test'] = run_quick_test()

    success = print_summary(checks)

    return 0 if success else 1


if __name__ == '__main__':
    sys.exit(main())
