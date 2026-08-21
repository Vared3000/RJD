[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [string]$BackupFile,
    [string]$BackupRoot,
    [string]$DatabaseUrl,
    [string]$AdminDatabaseUrl,
    [string]$PgBin,
    [string]$StateRoot,
    [string]$ResultPath,
    [string]$DrillId,
    [string]$EvidencePath,
    [ValidateRange(1, 1440)][int]$MaximumBackupAgeMinutes = 60,
    [switch]$AllowOlderBackup,
    [switch]$ConfirmPrimaryUnavailable,
    [switch]$NonInteractive,
    [switch]$Execute
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'backup-common.ps1')
. (Join-Path $PSScriptRoot 'recovery-common.ps1')
. (Join-Path $projectRoot 'deploy\windows\common.ps1')

$script:RecoveryPhases = @(
    'READY',
    'WORKLOADS_STOPPED',
    'VERIFYING',
    'TARGET_RESTORING',
    'TARGET_VALIDATED',
    'WITNESS_COMMITTED',
    'ENV_CONFIGURED',
    'SERVICE_READY',
    'TASKS_READY',
    'ACTIVE'
)
$script:BackupTaskNames = @(
    'Workwear ERP Hourly Backup',
    'Workwear ERP Monthly Restore Test'
)
$script:LegacyBackupTaskName = 'Workwear ERP Daily Backup'

function Get-RecoveryPhaseIndex {
    param([Parameter(Mandatory = $true)][string]$Phase)

    $index = [Array]::IndexOf($script:RecoveryPhases, $Phase)
    if ($index -lt 0) { throw "Неизвестный этап аварийного восстановления: $Phase" }
    return $index
}

function Test-RecoveryPhaseAtLeast {
    param(
        [Parameter(Mandatory = $true)][string]$Current,
        [Parameter(Mandatory = $true)][string]$Required
    )
    return (Get-RecoveryPhaseIndex -Phase $Current) -ge (Get-RecoveryPhaseIndex -Phase $Required)
}

function Set-RecoveryPhase {
    param([Parameter(Mandatory = $true)][string]$Phase)

    if ((Get-RecoveryPhaseIndex -Phase $Phase) -lt (Get-RecoveryPhaseIndex -Phase $script:journal.phase)) {
        throw "Запрещён откат журнала с $($script:journal.phase) на $Phase."
    }
    $script:journal.phase = $Phase
    $script:journal.updatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    Write-RecoveryJournal -Path $script:journalPath -Journal $script:journal | Out-Null
    Write-Host "[$Phase]"
}

function Get-RecoveryDatabaseUrl {
    param(
        [Parameter(Mandatory = $true)][string]$SourceUrl,
        [Parameter(Mandatory = $true)][string]$DatabaseName
    )
    $builder = [UriBuilder]$SourceUrl
    $builder.Path = "/$DatabaseName"
    return $builder.Uri.AbsoluteUri
}

function Test-RecoveryHostAvailable {
    param([Parameter(Mandatory = $true)][string]$HostName)
    try {
        return [bool](Test-NetConnection -ComputerName $HostName -Port 80 -InformationLevel Quiet -WarningAction SilentlyContinue)
    } catch {
        return $false
    }
}

function Wait-RecoveryReadiness {
    param(
        [Parameter(Mandatory = $true)][string]$ApplicationUrl,
        [Parameter(Mandatory = $true)][string]$ExpectedDatabase,
        [Parameter(Mandatory = $true)][string]$ExpectedClusterId,
        [Parameter(Mandatory = $true)][string]$ExpectedNodeId,
        [Parameter(Mandatory = $true)][Int64]$ExpectedEpoch,
        [Parameter(Mandatory = $true)][string]$ExpectedMigrationHead,
        [int]$TimeoutSeconds = 120
    )

    $readinessUri = '{0}/health/recovery-ready?database={1}&nodeId={2}&epoch={3}&migrationHead={4}' -f @(
        $ApplicationUrl.TrimEnd('/'),
        [Uri]::EscapeDataString($ExpectedDatabase),
        [Uri]::EscapeDataString($ExpectedNodeId),
        $ExpectedEpoch,
        [Uri]::EscapeDataString($ExpectedMigrationHead)
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            $result = Invoke-RestMethod -Uri $readinessUri -TimeoutSec 3
            if ($result.status -eq 'ok' -and
                $result.database -eq $ExpectedDatabase -and
                $result.migrationHead -eq $ExpectedMigrationHead -and
                $result.recovery.mode -eq 'cluster' -and
                $result.recovery.clusterId -eq $ExpectedClusterId -and
                $result.recovery.nodeId -eq $ExpectedNodeId -and
                $result.recovery.activeNodeId -eq $ExpectedNodeId -and
                [Int64]$result.recovery.epoch -eq $ExpectedEpoch) {
                return $true
            }
        } catch { }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)
    return $false
}

