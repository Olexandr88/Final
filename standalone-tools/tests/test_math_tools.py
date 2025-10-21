"""
Comprehensive test suite for math_tools.py
Tests cover: calculations, statistics, number theory, edge cases, security
"""

import pytest
import sys
import math
import statistics
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from math_tools import MathTools


class TestCalculate:
    """Tests for calculate function"""

    def test_basic_arithmetic(self):
        """Test basic arithmetic operations"""
        result = MathTools.calculate("2 + 2", 0)
        assert result['success'] is True
        assert result['result'] == 4

    def test_multiplication_division(self):
        """Test multiplication and division"""
        result = MathTools.calculate("10 * 5 / 2", 1)
        assert result['success'] is True
        assert result['result'] == 25.0

    def test_parentheses(self):
        """Test expression with parentheses"""
        result = MathTools.calculate("(2 + 3) * 4", 0)
        assert result['success'] is True
        assert result['result'] == 20

    def test_power_operation(self):
        """Test power operation"""
        result = MathTools.calculate("pow(2, 8)", 0)
        assert result['success'] is True
        assert result['result'] == 256

    def test_sqrt_function(self):
        """Test square root"""
        result = MathTools.calculate("sqrt(16)", 0)
        assert result['success'] is True
        assert result['result'] == 4

    def test_trigonometric_functions(self):
        """Test trigonometric functions"""
        result = MathTools.calculate("sin(0)", 2)
        assert result['success'] is True
        assert result['result'] == 0.0

    def test_pi_constant(self):
        """Test using pi constant"""
        result = MathTools.calculate("pi * 2", 2)
        assert result['success'] is True
        assert abs(result['result'] - 6.28) < 0.01

    def test_e_constant(self):
        """Test using e constant"""
        result = MathTools.calculate("e", 2)
        assert result['success'] is True
        assert abs(result['result'] - 2.72) < 0.01

    def test_precision_control(self):
        """Test precision parameter"""
        result = MathTools.calculate("10 / 3", 2)
        assert result['success'] is True
        assert result['result'] == 3.33

        result = MathTools.calculate("10 / 3", 5)
        assert result['success'] is True
        assert result['result'] == 3.33333

    def test_min_max_functions(self):
        """Test min and max functions"""
        result = MathTools.calculate("max(10, 20, 5)", 0)
        assert result['success'] is True
        assert result['result'] == 20

        result = MathTools.calculate("min(10, 20, 5)", 0)
        assert result['success'] is True
        assert result['result'] == 5

    def test_abs_function(self):
        """Test absolute value"""
        result = MathTools.calculate("abs(-42)", 0)
        assert result['success'] is True
        assert result['result'] == 42

    def test_round_function(self):
        """Test rounding"""
        result = MathTools.calculate("round(3.7)", 0)
        assert result['success'] is True
        assert result['result'] == 4

    def test_sum_function(self):
        """Test sum function"""
        result = MathTools.calculate("sum([1, 2, 3, 4, 5])", 0)
        assert result['success'] is True
        assert result['result'] == 15

    def test_complex_expression(self):
        """Test complex mathematical expression"""
        expr = "sqrt(pow(3, 2) + pow(4, 2))"  # Pythagorean theorem
        result = MathTools.calculate(expr, 0)
        assert result['success'] is True
        assert result['result'] == 5

    def test_division_by_zero(self):
        """Test division by zero handling"""
        result = MathTools.calculate("10 / 0", 0)
        assert result['success'] is False
        assert 'error' in result

    def test_invalid_expression(self):
        """Test invalid mathematical expression"""
        result = MathTools.calculate("2 +* 3", 0)
        assert result['success'] is False

    def test_invalid_function(self):
        """Test using invalid function"""
        result = MathTools.calculate("invalid_func(10)", 0)
        assert result['success'] is False

    @pytest.mark.security
    def test_blocked_imports(self):
        """Test that imports are blocked"""
        result = MathTools.calculate("__import__('os').system('ls')", 0)
        assert result['success'] is False

    @pytest.mark.security
    def test_blocked_builtins(self):
        """Test that dangerous builtins are blocked"""
        result = MathTools.calculate("eval('1+1')", 0)
        assert result['success'] is False

    @pytest.mark.parametrize("expr,expected", [
        ("1 + 1", 2),
        ("10 - 5", 5),
        ("6 * 7", 42),
        ("100 / 4", 25),
        ("2 ** 10", 1024),
    ])
    def test_various_operations(self, expr, expected):
        """Parameterized test for various operations"""
        result = MathTools.calculate(expr, 0)
        assert result['success'] is True
        assert result['result'] == expected


