#!/usr/bin/env python3
"""Security validation tests for all fixes"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from data_tools import DataTools
from math_tools import MathTools
from file_tools import FileTools
from text_tools import TextTools

class TestDataToolsSecurity:
    """Test data_tools.py security fixes"""
    
    def test_safe_filter_works(self):
        """Legitimate filters should work"""
        result = DataTools.filter_json('[{"age":30},{"age":25}]', 'age>27')
        assert result['success'] == True
        assert result['filteredCount'] == 1
    
    def test_code_injection_blocked(self):
        """Code injection attempts should be blocked"""
        result = DataTools.filter_json('[{"x":1}]', '__import__("os")')
        assert result['success'] == False
        assert 'Invalid filter expression' in result['error']

class TestMathToolsSecurity:
    """Test math_tools.py security fixes"""
    
    def test_safe_calculation_works(self):
        """Math operations should work"""
        result = MathTools.calculate('2 + 2')
        assert result['success'] == True
        assert result['result'] == 4
    
    def test_exec_blocked(self):
        """exec() should be blocked"""
        result = MathTools.calculate('exec("print(1)")')
        assert result['success'] == False
        assert 'not allowed' in result['error'].lower()
    
    def test_import_blocked(self):
        """__import__() should be blocked"""
        result = MathTools.calculate('__import__("os")')
        assert result['success'] == False

class TestFileToolsSecurity:
    """Test file_tools.py security fixes"""
    
    def test_path_traversal_blocked(self):
        """Path traversal should be blocked"""
        result = FileTools.get_stats('/etc/passwd')
        assert result['success'] == False
        assert 'Access denied' in result['error']
    
    def test_sha256_used(self):
        """SHA-256 should be default"""
        # Check source code
        import inspect
        source = inspect.getsource(FileTools._hash_file_chunked)
        assert 'sha256' in source

class TestTextToolsSecurity:
    """Test text_tools.py security fixes"""
    
    def test_redos_pattern_blocked(self):
        """Dangerous ReDoS patterns should be blocked"""
        result = TextTools.regex_match('test', '(a+)+')
        assert result['success'] == False
        assert 'dangerous' in result['error'].lower()
    
    def test_safe_pattern_works(self):
        """Safe patterns should work"""
        result = TextTools.regex_match('test123', r'\d+')
        assert result['success'] == True
        assert result['count'] > 0

if __name__ == '__main__':
    pytest.main([__file__, '-v'])