function Resolve-RecoveryActiveHost {
    param(
        [Parameter(Mandatory = $true)][string]$ActiveNodeId,
        [Parameter(Mandatory = $true)][string[]]$WitnessPaths,
        [Parameter(Mandatory = $true)][string]$ConfiguredPrimaryHost
    )

    for ($index = 0; $index -lt $WitnessPaths.Count; $index += 1) {
        $witness = Read-PromotionWitness -Path $WitnessPaths[$index]
        if ($witness -and $witness.witnessNodeId -eq $ActiveNodeId -and $WitnessPaths[$index].StartsWith('\')) {
            return $WitnessPaths[$index].TrimStart('\').Split('\')[0]
        }
    }
    if ($script:journal.PSObject.Properties['initialPrimaryNodeId'] -and
        $script:journal.initialPrimaryNodeId -eq $ActiveNodeId) {
        return $ConfiguredPrimaryHost
    }
    throw "Нельзя определить сетевой адрес активного узла $ActiveNodeId; переключение заблокировано."
}

function Assert-CurrentActiveNodeUnavailable {
    param(
        [Parameter(Mandatory = $true)]$CurrentQuorum,
        [Parameter(Mandatory = $true)][string[]]$WitnessPaths,
        [Parameter(Mandatory = $true)][string]$ConfiguredPrimaryHost
    )

    if ($CurrentQuorum.activeNodeId -eq $script:journal.nodeId) {
        throw 'Этот узел уже указан активным; новая эпоха переключения не создаётся.'
    }
    $activeHost = Resolve-RecoveryActiveHost -ActiveNodeId $CurrentQuorum.activeNodeId `
        -WitnessPaths $WitnessPaths -ConfiguredPrimaryHost $ConfiguredPrimaryHost
    if (Test-RecoveryHostAvailable -HostName $activeHost) {
        throw "Активный узел $($CurrentQuorum.activeNodeId) отвечает по HTTP. Аварийное переключение заблокировано."
    }
}

function Test-RecoveryCounts {
    param(
        [Parameter(Mandatory = $true)]$Actual,
        [Parameter(Mandatory = $true)]$Expected
    )
    foreach ($name in @('employees', 'instances', 'documents', 'stockMovements')) {
        if ([Int64]$Actual.$name -ne [Int64]$Expected.$name) {
            throw "Контрольное количество не совпало: $name."
        }
    }
}

function Stop-RecoveryWorkloads {
    $service = Get-WorkwearService
    if (-not $service) { throw 'Служба WorkwearERP не установлена на резервном ПК.' }
    if ($service.Status -ne 'Stopped') {
        Stop-Service -Name $script:WorkwearServiceName -Force
        $service.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(60))
    }
    Set-Service -Name $script:WorkwearServiceName -StartupType Disabled

    foreach ($taskName in @($script:BackupTaskNames + $script:LegacyBackupTaskName)) {
        $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        if (-not $task) { continue }
        Disable-ScheduledTask -TaskName $taskName | Out-Null
        if ($task.State -in @('Running', 'Queued')) {
            Stop-ScheduledTask -TaskName $taskName -ErrorAction Stop
        }
    }
}

function Test-RecoveryTaskPrincipal {
    param(
        [Parameter(Mandatory = $true)]$Principal,
        [Parameter(Mandatory = $true)][string]$ExpectedUser
    )

    $actualUser = [string]$Principal.UserId
    if ($ExpectedUser -eq 'SYSTEM') {
        $validUser = $actualUser -in @('SYSTEM', 'NT AUTHORITY\SYSTEM', 'S-1-5-18')
        $validLogon = [string]$Principal.LogonType -in @('ServiceAccount', '5')
    } else {
        $validUser = [string]::Equals($actualUser, $ExpectedUser, [StringComparison]::OrdinalIgnoreCase)
        $validLogon = [string]$Principal.LogonType -in @('Password', '1')
    }
    $highest = [string]$Principal.RunLevel -in @('Highest', '1')
    return $validUser -and $validLogon -and $highest
}

function Assert-RecoveryBackupTaskDefinition {
    param(
        [Parameter(Mandatory = $true)][string]$TaskName,
        [Parameter(Mandatory = $true)][ValidateSet('Hourly', 'Monthly')][string]$Kind,
        [Parameter(Mandatory = $true)][string]$ExpectedUser,
        [switch]$RequireEnabled
    )

    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if (-not $task) { throw "Не найдено подготовленное задание: $TaskName" }
    $actions = @($task.Actions)
    if ($actions.Count -ne 1 -or [IO.Path]::GetFileName([Environment]::ExpandEnvironmentVariables([string]$actions[0].Execute)) -ne 'powershell.exe') {
        throw "Некорректное действие задания: $TaskName"
    }
    $arguments = [string]$actions[0].Arguments
    $expectedScript = if ($Kind -eq 'Hourly') {
        Join-Path $PSScriptRoot 'backup.ps1'
    } else {
        Join-Path $PSScriptRoot 'verify-backup.ps1'
    }
    if ($arguments.IndexOf($expectedScript, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
        throw "Задание $TaskName запускает посторонний скрипт."
    }
    if ($Kind -eq 'Hourly' -and
        ($arguments -notmatch '(?i)-RequiredSecondaryCount\s+2' -or $arguments -notmatch '(?i)-NotifyOnFailure')) {
        throw 'Ежечасное задание не требует две вторичные копии или не включает уведомление.'
    }
    if ($Kind -eq 'Monthly' -and
        ($arguments -notmatch '(?i)-LatestMonthly' -or $arguments -notmatch '(?i)-TestRestore' -or
         $arguments -notmatch '(?i)-OnlyIfMonthlyDue')) {
        throw 'Задание контрольного восстановления имеет неверные параметры.'
    }

    $triggers = @($task.Triggers | Where-Object { $_.Enabled -ne $false })
    if ($triggers.Count -ne 1) { throw "У задания $TaskName должен быть ровно один активный trigger." }
    if ($Kind -eq 'Hourly') {
        try { $interval = [Xml.XmlConvert]::ToTimeSpan([string]$triggers[0].Repetition.Interval) } catch { $interval = [TimeSpan]::Zero }
        if ($interval -ne [TimeSpan]::FromHours(1)) { throw 'Ежечасное задание имеет неверный интервал.' }
    } elseif ([int]$triggers[0].DaysInterval -ne 1) {
        throw 'Задание контрольного восстановления должно проверяться ежедневно.'
    }
    if (-not (Test-RecoveryTaskPrincipal -Principal $task.Principal -ExpectedUser $ExpectedUser)) {
        throw "Некорректный principal задания: $TaskName"
    }
    if ([string]$task.Settings.MultipleInstances -notin @('IgnoreNew', '2')) {
        throw "Задание $TaskName допускает параллельные запуски."
    }
    if ($RequireEnabled -and $task.State -eq 'Disabled') {
        throw "Задание $TaskName осталось выключенным."
    }
    return $task
}

function Ensure-RecoveryBackupTasks {
    param([Parameter(Mandatory = $true)][string]$TaskUser)

    $missing = @($script:BackupTaskNames | Where-Object {
        -not (Get-ScheduledTask -TaskName $_ -ErrorAction SilentlyContinue)
    })
    if ($missing.Count -gt 0) {
        if ($TaskUser -ne 'SYSTEM') {
            throw 'Backup-задания служебной учётной записи не были подготовлены заранее.'
        }
        & (Join-Path $PSScriptRoot 'install-backup-tasks.ps1') -TaskUser 'SYSTEM' `
            -RequiredSecondaryCount 2 -HourlyStartAt (Get-Date).AddHours(1)
        foreach ($taskName in $script:BackupTaskNames) {
            if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
                Disable-ScheduledTask -TaskName $taskName | Out-Null
            }
        }
    }

    Assert-RecoveryBackupTaskDefinition -TaskName $script:BackupTaskNames[0] -Kind Hourly -ExpectedUser $TaskUser | Out-Null
    Assert-RecoveryBackupTaskDefinition -TaskName $script:BackupTaskNames[1] -Kind Monthly -ExpectedUser $TaskUser | Out-Null
    foreach ($taskName in $script:BackupTaskNames) {
        Enable-ScheduledTask -TaskName $taskName | Out-Null
    }
    Assert-RecoveryBackupTaskDefinition -TaskName $script:BackupTaskNames[0] -Kind Hourly -ExpectedUser $TaskUser -RequireEnabled | Out-Null
    Assert-RecoveryBackupTaskDefinition -TaskName $script:BackupTaskNames[1] -Kind Monthly -ExpectedUser $TaskUser -RequireEnabled | Out-Null

    $legacy = Get-ScheduledTask -TaskName $script:LegacyBackupTaskName -ErrorAction SilentlyContinue
    if ($legacy -and $legacy.State -ne 'Disabled') {
        throw 'Устаревшее ежедневное backup-задание неожиданно включено.'
    }
}

