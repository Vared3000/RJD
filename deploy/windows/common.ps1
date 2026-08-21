Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:WindowsDeployDirectory = $PSScriptRoot
$script:RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$script:DeploymentLogDirectory = Join-Path $script:RepositoryRoot 'logs\windows'
$script:WorkwearServiceName = 'WorkwearERP'
$script:Messages = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'messages.ru.json') -Raw -Encoding UTF8 | ConvertFrom-Json

function Get-DeploymentMessage {
    param(
        [Parameter(Mandatory = $true)][string]$Key,
        [object[]]$Values = @()
    )

    $property = $script:Messages.PSObject.Properties[$Key]
    if (-not $property) {
        return $Key
    }
    $message = [string]$property.Value
    if ($Values.Count -gt 0) {
        return $message -f $Values
    }
    return $message
}

function New-DeploymentLog {
    param([Parameter(Mandatory = $true)][string]$Operation)

    New-Item -ItemType Directory -Force -Path $script:DeploymentLogDirectory | Out-Null
    $safeOperation = $Operation -replace '[^a-zA-Z0-9_-]', '-'
    return Join-Path $script:DeploymentLogDirectory "$safeOperation-$((Get-Date).ToString('yyyyMMdd-HHmmss')).log"
}

function Write-DeploymentLog {
    param(
        [Parameter(Mandatory = $true)][string]$LogPath,
        [Parameter(Mandatory = $true)][string]$Message,
        [ValidateSet('INFO', 'WARN', 'ERROR')][string]$Level = 'INFO'
    )

    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$Level] $Message"
    Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
    if ($Level -eq 'WARN') {
        Write-Warning $Message
    } elseif ($Level -eq 'ERROR') {
        Write-Host $Message -ForegroundColor Red
    } else {
        Write-Host $Message
    }
}

function Assert-WindowsHost {
    if ($env:OS -ne 'Windows_NT') {
        throw (Get-DeploymentMessage 'windowsOnly')
    }
}

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Ensure-Administrator {
    param(
        [Parameter(Mandatory = $true)][string]$ScriptPath,
        [Collections.IDictionary]$BoundParameters
    )

    if (Test-IsAdministrator) {
        return
    }
    Write-Host (Get-DeploymentMessage 'adminPrompt') -ForegroundColor Yellow
    $quoteLiteral = {
        param([string]$Value)
        return "'$($Value.Replace("'", "''"))'"
    }
    $invocation = "& $(& $quoteLiteral $ScriptPath)"
    if ($BoundParameters) {
        foreach ($entry in $BoundParameters.GetEnumerator()) {
            if ($entry.Value -is [Management.Automation.SwitchParameter]) {
                if ($entry.Value.IsPresent) { $invocation += " -$($entry.Key)" }
                continue
            }
            if ($entry.Value -is [Array]) {
                $quotedValues = @($entry.Value | ForEach-Object { & $quoteLiteral ([string]$_) })
                $invocation += " -$($entry.Key) @($($quotedValues -join ','))"
                continue
            }
            $invocation += " -$($entry.Key) $(& $quoteLiteral ([string]$entry.Value))"
        }
    }
    $invocation += '; exit $LASTEXITCODE'
    $encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($invocation))
    $argumentList = @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encodedCommand)
    $process = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argumentList -Wait -PassThru
    exit $process.ExitCode
}

function Resolve-DeploymentIdentitySid {
    param([Parameter(Mandatory = $true)][string]$Identity)

    if ($Identity -match '^S-1-') {
        return [Security.Principal.SecurityIdentifier]::new($Identity)
    }
    return ([Security.Principal.NTAccount]::new($Identity)).Translate([Security.Principal.SecurityIdentifier])
}

