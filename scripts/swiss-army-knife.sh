#!/bin/bash
# Swiss Army Knife - Ultimate utility combining the best shell patterns
# Patterns: 241 (git viz), 242-243 (HTTP servers), 240 (DNS), 1200+ (all text processing)

set -euo pipefail

# Colors
C_RED='\033[0;31m'
C_GREEN='\033[0;32m'
C_YELLOW='\033[1;33m'
C_CYAN='\033[0;36m'
C_BLUE='\033[0;34m'
C_RESET='\033[0m'

log() { echo -e "${2:-$C_RESET}$1$C_RESET"; }
header() {
    echo ""
    log "╔════════════════════════════════════════════════════════════╗" "$C_CYAN"
    log "║  $1" "$C_CYAN"
    log "╚════════════════════════════════════════════════════════════╝" "$C_CYAN"
    echo ""
}

# 1. Beautiful Git Log (block 241)
git_visualize() {
    header "Git Repository Visualization"

    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        log "Not a git repository" "$C_RED"
        return 1
    fi

    log "Commits (last 20):" "$C_YELLOW"
    git log --graph \
        --pretty=format:'%Cred%h%Creset -%C(yellow)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset' \
        --abbrev-commit \
        --date=relative \
        -20

    echo ""
    log "\nBranch status:" "$C_YELLOW"
    git branch -vv

    log "\nRepository stats:" "$C_YELLOW"
    echo "  Total commits: $(git rev-list --count HEAD)"
    echo "  Contributors: $(git log --format='%an' | sort -u | wc -l)"
    echo "  Files tracked: $(git ls-files | wc -l)"
    echo "  Branches: $(git branch | wc -l)"
}

# 2. Quick HTTP Server (blocks 242-243)
start_http_server() {
    header "Quick HTTP Server"

    local port=${1:-8000}
    local dir=${2:-.}

    log "Starting HTTP server on port $port serving $dir" "$C_GREEN"
    log "Access at: http://localhost:$port" "$C_CYAN"
    log "Press Ctrl+C to stop\n" "$C_YELLOW"

    cd "$dir"

    if command -v python3 &> /dev/null; then
        log "Using Python 3..." "$C_GREEN"
        python3 -m http.server "$port" --bind 127.0.0.1
    elif command -v python &> /dev/null; then
        log "Using Python 2..." "$C_GREEN"
        python -m SimpleHTTPServer "$port"
    elif command -v php &> /dev/null; then
        log "Using PHP..." "$C_GREEN"
        php -S "127.0.0.1:$port"
    else
        log "No Python or PHP available. Using netcat..." "$C_YELLOW"
        # Fallback to netcat (block 216)
        while true; do
            (echo -ne "HTTP/1.1 200 OK\r\n\r\n"; ls -lh) | nc -l -p "$port"
        done
    fi
}

# 3. DNS Resolver (block 240, 1164-1167)
dns_lookup() {
    header "DNS Resolver"

    local domain=${1:-google.com}

    log "Resolving: $domain" "$C_YELLOW"

    # Method 1: Using dig
    if command -v dig &> /dev/null; then
        log "\nDig results:" "$C_CYAN"
        dig "$domain" +short

        log "\nAll record types:" "$C_CYAN"
        dig "$domain" ANY +noall +answer
    fi

    # Method 2: Using host
    if command -v host &> /dev/null; then
        log "\nHost results:" "$C_CYAN"
        host "$domain"
    fi

    # Method 3: Using nslookup
    if command -v nslookup &> /dev/null; then
        log "\nNslookup results:" "$C_CYAN"
        nslookup "$domain"
    fi

    # Method 4: Using Google DNS API (block 240)
    if command -v curl &> /dev/null && command -v jq &> /dev/null; then
        log "\nGoogle DNS API:" "$C_CYAN"
        curl -s "https://dns.google.com/resolve?name=${domain}&type=A" | jq -r '.Answer[]? | "\(.name) → \(.data)"'
    fi
}

