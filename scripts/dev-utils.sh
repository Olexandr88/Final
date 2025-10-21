#!/bin/bash
# Development Utilities - LLM Framework Project
# Collection of useful shell one-liners for daily development tasks

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# CODE ANALYSIS
# ============================================================================

# Find most frequently used commands in history
show_top_commands() {
  echo -e "${BLUE}Top 20 most used commands:${NC}"
  history | \
  awk '{CMD[$2]++;count++;}END { for (a in CMD)print CMD[a] " " CMD[a]/count*100 "% " a;}' | \
  grep -v "./" | \
  column -c3 -s " " -t | \
  sort -nr | nl | head -n 20
}

# Find duplicate files (useful for cleaning up tests)
find_duplicates() {
  echo -e "${BLUE}Finding duplicate files...${NC}"
  find . -type f -exec md5sum '{}' ';' | sort | uniq --all-repeated=separate -w 33
}

# Find large files in project (exclude node_modules)
find_large_files() {
  echo -e "${BLUE}Finding files larger than 1MB (excluding node_modules):${NC}"
  find . -type f -size +1M -not -path "*/node_modules/*" -not -path "*/.git/*" -exec ls -lh {} \; | \
  awk '{print $5 "\t" $9}' | sort -h
}

# ============================================================================
# TEST UTILITIES
# ============================================================================

# Run tests and show only failures
test_failures_only() {
  echo -e "${BLUE}Running tests, showing failures only:${NC}"
  npm test 2>&1 | grep -A 5 "FAIL\|Error\|✖"
}

# Count test files and total test cases
count_tests() {
  echo -e "${BLUE}Test Statistics:${NC}"
  local test_files=$(find tests -name "*.test.js" | wc -l)
  local test_cases=$(grep -r "it(" tests/ --include="*.test.js" | wc -l)
  echo -e "Test files: ${GREEN}$test_files${NC}"
  echo -e "Test cases: ${GREEN}$test_cases${NC}"
}

# ============================================================================
# GIT UTILITIES
# ============================================================================

# Show git log with nice graph
git_log_graph() {
  git log --graph \
  --pretty=format:'%Cred%h%Creset -%C(yellow)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset' \
  --abbrev-commit -20
}

# Find who changed a file the most
git_file_authors() {
  local file=$1
  if [ -z "$file" ]; then
    echo -e "${RED}Usage: git_file_authors <filename>${NC}"
    return 1
  fi
  echo -e "${BLUE}Top contributors to $file:${NC}"
  git log --follow --pretty=format:"%an" "$file" | sort | uniq -c | sort -rn
}

# ============================================================================
# NETWORK & PROCESS MONITORING
# ============================================================================

# Show what's listening on ports
show_listening_ports() {
  echo -e "${BLUE}Listening ports:${NC}"
  if command -v lsof &> /dev/null; then
    lsof -Pni4 | grep LISTEN | column -t
  elif command -v netstat &> /dev/null; then
    netstat -an | grep LISTEN
  else
    echo -e "${RED}Neither lsof nor netstat available${NC}"
  fi
}

# Kill process on specific port (useful for stuck ai-bridge)
kill_port() {
  local port=$1
  if [ -z "$port" ]; then
    echo -e "${RED}Usage: kill_port <port>${NC}"
    return 1
  fi
  echo -e "${YELLOW}Killing process on port $port...${NC}"

  if command -v lsof &> /dev/null; then
    local pid=$(lsof -ti :$port)
    if [ ! -z "$pid" ]; then
      kill -9 $pid && echo -e "${GREEN}Killed PID $pid${NC}"
    else
      echo -e "${YELLOW}No process found on port $port${NC}"
    fi
  else
    echo -e "${RED}lsof not available${NC}"
  fi
}

# ============================================================================
# LOG ANALYSIS
# ============================================================================

# Tail log with timestamps
tail_with_time() {
  local file=$1
  if [ -z "$file" ]; then
    echo -e "${RED}Usage: tail_with_time <logfile>${NC}"
    return 1
  fi
  tail -f "$file" | while read ; do echo "$(date +%T.%N) $REPLY" ; done
}

# Analyze most frequent errors in logs
analyze_errors() {
  local logdir=${1:-.}
  echo -e "${BLUE}Most common errors in logs:${NC}"
  find "$logdir" -name "*.log" -type f -exec grep -i "error\|fail\|exception" {} \; 2>/dev/null | \
  awk '{print $0}' | sort | uniq -c | sort -rn | head -20
}

# ============================================================================
# CODE QUALITY
# ============================================================================

# Find files with long lines (>120 chars)
find_long_lines() {
  echo -e "${BLUE}Files with lines longer than 120 characters:${NC}"
  find src tests -name "*.js" -type f -exec awk 'length>120{print FILENAME":"FNR": "length" chars"; nextfile}' {} \;
}