class TestStatisticsAnalysis:
    """Tests for statistics_analysis function"""

    def test_mean_calculation(self, sample_numbers):
        """Test calculating mean"""
        result = MathTools.statistics_analysis(sample_numbers, ['mean'])
        assert result['success'] is True
        assert result['measures']['mean'] == 55.0

    def test_median_calculation(self, sample_numbers):
        """Test calculating median"""
        result = MathTools.statistics_analysis(sample_numbers, ['median'])
        assert result['success'] is True
        assert result['measures']['median'] == 55.0

    def test_mode_calculation(self):
        """Test calculating mode"""
        data = [1, 2, 2, 3, 3, 3, 4]
        result = MathTools.statistics_analysis(data, ['mode'])
        assert result['success'] is True
        assert result['measures']['mode'] == 3

    def test_mode_no_unique_mode(self, sample_numbers):
        """Test mode when no unique mode exists"""
        result = MathTools.statistics_analysis(sample_numbers, ['mode'])
        assert result['success'] is True
        # When no mode, should be None or handle gracefully

    def test_min_max(self, sample_numbers):
        """Test min and max"""
        result = MathTools.statistics_analysis(sample_numbers, ['min', 'max'])
        assert result['success'] is True
        assert result['measures']['min'] == 10
        assert result['measures']['max'] == 100

    def test_range(self, sample_numbers):
        """Test range calculation"""
        result = MathTools.statistics_analysis(sample_numbers, ['range'])
        assert result['success'] is True
        assert result['measures']['range'] == 90

    def test_sum(self, sample_numbers):
        """Test sum calculation"""
        result = MathTools.statistics_analysis(sample_numbers, ['sum'])
        assert result['success'] is True
        assert result['measures']['sum'] == 550

    def test_variance(self, sample_numbers):
        """Test variance calculation"""
        result = MathTools.statistics_analysis(sample_numbers, ['variance'])
        assert result['success'] is True
        assert result['measures']['variance'] > 0

    def test_standard_deviation(self, sample_numbers):
        """Test standard deviation calculation"""
        result = MathTools.statistics_analysis(sample_numbers, ['stddev'])
        assert result['success'] is True
        assert result['measures']['standardDeviation'] > 0

    def test_quartiles(self, sample_numbers):
        """Test quartile calculation"""
        result = MathTools.statistics_analysis(sample_numbers, ['quartiles'])
        assert result['success'] is True
        assert 'quartiles' in result['measures']
        assert 'q1' in result['measures']['quartiles']
        assert 'q2' in result['measures']['quartiles']
        assert 'q3' in result['measures']['quartiles']

    def test_all_measures(self, sample_numbers):
        """Test calculating all measures at once"""
        result = MathTools.statistics_analysis(sample_numbers, ['all'])
        assert result['success'] is True
        assert 'mean' in result['measures']
        assert 'median' in result['measures']
        assert 'min' in result['measures']
        assert 'max' in result['measures']
        assert 'variance' in result['measures']
        assert 'standardDeviation' in result['measures']
        assert 'count' in result['measures']

    def test_count_included(self, sample_numbers):
        """Test that count is always included"""
        result = MathTools.statistics_analysis(sample_numbers, ['mean'])
        assert result['success'] is True
        assert result['measures']['count'] == 10

    def test_empty_data(self):
        """Test with empty data"""
        result = MathTools.statistics_analysis([], ['mean'])
        assert result['success'] is False
        assert 'error' in result

    def test_single_value(self):
        """Test with single value"""
        result = MathTools.statistics_analysis([42], ['all'])
        assert result['success'] is True
        assert result['measures']['mean'] == 42
        assert result['measures']['median'] == 42

    def test_variance_single_value(self):
        """Test variance with single value"""
        result = MathTools.statistics_analysis([42], ['variance'])
        assert result['success'] is True
        assert result['measures']['variance'] == 0

    def test_negative_numbers(self):
        """Test statistics with negative numbers"""
        data = [-10, -5, 0, 5, 10]
        result = MathTools.statistics_analysis(data, ['mean', 'median'])
        assert result['success'] is True
        assert result['measures']['mean'] == 0
        assert result['measures']['median'] == 0

    def test_float_numbers(self):
        """Test statistics with floating point numbers"""
        data = [1.5, 2.7, 3.2, 4.8, 5.1]
        result = MathTools.statistics_analysis(data, ['mean'])
        assert result['success'] is True
        assert abs(result['measures']['mean'] - 3.46) < 0.01

    @pytest.mark.performance
    @pytest.mark.slow
    def test_large_dataset(self, mock_large_dataset, performance_thresholds):
        """Test statistics on large dataset"""
        import time
        start = time.time()
        result = MathTools.statistics_analysis(mock_large_dataset, ['all'])
        duration = time.time() - start

        assert result['success'] is True
        assert duration < performance_thresholds['medium_operation']