# 4. File Encoding/Decoding (blocks 244-245)
encode_decode() {
    header "Base64 Encoding/Decoding"

    echo "1) Encode text"
    echo "2) Decode text"
    echo "3) Encode file"
    echo "4) Decode file"
    read -p "Choice: " choice

    case $choice in
        1)
            read -p "Enter text to encode: " text
            if command -v python3 &> /dev/null; then
                echo "$text" | python3 -m base64
            else
                echo "$text" | base64
            fi
            ;;
        2)
            read -p "Enter base64 to decode: " text
            if command -v python3 &> /dev/null; then
                echo "$text" | python3 -m base64 -d
            else
                echo "$text" | base64 -d
            fi
            ;;
        3)
            read -p "File to encode: " file
            if [ -f "$file" ]; then
                base64 "$file" > "${file}.b64"
                log "Encoded to: ${file}.b64" "$C_GREEN"
            else
                log "File not found" "$C_RED"
            fi
            ;;
        4)
            read -p "Base64 file to decode: " file
            if [ -f "$file" ]; then
                base64 -d "$file" > "${file%.b64}"
                log "Decoded to: ${file%.b64}" "$C_GREEN"
            else
                log "File not found" "$C_RED"
            fi
            ;;
    esac
}

# 5. Text Processing Toolkit (blocks 246-288)
text_tools() {
    header "Text Processing Toolkit"

    echo "1) Remove duplicate lines"
    echo "2) Remove empty lines"
    echo "3) Number lines"
    echo "4) Count word frequency"
    echo "5) Extract column"
    echo "6) Join lines"
    echo "7) Find long lines (>80 chars)"
    read -p "Choice: " choice

    read -p "Input file: " file
    [ ! -f "$file" ] && { log "File not found" "$C_RED"; return 1; }

    case $choice in
        1) # Block 1307
            log "Removing duplicates..." "$C_YELLOW"
            awk '!x[$0]++' "$file"
            ;;
        2) # Block 1291
            log "Removing empty lines..." "$C_YELLOW"
            awk 'NF' "$file"
            ;;
        3) # Block 1275
            log "Adding line numbers..." "$C_YELLOW"
            awk '{ printf("%5d : %s\n", NR, $0) }' "$file"
            ;;
        4) # Custom
            log "Word frequency..." "$C_YELLOW"
            tr -cs '[:alnum:]' '\n' < "$file" | tr '[:upper:]' '[:lower:]' | sort | uniq -c | sort -rn | head -20
            ;;
        5) # Block 1249
            read -p "Column number: " col
            log "Extracting column $col..." "$C_YELLOW"
            awk "{print \$$col}" "$file"
            ;;
        6) # Block 1333
            log "Joining all lines..." "$C_YELLOW"
            sed ':a;N;$!ba;s/\n/ /g' "$file"
            ;;
        7) # Block 1266
            log "Lines longer than 80 chars..." "$C_YELLOW"
            awk 'length($0)>80{print FNR": "$0}' "$file"
            ;;
    esac
}

# 6. Network Quick Tests
network_quick() {
    header "Network Quick Tests"

    local host=${1:-google.com}
    local port=${2:-80}

    log "Target: $host:$port" "$C_CYAN"

    # Ping test
    log "\nPing test:" "$C_YELLOW"
    ping -c 3 "$host" 2>/dev/null || log "Ping failed" "$C_RED"

    # TCP test (block 178)
    log "\nTCP connectivity:" "$C_YELLOW"
    timeout 2 bash -c "</dev/tcp/$host/$port" 2>/dev/null && \
        log "✓ Port $port is open" "$C_GREEN" || \
        log "✗ Port $port is closed" "$C_RED"

    # HTTP test
    if [ "$port" -eq 80 ] || [ "$port" -eq 443 ]; then
        log "\nHTTP response:" "$C_YELLOW"
        curl -sI "http://$host" | head -5
    fi

    # DNS lookup
    log "\nDNS resolution:" "$C_YELLOW"
    host "$host" 2>/dev/null | head -3
}

