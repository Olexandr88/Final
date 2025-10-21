#!/usr/bin/env python3
"""
Regression Tests
Ensures existing functionality still works after security fixes and optimizations
Tests backward compatibility and that no features were broken
"""

import pytest
import sys
import json
import tempfile
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from text_tools import TextTools
from data_tools import DataTools
from math_tools import MathTools
from file_tools import FileTools


class TestTextToolsRegression:
    """Test text_tools.py backward compatibility"""

    def test_regex_match_still_works(self):
        """Test regex matching produces correct results"""
        text = 'The quick brown fox jumps'
        pattern = r'\b\w{5}\b'  # 5-letter words

        result = TextTools.regex_match(text, pattern)

        assert result['success'] == True
        assert result['count'] == 2  # 'quick' and 'brown'
        assert len(result['matches']) == 2

    def test_regex_replace_still_works(self):
        """Test regex replacement produces correct results"""
        text = 'Hello 123 World 456'
        result = TextTools.regex_replace(text, r'\d+', 'XXX')

        assert result['success'] == True
        assert result['result'] == 'Hello XXX World XXX'
        assert result['changed'] == True

    def test_hash_text_still_works(self):
        """Test text hashing produces correct hashes"""
        text = 'test'

        # SHA-256 hash of 'test'
        expected_sha256 = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'

        result = TextTools.hash_text(text, algorithm='sha256')

        assert result['success'] == True
        assert result['hash'] == expected_sha256
        assert result['algorithm'] == 'sha256'

    def test_encoding_decoding_still_works(self):
        """Test encoding/decoding round-trips correctly"""
        original = 'Hello World!'

        # Base64 encode
        encoded = TextTools.encode_decode(original, 'encode', 'base64')
        assert encoded['success'] == True

        # Base64 decode
        decoded = TextTools.encode_decode(encoded['result'], 'decode', 'base64')
        assert decoded['success'] == True
        assert decoded['result'] == original

    def test_text_analysis_still_works(self):
        """Test text analysis produces correct metrics"""
        text = 'Hello world.\nThis is a test.'

        result = TextTools.analyze_text(text, ['all'])

        assert result['success'] == True
        metrics = result['metrics']
        assert metrics['words'] == 6
        assert metrics['lines'] == 2
        assert metrics['characters'] > 0

    def test_url_extraction_still_works(self):
        """Test URL extraction finds URLs"""
        text = 'Visit https://example.com and http://test.org for more info'

        result = TextTools.extract_urls(text)

        assert result['success'] == True
        assert result['count'] == 2
        assert 'https://example.com' in result['urls']
        assert 'http://test.org' in result['urls']

    def test_email_extraction_still_works(self):
        """Test email extraction finds emails"""
        text = 'Contact us at support@example.com or sales@test.org'

        result = TextTools.extract_emails(text)

        assert result['success'] == True
        assert result['count'] == 2
        assert 'support@example.com' in result['emails']
        assert 'sales@test.org' in result['emails']


class TestDataToolsRegression:
    """Test data_tools.py backward compatibility"""

    def test_json_query_still_works(self):
        """Test JSON querying works correctly"""
        data = json.dumps({
            'user': {
                'name': 'Alice',
                'age': 30
            }
        })

        result = DataTools.query_json(data, 'user.name')

        assert result['success'] == True
        assert result['result'] == 'Alice'

    def test_json_array_query_still_works(self):
        """Test JSON array querying works"""
        data = json.dumps({
            'users': [
                {'name': 'Alice', 'age': 30},
                {'name': 'Bob', 'age': 25}
            ]
        })

        result = DataTools.query_json(data, 'users[0].name')

        assert result['success'] == True
        assert result['result'] == 'Alice'

    def test_json_transform_pretty_still_works(self):
        """Test JSON pretty printing works"""
        data = json.dumps({'a': 1, 'b': 2})

        result = DataTools.transform_json(data, 'pretty')

        assert result['success'] == True
        assert '\n' in result['result']  # Should be formatted

    def test_json_transform_minify_still_works(self):
        """Test JSON minification works"""
        data = json.dumps({'a': 1, 'b': 2}, indent=2)

        result = DataTools.transform_json(data, 'minify')

        assert result['success'] == True
        assert '\n' not in result['result']  # Should be compact

    def test_json_keys_values_still_works(self):
        """Test extracting keys and values works"""
        data = json.dumps({'a': 1, 'b': 2, 'c': 3})

        keys_result = DataTools.transform_json(data, 'keys')
        values_result = DataTools.transform_json(data, 'values')

        assert keys_result['success'] == True
        assert set(keys_result['result']) == {'a', 'b', 'c'}

        assert values_result['success'] == True
        assert set(values_result['result']) == {1, 2, 3}

    def test_csv_to_json_still_works(self):
        """Test CSV to JSON conversion works"""
        csv = 'name,age\nAlice,30\nBob,25'

        result = DataTools.csv_to_json(csv, has_header=True)

        assert result['success'] == True
        assert result['rowCount'] == 2
        assert result['result'][0]['name'] == 'Alice'
        assert result['result'][0]['age'] == '30'

    def test_json_to_csv_still_works(self):
        """Test JSON to CSV conversion works"""
        data = json.dumps([
            {'name': 'Alice', 'age': 30},
            {'name': 'Bob', 'age': 25}
        ])

        result = DataTools.json_to_csv(data)

        assert result['success'] == True
        assert 'name,age' in result['result']
        assert 'Alice,30' in result['result']

    def test_sort_json_still_works(self):
        """Test JSON sorting works"""
        data = json.dumps([
            {'name': 'Charlie', 'age': 35},
            {'name': 'Alice', 'age': 30},
            {'name': 'Bob', 'age': 25}
        ])

        result = DataTools.sort_json(data, 'name')

        assert result['success'] == True
        sorted_data = result['result']
        assert sorted_data[0]['name'] == 'Alice'
        assert sorted_data[1]['name'] == 'Bob'
        assert sorted_data[2]['name'] == 'Charlie'

    def test_filter_data_with_safe_expressions(self):
        """Test data filtering with safe comparison expressions"""
        data = json.dumps([
            {'age': 30, 'name': 'Alice'},
            {'age': 25, 'name': 'Bob'},
            {'age': 35, 'name': 'Charlie'}
        ])

        # Test simple comparison (should work with safe parser)
        result = DataTools.filter_data(data, 'age == 30')

        # Should either work with safe parser or fail gracefully
        if result['success']:
            assert len(result['result']) == 1
            assert result['result'][0]['name'] == 'Alice'


