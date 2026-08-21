Set-StrictMode -Version Latest

$script:MaximumSafeJsonInteger = [Int64]9007199254740991

function Get-RecoveryProperty {
    param(
        [Parameter(Mandatory = $true)]$InputObject,
        [Parameter(Mandatory = $true)][string]$Name,
        [switch]$AllowNull
    )

    $property = $InputObject.PSObject.Properties[$Name]
    if (-not $property -or ((-not $AllowNull) -and $null -eq $property.Value)) {
        throw "Required property is missing: $Name"
    }
    return $property.Value
}

function ConvertTo-RecoveryUtcTimestamp {
    param(
        [Parameter(Mandatory = $true)]$Value,
        [Parameter(Mandatory = $true)][string]$Name
    )

    [DateTimeOffset]$parsed = [DateTimeOffset]::MinValue
    $valid = [DateTimeOffset]::TryParse(
        [string]$Value,
        [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::RoundtripKind,
        [ref]$parsed
    )
    if (-not $valid) {
        throw "Invalid UTC timestamp: $Name"
    }
    return $parsed.ToUniversalTime()
}

function Write-RecoveryJsonAtomic {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)]$Value
    )

    $fullPath = [IO.Path]::GetFullPath($Path)
    $directory = [IO.Path]::GetDirectoryName($fullPath)
    if (-not $directory) {
        throw 'An atomic JSON path must include a parent directory.'
    }
    [IO.Directory]::CreateDirectory($directory) | Out-Null

    $token = [Guid]::NewGuid().ToString('N')
    $temporaryPath = Join-Path $directory ".$([IO.Path]::GetFileName($fullPath)).$token.partial"
    $previousPath = Join-Path $directory ".$([IO.Path]::GetFileName($fullPath)).$token.previous"
    $stream = $null
    try {
        $json = $Value | ConvertTo-Json -Depth 12
        $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes($json)
        $stream = New-Object IO.FileStream(
            $temporaryPath,
            [IO.FileMode]::CreateNew,
            [IO.FileAccess]::Write,
            [IO.FileShare]::None,
            4096,
            [IO.FileOptions]::WriteThrough
        )
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Flush($true)
        $stream.Dispose()
        $stream = $null

        if ([IO.File]::Exists($fullPath)) {
            [IO.File]::Replace($temporaryPath, $fullPath, $previousPath, $true)
            [IO.File]::Delete($previousPath)
        } else {
            [IO.File]::Move($temporaryPath, $fullPath)
        }
    } finally {
        if ($stream) {
            $stream.Dispose()
        }
        if ([IO.File]::Exists($temporaryPath)) {
            [IO.File]::Delete($temporaryPath)
        }
        if ([IO.File]::Exists($previousPath)) {
            [IO.File]::Delete($previousPath)
        }
    }
}

function Read-RecoveryJournal {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $null
    }
    try {
        $journal = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        throw "Recovery journal is unreadable or invalid: $Path"
    }
    if ($null -eq $journal -or $journal -is [Array] -or $journal -is [string] -or $journal -is [ValueType]) {
        throw "Recovery journal must contain one JSON object: $Path"
    }
    return $journal
}

function Write-RecoveryJournal {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)]$Journal
    )

    if ($null -eq $Journal -or $Journal -is [Array] -or $Journal -is [string] -or $Journal -is [ValueType]) {
        throw 'Recovery journal must be one JSON object.'
    }
    Write-RecoveryJsonAtomic -Path $Path -Value $Journal
    return Read-RecoveryJournal -Path $Path
}

