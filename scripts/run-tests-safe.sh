#!/usr/bin/env bash

#############################################################################
# Safe Test Runner
# Runs tests sequentially with proper cleanup to avoid port conflicts
#############################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "================================================================================"
echo "Safe Test Runner - Sequential Execution with Cleanup"
echo "================================================================================"
echo

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Stats
TOTAL=0
PASSED=0
FAILED=0
SKIPPED=0

# Kill any hanging Node processes before starting
echo -e "${YELLOW}[Setup]${NC} Cleaning up any existing Node processes..."
taskkill //F //IM node.exe 2>/dev/null || true
sleep 2

# Find all test files
TEST_FILES=$(find "$PROJECT_ROOT/tests" -name "*.test.js" -type f | sort)
TOTAL=$(echo "$TEST_FILES" | wc -l)

echo -e "${GREEN}[Info]${NC} Found $TOTAL test files"
echo

# Run each test file individually
CURRENT=0
for TEST_FILE in $TEST_FILES; do
  CURRENT=$((CURRENT + 1))
  TEST_NAME=$(basename "$TEST_FILE")

  echo "--------------------------------------------------------------------------------"
  echo -e "${GREEN}[$CURRENT/$TOTAL]${NC} Running: $TEST_NAME"
  echo "--------------------------------------------------------------------------------"

  # Run test with timeout
  if timeout 60 npx cross-env NODE_OPTIONS=--experimental-vm-modules node --test "$TEST_FILE" 2>&1; then
    echo -e "${GREEN}✓${NC} $TEST_NAME passed"
    PASSED=$((PASSED + 1))
  else
    EXIT_CODE=$?
    if [ $EXIT_CODE -eq 124 ]; then
      echo -e "${RED}✗${NC} $TEST_NAME timed out (60s)"
    else
      echo -e "${RED}✗${NC} $TEST_NAME failed (exit code: $EXIT_CODE)"
    fi
    FAILED=$((FAILED + 1))
  fi

  # Cleanup between tests
  echo -e "${YELLOW}[Cleanup]${NC} Killing Node processes..."
  taskkill //F //IM node.exe 2>/dev/null || true
  sleep 1

  echo
done

echo "================================================================================"
echo "Test Summary"
echo "================================================================================"
echo -e "Total:   $TOTAL"
echo -e "${GREEN}Passed:  $PASSED${NC}"
echo -e "${RED}Failed:  $FAILED${NC}"
echo -e "${YELLOW}Skipped: $SKIPPED${NC}"
echo

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed${NC}"
  exit 1
fi
