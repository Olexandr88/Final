#!/bin/bash
# Multi-Agent System Management Script

BRIDGE_WS="ws://localhost:51178"
BRIDGE_HTTP="http://localhost:51179"
OLLAMA_URL="http://localhost:11434"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

function print_header() {
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  $1${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

function check_status() {
    print_header "SYSTEM STATUS"

    # Check AI Bridge
    if curl -s "$BRIDGE_HTTP/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ AI Bridge: RUNNING${NC}"
    else
        echo -e "${RED}❌ AI Bridge: DOWN${NC}"
    fi

    # Check Ollama
    if curl -s "$OLLAMA_URL/api/tags" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Ollama: RUNNING${NC}"
    else
        echo -e "${RED}❌ Ollama: DOWN${NC}"
    fi

    # Check agents
    AGENTS=$(curl -s "$BRIDGE_HTTP/agents" | grep -o '"id"' | wc -l)
    echo -e "${GREEN}✅ Connected Agents: $AGENTS${NC}"

    echo ""
}

function start_system() {
    print_header "STARTING SYSTEM"

    # Start AI Bridge
    echo "Starting AI Bridge..."
    npm run start:bridge > /dev/null 2>&1 &
    sleep 3

    # Start Ollama Agent
    echo "Starting Ollama Agent..."
    BRIDGE_WS=$BRIDGE_WS node src/agents/a2a-ollama-agent.js > /dev/null 2>&1 &
    sleep 2

    echo -e "${GREEN}✅ System started${NC}"
    echo ""
    check_status
}

function stop_system() {
    print_header "STOPPING SYSTEM"

    pkill -f "ai-bridge.js"
    pkill -f "a2a-ollama-agent.js"

    echo -e "${GREEN}✅ System stopped${NC}"
    echo ""
}

function run_workflow() {
    print_header "RUNNING COORDINATED WORKFLOW"

    node scripts/coordinate-ollama-agents.js

    echo ""
}

function view_history() {
    print_header "CONVERSATION HISTORY"

    curl -s "$BRIDGE_HTTP/history" | python -m json.tool 2>/dev/null || curl -s "$BRIDGE_HTTP/history"

    echo ""
}

function view_agents() {
    print_header "CONNECTED AGENTS"

    curl -s "$BRIDGE_HTTP/agents" | python -m json.tool 2>/dev/null || curl -s "$BRIDGE_HTTP/agents"

    echo ""
}

function show_menu() {
    print_header "MULTI-AGENT SYSTEM MANAGER"

    echo "1. Check Status"
    echo "2. Start System"
    echo "3. Stop System"
    echo "4. Run Workflow"
    echo "5. View History"
    echo "6. View Agents"
    echo "7. Exit"
    echo ""
    read -p "Choose an option: " choice

    case $choice in
        1) check_status ;;
        2) start_system ;;
        3) stop_system ;;
        4) run_workflow ;;
        5) view_history ;;
        6) view_agents ;;
        7) exit 0 ;;
        *) echo -e "${RED}Invalid option${NC}" ;;
    esac

    echo ""
    read -p "Press Enter to continue..."
    show_menu
}

# Main
if [ "$1" == "status" ]; then
    check_status
elif [ "$1" == "start" ]; then
    start_system
elif [ "$1" == "stop" ]; then
    stop_system
elif [ "$1" == "workflow" ]; then
    run_workflow
elif [ "$1" == "history" ]; then
    view_history
elif [ "$1" == "agents" ]; then
    view_agents
else
    show_menu
fi
