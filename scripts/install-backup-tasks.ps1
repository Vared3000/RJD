[CmdletBinding()]
param(
    [datetime]$DailyAt = '02:00',
    [datetime]$MonthlyVerifyAt = '03:00',
    [string]$TaskUser = 'SYSTEM',
    [PSCredential]$TaskCredential
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
$backupAction = New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$backupScript`" -RequireSecondary -NotifyOnFailure"
$verifyAction = New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$verifyScript`" -LatestMonthly -TestRestore -OnlyIfMonthlyDue"
$backupTrigger = New-ScheduledTaskTrigger -Daily -At $DailyAt
$verifyTrigger = New-ScheduledTaskTrigger -Daily -At $MonthlyVerifyAt
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 4)

if ($TaskUser -eq 'SYSTEM') {
    $taskPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    Register-ScheduledTask -TaskName 'Workwear ERP Daily Backup' -Action $backupAction -Trigger $backupTrigger -Settings $settings -Principal $taskPrincipal -Force | Out-Null
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
    Register-ScheduledTask -TaskName 'Workwear ERP Daily Backup' -Action $backupAction -Trigger $backupTrigger -Settings $settings -User $credentialUser -Password $credentialPassword -RunLevel Highest -Force | Out-Null
    Register-ScheduledTask -TaskName 'Workwear ERP Monthly Restore Test' -Action $verifyAction -Trigger $verifyTrigger -Settings $settings -User $credentialUser -Password $credentialPassword -RunLevel Highest -Force | Out-Null
}

Write-Host "Scheduled tasks installed for $TaskUser. Daily backup: $($DailyAt.ToString('HH:mm')); monthly verification check: $($MonthlyVerifyAt.ToString('HH:mm'))."
