#!/bin/bash
# Setup cron job for nightly auto-improvement

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🔧 Setting up auto-improvement cron job"
echo ""
echo "This will run nightly at 2 AM to:"
echo "  1. Re-verify low-confidence claims"
echo "  2. Generate SFT training data"
echo "  3. Fine-tune model (when 500+ claims ready)"
echo "  4. Auto-promote new model"
echo ""

# Create cron entry
CRON_ENTRY="0 2 * * * cd $PROJECT_DIR && bash auto-improve.sh >> logs/cron.log 2>&1"

echo "Cron entry:"
echo "  $CRON_ENTRY"
echo ""

read -p "Add this cron job? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Add to crontab
    (crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -

    echo "✅ Cron job added!"
    echo ""
    echo "To verify:"
    echo "  crontab -l"
    echo ""
    echo "To remove:"
    echo "  crontab -e"
    echo "  (delete the line containing auto-improve.sh)"
    echo ""
    echo "Manual run:"
    echo "  bash auto-improve.sh"
else
    echo "❌ Skipped cron setup"
    echo ""
    echo "Manual setup:"
    echo "  sudo crontab -e"
    echo "  Add: $CRON_ENTRY"
fi
