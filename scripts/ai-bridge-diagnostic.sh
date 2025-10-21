#!/bin/bash

# AI Bridge & A2A System Diagnostic Tool
# Uses shell one-liners for comprehensive system health checks

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
AI_BRIDGE_WS_PORT=65028
AI_BRIDGE_HTTP_PORT=65029
LOG_DIR="C:/Users/scarm/.claude-sessions/logs"

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   AI Bridge & A2A System Diagnostic Tool          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# 1. Check if ports are listening (from line 148)
echo -e "${YELLOW}[1] Checking AI Bridge Ports...${NC}"
lsof -Pni4 2>/dev/null | grep LISTEN | grep -E "${AI_BRIDGE_WS_PORT}|${AI_BRIDGE_HTTP_PORT}" | column -t || echo -e "${RED}No AI Bridge ports listening${NC}"
echo ""

# 2. Find all Node.js processes related to AI Bridge (from line 165-169)
echo -e "${YELLOW}[2] Active Node.js Processes...${NC}"
ps auxw | grep -E 'node.*bridge|node.*a2a|node.*agent' | grep -v grep | awk '{print $2, $11, $12, $13, $14, $15}' | column -t || echo -e "${RED}No AI Bridge processes found${NC}"
echo ""

# 3. Count processes by user (from line 168)
echo -e "${YELLOW}[3] Process Count by User...${NC}"
ps hax -o user | sort | uniq -c | sort -r | head -5
echo ""

# 4. Network connections summary (from line 225)
echo -e "${YELLOW}[4] Active Network Connections...${NC}"
netstat -an 2>/dev/null | awk '/ESTABLISHED/ { split($5,ip,":"); if (ip[1] !~ /^$/) print ip[1] }' | \
sort | uniq -c | awk '{ printf("%s\t%s\t",$2,$1) ; for (i = 0; i < $1; i++) {printf("*")}; print "" }' | head -10 || echo "netstat not available"
echo ""

# 5. Check specific port connectivity (from line 209)
echo -e "${YELLOW}[5] Testing AI Bridge Connectivity...${NC}"
nc -vz 127.0.0.1 ${AI_BRIDGE_WS_PORT} 2>&1 || echo -e "${RED}WS port ${AI_BRIDGE_WS_PORT} unreachable${NC}"
nc -vz 127.0.0.1 ${AI_BRIDGE_HTTP_PORT} 2>&1 || echo -e "${RED}HTTP port ${AI_BRIDGE_HTTP_PORT} unreachable${NC}"
echo ""

# 6. Find recent log files (from line 174, 223)
echo -e "${YELLOW}[6] Recent Log Activity...${NC}"
if [ -d "${LOG_DIR}" ]; then
  find "${LOG_DIR}" -type f -mmin -60 2>/dev/null | head -10 || echo "No recent logs"
  echo ""
  echo "Latest modified log:"
  find "${LOG_DIR}" -type f -exec stat --format '%Y :%y %n' "{}" \; 2>/dev/null | sort -nr | cut -d: -f2- | head -1 || echo "No logs found"
else
  echo -e "${RED}Log directory not found: ${LOG_DIR}${NC}"
fi
echo ""

# 7. Check for zombie processes (from line 39)
echo -e "${YELLOW}[7] Zombie/Defunct Processes...${NC}"
ps awwfux | grep -E 'defunct|<zombie>' | grep -v grep || echo -e "${GREEN}No zombie processes${NC}"
echo ""

# 8. Memory usage by Node processes (from line 157-159)
echo -e "${YELLOW}[8] Node.js Memory Usage...${NC}"
ps aux | grep 'node' | grep -v grep | awk '{printf "PID: %-8s  MEM: %-6s  VSZ: %-10s  CMD: %s\n", $2, $4"%", $5, $11}' | sort -k4 -rn | head -10 || echo "No Node processes"
echo ""

# 9. Open files by AI Bridge (from line 151)
echo -e "${YELLOW}[9] Files Opened by AI Bridge Process...${NC}"
AI_BRIDGE_PID=$(lsof -i :${AI_BRIDGE_WS_PORT} 2>/dev/null | awk 'NR==2 {print $2}')
if [ ! -z "${AI_BRIDGE_PID}" ]; then
  echo -e "${GREEN}AI Bridge PID: ${AI_BRIDGE_PID}${NC}"
  lsof -c "node" -p ${AI_BRIDGE_PID} 2>/dev/null | wc -l | awk '{print "Open files: " $1}'
  echo "Working directory:"
  lsof -p ${AI_BRIDGE_PID} 2>/dev/null | grep cwd || echo "Unknown"
else
  echo -e "${RED}AI Bridge not running${NC}"
fi
echo ""

# 10. Disk usage of AI project (from line 388-392)
echo -e "${YELLOW}[10] Disk Usage Summary...${NC}"
if [ -d "C:/Users/scarm/LLM" ]; then
  cd "C:/Users/scarm/LLM" 2>/dev/null && \
  du -sh . 2>/dev/null | awk '{print "Total: " $1}' && \
  du -sh node_modules .claude-sessions tests 2>/dev/null | column -t || echo "Cannot access LLM directory"
fi
echo ""

# 11. Quick health check - can we reach the bridge?
echo -e "${YELLOW}[11] AI Bridge HTTP Health Check...${NC}"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\nTime: %{time_total}s\n" http://127.0.0.1:${AI_BRIDGE_HTTP_PORT}/health 2>/dev/null || echo -e "${RED}Health endpoint not responding${NC}"
echo ""

# 12. Recent errors in logs (tail + grep pattern from line 308, 311)
echo -e "${YELLOW}[12] Recent Errors (last 100 lines)...${NC}"
if [ -d "${LOG_DIR}" ]; then
  find "${LOG_DIR}" -type f -name "*.log" -exec tail -100 {} \; 2>/dev/null | \
  grep -iE 'error|fail|exception' | tail -5 || echo -e "${GREEN}No recent errors${NC}"
else
  echo "No logs to check"
fi
echo ""

# Summary
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Diagnostic Complete - $(date)${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"

# Optional: Kill AI Bridge if requested
if [[ "${1:-}" == "--kill-bridge" ]]; then
  echo -e "${RED}Killing AI Bridge process...${NC}"
  kill -9 $(lsof -i :${AI_BRIDGE_WS_PORT} 2>/dev/null | awk 'NR==2 {print $2}') 2>/dev/null && echo "Done" || echo "Process not found"
fi
