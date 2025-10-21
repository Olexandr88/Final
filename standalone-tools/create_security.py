#!/usr/bin/env python
"""Helper script to create security modules"""

# Will create the security modules programmatically
print("Creating security modules...")

validators_content = """#!/usr/bin/env python3
# validators.py - Input validation with size limits
import json
from typing import Any, List, Union

class InputValidator:
    MAX_JSON_SIZE = 1 * 1024 * 1024
    MAX_TEXT_SIZE = 10 * 1024 * 1024
    MAX_FILE_SIZE = 100 * 1024 * 1024
    MAX_ARRAY_LENGTH = 100000
    
    @staticmethod
    def validate_json_input(json_data: str, max_size: int = None, required_type: type = None) -> Any:
        if max_size is None:
            max_size = InputValidator.MAX_JSON_SIZE
        if isinstance(json_data, str):
            data_size = len(json_data.encode('utf-8'))
        else:
            return json_data
        if data_size > max_size:
            raise ValueError(f"JSON input too large: {data_size} bytes (max: {max_size})")
        try:
            parsed = json.loads(json_data)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON: {str(e)}")
        if required_type and not isinstance(parsed, required_type):
            raise ValueError(f"Expected {required_type.__name__}, got {type(parsed).__name__}")
        return parsed
    
    @staticmethod
    def validate_text_input(text: str, max_size: int = None, name: str = "text") -> str:
        if max_size is None:
            max_size = InputValidator.MAX_TEXT_SIZE
        if not isinstance(text, str):
            raise ValueError(f"{name} must be string, got {type(text).__name__}")
        text_size = len(text.encode('utf-8'))
        if text_size > max_size:
            raise ValueError(f"{name} too large: {text_size} bytes (max: {max_size})")
        return text
    
    @staticmethod
    def validate_array_input(data: List[Any], max_length: int = None, name: str = "array") -> List[Any]:
        if max_length is None:
            max_length = InputValidator.MAX_ARRAY_LENGTH
        if not isinstance(data, list):
            raise ValueError(f"{name} must be list, got {type(data).__name__}")
        if len(data) > max_length:
            raise ValueError(f"{name} too large: {len(data)} items (max: {max_length})")
        if len(data) == 0:
            raise ValueError(f"{name} cannot be empty")
        return data
    
    @staticmethod
    def validate_number_input(value: Any, min_value: float = None, max_value: float = None, allow_float: bool = True, name: str = "number") -> Union[int, float]:
        if not isinstance(value, (int, float)):
            try:
                value = float(value) if allow_float else int(value)
            except (ValueError, TypeError):
                raise ValueError(f"{name} must be number")
        if not allow_float and isinstance(value, float):
            if value != int(value):
                raise ValueError(f"{name} must be integer")
            value = int(value)
        if min_value is not None and value < min_value:
            raise ValueError(f"{name} too small: {value} (min: {min_value})")
        if max_value is not None and value > max_value:
            raise ValueError(f"{name} too large: {value} (max: {max_value})")
        return value

def validate_json(json_data: str, max_size: int = None, required_type: type = None) -> Any:
    return InputValidator.validate_json_input(json_data, max_size, required_type)

def validate_text(text: str, max_size: int = None) -> str:
    return InputValidator.validate_text_input(text, max_size)

def validate_number(value: Any, min_value: float = None, max_value: float = None) -> Union[int, float]:
    return InputValidator.validate_number_input(value, min_value, max_value)
"""

error_handler_content = """#!/usr/bin/env python3
# error_handler.py - Secure error sanitization
import os
import re
from typing import Optional

class SecureErrorHandler:
    DEBUG_MODE = os.environ.get('DEBUG', '').lower() in ('1', 'true', 'yes')
    PATH_PATTERNS = [
        r'[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]*',
        r'/(?:[^/\s]+/)+[^/\s]*',
        r'File "([^"]+)"',
        r'line \d+, in .+',
    ]
    
    @staticmethod
    def sanitize_error(error: Exception, context: Optional[str] = None, show_type: bool = True) -> str:
        error_message = str(error)
        error_type = type(error).__name__
        
        if SecureErrorHandler.DEBUG_MODE:
            parts = []
            if context:
                parts.append(f"Context: {context}")
            parts.append(f"Error: {error_type}: {error_message}")
            return " ".join(parts)
        
        sanitized = SecureErrorHandler._remove_sensitive_info(error_message)
        parts = []
        if show_type:
            parts.append(f"{error_type}:")
        if context:
            parts.append(f"[{context}]")
        parts.append(sanitized)
        return " ".join(parts)
    
    @staticmethod
    def _remove_sensitive_info(message: str) -> str:
        sanitized = message
        for pattern in SecureErrorHandler.PATH_PATTERNS:
            sanitized = re.sub(pattern, '***', sanitized)
        sensitive_patterns = [
            (r'password["\']?\s*[:=]\s*["\']?([^"\'\s]+)', 'password=***'),
            (r'api[_-]?key["\']?\s*[:=]\s*["\']?([^"\'\s]+)', 'api_key=***'),
            (r'token["\']?\s*[:=]\s*["\']?([^"\'\s]+)', 'token=***'),
            (r'secret["\']?\s*[:=]\s*["\']?([^"\'\s]+)', 'secret=***'),
        ]
        for pattern, replacement in sensitive_patterns:
            sanitized = re.sub(pattern, replacement, sanitized, flags=re.IGNORECASE)
        return sanitized
    
    @staticmethod
    def format_response_error(error: Exception, operation: str) -> dict:
        return {
            'success': False,
            'error': SecureErrorHandler.sanitize_error(error, operation, show_type=True)
        }

def sanitize_error(error: Exception, context: str = None) -> str:
    return SecureErrorHandler.sanitize_error(error, context)
"""

with open('validators.py', 'w') as f:
    f.write(validators_content)

with open('error_handler.py', 'w') as f:
    f.write(error_handler_content)

print("Created validators.py")
print("Created error_handler.py")
