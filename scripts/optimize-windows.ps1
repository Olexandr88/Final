# Windows Performance Optimization Script
# Optimizes Windows for Node.js high-performance applications
# Run as Administrator

Write-Host "🚀 Windows Performance Optimizer for Node.js" -ForegroundColor Cyan
Write-Host "=" * 70

# Check for admin privileges
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "❌ This script requires Administrator privileges" -ForegroundColor Red
    Write-Host "Please run PowerShell as Administrator and try again"
    exit 1
}

Write-Host "✓ Running with Administrator privileges" -ForegroundColor Green

# 1. Optimize Network Stack
Write-Host "`n📡 Optimizing Network Stack..." -ForegroundColor Yellow

try {
    netsh int tcp set global autotuninglevel=normal
    netsh int tcp set global chimney=enabled
    netsh int tcp set global dca=enabled
    netsh int tcp set global netdma=enabled
    netsh int tcp set global rss=enabled
    netsh int tcp set global timestamps=disabled

    Write-Host "   ✓ TCP optimizations applied" -ForegroundColor Green
} catch {
    Write-Host "   ⚠ Failed to apply network optimizations: $_" -ForegroundColor Yellow
}

# 2. Configure Memory Management
Write-Host "`n🧠 Configuring Memory Management..." -ForegroundColor Yellow

try {
    $regPath = "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management"

    # Enable large system cache
    Set-ItemProperty -Path $regPath -Name "LargeSystemCache" -Value 1 -Type DWord -ErrorAction SilentlyContinue

    # Disable paging executive
    Set-ItemProperty -Path $regPath -Name "DisablePagingExecutive" -Value 1 -Type DWord -ErrorAction SilentlyContinue

    Write-Host "   ✓ Memory management optimized" -ForegroundColor Green
} catch {
    Write-Host "   ⚠ Failed to configure memory settings: $_" -ForegroundColor Yellow
}

# 3. Windows Defender Exclusions
Write-Host "`n🛡️ Configuring Windows Defender Exclusions..." -ForegroundColor Yellow

try {
    # Get current working directory
    $projectPath = (Get-Location).Path

    # Add exclusions for node_modules
    Add-MpPreference -ExclusionPath "$projectPath\node_modules" -ErrorAction SilentlyContinue
    Add-MpPreference -ExclusionPath "$env:APPDATA\npm" -ErrorAction SilentlyContinue
    Add-MpPreference -ExclusionPath "$env:APPDATA\npm-cache" -ErrorAction SilentlyContinue

    # Add process exclusions
    Add-MpPreference -ExclusionProcess "node.exe" -ErrorAction SilentlyContinue
    Add-MpPreference -ExclusionProcess "npm.exe" -ErrorAction SilentlyContinue

    Write-Host "   ✓ Windows Defender exclusions configured" -ForegroundColor Green
} catch {
    Write-Host "   ⚠ Failed to add Defender exclusions: $_" -ForegroundColor Yellow
}

# 4. Disable Unnecessary Services
Write-Host "`n⚙️ Optimizing Windows Services..." -ForegroundColor Yellow

$servicesToDisable = @(
    "DiagTrack",      # Diagnostics Tracking
    "SysMain",        # Superfetch (can impact SSD performance)
    "WSearch"         # Windows Search (if not needed)
)

foreach ($service in $servicesToDisable) {
    try {
        $svc = Get-Service -Name $service -ErrorAction SilentlyContinue
        if ($svc -and $svc.Status -eq "Running") {
            Set-Service -Name $service -StartupType Disabled -ErrorAction SilentlyContinue
            Stop-Service -Name $service -Force -ErrorAction SilentlyContinue
            Write-Host "   ✓ Disabled: $service" -ForegroundColor Green
        }
    } catch {
        Write-Host "   ⚠ Could not disable $service" -ForegroundColor Yellow
    }
}

# 5. Set Process Priority
Write-Host "`n⚡ Configuring Process Priorities..." -ForegroundColor Yellow

try {
    $nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue

    if ($nodeProcesses) {
        foreach ($proc in $nodeProcesses) {
            $proc.PriorityClass = "High"
            Write-Host "   ✓ Set priority for PID $($proc.Id)" -ForegroundColor Green
        }
    } else {
        Write-Host "   ℹ No running Node.js processes found" -ForegroundColor Gray
    }
} catch {
    Write-Host "   ⚠ Failed to set process priority: $_" -ForegroundColor Yellow
}

