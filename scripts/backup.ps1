[CmdletBinding()]
param(
    [string]$BackupRoot,
    [string]$SecondaryPath,
    [string[]]$SecondaryPaths,
    [string]$DatabaseUrl,
    [string]$PgBin,
    [ValidateRange(1, 3650)][int]$LogRetentionDays = 90,
    [ValidateRange(0, 10)][int]$RequiredSecondaryCount = 0,
    [switch]$ForceMonthly,
    [switch]$RequireSecondary,
    [switch]$NotifyOnFailure
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'backup-common.ps1')
. (Join-Path $PSScriptRoot 'recovery-common.ps1')

$projectRoot = Split-Path $PSScriptRoot -Parent
$envValues = Read-DotEnvFile -Path (Join-Path $projectRoot '.env')
if (-not $DatabaseUrl) { $DatabaseUrl = $envValues['DATABASE_URL'] }
if (-not $BackupRoot) { $BackupRoot = if ($envValues['BACKUP_ROOT']) { $envValues['BACKUP_ROOT'] } else { Join-Path $projectRoot 'backups' } }
$resolvedSecondaryPaths = @(Resolve-BackupSecondaryPaths -EnvironmentValues $envValues -SecondaryPaths $SecondaryPaths -LegacySecondaryPath $SecondaryPath)
$minimumSecondaryCount = if ($RequiredSecondaryCount -gt 0) { $RequiredSecondaryCount } elseif ($RequireSecondary) { 1 } else { 0 }

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
$statusPath = Join-Path (Join-Path $BackupRoot 'status') 'latest.json'
$lockStream = $null
$backupStatus = $null
$recoveryQuorum = $null
$completedTargetIds = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)

function New-BackupTargetState {
    param(
        [Parameter(Mandatory = $true)][string]$Id,
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][string]$HostName,
        $PreviousStatus
    )

    $previousTarget = $null
    if ($PreviousStatus -and $PreviousStatus.PSObject.Properties['targets'] -and $PreviousStatus.targets) {
        $previousTarget = @($PreviousStatus.targets | Where-Object id -eq $Id | Select-Object -First 1)
        if ($previousTarget.Count -gt 0) { $previousTarget = $previousTarget[0] } else { $previousTarget = $null }
    }
    $previousSuccess = if ($previousTarget -and $previousTarget.PSObject.Properties['lastSuccessfulAtUtc']) { $previousTarget.lastSuccessfulAtUtc } else { $null }
    $previousFileName = if ($previousTarget -and $previousTarget.PSObject.Properties['fileName']) { $previousTarget.fileName } else { $null }
    $previousSize = if ($previousTarget -and $previousTarget.PSObject.Properties['sizeBytes']) { $previousTarget.sizeBytes } else { $null }
    return [PSCustomObject][ordered]@{
        id = $Id
        label = $Label
        host = $HostName
        status = 'pending'
        messageCode = 'pending'
        lastSuccessfulAtUtc = $previousSuccess
        fileName = $previousFileName
        sizeBytes = $previousSize
        totalBytes = $null
        freeBytes = $null
        freePercent = $null
    }
}

function Set-BackupTargetCapacity {
    param(
        [Parameter(Mandatory = $true)]$Target,
        [Parameter(Mandatory = $true)]$Capacity
    )

    $Target.totalBytes = $Capacity.TotalBytes
    $Target.freeBytes = $Capacity.AvailableBytes
    $Target.freePercent = $Capacity.FreePercent
    if ($Capacity.Status -eq 'critical') {
        $Target.status = 'error'
        $Target.messageCode = 'insufficient-space'
    } elseif ($Capacity.Status -eq 'warning') {
        $Target.status = 'warning'
        $Target.messageCode = 'low-space'
    }
}

function Complete-BackupTarget {
    param(
        [Parameter(Mandatory = $true)]$Target,
        [Parameter(Mandatory = $true)][string]$CompletedFileName,
        [Parameter(Mandatory = $true)][UInt64]$CompletedSizeBytes
    )

    if ($Target.status -ne 'warning') {
        $Target.status = 'ok'
        $Target.messageCode = 'ok'
    }
    $Target.lastSuccessfulAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    $Target.fileName = $CompletedFileName
    $Target.sizeBytes = $CompletedSizeBytes
    $completedTargetIds.Add($Target.id) | Out-Null
}

