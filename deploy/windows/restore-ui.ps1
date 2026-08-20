[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

Assert-WindowsHost
Ensure-Administrator -ScriptPath $PSCommandPath
$logPath = New-DeploymentLog -Operation 'restore'

try {
    Add-Type -AssemblyName System.Windows.Forms
    Write-Host (Get-DeploymentMessage 'restoreSelect')
    $values = Read-DeploymentEnv
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Filter = 'PostgreSQL backup (*.dump)|*.dump|All files (*.*)|*.*'
    $dialog.Title = Get-DeploymentMessage 'restoreSelect'
    if ($values['BACKUP_ROOT'] -and (Test-Path -LiteralPath $values['BACKUP_ROOT'])) {
        $dialog.InitialDirectory = $values['BACKUP_ROOT']
    }
    if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
        Write-DeploymentLog -LogPath $logPath -Message (Get-DeploymentMessage 'restoreCancelled') -Level WARN
        exit 0
    }
    & (Join-Path $script:RepositoryRoot 'scripts\restore.ps1') -BackupFile $dialog.FileName -ApplicationServiceName $script:WorkwearServiceName -Force 2>&1 |
        ForEach-Object {
            Add-Content -LiteralPath $logPath -Value ([string]$_) -Encoding UTF8
            Write-Host $_
        }
    if ($LASTEXITCODE -ne 0) {
        throw 'Restore script failed'
    }
    if (-not (Wait-WorkwearHealth -TimeoutSeconds 60)) {
        throw (Get-DeploymentMessage 'healthFailed')
    }
    Write-DeploymentLog -LogPath $logPath -Message (Get-DeploymentMessage 'restoreComplete')
    exit 0
} catch {
    Write-OperationFailure -LogPath $logPath -ErrorRecord $_
    exit 1
}
