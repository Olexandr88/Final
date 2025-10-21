# Makefile for Standalone Tools Test Suite
# Provides convenient commands for testing, coverage, and validation

.PHONY: help install test test-fast test-verbose test-coverage test-security test-performance clean validate

# Default target
help:
	@echo "Standalone Tools - Test Suite Commands"
	@echo "========================================"
	@echo ""
	@echo "Setup:"
	@echo "  make install          Install test dependencies"
	@echo "  make validate         Validate test environment"
	@echo ""
	@echo "Testing:"
	@echo "  make test             Run all tests"
	@echo "  make test-fast        Run tests (skip slow tests)"
	@echo "  make test-verbose     Run tests with verbose output"
	@echo "  make test-parallel    Run tests in parallel"
	@echo ""
	@echo "Coverage:"
	@echo "  make test-coverage    Run tests with coverage report"
	@echo "  make coverage-html    Generate HTML coverage report"
	@echo "  make coverage-report  View coverage report"
	@echo ""
	@echo "Specialized Tests:"
	@echo "  make test-security    Run only security tests"
	@echo "  make test-performance Run only performance tests"
	@echo "  make test-unit        Run only unit tests"
	@echo "  make test-integration Run only integration tests"
	@echo ""
	@echo "Individual Modules:"
	@echo "  make test-text        Test text_tools only"
	@echo "  make test-data        Test data_tools only"
	@echo "  make test-file        Test file_tools only"
	@echo "  make test-math        Test math_tools only"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean            Clean test artifacts"
	@echo "  make clean-all        Clean everything"

# Installation
install:
	@echo "Installing test dependencies..."
	pip install -r tests/requirements-test.txt

# Validation
validate:
	@echo "Validating test environment..."
	python tests/validate_setup.py

# Basic testing
test:
	pytest

test-fast:
	pytest -m "not slow"

test-verbose:
	pytest -vv

test-parallel:
	pytest -n auto

# Coverage
test-coverage:
	pytest --cov=. --cov-report=html --cov-report=term-missing

coverage-html:
	pytest --cov=. --cov-report=html
	@echo "Coverage report: htmlcov/index.html"

coverage-report: coverage-html
	@echo "Opening coverage report..."
	@python -c "import webbrowser; webbrowser.open('htmlcov/index.html')"

# Specialized tests
test-security:
	pytest -m security -v

test-performance:
	pytest -m performance -v

test-unit:
	pytest -m unit -v

test-integration:
	pytest -m integration -v

# Individual module tests
test-text:
	pytest tests/test_text_tools.py -v

test-data:
	pytest tests/test_data_tools.py -v

test-file:
	pytest tests/test_file_tools.py -v

test-math:
	pytest tests/test_math_tools.py -v

# Cleaning
clean:
	@echo "Cleaning test artifacts..."
	rm -rf .pytest_cache
	rm -rf htmlcov
	rm -rf .coverage
	rm -rf tests/__pycache__
	rm -rf tests/.pytest_cache
	rm -f tests/report.html
	rm -f tests/report.json
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true

clean-all: clean
	@echo "Cleaning all generated files..."
	rm -rf venv
	rm -rf .venv
	rm -rf *.egg-info

# Quick commands
quick: test-fast

full: clean test-coverage

check: validate test-fast

# CI/CD simulation
ci: clean validate test-coverage
	@echo "CI pipeline complete!"

# Development workflow
dev: clean validate test-fast
	@echo "Development check complete!"
