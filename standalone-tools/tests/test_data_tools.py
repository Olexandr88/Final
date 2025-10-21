"""
Comprehensive test suite for data_tools.py
Tests cover: JSON/CSV operations, data transformation, edge cases, security
"""

import pytest
import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from data_tools import DataTools


class TestQueryJson:
    """Tests for query_json function"""

    def test_simple_query(self, sample_json_data):
        """Test querying a simple key"""
        json_str = json.dumps(sample_json_data)
        result = DataTools.query_json(json_str, "metadata")
        assert result['success'] is True
        assert 'total' in result['result']

    def test_nested_query(self, sample_json_data):
        """Test querying nested properties"""
        json_str = json.dumps(sample_json_data)
        result = DataTools.query_json(json_str, "metadata.total")
        assert result['success'] is True
        assert result['result'] == 3

    def test_array_index_query(self, sample_json_data):
        """Test querying array elements"""
        json_str = json.dumps(sample_json_data)
        result = DataTools.query_json(json_str, "users[0]")
        assert result['success'] is True
        assert result['result']['name'] == "Alice"

    def test_array_index_nested_query(self, sample_json_data):
        """Test querying nested array properties"""
        json_str = json.dumps(sample_json_data)
        result = DataTools.query_json(json_str, "users[1].name")
        assert result['success'] is True
        assert result['result'] == "Bob"

    def test_invalid_query(self, sample_json_data):
        """Test querying non-existent path"""
        json_str = json.dumps(sample_json_data)
        result = DataTools.query_json(json_str, "nonexistent")
        assert result['success'] is False
        assert 'error' in result

    def test_invalid_array_index(self, sample_json_data):
        """Test querying out of bounds array index"""
        json_str = json.dumps(sample_json_data)
        result = DataTools.query_json(json_str, "users[999]")
        assert result['success'] is False

    def test_query_with_dict_input(self, sample_json_data):
        """Test querying with dict instead of string"""
        result = DataTools.query_json(sample_json_data, "metadata.total")
        assert result['success'] is True
        assert result['result'] == 3

    def test_invalid_json_string(self):
        """Test with invalid JSON string"""
        result = DataTools.query_json("{invalid json}", "key")
        assert result['success'] is False

    def test_empty_query(self):
        """Test with empty query path"""
        result = DataTools.query_json('{"key": "value"}', "")
        assert result['success'] is False


class TestTransformJson:
    """Tests for transform_json function"""

    def test_pretty_format(self):
        """Test pretty formatting JSON"""
        data = '{"a":1,"b":2}'
        result = DataTools.transform_json(data, "pretty")
        assert result['success'] is True
        assert '\n' in result['result']
        assert '  ' in result['result']  # Indentation

    def test_minify_format(self):
        """Test minifying JSON"""
        data = '{\n  "a": 1,\n  "b": 2\n}'
        result = DataTools.transform_json(data, "minify")
        assert result['success'] is True
        assert '\n' not in result['result']
        assert result['result'] == '{"a":1,"b":2}'

    def test_keys_extraction(self, sample_json_data):
        """Test extracting keys from object"""
        result = DataTools.transform_json(sample_json_data, "keys")
        assert result['success'] is True
        assert 'users' in result['result']
        assert 'metadata' in result['result']

    def test_values_extraction(self):
        """Test extracting values from object"""
        data = {"a": 1, "b": 2, "c": 3}
        result = DataTools.transform_json(data, "values")
        assert result['success'] is True
        assert 1 in result['result']
        assert 2 in result['result']
        assert 3 in result['result']

    def test_flatten_nested_dict(self):
        """Test flattening nested dictionary"""
        data = {
            "a": 1,
            "b": {
                "c": 2,
                "d": {
                    "e": 3
                }
            }
        }
        result = DataTools.transform_json(data, "flatten")
        assert result['success'] is True
        assert 'a' in result['result']
        assert 'b.c' in result['result']
        assert 'b.d.e' in result['result']

    def test_entries_extraction(self):
        """Test extracting entries (key-value pairs)"""
        data = {"a": 1, "b": 2}
        result = DataTools.transform_json(data, "entries")
        assert result['success'] is True
        assert ['a', 1] in result['result']
        assert ['b', 2] in result['result']

    def test_keys_on_array(self):
        """Test keys operation on array (should return None)"""
        data = [1, 2, 3]
        result = DataTools.transform_json(data, "keys")
        assert result['success'] is True
        assert result['result'] is None

    def test_invalid_operation(self):
        """Test with invalid operation"""
        result = DataTools.transform_json('{"a": 1}', "invalid_op")
        assert result['success'] is False
        assert 'error' in result

    def test_invalid_json(self):
        """Test with invalid JSON"""
        result = DataTools.transform_json('{invalid}', "pretty")
        assert result['success'] is False


