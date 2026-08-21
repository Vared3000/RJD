[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

Assert-WindowsHost
Ensure-Administrator -ScriptPath $PSCommandPath
$logPath = New-DeploymentLog -Operation 'emergency-recovery-ui'
$stdoutPath = $null
$stderrPath = $null

try {
    Add-Type -AssemblyName System.Windows.Forms
    $answer = [System.Windows.Forms.MessageBox]::Show(
        "Запускайте аварийное восстановление только если текущий активный ПК действительно выключен или недоступен.`r`n`r`nСистема сама продолжит безопасный этап или выберет последнюю подходящую копию. Продолжить?",
        'Аварийное восстановление Workwear ERP',
        [System.Windows.Forms.MessageBoxButtons]::YesNo,
        [System.Windows.Forms.MessageBoxIcon]::Warning,
        [System.Windows.Forms.MessageBoxDefaultButton]::Button2
    )
    if ($answer -ne [System.Windows.Forms.DialogResult]::Yes) {
        Write-DeploymentLog -LogPath $logPath -Message 'Аварийное восстановление отменено пользователем.' -Level WARN
        exit 0
    }

    $stateRoot = Join-Path $env:ProgramData 'WorkwearERP\recovery'
    New-Item -ItemType Directory -Force -Path $stateRoot | Out-Null
    $resultPath = Join-Path $stateRoot 'last-result.json'
    $stdoutPath = Join-Path $stateRoot "ui-child-$([Guid]::NewGuid().ToString('N')).out.log"
    $stderrPath = Join-Path $stateRoot "ui-child-$([Guid]::NewGuid().ToString('N')).error.log"
    $startedAtUtc = (Get-Date).ToUniversalTime()
    $recoveryScript = Join-Path $script:RepositoryRoot 'scripts\emergency-recover.ps1'
    $escapedScript = $recoveryScript.Replace("'", "''")
    $escapedResult = $resultPath.Replace("'", "''")
    $childCommand = "& '$escapedScript' -ConfirmPrimaryUnavailable -Execute -Confirm:`$false -ResultPath '$escapedResult'"
    $encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($childCommand))
    $windowsPowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $child = Start-Process -FilePath $windowsPowerShell -ArgumentList @(
        '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encodedCommand
    ) -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath

    foreach ($childLog in @($stdoutPath, $stderrPath)) {
        if (Test-Path -LiteralPath $childLog -PathType Leaf) {
            Get-Content -LiteralPath $childLog -Encoding UTF8 | ForEach-Object {
                Add-Content -LiteralPath $logPath -Value ([string]$_) -Encoding UTF8
            }
        }
    }
    if ($child.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $resultPath -PathType Leaf)) {
        throw 'Аварийное восстановление не завершено. Повторите запуск; мастер продолжит с безопасного этапа.'
    }
    $result = Get-Content -LiteralPath $resultPath -Raw -Encoding UTF8 | ConvertFrom-Json
    [DateTimeOffset]$validatedAtUtc = [DateTimeOffset]::MinValue
    if ($result.status -ne 'active' -or
        -not $result.PSObject.Properties['validatedAtUtc'] -or
        -not [DateTimeOffset]::TryParse([string]$result.validatedAtUtc, [ref]$validatedAtUtc) -or
        $validatedAtUtc.UtcDateTime -lt $startedAtUtc.AddSeconds(-5)) {
        throw 'Итог recovery устарел или новый активный узел не прошёл повторную проверку.'
    }

    [System.Windows.Forms.MessageBox]::Show(
        "Программа восстановлена из копии от $($result.backupSnapshotStartedAtUtc).`r`nАдрес: $($result.applicationUrl)",
        'Программа работает',
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
    ) | Out-Null
    Start-Process $result.applicationUrl
    exit 0
} catch {
    Write-OperationFailure -LogPath $logPath -ErrorRecord $_
    try {
        [System.Windows.Forms.MessageBox]::Show(
            "Восстановление не завершено. Старый активный ПК автоматически не включался в работу.`r`n`r`nПовторите запуск. Технический журнал: $logPath",
            'Нужна проверка',
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
    } catch { }
    exit 1
} finally {
    foreach ($temporaryLog in @($stdoutPath, $stderrPath)) {
        if ($temporaryLog -and (Test-Path -LiteralPath $temporaryLog -PathType Leaf)) {
            Remove-Item -LiteralPath $temporaryLog -Force -ErrorAction SilentlyContinue
        }
    }
}
