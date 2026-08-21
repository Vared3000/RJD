[CmdletBinding()]
param(
    [ValidateSet('Auto', 'Baseline', 'Verify')][string]$Stage = 'Auto',
    [string]$DrillId,
    [switch]$ConfirmWorkstations,
    [switch]$ConfirmBusinessData,
    [switch]$ConfirmPrintForm,
    [switch]$NonInteractive
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
. (Join-Path $script:RepositoryRoot 'scripts\backup-common.ps1')
. (Join-Path $script:RepositoryRoot 'scripts\recovery-common.ps1')

Assert-WindowsHost
Ensure-Administrator -ScriptPath $PSCommandPath -BoundParameters $PSBoundParameters
$logPath = New-DeploymentLog -Operation 'disaster-drill'

function Read-DrillJson {
    param([Parameter(Mandatory = $true)][string]$Path)
    try {
        $value = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        throw "Протокол испытания повреждён: $Path"
    }
    if (-not $value -or [int]$value.formatVersion -ne 1 -or -not $value.drillId) {
        throw "Протокол испытания имеет неверный формат: $Path"
    }
    return $value
}

function Test-ManualDrillCheck {
    param(
        [Parameter(Mandatory = $true)][string]$Prompt,
        [switch]$Confirmed
    )
    if ($Confirmed) { return $true }
    if ($NonInteractive) { return $false }
    return (Read-Host "$Prompt [да/нет]") -match '^(?i:да|yes|y)$'
}

function Get-DrillReplicaEvidence {
    param(
        [Parameter(Mandatory = $true)][string]$BackupRoot,
        [Parameter(Mandatory = $true)][string[]]$SecondaryPaths,
        [Parameter(Mandatory = $true)][string]$FileName,
        [Parameter(Mandatory = $true)][string]$ExpectedHash,
        [int]$RequiredSecondaryCount
    )

    $locations = @($BackupRoot) + @($SecondaryPaths)
    $evidence = [Collections.Generic.List[object]]::new()
    for ($index = 0; $index -lt $locations.Count; $index += 1) {
        $dumpPath = Join-Path (Join-Path $locations[$index] 'daily') $FileName
        $available = Test-Path -LiteralPath $dumpPath -PathType Leaf
        $actualHash = if ($available) { (Get-FileHash -LiteralPath $dumpPath -Algorithm SHA256).Hash } else { $null }
        $matches = $available -and [string]::Equals($actualHash, $ExpectedHash, [StringComparison]::OrdinalIgnoreCase)
        $evidence.Add([PSCustomObject][ordered]@{
            role = if ($index -eq 0) { 'local' } else { "secondary-$index" }
            host = Get-BackupDestinationHost -Path $locations[$index]
            available = $available
            sha256Matches = $matches
        })
    }
    if (-not $evidence[0].sha256Matches) { throw 'Исходная локальная backup-копия не сохранилась.' }
    if (@($evidence | Select-Object -Skip 1 | Where-Object sha256Matches).Count -lt $RequiredSecondaryCount) {
        throw "Недостаточно доступных неизменных вторичных копий: требуется $RequiredSecondaryCount."
    }
    return @($evidence)
}

try {
    $environment = Read-DeploymentEnv
    $configuration = Get-RecoveryClusterSentinel -EnvironmentValues $environment
    if (-not $configuration) { throw 'Испытание потери ПК требует подготовленный recovery-кластер.' }
    $quorum = Get-PromotionQuorum -WitnessPaths $configuration.WitnessPaths `
        -ExpectedClusterId $configuration.ClusterId -ExpectedWitnessNodeIds $configuration.WitnessNodeIds
    $backupRoot = if ($environment['BACKUP_ROOT']) { $environment['BACKUP_ROOT'] } else { Join-Path $script:RepositoryRoot 'backups' }
    $secondaryPaths = @(Resolve-BackupSecondaryPaths -EnvironmentValues $environment)
    $drillDirectory = Join-Path $backupRoot 'drills'
    [IO.Directory]::CreateDirectory($drillDirectory) | Out-Null
    $pendingPath = Join-Path $drillDirectory 'pending.json'
    $pending = if (Test-Path -LiteralPath $pendingPath -PathType Leaf) { Read-DrillJson -Path $pendingPath } else { $null }

    if ($Stage -eq 'Auto') {
        $Stage = if ($pending -and $pending.status -eq 'baseline' -and
            $quorum.activeNodeId -eq $configuration.NodeId -and
            $pending.baselineNodeId -ne $configuration.NodeId) { 'Verify' } else { 'Baseline' }
    }

    if ($Stage -eq 'Baseline') {
        if ($quorum.activeNodeId -ne $configuration.NodeId) {
            throw 'Исходную точку можно фиксировать только на текущем активном узле.'
        }
        if ($secondaryPaths.Count -ne 2) { throw 'Для испытания нужны две вторичные backup-папки.' }
        $release = Get-ApplicationReleaseMetadata -ProjectRoot $script:RepositoryRoot
        $candidate = Select-RecoveryCandidate -BackupRoot $backupRoot -ExpectedRelease $release `
            -ExpectedClusterId $configuration.ClusterId -ExpectedActiveNodeId $quorum.activeNodeId -ExpectedEpoch $quorum.epoch
        $replicas = Get-DrillReplicaEvidence -BackupRoot $backupRoot -SecondaryPaths $secondaryPaths `
            -FileName ([IO.Path]::GetFileName($candidate.BackupFile)) -ExpectedHash $candidate.Sha256 -RequiredSecondaryCount 2
        if (-not $DrillId) { $DrillId = [Guid]::NewGuid().ToString('N') }
        if ($DrillId -notmatch '^[a-zA-Z0-9-]{8,64}$') { throw 'Некорректный DrillId.' }
        $pending = [PSCustomObject][ordered]@{
            formatVersion = 1
            status = 'baseline'
            drillId = $DrillId
            clusterId = $configuration.ClusterId
            baselineNodeId = $configuration.NodeId
            baselineEpoch = [Int64]$quorum.epoch
            backupFileName = [IO.Path]::GetFileName($candidate.BackupFile)
            backupSha256 = $candidate.Sha256
            backupSnapshotStartedAtUtc = ([DateTime]$candidate.SnapshotStartedAtUtc).ToUniversalTime().ToString('o')
            baselineAtUtc = (Get-Date).ToUniversalTime().ToString('o')
            replicas = $replicas
        }
        foreach ($root in @($backupRoot) + $secondaryPaths) {
            $targetDirectory = Join-Path $root 'drills'
            [IO.Directory]::CreateDirectory($targetDirectory) | Out-Null
            Write-RecoveryJsonAtomic -Path (Join-Path $targetDirectory 'pending.json') -Value $pending
        }
        Write-Host "Исходная точка записана. DrillId: $DrillId"
        Write-Host 'Теперь физически отключите этот ПК от сети и запустите «Аварийное восстановление» на ПК №2.'
        exit 0
    }

    if (-not $pending) { throw 'На этом ПК нет исходной точки испытания.' }
    if ($pending.status -ne 'baseline') {
        throw 'Это испытание уже завершено. Зафиксируйте новую исходную точку.'
    }
    if ($DrillId -and $pending.drillId -ne $DrillId) { throw 'DrillId не совпадает с pending-протоколом.' }
    if ($pending.clusterId -ne $configuration.ClusterId -or $pending.baselineNodeId -eq $configuration.NodeId) {
        throw 'Протокол не доказывает перенос с другого активного ПК.'
    }
    if ($quorum.activeNodeId -ne $configuration.NodeId -or [Int64]$quorum.epoch -le [Int64]$pending.baselineEpoch) {
        throw 'Новый узел не получил более новую committed-эпоху.'
    }
    $stateRoot = if ($environment['RECOVERY_STATE_ROOT']) { $environment['RECOVERY_STATE_ROOT'] } else { Join-Path $env:ProgramData 'WorkwearERP\recovery' }
    $resultPath = Join-Path $stateRoot 'last-result.json'
    if (-not (Test-Path -LiteralPath $resultPath -PathType Leaf)) { throw 'Не найден результат аварийного восстановления.' }
    $result = Read-DrillJson -Path $resultPath
    if ($result.status -ne 'active' -or $result.drillId -ne $pending.drillId -or
        $result.backupFileName -ne $pending.backupFileName -or $result.backupSha256 -ne $pending.backupSha256) {
        throw 'Аварийное восстановление не связано с исходной точкой этого испытания.'
    }
    $rpoSeconds = ([DateTimeOffset]$result.startedAtUtc - [DateTimeOffset]$pending.backupSnapshotStartedAtUtc).TotalSeconds
    $rtoSeconds = [double]$result.durationSeconds
    if ($rpoSeconds -lt 0 -or $rpoSeconds -gt 3600) { throw "RPO выше лимита: $([Math]::Round($rpoSeconds, 1)) с." }
    if ($rtoSeconds -lt 0 -or $rtoSeconds -gt 3600) { throw "RTO выше лимита: $([Math]::Round($rtoSeconds, 1)) с." }
    $replicas = Get-DrillReplicaEvidence -BackupRoot $backupRoot -SecondaryPaths $secondaryPaths `
        -FileName $pending.backupFileName -ExpectedHash $pending.backupSha256 -RequiredSecondaryCount 1
    $health = Invoke-RestMethod -Uri "$($result.applicationUrl.TrimEnd('/'))/health" -TimeoutSec 10
    if ($health.status -ne 'ok' -or $health.recovery.nodeId -ne $configuration.NodeId -or
        [Int64]$health.recovery.epoch -ne [Int64]$quorum.epoch) {
        throw 'Новый активный узел не прошёл health/quorum-проверку.'
    }

    $manual = [ordered]@{
        twoWorkstations = Test-ManualDrillCheck -Prompt 'Вход выполнен с двух рабочих мест?' -Confirmed:$ConfirmWorkstations
        businessData = Test-ManualDrillCheck -Prompt 'Работники, остатки, документы и история проверены?' -Confirmed:$ConfirmBusinessData
        printForm = Test-ManualDrillCheck -Prompt 'Одна печатная форма сформирована и проверена?' -Confirmed:$ConfirmPrintForm
    }
    $accepted = @($manual.Values | Where-Object { -not $_ }).Count -eq 0
    $finishedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    $protocol = [PSCustomObject][ordered]@{
        formatVersion = 1
        status = if ($accepted) { 'accepted' } else { 'automatic-checks-passed-manual-pending' }
        drillId = $pending.drillId
        clusterId = $configuration.ClusterId
        baselineNodeId = $pending.baselineNodeId
        recoveredNodeId = $configuration.NodeId
        baselineEpoch = [Int64]$pending.baselineEpoch
        recoveredEpoch = [Int64]$quorum.epoch
        backupFileName = $pending.backupFileName
        backupSha256 = $pending.backupSha256
        rpoSeconds = [Math]::Round($rpoSeconds, 3)
        rtoSeconds = [Math]::Round($rtoSeconds, 3)
        replicas = $replicas
        manual = $manual
        finishedAtUtc = $finishedAtUtc
    }
    $protocolJsonPath = Join-Path $drillDirectory "disaster-drill-$($pending.drillId).json"
    Write-RecoveryJsonAtomic -Path $protocolJsonPath -Value $protocol
    $protocolMarkdownPath = Join-Path $drillDirectory "disaster-drill-$($pending.drillId).md"
    $markdown = @(
        '# Протокол полной потери основного ПК', '',
        "- Статус: $($protocol.status)", "- DrillId: $($protocol.drillId)",
        "- Узелы: $($protocol.baselineNodeId) -> $($protocol.recoveredNodeId)",
        "- Эпохи: $($protocol.baselineEpoch) -> $($protocol.recoveredEpoch)",
        "- Backup: $($protocol.backupFileName)", "- SHA-256: $($protocol.backupSha256)",
        "- RPO: $($protocol.rpoSeconds) с (лимит 3600 с)", "- RTO: $($protocol.rtoSeconds) с (лимит 3600 с)",
        "- Два рабочих места: $($manual.twoWorkstations)",
        "- Бизнес-данные: $($manual.businessData)", "- Печатная форма: $($manual.printForm)",
        "- Завершено UTC: $finishedAtUtc"
    )
    [IO.File]::WriteAllLines($protocolMarkdownPath, $markdown, [Text.UTF8Encoding]::new($false))
    $completedPending = [ordered]@{}
    foreach ($property in $pending.PSObject.Properties) { $completedPending[$property.Name] = $property.Value }
    $completedPending.status = $protocol.status
    $completedPending.finishedAtUtc = $finishedAtUtc
    foreach ($root in @($backupRoot) + $secondaryPaths) {
        $targetPending = Join-Path (Join-Path $root 'drills') 'pending.json'
        if (Test-Path -LiteralPath (Split-Path $targetPending -Parent) -PathType Container) {
            try { Write-RecoveryJsonAtomic -Path $targetPending -Value $completedPending } catch { }
        }
    }
    Write-Host "Протокол: $protocolMarkdownPath"
    if (-not $accepted) { Write-Warning 'Автоматические проверки пройдены, но физическая приёмка ещё не подписана.' }
    exit 0
} catch {
    Write-OperationFailure -LogPath $logPath -ErrorRecord $_
    exit 1
}
