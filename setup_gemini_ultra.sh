#!/bin/bash
# Gemini Ultra Integration Setup Script
# Automates the installation and configuration of Gemini Ultra for the Final project

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo "="
echo "  Gemini Ultra Integration Setup"
echo "  for scarmonit/Final Repository"
echo "="
echo ""

# Check Python version
print_info "Checking Python version..."
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
    print_success "Python $PYTHON_VERSION found"
else
    print_error "Python 3 is required but not found. Please install Python 3.8 or higher."
    exit 1
fi

# Check pip
print_info "Checking pip installation..."
if command -v pip3 &> /dev/null; then
    print_success "pip found"
else
    print_error "pip3 is required but not found. Please install pip."
    exit 1
fi

# Install dependencies
print_info "Installing Gemini Ultra dependencies..."
if [ -f "requirements_gemini_ultra.txt" ]; then
    pip3 install -r requirements_gemini_ultra.txt
    print_success "Dependencies installed successfully"
else
    print_error "requirements_gemini_ultra.txt not found in current directory"
    exit 1
fi

# Check for existing environment variables
print_info "Checking for existing API credentials..."
if [ -n "$GEMINI_API_KEY" ]; then
    print_success "GEMINI_API_KEY found in environment"
    API_CONFIGURED=true
elif [ -n "$GOOGLE_SERVICE_ACCOUNT_PATH" ]; then
    print_success "GOOGLE_SERVICE_ACCOUNT_PATH found in environment"
    if [ -f "$GOOGLE_SERVICE_ACCOUNT_PATH" ]; then
        print_success "Service account file exists"
        API_CONFIGURED=true
    else
        print_warning "Service account file not found at $GOOGLE_SERVICE_ACCOUNT_PATH"
        API_CONFIGURED=false
    fi
else
    print_warning "No API credentials found in environment"
    API_CONFIGURED=false
fi

# Offer to configure API key
if [ "$API_CONFIGURED" = false ]; then
    echo ""
    print_info "Would you like to configure your Gemini API key now? (y/n)"
    read -r CONFIGURE_NOW
    
    if [ "$CONFIGURE_NOW" = "y" ] || [ "$CONFIGURE_NOW" = "Y" ]; then
        echo ""
        print_info "Please enter your Gemini API key:"
        print_info "(Get your key from: https://makersuite.google.com/app/apikey)"
        read -r API_KEY
        
        # Add to .env file
        echo "GEMINI_API_KEY=$API_KEY" >> .env
        print_success "API key saved to .env file"
        print_info "Don't forget to add .env to your .gitignore!"
        
        # Check if .gitignore exists and add .env if not present
        if [ -f ".gitignore" ]; then
            if ! grep -q "^\.env$" .gitignore; then
                echo ".env" >> .gitignore
                print_success "Added .env to .gitignore"
            fi
        else
            echo ".env" > .gitignore
            print_success "Created .gitignore with .env entry"
        fi
        
        # Export for current session
        export GEMINI_API_KEY="$API_KEY"
        print_success "API key configured for current session"
    else
        print_warning "Skipping API configuration. You'll need to set GEMINI_API_KEY manually."
    fi
fi

# Verify installation
print_info "Verifying installation..."
if python3 -c "import google.generativeai; print('OK')" &> /dev/null; then
    print_success "Google Generative AI SDK installed correctly"
else
    print_error "Failed to import google.generativeai"
    exit 1
fi

if python3 -c "from gemini_ultra_config import GeminiUltraConfig; print('OK')" &> /dev/null; then
    print_success "Gemini Ultra config module loaded successfully"
else
    print_error "Failed to import gemini_ultra_config"
    exit 1
fi

# Create a test script
print_info "Creating test script..."
cat > test_gemini_ultra.py << 'EOF'
#!/usr/bin/env python3
import sys
from gemini_ultra_config import GeminiUltraConfig

def test_gemini_ultra():
    print("Testing Gemini Ultra configuration...")
    
    config = GeminiUltraConfig()
    if config.configure():
        print("✓ Gemini Ultra configured successfully!")
        
        # Try a simple test
        print("\nTesting content generation...")
        response = config.generate_content("Say 'Hello from Gemini Ultra!'")
        if response:
            print(f"\n✓ Test successful!\nResponse: {response}\n")
            return True
        else:
            print("✗ Failed to generate content")
            return False
    else:
        print("✗ Failed to configure Gemini Ultra")
        print("Please ensure your API key is set correctly.")
        return False

if __name__ == "__main__":
    success = test_gemini_ultra()
    sys.exit(0 if success else 1)
EOF

chmod +x test_gemini_ultra.py
print_success "Test script created: test_gemini_ultra.py"

# Summary
echo ""
echo "="
print_success "Gemini Ultra Integration Setup Complete!"
echo "="
echo ""
print_info "Next steps:"
echo "  1. Run the test script: python3 test_gemini_ultra.py"
echo "  2. Try the examples: python3 gemini_ultra_example.py"
echo "  3. Read the documentation: cat GEMINI_ULTRA_README.md"
echo "  4. Integrate into your code: import gemini_ultra_config"
echo ""

if [ "$API_CONFIGURED" = true ] || [ "$CONFIGURE_NOW" = "y" ] || [ "$CONFIGURE_NOW" = "Y" ]; then
    print_info "Would you like to run the test now? (y/n)"
    read -r RUN_TEST
    
    if [ "$RUN_TEST" = "y" ] || [ "$RUN_TEST" = "Y" ]; then
        echo ""
        print_info "Running test..."
        python3 test_gemini_ultra.py
    fi
fi

echo ""
print_success "Setup complete! Happy coding with Gemini Ultra! 🚀"
echo ""
