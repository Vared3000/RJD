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
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    if (Test-IsAdministrator) {
        return
    }
    Write-Host (Get-DeploymentMessage 'adminPrompt') -ForegroundColor Yellow
    $argumentList = @(
        '-NoLogo',
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        "`"$ScriptPath`""
    )
    $process = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argumentList -Wait -PassThru
    exit $process.ExitCode
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