class TestConvertBase:
    """Tests for convert_base function"""

    def test_decimal_to_binary(self):
        """Test converting decimal to binary"""
        result = MathTools.convert_base("10", 10, 2)
        assert result['success'] is True
        assert result['result'] == "1010"

    def test_binary_to_decimal(self):
        """Test converting binary to decimal"""
        result = MathTools.convert_base("1010", 2, 10)
        assert result['success'] is True
        assert result['result'] == "10"

    def test_decimal_to_hex(self):
        """Test converting decimal to hexadecimal"""
        result = MathTools.convert_base("255", 10, 16)
        assert result['success'] is True
        assert result['result'] == "ff"

    def test_hex_to_decimal(self):
        """Test converting hexadecimal to decimal"""
        result = MathTools.convert_base("FF", 16, 10)
        assert result['success'] is True
        assert result['result'] == "255"

    def test_decimal_to_octal(self):
        """Test converting decimal to octal"""
        result = MathTools.convert_base("64", 10, 8)
        assert result['success'] is True
        assert result['result'] == "100"

    def test_octal_to_decimal(self):
        """Test converting octal to decimal"""
        result = MathTools.convert_base("100", 8, 10)
        assert result['success'] is True
        assert result['result'] == "64"

    def test_binary_to_hex(self):
        """Test converting binary to hex (via decimal)"""
        # First to decimal, then to hex
        result1 = MathTools.convert_base("11111111", 2, 10)
        result2 = MathTools.convert_base(result1['result'], 10, 16)
        assert result2['result'] == "ff"

    def test_invalid_from_base(self):
        """Test with invalid source base"""
        result = MathTools.convert_base("123", 99, 10)
        assert result['success'] is False
        assert 'error' in result

    def test_invalid_to_base(self):
        """Test with invalid target base"""
        result = MathTools.convert_base("123", 10, 99)
        assert result['success'] is False

    def test_invalid_number_for_base(self):
        """Test with number invalid for given base"""
        result = MathTools.convert_base("8", 8, 10)  # 8 doesn't exist in octal
        assert result['success'] is False

    @pytest.mark.parametrize("number,from_base,to_base,expected", [
        ("42", 10, 2, "101010"),
        ("1A", 16, 10, "26"),
        ("77", 8, 10, "63"),
        ("0", 10, 2, "0"),
    ])
    def test_various_conversions(self, number, from_base, to_base, expected):
        """Parameterized test for various base conversions"""
        result = MathTools.convert_base(number, from_base, to_base)
        assert result['success'] is True
        assert result['result'] == expected


