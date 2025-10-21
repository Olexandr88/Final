#!/usr/bin/env python3
"""
Math and Statistics Tools - SECURITY FIXED VERSION
SECURITY FIX: Replaced eval() with AST-based math parser (Line 30 vulnerability)
"""

import sys
import json
import math
import random
import statistics
from typing import List, Dict, Any, Union
from functools import lru_cache
import ast
import operator

class SafeMathEvaluator:
    """
    SECURITY FIX: Safe mathematical expression evaluator
    Replaces eval() with AST parsing to prevent sandbox escape attacks
    
    PREVENTS: attribute access (__globals__), function definitions, imports
    ALLOWS: arithmetic operations, whitelisted math functions, constants
    """
    
    SAFE_OPERATORS = {
        ast.Add: operator.add, ast.Sub: operator.sub,
        ast.Mult: operator.mul, ast.Div: operator.truediv,
        ast.FloorDiv: operator.floordiv, ast.Mod: operator.mod,
        ast.Pow: operator.pow, ast.USub: operator.neg,
        ast.UAdd: operator.pos,
    }
    
    SAFE_FUNCTIONS = {
        'abs': abs, 'round': round, 'min': min, 'max': max,
        'pow': pow, 'sum': sum,
        'sqrt': math.sqrt, 'sin': math.sin, 'cos': math.cos,
        'tan': math.tan, 'log': math.log, 'exp': math.exp,
        'floor': math.floor, 'ceil': math.ceil,
    }
    
    SAFE_CONSTANTS = {
        'pi': math.pi, 'e': math.e,
    }
    
    @staticmethod
    def is_safe_expression(expr_str: str) -> bool:
        try:
            tree = ast.parse(expr_str, mode='eval')
            for node in ast.walk(tree):
                # Block dangerous constructs
                if isinstance(node, (ast.Import, ast.ImportFrom, ast.Attribute,
                                    ast.Lambda, ast.FunctionDef, ast.ClassDef)):
                    return False
            return True
        except:
            return False
    
    @staticmethod
    def evaluate(expr_str: str, precision: int = 2) -> float:
        if not SafeMathEvaluator.is_safe_expression(expr_str):
            raise ValueError("Expression contains unsafe operations")
        
        try:
            tree = ast.parse(expr_str, mode='eval')
            result = SafeMathEvaluator._eval_node(tree.body)
            
            if not isinstance(result, (int, float)):
                raise ValueError('Expression did not evaluate to a number')
            
            return round(result, precision)
        except Exception as e:
            raise ValueError(f"Invalid math expression: {e}")
    
    @staticmethod
    def _eval_node(node):
        if isinstance(node, ast.Constant):
            return node.value
        elif isinstance(node, ast.Num):
            return node.n
        elif isinstance(node, ast.Name):
            # Only allow safe constants
            if node.id in SafeMathEvaluator.SAFE_CONSTANTS:
                return SafeMathEvaluator.SAFE_CONSTANTS[node.id]
            raise NameError(f"Constant '{node.id}' not allowed")
        elif isinstance(node, ast.BinOp):
            left = SafeMathEvaluator._eval_node(node.left)
            right = SafeMathEvaluator._eval_node(node.right)
            op_func = SafeMathEvaluator.SAFE_OPERATORS.get(type(node.op))
            if not op_func:
                raise ValueError(f"Unsupported operator")
            return op_func(left, right)
        elif isinstance(node, ast.UnaryOp):
            operand = SafeMathEvaluator._eval_node(node.operand)
            op_func = SafeMathEvaluator.SAFE_OPERATORS.get(type(node.op))
            if not op_func:
                raise ValueError(f"Unsupported operator")
            return op_func(operand)
        elif isinstance(node, ast.Call):
            # Only allow whitelisted functions
            if isinstance(node.func, ast.Name) and node.func.id in SafeMathEvaluator.SAFE_FUNCTIONS:
                func = SafeMathEvaluator.SAFE_FUNCTIONS[node.func.id]
                args = [SafeMathEvaluator._eval_node(arg) for arg in node.args]
                return func(*args)
            raise ValueError("Function calls not allowed or function not whitelisted")
        else:
            raise ValueError(f"Unsupported expression type: {type(node).__name__}")


class MathTools:
    """Math and statistics utilities with performance optimizations"""

    @staticmethod
    def calculate(expression: str, precision: int = 2) -> Dict[str, Any]:
        """
        Safely evaluate mathematical expressions
        
        SECURITY FIX: Replaced eval() with SafeMathEvaluator
        Now uses AST parsing to prevent sandbox escape
        """
        try:
            evaluator = SafeMathEvaluator()
            result = evaluator.evaluate(expression, precision)

            return {
                'success': True,
                'expression': expression,
                'result': result,
                'rawResult': result
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
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
                'error': str(e)
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
                'error': str(e)
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
                'error': str(e)
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
                'error': str(e)
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
                'error': str(e)
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
                'error': str(e)
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
