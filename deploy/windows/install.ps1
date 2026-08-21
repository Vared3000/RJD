[CmdletBinding()]
param(
    [string]$LanAddress,
    [string]$LanSubnet,
    [ValidatePattern('^[a-z][a-z0-9_]{0,62}$')][string]$DatabaseName = 'workwear_erp',
    [ValidatePattern('^[a-z][a-z0-9_]{0,62}$')][string]$DatabaseUser = 'workwear_app',
    [ValidatePattern('^[a-z][a-z0-9_]{0,62}$')][string]$BackupAdminUser = 'workwear_backup_admin',
    [string]$BackupSecondaryPath,
    [string[]]$BackupSecondaryPaths,
    [string]$BackupTaskUser,
    [string]$RecoveryClusterId,
    [string]$RecoveryNodeId,
    [string[]]$RecoveryWitnessPaths,
    [switch]$InstallDependencies,
    [switch]$SkipBackupSchedule,
    [ValidateRange(2, 100)][int]$MinimumFreeSpaceGb = 5
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
. (Join-Path $script:RepositoryRoot 'scripts\backup-common.ps1')
. (Join-Path $script:RepositoryRoot 'scripts\recovery-common.ps1')

Assert-WindowsHost
Ensure-Administrator -ScriptPath $PSCommandPath -BoundParameters $PSBoundParameters
$logPath = New-DeploymentLog -Operation 'install'

function Confirm-DependencyInstallation {
    param([Parameter(Mandatory = $true)][string]$Name)

    if ($InstallDependencies) {
        return $true
    }
    $answer = Read-Host "$Name. $(Get-DeploymentMessage 'dependencyPrompt')"
    return $answer -match '^(?i:y|yes)$'
}

function Install-WingetPackage {
    param(
        [Parameter(Mandatory = $true)][string]$PackageId,
        [switch]$Interactive
    )

    $winget = Get-Command 'winget.exe' -ErrorAction SilentlyContinue
    if (-not $winget) {
        throw "winget.exe is required to install $PackageId"
    }
    $arguments = @(
        'install',
        '--id',
        $PackageId,
        '--exact',
        '--source',
        'winget',
        '--accept-source-agreements',
        '--accept-package-agreements'
    )
    if ($Interactive) {
        $arguments += '--interactive'
    } else {
        $arguments += '--silent'
        $arguments += '--disable-interactivity'
    }
    Invoke-DeploymentCommand -FilePath $winget.Source -Arguments $arguments -LogPath $logPath
    Refresh-ProcessPath
}

function Ensure-NodeAndPnpm {
    $node = Get-Command 'node.exe' -ErrorAction SilentlyContinue
    $major = if ($node) { [int]((& $node.Source --version).TrimStart('v').Split('.')[0]) } else { 0 }
    if ($major -ne 24) {
        if (-not (Confirm-DependencyInstallation -Name "$(Get-DeploymentMessage 'nodeVersion') $major")) {
            throw "$(Get-DeploymentMessage 'nodeVersion') $major"
        }
        Install-WingetPackage -PackageId 'OpenJS.NodeJS.LTS'
        $node = Get-Command 'node.exe' -ErrorAction SilentlyContinue
        $major = if ($node) { [int]((& $node.Source --version).TrimStart('v').Split('.')[0]) } else { 0 }
        if ($major -ne 24) {
            throw "$(Get-DeploymentMessage 'nodeVersion') $major"
        }
    }

    $pnpm = Get-Command 'pnpm.cmd' -ErrorAction SilentlyContinue
    $pnpmMajor = if ($pnpm) { [int]((& $pnpm.Source --version).Split('.')[0]) } else { 0 }
    if ($pnpmMajor -ne 11) {
        Write-DeploymentLog -LogPath $logPath -Message (Get-DeploymentMessage 'pnpmVersion')
        $npm = Get-Command 'npm.cmd' -ErrorAction Stop
        Invoke-DeploymentCommand -FilePath $npm.Source -Arguments @('install', '--global', 'pnpm@11.9.0') -LogPath $logPath
        Refresh-ProcessPath
    }

    $git = Get-Command 'git.exe' -ErrorAction SilentlyContinue
    if (-not $git) {
        if (-not (Confirm-DependencyInstallation -Name (Get-DeploymentMessage 'gitMissing'))) {
            throw (Get-DeploymentMessage 'gitMissing')
        }
        Install-WingetPackage -PackageId 'Git.Git'
        $git = Get-Command 'git.exe' -ErrorAction SilentlyContinue
    }
    if (-not $git) {
        throw (Get-DeploymentMessage 'gitMissing')
    }

    return [PSCustomObject]@{
        Node = (Get-Command 'node.exe' -ErrorAction Stop).Source
        Pnpm = (Get-Command 'pnpm.cmd' -ErrorAction Stop).Source
        Git = $git.Source
    }
}

function Ensure-PostgreSql {
    $bin = Get-PostgresBinDirectory -RequiredMajor 18
    if (-not $bin) {
        if (-not (Confirm-DependencyInstallation -Name (Get-DeploymentMessage 'postgresMissing'))) {
            throw (Get-DeploymentMessage 'postgresMissing')
        }
        Install-WingetPackage -PackageId 'PostgreSQL.PostgreSQL.18' -Interactive
        $bin = Get-PostgresBinDirectory -RequiredMajor 18
    }
    if (-not $bin) {
        throw (Get-DeploymentMessage 'postgresMissing')
    }
    $service = Get-PostgresService -RequiredMajor 18
    if (-not $service) {
        throw (Get-DeploymentMessage 'postgresMissing')
    }
    if ($service.Status -ne 'Running') {
        Start-Service -Name $service.Name
        $service.WaitForStatus('Running', [TimeSpan]::FromSeconds(60))
    }
    return [PSCustomObject]@{ Bin = $bin; Service = $service }
}

function Assert-FreeSpace {
    $root = [IO.Path]::GetPathRoot($script:RepositoryRoot)
    $driveName = $root.TrimEnd('\').TrimEnd(':')
    $drive = Get-PSDrive -Name $driveName
    $freeGb = [math]::Round($drive.Free / 1GB, 1)
    if ($freeGb -lt $MinimumFreeSpaceGb) {
        throw (Get-DeploymentMessage 'diskSpace' @($MinimumFreeSpaceGb, $freeGb))
    }
}

function Assert-PortAvailable {
    param([int]$Port)

    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
    if ($listeners.Count -eq 0) {
        return
    }
    $installedService = Get-WorkwearService
    if ($installedService -and $installedService.Status -eq 'Running' -and (Wait-WorkwearHealth -TimeoutSeconds 5)) {
        return
    }
    throw (Get-DeploymentMessage 'portBusy' @($Port))
}

function Resolve-LanConfiguration {
    if (-not $LanAddress) {
        $candidate = Get-NetIPAddress -AddressFamily IPv4 -AddressState Preferred -ErrorAction SilentlyContinue |
            Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
            Sort-Object InterfaceMetric |
            Select-Object -First 1 -ExpandProperty IPAddress
        $LanAddress = Read-Host "$(Get-DeploymentMessage 'lanAddressPrompt') [$candidate]"
        if (-not $LanAddress) {
            $LanAddress = $candidate
        }
    }
    $parsedAddress = $null
    if (-not [Net.IPAddress]::TryParse($LanAddress, [ref]$parsedAddress) -or $parsedAddress.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork) {
        throw (Get-DeploymentMessage 'invalidLan')
    }
    if (-not $LanSubnet) {
        $octets = $LanAddress.Split('.')
        $suggestedSubnet = "$($octets[0]).$($octets[1]).$($octets[2]).0/24"
        $LanSubnet = Read-Host "$(Get-DeploymentMessage 'lanSubnetPrompt') [$suggestedSubnet]"
        if (-not $LanSubnet) {
            $LanSubnet = $suggestedSubnet
        }
    }
    if ($LanSubnet -notmatch '^(?:\d{1,3}\.){3}\d{1,3}/(?:[1-9]|[12]\d|3[0-2])$') {
        throw (Get-DeploymentMessage 'invalidLan')
    }
    return [PSCustomObject]@{ Address = $LanAddress; Subnet = $LanSubnet }
}

function Read-RequiredSecret {
    param(
        [Parameter(Mandatory = $true)][string]$PromptKey,
        [int]$MinimumLength
    )

    $secure = Read-Host (Get-DeploymentMessage $PromptKey) -AsSecureString
    $plain = ConvertFrom-DeploymentSecureString -Value $secure
    if ($plain.Length -lt $MinimumLength) {
        throw "$(Get-DeploymentMessage 'secretTooShort') $MinimumLength"
    }
    return $plain
}

function Escape-ConnectionPart {
    param([string]$Value)
    return [Uri]::EscapeDataString($Value)
}

function Write-ApplicationEnvironment {
    param(
        [Parameter(Mandatory = $true)]$Values
    )

    $path = Join-Path $script:RepositoryRoot '.env'
    $lines = @(
        '# Generated by deploy/windows/install.ps1. Do not send this file to third parties.',
        'NODE_ENV=production',
        'HOST=0.0.0.0',
        'PORT=80',
        "CLIENT_ORIGIN=http://$($Values.LanAddress)",
        "LAN_BIND_ADDRESS=$($Values.LanAddress)",
        "LAN_SUBNET=$($Values.LanSubnet)",
        "DATABASE_URL=postgres://$(Escape-ConnectionPart $DatabaseUser):$(Escape-ConnectionPart $Values.DatabasePassword)@127.0.0.1:5432/$(Escape-ConnectionPart $DatabaseName)",
        "JWT_ACCESS_SECRET=$($Values.AccessSecret)",
        "JWT_REFRESH_SECRET=$($Values.RefreshSecret)",
        'JWT_ACCESS_TTL=15m',
        'JWT_REFRESH_TTL=30d',
        "BOOTSTRAP_ADMIN_LOGIN=$($Values.AdminLogin)",
        "BOOTSTRAP_ADMIN_PASSWORD=$($Values.AdminPassword)",
        "POSTGRES_DB=$DatabaseName",
        "POSTGRES_USER=$DatabaseUser",
        "POSTGRES_PASSWORD=$($Values.DatabasePassword)",
        'VITE_API_URL=/api/v1',
        "BACKUP_ROOT=$(Join-Path $script:RepositoryRoot 'backups')",
        "BACKUP_SECONDARY_PATHS=$($Values.ModernBackupSecondaryPaths -join ';')",
        "BACKUP_SECONDARY_PATH=$($Values.LegacyBackupSecondaryPath)",
        "BACKUP_TASK_USER=$($Values.BackupTaskUser)",
        "BACKUP_ADMIN_DATABASE_URL=postgres://$(Escape-ConnectionPart $BackupAdminUser):$(Escape-ConnectionPart $Values.BackupAdminPassword)@127.0.0.1:5432/postgres",
        "WORKWEAR_CLUSTER_ID=$($Values.RecoveryClusterId)",
        "WORKWEAR_NODE_ID=$($Values.RecoveryNodeId)",
        "RECOVERY_PRIMARY_HOST=$($Values.LanAddress)",
        "RECOVERY_WITNESS_PATHS=$($Values.RecoveryWitnessPaths -join ';')",
        "RECOVERY_STATE_ROOT=$(Join-Path $env:ProgramData 'WorkwearERP\recovery')",
        "RECOVERY_SENTINEL_PATH=$(Join-Path $env:ProgramData 'WorkwearERP\recovery\cluster-mode.json')"
    )
    Write-DeploymentLinesAtomic -Path $path -Lines $lines
    Protect-DeploymentPath -Path $path -Mode SecretFile -AdditionalIdentity $Values.BackupTaskUser
}

function Assert-BackupDestinationAcl {
    param([Parameter(Mandatory = $true)][string]$Path)

    $unsafeSids = @('S-1-1-0', 'S-1-5-11', 'S-1-5-32-545')
    $unsafeRules = @((Get-Acl -LiteralPath $Path).Access | Where-Object {
        if ($_.AccessControlType -ne 'Allow' -or [string]$_.FileSystemRights -notmatch 'Write|Modify|FullControl|CreateFiles') {
            return $false
        }
        try {
            $sid = $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
            return $sid -in $unsafeSids
        } catch {
            return $false
        }
    })
    if ($unsafeRules.Count -gt 0) {
        throw "$(Get-DeploymentMessage 'backupPathAclUnsafe') $Path"
    }
}

function Protect-LocalBackupRoot {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$TaskUser
    )

    New-Item -ItemType Directory -Force -Path $Path | Out-Null
    Protect-DeploymentPath -Path $Path -Mode BackupDirectory -AdditionalIdentity $TaskUser
}

function Assert-BackupDestination {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not $Path.StartsWith('\\')) {
        throw "$(Get-DeploymentMessage 'backupPathNotUnc') $Path"
    }
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        throw "$(Get-DeploymentMessage 'backupPathMissing') $Path"
    }
    Assert-BackupDestinationAcl -Path $Path
    $probe = Join-Path $Path ".workwear-write-test-$([Guid]::NewGuid().ToString('N')).tmp"
    try {
        $expected = [Guid]::NewGuid().ToString('N')
        [IO.File]::WriteAllText($probe, $expected, [Text.UTF8Encoding]::new($false))
        $actual = [IO.File]::ReadAllText($probe, [Text.Encoding]::UTF8)
        if ($actual -ne $expected) {
            throw "$(Get-DeploymentMessage 'backupPathProbeFailed') $Path"
        }
    } finally {
        if (Test-Path -LiteralPath $probe) {
            Remove-Item -LiteralPath $probe -Force
        }
    }
}