# 6. Configure Power Plan
Write-Host "`n🔋 Setting High Performance Power Plan..." -ForegroundColor Yellow

try {
    $powerPlan = powercfg /l | Select-String "High performance"
    if ($powerPlan) {
        $guid = ($powerPlan -split '\s+')[3]
        powercfg /setactive $guid
        Write-Host "   ✓ High Performance power plan activated" -ForegroundColor Green
    } else {
        Write-Host "   ⚠ High Performance plan not found" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠ Failed to set power plan: $_" -ForegroundColor Yellow
}

# 7. Optimize File System
Write-Host "`n📁 Optimizing File System..." -ForegroundColor Yellow

try {
    # Disable 8.3 filename creation (improves file I/O)
    fsutil behavior set disable8dot3 1

    # Disable last access time update
    fsutil behavior set disablelastaccess 1

    Write-Host "   ✓ File system optimizations applied" -ForegroundColor Green
} catch {
    Write-Host "   ⚠ Failed to optimize file system: $_" -ForegroundColor Yellow
}

# 8. Configure Environment Variables
Write-Host "`n🌍 Setting Node.js Environment Variables..." -ForegroundColor Yellow

try {
    # Set UV threadpool size
    [Environment]::SetEnvironmentVariable("UV_THREADPOOL_SIZE", "8", "User")

    # Disable Node.js warnings in production
    [Environment]::SetEnvironmentVariable("NODE_NO_WARNINGS", "1", "User")

    # Optimize chokidar file watcher
    [Environment]::SetEnvironmentVariable("CHOKIDAR_USEPOLLING", "false", "User")
    [Environment]::SetEnvironmentVariable("CHOKIDAR_INTERVAL", "100", "User")

    Write-Host "   ✓ Environment variables configured" -ForegroundColor Green
    Write-Host "   ℹ You may need to restart your terminal for changes to take effect" -ForegroundColor Gray
} catch {
    Write-Host "   ⚠ Failed to set environment variables: $_" -ForegroundColor Yellow
}

# 9. Generate Performance Report
Write-Host "`n📊 Generating System Performance Report..." -ForegroundColor Yellow

$report = @"

Windows Performance Optimization Report
Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
========================================

System Information:
- OS: $([System.Environment]::OSVersion.VersionString)
- Architecture: $([System.Environment]::Is64BitOperatingSystem)
- Processors: $([System.Environment]::ProcessorCount)
- Total Memory: $([math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 2)) GB

Optimizations Applied:
✓ Network stack tuning (TCP optimizations)
✓ Memory management configuration
✓ Windows Defender exclusions
✓ Process priority elevation
✓ High performance power plan
✓ File system optimizations
✓ Environment variables configured

Recommended Next Steps:
1. Restart your terminal or IDE to apply environment variable changes
2. Run benchmark suite: npm run benchmark
3. Monitor performance with: npm run profile:watch
4. Review optimization guide: docs/devops-optimization-guide.md

Performance Monitoring Commands:
- Check memory: Get-Process -Name node | Format-Table Name, CPU, PM, NPM, Handles
- Monitor network: netstat -e
- View TCP stats: netsh interface tcp show global

"@

Write-Host $report -ForegroundColor Cyan

# Save report to file
$reportPath = Join-Path (Get-Location).Path "windows-optimization-report.txt"
$report | Out-File -FilePath $reportPath -Encoding utf8

Write-Host "`n✅ Optimization complete! Report saved to: $reportPath" -ForegroundColor Green
Write-Host "`n⚠️ IMPORTANT: Restart your terminal/IDE for all changes to take effect" -ForegroundColor Yellow
Write-Host "=" * 70

# Optional: Prompt to restart
$restart = Read-Host "`nWould you like to restart now? (y/n)"
if ($restart -eq 'y' -or $restart -eq 'Y') {
    Write-Host "Restarting in 10 seconds... Press Ctrl+C to cancel" -ForegroundColor Yellow
    Start-Sleep -Seconds 10
    Restart-Computer -Force
}