class TestCsvToJson:
    """Tests for csv_to_json function"""

    def test_csv_with_header(self, sample_csv_data):
        """Test converting CSV with headers"""
        result = DataTools.csv_to_json(sample_csv_data, True)
        assert result['success'] is True
        assert result['hasHeader'] is True
        assert result['rowCount'] == 3
        assert result['result'][0]['name'] == 'Alice'
        assert result['result'][0]['age'] == '30'

    def test_csv_without_header(self):
        """Test converting CSV without headers"""
        csv_data = "Alice,30,New York\nBob,25,Los Angeles"
        result = DataTools.csv_to_json(csv_data, False)
        assert result['success'] is True
        assert result['hasHeader'] is False
        assert isinstance(result['result'][0], list)
        assert result['result'][0][0] == 'Alice'

    def test_empty_csv(self):
        """Test with empty CSV"""
        result = DataTools.csv_to_json("", True)
        assert result['success'] is False

    def test_single_row_csv(self):
        """Test CSV with only header"""
        csv_data = "name,age,city"
        result = DataTools.csv_to_json(csv_data, True)
        assert result['success'] is True
        assert result['rowCount'] == 0

    def test_csv_with_commas_in_quotes(self):
        """Test CSV with comma inside quoted fields"""
        csv_data = 'name,address\n"John","123 Main St, Apt 4"'
        result = DataTools.csv_to_json(csv_data, True)
        assert result['success'] is True
        assert result['result'][0]['address'] == '123 Main St, Apt 4'

    def test_csv_with_special_characters(self):
        """Test CSV with special characters"""
        csv_data = 'name,email\nAlice,alice@example.com\nBob,bob+tag@example.org'
        result = DataTools.csv_to_json(csv_data, True)
        assert result['success'] is True
        assert result['rowCount'] == 2

    @pytest.mark.performance
    def test_large_csv(self):
        """Test with large CSV dataset"""
        # Generate 1000 rows
        rows = ["name,age,city"]
        for i in range(1000):
            rows.append(f"User{i},{20+i%50},City{i%10}")
        csv_data = "\n".join(rows)

        result = DataTools.csv_to_json(csv_data, True)
        assert result['success'] is True
        assert result['rowCount'] == 1000


class TestJsonToCsv:
    """Tests for json_to_csv function"""

    def test_array_to_csv(self, sample_json_data):
        """Test converting JSON array to CSV"""
        json_str = json.dumps(sample_json_data['users'])
        result = DataTools.json_to_csv(json_str, True)
        assert result['success'] is True
        assert result['rowCount'] == 3
        assert result['columnCount'] == 4
        assert 'name' in result['result']
        assert 'Alice' in result['result']

    def test_single_object_to_csv(self):
        """Test converting single JSON object to CSV"""
        data = {"name": "Alice", "age": 30}
        result = DataTools.json_to_csv(data, True)
        assert result['success'] is True
        assert result['rowCount'] == 1
        assert 'name,age' in result['result']

    def test_csv_without_header(self):
        """Test CSV conversion without header"""
        data = [{"name": "Alice", "age": 30}]
        result = DataTools.json_to_csv(data, False)
        assert result['success'] is True
        assert 'name,age' not in result['result']
        assert 'Alice,30' in result['result']

    def test_empty_array_to_csv(self):
        """Test converting empty array"""
        result = DataTools.json_to_csv([], True)
        assert result['success'] is True
        assert result['result'] == ''

    def test_nested_objects_to_csv(self):
        """Test with nested objects (should use top-level keys only)"""
        data = [{"name": "Alice", "address": {"city": "NYC"}}]
        result = DataTools.json_to_csv(data, True)
        assert result['success'] is True
        # Nested object might be stringified or cause issues

    def test_roundtrip_csv_json_csv(self, sample_csv_data):
        """Test converting CSV->JSON->CSV"""
        # CSV to JSON
        json_result = DataTools.csv_to_json(sample_csv_data, True)
        assert json_result['success'] is True

        # JSON back to CSV
        csv_result = DataTools.json_to_csv(json_result['result'], True)
        assert csv_result['success'] is True
        assert 'Alice' in csv_result['result']


