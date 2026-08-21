[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
. (Join-Path $script:RepositoryRoot 'scripts\backup-common.ps1')

Assert-WindowsHost
Ensure-Administrator -ScriptPath $PSCommandPath
$logPath = New-DeploymentLog -Operation 'update'
$previousCommit = $null
$backupFile = $null
$migrationStarted = $false

function Start-InstalledService {
    $postgres = Get-PostgresService
    if ($postgres -and $postgres.Status -ne 'Running') {
        Start-Service -Name $postgres.Name
        $postgres.WaitForStatus('Running', [TimeSpan]::FromSeconds(60))
    }
    $service = Get-WorkwearService
    if ($service -and $service.Status -ne 'Running') {
        Start-Service -Name $script:WorkwearServiceName
        $service.WaitForStatus('Running', [TimeSpan]::FromSeconds(60))
    }
}

try {
    Write-DeploymentLog -LogPath $logPath -Message (Get-DeploymentMessage 'updateStarted')
    $git = (Get-Command 'git.exe' -ErrorAction Stop).Source
    $pnpm = (Get-Command 'pnpm.cmd' -ErrorAction Stop).Source
    $dirtyFiles = (& $git -C $script:RepositoryRoot status --porcelain --untracked-files=no) -join ''
    if ($dirtyFiles.Trim()) {
        throw (Get-DeploymentMessage 'dirtyCheckout')
    }
    $previousCommit = (& $git -C $script:RepositoryRoot rev-parse HEAD).Trim()
    Invoke-DeploymentCommand -FilePath $git -Arguments @('-C', $script:RepositoryRoot, 'fetch', '--prune', 'origin') -LogPath $logPath
    $targetCommit = (& $git -C $script:RepositoryRoot rev-parse 'origin/master').Trim()
    if ($previousCommit -eq $targetCommit) {
        Write-DeploymentLog -LogPath $logPath -Message (Get-DeploymentMessage 'updateNoChanges')
        exit 0
    }

    $environmentValues = Read-DeploymentEnv
    $backupArguments = @{}
    if ($environmentValues['BACKUP_SECONDARY_PATHS']) {
        $backupArguments.RequiredSecondaryCount = 2
    } else {
        $backupArguments.RequireSecondary = $true
    }
    $backupOutput = & (Join-Path $script:RepositoryRoot 'scripts\backup.ps1') @backupArguments 2>&1
    $backupOutput | ForEach-Object {
        Add-Content -LiteralPath $logPath -Value ([string]$_) -Encoding UTF8
        Write-Host $_
    }
    if ($LASTEXITCODE -ne 0) {
        throw 'Pre-update backup failed'
    }
    $backupFile = [string]($backupOutput | Where-Object { [string]$_ -match '\.dump$' } | Select-Object -Last 1)
    if (-not $backupFile -or -not (Test-Path -LiteralPath $backupFile)) {
        throw 'Pre-update backup path was not returned'
    }

    $service = Get-WorkwearService
    if (-not $service) {
        throw (Get-DeploymentMessage 'serviceMissing')
    }
    if ($service.Status -ne 'Stopped') {
        Stop-Service -Name $script:WorkwearServiceName
        $service.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(60))
    }
    Invoke-DeploymentCommand -FilePath $git -Arguments @('-C', $script:RepositoryRoot, 'merge', '--ff-only', 'origin/master') -LogPath $logPath
    Invoke-DeploymentCommand -FilePath $pnpm -Arguments @('install', '--frozen-lockfile') -LogPath $logPath
    Invoke-DeploymentCommand -FilePath $pnpm -Arguments @('--filter', '@workwear/client', 'build') -LogPath $logPath
    $migrationStarted = $true
    Invoke-DeploymentCommand -FilePath $pnpm -Arguments @('db:migrate') -LogPath $logPath
    Invoke-DeploymentCommand -FilePath $pnpm -Arguments @('db:seed') -LogPath $logPath
    Start-InstalledService
    if (-not (Wait-WorkwearHealth -TimeoutSeconds 90)) {
        throw (Get-DeploymentMessage 'healthFailed')
    }
    Write-DeploymentLog -LogPath $logPath -Message (Get-DeploymentMessage 'updateComplete')
    exit 0
} catch {
    $updateError = $_
    Write-DeploymentLog -LogPath $logPath -Message (Get-DeploymentMessage 'updateRollback') -Level WARN
    try {
        $git = (Get-Command 'git.exe' -ErrorAction Stop).Source
        $pnpm = (Get-Command 'pnpm.cmd' -ErrorAction Stop).Source
        if ($previousCommit) {
            Invoke-DeploymentCommand -FilePath $git -Arguments @('-C', $script:RepositoryRoot, 'reset', '--hard', $previousCommit) -LogPath $logPath
            Invoke-DeploymentCommand -FilePath $pnpm -Arguments @('install', '--frozen-lockfile') -LogPath $logPath
            Invoke-DeploymentCommand -FilePath $pnpm -Arguments @('--filter', '@workwear/client', 'build') -LogPath $logPath
        }
        if ($migrationStarted -and $backupFile -and (Test-Path -LiteralPath $backupFile)) {
            & (Join-Path $script:RepositoryRoot 'scripts\restore.ps1') -BackupFile $backupFile -ApplicationServiceName $script:WorkwearServiceName -Force
            if ($LASTEXITCODE -ne 0) {
                throw 'Database rollback failed'
            }
        }
        Start-InstalledService
        if (-not (Wait-WorkwearHealth -TimeoutSeconds 90)) {
            throw (Get-DeploymentMessage 'healthFailed')
        }
        Write-DeploymentLog -LogPath $logPath -Message (Get-DeploymentMessage 'updateRollbackComplete')
    } catch {
        Write-DeploymentLog -LogPath $logPath -Message $_.Exception.Message -Level ERROR
    }
    Write-OperationFailure -LogPath $logPath -ErrorRecord $updateError
    exit 1
}
