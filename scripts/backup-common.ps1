Set-StrictMode -Version Latest

function Read-DotEnvFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    $values = @{}
    if (-not (Test-Path -LiteralPath $Path)) {
        return $values
    }

    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) {
            continue
        }
        $separator = $trimmed.IndexOf('=')
        if ($separator -lt 1) {
            continue
        }
        $name = $trimmed.Substring(0, $separator).Trim()
        $value = $trimmed.Substring($separator + 1).Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $values[$name] = $value
    }
    return $values
}

function Get-DatabaseConfiguration {
    param([Parameter(Mandatory = $true)][string]$DatabaseUrl)

    if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
        throw 'Database connection URL is required.'
    }
    $uri = [Uri]$DatabaseUrl
    if ($uri.Scheme -notin 'postgres', 'postgresql') {
        throw 'DATABASE_URL must use postgres:// or postgresql://.'
    }
    $userInfo = $uri.UserInfo.Split(':', 2)
    if ($userInfo.Count -lt 1 -or -not $userInfo[0]) {
        throw 'DATABASE_URL does not contain a user name.'
    }

    $database = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
    if (-not $uri.Host -or -not $database) {
        throw 'DATABASE_URL must contain a host and database name.'
    }

    [PSCustomObject]@{
        Host = $uri.Host
        Port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
        Database = $database
        User = [Uri]::UnescapeDataString($userInfo[0])
        Password = if ($userInfo.Count -gt 1) { [Uri]::UnescapeDataString($userInfo[1]) } else { '' }
    }
}

function Resolve-PostgresTool {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [string]$PgBin
    )

    if ($PgBin) {
        $candidate = Join-Path $PgBin "$Name.exe"
        if (Test-Path -LiteralPath $candidate) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
        throw "PostgreSQL tool not found: $candidate"
    }

    $command = Get-Command "$Name.exe" -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $programFiles = [Environment]::GetFolderPath('ProgramFiles')
    $postgresRoot = Join-Path $programFiles 'PostgreSQL'
    if (Test-Path -LiteralPath $postgresRoot) {
        $candidate = Get-ChildItem -LiteralPath $postgresRoot -Directory |
            Sort-Object { try { [version]$_.Name } catch { [version]'0.0' } } -Descending |
            ForEach-Object { Join-Path $_.FullName "bin\$Name.exe" } |
            Where-Object { Test-Path -LiteralPath $_ } |
            Select-Object -First 1
        if ($candidate) {
            return $candidate
        }
    }

    throw "PostgreSQL tool '$Name.exe' was not found. Install PostgreSQL client tools or pass -PgBin."
}

function Invoke-PostgresTool {
    param(
        [Parameter(Mandatory = $true)][string]$Tool,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)]$Configuration
    )

    $hadPassword = Test-Path Env:PGPASSWORD
    $previousPassword = $env:PGPASSWORD
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $env:PGPASSWORD = $Configuration.Password
        $ErrorActionPreference = 'Continue'
        $output = & $Tool @Arguments 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "$([IO.Path]::GetFileName($Tool)) failed with exit code $LASTEXITCODE`: $($output -join [Environment]::NewLine)"
        }
        return @($output)
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
        if ($hadPassword) {
            $env:PGPASSWORD = $previousPassword
        } else {
            Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
        }
    }
}

function Test-CanCreateDatabase {
    param(
        [Parameter(Mandatory = $true)][string]$Psql,
        [Parameter(Mandatory = $true)]$Configuration
    )

    $arguments = @(
        "--host=$($Configuration.Host)",
        "--port=$($Configuration.Port)",
        "--username=$($Configuration.User)",
        '--dbname=postgres',
        '--set=ON_ERROR_STOP=1',
        '--tuples-only',
        '--no-align',
        '--quiet',
        "--command=select (rolcreatedb or rolsuper)::text from pg_roles where rolname = current_user;"
    )
    $result = (Invoke-PostgresTool -Tool $Psql -Arguments $arguments -Configuration $Configuration) -join ''
    return $result.Trim() -eq 'true'
}

