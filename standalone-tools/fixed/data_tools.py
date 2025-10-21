#!/usr/bin/env python3
"""
Data Manipulation Tools - SECURITY FIXED VERSION
Standalone utilities for JSON, CSV, and data transformation
FIXES: Removed eval() vulnerability, added input validation
"""

import sys
import json
import csv
import io
import operator
import re
from typing import Any, Dict, List


class DataTools:
    """Data manipulation utilities - Security Hardened"""

    # Maximum input sizes to prevent DoS
    MAX_JSON_SIZE = 10 * 1024 * 1024  # 10MB
    MAX_CSV_SIZE = 50 * 1024 * 1024   # 50MB

    @staticmethod
    def _validate_input_size(data: str, max_size: int):
        """Validate input size to prevent DoS"""
        if len(data) > max_size:
            raise ValueError(f'Input too large (max {max_size // 1024 // 1024}MB)')

    @staticmethod
    def query_json(json_data: str, query: str) -> Dict[str, Any]:
        """Query JSON data using dot notation"""
        try:
            DataTools._validate_input_size(json_data, DataTools.MAX_JSON_SIZE)
            data = json.loads(json_data) if isinstance(json_data, str) else json_data

            # Parse query path (e.g., "users[0].name")
            result = data
            for key in query.split('.'):
                # Handle array indices
                if '[' in key:
                    array_name = key[:key.index('[')]
                    index = int(key[key.index('[')+1:key.index(']')])
                    result = result[array_name][index]
                else:
                    result = result[key]

            return {
                'success': True,
                'query': query,
                'result': result
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def transform_json(json_data: str, operation: str = 'pretty') -> Dict[str, Any]:
        """Transform JSON data"""
        try:
            DataTools._validate_input_size(json_data, DataTools.MAX_JSON_SIZE)
            data = json.loads(json_data) if isinstance(json_data, str) else json_data
            result = None

            if operation == 'pretty':
                result = json.dumps(data, indent=2)
            elif operation == 'minify':
                result = json.dumps(data, separators=(',', ':'))
            elif operation == 'keys':
                result = list(data.keys()) if isinstance(data, dict) else None
            elif operation == 'values':
                result = list(data.values()) if isinstance(data, dict) else None
            elif operation == 'flatten':
                result = DataTools._flatten_dict(data)
            elif operation == 'entries':
                result = list(data.items()) if isinstance(data, dict) else None
            else:
                raise ValueError('Invalid operation. Use: pretty, minify, keys, values, flatten, entries')

            return {
                'success': True,
                'operation': operation,
                'result': result
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def csv_to_json(csv_data: str, has_header: bool = True) -> Dict[str, Any]:
        """Convert CSV to JSON"""
        try:
            DataTools._validate_input_size(csv_data, DataTools.MAX_CSV_SIZE)
            lines = csv_data.strip().split('\n')
            reader = csv.reader(lines)

            if has_header:
                headers = next(reader)
                result = []
                for row in reader:
                    result.append({headers[i]: row[i] for i in range(len(headers))})
            else:
                result = [list(row) for row in reader]

            return {
                'success': True,
                'hasHeader': has_header,
                'rowCount': len(result),
                'result': result
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def json_to_csv(json_data: str, include_header: bool = True) -> Dict[str, Any]:
        """Convert JSON to CSV"""
        try:
            DataTools._validate_input_size(json_data, DataTools.MAX_JSON_SIZE)
            data = json.loads(json_data) if isinstance(json_data, str) else json_data
            array = data if isinstance(data, list) else [data]

            if not array:
                return {
                    'success': True,
                    'result': ''
                }

            output = io.StringIO()
            headers = list(array[0].keys())
            writer = csv.DictWriter(output, fieldnames=headers)

            if include_header:
                writer.writeheader()

            for row in array:
                writer.writerow(row)

            return {
                'success': True,
                'rowCount': len(array),
                'columnCount': len(headers),
                'result': output.getvalue()
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def sort_json(json_data: str, key: str, order: str = 'asc') -> Dict[str, Any]:
        """Sort JSON array by key"""
        try:
            DataTools._validate_input_size(json_data, DataTools.MAX_JSON_SIZE)
            data = json.loads(json_data) if isinstance(json_data, str) else json_data

            if not isinstance(data, list):
                raise ValueError('Data must be an array')

            reverse = (order == 'desc')
            sorted_data = sorted(data, key=lambda x: x.get(key), reverse=reverse)

            return {
                'success': True,
                'key': key,
                'order': order,
                'result': sorted_data
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def filter_json(json_data: str, filter_expr: str) -> Dict[str, Any]:
        """
        Filter JSON array using SAFE operator-based expressions
        SECURITY FIX: Replaced eval() with safe operator parsing
        Supported format: "field operator value"
        Examples: "age>30", "name==Alice", "score>=80"
        """
        try:
            DataTools._validate_input_size(json_data, DataTools.MAX_JSON_SIZE)
            data = json.loads(json_data) if isinstance(json_data, str) else json_data

            if not isinstance(data, list):
                raise ValueError('Data must be an array')

            # Parse filter expression: "field operator value"
            pattern = r'^\s*(\w+)\s*(==|!=|>|<|>=|<=)\s*(.+?)\s*$'
            match = re.match(pattern, filter_expr)

            if not match:
                raise ValueError('Invalid filter expression. Use format: "field operator value"')

            field, op_str, value_str = match.groups()

            # Safe operators mapping
            ops = {
                '==': operator.eq,
                '!=': operator.ne,
                '>': operator.gt,
                '<': operator.lt,
                '>=': operator.ge,
                '<=': operator.le
            }

            if op_str not in ops:
                raise ValueError(f'Invalid operator: {op_str}')

            op_func = ops[op_str]

            # Try to convert value to appropriate type
            try:
                # Try int first
                value = int(value_str)
            except ValueError:
                try:
                    # Try float
                    value = float(value_str)
                except ValueError:
                    # Keep as string, remove quotes if present
                    value = value_str.strip('\'"')

            # Filter items
            filtered = []
            for item in data:
                if not isinstance(item, dict):
                    continue

                if field in item:
                    try:
                        if op_func(item[field], value):
                            filtered.append(item)
                    except TypeError:
                        # Type mismatch, skip this item
                        continue

            return {
                'success': True,
                'originalCount': len(data),
                'filteredCount': len(filtered),
                'filter': {
                    'field': field,
                    'operator': op_str,
                    'value': value
                },
                'result': filtered
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def merge_json(json1: str, json2: str) -> Dict[str, Any]:
        """Merge two JSON objects"""
        try:
            DataTools._validate_input_size(json1, DataTools.MAX_JSON_SIZE)
            DataTools._validate_input_size(json2, DataTools.MAX_JSON_SIZE)
            data1 = json.loads(json1) if isinstance(json1, str) else json1
            data2 = json.loads(json2) if isinstance(json2, str) else json2

            if isinstance(data1, dict) and isinstance(data2, dict):
                result = {**data1, **data2}
            elif isinstance(data1, list) and isinstance(data2, list):
                result = data1 + data2
            else:
                raise ValueError('Cannot merge different types')

            return {
                'success': True,
                'result': result
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def _flatten_dict(d: Dict, parent_key: str = '', sep: str = '.') -> Dict:
        """Helper to flatten nested dictionary"""
        items = []
        for k, v in d.items():
            new_key = f"{parent_key}{sep}{k}" if parent_key else k
            if isinstance(v, dict):
                items.extend(DataTools._flatten_dict(v, new_key, sep=sep).items())
            else:
                items.append((new_key, v))
        return dict(items)


def main():
    """CLI interface"""
    if len(sys.argv) < 2:
        print("""
Data Tools - Available commands:
  query <json> <query>                 - Query JSON using dot notation
  transform <json> <operation>         - Transform JSON
  csv_to_json <csv> [hasHeader]        - Convert CSV to JSON
  json_to_csv <json> [includeHeader]   - Convert JSON to CSV
  sort <json> <key> [order]            - Sort JSON array
  filter <json> <expression>           - Filter JSON array (format: "field op value")
  merge <json1> <json2>                - Merge two JSON objects

Filter Examples:
  ./data_tools.py filter '[{"age":30},{"age":25}]' 'age>27'
  ./data_tools.py filter '[{"name":"Alice"}]' 'name==Alice'
  ./data_tools.py filter '[{"score":85}]' 'score>=80'

Supported Operators: ==, !=, >, <, >=, <=
""")
        sys.exit(0)

    command = sys.argv[1]
    args = sys.argv[2:]

    commands = {
        'query': lambda: DataTools.query_json(args[0], args[1]),
        'transform': lambda: DataTools.transform_json(args[0], args[1] if len(args) > 1 else 'pretty'),
        'csv_to_json': lambda: DataTools.csv_to_json(args[0], args[1] != 'false' if len(args) > 1 else True),
        'json_to_csv': lambda: DataTools.json_to_csv(args[0], args[1] != 'false' if len(args) > 1 else True),
        'sort': lambda: DataTools.sort_json(args[0], args[1], args[2] if len(args) > 2 else 'asc'),
        'filter': lambda: DataTools.filter_json(args[0], args[1]),
        'merge': lambda: DataTools.merge_json(args[0], args[1])
    }

    if command in commands:
        result = commands[command]()
        print(json.dumps(result, indent=2))
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)


if __name__ == '__main__':
    main()
