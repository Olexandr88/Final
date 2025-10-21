#!/bin/bash
# Quick Test Script - 30-Second Smoke Test
# Tests each tool with basic operations and security checks

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0

echo "======================================================================"
echo "QUICK SMOKE TEST - Python Standalone Tools"
echo "======================================================================"
echo ""

# Helper function to run test
run_test() {
    local name="$1"
    local command="$2"
    local expected="$3"
    local should_fail="$4"

    echo -n "Testing $name... "

    if [ "$should_fail" == "fail" ]; then
        # Test should fail (security protection)
        if output=$(eval "$command" 2>&1); then
            echo -e "${RED}✗ SECURITY ISSUE (command succeeded when it should fail)${NC}"
            FAILED=$((FAILED + 1))
            return 1
        else
            echo -e "${GREEN}✓ (correctly blocked)${NC}"
            PASSED=$((PASSED + 1))
            return 0
        fi
    else
        # Test should succeed
        if output=$(eval "$command" 2>&1); then
            if [[ "$output" == *"$expected"* ]]; then
                echo -e "${GREEN}✓${NC}"
                PASSED=$((PASSED + 1))
                return 0
            else
                echo -e "${RED}✗ (unexpected output)${NC}"
                echo "  Expected: $expected"
                echo "  Got: ${output:0:100}"
                FAILED=$((FAILED + 1))
                return 1
            fi
        else
            echo -e "${RED}✗ (command failed)${NC}"
            echo "  Error: ${output:0:100}"
            FAILED=$((FAILED + 1))
            return 1
        fi
    fi
}

echo "[Text Tools]"
echo "----------------------------------------------------------------------"
run_test "hash_text" "python3 text_tools.py hash 'test' sha256" "success"
run_test "encode base64" "python3 text_tools.py encode 'Hello' base64" "SGVsbG8="
run_test "decode base64" "python3 text_tools.py decode 'SGVsbG8=' base64" "Hello"
run_test "analyze text" "python3 text_tools.py analyze 'hello world' words" "2"
run_test "extract URLs" "python3 text_tools.py extract_urls 'Visit https://example.com'" "example.com"
echo ""

echo "[Data Tools]"
echo "----------------------------------------------------------------------"
run_test "query JSON" "python3 data_tools.py query '{\"name\":\"Alice\"}' name" "Alice"
run_test "CSV to JSON" "python3 data_tools.py csv_to_json 'name,age\\nAlice,30'" "Alice"
run_test "transform JSON" "python3 data_tools.py transform '{\"a\":1}' pretty" "\"a\": 1"
run_test "filter JSON (safe)" "python3 data_tools.py filter '[{\"age\":30}]' 'age>25'" "success"
run_test "filter JSON (unsafe)" "python3 data_tools.py filter '[{\"x\":1}]' '__import__(\"os\").system(\"echo pwned\")'" "" "fail"
echo ""

echo "[Math Tools]"
echo "----------------------------------------------------------------------"
run_test "calculate" "python3 math_tools.py calc '2 + 2 * 3'" "8"
run_test "fibonacci" "python3 math_tools.py fibonacci 5" "[0, 1, 1, 2, 3]"
run_test "prime check" "python3 math_tools.py prime 17" "true"
run_test "percentage" "python3 math_tools.py percent 75 100" "75"
run_test "calc (unsafe)" "python3 math_tools.py calc '__import__(\"os\").system(\"echo pwned\")'" "" "fail"
echo ""

echo "[File Tools]"
echo "----------------------------------------------------------------------"
run_test "stats (current dir)" "python3 file_tools.py stats ." "success"
run_test "list directory" "python3 file_tools.py list . name" "success"
run_test "filetype" "python3 file_tools.py filetype text_tools.py" "Python Script"

# Path traversal test (OS-specific)
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    run_test "path traversal (Windows)" "python3 file_tools.py stats 'C:\\Windows\\System32\\config\\SAM'" "" "fail"
else
    run_test "path traversal (Linux)" "python3 file_tools.py stats /etc/passwd" "" "fail"
fi
echo ""

echo "======================================================================"
echo "SUMMARY"
echo "======================================================================"
echo -e "Total Tests: $((PASSED + FAILED))"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ ALL TESTS PASSED - Tools are working correctly${NC}"
    echo ""
    exit 0
else
    echo -e "${RED}❌ SOME TESTS FAILED - Review failures above${NC}"
    echo ""
    exit 1
fi
