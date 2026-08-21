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

function Get-DatabaseSizeBytes {
    param(
        [Parameter(Mandatory = $true)][string]$Psql,
        [Parameter(Mandatory = $true)]$Configuration
    )

    $arguments = @(
        "--host=$($Configuration.Host)",
        "--port=$($Configuration.Port)",
        "--username=$($Configuration.User)",
        "--dbname=$($Configuration.Database)",
        '--set=ON_ERROR_STOP=1',
        '--tuples-only',
        '--no-align',
        '--quiet',
        '--command=select pg_database_size(current_database())::text;'
    )
    $rawValue = ((Invoke-PostgresTool -Tool $Psql -Arguments $arguments -Configuration $Configuration) -join '').Trim()
    [UInt64]$size = 0
    if (-not [UInt64]::TryParse($rawValue, [ref]$size)) {
        throw "PostgreSQL returned an invalid database size: $rawValue"
    }
    return $size
}

function Get-BackupCapacityState {
    param(
        [Parameter(Mandatory = $true)][UInt64]$AvailableBytes,
        [Parameter(Mandatory = $true)][UInt64]$TotalBytes,
        [Parameter(Mandatory = $true)][UInt64]$RequiredBytes,
        [ValidateRange(1, 99)][int]$WarningPercent = 20
    )

    $freeRatio = if ($TotalBytes -gt 0) {
        [decimal]$AvailableBytes / [decimal]$TotalBytes
    } else {
        0
    }
    $freePercent = if ($TotalBytes -gt 0) {
        [Math]::Round([double]($freeRatio * 100), 1)
    } else {
        0
    }
    $status = if ($TotalBytes -eq 0 -or $AvailableBytes -lt $RequiredBytes) {
        'critical'
    } elseif ($freeRatio -lt ([decimal]$WarningPercent / 100)) {
        'warning'
    } else {
        'ok'
    }
    return [PSCustomObject]@{
        Status = $status
        AvailableBytes = $AvailableBytes
        TotalBytes = $TotalBytes
        FreePercent = $freePercent
        RequiredBytes = $RequiredBytes
    }
}

function Initialize-BackupDiskSpaceApi {
    if ('Workwear.Backup.NativeDiskSpace' -as [type]) {
        return
    }

    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace Workwear.Backup {
    public static class NativeDiskSpace {
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool GetDiskFreeSpaceEx(
            string directoryName,
            out ulong freeBytesAvailable,
            out ulong totalBytes,
            out ulong totalFreeBytes);
    }
}
'@
}

function Get-BackupStorageInfo {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][UInt64]$RequiredBytes,
        [ValidateRange(1, 99)][int]$WarningPercent = 20
    )

    Initialize-BackupDiskSpaceApi
    [UInt64]$availableBytes = 0
    [UInt64]$totalBytes = 0
    [UInt64]$totalFreeBytes = 0
    $succeeded = [Workwear.Backup.NativeDiskSpace]::GetDiskFreeSpaceEx(
        $Path,
        [ref]$availableBytes,
        [ref]$totalBytes,
        [ref]$totalFreeBytes
    )
    if (-not $succeeded) {
        $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        throw [ComponentModel.Win32Exception]::new($errorCode, 'Unable to read backup destination capacity.')
    }
    return Get-BackupCapacityState -AvailableBytes $availableBytes -TotalBytes $totalBytes -RequiredBytes $RequiredBytes -WarningPercent $WarningPercent
}

function Get-BackupDestinationHost {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [string]$LocalHostName = $env:COMPUTERNAME
    )

    if ($Path.StartsWith('\\')) {
        $parts = @($Path.TrimStart('\') -split '\\')
        if ($parts.Count -gt 0 -and $parts[0]) {
            return $parts[0]
        }
    }
    return $(if ($LocalHostName) { $LocalHostName } else { 'local' })
}

function Read-BackupStatusFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $null
    }
    try {
        return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        return $null
    }
}

function Write-BackupStatusFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)]$Status
    )

    $directory = Split-Path $Path -Parent
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
    $writeToken = [Guid]::NewGuid().ToString('N')
    $temporaryPath = Join-Path $directory ".latest.$writeToken.partial"
    $replacementBackupPath = Join-Path $directory ".latest.$writeToken.previous"
    try {
        $json = $Status | ConvertTo-Json -Depth 8
        [IO.File]::WriteAllText($temporaryPath, $json, [Text.UTF8Encoding]::new($false))
        if (Test-Path -LiteralPath $Path -PathType Leaf) {
            [IO.File]::Replace($temporaryPath, $Path, $replacementBackupPath, $true)
            Remove-Item -LiteralPath $replacementBackupPath -Force
        } else {
            Move-Item -LiteralPath $temporaryPath -Destination $Path
        }
    } finally {
        if (Test-Path -LiteralPath $temporaryPath) {
            Remove-Item -LiteralPath $temporaryPath -Force
        }
        if (Test-Path -LiteralPath $replacementBackupPath) {
            Remove-Item -LiteralPath $replacementBackupPath -Force
        }
    }
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

