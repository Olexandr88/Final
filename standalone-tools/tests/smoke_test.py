#!/usr/bin/env python3
"""
Quick smoke test to verify test suite is functional
Run this to ensure basic tests pass before running full suite
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

# Import all modules to verify they work
try:
    from text_tools import TextTools
    from data_tools import DataTools
    from file_tools import FileTools
    from math_tools import MathTools
    print("✓ All modules imported successfully")
except ImportError as e:
    print(f"✗ Import failed: {e}")
    sys.exit(1)


def test_text_tools():
    """Quick test of text tools"""
    result = TextTools.hash_text("test", "sha256")
    assert result['success'] is True
    assert len(result['hash']) == 64
    print("✓ Text tools: hash_text works")

    result = TextTools.analyze_text("hello world")
    assert result['success'] is True
    assert result['metrics']['words'] == 2
    print("✓ Text tools: analyze_text works")


def test_data_tools():
    """Quick test of data tools"""
    result = DataTools.transform_json('{"a": 1}', "pretty")
    assert result['success'] is True
    print("✓ Data tools: transform_json works")

    result = DataTools.csv_to_json("name,age\nAlice,30", True)
    assert result['success'] is True
    assert result['rowCount'] == 1
    print("✓ Data tools: csv_to_json works")


def test_file_tools():
    """Quick test of file tools"""
    import tempfile
    import os

    # Create temp directory
    temp_dir = tempfile.mkdtemp()

    try:
        result = FileTools.list_directory(temp_dir, "name")
        assert result['success'] is True
        print("✓ File tools: list_directory works")

        result = FileTools.get_stats(temp_dir)
        assert result['success'] is True
        assert result['result']['type'] == 'directory'
        print("✓ File tools: get_stats works")
    finally:
        os.rmdir(temp_dir)


def test_math_tools():
    """Quick test of math tools"""
    result = MathTools.calculate("2 + 2", 0)
    assert result['success'] is True
    assert result['result'] == 4
    print("✓ Math tools: calculate works")

    result = MathTools.statistics_analysis([1, 2, 3, 4, 5], ['mean'])
    assert result['success'] is True
    assert result['measures']['mean'] == 3.0
    print("✓ Math tools: statistics_analysis works")


def main():
    """Run all smoke tests"""
    print("="*60)
    print("  Standalone Tools - Smoke Test")
    print("="*60)
    print()

    try:
        test_text_tools()
        test_data_tools()
        test_file_tools()
        test_math_tools()

        print()
        print("="*60)
        print("  ✓ All smoke tests passed!")
        print("="*60)
        print()
        print("Next steps:")
        print("  1. Run full test suite: pytest")
        print("  2. Generate coverage: pytest --cov=.")
        print("  3. See quick reference: cat tests/QUICK_REFERENCE.md")
        return 0

    except AssertionError as e:
        print()
        print("="*60)
        print(f"  ✗ Smoke test failed: {e}")
        print("="*60)
        return 1

    except Exception as e:
        print()
        print("="*60)
        print(f"  ✗ Unexpected error: {e}")
        print("="*60)
        return 1


if __name__ == '__main__':
    sys.exit(main())
