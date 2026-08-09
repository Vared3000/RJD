[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^(?:\d{1,3}\.){3}\d{1,3}$')]
    [string]$LanAddress,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^(?:\d{1,3}\.){3}\d{1,3}/(?:[1-9]|[12]\d|3[0-2])$')]
    [string]$LanSubnet,

    [ValidateRange(1, 65535)]
    [int]$Port = 80
)

$ErrorActionPreference = 'Stop'
$failures = [Collections.Generic.List[string]]::new()

$publishedPort = (& docker compose port client 80 2>$null | Select-Object -First 1).Trim()
if ($LASTEXITCODE -ne 0 -or -not $publishedPort) {
    $failures.Add('Docker Compose did not return the published frontend port.')
} elseif (-not $publishedPort.StartsWith("${LanAddress}:")) {
    $failures.Add("Frontend is published as '$publishedPort'; expected ${LanAddress}:${Port}.")
}

$unsafeListeners = @(
    Get-NetTCPConnection -State Listen -ErrorAction Stop |
        Where-Object {
            $_.LocalPort -in 4000, 5432 -and
            $_.LocalAddress -notin '127.0.0.1', '::1'
        }
)
if ($unsafeListeners) {
    $details = $unsafeListeners | ForEach-Object { "$($_.LocalAddress):$($_.LocalPort)" }
    $failures.Add("Backend or PostgreSQL is published outside loopback: $($details -join ', ').")
}

$firewallRule = Get-NetFirewallRule -DisplayName 'Workwear ERP LAN HTTP' -ErrorAction SilentlyContinue
if (-not $firewallRule) {
    $failures.Add('The Workwear ERP Windows Firewall rule was not found.')
} else {
    $addressFilter = Get-NetFirewallAddressFilter -AssociatedNetFirewallRule $firewallRule
    if ($addressFilter.RemoteAddress -notcontains $LanSubnet) {
        $failures.Add("The firewall rule is not limited to subnet $LanSubnet.")
    }
}

if (Get-Process -Name cloudflared -ErrorAction SilentlyContinue) {
    $failures.Add('A cloudflared process is running.')
}

$tunnelStartup = Join-Path ([Environment]::GetFolderPath('Startup')) 'run-tunnel-hidden.vbs'
if (Test-Path -LiteralPath $tunnelStartup) {
    $failures.Add("Cloudflare Tunnel remains in Startup: $tunnelStartup")
}

try {
    $health = Invoke-RestMethod -Uri "http://${LanAddress}:$Port/health" -TimeoutSec 10
    if ($health.status -ne 'ok') {
        $failures.Add('The reverse proxy returned an invalid healthcheck response.')
    }
} catch {
    $failures.Add("The healthcheck is unavailable through the LAN address: $($_.Exception.Message)")
}

if ($failures.Count -gt 0) {
    throw "LAN mode validation failed:`n - $($failures -join "`n - ")"
}

Write-Host "LAN mode verified: http://${LanAddress}:$Port, subnet $LanSubnet."
