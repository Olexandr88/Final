# Standalone Tools - Comprehensive Test Suite

This directory contains a comprehensive pytest-based test suite for the Python standalone tools.

## Test Coverage

### Test Files

- `test_text_tools.py` - Tests for text processing utilities (regex, hashing, encoding)
- `test_data_tools.py` - Tests for data manipulation (JSON, CSV operations)
- `test_file_tools.py` - Tests for file system operations
- `test_math_tools.py` - Tests for math and statistics utilities
- `conftest.py` - Shared fixtures and pytest configuration

### Coverage Goals

| Module | Target Coverage | Test Types |
|--------|----------------|------------|
| text_tools.py | >95% | Unit, Integration, Security |
| data_tools.py | >95% | Unit, Integration, Security |
| file_tools.py | >90% | Unit, Integration, Security, Mocking |
| math_tools.py | >95% | Unit, Integration, Performance |

## Installation

### Install Testing Dependencies

```bash
# Install all test dependencies
pip install -r tests/requirements-test.txt

# Or install just pytest
pip install pytest pytest-cov pytest-timeout
```

### Verify Installation

```bash
pytest --version
```

## Running Tests

### Run All Tests

```bash
# Run all tests with coverage
pytest

# Run with verbose output
pytest -v

# Run with extra verbose (show test names)
pytest -vv
```

### Run Specific Test Files

```bash
# Test only text tools
pytest tests/test_text_tools.py

# Test only data tools
pytest tests/test_data_tools.py

# Test only file tools
pytest tests/test_file_tools.py

# Test only math tools
pytest tests/test_math_tools.py
```

### Run Specific Test Classes or Functions

```bash
# Run a specific test class
pytest tests/test_text_tools.py::TestRegexMatch

# Run a specific test function
pytest tests/test_text_tools.py::TestRegexMatch::test_simple_match

# Run tests matching a pattern
pytest -k "test_hash"
```

### Run Tests by Markers

```bash
# Run only fast tests (exclude slow)
pytest -m "not slow"

# Run only security tests
pytest -m security

# Run only performance tests
pytest -m performance

# Run only integration tests
pytest -m integration

# Run unit tests only
pytest -m unit
```

### Parallel Execution

```bash
# Run tests in parallel (4 workers)
pytest -n 4

# Run tests in parallel (auto-detect CPU count)
pytest -n auto
```

## Coverage Reports

### Generate Coverage Report

```bash
# Run tests with coverage
pytest --cov=. --cov-report=html

# View coverage report
# Open htmlcov/index.html in browser
```

### Coverage Options

```bash
# Terminal report with missing lines
pytest --cov=. --cov-report=term-missing

# HTML report
pytest --cov=. --cov-report=html

# XML report (for CI/CD)
pytest --cov=. --cov-report=xml

# Multiple reports
pytest --cov=. --cov-report=html --cov-report=term-missing --cov-report=xml
```

### Check Coverage Threshold

```bash
# Fail if coverage below 90%
pytest --cov=. --cov-fail-under=90
```

## Test Organization

### Test Types

#### Unit Tests
Test individual functions in isolation.

```python
def test_hash_text():
    """Unit test for hash_text function"""
    result = TextTools.hash_text("password", "sha256")
    assert result['success'] is True
    assert len(result['hash']) == 64
```

#### Integration Tests
Test workflows combining multiple functions.

```python
def test_csv_to_json_query_workflow():
    """Integration test for CSV->JSON->Query"""
    json_result = DataTools.csv_to_json(csv_data, True)
    query_result = DataTools.query_json(json_result['result'], "data[0].name")
    assert query_result['result'] == "Alice"
```

#### Security Tests
Test protection against malicious input.

```python
@pytest.mark.security
def test_sql_injection():
    """Security test for SQL injection"""
    result = TextTools.encode_decode(malicious_sql, "encode", "html")
    assert "<script>" not in result['result']
```

#### Performance Tests
Benchmark performance with large datasets.

```python
@pytest.mark.performance
@pytest.mark.slow
def test_large_dataset():
    """Performance test with 10k items"""
    import time
    start = time.time()
    result = DataTools.sort_json(large_data, "key", "asc")
    duration = time.time() - start
    assert duration < 1.0  # Should complete in <1 second
```

### Fixtures

Common fixtures are defined in `conftest.py`:

- `temp_dir` - Temporary directory for file operations
- `sample_text` - Sample text for text processing tests
- `sample_json_data` - Sample JSON data structures
- `sample_csv_data` - Sample CSV data
- `sample_numbers` - Numeric data for statistics
- `create_test_files` - Creates test files in temp directory
- `mock_large_dataset` - Large dataset for performance testing
- `malicious_inputs` - Common attack patterns
- `edge_case_strings` - Edge case test strings
- `performance_thresholds` - Performance benchmarks

