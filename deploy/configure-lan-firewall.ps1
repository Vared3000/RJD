[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^(?:\d{1,3}\.){3}\d{1,3}/(?:[1-9]|[12]\d|3[0-2])$')]
    [string]$LanSubnet,

    [ValidateRange(1, 65535)]
    [int]$Port = 80,

    [string]$RuleName = 'Workwear ERP LAN HTTP'
)

$ErrorActionPreference = 'Stop'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    throw 'Run PowerShell as Administrator.'
}

$existing = @(Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue)
foreach ($rule in $existing) {
    if ($PSCmdlet.ShouldProcess($rule.DisplayName, 'Remove previous rule')) {
        Remove-NetFirewallRule -Name $rule.Name
    }
}

if ($PSCmdlet.ShouldProcess("TCP $Port from $LanSubnet", 'Create inbound rule')) {
    New-NetFirewallRule `
        -DisplayName $RuleName `
        -Description 'Allow Workwear ERP only from the approved LAN subnet' `
        -Direction Inbound `
        -Action Allow `
        -Enabled True `
        -Profile Domain,Private `
        -Protocol TCP `
        -LocalPort $Port `
        -RemoteAddress $LanSubnet | Out-Null
}

$broadRules = foreach ($rule in Get-NetFirewallRule -Direction Inbound -Action Allow -Enabled True) {
    $portFilter = Get-NetFirewallPortFilter -AssociatedNetFirewallRule $rule
    if ($portFilter.Protocol -ne 'TCP' -or $portFilter.LocalPort -notcontains [string]$Port) {
        continue
    }
    $addressFilter = Get-NetFirewallAddressFilter -AssociatedNetFirewallRule $rule
    if ($rule.DisplayName -ne $RuleName -and $addressFilter.RemoteAddress -contains 'Any') {
        $rule.DisplayName
    }
}

if ($broadRules) {
    Write-Warning "Other broad allow rules exist for TCP ${Port}: $($broadRules -join ', '). Review them manually if they apply to this ERP."
}

Write-Host "Rule '$RuleName': TCP $Port is allowed from $LanSubnet (Domain/Private profiles)."