# Count lines of code by extension
count_loc() {
  echo -e "${BLUE}Lines of code by extension:${NC}"
  for ext in js json md sh yml; do
    local count=$(find . -name "*.$ext" -not -path "*/node_modules/*" -not -path "*/.git/*" -type f -exec wc -l {} + | tail -1 | awk '{print $1}')
    echo -e ".$ext: ${GREEN}$count${NC}"
  done
}

# Find TODOs and FIXMEs in code
find_todos() {
  echo -e "${BLUE}TODOs and FIXMEs in codebase:${NC}"
  grep -rn "TODO\|FIXME\|XXX\|HACK" src/ tests/ --include="*.js" --color=always | head -20
}

# ============================================================================
# PERFORMANCE UTILITIES
# ============================================================================

# Show directory sizes sorted
show_dir_sizes() {
  echo -e "${BLUE}Directory sizes (top 20):${NC}"
  du -h --max-depth=1 2>/dev/null | sort -rh | head -20
}

# Monitor file changes (useful for watching test outputs)
watch_directory() {
  local dir=${1:-.}
  echo -e "${BLUE}Watching directory: $dir${NC}"
  echo -e "${YELLOW}Press Ctrl+C to stop${NC}"

  if command -v inotifywait &> /dev/null; then
    while true ; do
      inotifywait -r -e MODIFY "$dir" && ls -lart "$dir" | tail -5
    done
  else
    echo -e "${RED}inotifywait not available. Using polling instead...${NC}"
    while true; do
      clear
      ls -lart "$dir" | tail -20
      sleep 2
    done
  fi
}

# ============================================================================
# CLEANUP UTILITIES
# ============================================================================

# Clean up test artifacts
clean_test_artifacts() {
  echo -e "${YELLOW}Cleaning test artifacts...${NC}"
  find tests -name "*.test.db" -o -name "*.test.log" -o -name ".test-sessions" -type f -delete
  echo -e "${GREEN}Done!${NC}"
}

# Remove empty directories
clean_empty_dirs() {
  echo -e "${YELLOW}Removing empty directories...${NC}"
  find . -depth -type d -empty -not -path "*/.git/*" -delete
  echo -e "${GREEN}Done!${NC}"
}

# ============================================================================
# AI BRIDGE SPECIFIC
# ============================================================================

# Check if AI bridge is running
check_ai_bridge() {
  echo -e "${BLUE}Checking AI Bridge status:${NC}"

  # Check WebSocket port (65028)
  if nc -z localhost 65028 2>/dev/null; then
    echo -e "WebSocket (65028): ${GREEN}ONLINE${NC}"
  else
    echo -e "WebSocket (65028): ${RED}OFFLINE${NC}"
  fi

  # Check HTTP port (65029)
  if nc -z localhost 65029 2>/dev/null; then
    echo -e "HTTP (65029): ${GREEN}ONLINE${NC}"
  else
    echo -e "HTTP (65029): ${RED}OFFLINE${NC}"
  fi
}

# Monitor AI bridge metrics
monitor_bridge_metrics() {
  echo -e "${BLUE}Monitoring AI Bridge metrics (HTTP endpoint)...${NC}"
  echo -e "${YELLOW}Press Ctrl+C to stop${NC}"

  while true; do
    clear
    echo -e "${BLUE}=== AI Bridge Metrics ===${NC}"
    curl -s http://localhost:65029/metrics 2>/dev/null | head -50 || echo -e "${RED}Bridge not responding${NC}"
    sleep 5
  done
}

# ============================================================================
# HELP MENU
# ============================================================================

show_help() {
  cat << EOF
${BLUE}=== Development Utilities - LLM Framework ===${NC}

${GREEN}Code Analysis:${NC}
  show_top_commands       - Show most used shell commands
  find_duplicates        - Find duplicate files in project
  find_large_files       - Find files larger than 1MB
  count_loc              - Count lines of code by extension
  find_long_lines        - Find files with lines >120 chars
  find_todos             - Find TODO/FIXME comments

${GREEN}Test Utilities:${NC}
  test_failures_only     - Run tests, show only failures
  count_tests            - Count test files and cases
  clean_test_artifacts   - Remove test artifacts

${GREEN}Git Utilities:${NC}
  git_log_graph          - Pretty git log with graph
  git_file_authors <file> - Show top contributors to file

${GREEN}Network & Process:${NC}
  show_listening_ports   - Show listening network ports
  kill_port <port>       - Kill process on specific port
  check_ai_bridge        - Check AI Bridge status

${GREEN}Log Analysis:${NC}
  tail_with_time <file>  - Tail log with timestamps
  analyze_errors [dir]   - Find most common errors in logs

${GREEN}Performance:${NC}
  show_dir_sizes         - Show directory sizes sorted
  watch_directory [dir]  - Watch directory for changes
  monitor_bridge_metrics - Monitor AI Bridge metrics

${GREEN}Cleanup:${NC}
  clean_test_artifacts   - Remove test artifacts
  clean_empty_dirs       - Remove empty directories

${BLUE}Usage:${NC}
  source scripts/dev-utils.sh
  <function_name> [arguments]

EOF
}

# Auto-show help on source
show_help
