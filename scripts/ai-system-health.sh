#!/bin/bash
# AI System Health Monitor
# Monitors AI Bridge, agents, ports, and system resources

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
AI_BRIDGE_PORT=65028
HTTP_PORT=65029
EXPECTED_PROCESSES=("node" "ai-bridge" "ollama")

printf "=%.0s" {1..80}
echo
printf "${GREEN}AI System Health Check - %s${NC}\n" "$(date '+%Y-%m-%d %H:%M:%S')"
printf "=%.0s" {1..80}
echo

# 1. Check listening ports (from block 148)
echo
printf "${YELLOW}[*] Listening Ports:${NC}\n"
if command -v lsof &> /dev/null; then
  lsof -Pni4 | grep LISTEN | column -t | head -20
else
  netstat -an | grep LISTEN | head -20
fi

# 2. Check AI Bridge ports specifically (from block 136)
echo
printf "${YELLOW}[*] AI Bridge Port Status:${NC}\n"
for port in $AI_BRIDGE_PORT $HTTP_PORT; do
  if lsof -i tcp:$port &> /dev/null 2>&1; then
    printf "${GREEN}✓${NC} Port $port: "
    lsof -i tcp:$port | grep LISTEN | awk '{print $1 " (PID: " $2 ")"}'
  else
    printf "${RED}✗${NC} Port $port: Not listening\n"
  fi
done

# 3. Process inspection (from block 40)
echo
printf "${YELLOW}[*] Top Processes by User:${NC}\n"
ps hax -o user | sort | uniq -c | sort -r | head -10

# 4. Check Node.js processes (from block 41)
echo
printf "${YELLOW}[*] Node.js Processes:${NC}\n"
ps -lfC node 2>/dev/null | head -20 || echo "No Node.js processes found"

# 5. Network connections to AI Bridge (from block 225)
echo
printf "${YELLOW}[*] Active Connections:${NC}\n"
netstat -an 2>/dev/null | awk '/ESTABLISHED/ { split($5,ip,":"); if (ip[1] !~ /^$/) print ip[1] }' | \
sort | uniq -c | awk '{ printf("%s\t%s\t",$2,$1) ; for (i = 0; i < $1; i++) {printf("*")}; print "" }' | head -10

# 6. System resources (from blocks 239, 241)
echo
printf "${YELLOW}[*] System Resources:${NC}\n"
if command -v vmstat &> /dev/null; then
  vmstat 1 2 | tail -1 | awk '{print "CPU: " 100-$15 "% used, Memory: " $4 "KB free, Swap: " $3 "KB used"}'
fi

# 7. Check for zombie processes
echo
printf "${YELLOW}[*] Zombie Process Check:${NC}\n"
zombie_count=$(ps aux | awk '$8=="Z" {print $0}' | wc -l)
if [ "$zombie_count" -gt 0 ]; then
  printf "${RED}⚠ Found $zombie_count zombie processes${NC}\n"
  ps aux | awk '$8=="Z" {print $0}'
else
  printf "${GREEN}✓ No zombie processes${NC}\n"
fi

# 8. Find files modified in last 60 minutes (logs, etc) (from block 42)
echo
printf "${YELLOW}[*] Recent Activity (files modified in last 60 min):${NC}\n"
find . -maxdepth 2 -mmin -60 -type f 2>/dev/null | head -10

# 9. Check disk usage (from block 98)
echo
printf "${YELLOW}[*] Disk Usage (Top 10):${NC}\n"
du -h . 2>/dev/null | sort -rh | head -10

# 10. AI Bridge connectivity test (from block 178)
echo
printf "${YELLOW}[*] AI Bridge Connectivity Test:${NC}\n"
timeout 1 bash -c "</dev/tcp/localhost/$AI_BRIDGE_PORT" >/dev/null 2>&1
if [ $? -eq 0 ]; then
  printf "${GREEN}✓ AI Bridge is reachable on port $AI_BRIDGE_PORT${NC}\n"
else
  printf "${RED}✗ AI Bridge is NOT reachable on port $AI_BRIDGE_PORT${NC}\n"
fi

# 11. Working directory of running Node processes (from block 162)
echo
printf "${YELLOW}[*] Node Process Working Directories:${NC}\n"
for pid in $(pgrep node 2>/dev/null); do
  if [ -d "/proc/$pid/cwd" ]; then
    cwd=$(readlink -f /proc/$pid/cwd 2>/dev/null)
    exe=$(readlink -f /proc/$pid/exe 2>/dev/null)
    printf "PID $pid: $cwd (exe: $exe)\n"
  fi
done

# 12. Memory by process (from block 37)
echo
printf "${YELLOW}[*] Large Memory Processes:${NC}\n"
ps aux | awk '{if($6 > 100000) print $6/1024 "MB " $11 " (PID: " $2 ")"}' | sort -rn | head -10

printf "=%.0s" {1..80}
echo
printf "${GREEN}Health check complete${NC}\n"