class TestSortJson:
    """Tests for sort_json function"""

    def test_sort_ascending(self):
        """Test sorting array in ascending order"""
        data = [{"age": 30}, {"age": 20}, {"age": 40}]
        result = DataTools.sort_json(data, "age", "asc")
        assert result['success'] is True
        assert result['result'][0]['age'] == 20
        assert result['result'][2]['age'] == 40

    def test_sort_descending(self):
        """Test sorting array in descending order"""
        data = [{"age": 30}, {"age": 20}, {"age": 40}]
        result = DataTools.sort_json(data, "age", "desc")
        assert result['success'] is True
        assert result['result'][0]['age'] == 40
        assert result['result'][2]['age'] == 20

    def test_sort_strings(self):
        """Test sorting by string values"""
        data = [{"name": "Charlie"}, {"name": "Alice"}, {"name": "Bob"}]
        result = DataTools.sort_json(data, "name", "asc")
        assert result['success'] is True
        assert result['result'][0]['name'] == "Alice"

    def test_sort_missing_key(self):
        """Test sorting when some objects miss the key"""
        data = [{"age": 30}, {"name": "Bob"}, {"age": 20}]
        result = DataTools.sort_json(data, "age", "asc")
        assert result['success'] is True

    def test_sort_non_array(self):
        """Test sorting non-array data"""
        data = {"not": "an array"}
        result = DataTools.sort_json(data, "key", "asc")
        assert result['success'] is False
        assert 'error' in result

    def test_empty_array_sort(self):
        """Test sorting empty array"""
        result = DataTools.sort_json([], "key", "asc")
        assert result['success'] is True
        assert result['result'] == []

    @pytest.mark.parametrize("order", ["asc", "desc"])
    def test_sort_orders(self, sample_json_data, order):
        """Parameterized test for sort orders"""
        json_str = json.dumps(sample_json_data['users'])
        result = DataTools.sort_json(json_str, "age", order)
        assert result['success'] is True
        assert len(result['result']) == 3


class TestFilterJson:
    """Tests for filter_json function"""

    def test_simple_filter(self):
        """Test simple filtering"""
        data = [{"age": 30}, {"age": 20}, {"age": 40}]
        result = DataTools.filter_json(data, "age > 25")
        assert result['success'] is True
        assert result['filteredCount'] == 2
        assert all(item['age'] > 25 for item in result['result'])

    def test_filter_equals(self):
        """Test equality filtering"""
        data = [{"name": "Alice"}, {"name": "Bob"}, {"name": "Alice"}]
        result = DataTools.filter_json(data, "name == 'Alice'")
        assert result['success'] is True
        assert result['filteredCount'] == 2

    def test_filter_less_than(self):
        """Test less than filtering"""
        data = [{"score": 80}, {"score": 90}, {"score": 70}]
        result = DataTools.filter_json(data, "score < 85")
        assert result['success'] is True
        assert result['filteredCount'] == 2

    def test_filter_no_matches(self):
        """Test filter with no matches"""
        data = [{"age": 30}, {"age": 35}, {"age": 40}]
        result = DataTools.filter_json(data, "age < 20")
        assert result['success'] is True
        assert result['filteredCount'] == 0

    def test_filter_all_matches(self):
        """Test filter that matches everything"""
        data = [{"age": 30}, {"age": 35}]
        result = DataTools.filter_json(data, "age > 0")
        assert result['success'] is True
        assert result['filteredCount'] == 2

    def test_filter_non_array(self):
        """Test filtering non-array"""
        result = DataTools.filter_json({"not": "array"}, "true")
        assert result['success'] is False

    @pytest.mark.security
    def test_filter_malicious_expression(self):
        """Test filtering with potentially malicious expression"""
        data = [{"age": 30}]
        # Should fail safely due to restricted eval
        result = DataTools.filter_json(data, "__import__('os').system('ls')")
        assert result['success'] is False

    def test_filter_complex_expression(self):
        """Test complex filter expression"""
        data = [
            {"age": 30, "active": True},
            {"age": 25, "active": False},
            {"age": 35, "active": True}
        ]
        result = DataTools.filter_json(data, "age > 28 and active")
        assert result['success'] is True
        assert result['filteredCount'] == 2