function Assert-RecoveryActiveState {
    param(
        [Parameter(Mandatory = $true)]$Journal,
        [Parameter(Mandatory = $true)][string[]]$WitnessPaths,
        [Parameter(Mandatory = $true)][string]$TaskUser,
        [Parameter(Mandatory = $true)][string]$ApplicationUrl
    )

    $quorum = Get-PromotionQuorum -WitnessPaths $WitnessPaths -ExpectedClusterId $Journal.clusterId
    if ($quorum.activeNodeId -ne $Journal.nodeId -or [Int64]$quorum.epoch -ne [Int64]$Journal.epoch) {
        throw 'Текущий quorum больше не назначает этот узел активным.'
    }
    $freshEnvironment = Read-DotEnvFile -Path (Join-Path $projectRoot '.env')
    $activeDatabase = Get-DatabaseConfiguration -DatabaseUrl $freshEnvironment['DATABASE_URL']
    if ($activeDatabase.Database -ne $Journal.recoveryDatabase -or
        $activeDatabase.Host -ne $Journal.targetDatabaseHost -or
        [int]$activeDatabase.Port -ne [int]$Journal.targetDatabasePort -or
        $activeDatabase.User -ne $Journal.targetDatabaseUser) {
        throw 'DATABASE_URL не указывает на проверенную recovery-базу.'
    }
    $service = Get-WorkwearService
    if (-not $service -or $service.Status -ne 'Running') { throw 'Служба WorkwearERP не работает.' }
    $serviceConfiguration = Get-CimInstance Win32_Service -Filter "Name='$($script:WorkwearServiceName)'"
    if (-not $serviceConfiguration -or $serviceConfiguration.StartMode -ne 'Auto') {
        throw 'Служба WorkwearERP не настроена на автоматический запуск.'
    }
    if (-not (Wait-RecoveryReadiness -ApplicationUrl $ApplicationUrl -ExpectedDatabase $Journal.recoveryDatabase `
        -ExpectedClusterId $Journal.clusterId -ExpectedNodeId $Journal.nodeId `
        -ExpectedEpoch ([Int64]$Journal.epoch) -ExpectedMigrationHead $Journal.targetMigrationHead -TimeoutSeconds 120)) {
        throw 'Активный узел не прошёл строгую проверку recovery readiness.'
    }
    Assert-RecoveryBackupTaskDefinition -TaskName $script:BackupTaskNames[0] -Kind Hourly -ExpectedUser $TaskUser -RequireEnabled | Out-Null
    Assert-RecoveryBackupTaskDefinition -TaskName $script:BackupTaskNames[1] -Kind Monthly -ExpectedUser $TaskUser -RequireEnabled | Out-Null
    $legacy = Get-ScheduledTask -TaskName $script:LegacyBackupTaskName -ErrorAction SilentlyContinue
    if ($legacy -and $legacy.State -ne 'Disabled') { throw 'Устаревшее backup-задание включено.' }
    return $quorum
}

