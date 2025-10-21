#!/usr/bin/env python3
"""
Master Test Runner for Validation Suite
Executes all validation tests and generates comprehensive report
"""

import sys
import subprocess
import json
import time
from pathlib import Path
from datetime import datetime


class Color:
    """ANSI color codes for terminal output"""
    RESET = '\033[0m'
    BOLD = '\033[1m'
    RED = '\033[91m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    MAGENTA = '\033[95m'
    CYAN = '\033[96m'


class ValidationRunner:
    """Master test runner for validation suite"""

    def __init__(self):
        self.results = {
            'security': None,
            'performance': None,
            'regression': None,
            'overall': None
        }
        self.start_time = None
        self.end_time = None

    def print_header(self, text, color=Color.CYAN):
        """Print formatted header"""
        print(f"\n{color}{Color.BOLD}{'=' * 80}{Color.RESET}")
        print(f"{color}{Color.BOLD}{text.center(80)}{Color.RESET}")
        print(f"{color}{Color.BOLD}{'=' * 80}{Color.RESET}\n")

    def print_section(self, text, color=Color.BLUE):
        """Print formatted section"""
        print(f"\n{color}{Color.BOLD}{'-' * 80}{Color.RESET}")
        print(f"{color}{Color.BOLD}{text}{Color.RESET}")
        print(f"{color}{Color.BOLD}{'-' * 80}{Color.RESET}\n")

    def print_success(self, text):
        """Print success message"""
        print(f"{Color.GREEN}✓ {text}{Color.RESET}")

    def print_failure(self, text):
        """Print failure message"""
        print(f"{Color.RED}✗ {text}{Color.RESET}")

    def print_warning(self, text):
        """Print warning message"""
        print(f"{Color.YELLOW}⚠ {text}{Color.RESET}")

    def print_info(self, text):
        """Print info message"""
        print(f"{Color.BLUE}ℹ {text}{Color.RESET}")

    def run_test_suite(self, name, file_path, markers=None):
        """Run a specific test suite"""
        self.print_section(f"Running {name} Tests", Color.MAGENTA)

        cmd = [
            sys.executable, '-m', 'pytest',
            file_path,
            '-v',
            '--tb=short',
            '--color=yes',
            '-ra',  # Show all test results
        ]

        if markers:
            cmd.extend(['-m', markers])

        print(f"{Color.CYAN}Command: {' '.join(cmd)}{Color.RESET}\n")

        start = time.time()
        result = subprocess.run(cmd, capture_output=True, text=True)
        elapsed = time.time() - start

        # Parse output
        output = result.stdout + result.stderr
        passed = output.count(' PASSED')
        failed = output.count(' FAILED')
        errors = output.count(' ERROR')
        skipped = output.count(' SKIPPED')

        # Print results
        print(output)

        # Summary
        print(f"\n{Color.BOLD}Summary:{Color.RESET}")
        print(f"  Time: {elapsed:.2f}s")
        print(f"  Passed: {Color.GREEN}{passed}{Color.RESET}")
        print(f"  Failed: {Color.RED}{failed}{Color.RESET}")
        print(f"  Errors: {Color.RED}{errors}{Color.RESET}")
        print(f"  Skipped: {Color.YELLOW}{skipped}{Color.RESET}")

        success = result.returncode == 0

        return {
            'name': name,
            'success': success,
            'passed': passed,
            'failed': failed,
            'errors': errors,
            'skipped': skipped,
            'elapsed': elapsed,
            'return_code': result.returncode
        }

    def run_all_tests(self):
        """Run all validation test suites"""
        self.start_time = time.time()

        self.print_header("Python Standalone Tools - Validation Test Suite")
        self.print_info(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

        # Check pytest is installed
        try:
            subprocess.run([sys.executable, '-m', 'pytest', '--version'],
                         check=True, capture_output=True)
        except subprocess.CalledProcessError:
            self.print_failure("pytest is not installed!")
            self.print_info("Install with: pip install -r requirements-test.txt")
            sys.exit(1)

        # Run test suites
        test_dir = Path(__file__).parent

        # 1. Security Tests
        self.results['security'] = self.run_test_suite(
            'Security Validation',
            str(test_dir / 'test_security_fixes.py')
        )

        # 2. Performance Tests
        self.results['performance'] = self.run_test_suite(
            'Performance Benchmarks',
            str(test_dir / 'test_performance.py')
        )

        # 3. Regression Tests
        self.results['regression'] = self.run_test_suite(
            'Regression & Compatibility',
            str(test_dir / 'test_regression.py')
        )

        self.end_time = time.time()

        # Generate final report
        self.generate_report()

    def generate_report(self):
        """Generate comprehensive validation report"""
        self.print_header("Validation Test Report", Color.CYAN)

        total_elapsed = self.end_time - self.start_time

        # Calculate totals
        total_passed = sum(r['passed'] for r in self.results.values() if r)
        total_failed = sum(r['failed'] for r in self.results.values() if r)
        total_errors = sum(r['errors'] for r in self.results.values() if r)
        total_skipped = sum(r['skipped'] for r in self.results.values() if r)
        total_tests = total_passed + total_failed + total_errors

        # Print summary table
        print(f"\n{Color.BOLD}Test Suite Results:{Color.RESET}\n")
        print(f"{'Suite':<30} {'Status':<12} {'Passed':<8} {'Failed':<8} {'Errors':<8} {'Time':<8}")
        print('-' * 80)

        for key, result in self.results.items():
            if result:
                status = f"{Color.GREEN}PASS{Color.RESET}" if result['success'] else f"{Color.RED}FAIL{Color.RESET}"
                print(f"{result['name']:<30} {status:<20} "
                      f"{result['passed']:<8} {result['failed']:<8} "
                      f"{result['errors']:<8} {result['elapsed']:.2f}s")

        print('-' * 80)

        # Overall status
        all_passed = all(r['success'] for r in self.results.values() if r)

        print(f"\n{Color.BOLD}Overall Results:{Color.RESET}")
        print(f"  Total Tests: {total_tests}")
        print(f"  Passed: {Color.GREEN}{total_passed}{Color.RESET}")
        print(f"  Failed: {Color.RED}{total_failed}{Color.RESET}")
        print(f"  Errors: {Color.RED}{total_errors}{Color.RESET}")
        print(f"  Skipped: {Color.YELLOW}{total_skipped}{Color.RESET}")
        print(f"  Total Time: {total_elapsed:.2f}s")

        print(f"\n{Color.BOLD}Status: ", end='')
        if all_passed:
            print(f"{Color.GREEN}✓ ALL TESTS PASSED{Color.RESET}")
        else:
            print(f"{Color.RED}✗ SOME TESTS FAILED{Color.RESET}")

        # Pass/Fail Criteria
        self.print_section("Pass/Fail Criteria", Color.YELLOW)

        criteria = [
            {
                'name': 'Security Tests',
                'required': True,
                'passed': self.results['security']['success'] if self.results['security'] else False,
                'reason': 'Critical security vulnerabilities must be fixed'
            },
            {
                'name': 'Performance Tests',
                'required': False,
                'passed': self.results['performance']['success'] if self.results['performance'] else False,
                'reason': 'Performance optimizations should be validated'
            },
            {
                'name': 'Regression Tests',
                'required': True,
                'passed': self.results['regression']['success'] if self.results['regression'] else False,
                'reason': 'Existing functionality must not break'
            },
        ]

        print(f"{'Criterion':<30} {'Required':<12} {'Status':<12} {'Reason'}")
        print('-' * 100)

        critical_failures = []
        for criterion in criteria:
            required = 'YES' if criterion['required'] else 'NO'
            status = f"{Color.GREEN}PASS{Color.RESET}" if criterion['passed'] else f"{Color.RED}FAIL{Color.RESET}"

            print(f"{criterion['name']:<30} {required:<12} {status:<20} {criterion['reason']}")

            if criterion['required'] and not criterion['passed']:
                critical_failures.append(criterion['name'])

        print('-' * 100)

        # Final verdict
        self.print_section("Final Verdict", Color.BOLD)

        if not critical_failures:
            self.print_success("All critical tests passed!")
            self.print_info("The security fixes and optimizations are validated.")
            return_code = 0
        else:
            self.print_failure(f"Critical failures in: {', '.join(critical_failures)}")
            self.print_warning("Fix critical issues before deployment.")
            return_code = 1

        # Save report to file
        self.save_report()

        sys.exit(return_code)

    def save_report(self):
        """Save detailed report to file"""
        report_dir = Path(__file__).parent / 'reports'
        report_dir.mkdir(exist_ok=True)

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        report_file = report_dir / f'validation_report_{timestamp}.json'

        report_data = {
            'timestamp': datetime.now().isoformat(),
            'duration': self.end_time - self.start_time,
            'results': self.results,
            'summary': {
                'total_passed': sum(r['passed'] for r in self.results.values() if r),
                'total_failed': sum(r['failed'] for r in self.results.values() if r),
                'total_errors': sum(r['errors'] for r in self.results.values() if r),
                'total_skipped': sum(r['skipped'] for r in self.results.values() if r),
                'all_passed': all(r['success'] for r in self.results.values() if r)
            }
        }

        with open(report_file, 'w') as f:
            json.dump(report_data, f, indent=2)

        self.print_info(f"Detailed report saved to: {report_file}")


def main():
    """Main entry point"""
    runner = ValidationRunner()

    # Check for arguments
    if len(sys.argv) > 1:
        suite = sys.argv[1]
        test_dir = Path(__file__).parent

        if suite == 'security':
            result = runner.run_test_suite('Security', str(test_dir / 'test_security_fixes.py'))
            sys.exit(0 if result['success'] else 1)
        elif suite == 'performance':
            result = runner.run_test_suite('Performance', str(test_dir / 'test_performance.py'))
            sys.exit(0 if result['success'] else 1)
        elif suite == 'regression':
            result = runner.run_test_suite('Regression', str(test_dir / 'test_regression.py'))
            sys.exit(0 if result['success'] else 1)
        else:
            print(f"Unknown suite: {suite}")
            print("Available suites: security, performance, regression")
            sys.exit(1)
    else:
        # Run all tests
        runner.run_all_tests()


if __name__ == '__main__':
    main()
