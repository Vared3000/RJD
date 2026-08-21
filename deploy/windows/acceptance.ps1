[CmdletBinding()]
param([switch]$SkipElevation)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
. (Join-Path $script:RepositoryRoot 'scripts\backup-common.ps1')

Assert-WindowsHost
if (-not $SkipElevation) {
    Ensure-Administrator -ScriptPath $PSCommandPath
}
$logPath = New-DeploymentLog -Operation 'acceptance'
$reportDirectory = Join-Path $script:RepositoryRoot 'logs\acceptance'
$checks = [Collections.Generic.List[object]]::new()

function Add-AcceptanceCheck {
    param(
        [Parameter(Mandatory = $true)][string]$Id,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][ValidateSet('pass', 'fail', 'manual')][string]$Status,
        [Parameter(Mandatory = $true)][string]$Detail
    )

    $checks.Add([PSCustomObject]@{
        id = $Id
        name = $Name
        status = $Status
        detail = $Detail
    })
    $level = if ($Status -eq 'fail') { 'ERROR' } elseif ($Status -eq 'manual') { 'WARN' } else { 'INFO' }
    Write-DeploymentLog -LogPath $logPath -Message "[$($Status.ToUpperInvariant())] $Name - $Detail" -Level $level
}

function Test-HttpHealth {
    param([Parameter(Mandatory = $true)][string]$Uri)

    try {
        $result = Invoke-RestMethod -Uri $Uri -TimeoutSec 10
        return $result.status -eq 'ok'
    } catch {
        return $false
    }
}

function Get-CommandMajorVersion {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(Mandatory = $true)][string]$VersionArgument
    )

    $resolved = Get-Command $Command -ErrorAction SilentlyContinue
    if (-not $resolved) {
        return 0
    }
    $version = [string](& $resolved.Source $VersionArgument 2>$null)
    if ($version -match '(\d+)(?:\.\d+)?') {
        return [int]$Matches[1]
    }
    return 0
}

function Test-BackupPathAclSafe {
    param([Parameter(Mandatory = $true)][string]$Path)

    $unsafeSids = @('S-1-1-0', 'S-1-5-11', 'S-1-5-32-545')
    foreach ($rule in (Get-Acl -LiteralPath $Path).Access) {
        if ($rule.AccessControlType -ne 'Allow' -or [string]$rule.FileSystemRights -notmatch 'Write|Modify|FullControl|CreateFiles') {
            continue
        }
        try {
            $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
            if ($sid -in $unsafeSids) {
                return $false
            }
        } catch { }
    }
    return $true
}