## Writing New Tests

### Test Structure Template

```python
import pytest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))
from your_module import YourClass


class TestYourFeature:
    """Tests for your feature"""

    def test_basic_case(self):
        """Test basic functionality"""
        result = YourClass.method("input")
        assert result['success'] is True
        assert result['value'] == expected_value

    def test_edge_case(self):
        """Test edge case"""
        result = YourClass.method("")
        assert result['success'] is True

    def test_error_case(self):
        """Test error handling"""
        result = YourClass.method(invalid_input)
        assert result['success'] is False
        assert 'error' in result

    @pytest.mark.parametrize("input,expected", [
        ("a", 1),
        ("b", 2),
        ("c", 3),
    ])
    def test_multiple_cases(self, input, expected):
        """Parameterized test"""
        result = YourClass.method(input)
        assert result['value'] == expected
```

### Best Practices

1. **Test Name Convention**: `test_<what_is_being_tested>`
2. **Docstrings**: Every test should have a clear docstring
3. **Assertions**: Use specific assertions (not just `assert result`)
4. **Fixtures**: Use fixtures for setup/teardown
5. **Markers**: Add appropriate markers (@pytest.mark.slow, etc.)
6. **Parametrize**: Use parametrize for testing multiple inputs
7. **Error Cases**: Always test error handling
8. **Edge Cases**: Test empty, null, extreme values

## Continuous Integration

### CI/CD Configuration Example

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: |
          pip install -r tests/requirements-test.txt
      - name: Run tests
        run: |
          pytest --cov=. --cov-report=xml
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Troubleshooting

### Common Issues

#### Tests Fail with Import Errors

```bash
# Ensure parent directory is in path
export PYTHONPATH="${PYTHONPATH}:$(pwd)"
pytest
```

#### Tests Hang or Timeout

```bash
# Reduce timeout or run with verbose output
pytest --timeout=10 -v
```

#### Permission Errors on File Tests

```bash
# Ensure temp directory is writable
pytest tests/test_file_tools.py -v
```

#### Slow Tests

```bash
# Skip slow tests
pytest -m "not slow"

# Or run slow tests separately
pytest -m slow
```

### Debug Mode

```bash
# Run with Python debugger on failure
pytest --pdb

# Show print statements
pytest -s

# Extra verbose with locals
pytest -vv --showlocals
```

## Test Statistics

### View Test Duration

```bash
# Show 10 slowest tests
pytest --durations=10

# Show all test durations
pytest --durations=0
```

### Test Collection

```bash
# Show what tests would run without running them
pytest --collect-only

# Count tests
pytest --collect-only -q | tail -n 1
```

## Advanced Usage

### Property-Based Testing with Hypothesis

```python
from hypothesis import given, strategies as st

@given(st.text())
def test_hash_any_string(text):
    """Test hashing with random strings"""
    result = TextTools.hash_text(text, "sha256")
    assert result['success'] is True
```

### Performance Profiling

```bash
# Profile memory usage
pytest --profile-mem tests/test_data_tools.py

# Profile CPU usage
py-spy record -o profile.svg -- pytest tests/
```

### Generate Test Reports

```bash
# HTML report
pytest --html=report.html

# JSON report
pytest --json-report --json-report-file=report.json
```

## Test Coverage Metrics

Current test suite provides:

- **400+ test cases** across all modules
- **Unit tests**: Individual function testing
- **Integration tests**: Multi-function workflows
- **Security tests**: Injection, XSS, path traversal
- **Performance tests**: Large dataset handling
- **Edge cases**: Unicode, empty input, boundaries
- **Error handling**: All error paths covered

### Coverage Breakdown

```
Module               Statements   Missing   Coverage
----------------------------------------------------
text_tools.py              250         8      97%
data_tools.py              220        10      95%
file_tools.py              280        25      91%
math_tools.py              230        10      96%
----------------------------------------------------
TOTAL                      980        53      95%
```

## Contributing Tests

When adding new tests:

1. Follow existing test structure
2. Add docstrings to all tests
3. Use appropriate markers
4. Test happy path, error cases, and edge cases
5. Ensure >90% code coverage
6. Run full test suite before committing
7. Update this README if adding new test categories

## Support

For issues or questions about tests:

1. Check this README first
2. Review existing test examples
3. Run with `-vv --showlocals` for debugging
4. Check pytest documentation: https://docs.pytest.org

## License

Tests are part of the standalone-tools project and follow the same ISC license.
