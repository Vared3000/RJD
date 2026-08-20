[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

Assert-WindowsHost
$logPath = New-DeploymentLog -Operation 'start'

try {
    $service = Get-WorkwearService
    if (-not $service) {
        throw (Get-DeploymentMessage 'serviceMissing')
    }
    if ($service.Status -ne 'Running') {
        Ensure-Administrator -ScriptPath $PSCommandPath
        $postgres = Get-PostgresService
        if (-not $postgres) {
            throw (Get-DeploymentMessage 'postgresMissing')
        }
        if ($postgres.Status -ne 'Running') {
            Start-Service -Name $postgres.Name
            $postgres.WaitForStatus('Running', [TimeSpan]::FromSeconds(60))
        }
        Start-Service -Name $script:WorkwearServiceName
        $service.WaitForStatus('Running', [TimeSpan]::FromSeconds(60))
    }
    Write-DeploymentLog -LogPath $logPath -Message (Get-DeploymentMessage 'healthWaiting')
    if (-not (Wait-WorkwearHealth -TimeoutSeconds 60)) {
        throw (Get-DeploymentMessage 'healthFailed')
    }
    $url = Get-WorkwearUrl
    Write-DeploymentLog -LogPath $logPath -Message "$(Get-DeploymentMessage 'serviceStarted') $url"
    Start-Process $url
    exit 0
} catch {
    Write-OperationFailure -LogPath $logPath -ErrorRecord $_
    exit 1
}
