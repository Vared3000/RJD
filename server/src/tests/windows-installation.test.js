import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const windowsDirectory = path.join(repositoryRoot, 'deploy', 'windows');

async function read(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8');
}

test('Windows-комплект содержит восемь тонких bat-оболочек', async () => {
  const wrappers = new Map([
    ['Установить программу.bat', 'install.ps1'],
    ['Запустить программу.bat', 'start.ps1'],
    ['Остановить программу.bat', 'stop.ps1'],
    ['Проверить состояние.bat', 'status.ps1'],
    ['Создать резервную копию.bat', 'backup-now.ps1'],
    ['Восстановить из копии.bat', 'restore-ui.ps1'],
    ['Обновить программу.bat', 'update.ps1'],
    ['Провести приёмку.bat', 'acceptance.ps1'],
  ]);

  for (const [fileName, target] of wrappers) {
    const content = await read(fileName);
    const lines = content.split(/\r?\n/).filter(Boolean);
    assert.ok(lines.length <= 10, `${fileName} должен оставаться тонкой оболочкой`);
    assert.match(content, /powershell\.exe/i);
    assert.match(content, new RegExp(target.replace('.', '\\.')));
    assert.match(content, /%~dp0/);
  }
});

test('установщик проверяет среду, создаёт БД, службу, firewall, backup и ярлыки', async () => {
  const content = await read('deploy/windows/install.ps1');

  assert.match(content, /Ensure-Administrator/);
  assert.match(content, /MinimumFreeSpaceGb/);
  assert.match(content, /Get-NetTCPConnection/);
  assert.match(content, /OpenJS\.NodeJS\.LTS/);
  assert.match(content, /PostgreSQL\.PostgreSQL\.18/);
  assert.match(content, /Get-PostgresBinDirectory -RequiredMajor 18/);
  assert.match(content, /Get-PostgresService -RequiredMajor 18/);
  assert.match(content, /major -ne 24/);
  assert.match(content, /pnpmMajor -ne 11/);
  assert.match(content, /Initialize-ApplicationDatabase/);
  assert.match(content, /db:migrate/);
  assert.match(content, /db:seed/);
  assert.match(content, /configure-lan-firewall\.ps1/);
  assert.match(content, /install-backup-tasks\.ps1/);
  assert.match(content, /BACKUP_SECONDARY_PATHS/);
  assert.match(content, /Resolve-BackupSecondaryPaths/);
  assert.match(content, /RunBackupNow/);
  assert.match(content, /-RequiredSecondaryCount 2/);
  assert.match(content, /backupHosts\.Count -ne 2/);
  assert.match(content, /CommonDesktopDirectory/);
  assert.match(content, /Wait-WorkwearHealth/);
  assert.doesNotMatch(content, /--superpassword/i);
});

test('служба использует закреплённый WinSW и проверяет SHA-256', async () => {
  const content = await read('deploy/windows/install.ps1');

  assert.match(content, /releases\/download\/v2\.12\.0\/WinSW\.NET4\.exe/);
  assert.match(content, /923111C7142B3DC783A3C722B19B8A21BCB78222D7A136AC33F0CA8A29F4CB66/);
  assert.match(content, /Get-FileHash -Algorithm SHA256/);
  assert.match(content, /<startmode>Automatic<\/startmode>/);
  assert.match(content, /<depend>/);
  assert.match(content, /<onfailure action="restart"/);
});

test('конфигурация создаётся атомарно и получает ограниченный ACL', async () => {
  const content = await read('deploy/windows/install.ps1');
  const common = await read('deploy/windows/common.ps1');

  assert.match(content, /Join-Path \$script:RepositoryRoot '\.env\.new'/);
  assert.match(content, /Move-Item[^\n]+-Force/);
  assert.match(content, /icacls\.exe/);
  assert.match(content, /S-1-5-18/);
  assert.match(content, /S-1-5-32-544/);
  assert.match(content, /BackupTaskUser[\s\S]+:\(R\)/);
  assert.match(content, /Assert-BackupDestinationAcl/);
  assert.match(content, /Protect-LocalBackupRoot/);
  assert.match(common, /RandomNumberGenerator/);
});

test('обновление делает backup до изменения кода и восстанавливает код и БД при ошибке', async () => {
  const content = await read('deploy/windows/update.ps1');
  const backupPosition = content.indexOf('scripts\\backup.ps1');
  const mergePosition = content.indexOf("'merge', '--ff-only'");

  assert.ok(backupPosition > 0);
  assert.ok(mergePosition > backupPosition);
  assert.match(content, /reset', '--hard', \$previousCommit/);
  assert.match(content, /scripts\\restore\.ps1/);
  assert.match(content, /Wait-WorkwearHealth/);
});

test('native Windows-служба раздаёт production frontend и API одним процессом', async () => {
  const app = await read('server/src/app.js');

  assert.match(app, /env\.NODE_ENV !== 'production'/);
  assert.match(app, /express\.static\(clientDistDirectory\)/);
  assert.match(app, /res\.sendFile\('index\.html'/);
  assert.match(app, /req\.path\.startsWith\('\/api\/'\)/);
});

test('диагностика различает остановку приложения, PostgreSQL и HTTP', async () => {
  const status = await read('deploy/windows/status.ps1');

  assert.match(status, /statusPostgresStopped'[\s\S]+exit 2/);
  assert.match(status, /statusStopped'[\s\S]+exit 1/);
  assert.match(status, /statusBroken'[\s\S]+exit 3/);
});

test('приёмка сервера формирует отчёт и не подменяет внешние проверки', async () => {
  const acceptance = await read('deploy/windows/acceptance.ps1');

  assert.match(acceptance, /Get-CimInstance Win32_Service/);
  assert.match(acceptance, /Get-NetFirewallRule/);
  assert.match(acceptance, /Get-NetTCPConnection/);
  assert.match(acceptance, /Get-ScheduledTaskInfo/);
  assert.match(acceptance, /Get-FileHash/);
  assert.match(acceptance, /Exactly two secondary backup paths/);
  assert.match(acceptance, /SHA256 sidecar does not describe/);
  assert.match(acceptance, /Monthly restore verification is missing/);
  assert.match(acceptance, /Test-BackupPathAclSafe/);
  assert.match(acceptance, /verified\.json/);
  assert.match(acceptance, /ConvertTo-Json/);
  assert.match(acceptance, /acceptance-[^\n]+\.md/);
  assert.match(acceptance, /'reboot'[\s\S]+Status 'manual'/);
  assert.match(acceptance, /'two-workstations'[\s\S]+Status 'manual'/);
  assert.match(acceptance, /'external-access'[\s\S]+Status 'manual'/);
});

test(
  'PowerShell-файлы комплекта синтаксически корректны',
  { skip: process.platform !== 'win32' },
  async () => {
    const files = (await readdir(windowsDirectory)).filter((name) => name.endsWith('.ps1'));
    const directory = windowsDirectory.replaceAll("'", "''");
    const command = [
      '$failures = [Collections.Generic.List[string]]::new()',
      `Get-ChildItem -LiteralPath '${directory}' -Filter '*.ps1' | ForEach-Object {`,
      '  $tokens = $null; $errors = $null',
      '  [Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$tokens, [ref]$errors) | Out-Null',
      '  foreach ($parseError in $errors) { $failures.Add("$($_.Name): $($parseError.Message)") }',
      '}',
      'if ($failures.Count -gt 0) { $failures | Write-Error; exit 1 }',
    ].join('; ');
    const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', command], {
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.ok(files.length >= 9);
  },
);