function Invoke-PsqlInput {
    param(
        [Parameter(Mandatory = $true)][string]$Psql,
        [Parameter(Mandatory = $true)][string]$AdminUser,
        [Parameter(Mandatory = $true)][string]$AdminPassword,
        [Parameter(Mandatory = $true)][string]$Sql
    )

    $hadPassword = Test-Path Env:PGPASSWORD
    $previousPassword = $env:PGPASSWORD
    try {
        $env:PGPASSWORD = $AdminPassword
        $result = $Sql | & $Psql '--host=127.0.0.1' '--port=5432' "--username=$AdminUser" '--dbname=postgres' '--set=ON_ERROR_STOP=1' '--no-psqlrc' '--file=-' 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "psql failed: $($result -join [Environment]::NewLine)"
        }
        $result | Add-Content -LiteralPath $logPath -Encoding UTF8
    } finally {
        if ($hadPassword) {
            $env:PGPASSWORD = $previousPassword
        } else {
            Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
        }
    }
}

function Initialize-ApplicationDatabase {
    param(
        [Parameter(Mandatory = $true)][string]$PostgresBin,
        [Parameter(Mandatory = $true)][string]$AdminUser,
        [Parameter(Mandatory = $true)][string]$AdminPassword,
        [Parameter(Mandatory = $true)][string]$DatabasePassword,
        [Parameter(Mandatory = $true)][string]$BackupAdminPassword
    )

    $psql = Join-Path $PostgresBin 'psql.exe'
    $createdb = Join-Path $PostgresBin 'createdb.exe'
    $databasePasswordSql = $DatabasePassword.Replace("'", "''")
    $backupPasswordSql = $BackupAdminPassword.Replace("'", "''")
    $roleSql = @"
DO `$workwear`$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$DatabaseUser') THEN
    CREATE ROLE "$DatabaseUser" LOGIN PASSWORD '$databasePasswordSql';
  ELSE
    ALTER ROLE "$DatabaseUser" LOGIN PASSWORD '$databasePasswordSql';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$BackupAdminUser') THEN
    CREATE ROLE "$BackupAdminUser" LOGIN CREATEDB PASSWORD '$backupPasswordSql';
  ELSE
    ALTER ROLE "$BackupAdminUser" LOGIN CREATEDB PASSWORD '$backupPasswordSql';
  END IF;
END
`$workwear`$;
GRANT "$DatabaseUser" TO "$BackupAdminUser";
"@
    Invoke-PsqlInput -Psql $psql -AdminUser $AdminUser -AdminPassword $AdminPassword -Sql $roleSql

    $hadPassword = Test-Path Env:PGPASSWORD
    $previousPassword = $env:PGPASSWORD
    try {
        $env:PGPASSWORD = $AdminPassword
        $exists = & $psql '--host=127.0.0.1' '--port=5432' "--username=$AdminUser" '--dbname=postgres' '--tuples-only' '--no-align' '--quiet' "--command=select 1 from pg_database where datname = '$DatabaseName';"
        if ($LASTEXITCODE -ne 0) {
            throw 'Unable to query PostgreSQL database list'
        }
        if (-not (($exists -join '').Trim())) {
            & $createdb '--host=127.0.0.1' '--port=5432' "--username=$AdminUser" '--maintenance-db=postgres' "--owner=$DatabaseUser" $DatabaseName
            if ($LASTEXITCODE -ne 0) {
                throw 'Unable to create application database'
            }
        } else {
            Invoke-PsqlInput -Psql $psql -AdminUser $AdminUser -AdminPassword $AdminPassword -Sql "ALTER DATABASE `"$DatabaseName`" OWNER TO `"$DatabaseUser`";"
        }
    } finally {
        if ($hadPassword) {
            $env:PGPASSWORD = $previousPassword
        } else {
            Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
        }
    }
}

