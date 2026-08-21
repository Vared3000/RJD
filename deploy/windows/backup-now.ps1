[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
. (Join-Path $script:RepositoryRoot 'scripts\backup-common.ps1')

Assert-WindowsHost
$logPath = New-DeploymentLog -Operation 'backup'

try {
    $values = Read-DeploymentEnv
    $arguments = @{}
    $secondaryPaths = @(Resolve-BackupSecondaryPaths -EnvironmentValues $values)
    if ($values['BACKUP_SECONDARY_PATHS']) {
        $arguments.RequiredSecondaryCount = 2
    } elseif ($secondaryPaths.Count -gt 0) {
        $arguments.RequireSecondary = $true
    }
    $output = & (Join-Path $script:RepositoryRoot 'scripts\backup.ps1') @arguments 2>&1
    $output | ForEach-Object {
        Add-Content -LiteralPath $logPath -Value ([string]$_) -Encoding UTF8
        Write-Host $_
    }
    if ($LASTEXITCODE -ne 0) {
        throw 'Backup script failed'
    }
    $backupFile = @($output | Where-Object { [string]$_ -match '\.dump$' } | Select-Object -Last 1)
    Write-DeploymentLog -LogPath $logPath -Message "$(Get-DeploymentMessage 'backupComplete') $backupFile"
    exit 0
} catch {
    Write-OperationFailure -LogPath $logPath -ErrorRecord $_
    exit 1
}