class TestMergeJson:
    """Tests for merge_json function"""

    def test_merge_objects(self):
        """Test merging two objects"""
        json1 = '{"a": 1, "b": 2}'
        json2 = '{"c": 3, "d": 4}'
        result = DataTools.merge_json(json1, json2)
        assert result['success'] is True
        assert result['result']['a'] == 1
        assert result['result']['c'] == 3

    def test_merge_objects_overlap(self):
        """Test merging objects with overlapping keys"""
        json1 = '{"a": 1, "b": 2}'
        json2 = '{"b": 999, "c": 3}'
        result = DataTools.merge_json(json1, json2)
        assert result['success'] is True
        assert result['result']['b'] == 999  # Second value overwrites

    def test_merge_arrays(self):
        """Test merging two arrays"""
        json1 = '[1, 2, 3]'
        json2 = '[4, 5, 6]'
        result = DataTools.merge_json(json1, json2)
        assert result['success'] is True
        assert result['result'] == [1, 2, 3, 4, 5, 6]

    def test_merge_empty_objects(self):
        """Test merging empty objects"""
        result = DataTools.merge_json('{}', '{}')
        assert result['success'] is True
        assert result['result'] == {}

    def test_merge_different_types(self):
        """Test merging different types (should fail)"""
        json1 = '{"a": 1}'
        json2 = '[1, 2, 3]'
        result = DataTools.merge_json(json1, json2)
        assert result['success'] is False
        assert 'error' in result

    def test_merge_with_dict_input(self):
        """Test merging with dict objects"""
        data1 = {"a": 1}
        data2 = {"b": 2}
        result = DataTools.merge_json(data1, data2)
        assert result['success'] is True
        assert result['result'] == {"a": 1, "b": 2}

    def test_merge_nested_objects(self):
        """Test merging nested objects"""
        json1 = '{"user": {"name": "Alice"}}'
        json2 = '{"user": {"age": 30}}'
        result = DataTools.merge_json(json1, json2)
        assert result['success'] is True
        # Note: shallow merge, nested object gets replaced


class TestIntegration:
    """Integration tests combining multiple operations"""

    def test_csv_to_json_query_workflow(self, sample_csv_data):
        """Test CSV->JSON->Query workflow"""
        # Convert CSV to JSON
        json_result = DataTools.csv_to_json(sample_csv_data, True)
        assert json_result['success'] is True

        # Query the result
        query_result = DataTools.query_json(
            {"data": json_result['result']},
            "data[0].name"
        )
        assert query_result['success'] is True
        assert query_result['result'] == "Alice"

    def test_filter_sort_workflow(self):
        """Test filtering then sorting"""
        data = [
            {"name": "Alice", "age": 30},
            {"name": "Bob", "age": 20},
            {"name": "Charlie", "age": 35},
            {"name": "David", "age": 25}
        ]

        # Filter for age > 22
        filter_result = DataTools.filter_json(data, "age > 22")
        assert filter_result['success'] is True

        # Sort filtered results
        sort_result = DataTools.sort_json(filter_result['result'], "age", "asc")
        assert sort_result['success'] is True
        assert sort_result['result'][0]['age'] == 25

    def test_merge_and_transform_workflow(self):
        """Test merging then transforming"""
        json1 = {"a": 1, "b": 2}
        json2 = {"c": 3, "d": 4}

        # Merge
        merge_result = DataTools.merge_json(json1, json2)
        assert merge_result['success'] is True

        # Get keys
        transform_result = DataTools.transform_json(merge_result['result'], "keys")
        assert transform_result['success'] is True
        assert len(transform_result['result']) == 4

    def test_complete_data_pipeline(self, sample_csv_data):
        """Test complete data processing pipeline"""
        # 1. CSV to JSON
        json_result = DataTools.csv_to_json(sample_csv_data, True)
        assert json_result['success'] is True

        # 2. Sort by age
        sort_result = DataTools.sort_json(json_result['result'], "age", "desc")
        assert sort_result['success'] is True

        # 3. Filter for age >= 30
        filter_result = DataTools.filter_json(sort_result['result'], "int(age) >= 30")
        assert filter_result['success'] is True

        # 4. Convert back to CSV
        csv_result = DataTools.json_to_csv(filter_result['result'], True)
        assert csv_result['success'] is True
        assert "Alice" in csv_result['result']