function Install-WorkwearService {
    param(
        [Parameter(Mandatory = $true)][string]$NodePath,
        [Parameter(Mandatory = $true)][string]$PostgresServiceName
    )

    $runtimeDirectory = Join-Path $PSScriptRoot 'runtime'
    New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null
    $serviceExe = Join-Path $runtimeDirectory 'WorkwearERPService.exe'
    $serviceXml = Join-Path $runtimeDirectory 'WorkwearERPService.xml'
    $winSwUrl = 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW.NET4.exe'
    $winSwSha256 = '923111C7142B3DC783A3C722B19B8A21BCB78222D7A136AC33F0CA8A29F4CB66'
    if (-not (Test-Path -LiteralPath $serviceExe) -or (Get-FileHash -Algorithm SHA256 -LiteralPath $serviceExe).Hash -ne $winSwSha256) {
        $download = "$serviceExe.download"
        Invoke-WebRequest -UseBasicParsing -Uri $winSwUrl -OutFile $download
        if ((Get-FileHash -Algorithm SHA256 -LiteralPath $download).Hash -ne $winSwSha256) {
            Remove-Item -LiteralPath $download -Force
            throw 'WinSW SHA256 verification failed'
        }
        Move-Item -LiteralPath $download -Destination $serviceExe -Force
    }

    $escape = { param($Value) [Security.SecurityElement]::Escape([string]$Value) }
    $serverDirectory = Join-Path $script:RepositoryRoot 'server'
    $serviceLogDirectory = Join-Path $script:RepositoryRoot 'logs\service'
    New-Item -ItemType Directory -Force -Path $serviceLogDirectory | Out-Null
    $xml = @"
<service>
  <id>$script:WorkwearServiceName</id>
  <name>Workwear ERP</name>
  <description>Local workwear accounting system</description>
  <executable>$(& $escape $NodePath)</executable>
  <arguments>--env-file-if-exists=../.env src/server.js</arguments>
  <workingdirectory>$(& $escape $serverDirectory)</workingdirectory>
  <startmode>Automatic</startmode>
  <delayedAutoStart>true</delayedAutoStart>
  <depend>$(& $escape $PostgresServiceName)</depend>
  <stoptimeout>30 sec</stoptimeout>
  <onfailure action="restart" delay="5 sec" />
  <onfailure action="restart" delay="15 sec" />
  <resetfailure>1 hour</resetfailure>
  <logpath>$(& $escape $serviceLogDirectory)</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>14</keepFiles>
  </log>
</service>
"@
    [IO.File]::WriteAllText($serviceXml, $xml, [Text.UTF8Encoding]::new($false))

    $installed = Get-WorkwearService
    if ($installed) {
        if ($installed.Status -ne 'Stopped') {
            Invoke-DeploymentCommand -FilePath $serviceExe -Arguments @('stop') -LogPath $logPath
        }
        Invoke-DeploymentCommand -FilePath $serviceExe -Arguments @('refresh') -LogPath $logPath
    } else {
        Invoke-DeploymentCommand -FilePath $serviceExe -Arguments @('install') -LogPath $logPath
    }
    Invoke-DeploymentCommand -FilePath $serviceExe -Arguments @('start') -LogPath $logPath
}

