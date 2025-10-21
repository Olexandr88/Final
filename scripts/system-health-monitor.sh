#!/usr/bin/env bash

#############################################################################
# LLM Project System Health Monitor
#
# Combines useful shell one-liners to monitor:
# - AI Bridge WebSocket health
# - Running agents and processes
# - Network connections
# - System resources
# - Port availability
# - Recent logs
#############################################################################

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
AI_BRIDGE_WS_PORT=65028
AI_BRIDGE_HTTP_PORT=65029
LOG_DIR="logs"
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")

#############################################################################
# Header
#############################################################################
echo "================================================================================"
echo -e "${BLUE}LLM System Health Monitor${NC}"
echo "Timestamp: $TIMESTAMP"
echo "================================================================================"
echo

#############################################################################
# 1. Check Running Node Processes
#############################################################################
echo -e "${GREEN}[1] Node.js Processes${NC}"
echo "--------------------------------------------------------------------------------"
if command -v ps &> /dev/null; then
  # Count processes by user (from shell_one_liners.sh:168)
  ps hax -o user 2>/dev/null | grep -v "^USER" | sort | uniq -c | sort -r | head -5
  echo
  # Show node processes
  ps aux 2>/dev/null | grep -E "(node|electron)" | grep -v grep | awk '{print $2, $11, $12, $13}' || echo "No Node.js processes found"
else
  echo "ps command not available (Windows)"
  tasklist //FI "IMAGENAME eq node.exe" 2>/dev/null | findstr "node.exe" || echo "No Node.js processes found"
fi
echo

#############################################################################
# 2. Check AI Bridge Ports
#############################################################################
echo -e "${GREEN}[2] AI Bridge Port Status${NC}"
echo "--------------------------------------------------------------------------------"
check_port() {
  local port=$1
  local name=$2

  if command -v lsof &> /dev/null; then
    # Using lsof (from shell_one_liners.sh:136)
    if lsof -i tcp:$port &> /dev/null; then
      echo -e "${GREEN}✓${NC} $name (port $port) - LISTENING"
      lsof -i tcp:$port | grep LISTEN
    else
      echo -e "${RED}✗${NC} $name (port $port) - NOT LISTENING"
    fi
  elif command -v netstat &> /dev/null; then
    # Using netstat
    if netstat -an 2>/dev/null | grep ":$port.*LISTEN" &> /dev/null; then
      echo -e "${GREEN}✓${NC} $name (port $port) - LISTENING"
      netstat -an | grep ":$port.*LISTEN"
    else
      echo -e "${RED}✗${NC} $name (port $port) - NOT LISTENING"
    fi
  else
    # Fallback: bash TCP check (from shell_one_liners.sh:178)
    if timeout 1 bash -c "</dev/tcp/localhost/$port" &>/dev/null; then
      echo -e "${GREEN}✓${NC} $name (port $port) - REACHABLE"
    else
      echo -e "${RED}✗${NC} $name (port $port) - NOT REACHABLE"
    fi
  fi
}

check_port $AI_BRIDGE_WS_PORT "AI Bridge WebSocket"
check_port $AI_BRIDGE_HTTP_PORT "AI Bridge HTTP"
echo

#############################################################################
# 3. Network Connections Summary
#############################################################################
echo -e "${GREEN}[3] Active Network Connections${NC}"
echo "--------------------------------------------------------------------------------"
if command -v netstat &> /dev/null; then
  # Connection count by IP (from shell_one_liners.sh:225)
  echo "Top connections by IP:"
  netstat -an 2>/dev/null | awk '/ESTABLISHED/ { split($5,ip,":"); if (ip[1] !~ /^$/) print ip[1] }' | \
    sort | uniq -c | awk '{ printf("%s\t%s\t",$2,$1) ; for (i = 0; i < $1; i++) {printf("*")}; print "" }' | head -10
else
  echo "netstat not available"
fi
echo

#############################################################################
# 4. System Resource Usage
#############################################################################
echo -e "${GREEN}[4] System Resources${NC}"
echo "--------------------------------------------------------------------------------"

# Memory usage
if command -v free &> /dev/null; then
  free -h
elif command -v vmstat &> /dev/null; then
  # From shell_one_liners.sh:241
  vmstat -s | grep -E "(total memory|used memory|free memory)"
else
  echo "Memory stats not available (Windows)"
fi
echo

# Disk usage (top directories)
if command -v du &> /dev/null; then
  echo "Top 5 largest directories in current path:"
  # From shell_one_liners.sh:388-392 (modified)
  du -sh */ 2>/dev/null | sort -hr | head -5 || echo "No subdirectories"
fi
echo