# 7. System Info Quick
system_info() {
    header "System Information"

    log "Hostname: $(hostname)" "$C_CYAN"
    log "Uptime: $(uptime | awk '{print $3,$4}' | sed 's/,//')" "$C_CYAN"

    log "\nCPU:" "$C_YELLOW"
    grep "model name" /proc/cpuinfo 2>/dev/null | head -1 | cut -d: -f2 || \
        sysctl -n machdep.cpu.brand_string 2>/dev/null || \
        log "  N/A"

    log "\nMemory:" "$C_YELLOW"
    if command -v free &> /dev/null; then
        free -h | grep Mem
    else
        vm_stat 2>/dev/null | head -5 || log "  N/A"
    fi

    log "\nDisk:" "$C_YELLOW"
    df -h . | tail -1

    log "\nTop Processes (CPU):" "$C_YELLOW"
    ps aux | sort -k3 -rn | head -5 | awk '{printf "  %s %6s%% %s\n", $2, $3, $11}'

    log "\nTop Processes (Memory):" "$C_YELLOW"
    ps aux | sort -k4 -rn | head -5 | awk '{printf "  %s %6s%% %s\n", $2, $4, $11}'
}

# 8. Project Quick Analysis
project_analysis() {
    header "Project Quick Analysis"

    log "Current directory: $(pwd)" "$C_CYAN"

    # File count by type
    log "\nFiles by extension:" "$C_YELLOW"
    find . -type f -not -path '*/\.*' -not -path '*/node_modules/*' 2>/dev/null | \
        sed 's/.*\.//' | sort | uniq -c | sort -rn | head -10 | \
        awk '{printf "  %-10s %s\n", $2, $1}'

    # Code metrics
    if [ -f "package.json" ]; then
        log "\nNode.js Project Detected:" "$C_GREEN"
        echo "  Dependencies: $(jq -r '.dependencies | length' package.json 2>/dev/null || echo 0)"
        echo "  Scripts: $(jq -r '.scripts | length' package.json 2>/dev/null || echo 0)"
    fi

    # Git info
    if git rev-parse --git-dir > /dev/null 2>&1; then
        log "\nGit Repository:" "$C_GREEN"
        echo "  Branch: $(git branch --show-current)"
        echo "  Commits: $(git rev-list --count HEAD)"
        echo "  Last commit: $(git log -1 --format='%cr')"
    fi

    # Disk usage
    log "\nLargest directories:" "$C_YELLOW"
    du -sh */ 2>/dev/null | sort -rh | head -5 | sed 's/^/  /'
}

# Main Menu
show_menu() {
    clear
    log "╔════════════════════════════════════════════════════════════╗" "$C_CYAN"
    log "║            Swiss Army Knife - Ultimate Toolkit            ║" "$C_CYAN"
    log "╚════════════════════════════════════════════════════════════╝" "$C_CYAN"
    echo ""
    log "Select utility:" "$C_YELLOW"
    echo "  1) Git Visualization"
    echo "  2) HTTP Server (quick serve files)"
    echo "  3) DNS Lookup"
    echo "  4) Base64 Encode/Decode"
    echo "  5) Text Processing Tools"
    echo "  6) Network Quick Test"
    echo "  7) System Info"
    echo "  8) Project Analysis"
    echo "  9) Run All Checks"
    echo "  0) Exit"
    echo ""
}

# Main loop
main() {
    while true; do
        show_menu
        read -p "Choice: " choice

        case $choice in
            1) git_visualize ;;
            2)
                read -p "Port (default 8000): " port
                read -p "Directory (default current): " dir
                start_http_server "${port:-8000}" "${dir:-.}"
                ;;
            3)
                read -p "Domain (default google.com): " domain
                dns_lookup "${domain:-google.com}"
                ;;
            4) encode_decode ;;
            5) text_tools ;;
            6)
                read -p "Host (default google.com): " host
                read -p "Port (default 80): " port
                network_quick "${host:-google.com}" "${port:-80}"
                ;;
            7) system_info ;;
            8) project_analysis ;;
            9)
                system_info
                project_analysis
                git_visualize 2>/dev/null
                log "\n✓ All checks complete!" "$C_GREEN"
                ;;
            0)
                log "\nGoodbye! 👋\n" "$C_GREEN"
                exit 0
                ;;
            *)
                log "Invalid choice" "$C_RED"
                ;;
        esac

        echo ""
        read -p "Press Enter to continue..."
    done
}

# Run
main