function Protect-DeploymentPath {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][ValidateSet('StateDirectory', 'StateFile', 'SecretFile', 'BackupDirectory')][string]$Mode,
        [string]$AdditionalIdentity
    )

    if (-not (Test-IsAdministrator)) {
        throw 'Protecting deployment ACLs requires a local administrator token.'
    }

    $isDirectory = $Mode -in @('StateDirectory', 'BackupDirectory')
    if ($isDirectory -and -not (Test-Path -LiteralPath $Path -PathType Container)) {
        throw "Protected directory does not exist: $Path"
    }
    if (-not $isDirectory -and -not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Protected file does not exist: $Path"
    }

    $security = if ($isDirectory) {
        New-Object Security.AccessControl.DirectorySecurity
    } else {
        New-Object Security.AccessControl.FileSecurity
    }
    $administratorsSid = Resolve-DeploymentIdentitySid -Identity 'S-1-5-32-544'
    $systemSid = Resolve-DeploymentIdentitySid -Identity 'S-1-5-18'
    $ownerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $security.SetOwner($ownerSid)
    $security.SetAccessRuleProtection($true, $false)
    $inheritance = if ($isDirectory) {
        [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
    } else {
        [Security.AccessControl.InheritanceFlags]::None
    }
    $propagation = [Security.AccessControl.PropagationFlags]::None
    foreach ($sid in @($systemSid, $administratorsSid)) {
        $rule = New-Object Security.AccessControl.FileSystemAccessRule(
            $sid,
            [Security.AccessControl.FileSystemRights]::FullControl,
            $inheritance,
            $propagation,
            [Security.AccessControl.AccessControlType]::Allow
        )
        [void]$security.AddAccessRule($rule)
    }
    if ($AdditionalIdentity -and $AdditionalIdentity -ne 'SYSTEM' -and $AdditionalIdentity -ne 'NT AUTHORITY\SYSTEM') {
        $additionalSid = Resolve-DeploymentIdentitySid -Identity $AdditionalIdentity
        $additionalRights = switch ($Mode) {
            'BackupDirectory' { [Security.AccessControl.FileSystemRights]::Modify }
            'StateDirectory' { [Security.AccessControl.FileSystemRights]'ReadAndExecute, Synchronize' }
            default { [Security.AccessControl.FileSystemRights]'Read, Synchronize' }
        }
        $additionalRule = New-Object Security.AccessControl.FileSystemAccessRule(
            $additionalSid,
            $additionalRights,
            $inheritance,
            $propagation,
            [Security.AccessControl.AccessControlType]::Allow
        )
        [void]$security.AddAccessRule($additionalRule)
    }

    $sections = [Security.AccessControl.AccessControlSections]'Owner, Access'
    $expectedSddl = $security.GetSecurityDescriptorSddlForm($sections)
    Set-Acl -LiteralPath $Path -AclObject $security
    $actualAcl = Get-Acl -LiteralPath $Path
    $actualSddl = $actualAcl.GetSecurityDescriptorSddlForm($sections)
    if ($actualSddl -ne $expectedSddl) {
        throw "Protected ACL read-back failed: $Path"
    }
}

function Assert-RecoveryWitnessAcl {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string[]]$AllowedSids
    )

    $acl = Get-Acl -LiteralPath $Path
    try {
        $ownerSid = ([Security.Principal.NTAccount]$acl.Owner).Translate([Security.Principal.SecurityIdentifier]).Value
    } catch {
        try { $ownerSid = ([Security.Principal.SecurityIdentifier]$acl.Owner).Value } catch { $ownerSid = $null }
    }
    if (-not $ownerSid -or $ownerSid -notin $AllowedSids) {
        throw "Witness owner is outside the trusted SID allowlist: $Path"
    }
    $mutatingMask = (
        [Security.AccessControl.FileSystemRights]::WriteData -bor
        [Security.AccessControl.FileSystemRights]::AppendData -bor
        [Security.AccessControl.FileSystemRights]::CreateFiles -bor
        [Security.AccessControl.FileSystemRights]::CreateDirectories -bor
        [Security.AccessControl.FileSystemRights]::WriteExtendedAttributes -bor
        [Security.AccessControl.FileSystemRights]::WriteAttributes -bor
        [Security.AccessControl.FileSystemRights]::Delete -bor
        [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor
        [Security.AccessControl.FileSystemRights]::ChangePermissions -bor
        [Security.AccessControl.FileSystemRights]::TakeOwnership
    )
    $unsafeRules = @($acl.Access | Where-Object {
        if ($_.AccessControlType -ne 'Allow' -or (([Int64]$_.FileSystemRights -band [Int64]$mutatingMask) -eq 0)) {
            return $false
        }
        try {
            return $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $AllowedSids
        } catch {
            return $true
        }
    })
    if ($unsafeRules.Count -gt 0) {
        throw "Witness mutating permissions are outside the trusted SID allowlist: $Path"
    }
}

function Write-DeploymentBytesAtomic {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][byte[]]$Bytes
    )

    $directory = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($Path))
    [IO.Directory]::CreateDirectory($directory) | Out-Null
    $temporaryPath = Join-Path $directory ".$([IO.Path]::GetFileName($Path)).$([Guid]::NewGuid().ToString('N')).partial"
    $previousPath = "$temporaryPath.previous"
    $stream = $null
    try {
        $stream = New-Object IO.FileStream($temporaryPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write,
            [IO.FileShare]::None, 4096, [IO.FileOptions]::WriteThrough)
        $stream.Write($Bytes, 0, $Bytes.Length)
        $stream.Flush($true)
        $stream.Dispose()
        $stream = $null
        if ([IO.File]::Exists($Path)) {
            [IO.File]::Replace($temporaryPath, $Path, $previousPath, $true)
            [IO.File]::Delete($previousPath)
        } else {
            [IO.File]::Move($temporaryPath, $Path)
        }
    } finally {
        if ($stream) { $stream.Dispose() }
        if ([IO.File]::Exists($temporaryPath)) { [IO.File]::Delete($temporaryPath) }
        if ([IO.File]::Exists($previousPath)) { [IO.File]::Delete($previousPath) }
    }
}

