#!/usr/bin/env python3
"""
Data Manipulation Tools
Standalone utilities for JSON, CSV, and data transformation
"""

import sys
import json
import csv
import io
import operator
import re
from typing import Any, Dict, List
from validators import validate_json, validate_text, InputValidator
from error_handler import sanitize_error, SecureErrorHandler



class DataTools:
    """Data manipulation utilities"""

    @staticmethod
    def query_json(json_data: str, query: str) -> Dict[str, Any]:
        """Query JSON data using dot notation"""
        try:
            # SECURITY: Validate JSON input size
            json_data = validate_text(json_data if isinstance(json_data, str) else str(json_data), InputValidator.MAX_JSON_SIZE)
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
                'error': sanitize_error(e, 'data_operation')
            }

    @staticmethod
    def transform_json(json_data: str, operation: str = 'pretty') -> Dict[str, Any]:
        """Transform JSON data"""
        try:
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
                'error': sanitize_error(e, 'data_operation')
            }

    @staticmethod
    def csv_to_json(csv_data: str, has_header: bool = True) -> Dict[str, Any]:
        """Convert CSV to JSON"""
        try:
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
                'error': sanitize_error(e, 'data_operation')
            }

    @staticmethod
    def json_to_csv(json_data: str, include_header: bool = True) -> Dict[str, Any]:
        """Convert JSON to CSV"""
        try:
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
                'error': sanitize_error(e, 'data_operation')
            }

    @staticmethod
    def sort_json(json_data: str, key: str, order: str = 'asc') -> Dict[str, Any]:
        """Sort JSON array by key"""
        try:
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
                'error': sanitize_error(e, 'data_operation')
            }

    @staticmethod
    def filter_json(json_data: str, filter_expr: str) -> Dict[str, Any]:
        """Filter JSON array using expression"""
        try:
            data = json.loads(json_data) if isinstance(json_data, str) else json_data

            if not isinstance(data, list):
                raise ValueError('Data must be an array')

            # Safe operator-based filtering (e.g., "age>30")
            # Parse expression: "field operator value"
            pattern = r'(\w+)\s*(==|!=|>|<|>=|<=)\s*(.+)'
            match = re.match(pattern, filter_expr.strip())

            if not match:
                raise ValueError('Invalid filter expression. Use format: field operator value (e.g., "age>30")')

            field, op, value = match.groups()

            # Safe comparison operators
            ops = {
                '==': operator.eq,
                '!=': operator.ne,
                '>': operator.gt,
                '<': operator.lt,
                '>=': operator.ge,
                '<=': operator.le
            }

            if op not in ops:
                raise ValueError(f'Invalid operator: {op}')

            # Convert value to appropriate type
            try:
                # Try numeric conversion
                if '.' in value:
                    value = float(value)
                else:
                    value = int(value)
            except ValueError:
                # Keep as string, strip quotes if present
                value = value.strip('"\'')

            # Filter with safe operator comparison
            filtered = []
            for item in data:
                if field in item:
                    try:
                        if ops[op](item[field], value):
                            filtered.append(item)
                    except (TypeError, KeyError):
                        continue

            return {
                'success': True,
                'originalCount': len(data),
                'filteredCount': len(filtered),
                'result': filtered
            }
        except Exception as e:
            return {
                'success': False,
                'error': sanitize_error(e, 'data_operation')
            }

    @staticmethod
    def merge_json(json1: str, json2: str) -> Dict[str, Any]:
        """Merge two JSON objects"""
        try:
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
                'error': sanitize_error(e, 'data_operation')
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
  filter <json> <expression>           - Filter JSON array
  merge <json1> <json2>                - Merge two JSON objects

Examples:
  ./data_tools.py query '{"name":"Alice"}' name
  ./data_tools.py csv_to_json "name,age\\nAlice,30"
  ./data_tools.py transform '{"a":1}' pretty
  ./data_tools.py sort '[{"age":30},{"age":25}]' age asc
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