function Write-RecoverySuccessResult {
    param(
        [Parameter(Mandatory = $true)]$Journal,
        [Parameter(Mandatory = $true)]$Release,
        [Parameter(Mandatory = $true)][string]$ApplicationUrl,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $finishedAtUtc = (Get-Date).ToUniversalTime()
    $result = [PSCustomObject][ordered]@{
        formatVersion = 1
        status = 'active'
        attemptId = $Journal.attemptId
        drillId = $Journal.drillId
        nodeId = $Journal.nodeId
        epoch = [Int64]$Journal.epoch
        releaseId = $Release.releaseId
        backupFileName = $Journal.backupFileName
        backupSha256 = $Journal.backupSha256
        backupSnapshotStartedAtUtc = $Journal.backupSnapshotStartedAtUtc
        counts = $Journal.targetCounts
        applicationUrl = $ApplicationUrl
        startedAtUtc = $Journal.startedAtUtc
        finishedAtUtc = $finishedAtUtc.ToString('o')
        validatedAtUtc = $finishedAtUtc.ToString('o')
        durationSeconds = [Math]::Round(($finishedAtUtc - [DateTime]$Journal.startedAtUtc).TotalSeconds, 3)
    }
    Write-RecoveryJsonAtomic -Path $Path -Value $result
    return $result
}

$environment = Read-DotEnvFile -Path (Join-Path $projectRoot '.env')
if (-not $BackupRoot) { $BackupRoot = if ($environment['BACKUP_ROOT']) { $environment['BACKUP_ROOT'] } else { Join-Path $projectRoot 'backups' } }
if (-not $DatabaseUrl) { $DatabaseUrl = $environment['DATABASE_URL'] }
if (-not $AdminDatabaseUrl) { $AdminDatabaseUrl = $environment['BACKUP_ADMIN_DATABASE_URL'] }
if (-not $StateRoot) { $StateRoot = if ($environment['RECOVERY_STATE_ROOT']) { $environment['RECOVERY_STATE_ROOT'] } else { Join-Path $env:ProgramData 'WorkwearERP\recovery' } }
if (-not $ResultPath) { $ResultPath = Join-Path $StateRoot 'last-result.json' }

$recoveryConfiguration = Get-RecoveryClusterSentinel -EnvironmentValues $environment -DefaultStateRoot $StateRoot
if (-not $recoveryConfiguration) { throw 'Резервный ПК не подготовлен: нет защищённого cluster sentinel.' }
$clusterId = $recoveryConfiguration.ClusterId
$nodeId = $recoveryConfiguration.NodeId
$configuredPrimaryHost = $environment['RECOVERY_PRIMARY_HOST']
$witnessPaths = @($recoveryConfiguration.WitnessPaths)
$taskUser = if ($environment['BACKUP_TASK_USER']) { $environment['BACKUP_TASK_USER'] } else { 'SYSTEM' }
if (-not $clusterId -or -not $nodeId -or -not $configuredPrimaryHost -or $witnessPaths.Count -ne 2) {
    throw 'Резервный ПК не подготовлен: отсутствуют clusterId, nodeId, primary host или два witness-файла.'
}
if (-not $DatabaseUrl -or -not $AdminDatabaseUrl) { throw 'Не настроены строки подключения приложения и восстановления.' }
if (-not $ConfirmPrimaryUnavailable) { throw 'Требуется явное подтверждение недоступности активного ПК.' }
if ($Execute -and -not (Test-IsAdministrator)) { throw 'Аварийное восстановление требует прав локального администратора.' }

[IO.Directory]::CreateDirectory($StateRoot) | Out-Null
$script:journalPath = Join-Path $StateRoot 'recovery-journal.json'
$lockPath = Join-Path $StateRoot 'recovery.lock'
$recoveryLock = $null
$script:journal = $null
$journalDurable = $false
try {
    try {
        $recoveryLock = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    } catch {
        throw 'Аварийное восстановление уже запущено в другом процессе.'
    }

    $script:journal = Read-RecoveryJournal -Path $script:journalPath
    $journalDurable = [bool]$script:journal
    $completedJournalPath = $null
    if ($script:journal -and [string]$script:journal.phase -eq 'ACTIVE') {
        $activeJournalQuorum = Get-PromotionQuorum -WitnessPaths $witnessPaths -ExpectedClusterId $clusterId `
            -ExpectedWitnessNodeIds $recoveryConfiguration.WitnessNodeIds
        $sameActivation = (
            $activeJournalQuorum.activeNodeId -eq $script:journal.nodeId -and
            [Int64]$activeJournalQuorum.epoch -eq [Int64]$script:journal.epoch
        )
        if (-not $sameActivation) {
            if ([Int64]$activeJournalQuorum.epoch -le [Int64]$script:journal.epoch -or
                $activeJournalQuorum.activeNodeId -eq $script:journal.nodeId) {
                throw 'Завершённый recovery-журнал конфликтует с текущим quorum.'
            }
            $completedJournalPath = Join-Path $StateRoot "recovery-journal.completed-$($script:journal.attemptId).json"
            $script:journal = $null
            $journalDurable = $false
        }
    }
    $currentRelease = Get-ApplicationReleaseMetadata -ProjectRoot $projectRoot
    $candidate = $null
    $nowUtc = (Get-Date).ToUniversalTime()
    $newJournal = $false

    if (-not $script:journal) {
        $currentQuorum = Get-PromotionQuorum -WitnessPaths $witnessPaths -ExpectedClusterId $clusterId
        $candidate = Select-RecoveryCandidate -BackupRoot $BackupRoot -ExpectedRelease $currentRelease `
            -ExpectedClusterId $clusterId -ExpectedActiveNodeId $currentQuorum.activeNodeId -ExpectedEpoch $currentQuorum.epoch
        if ($BackupFile) {
            $resolvedRequested = (Resolve-Path -LiteralPath $BackupFile).Path
            if ($candidate.BackupFile -ne $resolvedRequested) {
                $candidate = @(Get-RecoveryCandidates -BackupRoot $BackupRoot -ExpectedRelease $currentRelease `
                    -ExpectedClusterId $clusterId -ExpectedActiveNodeId $currentQuorum.activeNodeId -ExpectedEpoch $currentQuorum.epoch |
                    Where-Object BackupFile -eq $resolvedRequested | Select-Object -First 1)
                if ($candidate.Count -ne 1) { throw 'Указанный backup не прошёл полную проверку recovery.' }
                $candidate = $candidate[0]
            }
        }
        $backupAge = $nowUtc - ([DateTime]$candidate.SnapshotStartedAtUtc)
        if ($backupAge.TotalMinutes -lt -5) { throw 'Время backup находится в будущем; проверьте часы на трёх ПК.' }
        if (-not $AllowOlderBackup -and $backupAge.TotalMinutes -gt $MaximumBackupAgeMinutes) {
            throw "Последняя подходящая копия старше $MaximumBackupAgeMinutes минут."
        }
        $sourceConfiguration = Get-DatabaseConfiguration -DatabaseUrl $DatabaseUrl
        $script:journal = [PSCustomObject][ordered]@{
            formatVersion = 2
            attemptId = [Guid]::NewGuid().ToString('N')
            drillId = $DrillId
            phase = 'READY'
            epoch = [Int64]$currentQuorum.epoch + 1
            previousEpoch = [Int64]$currentQuorum.epoch
            previousActiveNodeId = $currentQuorum.activeNodeId
            initialPrimaryNodeId = $candidate.SourceNodeId
            nodeId = $nodeId
            clusterId = $clusterId
            backupFileName = [IO.Path]::GetFileName($candidate.BackupFile)
            backupSha256 = $candidate.Sha256
            backupSnapshotStartedAtUtc = ([DateTime]$candidate.SnapshotStartedAtUtc).ToUniversalTime().ToString('o')
            recoveryDatabase = "workwear_erp_recovery_$([Int64]$currentQuorum.epoch + 1)"
            targetDatabaseHost = $sourceConfiguration.Host
            targetDatabasePort = [int]$sourceConfiguration.Port
            targetDatabaseUser = $sourceConfiguration.User
            targetMigrationHead = $currentRelease.migrationHead
            targetCounts = $null
            allowOlderBackup = [bool]$AllowOlderBackup
            startedAtUtc = $nowUtc.ToString('o')
            updatedAtUtc = $nowUtc.ToString('o')
            lastErrorCode = $null
        }
        $newJournal = $true
    } else {
        if ($script:journal.formatVersion -ne 2 -or $script:journal.nodeId -ne $nodeId -or $script:journal.clusterId -ne $clusterId) {
            throw 'Незавершённый журнал относится к другой конфигурации recovery.'
        }
        Get-RecoveryPhaseIndex -Phase $script:journal.phase | Out-Null
        if (-not (Test-RecoveryPhaseAtLeast -Current $script:journal.phase -Required 'TARGET_VALIDATED')) {
            $resumeCandidates = @(Get-RecoveryCandidates -BackupRoot $BackupRoot -ExpectedRelease $currentRelease `
                -ExpectedClusterId $clusterId -ExpectedActiveNodeId $script:journal.previousActiveNodeId `
                -ExpectedEpoch ([Int64]$script:journal.previousEpoch))
            $candidate = $resumeCandidates | Where-Object {
                [IO.Path]::GetFileName($_.BackupFile) -eq $script:journal.backupFileName -and $_.Sha256 -eq $script:journal.backupSha256
            } | Select-Object -First 1
            if (-not $candidate) { throw 'Закреплённая в журнале recovery-копия больше не проходит проверку.' }
            # Freshness is intentionally checked only when a new journal is created.
        }
    }

    $plan = [PSCustomObject][ordered]@{
        status = 'plan'
        attemptId = $script:journal.attemptId
        phase = $script:journal.phase
        backupFileName = $script:journal.backupFileName
        backupSnapshotStartedAtUtc = $script:journal.backupSnapshotStartedAtUtc
        targetNodeId = $nodeId
        epoch = $script:journal.epoch
    }
    if (-not $Execute) {
        $plan | ConvertTo-Json -Depth 5
        return
    }
    if (-not $PSCmdlet.ShouldProcess("узел $nodeId", "восстановить $($script:journal.backupFileName) и назначить узел активным")) {
        return
    }
    if ($script:journal.phase -eq 'READY') {
        $readyBackupAge = (Get-Date).ToUniversalTime() - ([DateTime]$script:journal.backupSnapshotStartedAtUtc)
        if ($readyBackupAge.TotalMinutes -lt -5) {
            throw 'Время backup находится в будущем; проверьте часы на трёх ПК.'
        }
        $journalAllowsOlder = (
            $script:journal.PSObject.Properties['allowOlderBackup'] -and
            [bool]$script:journal.allowOlderBackup
        )
        if (-not ($journalAllowsOlder -or $AllowOlderBackup) -and
            $readyBackupAge.TotalMinutes -gt $MaximumBackupAgeMinutes) {
            throw "Закреплённая recovery-копия старше $MaximumBackupAgeMinutes минут."
        }
        if ($AllowOlderBackup -and -not $journalAllowsOlder) {
            $script:journal.allowOlderBackup = $true
        }
    }
    if ($newJournal) {
        if ($completedJournalPath) {
            Move-Item -LiteralPath $script:journalPath -Destination $completedJournalPath -Force
        }
        Write-RecoveryJournal -Path $script:journalPath -Journal $script:journal | Out-Null
        $journalDurable = $true
    } elseif ($script:journal.phase -eq 'READY' -and $AllowOlderBackup) {
        Write-RecoveryJournal -Path $script:journalPath -Journal $script:journal | Out-Null
    }

    $lanAddress = if ($environment['LAN_BIND_ADDRESS']) { $environment['LAN_BIND_ADDRESS'] } else { $env:COMPUTERNAME }
    $applicationUrl = "http://$lanAddress"

    if ($script:journal.phase -eq 'ACTIVE') {
        Assert-RecoveryActiveState -Journal $script:journal -WitnessPaths $witnessPaths -TaskUser $taskUser `
            -ApplicationUrl $applicationUrl | Out-Null
        $activeResult = Write-RecoverySuccessResult -Journal $script:journal -Release $currentRelease `
            -ApplicationUrl $applicationUrl -Path $ResultPath
        $activeResult | ConvertTo-Json -Depth 8
        return
    }

    if (-not (Test-RecoveryPhaseAtLeast -Current $script:journal.phase -Required 'TARGET_VALIDATED')) {
        Stop-RecoveryWorkloads
        if (-not (Test-RecoveryPhaseAtLeast -Current $script:journal.phase -Required 'WORKLOADS_STOPPED')) {
            Set-RecoveryPhase -Phase 'WORKLOADS_STOPPED'
        }

        if (-not (Test-RecoveryPhaseAtLeast -Current $script:journal.phase -Required 'VERIFYING')) {
            Set-RecoveryPhase -Phase 'VERIFYING'
        }
        & (Join-Path $PSScriptRoot 'verify-backup.ps1') -BackupFile $candidate.BackupFile `
            -DatabaseUrl $DatabaseUrl -AdminDatabaseUrl $AdminDatabaseUrl -PgBin $PgBin -TestRestore

        if (-not (Test-RecoveryPhaseAtLeast -Current $script:journal.phase -Required 'TARGET_RESTORING')) {
            Set-RecoveryPhase -Phase 'TARGET_RESTORING'
        }
        $appConfiguration = Get-DatabaseConfiguration -DatabaseUrl $DatabaseUrl
        $adminConfiguration = Get-DatabaseConfiguration -DatabaseUrl $AdminDatabaseUrl
        $createdb = Resolve-PostgresTool -Name 'createdb' -PgBin $PgBin
        $pgRestore = Resolve-PostgresTool -Name 'pg_restore' -PgBin $PgBin
        $psql = Resolve-PostgresTool -Name 'psql' -PgBin $PgBin
        $connectionArguments = @(
            "--host=$($adminConfiguration.Host)",
            "--port=$($adminConfiguration.Port)",
            "--username=$($adminConfiguration.User)"
        )
        $databaseExists = ((Invoke-PostgresTool -Tool $psql -Configuration $adminConfiguration -Arguments ($connectionArguments + @(
            '--dbname=postgres', '--tuples-only', '--no-align', '--quiet',
            "--command=select 1 from pg_database where datname = '$($script:journal.recoveryDatabase)';"
        ))) -join '').Trim()
        if (-not $databaseExists) {
            Invoke-PostgresTool -Tool $createdb -Configuration $adminConfiguration -Arguments ($connectionArguments + @(
                '--maintenance-db=postgres', "--owner=$($appConfiguration.User)", $script:journal.recoveryDatabase
            )) | Out-Null
        }
        Invoke-PostgresTool -Tool $pgRestore -Configuration $adminConfiguration -Arguments ($connectionArguments + @(
            "--dbname=$($script:journal.recoveryDatabase)", "--role=$($appConfiguration.User)", '--clean', '--if-exists',
            '--no-owner', '--no-privileges', '--exit-on-error', $candidate.BackupFile
        )) | Out-Null

        $restoredCounts = Get-DatabaseCounts -Psql $psql -Configuration $adminConfiguration -DatabaseName $script:journal.recoveryDatabase
        Test-RecoveryCounts -Actual $restoredCounts -Expected $candidate.Manifest.counts
        $recoveryDatabaseUrl = Get-RecoveryDatabaseUrl -SourceUrl $DatabaseUrl -DatabaseName $script:journal.recoveryDatabase
        $previousDatabaseUrl = $env:DATABASE_URL
        try {
            $env:DATABASE_URL = $recoveryDatabaseUrl
            $pnpm = Get-Command 'pnpm.cmd' -ErrorAction Stop
            & $pnpm.Source 'db:migrate'
            if ($LASTEXITCODE -ne 0) { throw 'Совместимые миграции не применились к новой базе.' }
        } finally {
            if ($null -ne $previousDatabaseUrl) { $env:DATABASE_URL = $previousDatabaseUrl } else { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue }
        }
        $postMigrationCounts = Get-DatabaseCounts -Psql $psql -Configuration $adminConfiguration -DatabaseName $script:journal.recoveryDatabase
        Test-RecoveryCounts -Actual $postMigrationCounts -Expected $candidate.Manifest.counts
        $script:journal.targetCounts = $postMigrationCounts
        Set-RecoveryPhase -Phase 'TARGET_VALIDATED'
    }

    if (-not (Test-RecoveryPhaseAtLeast -Current $script:journal.phase -Required 'WITNESS_COMMITTED')) {
        Stop-RecoveryWorkloads
        $desiredQuorum = $null
        try { $desiredQuorum = Get-PromotionQuorum -WitnessPaths $witnessPaths -ExpectedClusterId $clusterId } catch { }
        if ($desiredQuorum -and $desiredQuorum.activeNodeId -eq $nodeId -and
            [Int64]$desiredQuorum.epoch -eq [Int64]$script:journal.epoch) {
            Set-RecoveryPhase -Phase 'WITNESS_COMMITTED'
        } else {
            if ($desiredQuorum) {
                if ($desiredQuorum.activeNodeId -ne $script:journal.previousActiveNodeId -or
                    [Int64]$desiredQuorum.epoch -ne [Int64]$script:journal.previousEpoch) {
                    throw 'Текущий quorum изменился после подготовки recovery; переключение заблокировано.'
                }
                Assert-CurrentActiveNodeUnavailable -CurrentQuorum $desiredQuorum -WitnessPaths $witnessPaths `
                    -ConfiguredPrimaryHost $configuredPrimaryHost
            } else {
                $resumeQuorum = [PSCustomObject]@{ activeNodeId = $script:journal.previousActiveNodeId }
                Assert-CurrentActiveNodeUnavailable -CurrentQuorum $resumeQuorum -WitnessPaths $witnessPaths `
                    -ConfiguredPrimaryHost $configuredPrimaryHost
            }
            $witnessNodeIds = @($witnessPaths | ForEach-Object { $_.TrimStart('\').Split('\')[0].ToLowerInvariant() })
            Commit-PromotionWitness -WitnessPaths $witnessPaths -WitnessNodeIds $witnessNodeIds `
                -ClusterId $clusterId -Epoch ([Int64]$script:journal.epoch) -ActiveNodeId $nodeId | Out-Null
            $committedQuorum = Get-PromotionQuorum -WitnessPaths $witnessPaths -ExpectedClusterId $clusterId
            if ($committedQuorum.activeNodeId -ne $nodeId -or [Int64]$committedQuorum.epoch -ne [Int64]$script:journal.epoch) {
                throw 'Witness quorum не подтвердил новый активный узел.'
            }
            Set-RecoveryPhase -Phase 'WITNESS_COMMITTED'
        }
    }

    $recoveryDatabaseUrl = Get-RecoveryDatabaseUrl -SourceUrl $DatabaseUrl -DatabaseName $script:journal.recoveryDatabase
    if (-not (Test-RecoveryPhaseAtLeast -Current $script:journal.phase -Required 'ENV_CONFIGURED')) {
        Set-DeploymentEnvValues -Values @{ DATABASE_URL = $recoveryDatabaseUrl; CLIENT_ORIGIN = $applicationUrl }
        Set-RecoveryPhase -Phase 'ENV_CONFIGURED'
    }
    if (-not (Test-RecoveryPhaseAtLeast -Current $script:journal.phase -Required 'SERVICE_READY')) {
        $service = Get-WorkwearService
        if (-not $service) { throw 'Служба WorkwearERP не установлена на резервном ПК.' }
        Set-Service -Name $script:WorkwearServiceName -StartupType Automatic
        Start-Service -Name $script:WorkwearServiceName
        $service.WaitForStatus('Running', [TimeSpan]::FromSeconds(60))
        if (-not (Wait-RecoveryReadiness -ApplicationUrl $applicationUrl -ExpectedDatabase $script:journal.recoveryDatabase `
            -ExpectedClusterId $clusterId -ExpectedNodeId $nodeId `
            -ExpectedEpoch ([Int64]$script:journal.epoch) -ExpectedMigrationHead $script:journal.targetMigrationHead `
            -TimeoutSeconds 120)) {
            throw 'Новый активный узел не прошёл строгую проверку recovery readiness.'
        }
        Set-RecoveryPhase -Phase 'SERVICE_READY'
    }
    if (-not (Test-RecoveryPhaseAtLeast -Current $script:journal.phase -Required 'TASKS_READY')) {
        Ensure-RecoveryBackupTasks -TaskUser $taskUser
        Set-RecoveryPhase -Phase 'TASKS_READY'
    }

    Assert-RecoveryActiveState -Journal $script:journal -WitnessPaths $witnessPaths -TaskUser $taskUser `
        -ApplicationUrl $applicationUrl | Out-Null
    Set-RecoveryPhase -Phase 'ACTIVE'
    $result = Write-RecoverySuccessResult -Journal $script:journal -Release $currentRelease `
        -ApplicationUrl $applicationUrl -Path $ResultPath

    $protocolDirectory = if ($EvidencePath) { $EvidencePath } else { Join-Path $StateRoot 'protocols' }
    [IO.Directory]::CreateDirectory($protocolDirectory) | Out-Null
    $protocolPath = Join-Path $protocolDirectory "recovery-$($script:journal.attemptId).md"
    $protocol = @(
        '# Протокол аварийного восстановления', '', '- Результат: active',
        "- Узел: $nodeId", "- Эпоха: $($script:journal.epoch)", "- Релиз: $($currentRelease.releaseId)",
        "- Копия: $($script:journal.backupFileName)", "- SHA-256: $($script:journal.backupSha256)",
        "- Начало снимка UTC: $($script:journal.backupSnapshotStartedAtUtc)", "- Новый адрес: $applicationUrl",
        "- Проверено UTC: $($result.validatedAtUtc)"
    )
    [IO.File]::WriteAllLines($protocolPath, $protocol, (New-Object Text.UTF8Encoding($false)))
    $result | ConvertTo-Json -Depth 8
} catch {
    if ($script:journal -and $journalDurable) {
        $script:journal.lastErrorCode = 'RECOVERY_FAILED'
        $script:journal.updatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
        try { Write-RecoveryJournal -Path $script:journalPath -Journal $script:journal | Out-Null } catch { }
    }
    throw
} finally {
    if ($recoveryLock) { $recoveryLock.Dispose() }
}