class TestRandomNumbers:
    """Tests for random_numbers function"""

    def test_single_random_number(self):
        """Test generating single random number"""
        result = MathTools.random_numbers(1, 0, 100, 0)
        assert result['success'] is True
        assert result['count'] == 1
        assert 0 <= result['results'][0] <= 100

    def test_multiple_random_numbers(self):
        """Test generating multiple random numbers"""
        result = MathTools.random_numbers(10, 0, 100, 0)
        assert result['success'] is True
        assert result['count'] == 10
        assert all(0 <= n <= 100 for n in result['results'])

    def test_random_float_numbers(self):
        """Test generating random floats"""
        result = MathTools.random_numbers(5, 0, 10, 2)
        assert result['success'] is True
        assert all(isinstance(n, float) for n in result['results'])

    def test_random_integers(self):
        """Test generating random integers"""
        result = MathTools.random_numbers(5, 0, 10, 0)
        assert result['success'] is True
        assert all(isinstance(n, int) for n in result['results'])

    def test_unique_random_numbers(self):
        """Test generating unique random numbers"""
        result = MathTools.random_numbers(5, 1, 10, 0, True)
        assert result['success'] is True
        assert len(set(result['results'])) == 5  # All unique

    def test_unique_impossible(self):
        """Test unique generation when impossible"""
        result = MathTools.random_numbers(100, 1, 10, 0, True)
        assert result['success'] is False  # Can't generate 100 unique numbers in range 1-10

    def test_custom_range(self):
        """Test custom min/max range"""
        result = MathTools.random_numbers(10, 50, 60, 0)
        assert result['success'] is True
        assert all(50 <= n <= 60 for n in result['results'])

    def test_negative_range(self):
        """Test generating numbers in negative range"""
        result = MathTools.random_numbers(5, -10, -1, 0)
        assert result['success'] is True
        assert all(-10 <= n <= -1 for n in result['results'])

    def test_decimal_precision(self):
        """Test decimal precision control"""
        result = MathTools.random_numbers(5, 0, 1, 3)
        assert result['success'] is True
        for n in result['results']:
            # Check decimal places (allowing for floating point precision)
            assert len(str(n).split('.')[1]) <= 3 if '.' in str(n) else True

    def test_default_parameters(self):
        """Test with default parameters"""
        result = MathTools.random_numbers()
        assert result['success'] is True
        assert result['count'] == 1
        assert 0 <= result['results'][0] <= 100


class TestPercentage:
    """Tests for percentage function"""

    def test_basic_percentage(self):
        """Test basic percentage calculation"""
        result = MathTools.percentage(50, 100, 2)
        assert result['success'] is True
        assert result['percentage'] == 50.0
        assert result['formatted'] == "50.0%"

    def test_percentage_greater_than_100(self):
        """Test percentage greater than 100%"""
        result = MathTools.percentage(150, 100, 2)
        assert result['success'] is True
        assert result['percentage'] == 150.0

    def test_percentage_less_than_1(self):
        """Test small percentage"""
        result = MathTools.percentage(1, 1000, 2)
        assert result['success'] is True
        assert result['percentage'] == 0.1

    def test_percentage_zero_value(self):
        """Test percentage of zero"""
        result = MathTools.percentage(0, 100, 2)
        assert result['success'] is True
        assert result['percentage'] == 0.0

    def test_percentage_division_by_zero(self):
        """Test division by zero"""
        result = MathTools.percentage(50, 0, 2)
        assert result['success'] is False
        assert 'error' in result

    def test_percentage_precision(self):
        """Test precision control"""
        result = MathTools.percentage(1, 3, 2)
        assert result['success'] is True
        assert result['percentage'] == 33.33

        result = MathTools.percentage(1, 3, 5)
        assert result['success'] is True
        assert result['percentage'] == 33.33333

    def test_percentage_negative_values(self):
        """Test with negative values"""
        result = MathTools.percentage(-50, 100, 2)
        assert result['success'] is True
        assert result['percentage'] == -50.0

    @pytest.mark.parametrize("value,total,expected", [
        (25, 100, 25.0),
        (75, 200, 37.5),
        (3, 4, 75.0),
        (1, 8, 12.5),
    ])
    def test_various_percentages(self, value, total, expected):
        """Parameterized test for various percentages"""
        result = MathTools.percentage(value, total, 2)
        assert result['success'] is True
        assert abs(result['percentage'] - expected) < 0.01


class TestFibonacci:
    """Tests for fibonacci function"""

    def test_fibonacci_sequence(self):
        """Test generating Fibonacci sequence"""
        result = MathTools.fibonacci(10)
        assert result['success'] is True
        assert result['count'] == 10
        assert result['sequence'] == [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]

    def test_fibonacci_first_number(self):
        """Test first Fibonacci number"""
        result = MathTools.fibonacci(1)
        assert result['success'] is True
        assert result['sequence'] == [0]

    def test_fibonacci_first_two(self):
        """Test first two Fibonacci numbers"""
        result = MathTools.fibonacci(2)
        assert result['success'] is True
        assert result['sequence'] == [0, 1]

    def test_fibonacci_last_value(self):
        """Test that last value is included"""
        result = MathTools.fibonacci(10)
        assert result['success'] is True
        assert result['last'] == 34

    def test_fibonacci_large_sequence(self):
        """Test generating large Fibonacci sequence"""
        result = MathTools.fibonacci(20)
        assert result['success'] is True
        assert result['count'] == 20
        assert result['last'] == 4181

    def test_fibonacci_zero_or_negative(self):
        """Test invalid input"""
        result = MathTools.fibonacci(0)
        assert result['success'] is False

        result = MathTools.fibonacci(-5)
        assert result['success'] is False

    @pytest.mark.performance
    def test_fibonacci_performance(self, performance_thresholds):
        """Test Fibonacci generation performance"""
        import time
        start = time.time()
        result = MathTools.fibonacci(1000)
        duration = time.time() - start

        assert result['success'] is True
        assert duration < performance_thresholds['medium_operation']