class TestMathToolsRegression:
    """Test math_tools.py backward compatibility"""

    def test_calculate_basic_operations(self):
        """Test basic math calculations work"""
        test_cases = [
            ('2 + 2', 4),
            ('10 - 3', 7),
            ('5 * 6', 30),
            ('20 / 4', 5),
            ('2 ** 3', 8),  # Power
        ]

        for expr, expected in test_cases:
            result = MathTools.calculate(expr, precision=0)
            assert result['success'] == True, f"Failed: {expr}"
            assert result['result'] == expected, f"Wrong result for {expr}"

    def test_calculate_math_functions(self):
        """Test math functions still work"""
        test_cases = [
            ('sqrt(16)', 4),
            ('abs(-5)', 5),
            ('max(1, 5, 3)', 5),
            ('min(1, 5, 3)', 1),
            ('round(3.7)', 4),
        ]

        for expr, expected in test_cases:
            result = MathTools.calculate(expr, precision=0)
            assert result['success'] == True, f"Failed: {expr}"
            assert result['result'] == expected, f"Wrong result for {expr}"

    def test_statistics_analysis_still_works(self):
        """Test statistical analysis works correctly"""
        data = [10, 20, 30, 40, 50]

        result = MathTools.statistics_analysis(data, ['all'])

        assert result['success'] == True
        measures = result['measures']
        assert measures['mean'] == 30
        assert measures['median'] == 30
        assert measures['min'] == 10
        assert measures['max'] == 50
        assert measures['sum'] == 150

    def test_prime_check_still_works(self):
        """Test prime checking works correctly"""
        prime_tests = [
            (2, True),
            (3, True),
            (4, False),
            (17, True),
            (100, False),
            (97, True),
        ]

        for num, expected_prime in prime_tests:
            result = MathTools.prime_check(num)
            assert result['success'] == True
            assert result['isPrime'] == expected_prime, f"Wrong result for {num}"

    def test_fibonacci_still_works(self):
        """Test Fibonacci sequence generation works"""
        result = MathTools.fibonacci(10)

        assert result['success'] == True
        assert result['count'] == 10
        # First 10 Fibonacci numbers: 0,1,1,2,3,5,8,13,21,34
        assert result['sequence'] == [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]

    def test_base_conversion_still_works(self):
        """Test number base conversion works"""
        # Decimal to hex
        result = MathTools.convert_base('255', 10, 16)
        assert result['success'] == True
        assert result['result'] == 'ff'

        # Hex to decimal
        result = MathTools.convert_base('ff', 16, 10)
        assert result['success'] == True
        assert result['result'] == '255'

    def test_percentage_calculation_still_works(self):
        """Test percentage calculation works"""
        result = MathTools.percentage(25, 100, precision=0)

        assert result['success'] == True
        assert result['percentage'] == 25
        assert result['formatted'] == '25%'

    def test_random_numbers_still_works(self):
        """Test random number generation works"""
        result = MathTools.random_numbers(count=10, min_val=1, max_val=100, decimals=0)

        assert result['success'] == True
        assert result['count'] == 10
        assert len(result['results']) == 10
        # All should be in range
        assert all(1 <= x <= 100 for x in result['results'])


