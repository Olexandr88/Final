#!/usr/bin/env python3
"""
Math and Statistics Tools
Standalone utilities for calculations and statistical analysis
OPTIMIZED VERSION with prime check caching and odd-only divisor testing
"""

import sys
import json
import math
import random
import statistics
import ast
import operator
from typing import List, Dict, Any, Union
from functools import lru_cache
from validators import validate_number, InputValidator
from error_handler import sanitize_error, SecureErrorHandler



class MathTools:
    """Math and statistics utilities with performance optimizations"""

    @staticmethod
    def _safe_eval(node, allowed_names):
        """
        Safe AST-based expression evaluator
        Prevents code injection by only allowing mathematical operations
        """
        if isinstance(node, ast.Constant):  # Python 3.8+
            return node.value
        elif isinstance(node, ast.Num):  # Python 3.7 compatibility
            return node.n
        elif isinstance(node, ast.BinOp):
            # Binary operations: +, -, *, /, **
            ops = {
                ast.Add: operator.add,
                ast.Sub: operator.sub,
                ast.Mult: operator.mul,
                ast.Div: operator.truediv,
                ast.Pow: operator.pow,
                ast.FloorDiv: operator.floordiv,
                ast.Mod: operator.mod
            }
            op_type = type(node.op)
            if op_type not in ops:
                raise ValueError(f'Unsupported operation: {op_type.__name__}')
            return ops[op_type](
                MathTools._safe_eval(node.left, allowed_names),
                MathTools._safe_eval(node.right, allowed_names)
            )
        elif isinstance(node, ast.UnaryOp):
            # Unary operations: -, +
            ops = {
                ast.UAdd: operator.pos,
                ast.USub: operator.neg
            }
            op_type = type(node.op)
            if op_type not in ops:
                raise ValueError(f'Unsupported unary operation: {op_type.__name__}')
            return ops[op_type](MathTools._safe_eval(node.operand, allowed_names))
        elif isinstance(node, ast.Call):
            # Function calls: sqrt, sin, cos, etc.
            if not isinstance(node.func, ast.Name):
                raise ValueError('Only named functions are allowed')
            func_name = node.func.id
            if func_name not in allowed_names:
                raise ValueError(f'Function not allowed: {func_name}')
            func = allowed_names[func_name]
            args = [MathTools._safe_eval(arg, allowed_names) for arg in node.args]
            return func(*args)
        elif isinstance(node, ast.Name):
            # Variable/constant names: pi, e
            if node.id not in allowed_names:
                raise ValueError(f'Name not allowed: {node.id}')
            return allowed_names[node.id]
        else:
            raise ValueError(f'Unsupported expression type: {type(node).__name__}')

    @staticmethod
    def calculate(expression: str, precision: int = 2) -> Dict[str, Any]:
        """Safely evaluate mathematical expressions"""
        try:
            # Safe AST-based evaluation with allowed functions
            allowed_names = {
                'abs': abs, 'round': round, 'min': min, 'max': max,
                'pow': pow, 'sum': sum,
                'sqrt': math.sqrt, 'sin': math.sin, 'cos': math.cos,
                'tan': math.tan, 'pi': math.pi, 'e': math.e,
                'log': math.log, 'log10': math.log10, 'exp': math.exp,
                'ceil': math.ceil, 'floor': math.floor
            }

            # Parse expression to AST and safely evaluate
            tree = ast.parse(expression, mode='eval')
            result = MathTools._safe_eval(tree.body, allowed_names)

            if not isinstance(result, (int, float)):
                raise ValueError('Expression did not evaluate to a number')

            rounded = round(result, precision)

            return {
                'success': True,
                'expression': expression,
                'result': rounded,
                'rawResult': result
            }
        except Exception as e:
            return {
                'success': False,
                'error': sanitize_error(e, 'math_operation')
            }

    @staticmethod
    def statistics_analysis(data: List[Union[int, float]], measures: List[str] = None) -> Dict[str, Any]:
        """Calculate statistical measures"""
        try:
            if not data:
                raise ValueError('Data cannot be empty')

            numbers = [float(x) for x in data]

            if measures is None or 'all' in measures:
                measures = ['all']

            results = {}

            if 'all' in measures or 'mean' in measures:
                results['mean'] = statistics.mean(numbers)

            if 'all' in measures or 'median' in measures:
                results['median'] = statistics.median(numbers)

            if 'all' in measures or 'mode' in measures:
                try:
                    results['mode'] = statistics.mode(numbers)
                except statistics.StatisticsError:
                    results['mode'] = None

            if 'all' in measures or 'min' in measures:
                results['min'] = min(numbers)

            if 'all' in measures or 'max' in measures:
                results['max'] = max(numbers)

            if 'all' in measures or 'range' in measures:
                results['range'] = max(numbers) - min(numbers)

            if 'all' in measures or 'sum' in measures:
                results['sum'] = sum(numbers)

            if 'all' in measures or 'variance' in measures:
                results['variance'] = statistics.variance(numbers) if len(numbers) > 1 else 0

            if 'all' in measures or 'stddev' in measures:
                results['standardDeviation'] = statistics.stdev(numbers) if len(numbers) > 1 else 0

            if 'all' in measures or 'quartiles' in measures:
                sorted_nums = sorted(numbers)
                results['quartiles'] = {
                    'q1': statistics.median(sorted_nums[:len(sorted_nums)//2]),
                    'q2': statistics.median(sorted_nums),
                    'q3': statistics.median(sorted_nums[(len(sorted_nums)+1)//2:])
                }

            results['count'] = len(numbers)

            return {
                'success': True,
                'measures': results
            }
        except Exception as e:
            return {
                'success': False,
                'error': sanitize_error(e, 'math_operation')
            }

    @staticmethod
    def convert_base(number: str, from_base: int, to_base: int) -> Dict[str, Any]:
        """Convert between number bases"""
        try:
            valid_bases = [2, 8, 10, 16]

            if from_base not in valid_bases or to_base not in valid_bases:
                raise ValueError('Base must be 2, 8, 10, or 16')

            # Convert to decimal first
            decimal = int(str(number), from_base)

            # Convert to target base
            if to_base == 2:
                result = bin(decimal)[2:]
            elif to_base == 8:
                result = oct(decimal)[2:]
            elif to_base == 10:
                result = str(decimal)
            elif to_base == 16:
                result = hex(decimal)[2:]
            else:
                result = str(decimal)

            return {
                'success': True,
                'original': number,
                'fromBase': from_base,
                'toBase': to_base,
                'result': result
            }
        except Exception as e:
            return {
                'success': False,
                'error': sanitize_error(e, 'math_operation')
            }

    @staticmethod
    def random_numbers(count: int = 1, min_val: float = 0, max_val: float = 100,
                      decimals: int = 0, unique: bool = False) -> Dict[str, Any]:
        """Generate random numbers"""
        try:
            results = []

            if unique and decimals == 0:
                # For unique integers
                if count > (max_val - min_val + 1):
                    raise ValueError('Cannot generate more unique numbers than range allows')
                results = random.sample(range(int(min_val), int(max_val) + 1), count)
            else:
                # For non-unique or decimal numbers
                for _ in range(count):
                    num = random.uniform(min_val, max_val)
                    if decimals == 0:
                        num = int(num)
                    else:
                        num = round(num, decimals)
                    results.append(num)

            return {
                'success': True,
                'count': len(results),
                'min': min_val,
                'max': max_val,
                'results': results
            }
        except Exception as e:
            return {
                'success': False,
                'error': sanitize_error(e, 'math_operation')
            }

    @staticmethod
    def percentage(value: float, total: float, precision: int = 2) -> Dict[str, Any]:
        """Calculate percentage"""
        try:
            if total == 0:
                raise ValueError('Total cannot be zero')

            percent = (value / total) * 100
            rounded = round(percent, precision)

            return {
                'success': True,
                'value': value,
                'total': total,
                'percentage': rounded,
                'formatted': f"{rounded}%"
            }
        except Exception as e:
            return {
                'success': False,
                'error': sanitize_error(e, 'math_operation')
            }

    @staticmethod
    def fibonacci(n: int) -> Dict[str, Any]:
        """Generate Fibonacci sequence"""
        try:
            if n < 1:
                raise ValueError('n must be at least 1')

            sequence = []
            a, b = 0, 1

            for _ in range(n):
                sequence.append(a)
                a, b = b, a + b

            return {
                'success': True,
                'count': n,
                'sequence': sequence,
                'last': sequence[-1]
            }
        except Exception as e:
            return {
                'success': False,
                'error': sanitize_error(e, 'math_operation')
            }

    @staticmethod
    @lru_cache(maxsize=1024)
    def _is_prime_optimized(number: int) -> tuple:
        """
        OPTIMIZATION 5: Prime check optimization - 50% speedup
        - Skip even numbers (check only odd divisors)
        - Cached for repeated checks
        Returns (isPrime, divisor_or_none)
        """
        if number < 2:
            return (False, None)
        if number == 2:
            return (True, None)
        if number % 2 == 0:
            return (False, 2)

        # Only check odd divisors from 3 to sqrt(n)
        for i in range(3, int(math.sqrt(number)) + 1, 2):
            if number % i == 0:
                return (False, i)

        return (True, None)

    @staticmethod
    def prime_check(number: int) -> Dict[str, Any]:
        """Check if number is prime with optimization"""
        try:
            is_prime, divisor = MathTools._is_prime_optimized(number)

            result = {
                'success': True,
                'number': number,
                'isPrime': is_prime
            }

            if not is_prime and divisor is not None:
                result['divisor'] = divisor

            return result
        except Exception as e:
            return {
                'success': False,
                'error': sanitize_error(e, 'math_operation')
            }


def main():
    """CLI interface"""
    if len(sys.argv) < 2:
        print("""
Math Tools - Available commands:
  calc <expression> [precision]            - Calculate expression
  stats <numbers> [measures...]            - Statistical analysis (JSON array or comma-separated)
  convert <number> <fromBase> <toBase>     - Convert number bases
  random [count] [min] [max] [decimals]    - Generate random numbers
  percent <value> <total> [precision]      - Calculate percentage
  fibonacci <n>                            - Generate Fibonacci sequence
  prime <number>                           - Check if number is prime

Examples:
  ./math_tools.py calc "2 + 2" 0
  ./math_tools.py stats "[10,20,30,40,50]" mean median
  ./math_tools.py convert FF 16 10
  ./math_tools.py random 5 1 100 0
  ./math_tools.py percent 75 100 2
  ./math_tools.py fibonacci 10
  ./math_tools.py prime 17
""")
        sys.exit(0)

    command = sys.argv[1]
    args = sys.argv[2:]

    commands = {
        'calc': lambda: MathTools.calculate(
            args[0],
            int(args[1]) if len(args) > 1 else 2
        ),
        'stats': lambda: MathTools.statistics_analysis(
            json.loads(args[0]) if args[0].startswith('[') else [float(x.strip()) for x in args[0].split(',')],
            args[1:] if len(args) > 1 else ['all']
        ),
        'convert': lambda: MathTools.convert_base(
            args[0],
            int(args[1]),
            int(args[2])
        ),
        'random': lambda: MathTools.random_numbers(
            int(args[0]) if len(args) > 0 else 1,
            float(args[1]) if len(args) > 1 else 0,
            float(args[2]) if len(args) > 2 else 100,
            int(args[3]) if len(args) > 3 else 0
        ),
        'percent': lambda: MathTools.percentage(
            float(args[0]),
            float(args[1]),
            int(args[2]) if len(args) > 2 else 2
        ),
        'fibonacci': lambda: MathTools.fibonacci(int(args[0])),
        'prime': lambda: MathTools.prime_check(int(args[0]))
    }

    if command in commands:
        result = commands[command]()
        print(json.dumps(result, indent=2))
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)


if __name__ == '__main__':
    main()
