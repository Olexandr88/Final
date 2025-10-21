#!/usr/bin/env python3
"""Gemini Ultra Example Usage Script

This script demonstrates various use cases for the Gemini Ultra integration.
Run this script to test your Gemini Ultra setup and see examples of different
functionality.
"""

import os
import sys
import concurrent.futures
from typing import List, Dict
from gemini_ultra_config import GeminiUltraConfig

def print_section(title: str):
    """Print a formatted section header."""
    print("\n" + "="*60)
    print(f"  {title}")
    print("="*60 + "\n")

def example_basic_generation():
    """Demonstrate basic content generation."""
    print_section("Example 1: Basic Content Generation")
    
    config = GeminiUltraConfig()
    if not config.configure():
        print("Error: Failed to configure Gemini Ultra")
        return
    
    prompt = "Explain the concept of parallel computing in 3 sentences."
    print(f"Prompt: {prompt}\n")
    
    response = config.generate_content(prompt)
    if response:
        print(f"Response:\n{response}")
    else:
        print("Failed to generate content")

def example_code_generation():
    """Demonstrate code generation capabilities."""
    print_section("Example 2: Code Generation")
    
    config = GeminiUltraConfig()
    if not config.configure():
        print("Error: Failed to configure Gemini Ultra")
        return
    
    prompt = """Write a Python function that implements a binary search algorithm.
    Include docstring and type hints."""
    print(f"Prompt: {prompt}\n")
    
    response = config.generate_content(prompt)
    if response:
        print(f"Generated Code:\n{response}")
    else:
        print("Failed to generate code")

def example_creative_writing():
    """Demonstrate creative content generation."""
    print_section("Example 3: Creative Writing")
    
    config = GeminiUltraConfig()
    if not config.configure():
        print("Error: Failed to configure Gemini Ultra")
        return
    
    prompt = "Write a haiku about artificial intelligence and human creativity."
    print(f"Prompt: {prompt}\n")
    
    response = config.generate_content(prompt)
    if response:
        print(f"Haiku:\n{response}")
    else:
        print("Failed to generate haiku")

def example_data_analysis():
    """Demonstrate data analysis capabilities."""
    print_section("Example 4: Data Analysis")
    
    config = GeminiUltraConfig()
    if not config.configure():
        print("Error: Failed to configure Gemini Ultra")
        return
    
    data = {
        "sales": [100, 150, 200, 175, 300],
        "months": ["Jan", "Feb", "Mar", "Apr", "May"]
    }
    
    prompt = f"""Analyze this sales data and provide insights:
    Sales: {data['sales']}
    Months: {data['months']}
    
    Provide: 1) Trend analysis, 2) Best performing month, 3) Recommendations"""
    print(f"Data: {data}\n")
    
    response = config.generate_content(prompt)
    if response:
        print(f"Analysis:\n{response}")
    else:
        print("Failed to analyze data")

def example_problem_solving():
    """Demonstrate problem-solving capabilities."""
    print_section("Example 5: Problem Solving")
    
    config = GeminiUltraConfig()
    if not config.configure():
        print("Error: Failed to configure Gemini Ultra")
        return
    
    prompt = """Problem: A system needs to process 1 million API requests per day with
    high reliability. What architecture patterns and technologies would you recommend?
    Provide a brief solution outline."""
    print(f"Prompt: {prompt}\n")
    
    response = config.generate_content(prompt)
    if response:
        print(f"Solution:\n{response}")
    else:
        print("Failed to solve problem")

def example_parallel_operations():
    """Demonstrate parallel/batch operations concept."""
    print_section("Example 6: Parallel Operations Concept")

    config = GeminiUltraConfig()
    if not config.configure():
        print("Error: Failed to configure Gemini Ultra")
        return

    prompts = [
        "Define machine learning in one sentence.",
        "What is cloud computing?",
        "Explain API in simple terms."
    ]

    print("Processing multiple prompts in parallel:\n")

    def process_prompt(prompt):
        """Helper function to process a single prompt."""
        return config.generate_content(prompt)

    with concurrent.futures.ThreadPoolExecutor() as executor:
        responses = list(executor.map(process_prompt, prompts))

    for i, (prompt, response) in enumerate(zip(prompts, responses), 1):
        print(f"Query {i}: {prompt}")
        if response:
            print(f"Response: {response}\n")
        else:
            print(f"Failed to process query {i}\n")

def check_environment():
    """Check if environment is properly configured."""
    print_section("Environment Check")
    
    api_key = os.getenv('GEMINI_API_KEY')
    service_account = os.getenv('GOOGLE_SERVICE_ACCOUNT_PATH')
    
    if api_key:
        print("✓ GEMINI_API_KEY found in environment")
    elif service_account:
        print("✓ GOOGLE_SERVICE_ACCOUNT_PATH found in environment")
        if os.path.exists(service_account):
            print("✓ Service account file exists")
        else:
            print("✗ Service account file not found at specified path")
    else:
        print("✗ No authentication credentials found")
        print("\nPlease set one of:")
        print("  export GEMINI_API_KEY='your-api-key'")
        print("  export GOOGLE_SERVICE_ACCOUNT_PATH='/path/to/credentials.json'")
        return False
    
    return True

def main():
    """Main function to run all examples."""
    print("\n" + "#"*60)
    print("#" + " "*58 + "#")
    print("#" + "  Gemini Ultra Integration - Example Usage".center(58) + "#")
    print("#" + " "*58 + "#")
    print("#"*60)
    
    # Check environment
    if not check_environment():
        print("\nExiting: Please configure authentication first.")
        sys.exit(1)
    
    # Run examples
    examples = [
        example_basic_generation,
        example_code_generation,
        example_creative_writing,
        example_data_analysis,
        example_problem_solving,
        example_parallel_operations
    ]
    
    print("\nRunning examples... (this may take a few moments)\n")
    
    for example in examples:
        try:
            example()
        except Exception as e:
            print(f"\nError running example: {e}\n")
            continue
    
    print_section("Examples Complete")
    print("All examples have been executed.")
    print("\nFor more information, see GEMINI_ULTRA_README.md")
    print("To integrate into your own code, import from gemini_ultra_config.py\n")

if __name__ == "__main__":
    main()
