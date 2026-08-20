[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

Assert-WindowsHost
Ensure-Administrator -ScriptPath $PSCommandPath
$logPath = New-DeploymentLog -Operation 'stop'

try {
    $service = Get-WorkwearService
    if (-not $service) {
        throw (Get-DeploymentMessage 'serviceMissing')
    }
    if ($service.Status -ne 'Stopped') {
        Stop-Service -Name $script:WorkwearServiceName
        $service.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(60))
    }
    Write-DeploymentLog -LogPath $logPath -Message (Get-DeploymentMessage 'serviceStopped')
    exit 0
} catch {
    Write-OperationFailure -LogPath $logPath -ErrorRecord $_
    exit 1
}
