[CmdletBinding()]
param(
    [Alias('DailyAt')][datetime]$HourlyStartAt = (Get-Date).AddHours(1),
    [datetime]$MonthlyVerifyAt = '03:00',
    [string]$TaskUser = 'SYSTEM',
    [PSCredential]$TaskCredential,
    [ValidateRange(1, 2)][int]$RequiredSecondaryCount = 2,
    [switch]$RunBackupNow
)

$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run PowerShell as Administrator.'
}

$backupScript = (Resolve-Path (Join-Path $PSScriptRoot 'backup.ps1')).Path
$verifyScript = (Resolve-Path (Join-Path $PSScriptRoot 'verify-backup.ps1')).Path
$powerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$backupAction = New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$backupScript`" -RequiredSecondaryCount $RequiredSecondaryCount -NotifyOnFailure"
$verifyAction = New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$verifyScript`" -LatestMonthly -TestRestore -OnlyIfMonthlyDue"
$backupTrigger = New-ScheduledTaskTrigger -Once -At $HourlyStartAt -RepetitionInterval (New-TimeSpan -Hours 1)
$verifyTrigger = New-ScheduledTaskTrigger -Daily -At $MonthlyVerifyAt
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 4)
$backupTaskName = 'Workwear ERP Hourly Backup'
$legacyBackupTaskName = 'Workwear ERP Daily Backup'

if ($TaskUser -eq 'SYSTEM') {
    $taskPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    Register-ScheduledTask -TaskName $backupTaskName -Action $backupAction -Trigger $backupTrigger -Settings $settings -Principal $taskPrincipal -Force | Out-Null
    Register-ScheduledTask -TaskName 'Workwear ERP Monthly Restore Test' -Action $verifyAction -Trigger $verifyTrigger -Settings $settings -Principal $taskPrincipal -Force | Out-Null
} else {
    if (-not $TaskCredential) {
        $TaskCredential = Get-Credential -UserName $TaskUser -Message 'Credentials for the Workwear ERP scheduled tasks'
    }
    if (-not $TaskCredential) {
        throw 'Task credentials are required for a non-SYSTEM account.'
    }
    $credentialUser = $TaskCredential.UserName
    $credentialPassword = $TaskCredential.GetNetworkCredential().Password
    Register-ScheduledTask -TaskName $backupTaskName -Action $backupAction -Trigger $backupTrigger -Settings $settings -User $credentialUser -Password $credentialPassword -RunLevel Highest -Force | Out-Null
    Register-ScheduledTask -TaskName 'Workwear ERP Monthly Restore Test' -Action $verifyAction -Trigger $verifyTrigger -Settings $settings -User $credentialUser -Password $credentialPassword -RunLevel Highest -Force | Out-Null
}
if (Get-ScheduledTask -TaskName $legacyBackupTaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $legacyBackupTaskName -Confirm:$false
}

if ($RunBackupNow) {
    $taskName = $backupTaskName
    $previousRunTime = (Get-ScheduledTaskInfo -TaskName $taskName).LastRunTime
    Start-ScheduledTask -TaskName $taskName
    $deadline = (Get-Date).AddMinutes(10)
    do {
        Start-Sleep -Seconds 2
        $task = Get-ScheduledTask -TaskName $taskName
        $taskInfo = Get-ScheduledTaskInfo -TaskName $taskName
        $currentRunFinished = $taskInfo.LastRunTime -gt $previousRunTime -and $task.State -notin 'Running', 'Queued'
    } while (-not $currentRunFinished -and (Get-Date) -lt $deadline)
    if (-not $currentRunFinished) {
        throw "Initial backup task did not finish within 10 minutes: $taskName"
    }
    if ($taskInfo.LastTaskResult -ne 0) {
        throw "Initial backup task failed with result $($taskInfo.LastTaskResult): $taskName"
    }
    & $verifyScript -LatestMonthly -TestRestore
    if ($LASTEXITCODE -ne 0) {
        throw 'Initial monthly restore verification failed.'
    }
}

Write-Host "Scheduled tasks installed for $TaskUser. Hourly backup starts at $($HourlyStartAt.ToString('HH:mm')); monthly verification check: $($MonthlyVerifyAt.ToString('HH:mm'))."