function Write-DeploymentJsonAtomic {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)]$Value
    )
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes(($Value | ConvertTo-Json -Depth 12))
    Write-DeploymentBytesAtomic -Path $Path -Bytes $bytes
}

function Write-DeploymentLinesAtomic {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string[]]$Lines
    )
    $text = (@($Lines) -join "`r`n") + "`r`n"
    Write-DeploymentBytesAtomic -Path $Path -Bytes ([Text.UTF8Encoding]::new($false).GetBytes($text))
}

function Write-RecoveryClusterSentinel {
    param(
        [Parameter(Mandatory = $true)][string]$StateRoot,
        [Parameter(Mandatory = $true)][string]$ClusterId,
        [Parameter(Mandatory = $true)][string]$NodeId,
        [Parameter(Mandatory = $true)][string[]]$WitnessPaths,
        [string]$ReaderIdentity
    )

    $paths = @($WitnessPaths | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    if ($paths.Count -ne 2) {
        throw 'Recovery cluster sentinel requires exactly two witness paths.'
    }
    $witnessNodeIds = @($paths | ForEach-Object { $_.TrimStart('\').Split('\')[0].ToLowerInvariant() })
    if (@($witnessNodeIds | Select-Object -Unique).Count -ne 2) {
        throw 'Recovery cluster sentinel requires two distinct witness nodes.'
    }

    New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null
    Protect-DeploymentPath -Path $StateRoot -Mode StateDirectory -AdditionalIdentity $ReaderIdentity
    $sentinel = [ordered]@{
        formatVersion = 1
        clusterId = $ClusterId
        nodeId = $NodeId
        witnessPaths = $paths
        witnessNodeIds = $witnessNodeIds
        preparedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    }
    $sentinelPath = Join-Path $StateRoot 'cluster-mode.json'
    Write-DeploymentJsonAtomic -Path $sentinelPath -Value $sentinel
    Protect-DeploymentPath -Path $sentinelPath -Mode StateFile -AdditionalIdentity $ReaderIdentity
    $written = Get-Content -LiteralPath $sentinelPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($written.clusterId -ne $ClusterId -or $written.nodeId -ne $NodeId -or
        (@($written.witnessPaths) -join ';') -ne ($paths -join ';')) {
        throw 'Recovery sentinel durable read-back failed.'
    }
    return $sentinelPath
}

function Read-DeploymentEnv {
    $values = @{}
    $path = Join-Path $script:RepositoryRoot '.env'
    if (-not (Test-Path -LiteralPath $path)) {
        return $values
    }
    foreach ($line in Get-Content -LiteralPath $path -Encoding UTF8) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) {
            continue
        }
        $separator = $trimmed.IndexOf('=')
        if ($separator -lt 1) {
            continue
        }
        $values[$trimmed.Substring(0, $separator).Trim()] = $trimmed.Substring($separator + 1).Trim()
    }
    return $values
}

function Set-DeploymentEnvValues {
    param([Parameter(Mandatory = $true)][hashtable]$Values)

    $path = Join-Path $script:RepositoryRoot '.env'
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Application environment is missing: $path"
    }
    $lines = [Collections.Generic.List[string]]::new()
    $keysToReplace = @($Values.Keys | ForEach-Object { [string]$_ })
    foreach ($line in Get-Content -LiteralPath $path -Encoding UTF8) {
        $isReplacedKey = $false
        $trimmedLine = ([string]$line).Trim()
        foreach ($key in $keysToReplace) {
            if ($trimmedLine -match "^$([regex]::Escape($key))=") {
                $isReplacedKey = $true
                break
            }
        }
        if (-not $isReplacedKey) { $lines.Add([string]$line) }
    }
    foreach ($entry in $Values.GetEnumerator()) {
        if ($entry.Key -notmatch '^[A-Z][A-Z0-9_]*$' -or [string]$entry.Value -match "`r|`n") {
            throw "Invalid environment entry: $($entry.Key)"
        }
        $replacement = "$($entry.Key)=$([string]$entry.Value)"
        $lines.Add($replacement)
    }

    Write-DeploymentLinesAtomic -Path $path -Lines @($lines)
    $taskUser = (Read-DeploymentEnv)['BACKUP_TASK_USER']
    Protect-DeploymentPath -Path $path -Mode SecretFile -AdditionalIdentity $taskUser
    $readBack = Read-DeploymentEnv
    foreach ($entry in $Values.GetEnumerator()) {
        if ([string]$readBack[$entry.Key] -ne [string]$entry.Value) {
            throw "Application environment durable read-back failed: $($entry.Key)"
        }
    }
}

function ConvertFrom-DeploymentSecureString {
    param([Parameter(Mandatory = $true)][Security.SecureString]$Value)

    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function New-DeploymentSecret {
    param([int]$Bytes = 48)

    $buffer = New-Object byte[] $Bytes
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($buffer)
    } finally {
        $generator.Dispose()
    }
    return [Convert]::ToBase64String($buffer).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Refresh-ProcessPath {
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = @($machinePath, $userPath) -join ';'
}

function Invoke-DeploymentCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments = @(),
        [string]$WorkingDirectory = $script:RepositoryRoot,
        [Parameter(Mandatory = $true)][string]$LogPath
    )

    Write-DeploymentLog -LogPath $LogPath -Message "RUN $([IO.Path]::GetFileName($FilePath)) $($Arguments -join ' ')"
    Push-Location $WorkingDirectory
    try {
        & $FilePath @Arguments 2>&1 | ForEach-Object {
            $line = [string]$_
            Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
            Write-Host $line
        }
        if ($LASTEXITCODE -ne 0) {
            throw "$([IO.Path]::GetFileName($FilePath)) exited with code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
}

function Get-PostgresBinDirectory {
    param([int]$RequiredMajor = 0)

    $candidates = [Collections.Generic.List[string]]::new()
    $psql = Get-Command 'psql.exe' -ErrorAction SilentlyContinue
    if ($psql) {
        $candidates.Add((Split-Path $psql.Source -Parent))
    }
    $postgresRoot = Join-Path ([Environment]::GetFolderPath('ProgramFiles')) 'PostgreSQL'
    if (Test-Path -LiteralPath $postgresRoot) {
        Get-ChildItem -LiteralPath $postgresRoot -Directory |
            Sort-Object { try { [version]$_.Name } catch { [version]'0.0' } } -Descending |
            ForEach-Object { Join-Path $_.FullName 'bin' } |
            Where-Object { Test-Path -LiteralPath (Join-Path $_ 'psql.exe') } |
            ForEach-Object { $candidates.Add($_) }
    }
    foreach ($candidate in $candidates | Select-Object -Unique) {
        if ($RequiredMajor -eq 0) {
            return $candidate
        }
        $versionOutput = & (Join-Path $candidate 'psql.exe') '--version' 2>$null
        if ([string]($versionOutput) -match '(\d+)(?:\.\d+)?') {
            if ([int]$Matches[1] -eq $RequiredMajor) {
                return $candidate
            }
        }
    }
    return $null
}

function Get-PostgresService {
    param([int]$RequiredMajor = 0)

    $candidates = Get-Service -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like 'postgresql*' } |
        ForEach-Object {
            $major = if ($_.Name -match '(\d+)$') { [int]$Matches[1] } else { 0 }
            [PSCustomObject]@{ Service = $_; Major = $major }
        }
    if ($RequiredMajor -gt 0) {
        $candidates = $candidates | Where-Object { $_.Major -eq $RequiredMajor }
    }
    $selected = $candidates |
        Sort-Object @{ Expression = { $_.Major }; Descending = $true }, @{ Expression = { $_.Service.Status -eq 'Running' }; Descending = $true } |
        Select-Object -First 1
    if ($selected) {
        return $selected.Service
    }
    return $null
}

function Get-WorkwearService {
    return Get-Service -Name $script:WorkwearServiceName -ErrorAction SilentlyContinue
}

function Wait-WorkwearHealth {
    param(
        [int]$TimeoutSeconds = 60,
        [string]$Uri = 'http://127.0.0.1/health'
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            $result = Invoke-RestMethod -Uri $Uri -TimeoutSec 3
            if ($result.status -eq 'ok') {
                return $true
            }
        } catch {
            Start-Sleep -Seconds 2
        }
    } while ((Get-Date) -lt $deadline)
    return $false
}

function Get-WorkwearUrl {
    $values = Read-DeploymentEnv
    if ($values.ContainsKey('CLIENT_ORIGIN') -and $values['CLIENT_ORIGIN']) {
        return $values['CLIENT_ORIGIN']
    }
    return 'http://127.0.0.1'
}

function Write-OperationFailure {
    param(
        [Parameter(Mandatory = $true)][string]$LogPath,
        [Parameter(Mandatory = $true)]$ErrorRecord
    )

    $message = "$($ErrorRecord.Exception.Message)`n$($ErrorRecord.ScriptStackTrace)"
    Write-DeploymentLog -LogPath $LogPath -Message $message -Level ERROR
    Write-Host "$(Get-DeploymentMessage 'operationFailed') $LogPath" -ForegroundColor Red
}
