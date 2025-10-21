# Developer Claude Launcher V2
Set-Location "C:\Users\scarm"
$host.ui.RawUI.WindowTitle = "Developer Claude - Task Monitor"

Write-Host "===================================" -ForegroundColor Green
Write-Host "DEVELOPER CLAUDE - TASK MONITOR" -ForegroundColor Green
Write-Host "===================================" -ForegroundColor Green
Write-Host ""

$statusPath = ".multi-claude/status-developer.json"
$taskPath = ".multi-claude/tasks/developer-current-task.md"
$rolePath = ".multi-claude/claude-developer-task.md"
$sharedPath = ".multi-claude/shared"

# Initialize status
$initStatus = @{}
$initStatus.instance = "developer"
$initStatus.timestamp = (Get-Date).ToString("o")
$initStatus.status = "idle"
$initStatus.current_task = "awaiting task assignment"
$initStatus.progress = 0
$initStatus.findings = @()
$initStatus.blockers = @()
$initStatus.waiting_for = $null

$initStatus | ConvertTo-Json | Out-File $statusPath -Encoding utf8

Write-Host "Status initialized" -ForegroundColor Green
Write-Host "Task file: $taskPath" -ForegroundColor Cyan
Write-Host "Role file: $rolePath" -ForegroundColor Cyan
Write-Host ""

# Display role
Write-Host "--- ROLE DEFINITION ---" -ForegroundColor Yellow
Get-Content $rolePath | ForEach-Object { Write-Host $_ -ForegroundColor Gray }
Write-Host "------------------------" -ForegroundColor Yellow
Write-Host ""

$lastProcessed = $null

Write-Host "Monitoring for task assignments..." -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""

while ($true)
{
    if (Test-Path $taskPath)
    {
        $currentModified = (Get-Item $taskPath).LastWriteTime

        if (($null -eq $lastProcessed) -or ($currentModified -gt $lastProcessed))
        {
            Write-Host "======================================" -ForegroundColor Green
            Write-Host "NEW TASK DETECTED!" -ForegroundColor Green
            Write-Host "======================================" -ForegroundColor Green
            Write-Host ""

            # Update status to working
            $workStatus = @{}
            $workStatus.instance = "developer"
            $workStatus.timestamp = (Get-Date).ToString("o")
            $workStatus.status = "working"
            $workStatus.current_task = "Processing assigned task"
            $workStatus.progress = 10
            $workStatus.findings = @()
            $workStatus.blockers = @()
            $workStatus.waiting_for = $null

            $workStatus | ConvertTo-Json | Out-File $statusPath -Encoding utf8

            # Display task
            Write-Host "TASK ASSIGNMENT:" -ForegroundColor Cyan
            Write-Host ""
            Get-Content $taskPath
            Write-Host ""
            Write-Host "======================================" -ForegroundColor Cyan
            Write-Host ""

            # Build prompt file
            $promptFile = ".multi-claude/prompt-developer.txt"

            "You are Developer Claude in a multi-Claude coordination system.`n`n" | Out-File $promptFile -Encoding utf8
            "ROLE:`n" | Out-File $promptFile -Append -Encoding utf8
            Get-Content $rolePath | Out-File $promptFile -Append -Encoding utf8
            "`n`nCURRENT TASK:`n" | Out-File $promptFile -Append -Encoding utf8
            Get-Content $taskPath | Out-File $promptFile -Append -Encoding utf8
            "`n`nPlease complete this task. Write your deliverables to $sharedPath/" | Out-File $promptFile -Append -Encoding utf8

            # Process with Claude
            Write-Host "Starting Claude Code CLI..." -ForegroundColor Yellow
            Write-Host ""

            Get-Content $promptFile | claude

            Remove-Item $promptFile -ErrorAction SilentlyContinue

            $lastProcessed = $currentModified

            # Update status to complete
            $doneStatus = @{}
            $doneStatus.instance = "developer"
            $doneStatus.timestamp = (Get-Date).ToString("o")
            $doneStatus.status = "complete"
            $doneStatus.current_task = "Task completed"
            $doneStatus.progress = 100
            $doneStatus.findings = @()
            $doneStatus.blockers = @()
            $doneStatus.waiting_for = $null

            $doneStatus | ConvertTo-Json | Out-File $statusPath -Encoding utf8

            Write-Host ""
            Write-Host "Task processing complete!" -ForegroundColor Green
            Write-Host "Waiting for next task..." -ForegroundColor Gray
            Write-Host ""
        }
    }

    Start-Sleep -Seconds 5
}