try {
    $lockStream = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    $previousStatus = Read-BackupStatusFile -Path $statusPath
    $targets = [Collections.Generic.List[object]]::new()
    $localTarget = New-BackupTargetState -Id 'primary' -Label 'PC #1' -HostName (Get-BackupDestinationHost -Path $BackupRoot) -PreviousStatus $previousStatus
    $targets.Add($localTarget)
    $secondaryEntries = [Collections.Generic.List[object]]::new()
    for ($index = 0; $index -lt $resolvedSecondaryPaths.Count; $index += 1) {
        $secondaryId = "secondary-$($index + 1)"
        $secondaryTarget = New-BackupTargetState -Id $secondaryId -Label "PC #$($index + 2)" -HostName (Get-BackupDestinationHost -Path $resolvedSecondaryPaths[$index]) -PreviousStatus $previousStatus
        $targets.Add($secondaryTarget)
        $secondaryEntries.Add([PSCustomObject]@{
            Path = $resolvedSecondaryPaths[$index]
            Target = $secondaryTarget
            CanCopy = $true
        })
    }
    $backupStatus = [PSCustomObject][ordered]@{
        formatVersion = 1
        attemptId = [Guid]::NewGuid().ToString('N')
        startedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
        finishedAtUtc = $null
        status = 'running'
        targets = @($targets)
    }
    Write-BackupStatusFile -Path $statusPath -Status $backupStatus

    $recoveryConfiguration = Get-RecoveryClusterSentinel -EnvironmentValues $envValues
    if ($recoveryConfiguration) {
        $recoveryQuorum = Get-PromotionQuorum -WitnessPaths $recoveryConfiguration.WitnessPaths `
            -ExpectedClusterId $recoveryConfiguration.ClusterId -ExpectedWitnessNodeIds $recoveryConfiguration.WitnessNodeIds
        if ($recoveryQuorum.activeNodeId -ne $recoveryConfiguration.NodeId) {
            throw 'This node is fenced and cannot publish backup sets.'
        }
    }

    if (-not $DatabaseUrl) {
        throw 'DATABASE_URL is required in .env or -DatabaseUrl.'
    }
    if ($resolvedSecondaryPaths.Count -lt $minimumSecondaryCount) {
        throw "At least $minimumSecondaryCount secondary backup paths are required; configured: $($resolvedSecondaryPaths.Count)."
    }

    $configuration = Get-DatabaseConfiguration -DatabaseUrl $DatabaseUrl
    $pgDump = Resolve-PostgresTool -Name 'pg_dump' -PgBin $PgBin
    $pgRestore = Resolve-PostgresTool -Name 'pg_restore' -PgBin $PgBin
    $psql = Resolve-PostgresTool -Name 'psql' -PgBin $PgBin

    $databaseSizeBytes = Get-DatabaseSizeBytes -Psql $psql -Configuration $configuration
    $hasMonthlyArchive = Get-ChildItem -LiteralPath $monthlyDirectory -Filter 'workwear_erp_*.dump' -File -ErrorAction SilentlyContinue | Select-Object -First 1
    $isMonthly = $ForceMonthly -or (Get-Date).Day -eq 1 -or -not $hasMonthlyArchive
    [UInt64]$requiredBytes = ([UInt64]$databaseSizeBytes * $(if ($isMonthly) { 2 } else { 1 })) + 64MB

    try {
        $localCapacity = Get-BackupStorageInfo -Path $BackupRoot -RequiredBytes $requiredBytes
        Set-BackupTargetCapacity -Target $localTarget -Capacity $localCapacity
        if ($localCapacity.Status -eq 'critical') {
            throw 'The primary backup destination does not have enough free space.'
        }
    } catch {
        $localTarget.status = 'error'
        if ($localTarget.messageCode -eq 'pending') { $localTarget.messageCode = 'unavailable' }
        throw
    }

    $secondaryFailures = [Collections.Generic.List[string]]::new()
    foreach ($entry in $secondaryEntries) {
        try {
            New-Item -ItemType Directory -Force -Path $entry.Path | Out-Null
            $capacity = Get-BackupStorageInfo -Path $entry.Path -RequiredBytes $requiredBytes
            Set-BackupTargetCapacity -Target $entry.Target -Capacity $capacity
            if ($capacity.Status -eq 'critical') {
                $entry.CanCopy = $false
                $secondaryFailures.Add("$($entry.Path): insufficient free space")
            }
        } catch {
            $entry.CanCopy = $false
            $entry.Target.status = 'error'
            if ($entry.Target.messageCode -eq 'pending') { $entry.Target.messageCode = 'unavailable' }
            $secondaryFailures.Add("$($entry.Path): capacity check failed")
        }
    }
    Write-BackupStatusFile -Path $statusPath -Status $backupStatus

    Write-BackupLog -Path $logPath -Message "Starting backup of database '$($configuration.Database)'."
    $release = Get-ApplicationReleaseMetadata -ProjectRoot $projectRoot
    if ($recoveryConfiguration -and ($release.isDirty -or -not $release.commit -or -not $release.tree -or -not $release.clientBuildSha256)) {
        throw 'Cluster backup requires a clean immutable Git release fingerprint.'
    }
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
        formatVersion = 2
        snapshotStartedAtUtc = $backupStatus.startedAtUtc
        createdAtUtc = (Get-Date).ToUniversalTime().ToString('o')
        fileName = $fileName
        release = $release
        clusterId = if ($envValues['WORKWEAR_CLUSTER_ID']) { $envValues['WORKWEAR_CLUSTER_ID'] } else { 'standalone' }
        sourceNodeId = if ($envValues['WORKWEAR_NODE_ID']) { $envValues['WORKWEAR_NODE_ID'] } else { $env:COMPUTERNAME }
        recoveryFenceConfigured = [bool]($recoveryConfiguration -and $recoveryQuorum)
        recoveryEpoch = if ($recoveryQuorum) { [Int64]$recoveryQuorum.epoch } else { $null }
        database = $configuration.Database
        host = $configuration.Host
        size = (Get-Item -LiteralPath $finalFile).Length
        sha256 = $hash
        counts = $counts
    }
    $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath "$finalFile.json" -Encoding UTF8
    "$hash  $fileName" | Set-Content -LiteralPath "$finalFile.sha256" -Encoding ASCII
    if ($isMonthly) {
        Copy-BackupSet -DumpFile $finalFile -Destination $monthlyDirectory | Out-Null
        Write-BackupLog -Path $logPath -Message "Monthly archive created: $fileName"
    }
    [UInt64]$completedSize = (Get-Item -LiteralPath $finalFile).Length
    Complete-BackupTarget -Target $localTarget -CompletedFileName $fileName -CompletedSizeBytes $completedSize

    foreach ($entry in $secondaryEntries) {
        if (-not $entry.CanCopy) {
            continue
        }
        try {
            $secondaryDaily = Join-Path $entry.Path 'daily'
            Copy-BackupSet -DumpFile $finalFile -Destination $secondaryDaily | Out-Null
            if ($isMonthly) {
                $secondaryMonthly = Join-Path $entry.Path 'monthly'
                Copy-BackupSet -DumpFile $finalFile -Destination $secondaryMonthly | Out-Null
            }
            Complete-BackupTarget -Target $entry.Target -CompletedFileName $fileName -CompletedSizeBytes $completedSize
            Write-BackupLog -Path $logPath -Message "Secondary copy verified: $($entry.Path)"
        } catch {
            $entry.Target.status = 'error'
            $entry.Target.messageCode = 'copy-failed'
            $secondaryFailures.Add("$($entry.Path): $($_.Exception.Message)")
            Write-BackupLog -Path $logPath -Level 'ERROR' -Message "Secondary copy failed: $($entry.Path)"
        }
    }
    if ($resolvedSecondaryPaths.Count -eq 0) {
        Write-BackupLog -Path $logPath -Level 'WARN' -Message 'Secondary backup path is not configured.'
    }
    if ($secondaryFailures.Count -gt 0) {
        throw "One or more secondary backups failed: $($secondaryFailures -join '; ')"
    }

    Get-ChildItem -LiteralPath $logDirectory -Filter 'backup_*.log' -File |
        Where-Object LastWriteTimeUtc -lt (Get-Date).ToUniversalTime().AddDays(-$LogRetentionDays) |
        Remove-Item -Force

    $backupStatus.status = if (@($targets | Where-Object status -eq 'warning').Count -gt 0) { 'warning' } else { 'ok' }
    $backupStatus.finishedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    Write-BackupStatusFile -Path $statusPath -Status $backupStatus
    Write-BackupLog -Path $logPath -Message "Backup completed and verified: $finalFile"
    Write-Output $finalFile
} catch {
    $backupError = $_
    if (Test-Path -LiteralPath $partialFile) {
        Remove-Item -LiteralPath $partialFile -Force
    }
    if ($backupStatus -and $lockStream) {
        foreach ($target in $backupStatus.targets) {
            if (-not $completedTargetIds.Contains($target.id) -and $target.status -ne 'error') {
                $target.status = 'error'
                $target.messageCode = 'backup-failed'
            }
        }
        $backupStatus.status = 'error'
        $backupStatus.finishedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
        try {
            Write-BackupStatusFile -Path $statusPath -Status $backupStatus
        } catch {
            Write-BackupLog -Path $logPath -Level 'ERROR' -Message 'Unable to write the backup status file.'
        }
    }
    Write-BackupLog -Path $logPath -Level 'ERROR' -Message $backupError.Exception.Message
    if ($NotifyOnFailure -and (Get-Command msg.exe -ErrorAction SilentlyContinue)) {
        & msg.exe '*' "Workwear ERP backup failed. Check $logPath" 2>$null
    }
    exit 1
} finally {
    if ($lockStream) {
        $lockStream.Dispose()
    }
}
