[CmdletBinding()]
param(
    [string]$BackupFile,
    [switch]$LatestDaily,
    [switch]$LatestMonthly,
    [switch]$TestRestore,
    [switch]$KeepTemporaryDatabase,
    [switch]$OnlyIfMonthlyDue,
    [string]$BackupRoot,
    [string]$DatabaseUrl,
    [string]$AdminDatabaseUrl,
    [string]$PgBin
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'backup-common.ps1')

if ($OnlyIfMonthlyDue -and (Get-Date).Day -ne 1) {
    Write-Host 'Monthly verification is not due today.'
    return
}

$projectRoot = Split-Path $PSScriptRoot -Parent
$envValues = Read-DotEnvFile -Path (Join-Path $projectRoot '.env')
if (-not $DatabaseUrl) { $DatabaseUrl = $envValues['DATABASE_URL'] }
if (-not $AdminDatabaseUrl) { $AdminDatabaseUrl = if ($envValues['BACKUP_ADMIN_DATABASE_URL']) { $envValues['BACKUP_ADMIN_DATABASE_URL'] } else { $DatabaseUrl } }
if (-not $BackupRoot) { $BackupRoot = if ($envValues['BACKUP_ROOT']) { $envValues['BACKUP_ROOT'] } else { Join-Path $projectRoot 'backups' } }
if (-not $DatabaseUrl) { throw 'DATABASE_URL is required in .env or -DatabaseUrl.' }

if (-not $BackupFile) {
    if ($LatestMonthly) {
        $BackupFile = Get-LatestBackup -Directory (Join-Path $BackupRoot 'monthly')
    } elseif ($LatestDaily) {
        $BackupFile = Get-LatestBackup -Directory (Join-Path $BackupRoot 'daily')
    } else {
        throw 'Pass -BackupFile, -LatestDaily, or -LatestMonthly.'
    }
}
$BackupFile = (Resolve-Path -LiteralPath $BackupFile).Path
$manifestPath = "$BackupFile.json"
if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "Backup manifest not found: $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $BackupFile).Hash
if ($actualHash -ne $manifest.sha256) {
    throw "SHA256 mismatch for $BackupFile"
}
if ((Get-Item -LiteralPath $BackupFile).Length -ne [long]$manifest.size) {
    throw "File size mismatch for $BackupFile"
}

$configuration = Get-DatabaseConfiguration -DatabaseUrl $DatabaseUrl
$pgRestore = Resolve-PostgresTool -Name 'pg_restore' -PgBin $PgBin
Invoke-PostgresTool -Tool $pgRestore -Arguments @('--list', $BackupFile) -Configuration $configuration | Out-Null
Write-Host "Backup structure and hash verified: $BackupFile"

if (-not $TestRestore) {
    return
}
if (-not $AdminDatabaseUrl) {
    throw 'BACKUP_ADMIN_DATABASE_URL is required for test restore.'
}

$adminConfiguration = Get-DatabaseConfiguration -DatabaseUrl $AdminDatabaseUrl
$createdb = Resolve-PostgresTool -Name 'createdb' -PgBin $PgBin
$dropdb = Resolve-PostgresTool -Name 'dropdb' -PgBin $PgBin
$psql = Resolve-PostgresTool -Name 'psql' -PgBin $PgBin
if (-not (Test-CanCreateDatabase -Psql $psql -Configuration $adminConfiguration)) {
    throw 'Monthly test restore requires a role with CREATEDB. Set BACKUP_ADMIN_DATABASE_URL in .env.'
}
$temporaryDatabase = "workwear_verify_$((Get-Date).ToString('yyyyMMddHHmmss'))_$([Guid]::NewGuid().ToString('N').Substring(0, 6))"
$databaseCreated = $false

try {
    $connectionArguments = @(
        "--host=$($adminConfiguration.Host)",
        "--port=$($adminConfiguration.Port)",
        "--username=$($adminConfiguration.User)"
    )
    Invoke-PostgresTool -Tool $createdb -Arguments ($connectionArguments + @('--maintenance-db=postgres', $temporaryDatabase)) -Configuration $adminConfiguration | Out-Null
    $databaseCreated = $true
    Invoke-PostgresTool -Tool $pgRestore -Arguments ($connectionArguments + @('--no-owner', '--no-privileges', '--exit-on-error', "--dbname=$temporaryDatabase", $BackupFile)) -Configuration $adminConfiguration | Out-Null
    $restoredCounts = Get-DatabaseCounts -Psql $psql -Configuration $adminConfiguration -DatabaseName $temporaryDatabase

    foreach ($name in @('employees', 'instances', 'documents', 'stockMovements')) {
        if ([long]$restoredCounts.$name -ne [long]$manifest.counts.$name) {
            throw "Restored count mismatch for ${name}: expected $($manifest.counts.$name), got $($restoredCounts.$name)."
        }
    }

    $verification = [ordered]@{
        verifiedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
        temporaryDatabase = $temporaryDatabase
        counts = $restoredCounts
        result = 'ok'
    }
    $verification | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath "$BackupFile.verified.json" -Encoding UTF8
    Write-Host "Test restore completed; counts match manifest: $temporaryDatabase"
} finally {
    if ($databaseCreated -and -not $KeepTemporaryDatabase) {
        $connectionArguments = @(
            "--host=$($adminConfiguration.Host)",
            "--port=$($adminConfiguration.Port)",
            "--username=$($adminConfiguration.User)"
        )
        Invoke-PostgresTool -Tool $dropdb -Arguments ($connectionArguments + @('--if-exists', '--force', '--maintenance-db=postgres', $temporaryDatabase)) -Configuration $adminConfiguration | Out-Null
        Write-Host "Temporary verification database removed: $temporaryDatabase"
    } elseif ($databaseCreated) {
        Write-Warning "Temporary verification database was kept for manual checks: $temporaryDatabase"
    }
}
