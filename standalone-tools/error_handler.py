#!/usr/bin/env python3
"""Error Handler - Security module for sanitizing errors"""
import os
import re
from typing import Dict, Any

class SecureErrorHandler:
    _PATH_PATTERN = re.compile(r'(?:[A-Za-z]:\|/)[^\s]+')
    DEBUG_MODE = os.environ.get('DEBUG', 'false').lower() == 'true'
    
    @staticmethod
    def sanitize_error(error: Exception, context: str = None) -> str:
        if SecureErrorHandler.DEBUG_MODE:
            return str(error)
        error_msg = SecureErrorHandler._PATH_PATTERN.sub('***', str(error))
        if context:
            error_msg = f'{context}: {error_msg}'
        return error_msg
    
    @staticmethod
    def format_response_error(error: Exception, operation: str) -> Dict[str, Any]:
        return {
            'success': False,
            'error': SecureErrorHandler.sanitize_error(error, operation),
            'operation': operation
        }
