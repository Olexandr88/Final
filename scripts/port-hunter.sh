#!/bin/bash
# Port Hunter - Find and analyze what's using specific ports
# Based on shell_one_liners.sh blocks 134-148

set -euo pipefail

PORT=${1:-65028}

echo "╔════════════════════════════════════════════════════════════╗"
echo "║               Port Hunter - Port $PORT Analysis            ║"
echo "╚════════════════════════════════════════════════════════════╝"

# Function: Show all listening ports (block 148)
show_all_listening() {
    echo -e "\n[LISTENING PORTS] All TCP/UDP listeners:"
    if command -v lsof &> /dev/null; then
        lsof -Pni4 | grep LISTEN | column -t | awk '{print "  " $0}'
    else
        netstat -tulpn 2>/dev/null | grep LISTEN | awk '{print "  " $0}' || \
        netstat -an | findstr LISTENING | awk '{print "  " $0}'
    fi
}

# Function: Detailed port info (block 136)
port_details() {
    local port=$1
    echo -e "\n[PORT $port DETAILS]:"

    if command -v lsof &> /dev/null; then
        lsof -i tcp:$port || echo "  No process found on port $port"
    else
        netstat -ano | grep ":$port " || echo "  No process found on port $port"
    fi
}

# Function: Network connections overview (block 139)
network_overview() {
    echo -e "\n[NETWORK OVERVIEW] TCP/UDP connections:"
    if command -v lsof &> /dev/null; then
        lsof -Pan -i tcp -i udp | head -20 | awk '{print "  " $0}'
    else
        netstat -ano | head -20 | awk '{print "  " $0}'
    fi
}

# Function: Show processes using network (block 151)
network_processes() {
    echo -e "\n[NETWORK PROCESSES] Top network-using processes:"
    if command -v lsof &> /dev/null; then
        lsof -c "process" 2>/dev/null || lsof -i -P | grep -i "listen" | awk '{print "  " $1, $2, $9}' | sort -u
    else
        netstat -ano | grep ESTABLISHED | awk '{print "  " $0}' | head -10
    fi
}

# Function: Kill process on port (block 73)
kill_on_port() {
    local port=$1
    echo -e "\n[KILL] Attempting to kill process on port $port..."

    if command -v lsof &> /dev/null; then
        local pid=$(lsof -i :$port | awk '{l=$2} END {print l}')
        if [ -n "$pid" ]; then
            echo "  Found PID: $pid"
            read -p "  Kill this process? (y/N): " confirm
            if [[ $confirm == "y" || $confirm == "Y" ]]; then
                kill -9 $pid && echo "  ✓ Killed PID $pid" || echo "  ✗ Failed to kill"
            fi
        else
            echo "  No process found"
        fi
    else
        echo "  lsof not available, using netstat..."
        netstat -ano | grep ":$port " | head -1
    fi
}

# Main analysis
port_details $PORT
show_all_listening
network_overview

# Interactive menu
echo -e "\n════════════════════════════════════════════════════════════"
echo "Actions:"
echo "  1) Kill process on port $PORT"
echo "  2) Show all listening ports"
echo "  3) Network overview"
echo "  4) Exit"
echo "════════════════════════════════════════════════════════════"
read -p "Choice: " choice

case $choice in
    1) kill_on_port $PORT ;;
    2) show_all_listening ;;
    3) network_overview ;;
    4) echo "Exiting..."; exit 0 ;;
    *) echo "Invalid choice" ;;
esac
