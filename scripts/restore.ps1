[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory = $true)][string]$BackupFile,
    [string]$DatabaseUrl,
    [string]$PgBin,
    [string]$BackupRoot,
    [string]$ApplicationServiceName,
    [switch]$SkipSafetyBackup,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'backup-common.ps1')

$projectRoot = Split-Path $PSScriptRoot -Parent
$envValues = Read-DotEnvFile -Path (Join-Path $projectRoot '.env')
if (-not $DatabaseUrl) { $DatabaseUrl = $envValues['DATABASE_URL'] }
if (-not $BackupRoot) { $BackupRoot = if ($envValues['BACKUP_ROOT']) { $envValues['BACKUP_ROOT'] } else { Join-Path $projectRoot 'backups' } }
if (-not $DatabaseUrl) { throw 'DATABASE_URL is required in .env or -DatabaseUrl.' }

$requestedWhatIf = $WhatIfPreference
$WhatIfPreference = $false
try {
    $BackupFile = (Resolve-Path -LiteralPath $BackupFile).Path
    & (Join-Path $PSScriptRoot 'verify-backup.ps1') -BackupFile $BackupFile -DatabaseUrl $DatabaseUrl -PgBin $PgBin
} finally {
    $WhatIfPreference = $requestedWhatIf
}

$restoreConfiguration = Get-DatabaseConfiguration -DatabaseUrl $DatabaseUrl
$restoreTarget = "database '$($restoreConfiguration.Database)' on $($restoreConfiguration.Host):$($restoreConfiguration.Port)"
if ($Force) {
    $ConfirmPreference = 'None'
}
if (-not $PSCmdlet.ShouldProcess($restoreTarget, "Replace database contents from $BackupFile")) {
    Write-Host 'Restore cancelled.'
    exit 0
}

$service = $null
$serviceWasRunning = $false
$safetyBackup = $null
try {
    if ($ApplicationServiceName) {
        $service = Get-Service -Name $ApplicationServiceName -ErrorAction Stop
        if ($service.Status -ne 'Stopped') {
            Stop-Service -Name $ApplicationServiceName -Force
            $service.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30))
            $serviceWasRunning = $true
        }
    } else {
        Write-Warning 'Stop the application backend before restore. No -ApplicationServiceName was provided.'
    }

    if (-not $SkipSafetyBackup) {
        $preRestoreRoot = Join-Path $BackupRoot 'pre-restore'
        $safetyBackup = & (Join-Path $PSScriptRoot 'backup.ps1') -BackupRoot $preRestoreRoot -DatabaseUrl $DatabaseUrl -PgBin $PgBin
        if ($LASTEXITCODE -ne 0) {
            throw 'The pre-restore safety backup failed; restore was cancelled.'
        }
    }

    $configuration = $restoreConfiguration
    $pgRestore = Resolve-PostgresTool -Name 'pg_restore' -PgBin $PgBin
    $arguments = @(
        "--host=$($configuration.Host)",
        "--port=$($configuration.Port)",
        "--username=$($configuration.User)",
        "--dbname=$($configuration.Database)",
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        '--exit-on-error',
        $BackupFile
    )
    Invoke-PostgresTool -Tool $pgRestore -Arguments $arguments -Configuration $configuration | Out-Null
    $psql = Resolve-PostgresTool -Name 'psql' -PgBin $PgBin
    $counts = Get-DatabaseCounts -Psql $psql -Configuration $configuration
    Write-Host "Restore completed. Counts: employees=$($counts.employees), instances=$($counts.instances), documents=$($counts.documents), stockMovements=$($counts.stockMovements)."
    if ($safetyBackup) {
        Write-Host "Pre-restore safety backup: $safetyBackup"
    }
} finally {
    if ($service -and $serviceWasRunning) {
        Start-Service -Name $ApplicationServiceName
        $service.WaitForStatus('Running', [TimeSpan]::FromSeconds(30))
    }
}
