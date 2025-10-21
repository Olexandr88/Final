#!/usr/bin/env bash

#############################################################################
# Health Monitor Daemon
# Runs health checks every 5 minutes and logs results
#############################################################################

INTERVAL=300  # 5 minutes
LOG_DIR="logs/health-monitoring"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$LOG_DIR"

echo "Health Monitor Daemon starting..."
echo "Logging to: $LOG_DIR"
echo "Interval: ${INTERVAL}s"
echo "Press Ctrl+C to stop"
echo

while true; do
  TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
  LOG_FILE="$LOG_DIR/health-$TIMESTAMP.log"

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Running health check..."

  # Run health check and save to log
  bash "$SCRIPT_DIR/quick-health-check.sh" > "$LOG_FILE" 2>&1

  # Keep only last 24 hours of logs (288 files at 5min intervals)
  find "$LOG_DIR" -name "health-*.log" -type f -mmin +1440 -delete 2>/dev/null

  # Show summary
  echo "  → Saved to $LOG_FILE"

  # Check if AI Bridge is down and alert
  if grep -q "AI Bridge: DOWN" "$LOG_FILE"; then
    echo "  ⚠ WARNING: AI Bridge is DOWN!"
  fi

  sleep "$INTERVAL"
done