#############################################################################
# 5. File Descriptors / Open Files
#############################################################################
echo -e "${GREEN}[5] Open Files by Node Processes${NC}"
echo "--------------------------------------------------------------------------------"
if command -v lsof &> /dev/null; then
  # Show large open files (from shell_one_liners.sh:157-159)
  echo "Large open files (>10MB):"
  lsof / 2>/dev/null | \
  awk '{ if($7 > 10485760) print $7/1048576 "MB" " " $9 " " $1 }' | \
  sort -n -u | tail -5 | column -t || echo "None found"
else
  echo "lsof not available"
fi
echo

#############################################################################
# 6. Recent Error Logs
#############################################################################
echo -e "${GREEN}[6] Recent Errors in Logs${NC}"
echo "--------------------------------------------------------------------------------"
if [ -d "$LOG_DIR" ]; then
  # Find recent log files (from shell_one_liners.sh:174)
  recent_logs=$(find "$LOG_DIR" -type f -mmin -60 2>/dev/null | head -5)

  if [ -n "$recent_logs" ]; then
    echo "Checking logs modified in last 60 minutes:"
    for log in $recent_logs; do
      echo -e "${YELLOW}$log:${NC}"
      # Search for errors (from shell_one_liners.sh:1354-1358)
      grep -iE '(error|critical|fatal)' "$log" 2>/dev/null | tail -3 || echo "  No errors found"
    done
  else
    echo "No recent log files found in $LOG_DIR"
  fi
else
  echo "Log directory not found: $LOG_DIR"
fi
echo

#############################################################################
# 7. WebSocket Health Check
#############################################################################
echo -e "${GREEN}[7] WebSocket Health Check${NC}"
echo "--------------------------------------------------------------------------------"
# Test WebSocket endpoint with curl
if command -v curl &> /dev/null; then
  # From shell_one_liners.sh:154-155 (modified for HTTP endpoint)
  echo "Testing AI Bridge HTTP endpoint:"
  curl -Iks --max-time 3 http://localhost:$AI_BRIDGE_HTTP_PORT/health 2>/dev/null | head -10 || echo "HTTP endpoint not responding"
else
  echo "curl not available"
fi
echo

#############################################################################
# 8. Process Working Directories
#############################################################################
echo -e "${GREEN}[8] Node Process Working Directories${NC}"
echo "--------------------------------------------------------------------------------"
if command -v lsof &> /dev/null; then
  # Get working directory of processes (from shell_one_liners.sh:162)
  node_pids=$(pgrep node 2>/dev/null)
  if [ -n "$node_pids" ]; then
    for pid in $node_pids; do
      cwd=$(lsof -p "$pid" 2>/dev/null | grep cwd | awk '{print $9}')
      if [ -n "$cwd" ]; then
        echo "PID $pid: $cwd"
      fi
    done
  else
    echo "No Node.js processes found"
  fi
elif [ -d /proc ]; then
  # Alternative using /proc (from shell_one_liners.sh:707)
  for pid in $(pgrep node 2>/dev/null); do
    cwd=$(readlink -f /proc/$pid/cwd 2>/dev/null)
    [ -n "$cwd" ] && echo "PID $pid: $cwd"
  done || echo "No Node.js processes found"
else
  echo "Process inspection not available"
fi
echo

#############################################################################
# 9. Quick Security Check
#############################################################################
echo -e "${GREEN}[9] Security Quick Check${NC}"
echo "--------------------------------------------------------------------------------"
# Check for exposed .env files in current directory
if [ -f ".env" ]; then
  echo -e "${YELLOW}⚠${NC}  .env file found in current directory"
  ls -lh .env
else
  echo -e "${GREEN}✓${NC} No .env in current directory"
fi

# Check permissions on sensitive files
if [ -f "package.json" ]; then
  perms=$(stat -c "%a" package.json 2>/dev/null || stat -f "%Lp" package.json 2>/dev/null || echo "unknown")
  echo "package.json permissions: $perms"
fi
echo

#############################################################################
# 10. Quick Recommendations
#############################################################################
echo -e "${GREEN}[10] Health Summary${NC}"
echo "--------------------------------------------------------------------------------"

# Count running node processes
node_count=$(pgrep node 2>/dev/null | wc -l)

echo -e "Running Node processes: ${BLUE}$node_count${NC}"

# Check if AI Bridge is running
if timeout 1 bash -c "</dev/tcp/localhost/$AI_BRIDGE_WS_PORT" &>/dev/null; then
  echo -e "AI Bridge Status: ${GREEN}HEALTHY${NC}"
else
  echo -e "AI Bridge Status: ${RED}DOWN${NC}"
  echo -e "${YELLOW}Suggestion:${NC} Run 'npm run bridge:start' to start the AI Bridge"
fi

echo
echo "================================================================================"
echo "Monitor complete at $(date +"%Y-%m-%d %H:%M:%S")"
echo "================================================================================"
