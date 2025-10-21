#!/usr/bin/env bash

# Quick LLM System Health Check
# Simplified version for Windows Git Bash

echo "================================================================================"
echo "LLM Quick Health Check - $(date '+%Y-%m-%d %H:%M:%S')"
echo "================================================================================"
echo

# 1. Node Processes
echo "[1] Node.js Processes Running:"
pgrep -a node 2>/dev/null | wc -l || echo "0"
echo

# 2. AI Bridge Ports
echo "[2] AI Bridge Port Check:"
nc -zv localhost 65028 2>&1 | grep -q succeeded && echo "✓ WebSocket (65028) - UP" || echo "✗ WebSocket (65028) - DOWN"
nc -zv localhost 65029 2>&1 | grep -q succeeded && echo "✓ HTTP (65029) - UP" || echo "✗ HTTP (65029) - DOWN"
echo

# 3. Network Stats
echo "[3] Network Connections:"
netstat -an 2>/dev/null | grep ESTABLISHED | wc -l | awk '{print "Active connections: " $1}'
echo

# 4. Disk Usage (top 5 dirs)
echo "[4] Disk Usage (top 5 directories):"
du -sh */ 2>/dev/null | sort -hr | head -5
echo

# 5. Recent Errors
echo "[5] Recent Errors in Logs:"
if [ -d "logs" ]; then
  find logs -name "*.log" -type f -mmin -60 2>/dev/null | while read log; do
    errors=$(grep -iE "(error|fatal|critical)" "$log" 2>/dev/null | wc -l)
    if [ "$errors" -gt 0 ]; then
      echo "  $log: $errors errors"
    fi
  done
  echo "  (checked logs modified in last 60 min)"
else
  echo "  No logs directory found"
fi
echo

# 6. Health Summary
echo "[6] System Status:"
node_count=$(pgrep node 2>/dev/null | wc -l)
echo "  Node processes: $node_count"

if nc -zv localhost 65028 2>&1 | grep -q succeeded; then
  echo "  AI Bridge: HEALTHY ✓"
else
  echo "  AI Bridge: DOWN ✗"
  echo "  → Start with: npm run bridge:start"
fi

echo
echo "================================================================================"
echo "Check complete at $(date '+%Y-%m-%d %H:%M:%S')"
echo "================================================================================"