function Get-DatabaseCounts {
    param(
        [Parameter(Mandatory = $true)][string]$Psql,
        [Parameter(Mandatory = $true)]$Configuration,
        [string]$DatabaseName = $Configuration.Database
    )

    $sql = @"
select json_build_object(
  'employees', (select count(*) from employees),
  'instances', (select count(*) from instances),
  'documents', (
    select sum(document_count) from (
      select count(*) document_count from receiving_documents
      union all select count(*) from issuance_documents
      union all select count(*) from return_documents
      union all select count(*) from laundry_documents
      union all select count(*) from repair_documents
      union all select count(*) from transfer_documents
      union all select count(*) from writeoff_documents
      union all select count(*) from inventory_documents
      union all select count(*) from stock_adjustments
    ) document_counts
  ),
  'stockMovements', (select count(*) from stock_movements)
)::text;
"@
    $arguments = @(
        "--host=$($Configuration.Host)",
        "--port=$($Configuration.Port)",
        "--username=$($Configuration.User)",
        "--dbname=$DatabaseName",
        '--set=ON_ERROR_STOP=1',
        '--tuples-only',
        '--no-align',
        '--quiet',
        "--command=$sql"
    )
    $json = (Invoke-PostgresTool -Tool $Psql -Arguments $arguments -Configuration $Configuration) -join ''
    return $json.Trim() | ConvertFrom-Json
}

function Write-BackupLog {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Message,
        [ValidateSet('INFO', 'WARN', 'ERROR')][string]$Level = 'INFO'
    )

    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$Level] $Message"
    Add-Content -LiteralPath $Path -Value $line -Encoding UTF8
    if ($Level -eq 'ERROR') {
        Write-Error $Message -ErrorAction Continue
    } elseif ($Level -eq 'WARN') {
        Write-Warning $Message
    } else {
        Write-Host $Message
    }
}

function Remove-BackupSet {
    param([Parameter(Mandatory = $true)][IO.FileInfo]$DumpFile)

    foreach ($path in @($DumpFile.FullName, "$($DumpFile.FullName).json", "$($DumpFile.FullName).sha256", "$($DumpFile.FullName).verified.json")) {
        if (Test-Path -LiteralPath $path) {
            Remove-Item -LiteralPath $path -Force
        }
    }
}

function Invoke-BackupRotation {
    param(
        [Parameter(Mandatory = $true)][string]$Directory,
        [Parameter(Mandatory = $true)][int]$Keep
    )

    $files = @(Get-ChildItem -LiteralPath $Directory -Filter 'workwear_erp_*.dump' -File | Sort-Object LastWriteTimeUtc -Descending)
    foreach ($file in $files | Select-Object -Skip $Keep) {
        Remove-BackupSet -DumpFile $file
    }
}

function Copy-BackupSet {
    param(
        [Parameter(Mandatory = $true)][string]$DumpFile,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    $sourceFiles = @($DumpFile, "$DumpFile.json", "$DumpFile.sha256")
    foreach ($source in $sourceFiles) {
        Copy-Item -LiteralPath $source -Destination $Destination -Force
    }
    $copiedDump = Join-Path $Destination ([IO.Path]::GetFileName($DumpFile))
    $sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $DumpFile).Hash
    $destinationHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $copiedDump).Hash
    if ($sourceHash -ne $destinationHash) {
        throw "Secondary backup hash mismatch: $copiedDump"
    }
    return $copiedDump
}

function Get-LatestBackup {
    param([Parameter(Mandatory = $true)][string]$Directory)

    $file = Get-ChildItem -LiteralPath $Directory -Filter 'workwear_erp_*.dump' -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if (-not $file) {
        throw "No backup files found in $Directory"
    }
    return $file.FullName
}
