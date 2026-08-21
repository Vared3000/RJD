[CmdletBinding()]
param(
    [string]$NodeId,
    [string]$ClusterId,
    [string]$PrimaryHost,
    [string[]]$WitnessPaths
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
. (Join-Path $script:RepositoryRoot 'scripts\backup-common.ps1')
. (Join-Path $script:RepositoryRoot 'scripts\recovery-common.ps1')

Assert-WindowsHost
Ensure-Administrator -ScriptPath $PSCommandPath -BoundParameters $PSBoundParameters
$logPath = New-DeploymentLog -Operation 'prepare-reserve'

try {
    if (-not $NodeId) { $NodeId = Read-Host 'Стабильный идентификатор этого ПК (например, pc2)' }
    if (-not $ClusterId) { $ClusterId = Read-Host 'Идентификатор группы из трёх ПК' }
    if (-not $PrimaryHost) { $PrimaryHost = Read-Host 'Имя или IP основного ПК' }
    if (-not $WitnessPaths -or @($WitnessPaths).Count -eq 0) {
        $WitnessPaths = @((Read-Host 'Два пути к promotion.json через точку с запятой') -split ';')
    }
    $NodeId = $NodeId.Trim().ToLowerInvariant()
    $ClusterId = $ClusterId.Trim().ToLowerInvariant()
    $PrimaryHost = $PrimaryHost.Trim()
    $WitnessPaths = @($WitnessPaths | ForEach-Object { $_.Trim() } | Where-Object { $_ } | Select-Object -Unique)
    if ($NodeId -notmatch '^[a-z0-9][a-z0-9-]{1,31}$') { throw 'Некорректный идентификатор ПК.' }
    if ($ClusterId -notmatch '^[a-z0-9][a-z0-9-]{3,63}$') { throw 'Некорректный идентификатор группы ПК.' }
    if (-not $PrimaryHost -or $PrimaryHost -match '[\\/;]') { throw 'Некорректное имя основного ПК.' }
    if ($WitnessPaths.Count -ne 2) { throw 'Нужны два разных пути к witness-файлам.' }
    if (@($WitnessPaths | Where-Object { -not $_.StartsWith('\\') }).Count -gt 0) {
        throw 'Witness-файлы должны находиться в двух UNC-папках резервных ПК.'
    }
    $witnessHosts = @($WitnessPaths | ForEach-Object { $_.TrimStart('\').Split('\')[0].ToLowerInvariant() } | Select-Object -Unique)
    if ($witnessHosts.Count -ne 2) { throw 'Witness-файлы должны находиться на двух разных ПК.' }

    $environment = Read-DeploymentEnv
    if (-not $environment['DATABASE_URL']) { throw 'Сначала установите программу на резервный ПК.' }
    if (-not $environment['BACKUP_ADMIN_DATABASE_URL']) { throw 'Не настроена служебная роль аварийного восстановления.' }
    $release = Get-ApplicationReleaseMetadata -ProjectRoot $script:RepositoryRoot
    if ($release.isDirty -or -not $release.commit -or -not $release.tree -or -not $release.clientBuildSha256) {
        throw 'Подготовка резерва разрешена только из чистого неизменяемого Git-релиза.'
    }
    $allowedWitnessSids = [Collections.Generic.List[string]]::new()
    @('S-1-5-18', 'S-1-5-32-544', [Security.Principal.WindowsIdentity]::GetCurrent().User.Value) |
        ForEach-Object { if ($_ -and -not $allowedWitnessSids.Contains($_)) { $allowedWitnessSids.Add($_) } }
    if ($environment['BACKUP_TASK_USER'] -and $environment['BACKUP_TASK_USER'] -ne 'SYSTEM') {
        try {
            $taskSid = ([Security.Principal.NTAccount]$environment['BACKUP_TASK_USER']).Translate([Security.Principal.SecurityIdentifier]).Value
            if (-not $allowedWitnessSids.Contains($taskSid)) { $allowedWitnessSids.Add($taskSid) }
        } catch {
            throw 'Не удалось определить SID служебной учётной записи backup.'
        }
    }
    @(([string]$environment['RECOVERY_WITNESS_ALLOWED_SIDS']) -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ }) |
        ForEach-Object {
            if ($_ -notmatch '^S-1-') { throw 'RECOVERY_WITNESS_ALLOWED_SIDS содержит некорректный SID.' }
            if (-not $allowedWitnessSids.Contains($_)) { $allowedWitnessSids.Add($_) }
        }
    $backupRoot = if ($environment['BACKUP_ROOT']) { $environment['BACKUP_ROOT'] } else { Join-Path $script:RepositoryRoot 'backups' }
    New-Item -ItemType Directory -Force -Path (Join-Path $backupRoot 'daily') | Out-Null
    $postgresBin = Get-PostgresBinDirectory -RequiredMajor 18
    if (-not $postgresBin) { throw 'На резервном ПК не найден PostgreSQL 18.' }
    $appDatabase = Get-DatabaseConfiguration -DatabaseUrl $environment['DATABASE_URL']
    $backupAdmin = Get-DatabaseConfiguration -DatabaseUrl $environment['BACKUP_ADMIN_DATABASE_URL']
    $membership = (Invoke-PostgresTool -Tool (Join-Path $postgresBin 'psql.exe') -Configuration $backupAdmin -Arguments @(
        "--host=$($backupAdmin.Host)", "--port=$($backupAdmin.Port)", "--username=$($backupAdmin.User)", '--dbname=postgres',
        '--tuples-only', '--no-align', '--quiet', "--command=select pg_has_role(current_user, '$($appDatabase.User)', 'MEMBER')::text;"
    )) -join ''
    if ($membership.Trim() -ne 'true') {
        throw 'Служебная роль не подготовлена для безопасного создания новой базы. Повторно запустите обновлённый установщик.'
    }

    foreach ($witnessPath in $WitnessPaths) {
        $parent = Split-Path $witnessPath -Parent
        if (-not $parent -or -not (Test-Path -LiteralPath $parent -PathType Container)) {
            throw "Недоступна папка witness: $parent"
        }
        Assert-RecoveryWitnessAcl -Path $parent -AllowedSids @($allowedWitnessSids)
        $probe = Join-Path $parent ".workwear-reserve-probe-$([Guid]::NewGuid().ToString('N'))"
        try {
            [IO.File]::WriteAllText($probe, 'probe', [Text.UTF8Encoding]::new($false))
            if ((Get-Content -LiteralPath $probe -Raw) -ne 'probe') { throw 'read-back failed' }
        } finally {
            if (Test-Path -LiteralPath $probe) { Remove-Item -LiteralPath $probe -Force }
        }
    }

    $stateRoot = Join-Path $env:ProgramData 'WorkwearERP\recovery'
    New-Item -ItemType Directory -Force -Path $stateRoot | Out-Null
    Protect-DeploymentPath -Path $stateRoot -Mode StateDirectory -AdditionalIdentity $environment['BACKUP_TASK_USER']

    # A reserve must become fail-closed before its cluster identity is written.
    $service = Get-WorkwearService
    if ($service) {
        if ($service.Status -ne 'Stopped') {
            Stop-Service -Name $script:WorkwearServiceName -Force
            $service.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(60))
        }
        Set-Service -Name $script:WorkwearServiceName -StartupType Disabled
        $service = Get-Service -Name $script:WorkwearServiceName
        if ($service.Status -ne 'Stopped' -or $service.StartType -ne 'Disabled') {
            throw 'Не удалось надёжно остановить и отключить службу WorkwearERP.'
        }
    }
    foreach ($taskName in @('Workwear ERP Hourly Backup', 'Workwear ERP Monthly Restore Test', 'Workwear ERP Daily Backup')) {
        $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        if ($task) {
            Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
            Disable-ScheduledTask -TaskName $taskName | Out-Null
            if ((Get-ScheduledTask -TaskName $taskName).State -ne 'Disabled') {
                throw "Не удалось остановить задание: $taskName"
            }
        }
    }

    Write-RecoveryClusterSentinel -StateRoot $stateRoot -ClusterId $ClusterId -NodeId $NodeId `
        -WitnessPaths $WitnessPaths -ReaderIdentity $environment['BACKUP_TASK_USER'] | Out-Null
    Set-DeploymentEnvValues -Values @{
        WORKWEAR_CLUSTER_ID = $ClusterId
        WORKWEAR_NODE_ID = $NodeId
        RECOVERY_PRIMARY_HOST = $PrimaryHost
        RECOVERY_WITNESS_PATHS = ($WitnessPaths -join ';')
        RECOVERY_STATE_ROOT = $stateRoot
        RECOVERY_SENTINEL_PATH = (Join-Path $stateRoot 'cluster-mode.json')
    }
    $writtenEnvironment = Read-DeploymentEnv
    $writtenRecoveryConfiguration = Get-RecoveryClusterSentinel -EnvironmentValues $writtenEnvironment -DefaultStateRoot $stateRoot
    $recoveryReady = $false
    $recoveryReadinessReason = 'No exact verified local backup is available yet.'
    try {
        $currentQuorum = Get-PromotionQuorum -WitnessPaths $writtenRecoveryConfiguration.WitnessPaths `
            -ExpectedClusterId $writtenRecoveryConfiguration.ClusterId `
            -ExpectedWitnessNodeIds $writtenRecoveryConfiguration.WitnessNodeIds
        $readyCandidates = @(Get-RecoveryCandidates -BackupRoot $backupRoot -ExpectedRelease $release `
            -ExpectedClusterId $ClusterId -ExpectedActiveNodeId $currentQuorum.activeNodeId -ExpectedEpoch $currentQuorum.epoch)
        if ($readyCandidates.Count -gt 0) {
            $recoveryReady = $true
            $recoveryReadinessReason = 'Exact release and at least one verified local backup are available.'
        }
    } catch {
        $recoveryReadinessReason = $_.Exception.Message
    }

    $prepared = [ordered]@{
        formatVersion = 1
        preparedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
        nodeId = $NodeId
        clusterId = $ClusterId
        primaryHost = $PrimaryHost
        release = $release
        serviceDisabled = $true
        backupTasksDisabled = $true
        recoveryReady = $recoveryReady
        recoveryReadinessReason = $recoveryReadinessReason
    }
    $preparedPath = Join-Path $stateRoot 'prepared.json'
    Write-DeploymentJsonAtomic -Path $preparedPath -Value $prepared
    Protect-DeploymentPath -Path $preparedPath -Mode StateFile -AdditionalIdentity $environment['BACKUP_TASK_USER']

    $desktop = [Environment]::GetFolderPath('CommonDesktopDirectory')
    $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop 'Аварийное восстановление.lnk'))
    $shortcut.TargetPath = Join-Path $script:RepositoryRoot 'Аварийное восстановление.bat'
    $shortcut.WorkingDirectory = $script:RepositoryRoot
    $shortcut.Save()

    Write-DeploymentLog -LogPath $logPath -Message "Резервный ПК $NodeId подготовлен. Служба остановлена до аварийного переключения."
    exit 0
} catch {
    Write-OperationFailure -LogPath $logPath -ErrorRecord $_
    exit 1
}
