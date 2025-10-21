# Test Architect Launcher
Set-Location "C:\Users\scarm"
$host.ui.RawUI.WindowTitle = "Architect Test"

Write-Host "Architect Claude - Task Monitor" -ForegroundColor Cyan
Write-Host ""

$statusPath = ".multi-claude/status-architect.json"
$taskPath = ".multi-claude/tasks/architect-current-task.md"

# Init status
$initStatus = @{}
$initStatus.instance = "architect"
$initStatus.timestamp = (Get-Date).ToString("o")
$initStatus.status = "idle"
$initStatus.current_task = "awaiting"
$initStatus.progress = 0
$initStatus.findings = @()
$initStatus.blockers = @()
$initStatus.waiting_for = $null

$json = $initStatus | ConvertTo-Json
$json | Out-File $statusPath -Encoding utf8

Write-Host "Status initialized" -ForegroundColor Green
Write-Host "Monitoring: $taskPath" -ForegroundColor Cyan
Write-Host ""

$lastTime = $null

while ($true)
{
    if (Test-Path $taskPath)
    {
        $modTime = (Get-Item $taskPath).LastWriteTime

        if (($null -eq $lastTime) -or ($modTime -gt $lastTime))
        {
            Write-Host "New task detected!" -ForegroundColor Green

            $workStatus = @{}
            $workStatus.instance = "architect"
            $workStatus.timestamp = (Get-Date).ToString("o")
            $workStatus.status = "working"
            $workStatus.current_task = "Processing"
            $workStatus.progress = 50
            $workStatus.findings = @()
            $workStatus.blockers = @()
            $workStatus.waiting_for = $null

            $workJson = $workStatus | ConvertTo-Json
            $workJson | Out-File $statusPath -Encoding utf8

            Write-Host "Task:" -ForegroundColor Cyan
            Get-Content $taskPath
            Write-Host ""

            $lastTime = $modTime

            Write-Host "Task processed!" -ForegroundColor Green
        }
    }

    Start-Sleep -Seconds 5
}
