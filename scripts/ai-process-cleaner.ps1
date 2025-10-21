# AI Process Cleaner - Simple Node.js process analyzer
# Based on shell_one_liners.sh patterns

param([switch]$Kill)

Write-Host "`n=== AI Bridge Process Analyzer ===`n" -ForegroundColor Cyan

# Find all Node processes
$nodes = Get-Process node -ErrorAction SilentlyContinue
Write-Host "Total Node.js processes: $($nodes.Count)`n" -ForegroundColor Yellow

# Check AI Bridge ports
Write-Host "AI Bridge Port Status:" -ForegroundColor Yellow
$port1 = netstat -ano | Select-String "65028.*LISTENING"
$port2 = netstat -ano | Select-String "65029.*LISTENING"

if ($port1) {
    $pid = ($port1 -split '\s+')[-1]
    Write-Host "  Port 65028: ACTIVE (PID $pid)" -ForegroundColor Green
    $bridgePID = [int]$pid
} else {
    Write-Host "  Port 65028: NOT ACTIVE" -ForegroundColor Red
    $bridgePID = $null
}

if ($port2) {
    $pid = ($port2 -split '\s+')[-1]
    Write-Host "  Port 65029: ACTIVE (PID $pid)" -ForegroundColor Green
}

# Memory analysis
Write-Host "`nHigh Memory Processes (>50MB):" -ForegroundColor Yellow
$highMem = $nodes | Where-Object { ($_.WorkingSet64 / 1MB) -gt 50 } | Sort-Object WorkingSet64 -Descending

foreach ($proc in $highMem) {
    $memMB = [math]::Round($proc.WorkingSet64 / 1MB, 2)
    $isBridge = if ($proc.Id -eq $bridgePID) { " [AI BRIDGE]" } else { "" }
    $color = if ($memMB -gt 150) { "Red" } else { "Yellow" }
    Write-Host "  PID $($proc.Id): $memMB MB$isBridge" -ForegroundColor $color
}

# Find zombie candidates (low CPU usage, high uptime)
Write-Host "`nPotential Zombie Processes:" -ForegroundColor Yellow
$zombies = @()

foreach ($proc in $nodes) {
    try {
        $cpuTime = $proc.TotalProcessorTime.TotalSeconds
        $uptime = (Get-Date) - $proc.StartTime

        if ($uptime.TotalMinutes -gt 10 -and $cpuTime -lt 5 -and $proc.Id -ne $bridgePID) {
            $zombies += [PSCustomObject]@{
                PID = $proc.Id
                MemoryMB = [math]::Round($proc.WorkingSet64 / 1MB, 2)
                CPUTime = [math]::Round($cpuTime, 2)
                UptimeMin = [math]::Round($uptime.TotalMinutes, 1)
            }
        }
    } catch {}
}

if ($zombies.Count -gt 0) {
    $zombies | Format-Table -AutoSize

    if ($Kill) {
        Write-Host "`nKilling zombie processes..." -ForegroundColor Red
        foreach ($z in $zombies) {
            Write-Host "  Terminating PID $($z.PID)..." -ForegroundColor Yellow
            Stop-Process -Id $z.PID -Force -ErrorAction SilentlyContinue
        }
        Write-Host "Done!`n" -ForegroundColor Green
    } else {
        Write-Host "Run with -Kill to terminate these processes`n" -ForegroundColor Cyan
    }
} else {
    Write-Host "  No zombies detected`n" -ForegroundColor Green
}

# Summary
$totalMemMB = [math]::Round(($nodes | Measure-Object WorkingSet64 -Sum).Sum / 1MB, 2)
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  Total Processes: $($nodes.Count)" -ForegroundColor White
Write-Host "  Total Memory: $totalMemMB MB" -ForegroundColor White
Write-Host "  Zombies Found: $($zombies.Count)" -ForegroundColor White

if ($bridgePID) {
    $bridge = Get-Process -Id $bridgePID -ErrorAction SilentlyContinue
    if ($bridge) {
        $bridgeMem = [math]::Round($bridge.WorkingSet64 / 1MB, 2)
        Write-Host "  AI Bridge Memory: $bridgeMem MB" -ForegroundColor Green
    }
}

Write-Host "`n=== Complete ===`n" -ForegroundColor Cyan
