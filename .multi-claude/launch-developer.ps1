# Developer Claude Launcher - Task Monitoring Version

# Change to project directory
Set-Location "C:\Users\scarm"

$host.ui.RawUI.WindowTitle = "Developer Claude - Claude Code CLI"

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor green
Write-Host "  DEVELOPER CLAUDE - TASK MONITOR" -ForegroundColor green
Write-Host "  Instance ID: developer" -ForegroundColor green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor green
Write-Host ""

# Initialize status
$status = @{
    instance = "developer"
    timestamp = (Get-Date).ToString("o")
    status = "idle"
    current_task = "awaiting task assignment"
    progress = 0
    findings = @()
    blockers = @()
    waiting_for = $null
} | ConvertTo-Json

$status | Out-File -FilePath ".multi-claude/status-developer.json" -Encoding utf8

Write-Host "✓ Status initialized" -ForegroundColor Green
Write-Host "✓ Ready to receive tasks" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Role: .multi-claude/claude-developer-task.md" -ForegroundColor Cyan
Write-Host "📊 Status: .multi-claude/status-developer.json" -ForegroundColor Cyan
Write-Host "📥 Tasks: .multi-claude/tasks/developer-current-task.md" -ForegroundColor Cyan
Write-Host ""

# Display role definition
Write-Host "━━━ ROLE DEFINITION ━━━" -ForegroundColor Yellow
Get-Content ".multi-claude/claude-developer-task.md" | ForEach-Object { Write-Host $_ -ForegroundColor Gray }
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host ""

# Task monitoring loop
$taskFile = ".multi-claude/tasks/developer-current-task.md"
$lastProcessed = $null

Write-Host "🔍 Monitoring for task assignments..." -ForegroundColor Yellow
Write-Host "   Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""

while ($true) {
    if (Test-Path $taskFile) {
        $currentModified = (Get-Item $taskFile).LastWriteTime

        if ($lastProcessed -eq $null -or $currentModified -gt $lastProcessed) {
            Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
            Write-Host "  NEW TASK DETECTED!" -ForegroundColor Green
            Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
            Write-Host ""

            # Update status to working
            $status = @{
                instance = "developer"
                timestamp = (Get-Date).ToString("o")
                status = "working"
                current_task = "Processing assigned task"
                progress = 10
                findings = @()
                blockers = @()
                waiting_for = $null
            } | ConvertTo-Json
            $status | Out-File -FilePath ".multi-claude/status-developer.json" -Encoding utf8

            # Display task
            Write-Host "📋 TASK ASSIGNMENT:" -ForegroundColor Cyan
            Write-Host ""
            Get-Content $taskFile | ForEach-Object { Write-Host $_ }
            Write-Host ""
            Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
            Write-Host ""

            # Process with Claude
            Write-Host "🤖 Starting Claude Code CLI to process task..." -ForegroundColor Yellow
            Write-Host ""

            # Feed both role definition and task to Claude
            $prompt = @"
You are the Developer Claude in a multi-Claude coordination system.

ROLE:
$(Get-Content ".multi-claude/claude-developer-task.md" -Raw)

CURRENT TASK:
$(Get-Content $taskFile -Raw)

Please complete the assigned task according to your role. When finished:
1. Write your deliverables to .multi-claude/shared/
2. Update .multi-claude/status-developer.json with progress

Start working now!
"@

            $prompt | claude

            $lastProcessed = $currentModified

            # Update status to complete
            $status = @{
                instance = "developer"
                timestamp = (Get-Date).ToString("o")
                status = "complete"
                current_task = "Task completed"
                progress = 100
                findings = @()
                blockers = @()
                waiting_for = $null
            } | ConvertTo-Json
            $status | Out-File -FilePath ".multi-claude/status-developer.json" -Encoding utf8

            Write-Host ""
            Write-Host "✅ Task processing complete!" -ForegroundColor Green
            Write-Host "   Waiting for next task..." -ForegroundColor Gray
            Write-Host ""
        }
    }

    Start-Sleep -Seconds 5
}