function Get-RecoveryClusterSentinel {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][Collections.IDictionary]$EnvironmentValues,
        [string]$DefaultStateRoot
    )

    $clusterId = [string]$EnvironmentValues['WORKWEAR_CLUSTER_ID']
    $nodeId = [string]$EnvironmentValues['WORKWEAR_NODE_ID']
    $rawWitnessPaths = [string]$EnvironmentValues['RECOVERY_WITNESS_PATHS']
    $configuredSentinelPath = [string]$EnvironmentValues['RECOVERY_SENTINEL_PATH']
    # Installer writes the default path variables for standalone nodes too; only
    # cluster identity/witness values or an existing sentinel enable fencing.
    $hasAnyEnvironmentSetting = [bool]($clusterId -or $nodeId -or $rawWitnessPaths)
    if (-not $DefaultStateRoot) {
        if ($env:ProgramData) {
            $DefaultStateRoot = Join-Path $env:ProgramData 'WorkwearERP\recovery'
        } else {
            $DefaultStateRoot = Join-Path ([IO.Path]::GetTempPath()) 'WorkwearERP\recovery'
        }
    }
    $sentinelPath = if ($configuredSentinelPath) {
        [IO.Path]::GetFullPath($configuredSentinelPath)
    } else {
        Join-Path ([IO.Path]::GetFullPath($DefaultStateRoot)) 'cluster-mode.json'
    }
    $hasSentinel = Test-Path -LiteralPath $sentinelPath -PathType Leaf
    if (-not $hasAnyEnvironmentSetting -and -not $hasSentinel) {
        return $null
    }
    if (-not $clusterId -or -not $nodeId -or -not $rawWitnessPaths -or -not $hasSentinel) {
        throw 'Recovery fencing configuration is incomplete or its protected sentinel is missing.'
    }

    $witnessPaths = @($rawWitnessPaths -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    if ($witnessPaths.Count -ne 2 -or @($witnessPaths | Where-Object { -not $_.StartsWith('\\') }).Count -gt 0) {
        throw 'Recovery fencing requires exactly two UNC witness paths.'
    }
    $witnessNodeIds = @($witnessPaths | ForEach-Object { $_.TrimStart('\').Split('\')[0].ToLowerInvariant() })
    if (@($witnessNodeIds | Select-Object -Unique).Count -ne 2) {
        throw 'Recovery fencing requires two distinct witness nodes.'
    }
    try {
        $sentinel = Get-Content -LiteralPath $sentinelPath -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        throw "Recovery cluster sentinel is unreadable or invalid: $sentinelPath"
    }
    if ($null -eq $sentinel -or $sentinel -is [Array] -or
        [int]$sentinel.formatVersion -ne 1 -or
        -not [string]::Equals([string]$sentinel.clusterId, $clusterId, [StringComparison]::Ordinal) -or
        -not [string]::Equals([string]$sentinel.nodeId, $nodeId, [StringComparison]::Ordinal) -or
        (@($sentinel.witnessPaths) -join ';') -ne ($witnessPaths -join ';') -or
        (@($sentinel.witnessNodeIds) -join ';') -ne ($witnessNodeIds -join ';')) {
        throw 'Recovery cluster sentinel does not match the node environment.'
    }
    return [PSCustomObject][ordered]@{
        Path = $sentinelPath
        ClusterId = $clusterId
        NodeId = $nodeId
        WitnessPaths = $witnessPaths
        WitnessNodeIds = $witnessNodeIds
        Value = $sentinel
    }
}

function Resolve-RecoveryExpectedRelease {
    param(
        [Parameter(Mandatory = $true)]$ExpectedRelease
    )

    $releaseId = [string](Get-RecoveryProperty -InputObject $ExpectedRelease -Name 'releaseId')
    $commitValue = Get-RecoveryProperty -InputObject $ExpectedRelease -Name 'commit' -AllowNull
    $treeValue = Get-RecoveryProperty -InputObject $ExpectedRelease -Name 'tree' -AllowNull
    $isDirty = [bool](Get-RecoveryProperty -InputObject $ExpectedRelease -Name 'isDirty')
    $clientBuildSha256 = [string](Get-RecoveryProperty -InputObject $ExpectedRelease -Name 'clientBuildSha256')
    $version = [string](Get-RecoveryProperty -InputObject $ExpectedRelease -Name 'version')
    $migrationHead = [string](Get-RecoveryProperty -InputObject $ExpectedRelease -Name 'migrationHead')
    if ([string]::IsNullOrWhiteSpace($releaseId) -or
        [string]::IsNullOrWhiteSpace($version) -or
        [string]::IsNullOrWhiteSpace($migrationHead) -or
        [string]$commitValue -notmatch '^[0-9a-fA-F]{40}$' -or
        [string]$treeValue -notmatch '^[0-9a-fA-F]{40}$' -or
        $clientBuildSha256 -notmatch '^[0-9a-fA-F]{64}$' -or
        $isDirty) {
        throw 'Recovery requires one clean immutable Git release (commit and tree fingerprint).'
    }
    return [PSCustomObject][ordered]@{
        releaseId = $releaseId
        commit = if ($null -eq $commitValue) { $null } else { [string]$commitValue }
        tree = if ($null -eq $treeValue) { $null } else { [string]$treeValue }
        isDirty = $isDirty
        clientBuildSha256 = $clientBuildSha256.ToLowerInvariant()
        version = $version
        migrationHead = $migrationHead
    }
}

function Test-RecoveryReleaseMatch {
    param(
        [Parameter(Mandatory = $true)]$Actual,
        [Parameter(Mandatory = $true)]$Expected
    )

    try {
        $actualReleaseId = [string](Get-RecoveryProperty -InputObject $Actual -Name 'releaseId')
        $actualCommitValue = Get-RecoveryProperty -InputObject $Actual -Name 'commit' -AllowNull
        $actualCommit = if ($null -eq $actualCommitValue) { $null } else { [string]$actualCommitValue }
        $actualTreeValue = Get-RecoveryProperty -InputObject $Actual -Name 'tree' -AllowNull
        $actualTree = if ($null -eq $actualTreeValue) { $null } else { [string]$actualTreeValue }
        $actualIsDirty = [bool](Get-RecoveryProperty -InputObject $Actual -Name 'isDirty')
        $actualClientBuildSha256 = [string](Get-RecoveryProperty -InputObject $Actual -Name 'clientBuildSha256')
        $actualVersion = [string](Get-RecoveryProperty -InputObject $Actual -Name 'version')
        $actualMigrationHead = [string](Get-RecoveryProperty -InputObject $Actual -Name 'migrationHead')
        return (
            [string]::Equals($actualReleaseId, $Expected.releaseId, [StringComparison]::Ordinal) -and
            [string]::Equals($actualCommit, $Expected.commit, [StringComparison]::OrdinalIgnoreCase) -and
            [string]::Equals($actualTree, $Expected.tree, [StringComparison]::OrdinalIgnoreCase) -and
            $actualIsDirty -eq $Expected.isDirty -and
            [string]::Equals($actualClientBuildSha256, $Expected.clientBuildSha256, [StringComparison]::OrdinalIgnoreCase) -and
            [string]::Equals($actualVersion, $Expected.version, [StringComparison]::Ordinal) -and
            [string]::Equals($actualMigrationHead, $Expected.migrationHead, [StringComparison]::Ordinal)
        )
    } catch {
        return $false
    }
}

function Get-RecoveryCandidates {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$BackupRoot,
        [Parameter(Mandatory = $true)]$ExpectedRelease,
        [Parameter(Mandatory = $true)][Alias('ClusterId')][string]$ExpectedClusterId,
        [Parameter(Mandatory = $true)][string]$ExpectedActiveNodeId,
        [Parameter(Mandatory = $true)][Int64]$ExpectedEpoch
    )

    if ([string]::IsNullOrWhiteSpace($ExpectedClusterId)) {
        throw 'Expected cluster id must not be empty.'
    }
    $expected = Resolve-RecoveryExpectedRelease -ExpectedRelease $ExpectedRelease
    $dailyDirectory = Join-Path ([IO.Path]::GetFullPath($BackupRoot)) 'daily'
    if (-not (Test-Path -LiteralPath $dailyDirectory -PathType Container)) {
        return @()
    }

    $candidates = [Collections.Generic.List[object]]::new()
    $dumpFiles = Get-ChildItem -LiteralPath $dailyDirectory -Filter 'workwear_erp_*.dump' -File -ErrorAction SilentlyContinue
    foreach ($dumpFile in $dumpFiles) {
        try {
            if ($dumpFile.Name -notmatch '^workwear_erp_[0-9]{8}_[0-9]{6}\.dump$' -or
                $dumpFile.FullName.IndexOf('.partial', [StringComparison]::OrdinalIgnoreCase) -ge 0) {
                continue
            }

            $manifestPath = "$($dumpFile.FullName).json"
            $sidecarPath = "$($dumpFile.FullName).sha256"
            if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf) -or
                -not (Test-Path -LiteralPath $sidecarPath -PathType Leaf)) {
                continue
            }
            $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
            if ([int](Get-RecoveryProperty -InputObject $manifest -Name 'formatVersion') -ne 2) {
                continue
            }
            if (-not [string]::Equals(
                [string](Get-RecoveryProperty -InputObject $manifest -Name 'fileName'),
                $dumpFile.Name,
                [StringComparison]::Ordinal
            )) {
                continue
            }
            if (-not [string]::Equals(
                [string](Get-RecoveryProperty -InputObject $manifest -Name 'clusterId'),
                $ExpectedClusterId,
                [StringComparison]::Ordinal
            )) {
                continue
            }
            $recoveryFenceConfigured = Get-RecoveryProperty -InputObject $manifest -Name 'recoveryFenceConfigured'
            if ($recoveryFenceConfigured -isnot [bool] -or -not $recoveryFenceConfigured) {
                continue
            }
            $sourceNodeId = [string](Get-RecoveryProperty -InputObject $manifest -Name 'sourceNodeId')
            if ([string]::IsNullOrWhiteSpace($sourceNodeId) -or $sourceNodeId -ne $ExpectedActiveNodeId) {
                continue
            }
            if ([Int64](Get-RecoveryProperty -InputObject $manifest -Name 'recoveryEpoch') -ne $ExpectedEpoch) {
                continue
            }
            $manifestRelease = Get-RecoveryProperty -InputObject $manifest -Name 'release'
            if (-not (Test-RecoveryReleaseMatch -Actual $manifestRelease -Expected $expected)) {
                continue
            }

            [Int64]$manifestSize = 0
            if (-not [Int64]::TryParse(
                [string](Get-RecoveryProperty -InputObject $manifest -Name 'size'),
                [Globalization.NumberStyles]::None,
                [Globalization.CultureInfo]::InvariantCulture,
                [ref]$manifestSize
            ) -or $manifestSize -le 0 -or $manifestSize -ne $dumpFile.Length) {
                continue
            }
            $manifestHash = [string](Get-RecoveryProperty -InputObject $manifest -Name 'sha256')
            if ($manifestHash -notmatch '^[0-9A-Fa-f]{64}$') {
                continue
            }
            $sidecarLines = @(Get-Content -LiteralPath $sidecarPath -Encoding ASCII | Where-Object { $_ -ne '' })
            if ($sidecarLines.Count -ne 1) {
                continue
            }
            $expectedSidecar = "$($manifestHash.ToUpperInvariant())  $($dumpFile.Name)"
            if (-not [string]::Equals($sidecarLines[0].TrimEnd(), $expectedSidecar, [StringComparison]::OrdinalIgnoreCase)) {
                continue
            }

            $lengthBeforeHash = $dumpFile.Length
            $actualHash = (Get-FileHash -LiteralPath $dumpFile.FullName -Algorithm SHA256).Hash
            $dumpFile.Refresh()
            if ($dumpFile.Length -ne $lengthBeforeHash -or
                -not [string]::Equals($actualHash, $manifestHash, [StringComparison]::OrdinalIgnoreCase)) {
                continue
            }
            $snapshotStartedAt = ConvertTo-RecoveryUtcTimestamp -Value (
                Get-RecoveryProperty -InputObject $manifest -Name 'snapshotStartedAtUtc'
            ) -Name 'snapshotStartedAtUtc'
            $createdAt = ConvertTo-RecoveryUtcTimestamp -Value (
                Get-RecoveryProperty -InputObject $manifest -Name 'createdAtUtc'
            ) -Name 'createdAtUtc'
            if ($snapshotStartedAt -gt $createdAt) {
                continue
            }

            $candidates.Add([PSCustomObject][ordered]@{
                BackupFile = $dumpFile.FullName
                ManifestPath = $manifestPath
                SidecarPath = $sidecarPath
                SnapshotStartedAtUtc = $snapshotStartedAt.UtcDateTime
                CreatedAtUtc = $createdAt.UtcDateTime
                SizeBytes = $manifestSize
                Sha256 = $manifestHash.ToUpperInvariant()
                SourceNodeId = $sourceNodeId
                Manifest = $manifest
            })
        } catch {
            # A malformed, incomplete, changing, or unreadable set is not a recovery candidate.
            continue
        }
    }

    return @($candidates | Sort-Object SnapshotStartedAtUtc, CreatedAtUtc, BackupFile -Descending)
}

