# Auto-Cleanup Scheduler - Sets up automatic zombie process cleanup
# Runs ai-process-cleaner.ps1 every 30 minutes

$ScriptPath = "C:\Users\scarm\scripts\ai-process-cleaner.ps1"
$TaskName = "AI-Bridge-Zombie-Cleanup"
$TaskDescription = "Automatically kills zombie Node.js processes every 30 minutes"

Write-Host "`nCreating scheduled task: $TaskName" -ForegroundColor Cyan

# Define the action
$Action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`" -Kill"

# Define trigger - every 30 minutes
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 30)

# Define settings
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable:$false `
    -MultipleInstances IgnoreNew

# Register the task
try {
    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $Action `
        -Trigger $Trigger `
        -Settings $Settings `
        -Description $TaskDescription `
        -Force `
        -ErrorAction Stop

    Write-Host "Success! Task created and scheduled." -ForegroundColor Green
    Write-Host "`nTask Details:" -ForegroundColor Yellow
    Write-Host "  Name: $TaskName"
    Write-Host "  Runs: Every 30 minutes"
    Write-Host "  Action: Kill zombie Node.js processes"
    Write-Host "  Script: $ScriptPath"

    Write-Host "`nManage this task:" -ForegroundColor Cyan
    Write-Host "  View: Get-ScheduledTask -TaskName '$TaskName'"
    Write-Host "  Run now: Start-ScheduledTask -TaskName '$TaskName'"
    Write-Host "  Disable: Disable-ScheduledTask -TaskName '$TaskName'"
    Write-Host "  Remove: Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"

} catch {
    Write-Host "Error creating scheduled task: $_" -ForegroundColor Red
    Write-Host "`nNote: You may need to run this script as Administrator" -ForegroundColor Yellow
}
