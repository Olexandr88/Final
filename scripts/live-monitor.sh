#!/bin/bash
# Live AI Bridge Monitor - Real-time dashboard
# Uses shell_one_liners.sh patterns for continuous monitoring

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

AI_BRIDGE_PORT=65028

# Function: Clear screen and show header
show_header() {
    clear
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║         AI Bridge Live Monitor - $(date '+%H:%M:%S')            ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}\n"
}

# Function: Show port status (block 136)
show_port_status() {
    echo -e "${YELLOW}[PORT STATUS]${NC}"

    if command -v lsof &> /dev/null; then
        if lsof -i tcp:$AI_BRIDGE_PORT &> /dev/null; then
            local pid=$(lsof -i tcp:$AI_BRIDGE_PORT | grep LISTEN | awk '{print $2}' | head -1)
            echo -e "  ${GREEN}✓${NC} Port $AI_BRIDGE_PORT: ACTIVE (PID $pid)"
        else
            echo -e "  ${RED}✗${NC} Port $AI_BRIDGE_PORT: INACTIVE"
        fi
    else
        netstat -ano | grep ":$AI_BRIDGE_PORT.*LISTENING" > /dev/null && \
            echo -e "  ${GREEN}✓${NC} Port $AI_BRIDGE_PORT: ACTIVE" || \
            echo -e "  ${RED}✗${NC} Port $AI_BRIDGE_PORT: INACTIVE"
    fi
}

# Function: Show connection stats (block 225)
show_connections() {
    echo -e "\n${YELLOW}[ACTIVE CONNECTIONS]${NC}"

    if command -v netstat &> /dev/null; then
        netstat -an 2>/dev/null | awk '/ESTABLISHED/ {
            split($5,ip,":");
            if (ip[1] !~ /^$/) print ip[1]
        }' | sort | uniq -c | sort -rn | head -5 | while read count ip; do
            local bar=$(printf '█%.0s' $(seq 1 $count))
            echo -e "  ${CYAN}${ip}:${NC} $count $bar"
        done
    fi
}

# Function: Show process stats (block 40, 41)
show_process_stats() {
    echo -e "\n${YELLOW}[NODE.JS PROCESSES]${NC}"

    if command -v ps &> /dev/null; then
        local node_count=$(ps aux | grep -c '[n]ode' || echo 0)
        local total_mem=0

        # Calculate total memory (block 37 pattern)
        if command -v awk &> /dev/null; then
            total_mem=$(ps aux | awk '/[n]ode/{sum+=$6} END{print sum/1024}' || echo 0)
        fi

        echo -e "  Count: ${CYAN}$node_count${NC} processes"
        echo -e "  Memory: ${CYAN}${total_mem}${NC} MB total"

        # Top 5 by memory
        echo -e "\n${YELLOW}  Top Memory Users:${NC}"
        ps aux | awk '/[n]ode/{print $2, $6/1024}' | sort -k2 -rn | head -5 | \
        while read pid mem; do
            echo -e "    PID $pid: ${mem} MB"
        done
    fi
}

# Function: Show system resources (block 239)
show_system_resources() {
    echo -e "\n${YELLOW}[SYSTEM RESOURCES]${NC}"

    if command -v vmstat &> /dev/null; then
        local stats=$(vmstat 1 2 | tail -1)
        local cpu_idle=$(echo $stats | awk '{print $15}')
        local cpu_used=$((100 - cpu_idle))
        local mem_free=$(echo $stats | awk '{print $4}')

        echo -e "  CPU Usage: ${CYAN}${cpu_used}%${NC}"
        echo -e "  Free Memory: ${CYAN}${mem_free}${NC} KB"
    elif command -v top &> /dev/null; then
        local cpu=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
        echo -e "  CPU Usage: ${CYAN}${cpu}%${NC}"
    fi

    # Disk usage
    if command -v df &> /dev/null; then
        local disk=$(df -h . | tail -1 | awk '{print $5}')
        echo -e "  Disk Usage: ${CYAN}${disk}${NC}"
    fi
}

# Function: Show recent activity (block 42)
show_recent_activity() {
    echo -e "\n${YELLOW}[RECENT ACTIVITY]${NC}"
    echo -e "  Files modified in last 10 minutes:"

    if command -v find &> /dev/null; then
        find . -maxdepth 2 -mmin -10 -type f 2>/dev/null | head -5 | \
        while read file; do
            echo -e "    ${CYAN}$file${NC}"
        done || echo -e "    ${NC}None${NC}"
    fi
}

# Function: Show traffic rate (simplified block 180)
show_traffic_rate() {
    echo -e "\n${YELLOW}[NETWORK TRAFFIC]${NC}"

    if command -v ss &> /dev/null; then
        local tcp_count=$(ss -tan | grep ESTAB | wc -l)
        echo -e "  Established TCP: ${CYAN}${tcp_count}${NC}"
    elif command -v netstat &> /dev/null; then
        local tcp_count=$(netstat -an | grep -c ESTABLISHED || echo 0)
        echo -e "  Established TCP: ${CYAN}${tcp_count}${NC}"
    fi
}

# Main monitoring loop
trap 'echo -e "\n${RED}Monitoring stopped${NC}"; exit 0' INT TERM

echo -e "${GREEN}Starting live monitor... Press Ctrl+C to stop${NC}\n"
sleep 2

while true; do
    show_header
    show_port_status
    show_connections
    show_process_stats
    show_system_resources
    show_recent_activity
    show_traffic_rate

    echo -e "\n${CYAN}════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}Refreshing in 5 seconds...${NC} (Ctrl+C to stop)"

    sleep 5
done
