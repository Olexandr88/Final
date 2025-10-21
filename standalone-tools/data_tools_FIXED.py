#!/usr/bin/env python3
"""
Data Manipulation Tools - SECURITY FIXED VERSION
SECURITY FIX: Replaced eval() with AST-based expression parser (Line 177 vulnerability)
"""

import sys
import json
import csv
import io
import ast
import operator
from typing import Any, Dict, List

class SafeFilterEvaluator:
    """
    SECURITY FIX: Safe expression evaluator for JSON filtering
    Replaces eval() with AST parsing to prevent arbitrary code execution
    
    PREVENTS: function calls, imports, attribute access, lambdas
    ALLOWS: comparison (>, <, ==), logical (and, or), arithmetic (+, -, *, /)
    """
    
    SAFE_OPERATORS = {
        ast.Add: operator.add, ast.Sub: operator.sub,
        ast.Mult: operator.mul, ast.Div: operator.truediv,
        ast.FloorDiv: operator.floordiv, ast.Mod: operator.mod,
        ast.Pow: operator.pow, ast.Eq: operator.eq,
        ast.NotEq: operator.ne, ast.Lt: operator.lt,
        ast.LtE: operator.le, ast.Gt: operator.gt,
        ast.GtE: operator.ge, ast.And: lambda a, b: a and b,
        ast.Or: lambda a, b: a or b, ast.Not: operator.not_,
        ast.USub: operator.neg, ast.UAdd: operator.pos,
    }
    
    @staticmethod
    def is_safe_expression(expr_str: str) -> bool:
        try:
            tree = ast.parse(expr_str, mode='eval')
            for node in ast.walk(tree):
                if isinstance(node, (ast.Call, ast.Import, ast.ImportFrom, 
                                    ast.Attribute, ast.Lambda, ast.FunctionDef)):
                    return False
            return True
        except:
            return False
    
    @staticmethod
    def evaluate(expr_str: str, context: Dict[str, Any]) -> bool:
        if not SafeFilterEvaluator.is_safe_expression(expr_str):
            raise ValueError("Expression contains unsafe operations")
        try:
            tree = ast.parse(expr_str, mode='eval')
            return SafeFilterEvaluator._eval_node(tree.body, context)
        except Exception as e:
            raise ValueError(f"Invalid filter expression: {e}")
    
    @staticmethod
    def _eval_node(node, context):
        if isinstance(node, ast.Constant):
            return node.value
        elif isinstance(node, ast.Num):
            return node.n
        elif isinstance(node, ast.Str):
            return node.s
        elif isinstance(node, ast.Name):
            if node.id in context:
                return context[node.id]
            raise NameError(f"Variable '{node.id}' not found")
        elif isinstance(node, ast.Compare):
            left = SafeFilterEvaluator._eval_node(node.left, context)
            for op, comp in zip(node.ops, node.comparators):
                right = SafeFilterEvaluator._eval_node(comp, context)
                op_func = SafeFilterEvaluator.SAFE_OPERATORS.get(type(op))
                if not op_func:
                    raise ValueError(f"Unsupported operator: {type(op).__name__}")
                if not op_func(left, right):
                    return False
                left = right
            return True
        elif isinstance(node, ast.BinOp):
            left = SafeFilterEvaluator._eval_node(node.left, context)
            right = SafeFilterEvaluator._eval_node(node.right, context)
            op_func = SafeFilterEvaluator.SAFE_OPERATORS.get(type(node.op))
            if not op_func:
                raise ValueError(f"Unsupported operator")
            return op_func(left, right)
        elif isinstance(node, ast.UnaryOp):
            operand = SafeFilterEvaluator._eval_node(node.operand, context)
            op_func = SafeFilterEvaluator.SAFE_OPERATORS.get(type(node.op))
            if not op_func:
                raise ValueError(f"Unsupported operator")
            return op_func(operand)
        elif isinstance(node, ast.BoolOp):
            values = [SafeFilterEvaluator._eval_node(v, context) for v in node.values]
            if isinstance(node.op, ast.And):
                return all(values)
            elif isinstance(node.op, ast.Or):
                return any(values)
        else:
            raise ValueError(f"Unsupported expression type: {type(node).__name__}")


class DataTools:
    """Data manipulation utilities"""

    @staticmethod
    def query_json(json_data: str, query: str) -> Dict[str, Any]:
        """Query JSON data using dot notation"""
        try:
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
        Filter JSON array using expression
        
        SECURITY FIX: Replaced eval() with SafeFilterEvaluator
        Now uses AST parsing to prevent code injection
        """
        try:
            data = json.loads(json_data) if isinstance(json_data, str) else json_data
            if not isinstance(data, list):
                raise ValueError('Data must be an array')

            evaluator = SafeFilterEvaluator()
            filtered = []
            
            for item in data:
                try:
                    if evaluator.evaluate(filter_expr, item):
                        filtered.append(item)
                except:
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
                'error': str(e)
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