function Resolve-BackupSecondaryPaths {
    param(
        [hashtable]$EnvironmentValues = @{},
        [string[]]$SecondaryPaths,
        [string]$LegacySecondaryPath
    )

    $rawValues = @()
    if ($SecondaryPaths -and @($SecondaryPaths).Count -gt 0) {
        $rawValues = @($SecondaryPaths)
    } elseif ($LegacySecondaryPath) {
        $rawValues = @($LegacySecondaryPath)
    } elseif ($EnvironmentValues['BACKUP_SECONDARY_PATHS']) {
        $rawValues = @($EnvironmentValues['BACKUP_SECONDARY_PATHS'])
    } elseif ($EnvironmentValues['BACKUP_SECONDARY_PATH']) {
        $rawValues = @($EnvironmentValues['BACKUP_SECONDARY_PATH'])
    }

    $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $resolved = [Collections.Generic.List[string]]::new()
    foreach ($rawValue in $rawValues) {
        foreach ($candidate in ([string]$rawValue -split ';')) {
            $trimmed = $candidate.Trim().TrimEnd('\', '/')
            if ($trimmed -and $seen.Add($trimmed)) {
                $resolved.Add($trimmed)
            }
        }
    }
    return @($resolved)
}

function Copy-BackupSet {
    param(
        [Parameter(Mandatory = $true)][string]$DumpFile,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    $sourceFiles = @($DumpFile, "$DumpFile.json", "$DumpFile.sha256")
    foreach ($source in $sourceFiles) {
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
            throw "Backup set source file is missing: $source"
        }
    }

    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    $finalFiles = @($sourceFiles | ForEach-Object { Join-Path $Destination ([IO.Path]::GetFileName($_)) })
    $existingFiles = @($finalFiles | Where-Object { Test-Path -LiteralPath $_ })
    if ($existingFiles.Count -gt 0) {
        for ($index = 0; $index -lt $sourceFiles.Count; $index += 1) {
            if (-not (Test-Path -LiteralPath $finalFiles[$index])) {
                continue
            }
            $sourceFileHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $sourceFiles[$index]).Hash
            $existingFileHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $finalFiles[$index]).Hash
            if ($sourceFileHash -ne $existingFileHash) {
                throw "Existing backup set differs and must not be overwritten: $($finalFiles[$index])"
            }
        }
        if ($existingFiles.Count -eq $finalFiles.Count) {
            return $finalFiles[0]
        }
    }

    $copyToken = [Guid]::NewGuid().ToString('N')
    $pending = [Collections.Generic.List[object]]::new()
    try {
        for ($index = 0; $index -lt $sourceFiles.Count; $index += 1) {
            $source = $sourceFiles[$index]
            if (Test-Path -LiteralPath $finalFiles[$index]) {
                continue
            }
            $name = [IO.Path]::GetFileName($source)
            $temporary = Join-Path $Destination ".$name.$copyToken.partial"
            $final = $finalFiles[$index]
            Copy-Item -LiteralPath $source -Destination $temporary
            $pending.Add([PSCustomObject]@{ Source = $source; Temporary = $temporary; Final = $final })
        }

        for ($index = 0; $index -lt $pending.Count; $index += 1) {
            $sourceFileHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $pending[$index].Source).Hash
            $temporaryFileHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $pending[$index].Temporary).Hash
            if ($sourceFileHash -ne $temporaryFileHash) {
                throw "Secondary backup hash mismatch before publish: $($pending[$index].Temporary)"
            }
        }

        foreach ($item in $pending | Where-Object Source -ne $DumpFile) {
            Move-Item -LiteralPath $item.Temporary -Destination $item.Final
        }
        $pendingDump = $pending | Where-Object Source -eq $DumpFile | Select-Object -First 1
        if ($pendingDump) {
            Move-Item -LiteralPath $pendingDump.Temporary -Destination $pendingDump.Final
        }

        $sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $DumpFile).Hash
        $destinationHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $finalFiles[0]).Hash
        if ($sourceHash -ne $destinationHash) {
            throw "Secondary backup hash mismatch: $($pending[0].Final)"
        }
        return $finalFiles[0]
    } catch {
        foreach ($item in $pending) {
            if (Test-Path -LiteralPath $item.Temporary) {
                Remove-Item -LiteralPath $item.Temporary -Force
            }
        }
        throw
    }
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
