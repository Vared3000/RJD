[CmdletBinding()]
param([string]$EvidencePath)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$scriptPath = Join-Path $PSScriptRoot 'preflight.mjs'
$environmentPath = Join-Path $repositoryRoot '.env'
$arguments = @("--env-file-if-exists=$environmentPath", $scriptPath)
if ($EvidencePath) { $arguments += "--evidence=$EvidencePath" }

& node @arguments
exit $LASTEXITCODE