class TestPrimeCheck:
    """Tests for prime_check function"""

    def test_prime_number(self):
        """Test checking prime numbers"""
        primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29]
        for prime in primes:
            result = MathTools.prime_check(prime)
            assert result['success'] is True
            assert result['isPrime'] is True

    def test_non_prime_number(self):
        """Test checking non-prime numbers"""
        non_primes = [4, 6, 8, 9, 10, 12, 14, 15, 16, 18]
        for num in non_primes:
            result = MathTools.prime_check(num)
            assert result['success'] is True
            assert result['isPrime'] is False

    def test_prime_two(self):
        """Test that 2 is prime"""
        result = MathTools.prime_check(2)
        assert result['success'] is True
        assert result['isPrime'] is True

    def test_one_not_prime(self):
        """Test that 1 is not prime"""
        result = MathTools.prime_check(1)
        assert result['success'] is True
        assert result['isPrime'] is False

    def test_zero_not_prime(self):
        """Test that 0 is not prime"""
        result = MathTools.prime_check(0)
        assert result['success'] is True
        assert result['isPrime'] is False

    def test_negative_not_prime(self):
        """Test that negative numbers are not prime"""
        result = MathTools.prime_check(-7)
        assert result['success'] is True
        assert result['isPrime'] is False

    def test_large_prime(self):
        """Test large prime number"""
        result = MathTools.prime_check(97)
        assert result['success'] is True
        assert result['isPrime'] is True

    def test_large_non_prime(self):
        """Test large non-prime number"""
        result = MathTools.prime_check(100)
        assert result['success'] is True
        assert result['isPrime'] is False

    def test_divisor_reported(self):
        """Test that divisor is reported for non-primes"""
        result = MathTools.prime_check(15)
        assert result['success'] is True
        assert result['isPrime'] is False
        assert 'divisor' in result
        assert 15 % result['divisor'] == 0

    @pytest.mark.parametrize("number,expected", [
        (2, True),
        (3, True),
        (4, False),
        (17, True),
        (18, False),
        (97, True),
        (100, False),
    ])
    def test_various_prime_checks(self, number, expected):
        """Parameterized test for prime checking"""
        result = MathTools.prime_check(number)
        assert result['success'] is True
        assert result['isPrime'] == expected

    @pytest.mark.performance
    def test_prime_check_performance(self, performance_thresholds):
        """Test prime checking performance"""
        import time
        start = time.time()
        result = MathTools.prime_check(1000000)
        duration = time.time() - start

        assert result['success'] is True
        assert duration < performance_thresholds['small_operation']


class TestIntegration:
    """Integration tests combining multiple operations"""

    def test_calculate_and_statistics_workflow(self):
        """Test calculation then statistics"""
        # Generate Fibonacci sequence
        fib_result = MathTools.fibonacci(10)
        assert fib_result['success'] is True

        # Calculate statistics on Fibonacci numbers
        stats_result = MathTools.statistics_analysis(fib_result['sequence'], ['all'])
        assert stats_result['success'] is True
        assert stats_result['measures']['mean'] > 0

    def test_random_and_statistics_workflow(self):
        """Test generating random numbers then analyzing"""
        # Generate random numbers
        rand_result = MathTools.random_numbers(100, 1, 100, 0)
        assert rand_result['success'] is True

        # Analyze statistics
        stats_result = MathTools.statistics_analysis(rand_result['results'], ['all'])
        assert stats_result['success'] is True

    def test_prime_sequence_analysis(self):
        """Test finding and analyzing prime numbers"""
        primes = []
        for i in range(2, 50):
            result = MathTools.prime_check(i)
            if result['isPrime']:
                primes.append(i)

        # Analyze prime distribution
        stats = MathTools.statistics_analysis(primes, ['all'])
        assert stats['success'] is True
        assert stats['measures']['count'] > 10

    def test_percentage_calculations(self):
        """Test percentage calculations"""
        data = [25, 50, 75, 100]

        for value in data:
            pct = MathTools.percentage(value, 100, 0)
            assert pct['success'] is True
            assert pct['percentage'] == value