function Test-BackupEvidence {
    param(
        [Parameter(Mandatory = $true)][hashtable]$EnvironmentValues
    )

    $backupRoot = $EnvironmentValues['BACKUP_ROOT']
    $secondaryRoots = @(Resolve-BackupSecondaryPaths -EnvironmentValues $EnvironmentValues)
    if (-not $backupRoot -or -not (Test-Path -LiteralPath $backupRoot)) {
        return [PSCustomObject]@{ Passed = $false; Detail = 'BACKUP_ROOT is missing or unavailable.' }
    }
    if (-not (Test-BackupPathAclSafe -Path $backupRoot)) {
        return [PSCustomObject]@{ Passed = $false; Detail = "BACKUP_ROOT allows writes by ordinary users: $backupRoot" }
    }
    $latest = Get-ChildItem -LiteralPath (Join-Path $backupRoot 'daily') -Filter '*.dump' -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if (-not $latest) {
        return [PSCustomObject]@{ Passed = $false; Detail = 'No daily dump was found.' }
    }
    $manifestPath = "$($latest.FullName).json"
    $shaPath = "$($latest.FullName).sha256"
    if (-not (Test-Path -LiteralPath $manifestPath) -or -not (Test-Path -LiteralPath $shaPath)) {
        return [PSCustomObject]@{ Passed = $false; Detail = "Manifest or SHA is missing for $($latest.Name)." }
    }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    try {
        $backupAge = (Get-Date).ToUniversalTime() - ([DateTimeOffset]::Parse([string]$manifest.createdAtUtc).UtcDateTime)
    } catch {
        return [PSCustomObject]@{ Passed = $false; Detail = "Backup timestamp is invalid for $($latest.Name)." }
    }
    if ($backupAge.TotalMinutes -lt -5) {
        return [PSCustomObject]@{ Passed = $false; Detail = "Backup timestamp is more than five minutes in the future: $($latest.Name)." }
    }
    if ($backupAge.TotalMinutes -gt 90) {
        return [PSCustomObject]@{ Passed = $false; Detail = "Latest backup is older than 90 minutes: $($latest.Name)." }
    }
    $actualHash = (Get-FileHash -LiteralPath $latest.FullName -Algorithm SHA256).Hash
    if ($actualHash -ne $manifest.sha256) {
        return [PSCustomObject]@{ Passed = $false; Detail = "SHA256 mismatch for $($latest.Name)." }
    }
    $declaredHash = ((Get-Content -LiteralPath $shaPath -Raw -Encoding ASCII).Trim() -split '\s+')[0]
    if ($declaredHash -ne $actualHash) {
        return [PSCustomObject]@{ Passed = $false; Detail = "SHA256 sidecar does not describe $($latest.Name)." }
    }
    if ($secondaryRoots.Count -ne 2) {
        return [PSCustomObject]@{ Passed = $false; Detail = "Exactly two secondary backup paths are required; configured: $($secondaryRoots.Count)." }
    }
    $secondaryHosts = @($secondaryRoots | ForEach-Object { $_.TrimStart('\').Split('\')[0].ToLowerInvariant() } | Select-Object -Unique)
    if ($secondaryHosts.Count -ne 2) {
        return [PSCustomObject]@{ Passed = $false; Detail = 'Secondary backup paths must use two different hosts.' }
    }
    $sourceSet = @($latest.FullName, $manifestPath, $shaPath)
    foreach ($secondaryRoot in $secondaryRoots) {
        if (-not (Test-Path -LiteralPath $secondaryRoot -PathType Container)) {
            return [PSCustomObject]@{ Passed = $false; Detail = "Secondary backup path is unavailable: $secondaryRoot" }
        }
        if (-not (Test-BackupPathAclSafe -Path $secondaryRoot)) {
            return [PSCustomObject]@{ Passed = $false; Detail = "Secondary backup path allows writes by ordinary users: $secondaryRoot" }
        }
        $secondaryDaily = Join-Path $secondaryRoot 'daily'
        foreach ($sourceFile in $sourceSet) {
            $secondaryFile = Join-Path $secondaryDaily ([IO.Path]::GetFileName($sourceFile))
            if (-not (Test-Path -LiteralPath $secondaryFile -PathType Leaf)) {
                return [PSCustomObject]@{ Passed = $false; Detail = "Secondary copy is missing: $secondaryFile" }
            }
            if ((Get-Item -LiteralPath $secondaryFile).Length -ne (Get-Item -LiteralPath $sourceFile).Length) {
                return [PSCustomObject]@{ Passed = $false; Detail = "Secondary size mismatch: $secondaryFile" }
            }
            if ((Get-FileHash -LiteralPath $secondaryFile -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $sourceFile -Algorithm SHA256).Hash) {
                return [PSCustomObject]@{ Passed = $false; Detail = "Secondary SHA256 mismatch: $secondaryFile" }
            }
        }
    }
    $latestMonthly = Get-ChildItem -LiteralPath (Join-Path $backupRoot 'monthly') -Filter '*.dump' -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if (-not $latestMonthly -or -not (Test-Path -LiteralPath "$($latestMonthly.FullName).verified.json")) {
        return [PSCustomObject]@{ Passed = $false; Detail = 'Monthly restore verification is missing.' }
    }
    $verification = Get-Content -LiteralPath "$($latestMonthly.FullName).verified.json" -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($verification.result -ne 'ok') {
        return [PSCustomObject]@{ Passed = $false; Detail = "Restore verification is not successful for $($latestMonthly.Name)." }
    }
    return [PSCustomObject]@{ Passed = $true; Detail = "All three backup copies match: $($latest.Name)." }
}

function Test-ScheduledTaskSuccess {
    param([Parameter(Mandatory = $true)][string]$TaskName)

    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if (-not $task) {
        return [PSCustomObject]@{ Passed = $false; Detail = "Task is missing: $TaskName" }
    }
    $info = Get-ScheduledTaskInfo -TaskName $TaskName
    if ($info.LastRunTime.Year -lt 2000) {
        return [PSCustomObject]@{ Passed = $false; Detail = "Task has never run: $TaskName" }
    }
    if ($info.LastTaskResult -ne 0) {
        return [PSCustomObject]@{ Passed = $false; Detail = "Last result is $($info.LastTaskResult): $TaskName" }
    }
    return [PSCustomObject]@{ Passed = $true; Detail = "Last run succeeded at $($info.LastRunTime.ToString('s'))." }
}

function Test-HourlyBackupTask {
    $taskName = 'Workwear ERP Hourly Backup'
    $result = Test-ScheduledTaskSuccess -TaskName $taskName
    if (-not $result.Passed) {
        return $result
    }
    $task = Get-ScheduledTask -TaskName $taskName
    $intervals = @($task.Triggers | ForEach-Object { [string]$_.Repetition.Interval })
    if ('PT1H' -notin $intervals) {
        return [PSCustomObject]@{ Passed = $false; Detail = 'Hourly backup trigger interval is not PT1H.' }
    }
    if ([string]$task.Settings.MultipleInstances -ne 'IgnoreNew') {
        return [PSCustomObject]@{ Passed = $false; Detail = 'Parallel backup instances are not blocked.' }
    }
    $actionArguments = @($task.Actions | ForEach-Object { [string]$_.Arguments }) -join ' '
    if ($actionArguments -notmatch '-RequiredSecondaryCount\s+2(?:\s|$)') {
        return [PSCustomObject]@{ Passed = $false; Detail = 'Hourly backup task does not require both secondary PCs.' }
    }
    if (Get-ScheduledTask -TaskName 'Workwear ERP Daily Backup' -ErrorAction SilentlyContinue) {
        return [PSCustomObject]@{ Passed = $false; Detail = 'Legacy daily backup task is still registered.' }
    }
    return $result
}

function Test-BackupRuntimeStatus {
    param([Parameter(Mandatory = $true)][hashtable]$EnvironmentValues)

    $backupRoot = $EnvironmentValues['BACKUP_ROOT']
    $statusPath = if ($backupRoot) { Join-Path (Join-Path $backupRoot 'status') 'latest.json' } else { $null }
    if (-not $statusPath -or -not (Test-Path -LiteralPath $statusPath -PathType Leaf)) {
        return [PSCustomObject]@{ Passed = $false; Warning = $false; Detail = 'Backup status file is missing.' }
    }
    try {
        $status = Get-Content -LiteralPath $statusPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $statusTime = [DateTimeOffset]::Parse([string]$(if ($status.finishedAtUtc) { $status.finishedAtUtc } else { $status.startedAtUtc })).UtcDateTime
    } catch {
        return [PSCustomObject]@{ Passed = $false; Warning = $false; Detail = 'Backup status file is malformed.' }
    }
    $statusAge = (Get-Date).ToUniversalTime() - $statusTime
    if ($statusAge.TotalMinutes -lt -5) {
        return [PSCustomObject]@{ Passed = $false; Warning = $false; Detail = 'Backup status timestamp is in the future.' }
    }
    if ($statusAge.TotalMinutes -gt 90) {
        return [PSCustomObject]@{ Passed = $false; Warning = $false; Detail = 'Backup status is older than 90 minutes.' }
    }
    if (@($status.targets).Count -ne 3) {
        return [PSCustomObject]@{ Passed = $false; Warning = $false; Detail = 'Backup status must contain exactly three PCs.' }
    }
    $failedTargets = @($status.targets | Where-Object status -notin 'ok', 'warning')
    if ($status.status -eq 'error' -or $failedTargets.Count -gt 0) {
        return [PSCustomObject]@{ Passed = $false; Warning = $false; Detail = 'At least one backup destination reports an error.'; Targets = @($status.targets) }
    }
    $warningTargets = @($status.targets | Where-Object status -eq 'warning')
    if ($status.status -eq 'warning' -or $warningTargets.Count -gt 0) {
        return [PSCustomObject]@{ Passed = $true; Warning = $true; Detail = 'Backup is current, but at least one PC has less than 20% free space.'; Targets = @($status.targets) }
    }
    if ($status.status -ne 'ok') {
        return [PSCustomObject]@{ Passed = $false; Warning = $false; Detail = "Unexpected backup status: $($status.status)"; Targets = @($status.targets) }
    }
    return [PSCustomObject]@{ Passed = $true; Warning = $false; Detail = 'Hourly backup status is current for all three PCs.'; Targets = @($status.targets) }
}

try {
    Write-DeploymentLog -LogPath $logPath -Message (Get-DeploymentMessage 'acceptanceStarted')
    $values = Read-DeploymentEnv

    $os = Get-CimInstance Win32_OperatingSystem
    $osPassed = ([version]$os.Version).Major -ge 10
    Add-AcceptanceCheck -Id 'windows' -Name (Get-DeploymentMessage 'acceptWindows') -Status $(if ($osPassed) { 'pass' } else { 'fail' }) -Detail "$($os.Caption), $($os.Version)"

    $nodeMajor = Get-CommandMajorVersion -Command 'node.exe' -VersionArgument '--version'
    Add-AcceptanceCheck -Id 'node' -Name (Get-DeploymentMessage 'acceptNode') -Status $(if ($nodeMajor -eq 24) { 'pass' } else { 'fail' }) -Detail "major=$nodeMajor"
    $pnpmMajor = Get-CommandMajorVersion -Command 'pnpm.cmd' -VersionArgument '--version'
    Add-AcceptanceCheck -Id 'pnpm' -Name (Get-DeploymentMessage 'acceptPnpm') -Status $(if ($pnpmMajor -eq 11) { 'pass' } else { 'fail' }) -Detail "major=$pnpmMajor"

    $postgresBin = Get-PostgresBinDirectory -RequiredMajor 18
    $postgresService = Get-PostgresService -RequiredMajor 18
    $postgresPassed = $postgresBin -and $postgresService -and $postgresService.Status -eq 'Running'
    $postgresDetail = if ($postgresService) { "$($postgresService.Name): $($postgresService.Status)" } else { 'PostgreSQL 18 service not found.' }
    Add-AcceptanceCheck -Id 'postgres' -Name (Get-DeploymentMessage 'acceptPostgres') -Status $(if ($postgresPassed) { 'pass' } else { 'fail' }) -Detail $postgresDetail

    $service = Get-CimInstance Win32_Service -Filter "Name='$script:WorkwearServiceName'" -ErrorAction SilentlyContinue
    $servicePassed = $service -and $service.State -eq 'Running' -and $service.StartMode -eq 'Auto'
    $serviceDetail = if ($service) { "state=$($service.State), startMode=$($service.StartMode)" } else { 'WorkwearERP service not found.' }
    Add-AcceptanceCheck -Id 'service' -Name (Get-DeploymentMessage 'acceptService') -Status $(if ($servicePassed) { 'pass' } else { 'fail' }) -Detail $serviceDetail

    $loopbackHealth = Test-HttpHealth -Uri 'http://127.0.0.1/health'
    Add-AcceptanceCheck -Id 'health-loopback' -Name (Get-DeploymentMessage 'acceptHealthLocal') -Status $(if ($loopbackHealth) { 'pass' } else { 'fail' }) -Detail 'http://127.0.0.1/health'
    $clientOrigin = $values['CLIENT_ORIGIN']
    $lanHealth = $clientOrigin -and (Test-HttpHealth -Uri "$($clientOrigin.TrimEnd('/'))/health")
    Add-AcceptanceCheck -Id 'health-lan' -Name (Get-DeploymentMessage 'acceptHealthLan') -Status $(if ($lanHealth) { 'pass' } else { 'fail' }) -Detail $(if ($clientOrigin) { "$($clientOrigin.TrimEnd('/'))/health" } else { 'CLIENT_ORIGIN is missing.' })

    $lanSubnet = $values['LAN_SUBNET']
    $firewall = Get-NetFirewallRule -DisplayName 'Workwear ERP LAN HTTP' -ErrorAction SilentlyContinue | Select-Object -First 1
    $firewallPassed = $false
    if ($firewall -and $lanSubnet) {
        $portFilter = Get-NetFirewallPortFilter -AssociatedNetFirewallRule $firewall
        $addressFilter = Get-NetFirewallAddressFilter -AssociatedNetFirewallRule $firewall
        $firewallPassed = $firewall.Enabled -eq 'True' -and $firewall.Direction -eq 'Inbound' -and $firewall.Action -eq 'Allow' -and
            $portFilter.Protocol -eq 'TCP' -and $portFilter.LocalPort -contains '80' -and $addressFilter.RemoteAddress -contains $lanSubnet
    }
    Add-AcceptanceCheck -Id 'firewall' -Name (Get-DeploymentMessage 'acceptFirewall') -Status $(if ($firewallPassed) { 'pass' } else { 'fail' }) -Detail $(if ($lanSubnet) { "TCP 80, subnet=$lanSubnet" } else { 'LAN_SUBNET is missing.' })

    $unsafeListeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object {
        $_.LocalPort -in 4000, 5432 -and $_.LocalAddress -notin '127.0.0.1', '::1'
    })
    $listenerDetail = if ($unsafeListeners.Count -eq 0) { 'Ports 4000 and 5432 are loopback-only or closed.' } else { ($unsafeListeners | ForEach-Object { "$($_.LocalAddress):$($_.LocalPort)" }) -join ', ' }
    Add-AcceptanceCheck -Id 'private-ports' -Name (Get-DeploymentMessage 'acceptPrivatePorts') -Status $(if ($unsafeListeners.Count -eq 0) { 'pass' } else { 'fail' }) -Detail $listenerDetail

    $cloudflaredArtifacts = [Collections.Generic.List[string]]::new()
    if (Get-Process -Name 'cloudflared' -ErrorAction SilentlyContinue) { $cloudflaredArtifacts.Add('process') }
    if (Get-Service -Name '*cloudflared*' -ErrorAction SilentlyContinue) { $cloudflaredArtifacts.Add('service') }
    $cloudflaredTask = Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object {
        $actionExecutables = @($_.Actions | ForEach-Object {
            if ($_.PSObject.Properties['Execute']) { [string]$_.Execute }
        }) -join ' '
        $_.TaskName -match 'cloudflared|cloudflare' -or $actionExecutables -match 'cloudflared'
    }
    if ($cloudflaredTask) { $cloudflaredArtifacts.Add('scheduled-task') }
    $startupTunnel = Join-Path ([Environment]::GetFolderPath('Startup')) 'run-tunnel-hidden.vbs'
    if (Test-Path -LiteralPath $startupTunnel) { $cloudflaredArtifacts.Add('startup') }
    Add-AcceptanceCheck -Id 'no-tunnel' -Name (Get-DeploymentMessage 'acceptNoTunnel') -Status $(if ($cloudflaredArtifacts.Count -eq 0) { 'pass' } else { 'fail' }) -Detail $(if ($cloudflaredArtifacts.Count -eq 0) { 'No cloudflared artifacts found.' } else { $cloudflaredArtifacts -join ', ' })

    $backupTask = Test-HourlyBackupTask
    Add-AcceptanceCheck -Id 'backup-task' -Name (Get-DeploymentMessage 'acceptBackupTask') -Status $(if ($backupTask.Passed) { 'pass' } else { 'fail' }) -Detail $backupTask.Detail
    $restoreTask = Test-ScheduledTaskSuccess -TaskName 'Workwear ERP Monthly Restore Test'
    Add-AcceptanceCheck -Id 'restore-task' -Name (Get-DeploymentMessage 'acceptRestoreTask') -Status $(if ($restoreTask.Passed) { 'pass' } else { 'fail' }) -Detail $restoreTask.Detail
    $backupEvidence = Test-BackupEvidence -EnvironmentValues $values
    Add-AcceptanceCheck -Id 'backup-evidence' -Name (Get-DeploymentMessage 'acceptBackupEvidence') -Status $(if ($backupEvidence.Passed) { 'pass' } else { 'fail' }) -Detail $backupEvidence.Detail
    $backupRuntimeStatus = Test-BackupRuntimeStatus -EnvironmentValues $values
    Add-AcceptanceCheck -Id 'backup-status' -Name (Get-DeploymentMessage 'acceptBackupStatus') -Status $(if (-not $backupRuntimeStatus.Passed) { 'fail' } elseif ($backupRuntimeStatus.Warning) { 'manual' } else { 'pass' }) -Detail $backupRuntimeStatus.Detail
    foreach ($target in @($backupRuntimeStatus.Targets)) {
        $targetStatus = if ($target.status -eq 'ok') { 'pass' } elseif ($target.status -eq 'warning') { 'manual' } else { 'fail' }
        $targetDetail = "last=$($target.lastSuccessfulAtUtc); size=$($target.sizeBytes); free=$($target.freePercent)%"
        Add-AcceptanceCheck -Id "backup-$($target.id)" -Name "Backup $($target.id)" -Status $targetStatus -Detail $targetDetail
    }

    Add-AcceptanceCheck -Id 'reboot' -Name (Get-DeploymentMessage 'acceptReboot') -Status 'manual' -Detail (Get-DeploymentMessage 'acceptManualDetail')
    Add-AcceptanceCheck -Id 'two-workstations' -Name (Get-DeploymentMessage 'acceptWorkstations') -Status 'manual' -Detail (Get-DeploymentMessage 'acceptManualDetail')
    Add-AcceptanceCheck -Id 'external-access' -Name (Get-DeploymentMessage 'acceptExternal') -Status 'manual' -Detail (Get-DeploymentMessage 'acceptManualDetail')

    New-Item -ItemType Directory -Force -Path $reportDirectory | Out-Null
    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $jsonPath = Join-Path $reportDirectory "acceptance-$timestamp.json"
    $markdownPath = Join-Path $reportDirectory "acceptance-$timestamp.md"
    $git = Get-Command 'git.exe' -ErrorAction SilentlyContinue
    $commit = if ($git) { [string](& $git.Source -C $script:RepositoryRoot rev-parse HEAD 2>$null) } else { 'unknown' }
    $failedCount = @($checks | Where-Object status -eq 'fail').Count
    $passedCount = @($checks | Where-Object status -eq 'pass').Count
    $manualCount = @($checks | Where-Object status -eq 'manual').Count
    $report = [ordered]@{
        generatedAt = (Get-Date).ToString('o')
        computer = $env:COMPUTERNAME
        commit = $commit.Trim()
        summary = [ordered]@{ passed = $passedCount; failed = $failedCount; manual = $manualCount }
        checks = $checks
    }
    $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $jsonPath -Encoding UTF8

    $markdown = [Collections.Generic.List[string]]::new()
    $markdown.Add("# $(Get-DeploymentMessage 'acceptanceTitle')")
    $markdown.Add('')
    $markdown.Add("- $(Get-DeploymentMessage 'acceptanceGenerated'): $($report.generatedAt)")
    $markdown.Add("- $(Get-DeploymentMessage 'acceptanceComputer'): $($report.computer)")
    $markdown.Add("- Commit: $($report.commit)")
    $markdown.Add('')
    $markdown.Add("| $(Get-DeploymentMessage 'acceptanceCheck') | $(Get-DeploymentMessage 'acceptanceStatus') | $(Get-DeploymentMessage 'acceptanceDetail') |")
    $markdown.Add('|---|---|---|')
    foreach ($check in $checks) {
        $safeDetail = ([string]$check.detail).Replace('|', '\|').Replace("`r", ' ').Replace("`n", ' ')
        $markdown.Add("| $($check.name) | $($check.status) | $safeDetail |")
    }
    $markdown | Set-Content -LiteralPath $markdownPath -Encoding UTF8

    Write-Host "$(Get-DeploymentMessage 'acceptanceReport') $markdownPath"
    Write-Host "JSON: $jsonPath"
    if ($failedCount -gt 0) {
        Write-DeploymentLog -LogPath $logPath -Message (Get-DeploymentMessage 'acceptanceFailed' @($failedCount)) -Level ERROR
        exit 1
    }
    Write-DeploymentLog -LogPath $logPath -Message (Get-DeploymentMessage 'acceptanceComplete' @($passedCount, $manualCount))
    exit 0
} catch {
    Write-OperationFailure -LogPath $logPath -ErrorRecord $_
    exit 1
}
