#!/bin/bash
# Install vibe coding system globally

echo "Installing Vibe Coding System globally..."

# Create global bin directory if needed
mkdir -p ~/.local/bin

# Copy tools
cp src/vibe-coding-system.js ~/.local/bin/vibe-init
cp src/anti-pattern-detector.js ~/.local/bin/vibe-detect
cp src/workflow-orchestrator.js ~/.local/bin/vibe-workflow

# Make executable
chmod +x ~/.local/bin/vibe-*

# Copy global CLAUDE.md
cp CLAUDE.md ~/.claude/CLAUDE.md

echo "✓ Installed!"
echo ""
echo "Available commands:"
echo "  vibe-init      - Initialize vibe coding environment"
echo "  vibe-detect    - Detect anti-patterns"
echo "  vibe-workflow  - Run workflow orchestrator"
echo ""
echo "Global CLAUDE.md installed to ~/.claude/CLAUDE.md"
echo "This will apply to all Claude Code sessions"