function New-ManagementShortcuts {
    $desktop = [Environment]::GetFolderPath('CommonDesktopDirectory')
    $shell = New-Object -ComObject WScript.Shell
    foreach ($definition in @(
        @{ Name = Get-DeploymentMessage 'appShortcutName'; File = Get-DeploymentMessage 'appShortcutFile' },
        @{ Name = Get-DeploymentMessage 'statusShortcutName'; File = Get-DeploymentMessage 'statusShortcutFile' }
    )) {
        $shortcut = $shell.CreateShortcut((Join-Path $desktop "$($definition.Name).lnk"))
        $shortcut.TargetPath = Join-Path $script:RepositoryRoot $definition.File
        $shortcut.WorkingDirectory = $script:RepositoryRoot
        $shortcut.Save()
    }
    Write-DeploymentLog -LogPath $logPath -Message (Get-DeploymentMessage 'shortcutCreated')
}

$serviceWasRunning = $false
$recoveryFailClosed = $false
try {
    Write-DeploymentLog -LogPath $logPath -Message (Get-DeploymentMessage 'installStarted')
    Assert-FreeSpace
    $lan = Resolve-LanConfiguration
    Assert-PortAvailable -Port 80
    $tools = Ensure-NodeAndPnpm
    $postgres = Ensure-PostgreSql

    $existing = Read-DeploymentEnv
    $dbAdminUser = Read-Host "$(Get-DeploymentMessage 'dbAdminPrompt') [postgres]"
    if (-not $dbAdminUser) { $dbAdminUser = 'postgres' }
    $dbAdminPassword = ConvertFrom-DeploymentSecureString -Value (Read-Host (Get-DeploymentMessage 'dbAdminPasswordPrompt') -AsSecureString)
    $databasePassword = if ($existing['POSTGRES_PASSWORD'] -and $existing['POSTGRES_PASSWORD'] -notmatch '^replace-') { $existing['POSTGRES_PASSWORD'] } else { Read-RequiredSecret -PromptKey 'dbPasswordPrompt' -MinimumLength 16 }
    $adminLogin = if ($existing['BOOTSTRAP_ADMIN_LOGIN']) { $existing['BOOTSTRAP_ADMIN_LOGIN'] } else { Read-Host "$(Get-DeploymentMessage 'appAdminPrompt') [admin]" }
    if (-not $adminLogin) { $adminLogin = 'admin' }
    $adminPassword = if ($existing['BOOTSTRAP_ADMIN_PASSWORD'] -and $existing['BOOTSTRAP_ADMIN_PASSWORD'] -notmatch '^replace-') { $existing['BOOTSTRAP_ADMIN_PASSWORD'] } else { Read-RequiredSecret -PromptKey 'appAdminPasswordPrompt' -MinimumLength 12 }
    $accessSecret = if ($existing['JWT_ACCESS_SECRET'] -and $existing['JWT_ACCESS_SECRET'] -notmatch '^replace-') { $existing['JWT_ACCESS_SECRET'] } else { New-DeploymentSecret }
    $refreshSecret = if ($existing['JWT_REFRESH_SECRET'] -and $existing['JWT_REFRESH_SECRET'] -notmatch '^replace-') { $existing['JWT_REFRESH_SECRET'] } else { New-DeploymentSecret }
    $backupAdminPassword = New-DeploymentSecret -Bytes 36

    if (-not $RecoveryClusterId) { $RecoveryClusterId = $existing['WORKWEAR_CLUSTER_ID'] }
    if (-not $RecoveryNodeId) { $RecoveryNodeId = $existing['WORKWEAR_NODE_ID'] }
    if (-not $RecoveryWitnessPaths -or @($RecoveryWitnessPaths).Count -eq 0) {
        $RecoveryWitnessPaths = @(([string]$existing['RECOVERY_WITNESS_PATHS']) -split ';' | Where-Object { $_ })
    }
    if (-not $BackupTaskUser) {
        $BackupTaskUser = if ($existing['BACKUP_TASK_USER']) { $existing['BACKUP_TASK_USER'] } else { 'SYSTEM' }
    }
    $RecoveryClusterId = ([string]$RecoveryClusterId).Trim().ToLowerInvariant()
    $RecoveryNodeId = ([string]$RecoveryNodeId).Trim().ToLowerInvariant()
    $RecoveryWitnessPaths = @($RecoveryWitnessPaths | ForEach-Object { $_.Trim() } | Where-Object { $_ } | Select-Object -Unique)
    $hasRecoveryConfiguration = [bool]($RecoveryClusterId -or $RecoveryNodeId -or @($RecoveryWitnessPaths).Count -gt 0)
    if ($hasRecoveryConfiguration -and (-not $RecoveryClusterId -or -not $RecoveryNodeId -or @($RecoveryWitnessPaths).Count -ne 2)) {
        throw 'Recovery fencing requires cluster id, node id, and exactly two witness paths.'
    }
    if ($hasRecoveryConfiguration) {
        if ($RecoveryNodeId -notmatch '^[a-z0-9][a-z0-9-]{1,31}$') { throw 'Invalid recovery node id.' }
        if ($RecoveryClusterId -notmatch '^[a-z0-9][a-z0-9-]{3,63}$') { throw 'Invalid recovery cluster id.' }
        $recoveryWitnessHosts = @($RecoveryWitnessPaths | ForEach-Object {
            if (-not $_.StartsWith('\\')) { throw 'Recovery witness paths must be UNC paths.' }
            $_.TrimStart('\').Split('\')[0].ToLowerInvariant()
        } | Select-Object -Unique)
        if ($recoveryWitnessHosts.Count -ne 2) { throw 'Recovery witnesses must be stored on two different PCs.' }
        $installationRelease = Get-ApplicationReleaseMetadata -ProjectRoot $script:RepositoryRoot
        if ($installationRelease.isDirty -or -not $installationRelease.commit -or -not $installationRelease.tree) {
            throw 'Recovery fencing can only be installed from a clean immutable Git release.'
        }
        $recoveryFailClosed = $true
    }

    $resolvedBackupSecondaryPaths = @(Resolve-BackupSecondaryPaths -EnvironmentValues $existing -SecondaryPaths $BackupSecondaryPaths -LegacySecondaryPath $BackupSecondaryPath)
    $writeModernBackupPaths = (-not $SkipBackupSchedule) -or @($BackupSecondaryPaths).Count -gt 0 -or [bool]$existing['BACKUP_SECONDARY_PATHS']
    if (-not $SkipBackupSchedule -and $resolvedBackupSecondaryPaths.Count -lt 2) {
        $enteredBackupPaths = Read-Host (Get-DeploymentMessage 'backupPathPrompt')
        $resolvedBackupSecondaryPaths = @(Resolve-BackupSecondaryPaths -SecondaryPaths @($enteredBackupPaths))
    }
    if (-not $SkipBackupSchedule -and $resolvedBackupSecondaryPaths.Count -ne 2) {
        throw "$(Get-DeploymentMessage 'backupPathCount') $($resolvedBackupSecondaryPaths.Count)"
    }
    if (-not $SkipBackupSchedule) {
        foreach ($backupPath in $resolvedBackupSecondaryPaths) {
            Assert-BackupDestination -Path $backupPath
        }
        $backupHosts = @($resolvedBackupSecondaryPaths | ForEach-Object { $_.TrimStart('\').Split('\')[0].ToLowerInvariant() } | Select-Object -Unique)
        if ($backupHosts.Count -ne 2) {
            throw (Get-DeploymentMessage 'backupPathHosts')
        }
        if (-not $BackupTaskUser) { $BackupTaskUser = Read-Host (Get-DeploymentMessage 'backupTaskUserPrompt') }
        if (-not $BackupTaskUser) { $BackupTaskUser = 'SYSTEM' }
    }

    Initialize-ApplicationDatabase -PostgresBin $postgres.Bin -AdminUser $dbAdminUser -AdminPassword $dbAdminPassword -DatabasePassword $databasePassword -BackupAdminPassword $backupAdminPassword
    $legacyBackupSecondaryPath = if ($resolvedBackupSecondaryPaths.Count -gt 0) { $resolvedBackupSecondaryPaths[0] } else { '' }
    $modernBackupSecondaryPaths = if ($writeModernBackupPaths) { $resolvedBackupSecondaryPaths } else { @() }

    # Fail closed before changing any cluster identity. An already running standalone
    # process must not remain writable while the recovery sentinel/environment changes.
    $existingService = Get-WorkwearService
    if ($existingService -and $existingService.Status -ne 'Stopped') {
        Stop-Service -Name $script:WorkwearServiceName
        $existingService.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(60))
        $serviceWasRunning = $true
    }
    if ($existingService -and $hasRecoveryConfiguration) {
        Set-Service -Name $script:WorkwearServiceName -StartupType Disabled
        $existingService = Get-Service -Name $script:WorkwearServiceName
        if ($existingService.Status -ne 'Stopped' -or $existingService.StartType -ne 'Disabled') {
            throw 'Unable to stop and disable the existing service before enabling recovery fencing.'
        }
    }
    if ($hasRecoveryConfiguration) {
        foreach ($taskName in @('Workwear ERP Hourly Backup', 'Workwear ERP Monthly Restore Test', 'Workwear ERP Daily Backup')) {
            $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
            if (-not $existingTask) { continue }
            if ($existingTask.State -in @('Running', 'Queued')) {
                Stop-ScheduledTask -TaskName $taskName -ErrorAction Stop
            }
            Disable-ScheduledTask -TaskName $taskName | Out-Null
            if ((Get-ScheduledTask -TaskName $taskName).State -ne 'Disabled') {
                throw "Unable to disable scheduled task before enabling recovery fencing: $taskName"
            }
        }
        $recoveryStateRoot = Join-Path $env:ProgramData 'WorkwearERP\recovery'
        Write-RecoveryClusterSentinel -StateRoot $recoveryStateRoot -ClusterId $RecoveryClusterId `
            -NodeId $RecoveryNodeId -WitnessPaths $RecoveryWitnessPaths -ReaderIdentity $BackupTaskUser | Out-Null
    }

    Write-ApplicationEnvironment -Values ([PSCustomObject]@{
        LanAddress = $lan.Address
        LanSubnet = $lan.Subnet
        DatabasePassword = $databasePassword
        BackupAdminPassword = $backupAdminPassword
        AdminLogin = $adminLogin
        AdminPassword = $adminPassword
        AccessSecret = $accessSecret
        RefreshSecret = $refreshSecret
        ModernBackupSecondaryPaths = $modernBackupSecondaryPaths
        LegacyBackupSecondaryPath = $legacyBackupSecondaryPath
        BackupTaskUser = $BackupTaskUser
        RecoveryClusterId = $RecoveryClusterId
        RecoveryNodeId = $RecoveryNodeId
        RecoveryWitnessPaths = @($RecoveryWitnessPaths)
    })
    if (-not $SkipBackupSchedule) {
        Protect-LocalBackupRoot -Path (Join-Path $script:RepositoryRoot 'backups') -TaskUser $BackupTaskUser
    }
    if ($hasRecoveryConfiguration) {
        $recoveryWitnessNodeIds = @($RecoveryWitnessPaths | ForEach-Object { $_.TrimStart('\').Split('\')[0].ToLowerInvariant() })
        $existingRecoveryWitnesses = @($RecoveryWitnessPaths | ForEach-Object { Read-PromotionWitness -Path $_ })
        if (@($existingRecoveryWitnesses | Where-Object { $_ }).Count -eq 0) {
            Commit-PromotionWitness -WitnessPaths $RecoveryWitnessPaths -WitnessNodeIds $recoveryWitnessNodeIds `
                -ClusterId $RecoveryClusterId -Epoch 1 -ActiveNodeId $RecoveryNodeId | Out-Null
        } else {
            try {
                $existingQuorum = Get-PromotionQuorum -WitnessPaths $RecoveryWitnessPaths `
                    -ExpectedClusterId $RecoveryClusterId -ExpectedWitnessNodeIds $recoveryWitnessNodeIds
            } catch {
                throw 'Existing recovery witnesses do not form the configured quorum; installer will not overwrite them.'
            }
            if ($existingQuorum.activeNodeId -ne $RecoveryNodeId) {
                throw 'Existing recovery witnesses do not authorize this node; installer will not overwrite them.'
            }
        }
        $writtenEnvironment = Read-DeploymentEnv
        Get-RecoveryClusterSentinel -EnvironmentValues $writtenEnvironment -DefaultStateRoot $recoveryStateRoot | Out-Null
    }
    Invoke-DeploymentCommand -FilePath $tools.Pnpm -Arguments @('install', '--frozen-lockfile') -LogPath $logPath
    Invoke-DeploymentCommand -FilePath $tools.Pnpm -Arguments @('--filter', '@workwear/client', 'build') -LogPath $logPath
    if ($hasRecoveryConfiguration) {
        $builtRelease = Get-ApplicationReleaseMetadata -ProjectRoot $script:RepositoryRoot
        if ($builtRelease.isDirty -or -not $builtRelease.clientBuildSha256) {
            throw 'Recovery fencing requires a clean, verifiable production client build.'
        }
    }
    Invoke-DeploymentCommand -FilePath $tools.Pnpm -Arguments @('db:migrate') -LogPath $logPath
    Invoke-DeploymentCommand -FilePath $tools.Pnpm -Arguments @('db:seed') -LogPath $logPath

    Install-WorkwearService -NodePath $tools.Node -PostgresServiceName $postgres.Service.Name
    & (Join-Path $script:RepositoryRoot 'deploy\configure-lan-firewall.ps1') -LanSubnet $lan.Subnet -Port 80
    if (-not $SkipBackupSchedule) {
        & (Join-Path $script:RepositoryRoot 'scripts\install-backup-tasks.ps1') -TaskUser $BackupTaskUser -RequiredSecondaryCount 2 -RunBackupNow
    }
    New-ManagementShortcuts
    Write-DeploymentLog -LogPath $logPath -Message (Get-DeploymentMessage 'healthWaiting')
    if (-not (Wait-WorkwearHealth -TimeoutSeconds 90)) {
        throw (Get-DeploymentMessage 'healthFailed')
    }
    Write-DeploymentLog -LogPath $logPath -Message "$(Get-DeploymentMessage 'installComplete') http://$($lan.Address)"
    Write-Host "$(Get-DeploymentMessage 'logLocation') $logPath"
    exit 0
} catch {
    $installError = $_
    if ($recoveryFailClosed) {
        try {
            $failedService = Get-WorkwearService
            if ($failedService -and $failedService.Status -ne 'Stopped') {
                Stop-Service -Name $script:WorkwearServiceName -Force
                $failedService.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(60))
            }
            if ($failedService) { Set-Service -Name $script:WorkwearServiceName -StartupType Disabled }
            foreach ($taskName in @('Workwear ERP Hourly Backup', 'Workwear ERP Monthly Restore Test', 'Workwear ERP Daily Backup')) {
                if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
                    Disable-ScheduledTask -TaskName $taskName | Out-Null
                }
            }
        } catch { }
    }
    if ($serviceWasRunning -and -not $recoveryFailClosed) {
        try { Start-Service -Name $script:WorkwearServiceName } catch { }
    }
    Write-OperationFailure -LogPath $logPath -ErrorRecord $installError
    exit 1
}
