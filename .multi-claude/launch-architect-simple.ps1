# Architect Claude Launcher - Simple Version
Set-Location "C:\Users\scarm"

$host.ui.RawUI.WindowTitle = "Architect Claude - Task Monitor"

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "ARCHITECT CLAUDE - TASK MONITOR" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

# Initialize status
$statusPath = ".multi-claude/status-architect.json"
$taskPath = ".multi-claude/tasks/architect-current-task.md"
$rolePath = ".multi-claude/claude-architect-task.md"

$initStatus = @{
    instance = "architect"
    timestamp = (Get-Date).ToString("o")
    status = "idle"
    current_task = "awaiting task assignment"
    progress = 0
    findings = @()
    blockers = @()
    waiting_for = $null
}

$initStatus | ConvertTo-Json | Out-File $statusPath -Encoding utf8

Write-Host "✓ Status initialized" -ForegroundColor Green
Write-Host "✓ Monitoring: $taskPath" -ForegroundColor Cyan
Write-Host ""

# Display role
Write-Host "━━━ ROLE ━━━" -ForegroundColor Yellow
Get-Content $rolePath
Write-Host "━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host ""

$lastProcessed = $null

Write-Host "🔍 Monitoring for tasks... (Press Ctrl+C to stop)" -ForegroundColor Yellow
Write-Host ""

while ($true) {
    if (Test-Path $taskPath) {
        $currentModified = (Get-Item $taskPath).LastWriteTime

        if (($null -eq $lastProcessed) -or ($currentModified -gt $lastProcessed)) {
            Write-Host "━━━ NEW TASK DETECTED ━━━" -ForegroundColor Green
            Write-Host ""

            # Update status
            $workStatus = @{
                instance = "architect"
                timestamp = (Get-Date).ToString("o")
                status = "working"
                current_task = "Processing task"
                progress = 10
                findings = @()
                blockers = @()
                waiting_for = $null
            }
            $workStatus | ConvertTo-Json | Out-File $statusPath -Encoding utf8

            # Show task
            Write-Host "📋 TASK:" -ForegroundColor Cyan
            Get-Content $taskPath
            Write-Host ""

            # Build prompt file
            $promptFile = ".multi-claude/temp-prompt-architect.txt"
            "You are Architect Claude in a multi-Claude coordination system.`n" | Out-File $promptFile -Encoding utf8
            "ROLE:`n" | Out-File $promptFile -Append -Encoding utf8
            Get-Content $rolePath | Out-File $promptFile -Append -Encoding utf8
            "`n`nCURRENT TASK:`n" | Out-File $promptFile -Append -Encoding utf8
            Get-Content $taskPath | Out-File $promptFile -Append -Encoding utf8
            "`n`nComplete this task. Write deliverables to .multi-claude/shared/" | Out-File $promptFile -Append -Encoding utf8

            Write-Host "🤖 Starting Claude..." -ForegroundColor Yellow
            Get-Content $promptFile | claude

            Remove-Item $promptFile -ErrorAction SilentlyContinue

            $lastProcessed = $currentModified

            # Mark complete
            $doneStatus = @{
                instance = "architect"
                timestamp = (Get-Date).ToString("o")
                status = "complete"
                current_task = "Task completed"
                progress = 100
                findings = @()
                blockers = @()
                waiting_for = $null
            }
            $doneStatus | ConvertTo-Json | Out-File $statusPath -Encoding utf8

            Write-Host ""
            Write-Host "✅ Task complete!" -ForegroundColor Green
            Write-Host ""
        }
    }

    Start-Sleep -Seconds 5
}
