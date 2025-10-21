"""Gemini Ultra API Configuration and Integration

This module provides configuration and utilities for integrating Google's Gemini Ultra
model into the Final project. It supports both API key-based authentication and
Google Cloud service account authentication.
"""

import os
from typing import Optional, Dict, Any
import google.generativeai as genai
from google.oauth2 import service_account

class GeminiUltraConfig:
    """Configuration manager for Gemini Ultra integration."""
    
    def __init__(self, api_key: Optional[str] = None, service_account_path: Optional[str] = None):
        """Initialize Gemini Ultra configuration.
        
        Args:
            api_key: Google AI API key for Gemini Ultra access
            service_account_path: Path to Google Cloud service account JSON file
        """
        self.api_key = api_key or os.getenv('GEMINI_API_KEY')
        self.service_account_path = service_account_path or os.getenv('GOOGLE_SERVICE_ACCOUNT_PATH')
        self.model_name = 'gemini-ultra'
        self.client = None
        
    def configure(self) -> bool:
        """Configure the Gemini Ultra client.
        
        Returns:
            bool: True if configuration successful, False otherwise
        """
        try:
            if self.api_key:
                genai.configure(api_key=self.api_key)
                self.client = genai.GenerativeModel(self.model_name)
                return True
            elif self.service_account_path:
                credentials = service_account.Credentials.from_service_account_file(
                    self.service_account_path
                )
                genai.configure(credentials=credentials)
                self.client = genai.GenerativeModel(self.model_name)
                return True
            else:
                print("Error: No API key or service account provided")
                return False
        except Exception as e:
            print(f"Configuration error: {e}")
            return False
    
    def generate_content(self, prompt: str, **kwargs) -> Optional[str]:
        """Generate content using Gemini Ultra.
        
        Args:
            prompt: The prompt to send to Gemini Ultra
            **kwargs: Additional generation parameters
            
        Returns:
            Optional[str]: Generated content or None if error
        """
        if not self.client:
            if not self.configure():
                return None
        
        try:
            response = self.client.generate_content(prompt, **kwargs)
            return response.text
        except Exception as e:
            print(f"Generation error: {e}")
            return None

# Example usage
if __name__ == "__main__":
    # Initialize with API key from environment
    config = GeminiUltraConfig()
    
    if config.configure():
        print("Gemini Ultra configured successfully!")
        
        # Test generation
        result = config.generate_content("Hello, Gemini Ultra!")
        if result:
            print(f"Response: {result}")
    else:
        print("Failed to configure Gemini Ultra")
