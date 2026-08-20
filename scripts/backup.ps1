[CmdletBinding()]
param(
    [string]$BackupRoot,
    [string]$SecondaryPath,
    [string]$DatabaseUrl,
    [string]$PgBin,
    [ValidateRange(1, 3650)][int]$LogRetentionDays = 90,
    [switch]$ForceMonthly,
    [switch]$RequireSecondary,
    [switch]$NotifyOnFailure
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'backup-common.ps1')

$projectRoot = Split-Path $PSScriptRoot -Parent
$envValues = Read-DotEnvFile -Path (Join-Path $projectRoot '.env')
if (-not $DatabaseUrl) { $DatabaseUrl = $envValues['DATABASE_URL'] }
if (-not $BackupRoot) { $BackupRoot = if ($envValues['BACKUP_ROOT']) { $envValues['BACKUP_ROOT'] } else { Join-Path $projectRoot 'backups' } }
if (-not $SecondaryPath) { $SecondaryPath = $envValues['BACKUP_SECONDARY_PATH'] }
if (-not $DatabaseUrl) { throw 'DATABASE_URL is required in .env or -DatabaseUrl.' }

$BackupRoot = [IO.Path]::GetFullPath($BackupRoot)
$dailyDirectory = Join-Path $BackupRoot 'daily'
$monthlyDirectory = Join-Path $BackupRoot 'monthly'
$logDirectory = Join-Path $BackupRoot 'logs'
foreach ($directory in @($BackupRoot, $dailyDirectory, $monthlyDirectory, $logDirectory)) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
}

$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$logPath = Join-Path $logDirectory "backup_$((Get-Date).ToString('yyyyMMdd')).log"
$fileName = "workwear_erp_$timestamp.dump"
$partialFile = Join-Path $dailyDirectory "$fileName.partial"
$finalFile = Join-Path $dailyDirectory $fileName
$lockPath = Join-Path $BackupRoot 'backup.lock'
$lockStream = $null

try {
    $lockStream = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    $configuration = Get-DatabaseConfiguration -DatabaseUrl $DatabaseUrl
    $pgDump = Resolve-PostgresTool -Name 'pg_dump' -PgBin $PgBin
    $pgRestore = Resolve-PostgresTool -Name 'pg_restore' -PgBin $PgBin
    $psql = Resolve-PostgresTool -Name 'psql' -PgBin $PgBin

    Write-BackupLog -Path $logPath -Message "Starting backup of database '$($configuration.Database)'."
    $counts = Get-DatabaseCounts -Psql $psql -Configuration $configuration
    $dumpArguments = @(
        "--host=$($configuration.Host)",
        "--port=$($configuration.Port)",
        "--username=$($configuration.User)",
        '--format=custom',
        '--compress=6',
        '--no-owner',
        "--file=$partialFile",
        $configuration.Database
    )
    Invoke-PostgresTool -Tool $pgDump -Arguments $dumpArguments -Configuration $configuration | Out-Null
    Invoke-PostgresTool -Tool $pgRestore -Arguments @('--list', $partialFile) -Configuration $configuration | Out-Null
    Move-Item -LiteralPath $partialFile -Destination $finalFile

    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $finalFile).Hash
    $manifest = [ordered]@{
        formatVersion = 1
        createdAtUtc = (Get-Date).ToUniversalTime().ToString('o')
        fileName = $fileName
        database = $configuration.Database
        host = $configuration.Host
        size = (Get-Item -LiteralPath $finalFile).Length
        sha256 = $hash
        counts = $counts
    }
    $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath "$finalFile.json" -Encoding UTF8
    "$hash  $fileName" | Set-Content -LiteralPath "$finalFile.sha256" -Encoding ASCII
    $isMonthly = $ForceMonthly -or (Get-Date).Day -eq 1
    if ($isMonthly) {
        Copy-BackupSet -DumpFile $finalFile -Destination $monthlyDirectory | Out-Null
        Write-BackupLog -Path $logPath -Message "Monthly archive created: $fileName"
    }

    if ($SecondaryPath) {
        $secondaryDaily = Join-Path $SecondaryPath 'daily'
        Copy-BackupSet -DumpFile $finalFile -Destination $secondaryDaily | Out-Null
        if ($isMonthly) {
            $secondaryMonthly = Join-Path $SecondaryPath 'monthly'
            Copy-BackupSet -DumpFile $finalFile -Destination $secondaryMonthly | Out-Null
        }
        Write-BackupLog -Path $logPath -Message "Secondary copy verified: $SecondaryPath"
    } elseif ($RequireSecondary) {
        throw 'BACKUP_SECONDARY_PATH is required but was not configured.'
    } else {
        Write-BackupLog -Path $logPath -Level 'WARN' -Message 'Secondary backup path is not configured.'
    }

    Get-ChildItem -LiteralPath $logDirectory -Filter 'backup_*.log' -File |
        Where-Object LastWriteTimeUtc -lt (Get-Date).ToUniversalTime().AddDays(-$LogRetentionDays) |
        Remove-Item -Force

    Write-BackupLog -Path $logPath -Message "Backup completed and verified: $finalFile"
    Write-Output $finalFile
} catch {
    if (Test-Path -LiteralPath $partialFile) {
        Remove-Item -LiteralPath $partialFile -Force
    }
    Write-BackupLog -Path $logPath -Level 'ERROR' -Message $_.Exception.Message
    if ($NotifyOnFailure -and (Get-Command msg.exe -ErrorAction SilentlyContinue)) {
        & msg.exe '*' "Workwear ERP backup failed. Check $logPath" 2>$null
    }
    exit 1
} finally {
    if ($lockStream) {
        $lockStream.Dispose()
    }
}
