#!/bin/bash
# Advanced System Diagnostics - Deep analysis using shell_one_liners.sh patterns
# Blocks: 58-66 (vmstat/iostat), 67-72 (strace), 79-81 (log analysis), 242-245 (base64), 246-288 (awk/sed/grep/perl)

set -euo pipefail

COLORS=(
    '\033[0;31m'  # RED
    '\033[0;32m'  # GREEN
    '\033[1;33m'  # YELLOW
    '\033[0;36m'  # CYAN
    '\033[0m'     # RESET
)

log() {
    local color=${2:-4}
    echo -e "${COLORS[$color]}$1${COLORS[4]}"
}

header() {
    echo ""
    log "╔════════════════════════════════════════════════════════════╗" 3
    log "║  $1" 3
    log "╚════════════════════════════════════════════════════════════╝" 3
    echo ""
}

# 1. System Resource Analysis (blocks 58-66)
analyze_system_resources() {
    header "System Resources (vmstat/iostat patterns)"

    if command -v vmstat &> /dev/null; then
        log "CPU & Memory Statistics (block 58-62):" 3
        vmstat 1 2 | tail -1 | awk '{
            print "  CPU Usage: " 100-$15 "%"
            print "  Free Memory: " $4 " KB"
            print "  Buffer: " $5 " KB"
            print "  Cache: " $6 " KB"
            print "  Swap Used: " $3 " KB"
        }'

        log "\nMemory Details (block 61):" 3
        vmstat -s | head -10 | sed 's/^/  /'
    else
        log "vmstat not available (Linux only)" 0
    fi

    if command -v iostat &> /dev/null; then
        log "\nDisk I/O Statistics (block 63-65):" 3
        iostat -x 1 2 | tail -n +3 | head -10 | awk '{print "  " $0}'
    else
        log "iostat not available" 0
    fi
}

# 2. Process Deep Dive (blocks 67-72 strace patterns)
analyze_process_syscalls() {
    header "Process System Call Analysis"

    local pid=$1

    if [ -z "$pid" ]; then
        log "Usage: Provide PID to trace" 0
        log "Example PIDs:" 3
        ps aux | grep '[n]ode' | awk '{print "  PID " $2 ": " $11}' | head -5
        return
    fi

    if command -v strace &> /dev/null; then
        log "Tracing PID $pid for 5 seconds (block 68)..." 3
        log "System calls made:" 1

        timeout 5 strace -c -p $pid 2>&1 | tail -20 || log "Could not trace (may need sudo)" 0
    else
        log "strace not available" 0

        # Alternative: show process details
        log "\nProcess Details:" 3
        ps -p $pid -o pid,ppid,cmd,stat,pcpu,pmem,etime | tail -1

        log "\nOpen Files (block 38):" 3
        lsof -p $pid 2>/dev/null | head -10 || log "  lsof not available" 0
    fi
}

# 3. Log Analysis (blocks 79-81)
analyze_logs() {
    header "Log Analysis Patterns"

    local logfile="${1:-/var/log/syslog}"

    if [ ! -f "$logfile" ]; then
        log "Log file not found: $logfile" 0
        log "Searching for available logs..." 3
        find /var/log -type f -name "*.log" 2>/dev/null | head -5 | sed 's/^/  /'
        return
    fi

    log "Analyzing: $logfile" 3

    # Block 79: Tail with timestamps
    log "\nRecent entries (last 10):" 3
    tail -10 "$logfile" | while read line; do
        echo "  $(date +%T.%N) $line"
    done

    # Block 80: Top IPs (adapted for logs)
    log "\nMost frequent patterns:" 3
    tail -1000 "$logfile" | awk '{print $1}' | sort | uniq -c | sort -rn | head -5 | sed 's/^/  /'

    # Block 81: Error detection
    log "\nErrors/Warnings (last 100 lines):" 3
    tail -100 "$logfile" | grep -iE "(error|warn|fail|critical)" | tail -5 | sed 's/^/  /' || log "  No errors found" 1
}

# 4. Text Processing Showcase (blocks 246-288)
advanced_text_processing() {
    header "Advanced Text Processing Examples"

    log "AWK Patterns:" 3

    # Block 249: Print last field
    log "\nProcess names (last field):" 3
    ps aux | awk '{print $NF}' | head -5 | sed 's/^/  /'

    # Block 250: Long lines detection
    log "\nFiles with long lines (>80 chars):" 3
    find . -maxdepth 2 -name "*.js" -type f 2>/dev/null | while read file; do
        count=$(awk 'length($0)>80{print}' "$file" | wc -l)
        [ $count -gt 0 ] && echo "  $file: $count lines"
    done | head -5

    # Block 258: Remove empty lines
    log "\nCleaning example (remove empty lines):" 3
    echo -e "line1\n\nline2\n\nline3" | awk 'NF > 0' | sed 's/^/  /'

    # Block 262: Remove duplicates
    log "\nDuplicate removal example:" 3
    echo -e "apple\nbanana\napple\norange\nbanana" | awk '!x[$0]++' | sed 's/^/  /'
}