@pytest.mark.performance
class TestPerformance:
    """Performance tests for data operations"""

    @pytest.mark.slow
    def test_large_json_query(self, mock_large_dataset, performance_thresholds):
        """Test querying large JSON structure"""
        import time
        data = {"items": mock_large_dataset}

        start = time.time()
        result = DataTools.query_json(data, "items[5000]")
        duration = time.time() - start

        assert result['success'] is True
        assert duration < performance_thresholds['medium_operation']

    @pytest.mark.slow
    def test_large_array_sort(self, performance_thresholds):
        """Test sorting large array"""
        import time
        data = [{"value": i} for i in range(10000, 0, -1)]

        start = time.time()
        result = DataTools.sort_json(data, "value", "asc")
        duration = time.time() - start

        assert result['success'] is True
        assert result['result'][0]['value'] == 1
        assert duration < performance_thresholds['large_operation']

    @pytest.mark.slow
    def test_large_array_filter(self, performance_thresholds):
        """Test filtering large array"""
        import time
        data = [{"value": i} for i in range(10000)]

        start = time.time()
        result = DataTools.filter_json(data, "value > 5000")
        duration = time.time() - start

        assert result['success'] is True
        assert result['filteredCount'] < 5000
        assert duration < performance_thresholds['large_operation']

    def test_json_transform_performance(self, sample_json_data, performance_thresholds):
        """Test JSON transformation performance"""
        import time
        # Create large nested structure
        large_data = {"level1": {f"key{i}": {"level2": i} for i in range(1000)}}

        start = time.time()
        result = DataTools.transform_json(large_data, "flatten")
        duration = time.time() - start

        assert result['success'] is True
        assert duration < performance_thresholds['medium_operation']


@pytest.mark.security
class TestSecurity:
    """Security-focused tests"""

    def test_json_injection_in_query(self, malicious_inputs):
        """Test JSON injection attempts"""
        data = {"key": malicious_inputs['sql_injection']}
        result = DataTools.query_json(data, "key")
        assert result['success'] is True

    def test_code_injection_in_filter(self):
        """Test code injection protection in filter"""
        data = [{"x": 1}]
        result = DataTools.filter_json(data, "exec('import os')")
        assert result['success'] is False

    def test_import_in_filter_expression(self):
        """Test that imports are blocked in filter"""
        data = [{"x": 1}]
        result = DataTools.filter_json(data, "__import__('sys').exit()")
        assert result['success'] is False

    def test_file_access_in_filter(self):
        """Test that file operations are blocked"""
        data = [{"x": 1}]
        result = DataTools.filter_json(data, "open('/etc/passwd').read()")
        assert result['success'] is False

    @pytest.mark.parametrize("malicious_expr", [
        "__builtins__",
        "eval('1+1')",
        "compile('x=1', 'string', 'exec')",
        "globals()",
        "locals()",
    ])
    def test_blocked_builtins(self, malicious_expr):
        """Test that dangerous builtins are blocked"""
        data = [{"x": 1}]
        result = DataTools.filter_json(data, malicious_expr)
        assert result['success'] is False

    def test_deeply_nested_json(self):
        """Test handling deeply nested JSON (DoS protection)"""
        # Create deeply nested structure
        deep = {"a": "value"}
        for _ in range(100):
            deep = {"nested": deep}

        result = DataTools.transform_json(deep, "flatten")
        assert result['success'] is True


class TestEdgeCases:
    """Edge case tests"""

    def test_unicode_in_json(self):
        """Test handling unicode in JSON"""
        data = {"name": "こんにちは", "emoji": "👋🌍"}
        result = DataTools.transform_json(data, "pretty")
        assert result['success'] is True

    def test_special_characters_in_csv(self):
        """Test CSV with special characters"""
        csv_data = 'name,note\nAlice,"Has a comma, in note"\nBob,"Has a ""quote"""'
        result = DataTools.csv_to_json(csv_data, True)
        assert result['success'] is True

    def test_null_values_in_json(self):
        """Test handling null values"""
        data = {"key": None, "other": "value"}
        result = DataTools.transform_json(data, "pretty")
        assert result['success'] is True

    def test_boolean_values(self):
        """Test handling boolean values"""
        data = [{"active": True}, {"active": False}]
        result = DataTools.filter_json(data, "active == True")
        assert result['success'] is True
        assert result['filteredCount'] == 1

    def test_mixed_types_in_array(self):
        """Test array with mixed types"""
        data = [1, "string", True, None, {"object": "value"}]
        result = DataTools.transform_json(data, "pretty")
        assert result['success'] is True

    def test_empty_strings_in_csv(self):
        """Test CSV with empty fields"""
        csv_data = "a,b,c\n1,,3\n,2,\n,,,"
        result = DataTools.csv_to_json(csv_data, True)
        assert result['success'] is True
        assert result['rowCount'] == 3
