# Kill AI Bridge Process
# Finds and kills Node.js processes listening on AI Bridge ports

param(
    [int]$WsPort = 65028,
    [int]$HttpPort = 65029,
    [switch]$Force
)

Write-Host "Searching for AI Bridge processes on ports $WsPort and $HttpPort..." -ForegroundColor Cyan

# Find processes using the specified ports
$connections = netstat -ano | Select-String ":$WsPort|:$HttpPort" | Select-String "LISTENING"

if (-not $connections) {
    Write-Host "No AI Bridge processes found on ports $WsPort/$HttpPort" -ForegroundColor Green
    exit 0
}

# Extract unique PIDs
$pids = $connections | ForEach-Object {
    if ($_ -match '\s+(\d+)\s*$') {
        $matches[1]
    }
} | Select-Object -Unique

foreach ($pid in $pids) {
    try {
        $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($process) {
            Write-Host "Found process: $($process.ProcessName) (PID: $pid)" -ForegroundColor Yellow
            
            if ($Force) {
                Stop-Process -Id $pid -Force
                Write-Host "Killed process $pid" -ForegroundColor Green
            } else {
                $confirm = Read-Host "Kill process $pid? (y/N)"
                if ($confirm -eq 'y' -or $confirm -eq 'Y') {
                    Stop-Process -Id $pid -Force
                    Write-Host "Killed process $pid" -ForegroundColor Green
                } else {
                    Write-Host "Skipped process $pid" -ForegroundColor Yellow
                }
            }
        }
    } catch {
        Write-Host "Error processing PID $pid: $_" -ForegroundColor Red
    }
}

Write-Host "`nDone. Waiting for TIME_WAIT connections to clear..." -ForegroundColor Cyan
Start-Sleep -Seconds 2

# Check if ports are now free
$stillInUse = netstat -ano | Select-String ":$WsPort|:$HttpPort" | Select-String "LISTENING"
if ($stillInUse) {
    Write-Host "Warning: Ports still in use. May need to wait for TIME_WAIT to expire." -ForegroundColor Yellow
} else {
    Write-Host "Ports $WsPort/$HttpPort are now free!" -ForegroundColor Green
}
