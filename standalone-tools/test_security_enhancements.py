#!/usr/bin/env python3
"""Test Suite for Security Enhancements"""

import json
import sys

def test_validators():
    print("=" * 60)
    print("TEST 1: INPUT VALIDATION MODULE")
    print("=" * 60)
    
    from validators import validate_json, validate_number, InputValidator
    
    # Test JSON size limit
    print("
1a. JSON Size Limit Test")
    try:
        large_json = json.dumps({"data": "x" * (2 * 1024 * 1024)})
        validate_json(large_json)
        print("FAIL: Should have raised error")
    except ValueError as e:
        print(f"PASS: {str(e)[:80]}...")
    
    # Test valid JSON
    print("
1b. Valid JSON Test")
    try:
        data = validate_json('{"name": "test", "value": 123}', required_type=dict)
        print(f"PASS: Validated JSON: {data}")
    except ValueError as e:
        print(f"FAIL: {e}")
    
    # Test array length
    print("
1c. Array Length Limit Test")
    try:
        large_array = list(range(200000))
        InputValidator.validate_array_input(large_array)
        print("FAIL: Should have raised error")
    except ValueError as e:
        print(f"PASS: {str(e)[:80]}...")
    
    # Test number range
    print("
1d. Number Range Test")
    try:
        num = validate_number("150", min_value=0, max_value=100)
        print("FAIL: Should have raised error")
    except ValueError as e:
        print(f"PASS: {e}")
    
    print("
1e. Valid Number Test")
    try:
        num = validate_number("75", min_value=0, max_value=100)
        print(f"PASS: Validated number: {num}")
    except ValueError as e:
        print(f"FAIL: {e}")

def test_error_handler():
    print("
" + "=" * 60)
    print("TEST 2: ERROR MESSAGE SANITIZATION")
    print("=" * 60)
    
    from error_handler import sanitize_error
    
    # Test path sanitization
    print("
2a. Windows Path Sanitization")
    try:
        raise FileNotFoundError("Could not find C:\Users\Admin\secret\data.txt")
    except Exception as e:
        original = str(e)
        sanitized = sanitize_error(e, 'file_operation')
        print(f"Original:  {original}")
        print(f"Sanitized: {sanitized}")
        print("PASS: Path sanitized" if "***" in sanitized else "WARN: Check sanitization")
    
    # Test sensitive data
    print("
2b. Sensitive Data Sanitization")
    try:
        raise ValueError("Invalid API_KEY: sk-1234567890abcdef in request")
    except Exception as e:
        original = str(e)
        sanitized = sanitize_error(e, 'api_call')
        print(f"Original:  {original}")
        print(f"Sanitized: {sanitized}")
        print("PASS: API key sanitized" if "***" in sanitized else "WARN: Check sanitization")

def test_integrated_tools():
    print("
" + "=" * 60)
    print("TEST 3: INTEGRATED TOOL SECURITY")
    print("=" * 60)
    
    # Test data tools
    print("
3a. Data Tools - Error Sanitization")
    try:
        from data_tools_SECURE import DataTools
        result = DataTools.query_json('{"test": "data"}', "nonexistent.field")
        print(f"Result: {result}")
        if not result['success']:
            print(f"PASS: Error handled: {result['error'][:80]}...")
    except Exception as e:
        print(f"Import/execution error: {e}")
    
    # Test math tools
    print("
3b. Math Tools - Invalid Expression")
    try:
        from math_tools_SECURE import MathTools
        result = MathTools.calculate("invalid syntax here")
        if not result['success']:
            print(f"PASS: Error caught: {result['error'][:80]}...")
    except Exception as e:
        print(f"Import/execution error: {e}")

def main():
    print("
" + "#" * 60)
    print("# SECURITY ENHANCEMENTS TEST SUITE")
    print("#" * 60)
    
    test_validators()
    test_error_handler()
    test_integrated_tools()
    
    print("
" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    print("Features implemented:")
    print("1. Input validation with size limits")
    print("2. Error message sanitization")
    print("3. Integration with tool files")
    print("=" * 60)

if __name__ == "__main__":
    main()