# 5. Network Deep Analysis (blocks 100-105)
analyze_network_advanced() {
    header "Advanced Network Analysis"

    # SSL/TLS inspection (block 100-105)
    log "Testing SSL/TLS connection to google.com:443" 3

    if command -v openssl &> /dev/null; then
        log "\nCertificate info:" 3
        echo | openssl s_client -connect google.com:443 -showcerts 2>/dev/null | \
            grep -E "(subject|issuer|notAfter)" | sed 's/^/  /'

        log "\nTLS version test:" 3
        for version in tls1_2 tls1_3; do
            result=$(echo | openssl s_client -connect google.com:443 -$version 2>&1 | grep -q "Cipher" && echo "✓" || echo "✗")
            log "  $version: $result" $([[ $result == "✓" ]] && echo 1 || echo 0)
        done
    else
        log "openssl not available" 0
    fi
}

# 6. Performance Bottleneck Detection
detect_bottlenecks() {
    header "Performance Bottleneck Detection"

    log "Top CPU consumers:" 3
    ps aux | sort -k3 -rn | head -5 | awk '{printf "  %-8s %6s%%  %s\n", $2, $3, $11}'

    log "\nTop Memory consumers:" 3
    ps aux | sort -k4 -rn | head -5 | awk '{printf "  %-8s %6s%%  %s\n", $2, $4, $11}'

    log "\nDisk usage hotspots:" 3
    du -h . 2>/dev/null | sort -rh | head -5 | sed 's/^/  /'

    if command -v lsof &> /dev/null; then
        log "\nMost open files:" 3
        lsof 2>/dev/null | awk '{print $1}' | sort | uniq -c | sort -rn | head -5 | sed 's/^/  /'
    fi
}

# 7. Security Audit (blocks 56, 91, 139-142)
security_audit() {
    header "Security Quick Audit"

    log "SUID/SGID files (block 56):" 3
    log "(This can indicate potential security risks)" 0
    find /usr/bin -type f \( -perm -4000 -o -perm -2000 \) 2>/dev/null | head -5 | sed 's/^/  /' || log "  None found in /usr/bin" 1

    log "\nWorld-writable files:" 3
    find . -maxdepth 2 -type f -perm -002 2>/dev/null | head -5 | sed 's/^/  /' || log "  None found" 1

    log "\nRecent file changes (last hour):" 3
    find . -maxdepth 2 -type f -mmin -60 2>/dev/null | head -5 | sed 's/^/  /' || log "  None" 1
}

# 8. AI Bridge Specific Analysis
ai_bridge_analysis() {
    header "AI Bridge Specific Diagnostics"

    log "WebSocket connections on 65028:" 3
    netstat -an 2>/dev/null | grep 65028 | sed 's/^/  /' || log "  No connections" 0

    log "\nNode.js processes analysis:" 3
    if command -v ps &> /dev/null; then
        ps aux | grep '[n]ode' | awk '{
            printf "  PID %-6s CPU %5s%% MEM %5s%% CMD %s\n", $2, $3, $4, $11
        }' | head -10
    fi

    log "\nPort listeners:" 3
    netstat -tlnp 2>/dev/null | grep -E "(65028|65029)" | sed 's/^/  /' || \
        netstat -an | grep -E ":(65028|65029).*LISTEN" | sed 's/^/  /'
}

# Main menu
show_menu() {
    clear
    log "╔════════════════════════════════════════════════════════════╗" 3
    log "║       Advanced System Diagnostics                         ║" 3
    log "╚════════════════════════════════════════════════════════════╝" 3
    echo ""
    log "Select analysis:" 3
    echo "  1) System Resources (vmstat/iostat)"
    echo "  2) Process System Calls (strace)"
    echo "  3) Log Analysis"
    echo "  4) Text Processing Examples"
    echo "  5) Network Deep Analysis (SSL/TLS)"
    echo "  6) Performance Bottlenecks"
    echo "  7) Security Quick Audit"
    echo "  8) AI Bridge Analysis"
    echo "  9) Run ALL Diagnostics"
    echo "  0) Exit"
    echo ""
}

# Main loop
main() {
    while true; do
        show_menu
        read -p "Choice: " choice

        case $choice in
            1) analyze_system_resources ;;
            2)
                read -p "Enter PID to trace (or leave empty): " pid
                analyze_process_syscalls "$pid"
                ;;
            3)
                read -p "Log file path (default: /var/log/syslog): " logfile
                analyze_logs "${logfile:-/var/log/syslog}"
                ;;
            4) advanced_text_processing ;;
            5) analyze_network_advanced ;;
            6) detect_bottlenecks ;;
            7) security_audit ;;
            8) ai_bridge_analysis ;;
            9)
                analyze_system_resources
                detect_bottlenecks
                ai_bridge_analysis
                security_audit
                log "\n✓ Full diagnostic complete!" 1
                ;;
            0)
                log "\nExiting..." 1
                exit 0
                ;;
            *)
                log "Invalid choice" 0
                ;;
        esac

        echo ""
        read -p "Press Enter to continue..."
    done
}

# Run
main