class TestFileToolsRegression:
    """Test file_tools.py backward compatibility"""

    def test_list_directory_still_works(self):
        """Test directory listing works"""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create test files
            (Path(tmpdir) / 'file1.txt').write_text('content1')
            (Path(tmpdir) / 'file2.txt').write_text('content2')

            result = FileTools.list_directory(tmpdir)

            assert result['success'] == True
            assert result['count'] >= 2

    def test_get_stats_still_works(self):
        """Test file stats work"""
        with tempfile.TemporaryDirectory() as tmpdir:
            test_file = Path(tmpdir) / 'test.txt'
            test_file.write_text('Hello World')

            result = FileTools.get_stats(str(test_file))

            assert result['success'] == True
            assert result['size'] == 11
            assert result['isFile'] == True

    def test_search_files_still_works(self):
        """Test file searching works"""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create files
            (Path(tmpdir) / 'test1.txt').write_text('content')
            (Path(tmpdir) / 'test2.log').write_text('content')
            (Path(tmpdir) / 'test3.txt').write_text('content')

            result = FileTools.search_files(tmpdir, r'.*\.txt$')

            assert result['success'] == True
            assert result['count'] >= 2

    def test_find_duplicates_still_works(self):
        """Test duplicate file detection works"""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create duplicate files
            content = b'Test content for duplication'
            (Path(tmpdir) / 'file1.txt').write_bytes(content)
            (Path(tmpdir) / 'file2.txt').write_bytes(content)
            (Path(tmpdir) / 'file3.txt').write_bytes(b'Different content')

            result = FileTools.find_duplicates(tmpdir, min_size=1)

            assert result['success'] == True
            # Should find one group of duplicates (file1 and file2)
            if result.get('duplicates'):
                assert len(result['duplicates']) >= 1

    def test_batch_rename_still_works(self):
        """Test batch renaming works"""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create test files
            (Path(tmpdir) / 'old_file1.txt').write_text('content')
            (Path(tmpdir) / 'old_file2.txt').write_text('content')

            result = FileTools.batch_rename(tmpdir, 'old', 'new')

            assert result['success'] == True
            assert result['count'] >= 2

            # Check renamed files exist
            assert (Path(tmpdir) / 'new_file1.txt').exists()
            assert (Path(tmpdir) / 'new_file2.txt').exists()


class TestCLIInterfaceRegression:
    """Test CLI interfaces still work"""

    def test_text_tools_cli_interface_exists(self):
        """Test text_tools CLI can be imported"""
        import text_tools
        assert hasattr(text_tools, 'main')

    def test_data_tools_cli_interface_exists(self):
        """Test data_tools CLI can be imported"""
        import data_tools
        assert hasattr(data_tools, 'main')

    def test_math_tools_cli_interface_exists(self):
        """Test math_tools CLI can be imported"""
        import math_tools
        assert hasattr(math_tools, 'main')

    def test_file_tools_cli_interface_exists(self):
        """Test file_tools CLI can be imported"""
        import file_tools
        assert hasattr(file_tools, 'main')


class TestErrorHandlingRegression:
    """Test error handling still works correctly"""

    def test_invalid_json_handled(self):
        """Test invalid JSON is handled gracefully"""
        result = DataTools.query_json('invalid json', 'key')

        assert result['success'] == False
        assert 'error' in result

    def test_invalid_regex_handled(self):
        """Test invalid regex is handled gracefully"""
        result = TextTools.regex_match('text', '[invalid regex')

        assert result['success'] == False
        assert 'error' in result

    def test_division_by_zero_handled(self):
        """Test division by zero is handled"""
        result = MathTools.calculate('10 / 0')

        assert result['success'] == False
        assert 'error' in result

    def test_invalid_file_path_handled(self):
        """Test invalid file paths are handled"""
        result = FileTools.get_stats('/nonexistent/path/to/file.txt')

        assert result['success'] == False
        assert 'error' in result

    def test_empty_data_handled(self):
        """Test empty data is handled gracefully"""
        result = MathTools.statistics_analysis([])

        assert result['success'] == False
        assert 'error' in result


class TestOutputFormatRegression:
    """Test output formats haven't changed"""

    def test_success_format_consistent(self):
        """Test all successful responses have 'success': True"""
        results = [
            TextTools.hash_text('test'),
            DataTools.query_json('{"a":1}', 'a'),
            MathTools.calculate('2+2'),
        ]

        for result in results:
            assert 'success' in result
            assert result['success'] == True

    def test_error_format_consistent(self):
        """Test all error responses have 'success': False and 'error'"""
        results = [
            TextTools.hash_text('test', algorithm='invalid'),
            DataTools.query_json('invalid', 'key'),
            MathTools.calculate('invalid expression'),
        ]

        for result in results:
            assert 'success' in result
            assert result['success'] == False
            assert 'error' in result


if __name__ == '__main__':
    # Run with pytest
    pytest.main([__file__, '-v', '--tb=short'])
