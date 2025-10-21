#!/usr/bin/env python3
"""Input Validators - Security module for DoS protection"""
import json
from typing import Any, Dict, Union

class InputValidator:
    MAX_JSON_SIZE = 1024 * 1024  # 1MB
    MAX_TEXT_SIZE = 10 * 1024 * 1024  # 10MB
    
    @staticmethod
    def validate_json(json_data: Union[str, bytes], max_size: int = None) -> Dict[str, Any]:
        if max_size is None:
            max_size = InputValidator.MAX_JSON_SIZE
        try:
            data_bytes = json_data.encode('utf-8') if isinstance(json_data, str) else json_data
            if len(data_bytes) > max_size:
                return {'valid': False, 'error': f'Input too large: {len(data_bytes)} bytes'}
            parsed = json.loads(json_data if isinstance(json_data, str) else json_data.decode('utf-8'))
            return {'valid': True, 'data': parsed}
        except Exception as e:
            return {'valid': False, 'error': str(e)}
    
    @staticmethod
    def validate_text(text: str, max_size: int = None) -> Dict[str, Any]:
        if max_size is None:
            max_size = InputValidator.MAX_TEXT_SIZE
        try:
            if len(text.encode('utf-8')) > max_size:
                return {'valid': False, 'error': f'Text too large'}
            return {'valid': True}
        except Exception as e:
            return {'valid': False, 'error': str(e)}
