[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

Assert-WindowsHost
$logPath = New-DeploymentLog -Operation 'status'

try {
    $service = Get-WorkwearService
    if (-not $service) {
        throw (Get-DeploymentMessage 'serviceMissing')
    }
    $postgres = Get-PostgresService
    Write-Host "PostgreSQL: $(if ($postgres) { $postgres.Status } else { 'not found' })"
    Write-Host "WorkwearERP: $($service.Status)"
    Write-Host "URL: $(Get-WorkwearUrl)"
    Write-Host "Logs: $script:DeploymentLogDirectory; $(Join-Path $script:RepositoryRoot 'logs\service')"
    if (-not $postgres -or $postgres.Status -ne 'Running') {
        Write-DeploymentLog -LogPath $logPath -Message (Get-DeploymentMessage 'statusPostgresStopped') -Level WARN
        exit 2
    }
    if ($service.Status -ne 'Running') {
        Write-DeploymentLog -LogPath $logPath -Message (Get-DeploymentMessage 'statusStopped') -Level WARN
        exit 1
    }
    if (-not (Wait-WorkwearHealth -TimeoutSeconds 10)) {
        Write-DeploymentLog -LogPath $logPath -Message (Get-DeploymentMessage 'statusBroken') -Level ERROR
        exit 3
    }
    Write-DeploymentLog -LogPath $logPath -Message (Get-DeploymentMessage 'statusRunning')
    exit 0
} catch {
    Write-OperationFailure -LogPath $logPath -ErrorRecord $_
    exit 1
}
