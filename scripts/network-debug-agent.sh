#!/bin/bash
# Network Debug Agent - Interactive AI Bridge Troubleshooter
# Uses netcat, tcpdump patterns to diagnose WebSocket issues

set -euo pipefail

AI_BRIDGE_HOST=${1:-localhost}
AI_BRIDGE_PORT=${2:-65028}

echo "╔════════════════════════════════════════════════════════════╗"
echo "║       AI Bridge Network Debug Agent                       ║"
echo "║  Target: $AI_BRIDGE_HOST:$AI_BRIDGE_PORT"
echo "╚════════════════════════════════════════════════════════════╝"

# Function: Kill process on port (from block 73)
kill_port() {
  local port=$1
  echo "[DEBUG] Attempting to kill process on port $port..."
  kill -9 $(lsof -i :$port | awk '{l=$2} END {print l}') 2>/dev/null && echo "✓ Killed" || echo "✗ No process found"
}

# Function: Check port availability (from block 209)
check_port() {
  local host=$1
  local port=$2
  echo "[CHECK] Testing $host:$port..."
  nc -vz $host $port 2>&1 | grep -q succeeded && echo "✓ Port is open" || echo "✗ Port is closed"
}

# Function: Raw TCP connection test (from block 178)
raw_tcp_test() {
  local host=$1
  local port=$2
  echo "[RAW TCP] Testing $host:$port..."
  timeout 1 bash -c "</dev/tcp/$host/$port" >/dev/null 2>&1
  if [ $? -eq 0 ]; then
    echo "✓ TCP connection successful"
    return 0
  else
    echo "✗ TCP connection failed"
    return 1
  fi
}

# Function: Show what's using the port (from blocks 134-136)
port_details() {
  local port=$1
  echo "[PORT INFO] Details for port $port:"
  lsof -i tcp:$port 2>/dev/null || echo "No process listening"
  echo ""
  echo "[NETWORK VIEW]:"
  lsof -Pan -i tcp -i udp 2>/dev/null | grep $port || echo "No network activity"
}

# Function: Connection stats (from block 225)
connection_stats() {
  echo "[STATS] Active connection summary:"
  netstat -an 2>/dev/null | awk '/ESTABLISHED/ { split($5,ip,":"); if (ip[1] !~ /^$/) print ip[1] }' | \
  sort | uniq -c | awk '{ printf("%s connections from %s\t",$1,$2); for (i = 0; i < $1; i++) {printf("█")}; print "" }'
}

# Function: Create simple WebSocket test client (from blocks 211-212)
test_websocket() {
  local host=$1
  local port=$2

  echo "[WS TEST] Attempting WebSocket handshake to $host:$port..."

  # Create WebSocket upgrade request
  cat > /tmp/ws_handshake.txt << 'EOF'
GET / HTTP/1.1
Host: localhost:65028
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13

EOF

  # Send handshake and capture response
  timeout 2 nc $host $port < /tmp/ws_handshake.txt 2>&1

  rm -f /tmp/ws_handshake.txt
}

# Function: Monitor traffic (from blocks 180-181)
monitor_traffic() {
  local port=$1
  echo "[MONITOR] Capturing traffic on port $port for 10 seconds..."
  echo "Press Ctrl+C to stop early"

  if command -v tcpdump &> /dev/null; then
    timeout 10 tcpdump -i any -n "port $port" -c 20 2>/dev/null || echo "No tcpdump available or no traffic"
  else
    echo "tcpdump not available, using netstat watch instead:"
    for i in {1..10}; do
      netstat -an | grep $port
      sleep 1
    done
  fi
}

# Function: Test with different protocols (from block 123)
protocol_test() {
  local host=$1
  local port=$2

  echo "[PROTOCOL TEST] Testing TCP and UDP..."

  # TCP test
  nc -vz $host $port 2>&1 | head -1

  # UDP test (block 210)
  echo "UDP test:"
  nc -vzu $host $port 2>&1 | head -1
}

# Function: Create test proxy (from blocks 217-218 simplified)
create_proxy() {
  local listen_port=$1
  local target_host=$2
  local target_port=$3

  echo "[PROXY] Creating debug proxy: localhost:$listen_port -> $target_host:$target_port"
  echo "Traffic will be logged. Press Ctrl+C to stop."

  mkfifo /tmp/pipe_back 2>/dev/null || true

  nc -l -p $listen_port < /tmp/pipe_back | tee /tmp/sent.log | \
  nc $target_host $target_port | tee /tmp/recv.log > /tmp/pipe_back

  rm -f /tmp/pipe_back

  echo "Sent traffic saved to: /tmp/sent.log"
  echo "Received traffic saved to: /tmp/recv.log"
}

# Interactive menu
show_menu() {
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "Select debugging action:"
  echo "  1) Quick health check"
  echo "  2) Detailed port analysis"
  echo "  3) WebSocket handshake test"
  echo "  4) Monitor live traffic"
  echo "  5) Connection statistics"
  echo "  6) Kill process on port"
  echo "  7) Create debug proxy"
  echo "  8) Protocol tests (TCP/UDP)"
  echo "  9) Full diagnostic report"
  echo "  0) Exit"
  echo "════════════════════════════════════════════════════════════"
  read -p "Choice: " choice

  case $choice in
    1)
      echo ""
      check_port $AI_BRIDGE_HOST $AI_BRIDGE_PORT
      raw_tcp_test $AI_BRIDGE_HOST $AI_BRIDGE_PORT
      ;;
    2)
      echo ""
      port_details $AI_BRIDGE_PORT
      ;;
    3)
      echo ""
      test_websocket $AI_BRIDGE_HOST $AI_BRIDGE_PORT
      ;;
    4)
      echo ""
      monitor_traffic $AI_BRIDGE_PORT
      ;;
    5)
      echo ""
      connection_stats
      ;;
    6)
      echo ""
      read -p "Port to kill: " kill_p
      kill_port $kill_p
      ;;
    7)
      echo ""
      read -p "Listen on port: " listen_p
      create_proxy $listen_p $AI_BRIDGE_HOST $AI_BRIDGE_PORT
      ;;
    8)
      echo ""
      protocol_test $AI_BRIDGE_HOST $AI_BRIDGE_PORT
      ;;
    9)
      echo ""
      echo "═══ FULL DIAGNOSTIC REPORT ═══"
      check_port $AI_BRIDGE_HOST $AI_BRIDGE_PORT
      echo ""
      raw_tcp_test $AI_BRIDGE_HOST $AI_BRIDGE_PORT
      echo ""
      port_details $AI_BRIDGE_PORT
      echo ""
      connection_stats
      echo ""
      protocol_test $AI_BRIDGE_HOST $AI_BRIDGE_PORT
      ;;
    0)
      echo "Exiting..."
      exit 0
      ;;
    *)
      echo "Invalid choice"
      ;;
  esac

  show_menu
}

# Start interactive mode
show_menu
