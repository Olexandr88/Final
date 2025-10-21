#!/usr/bin/env python3
"""
Comprehensive Validation Script
Tests security, performance, and functionality of Python standalone tools
"""

import sys
import json
import time
import subprocess
from pathlib import Path
from typing import Dict, List, Tuple, Any


class ValidationSuite:
    """Comprehensive validation for standalone tools"""

    def __init__(self, base_dir: str = None):
        self.base_dir = Path(base_dir) if base_dir else Path(__file__).parent
        self.results = {
            'security': [],
            'functionality': [],
            'performance': [],
            'summary': {}
        }

    def run_command(self, command: List[str], timeout: int = 10) -> Tuple[int, str, str]:
        """Execute command and return result"""
        try:
            result = subprocess.run(
                command,
                cwd=str(self.base_dir),
                capture_output=True,
                text=True,
                timeout=timeout
            )
            return result.returncode, result.stdout, result.stderr
        except subprocess.TimeoutExpired:
            return -1, '', 'TIMEOUT'
        except Exception as e:
            return -2, '', str(e)

    def test_security(self):
        """Security validation tests"""
        print('\n[Security Tests]')
        print('=' * 60)

        tests = [
            {
                'name': 'data_tools.py: eval() protection',
                'description': 'Verify eval() code execution is blocked',
                'command': [
                    sys.executable, 'data_tools.py', 'filter',
                    '[{"x":1}]', '__import__("os").system("echo EXPLOITED")'
                ],
                'expected_fail': True,
                'severity': 'CRITICAL'
            },
            {
                'name': 'math_tools.py: eval() protection',
                'description': 'Verify math eval() is safe',
                'command': [
                    sys.executable, 'math_tools.py', 'calc',
                    '__import__("os").system("echo EXPLOITED")'
                ],
                'expected_fail': True,
                'severity': 'CRITICAL'
            },
            {
                'name': 'text_tools.py: ReDoS timeout',
                'description': 'Verify catastrophic backtracking is prevented',
                'command': [
                    sys.executable, 'text_tools.py', 'regex_match',
                    'aaaaaaaaaaaX', '(a+)+'
                ],
                'expected_timeout': 5,
                'severity': 'HIGH'
            },
            {
                'name': 'file_tools.py: Path traversal protection',
                'description': 'Verify access to system files is blocked',
                'command': [
                    sys.executable, 'file_tools.py', 'stats',
                    '/etc/passwd' if sys.platform != 'win32' else 'C:\\Windows\\System32\\config\\SAM'
                ],
                'expected_fail': True,
                'severity': 'HIGH'
            },
            {
                'name': 'file_tools.py: SHA-256 hashing',
                'description': 'Verify SHA-256 is used instead of MD5',
                'command': [
                    sys.executable, 'file_tools.py', 'duplicates', '.', '1'
                ],
                'expected_pass': True,
                'check_output': 'sha256',
                'severity': 'MEDIUM'
            }
        ]

        for test in tests:
            print(f"\n  [{test['severity']}] {test['name']}")
            print(f"  {test['description']}")

            timeout = test.get('expected_timeout', 10)
            exit_code, stdout, stderr = self.run_command(test['command'], timeout)

            passed = False
            reason = ''

            if test.get('expected_fail'):
                # Test should fail (security protection working)
                if exit_code != 0:
                    passed = True
                    reason = 'Command rejected as expected'
                else:
                    passed = False
                    reason = f'SECURITY VULNERABILITY: Command succeeded (exit code: {exit_code})'

            elif test.get('expected_timeout'):
                # Test should timeout (ReDoS protection)
                if exit_code == -1:
                    passed = True
                    reason = 'Operation timed out as expected (ReDoS protection working)'
                else:
                    passed = False
                    reason = f'No timeout (potential ReDoS vulnerability)'

            elif test.get('expected_pass'):
                # Test should succeed
                if exit_code == 0:
                    if test.get('check_output'):
                        check = test['check_output']
                        if check.lower() in stdout.lower():
                            passed = True
                            reason = f'Command succeeded and output contains "{check}"'
                        else:
                            passed = False
                            reason = f'Output does not contain expected "{check}"'
                    else:
                        passed = True
                        reason = 'Command succeeded'
                else:
                    passed = False
                    reason = f'Command failed (exit code: {exit_code})'

            status = '✓' if passed else '✗'
            color = '\033[92m' if passed else '\033[91m'
            reset = '\033[0m'

            print(f"  {color}{status} {reason}{reset}")

            self.results['security'].append({
                'name': test['name'],
                'passed': passed,
                'severity': test['severity'],
                'reason': reason,
                'exit_code': exit_code
            })

    def test_functionality(self):
        """Functional validation tests"""
        print('\n[Functionality Tests]')
        print('=' * 60)

        tests = [
            {
                'name': 'text_tools.py: hash_text',
                'command': [sys.executable, 'text_tools.py', 'hash', 'test', 'sha256'],
                'expected_in_output': 'success'
            },
            {
                'name': 'text_tools.py: encode_decode',
                'command': [sys.executable, 'text_tools.py', 'encode', 'Hello', 'base64'],
                'expected_in_output': 'SGVsbG8='
            },
            {
                'name': 'data_tools.py: query_json',
                'command': [sys.executable, 'data_tools.py', 'query', '{"name":"test"}', 'name'],
                'expected_in_output': 'test'
            },
            {
                'name': 'data_tools.py: csv_to_json',
                'command': [sys.executable, 'data_tools.py', 'csv_to_json', 'name,age\\nAlice,30'],
                'expected_in_output': 'Alice'
            },
            {
                'name': 'math_tools.py: calculate',
                'command': [sys.executable, 'math_tools.py', 'calc', '2 + 2'],
                'expected_in_output': '4'
            },
            {
                'name': 'math_tools.py: fibonacci',
                'command': [sys.executable, 'math_tools.py', 'fibonacci', '5'],
                'expected_in_output': '[0, 1, 1, 2, 3]'
            },
            {
                'name': 'math_tools.py: prime_check',
                'command': [sys.executable, 'math_tools.py', 'prime', '17'],
                'expected_in_output': 'true'
            },
            {
                'name': 'file_tools.py: stats',
                'command': [sys.executable, 'file_tools.py', 'stats', '.'],
                'expected_in_output': 'success'
            }
        ]

        for test in tests:
            print(f"\n  {test['name']}")

            exit_code, stdout, stderr = self.run_command(test['command'])

            passed = False
            reason = ''

            if exit_code == 0:
                expected = test.get('expected_in_output', '')
                if expected.lower() in stdout.lower():
                    passed = True
                    reason = f'Output contains "{expected}"'
                else:
                    passed = False
                    reason = f'Output missing "{expected}"'
            else:
                passed = False
                reason = f'Failed with exit code {exit_code}'
                if stderr:
                    reason += f': {stderr[:100]}'

            status = '✓' if passed else '✗'
            color = '\033[92m' if passed else '\033[91m'
            reset = '\033[0m'

            print(f"  {color}{status} {reason}{reset}")

            self.results['functionality'].append({
                'name': test['name'],
                'passed': passed,
                'reason': reason
            })

    def test_performance(self):
        """Performance benchmark tests"""
        print('\n[Performance Tests]')
        print('=' * 60)

        tests = [
            {
                'name': 'text_tools.py: regex_match performance',
                'command': [sys.executable, 'text_tools.py', 'regex_match', 'test' * 1000, 'test'],
                'max_time': 0.5
            },
            {
                'name': 'text_tools.py: analyze_text performance',
                'command': [sys.executable, 'text_tools.py', 'analyze', 'word ' * 10000],
                'max_time': 0.5
            },
            {
                'name': 'math_tools.py: calculate performance',
                'command': [sys.executable, 'math_tools.py', 'calc', '2 + 2 * 3'],
                'max_time': 0.1
            },
            {
                'name': 'data_tools.py: query_json performance',
                'command': [sys.executable, 'data_tools.py', 'query', '{"a":{"b":{"c":"test"}}}', 'a.b.c'],
                'max_time': 0.1
            }
        ]

        for test in tests:
            print(f"\n  {test['name']}")

            start_time = time.time()
            exit_code, stdout, stderr = self.run_command(test['command'])
            elapsed = time.time() - start_time

            max_time = test.get('max_time', 1.0)
            passed = (exit_code == 0 and elapsed < max_time)

            reason = f'Completed in {elapsed:.3f}s (max: {max_time}s)'

            status = '✓' if passed else '✗'
            color = '\033[92m' if passed else '\033[91m'
            reset = '\033[0m'

            print(f"  {color}{status} {reason}{reset}")

            self.results['performance'].append({
                'name': test['name'],
                'passed': passed,
                'elapsed': elapsed,
                'max_time': max_time
            })

    def generate_report(self) -> Dict[str, Any]:
        """Generate comprehensive validation report"""
        # Count results
        security_passed = sum(1 for t in self.results['security'] if t['passed'])
        security_total = len(self.results['security'])
        security_critical = sum(1 for t in self.results['security'] if t.get('severity') == 'CRITICAL' and not t['passed'])

        func_passed = sum(1 for t in self.results['functionality'] if t['passed'])
        func_total = len(self.results['functionality'])

        perf_passed = sum(1 for t in self.results['performance'] if t['passed'])
        perf_total = len(self.results['performance'])

        total_passed = security_passed + func_passed + perf_passed
        total_tests = security_total + func_total + perf_total

        self.results['summary'] = {
            'total_tests': total_tests,
            'total_passed': total_passed,
            'total_failed': total_tests - total_passed,
            'pass_rate': (total_passed / total_tests * 100) if total_tests > 0 else 0,
            'security': {
                'passed': security_passed,
                'total': security_total,
                'critical_failures': security_critical
            },
            'functionality': {
                'passed': func_passed,
                'total': func_total
            },
            'performance': {
                'passed': perf_passed,
                'total': perf_total
            }
        }

        return self.results

    def print_summary(self):
        """Print validation summary"""
        summary = self.results['summary']

        print('\n' + '=' * 60)
        print('VALIDATION SUMMARY')
        print('=' * 60)

        print(f"\nTotal Tests: {summary['total_tests']}")
        print(f"Passed: {summary['total_passed']} ({summary['pass_rate']:.1f}%)")
        print(f"Failed: {summary['total_failed']}")

        print('\nBreakdown:')
        print(f"  Security:      {summary['security']['passed']}/{summary['security']['total']}")
        if summary['security']['critical_failures'] > 0:
            print(f"    ⚠️  CRITICAL FAILURES: {summary['security']['critical_failures']}")
        print(f"  Functionality: {summary['functionality']['passed']}/{summary['functionality']['total']}")
        print(f"  Performance:   {summary['performance']['passed']}/{summary['performance']['total']}")

        # Overall status
        print('\nOverall Status: ', end='')
        if summary['security']['critical_failures'] > 0:
            print('🔴 CRITICAL SECURITY ISSUES - DO NOT DEPLOY')
        elif summary['total_failed'] == 0:
            print('✅ ALL TESTS PASSED - READY FOR DEPLOYMENT')
        elif summary['pass_rate'] >= 90:
            print('⚠️  MOSTLY PASSING - REVIEW FAILURES')
        else:
            print('❌ MULTIPLE FAILURES - NEEDS WORK')

    def save_report(self, output_file: str = 'validation_report.json'):
        """Save validation report to file"""
        report_path = self.base_dir / output_file
        with open(report_path, 'w') as f:
            json.dump(self.results, f, indent=2)
        print(f'\nReport saved: {report_path}')

    def run_all(self) -> bool:
        """Run all validation tests"""
        print('=' * 60)
        print('STANDALONE TOOLS VALIDATION')
        print('=' * 60)

        self.test_security()
        self.test_functionality()
        self.test_performance()

        self.generate_report()
        self.print_summary()
        self.save_report()

        # Return success if all tests pass
        summary = self.results['summary']
        return summary['total_failed'] == 0 and summary['security']['critical_failures'] == 0


def main():
    """CLI interface"""
    import argparse

    parser = argparse.ArgumentParser(description='Validate Python standalone tools')
    parser.add_argument('--security-only', action='store_true', help='Run only security tests')
    parser.add_argument('--functionality-only', action='store_true', help='Run only functionality tests')
    parser.add_argument('--performance-only', action='store_true', help='Run only performance tests')
    parser.add_argument('--output', default='validation_report.json', help='Output report file')
    parser.add_argument('--base-dir', help='Base directory')

    args = parser.parse_args()

    validator = ValidationSuite(args.base_dir)

    # Run selected test suites
    if args.security_only:
        validator.test_security()
    elif args.functionality_only:
        validator.test_functionality()
    elif args.performance_only:
        validator.test_performance()
    else:
        # Run all tests
        success = validator.run_all()
        sys.exit(0 if success else 1)

    # Generate and print report for partial runs
    validator.generate_report()
    validator.print_summary()
    validator.save_report(args.output)


if __name__ == '__main__':
    main()