@pytest.mark.performance
class TestPerformance:
    """Performance tests for math operations"""

    @pytest.mark.slow
    def test_complex_calculation_performance(self, performance_thresholds):
        """Test performance of complex calculations"""
        import time
        expr = "sum([sqrt(pow(i, 2)) for i in range(1000)])"

        start = time.time()
        result = MathTools.calculate(expr, 2)
        duration = time.time() - start

        assert result['success'] is True
        assert duration < performance_thresholds['medium_operation']

    @pytest.mark.slow
    def test_large_fibonacci_generation(self, performance_thresholds):
        """Test generating large Fibonacci sequence"""
        import time
        start = time.time()
        result = MathTools.fibonacci(10000)
        duration = time.time() - start

        assert result['success'] is True
        assert duration < performance_thresholds['large_operation']

    @pytest.mark.slow
    def test_many_prime_checks(self, performance_thresholds):
        """Test checking many numbers for primality"""
        import time
        start = time.time()

        prime_count = 0
        for i in range(2, 1000):
            result = MathTools.prime_check(i)
            if result['isPrime']:
                prime_count += 1

        duration = time.time() - start
        assert prime_count > 100
        assert duration < performance_thresholds['medium_operation']


@pytest.mark.security
class TestSecurity:
    """Security-focused tests"""

    def test_calculation_code_injection(self):
        """Test protection against code injection in calculations"""
        malicious = "__import__('os').system('echo hacked')"
        result = MathTools.calculate(malicious, 0)
        assert result['success'] is False

    def test_calculation_file_access(self):
        """Test that file operations are blocked"""
        malicious = "open('/etc/passwd').read()"
        result = MathTools.calculate(malicious, 0)
        assert result['success'] is False

    def test_extremely_large_calculations(self):
        """Test handling extremely large numbers"""
        result = MathTools.calculate("pow(10, 1000)", 0)
        # Should handle gracefully without crashing

    def test_division_by_zero_safety(self):
        """Test safe handling of division by zero"""
        result = MathTools.calculate("1 / 0", 0)
        assert result['success'] is False

    def test_negative_sqrt(self):
        """Test handling negative square root"""
        result = MathTools.calculate("sqrt(-1)", 0)
        assert result['success'] is False


class TestEdgeCases:
    """Edge case tests"""

    def test_very_small_numbers(self):
        """Test with very small numbers"""
        data = [0.00001, 0.00002, 0.00003]
        result = MathTools.statistics_analysis(data, ['mean'])
        assert result['success'] is True

    def test_very_large_numbers(self):
        """Test with very large numbers"""
        data = [1e10, 2e10, 3e10]
        result = MathTools.statistics_analysis(data, ['mean'])
        assert result['success'] is True

    def test_mixed_positive_negative(self):
        """Test statistics with mixed signs"""
        data = [-100, -50, 0, 50, 100]
        result = MathTools.statistics_analysis(data, ['all'])
        assert result['success'] is True
        assert result['measures']['mean'] == 0

    def test_all_zeros(self):
        """Test statistics on all zeros"""
        data = [0, 0, 0, 0, 0]
        result = MathTools.statistics_analysis(data, ['all'])
        assert result['success'] is True
        assert result['measures']['mean'] == 0
        assert result['measures']['variance'] == 0

    def test_single_large_outlier(self):
        """Test statistics with outlier"""
        data = [1, 2, 3, 4, 1000]
        result = MathTools.statistics_analysis(data, ['mean', 'median'])
        assert result['success'] is True
        # Mean should be affected by outlier, median should not
        assert result['measures']['mean'] > result['measures']['median']

    def test_floating_point_precision(self):
        """Test floating point precision issues"""
        result = MathTools.calculate("0.1 + 0.2", 10)
        assert result['success'] is True
        # Should handle floating point arithmetic

    def test_unicode_in_expression(self):
        """Test handling unicode in expressions"""
        result = MathTools.calculate("π * 2", 2)
        # Should fail gracefully with invalid characters
        assert result['success'] is False