function Select-RecoveryCandidate {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$BackupRoot,
        [Parameter(Mandatory = $true)]$ExpectedRelease,
        [Parameter(Mandatory = $true)][Alias('ClusterId')][string]$ExpectedClusterId,
        [Parameter(Mandatory = $true)][string]$ExpectedActiveNodeId,
        [Parameter(Mandatory = $true)][Int64]$ExpectedEpoch
    )

    $candidates = @(Get-RecoveryCandidates `
        -BackupRoot $BackupRoot `
        -ExpectedRelease $ExpectedRelease `
        -ExpectedClusterId $ExpectedClusterId `
        -ExpectedActiveNodeId $ExpectedActiveNodeId `
        -ExpectedEpoch $ExpectedEpoch)
    if ($candidates.Count -eq 0) {
        throw 'No complete local backup matches manifest v2, release, migration, cluster, size, and SHA-256 requirements.'
    }
    return $candidates[0]
}

function New-PromotionWitness {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$ClusterId,
        [Parameter(Mandatory = $true)][Int64]$Epoch,
        [Parameter(Mandatory = $true)][string]$ActiveNodeId,
        [Parameter(Mandatory = $true)][ValidateSet('preparing', 'committed')][string]$Status,
        [Parameter(Mandatory = $true)][string]$WitnessNodeId,
        [AllowNull()][string]$CommittedAtUtc
    )

    if ([string]::IsNullOrWhiteSpace($ClusterId) -or
        [string]::IsNullOrWhiteSpace($ActiveNodeId) -or
        [string]::IsNullOrWhiteSpace($WitnessNodeId)) {
        throw 'Cluster, active node, and witness node ids must not be empty.'
    }
    if ($Epoch -lt 1 -or $Epoch -gt $script:MaximumSafeJsonInteger) {
        throw 'Promotion epoch must be a positive JSON-safe integer.'
    }
    if ($Status -eq 'committed') {
        if ([string]::IsNullOrWhiteSpace($CommittedAtUtc)) {
            throw 'A committed promotion witness requires committedAtUtc.'
        }
        $CommittedAtUtc = (ConvertTo-RecoveryUtcTimestamp -Value $CommittedAtUtc -Name 'committedAtUtc').ToString('o')
    } elseif ($CommittedAtUtc) {
        throw 'A preparing promotion witness cannot have committedAtUtc.'
    }

    return [PSCustomObject][ordered]@{
        clusterId = $ClusterId
        epoch = $Epoch
        activeNodeId = $ActiveNodeId
        status = $Status
        witnessNodeId = $WitnessNodeId
        committedAtUtc = if ($Status -eq 'committed') { $CommittedAtUtc } else { $null }
    }
}

function Read-PromotionWitness {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $null
    }
    try {
        $value = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
        return New-PromotionWitness `
            -ClusterId ([string](Get-RecoveryProperty -InputObject $value -Name 'clusterId')) `
            -Epoch ([Int64](Get-RecoveryProperty -InputObject $value -Name 'epoch')) `
            -ActiveNodeId ([string](Get-RecoveryProperty -InputObject $value -Name 'activeNodeId')) `
            -Status ([string](Get-RecoveryProperty -InputObject $value -Name 'status')) `
            -WitnessNodeId ([string](Get-RecoveryProperty -InputObject $value -Name 'witnessNodeId')) `
            -CommittedAtUtc (Get-RecoveryProperty -InputObject $value -Name 'committedAtUtc' -AllowNull)
    } catch {
        throw "Promotion witness is unreadable or invalid: $Path"
    }
}

function Test-PromotionIdentity {
    param(
        [Parameter(Mandatory = $true)]$Witness,
        [Parameter(Mandatory = $true)][string]$ClusterId,
        [Parameter(Mandatory = $true)][Int64]$Epoch,
        [Parameter(Mandatory = $true)][string]$ActiveNodeId,
        [Parameter(Mandatory = $true)][string]$WitnessNodeId
    )

    return (
        [string]::Equals($Witness.clusterId, $ClusterId, [StringComparison]::Ordinal) -and
        [Int64]$Witness.epoch -eq $Epoch -and
        [string]::Equals($Witness.activeNodeId, $ActiveNodeId, [StringComparison]::Ordinal) -and
        [string]::Equals($Witness.witnessNodeId, $WitnessNodeId, [StringComparison]::Ordinal)
    )
}

function Get-PromotionQuorum {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string[]]$WitnessPaths,
        [string]$ExpectedClusterId,
        [string[]]$ExpectedWitnessNodeIds
    )

    if ($WitnessPaths.Count -ne 2) {
        throw 'Recovery quorum requires exactly two witness paths.'
    }
    $witnesses = @($WitnessPaths | ForEach-Object { Read-PromotionWitness -Path $_ })
    if ($witnesses.Count -ne 2 -or @($witnesses | Where-Object { -not $_ -or $_.status -ne 'committed' }).Count -gt 0) {
        throw 'Two committed recovery witnesses are required.'
    }
    if ($ExpectedClusterId -and $witnesses[0].clusterId -ne $ExpectedClusterId) {
        throw 'Recovery witnesses belong to an unexpected cluster.'
    }
    if ($ExpectedWitnessNodeIds) {
        if ($ExpectedWitnessNodeIds.Count -ne 2 -or
            $witnesses[0].witnessNodeId -ne $ExpectedWitnessNodeIds[0] -or
            $witnesses[1].witnessNodeId -ne $ExpectedWitnessNodeIds[1]) {
            throw 'Recovery witness identity does not match its configured path.'
        }
    }
    if ($witnesses[0].clusterId -ne $witnesses[1].clusterId -or
        [Int64]$witnesses[0].epoch -ne [Int64]$witnesses[1].epoch -or
        $witnesses[0].activeNodeId -ne $witnesses[1].activeNodeId -or
        $witnesses[0].committedAtUtc -ne $witnesses[1].committedAtUtc -or
        $witnesses[0].witnessNodeId -eq $witnesses[1].witnessNodeId) {
        throw 'Recovery witnesses do not form one independent committed quorum.'
    }
    return [PSCustomObject][ordered]@{
        clusterId = $witnesses[0].clusterId
        epoch = [Int64]$witnesses[0].epoch
        activeNodeId = $witnesses[0].activeNodeId
        committedAtUtc = $witnesses[0].committedAtUtc
        witnessNodeIds = @($witnesses | ForEach-Object { $_.witnessNodeId })
    }
}

function Commit-PromotionWitness {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string[]]$WitnessPaths,
        [Parameter(Mandatory = $true)][string[]]$WitnessNodeIds,
        [Parameter(Mandatory = $true)][string]$ClusterId,
        [Parameter(Mandatory = $true)][Int64]$Epoch,
        [Parameter(Mandatory = $true)][string]$ActiveNodeId,
        [string]$CommittedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    )

    if ($WitnessPaths.Count -ne 2 -or $WitnessNodeIds.Count -ne 2) {
        throw 'Promotion requires exactly two witness paths and two witness node ids.'
    }
    $fullPaths = @($WitnessPaths | ForEach-Object { [IO.Path]::GetFullPath($_) })
    if ([string]::Equals($fullPaths[0], $fullPaths[1], [StringComparison]::OrdinalIgnoreCase) -or
        [string]::Equals($WitnessNodeIds[0], $WitnessNodeIds[1], [StringComparison]::Ordinal)) {
        throw 'Promotion witnesses must use two different paths and two different node ids.'
    }

    [object[]]$existing = @($null, $null)
    $existing[0] = Read-PromotionWitness -Path $fullPaths[0]
    $existing[1] = Read-PromotionWitness -Path $fullPaths[1]
    $existingCommittedAt = $null
    for ($index = 0; $index -lt 2; $index += 1) {
        $current = $existing[$index]
        if (-not $current) {
            continue
        }
        if (-not [string]::Equals($current.clusterId, $ClusterId, [StringComparison]::Ordinal)) {
            throw 'A witness belongs to a different recovery cluster.'
        }
        if ([Int64]$current.epoch -gt $Epoch) {
            throw 'A witness already contains a newer promotion epoch.'
        }
        if ([Int64]$current.epoch -eq $Epoch) {
            if (-not (Test-PromotionIdentity -Witness $current -ClusterId $ClusterId -Epoch $Epoch `
                -ActiveNodeId $ActiveNodeId -WitnessNodeId $WitnessNodeIds[$index])) {
                throw 'The requested epoch conflicts with an existing promotion witness.'
            }
            if ($current.status -eq 'committed') {
                if ($existingCommittedAt -and -not [string]::Equals(
                    $existingCommittedAt,
                    [string]$current.committedAtUtc,
                    [StringComparison]::Ordinal
                )) {
                    throw 'Existing committed witnesses disagree on committedAtUtc.'
                }
                $existingCommittedAt = [string]$current.committedAtUtc
            }
        }
    }
    if ($existingCommittedAt) {
        $CommittedAtUtc = $existingCommittedAt
    }
    $CommittedAtUtc = (ConvertTo-RecoveryUtcTimestamp -Value $CommittedAtUtc -Name 'committedAtUtc').ToString('o')

    for ($index = 0; $index -lt 2; $index += 1) {
        $current = $existing[$index]
        $alreadyCommitted = $current -and [Int64]$current.epoch -eq $Epoch -and $current.status -eq 'committed'
        if (-not $alreadyCommitted) {
            $preparing = New-PromotionWitness -ClusterId $ClusterId -Epoch $Epoch `
                -ActiveNodeId $ActiveNodeId -Status 'preparing' -WitnessNodeId $WitnessNodeIds[$index]
            Write-RecoveryJsonAtomic -Path $fullPaths[$index] -Value $preparing
        }
    }

    for ($index = 0; $index -lt 2; $index += 1) {
        $prepared = Read-PromotionWitness -Path $fullPaths[$index]
        if (-not $prepared -or
            -not (Test-PromotionIdentity -Witness $prepared -ClusterId $ClusterId -Epoch $Epoch `
                -ActiveNodeId $ActiveNodeId -WitnessNodeId $WitnessNodeIds[$index]) -or
            $prepared.status -notin @('preparing', 'committed')) {
            throw 'Promotion preparation did not reach both witnesses; no quorum was committed.'
        }
    }

    for ($index = 0; $index -lt 2; $index += 1) {
        $committed = New-PromotionWitness -ClusterId $ClusterId -Epoch $Epoch `
            -ActiveNodeId $ActiveNodeId -Status 'committed' -WitnessNodeId $WitnessNodeIds[$index] `
            -CommittedAtUtc $CommittedAtUtc
        Write-RecoveryJsonAtomic -Path $fullPaths[$index] -Value $committed
    }

    $verified = [Collections.Generic.List[object]]::new()
    for ($index = 0; $index -lt 2; $index += 1) {
        $committed = Read-PromotionWitness -Path $fullPaths[$index]
        if (-not $committed -or
            -not (Test-PromotionIdentity -Witness $committed -ClusterId $ClusterId -Epoch $Epoch `
                -ActiveNodeId $ActiveNodeId -WitnessNodeId $WitnessNodeIds[$index]) -or
            $committed.status -ne 'committed' -or
            -not [string]::Equals($committed.committedAtUtc, $CommittedAtUtc, [StringComparison]::Ordinal)) {
            throw 'Promotion commit does not have two matching durable witnesses.'
        }
        $verified.Add($committed)
    }
    return @($verified)
}
