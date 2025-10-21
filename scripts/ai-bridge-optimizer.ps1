# AI Bridge Process Optimizer
# Analyzes running Node processes, kills zombies, optimizes resources
# Based on shell_one_liners.sh patterns

param(
    [switch]$AutoKill,
    [switch]$Verbose,
    [int]$MemoryThresholdMB = 200
)

$ErrorActionPreference = 'SilentlyContinue'

function Write-ColorOutput {
    param($Message, $Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

function Get-ProcessDetails {
    param($ProcessId)
    $proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if ($proc) {
        [PSCustomObject]@{
            PID = $proc.Id
            Name = $proc.ProcessName
            MemoryMB = [math]::Round($proc.WorkingSet64 / 1MB, 2)
            CPUSeconds = [math]::Round($proc.TotalProcessorTime.TotalSeconds, 2)
            Handles = $proc.HandleCount
            Threads = $proc.Threads.Count
            StartTime = $proc.StartTime
            Path = $proc.Path
        }
    }
}

Write-ColorOutput "`n╔════════════════════════════════════════════════════════════╗" Cyan
Write-ColorOutput "║         AI Bridge Process Optimizer v1.0              ║" Cyan
Write-ColorOutput "╚════════════════════════════════════════════════════════════╝`n" Cyan

# 1. Find all Node.js processes (pattern from block 41)
Write-ColorOutput "[*] Scanning Node.js processes..." Yellow
$nodeProcesses = Get-Process node -ErrorAction SilentlyContinue
Write-ColorOutput "Found: $($nodeProcesses.Count) Node.js processes`n" Green

# 2. Check AI Bridge ports (pattern from block 134-136)
Write-ColorOutput "[*] Checking AI Bridge ports..." Yellow
$port65028 = netstat -ano | Select-String "65028.*LISTENING"
$port65029 = netstat -ano | Select-String "65029.*LISTENING"

if ($port65028) {
    $pid = ($port65028 -split '\s+')[-1]
    Write-ColorOutput "✓ Port 65028: ACTIVE (PID $pid)" Green
    $bridgePID = $pid
} else {
    Write-ColorOutput "✗ Port 65028: NOT LISTENING" Red
    $bridgePID = $null
}

if ($port65029) {
    $pid = ($port65029 -split '\s+')[-1]
    Write-ColorOutput "✓ Port 65029: ACTIVE (PID $pid)`n" Green
} else {
    Write-ColorOutput "✗ Port 65029: NOT LISTENING`n" Red
}

# 3. Analyze memory usage (pattern from block 37)
Write-ColorOutput "[*] Memory Analysis (>50MB):" Yellow
$highMemProcesses = $nodeProcesses | Where-Object { ($_.WorkingSet64 / 1MB) -gt 50 } |
    Sort-Object WorkingSet64 -Descending |
    Select-Object -First 10

foreach ($proc in $highMemProcesses) {
    $memMB = [math]::Round($proc.WorkingSet64 / 1MB, 2)
    $color = if ($memMB -gt $MemoryThresholdMB) { "Red" } else { "Yellow" }
    $marker = if ($proc.Id -eq $bridgePID) { "[AI BRIDGE]" } else { "" }
    Write-ColorOutput "  PID $($proc.Id): $memMB MB - $($proc.Path) $marker" $color
}

# 4. Find zombie/hanging processes (pattern from block 168)
Write-ColorOutput "`n[*] Detecting zombie/hanging processes..." Yellow
$zombieCandidates = @()

foreach ($proc in $nodeProcesses) {
    try {
        $cpuTime = $proc.TotalProcessorTime.TotalSeconds
        $uptime = (Get-Date) - $proc.StartTime

        # If running for >10 min with <5 seconds CPU time, might be zombie
        if ($uptime.TotalMinutes -gt 10 -and $cpuTime -lt 5) {
            $zombieCandidates += [PSCustomObject]@{
                PID = $proc.Id
                MemoryMB = [math]::Round($proc.WorkingSet64 / 1MB, 2)
                CPUTime = $cpuTime
                Uptime = "$([math]::Round($uptime.TotalMinutes, 1)) min"
                Path = $proc.Path
            }
        }
    } catch {}
}

if ($zombieCandidates.Count -gt 0) {
    Write-ColorOutput "⚠ Found $($zombieCandidates.Count) potential zombie processes:" Red
    $zombieCandidates | Format-Table -AutoSize

    if ($AutoKill) {
        Write-ColorOutput "`n[!] AutoKill enabled. Terminating zombies..." Red
        foreach ($zombie in $zombieCandidates) {
            if ($zombie.PID -ne $bridgePID) {
                Write-ColorOutput "  Killing PID $($zombie.PID)..." Yellow
                Stop-Process -Id $zombie.PID -Force -ErrorAction SilentlyContinue
            } else {
                Write-ColorOutput "  Skipping PID $($zombie.PID) (AI Bridge)" Cyan
            }
        }
    }
} else {
    Write-ColorOutput "✓ No zombie processes detected`n" Green
}

# 5. Connection statistics (pattern from block 225)
Write-ColorOutput "[*] Network Connection Summary:" Yellow
$connections = netstat -ano | Select-String "ESTABLISHED"
$connStats = @{}

foreach ($conn in $connections) {
    $parts = $conn -split '\s+'
    if ($parts.Count -ge 5) {
        $remoteParts = $parts[2] -split ':'
        $remoteIP = $remoteParts[0]
        if ($remoteIP -and $remoteIP -ne "0.0.0.0" -and $remoteIP -ne "[::]") {
            if ($connStats.ContainsKey($remoteIP)) {
                $connStats[$remoteIP] = $connStats[$remoteIP] + 1
            } else {
                $connStats[$remoteIP] = 1
            }
        }
    }
}

$topConnections = $connStats.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 10
foreach ($entry in $topConnections) {
    $bar = "█" * [math]::Min($entry.Value, 50)
    Write-Host "  $($entry.Key): $($entry.Value) connections $bar"
}

# 6. Resource recommendations (pattern from block 239-241)
Write-ColorOutput "`n[*] System Resources:" Yellow
$totalMemMB = [math]::Round((Get-Process node | Measure-Object WorkingSet64 -Sum).Sum / 1MB, 2)
$avgMemMB = if ($nodeProcesses.Count -gt 0) {
    [math]::Round($totalMemMB / $nodeProcesses.Count, 2)
} else { 0 }

Write-ColorOutput "  Total Node.js Memory: $totalMemMB MB" Cyan
Write-ColorOutput "  Average per Process: $avgMemMB MB" Cyan
Write-ColorOutput "  Process Count: $($nodeProcesses.Count)" Cyan

# 7. Recommendations
Write-ColorOutput "`n[*] Recommendations:" Magenta

if ($nodeProcesses.Count -gt 20) {
    Write-ColorOutput "  ⚠ High process count ($($nodeProcesses.Count)). Consider consolidating." Yellow
}

if ($totalMemMB -gt 1000) {
    Write-ColorOutput "  ⚠ High total memory usage ($totalMemMB MB). Memory leak possible." Yellow
}

if ($zombieCandidates.Count -gt 0 -and -not $AutoKill) {
    Write-ColorOutput "  💡 Run with -AutoKill to terminate zombie processes" Cyan
}

if ($bridgePID) {
    $bridgeProc = Get-Process -Id $bridgePID -ErrorAction SilentlyContinue
    if ($bridgeProc) {
        $bridgeMemMB = [math]::Round($bridgeProc.WorkingSet64 / 1MB, 2)
        if ($bridgeMemMB -gt 150) {
            Write-ColorOutput "  ⚠ AI Bridge using high memory ($bridgeMemMB MB). Consider restart." Yellow
        } else {
            Write-ColorOutput "  ✓ AI Bridge healthy ($bridgeMemMB MB)" Green
        }
    }
}

# 8. Quick actions menu
Write-ColorOutput "`n╔════════════════════════════════════════════════════════════╗" Cyan
Write-ColorOutput "║                    Quick Actions                       ║" Cyan
Write-ColorOutput "╚════════════════════════════════════════════════════════════╝" Cyan
Write-ColorOutput "  1. Kill specific PID: Stop-Process -Id <PID> -Force" Gray
Write-ColorOutput "  2. Kill all Node except Bridge: Get-Process node | Where-Object { `$_.Id -ne $bridgePID } | Stop-Process -Force" Gray
Write-ColorOutput "  3. Restart AI Bridge: npm run start:bridge" Gray
Write-ColorOutput "  4. View live connections: netstat -ano 1" Gray
Write-ColorOutput "  5. Re-run this script: .\scripts\ai-bridge-optimizer.ps1`n" Gray

# 9. Export report (pattern from block 42-43)
if ($Verbose) {
    $reportPath = "C:\Users\scarm\logs\ai-bridge-report-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt"
    $report = @"
AI Bridge Process Optimizer Report
Generated: $(Get-Date)

Node.js Processes: $($nodeProcesses.Count)
Total Memory: $totalMemMB MB
Zombie Candidates: $($zombieCandidates.Count)
AI Bridge PID: $bridgePID

High Memory Processes:
$(($highMemProcesses | Format-Table | Out-String))

Zombie Candidates:
$(if ($zombieCandidates.Count -gt 0) { ($zombieCandidates | Format-Table | Out-String) } else { "None" })

Connection Statistics:
$(($topConnections | Format-Table | Out-String))
"@

    New-Item -Path (Split-Path $reportPath) -ItemType Directory -Force | Out-Null
    $report | Out-File -FilePath $reportPath -Encoding UTF8
    Write-ColorOutput "[*] Detailed report saved to: $reportPath" Green
}

Write-ColorOutput "`nOptimization scan complete.`n" Green
