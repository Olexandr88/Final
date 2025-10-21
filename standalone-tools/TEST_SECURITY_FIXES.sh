#!/bin/bash
# Security Fix Verification Tests

echo "==============================================="
echo "SECURITY FIX VERIFICATION TESTS"
echo "==============================================="
echo ""

echo "[1/8] Testing data_tools_FIXED.py - Valid filter..."
python data_tools_FIXED.py filter '[{"age":30},{"age":25}]' "age > 26" 2>&1 | grep -q '"success": true' && echo "✓ PASS" || echo "✗ FAIL"

echo ""
echo "[2/8] Testing data_tools_FIXED.py - Block eval injection..."
python data_tools_FIXED.py filter '[{"age":30}]' "__import__('os').system('whoami')" 2>&1 | grep -q '"filteredCount": 0' && echo "✓ PASS (injection blocked)" || echo "✗ FAIL"

echo ""
echo "[3/8] Testing math_tools_FIXED.py - Valid calculation..."
python math_tools_FIXED.py calc "sqrt(16) + 3" 2>&1 | grep -q '"result": 7.0' && echo "✓ PASS" || echo "✗ FAIL"

echo ""
echo "[4/8] Testing math_tools_FIXED.py - Block attribute access..."
python math_tools_FIXED.py calc "sqrt.__globals__" 2>&1 | grep -q "unsafe operations" && echo "✓ PASS (attribute access blocked)" || echo "✗ FAIL"

echo ""
echo "[5/8] Testing math_tools_FIXED.py - Complex expression..."
python math_tools_FIXED.py calc "sin(pi/2) + cos(0)" 2>&1 | grep -q '"success": true' && echo "✓ PASS" || echo "✗ FAIL"

echo ""
echo "[6/8] Testing file_tools_FIXED.py - Valid file stats..."
python file_tools_FIXED.py stats "data_tools_FIXED.py" 2>&1 | grep -q '"success": true' && echo "✓ PASS" || echo "✗ FAIL"

echo ""
echo "[7/8] Testing text_tools_FIXED.py - Valid regex..."
python text_tools_FIXED.py regex_match "test@example.com" "[a-z]+@[a-z]+\.[a-z]+" 2>&1 | grep -q '"success": true' && echo "✓ PASS" || echo "✗ FAIL"

echo ""
echo "[8/8] Testing text_tools_FIXED.py - Block dangerous regex..."
python text_tools_FIXED.py regex_match "aaa" "(a+)+" 2>&1 | grep -q "dangerous" && echo "✓ PASS (ReDoS blocked)" || echo "✗ FAIL"

echo ""
echo "==============================================="
echo "ALL SECURITY TESTS COMPLETE"
echo "==============================================="
