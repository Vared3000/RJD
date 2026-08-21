import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function read(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8');
}

function quotePowerShell(value) {
  return String(value).replaceAll("'", "''");
}

test('аварийный мастер не показывает PostgreSQL и автоматически выбирает локальную копию', async () => {
  const common = await read('scripts/recovery-common.ps1');
  const recovery = await read('scripts/emergency-recover.ps1');
  const ui = await read('deploy/windows/emergency-recovery-ui.ps1');
  const prepare = await read('deploy/windows/prepare-reserve.ps1');
  const server = await read('server/src/server.js');

  assert.match(common, /formatVersion[^\n]+-ne 2/);
  assert.match(common, /recoveryFenceConfigured/);
  assert.match(common, /Get-FileHash[^\n]+SHA256/);
  assert.match(common, /Commit-PromotionWitness/);
  assert.match(recovery, /Select-RecoveryCandidate/);
  assert.match(recovery, /verify-backup\.ps1[\s\S]{0,300}TestRestore/);
  assert.match(recovery, /workwear_erp_recovery_/);
  assert.match(recovery, /--role=/);
  assert.match(recovery, /Set-DeploymentEnvValues/);
  assert.match(recovery, /install-backup-tasks\.ps1/);
  assert.match(recovery, /RECOVERY_PRIMARY_HOST/);
  assert.match(recovery, /ConfirmPrimaryUnavailable/);
  assert.match(recovery, /FileShare\]::None/);
  assert.match(recovery, /TARGET_VALIDATED/);
  assert.match(recovery, /WITNESS_COMMITTED/);
  assert.match(recovery, /Assert-CurrentActiveNodeUnavailable[\s\S]+CurrentQuorum/);
  assert.match(recovery, /Workwear ERP Daily Backup/);
  assert.match(recovery, /Assert-RecoveryBackupTaskDefinition/);
  assert.match(recovery, /Assert-RecoveryActiveState/);
  assert.match(recovery, /\/health\/recovery-ready\?database=[^\n]+migrationHead=/);
  assert.match(recovery, /ExpectedDatabase/);
  assert.match(recovery, /ExpectedNodeId/);
  assert.match(recovery, /ExpectedEpoch/);
  assert.match(recovery, /ExpectedMigrationHead/);
  assert.doesNotMatch(recovery, /Wait-WorkwearHealth/);
  assert.match(ui, /MessageBox/);
  assert.match(ui, /powershell\.exe[\s\S]+Start-Process/);
  assert.match(ui, /WindowStyle Hidden/);
  assert.match(ui, /validatedAtUtc/);
  assert.doesNotMatch(ui, /& \(Join-Path[^\n]+emergency-recover\.ps1/);
  assert.doesNotMatch(ui, /OpenFileDialog|FolderBrowserDialog/);
  assert.match(prepare, /StartupType Disabled/);
  assert.match(prepare, /RECOVERY_WITNESS_PATHS/);
  assert.match(server, /assertRecoveryFence/);
});

test('recovery state machine фиксирует point-of-no-return до изменения env и не восстанавливает после него', async () => {
  const recovery = await read('scripts/emergency-recover.ps1');
  const guardedRestore = recovery.indexOf(
    "if (-not (Test-RecoveryPhaseAtLeast -Current $script:journal.phase -Required 'TARGET_VALIDATED'))",
  );
  const restore = recovery.indexOf("Set-RecoveryPhase -Phase 'TARGET_RESTORING'", guardedRestore);
  const targetValidated = recovery.indexOf("Set-RecoveryPhase -Phase 'TARGET_VALIDATED'", restore);
  const witnessGuard = recovery.indexOf(
    "if (-not (Test-RecoveryPhaseAtLeast -Current $script:journal.phase -Required 'WITNESS_COMMITTED'))",
    targetValidated,
  );
  const witnessCommitted = recovery.indexOf(
    "Set-RecoveryPhase -Phase 'WITNESS_COMMITTED'",
    witnessGuard,
  );
  const envConfigured = recovery.indexOf('Set-DeploymentEnvValues', witnessCommitted);

  assert.ok(guardedRestore >= 0);
  assert.ok(restore > guardedRestore);
  assert.ok(targetValidated > restore);
  assert.ok(witnessGuard > targetValidated);
  assert.ok(witnessCommitted > witnessGuard);
  assert.ok(envConfigured > witnessCommitted);
  assert.equal(
    recovery.slice(witnessGuard).includes("Set-RecoveryPhase -Phase 'TARGET_RESTORING'"),
    false,
  );
});

test('план recovery не записывает READY-журнал и не архивирует ACTIVE-журнал', async () => {
  const recovery = await read('scripts/emergency-recover.ps1');
  const planGuard = recovery.indexOf('if (-not $Execute)');
  const shouldProcess = recovery.indexOf('$PSCmdlet.ShouldProcess', planGuard);
  const archive = recovery.indexOf('Move-Item -LiteralPath $script:journalPath', shouldProcess);
  const journalWrite = recovery.indexOf('Write-RecoveryJournal -Path $script:journalPath', archive);

  assert.ok(planGuard >= 0);
  assert.ok(shouldProcess > planGuard);
  assert.ok(archive > shouldProcess);
  assert.ok(journalWrite > archive);
});

test('PowerShell-файлы мастера сохраняют UTF-8 BOM для Windows PowerShell 5.1', async () => {
  for (const relativePath of [
    'scripts/emergency-recover.ps1',
    'deploy/windows/emergency-recovery-ui.ps1',
  ]) {
    const bytes = await readFile(path.join(repositoryRoot, relativePath));
    assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], relativePath);
  }
});

test(
  'выбор recovery-копии отклоняет новый повреждённый комплект и берёт последний точный manifest v2',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'workwear-recovery-candidate-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const daily = path.join(root, 'daily');
    await mkdir(daily, { recursive: true });
    const expected = {
      releaseId: 'release-a',
      commit: 'a'.repeat(40),
      tree: 'b'.repeat(40),
      isDirty: false,
      clientBuildSha256: 'c'.repeat(64),
      version: '1.2.3',
      migrationHead: '0079-test.js',
    };
    const expectedPath = path.join(root, 'expected.json');
    await writeFile(expectedPath, JSON.stringify(expected));

    async function createSet(stamp, snapshot, overrides = {}) {
      const fileName = `workwear_erp_20260821_${stamp}.dump`;
      const dump = path.join(daily, fileName);
      const data = Buffer.from(`dump-${stamp}`);
      await writeFile(dump, data);
      const sha256 = createHash('sha256').update(data).digest('hex').toUpperCase();
      const manifest = {
        formatVersion: 2,
        snapshotStartedAtUtc: snapshot,
        createdAtUtc: new Date(new Date(snapshot).getTime() + 1000).toISOString(),
        fileName,
        release: expected,
        clusterId: 'cluster-a',
        sourceNodeId: 'pc1',
        recoveryFenceConfigured: true,
        recoveryEpoch: 1,
        size: data.length,
        sha256,
        counts: { employees: 1, instances: 2, documents: 3, stockMovements: 4 },
        ...overrides,
      };
      await writeFile(`${dump}.json`, JSON.stringify(manifest));
      await writeFile(`${dump}.sha256`, `${sha256}  ${fileName}\n`);
      return dump;
    }

    const valid = await createSet('100000', '2026-08-21T10:00:00.000Z');
    await createSet('110000', '2026-08-21T11:00:00.000Z', {
      recoveryFenceConfigured: false,
    });
    const commonPath = quotePowerShell(path.join(repositoryRoot, 'scripts', 'recovery-common.ps1'));
    const command = [
      `. '${commonPath}'`,
      `$expected = Get-Content -LiteralPath '${quotePowerShell(expectedPath)}' -Raw | ConvertFrom-Json`,
      `$candidate = Select-RecoveryCandidate -BackupRoot '${quotePowerShell(root)}' -ExpectedRelease $expected -ExpectedClusterId 'cluster-a' -ExpectedActiveNodeId 'pc1' -ExpectedEpoch 1`,
      '$candidate.BackupFile',
    ].join('; ');
    const result = spawnSync(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { cwd: repositoryRoot, encoding: 'utf8' },
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(path.resolve(result.stdout.trim()), path.resolve(valid));
  },
);

test(
  'promotion требует два разных witness и частичный сбой не создаёт кворум',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'workwear-recovery-witness-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const first = path.join(root, 'pc2', 'promotion.json');
    const second = path.join(root, 'pc3', 'promotion.json');
    const commonPath = quotePowerShell(path.join(repositoryRoot, 'scripts', 'recovery-common.ps1'));
    const successCommand = [
      `. '${commonPath}'`,
      `Commit-PromotionWitness -WitnessPaths @('${quotePowerShell(first)}','${quotePowerShell(second)}') -WitnessNodeIds @('pc2','pc3') -ClusterId 'cluster-a' -Epoch 1 -ActiveNodeId 'pc2' | ConvertTo-Json -Compress`,
    ].join('; ');
    const success = spawnSync(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', successCommand],
      { cwd: repositoryRoot, encoding: 'utf8' },
    );
    assert.equal(success.status, 0, `${success.stdout}\n${success.stderr}`);
    assert.equal(JSON.parse(await readFile(first, 'utf8')).status, 'committed');
    assert.equal(JSON.parse(await readFile(second, 'utf8')).status, 'committed');

    const partialFirst = path.join(root, 'partial-pc2', 'promotion.json');
    const blockedParent = path.join(root, 'blocked-parent');
    await writeFile(blockedParent, 'not a directory');
    const partialSecond = path.join(blockedParent, 'promotion.json');
    const failureCommand = [
      `. '${commonPath}'`,
      `Commit-PromotionWitness -WitnessPaths @('${quotePowerShell(partialFirst)}','${quotePowerShell(partialSecond)}') -WitnessNodeIds @('pc2','pc3') -ClusterId 'cluster-a' -Epoch 2 -ActiveNodeId 'pc2'`,
    ].join('; ');
    const failure = spawnSync(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', failureCommand],
      { cwd: repositoryRoot, encoding: 'utf8' },
    );
    assert.notEqual(failure.status, 0);
    assert.equal(JSON.parse(await readFile(partialFirst, 'utf8')).status, 'preparing');
  },
);

test(
  'witness ACL на реальной NTFS отклоняет AppendData недоверенного SID',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'workwear-witness-acl-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const commonPath = quotePowerShell(
      path.join(repositoryRoot, 'deploy', 'windows', 'common.ps1'),
    );
    const command = [
      `. '${commonPath}'`,
      `$path='${quotePowerShell(root)}'`,
      '$current=[Security.Principal.WindowsIdentity]::GetCurrent().User',
      '$system=[Security.Principal.SecurityIdentifier]::new("S-1-5-18")',
      '$admins=[Security.Principal.SecurityIdentifier]::new("S-1-5-32-544")',
      '$acl=New-Object Security.AccessControl.DirectorySecurity',
      '$acl.SetOwner($current)',
      '$acl.SetAccessRuleProtection($true,$false)',
      'foreach($sid in @($current,$system,$admins)){[void]$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.InheritanceFlags]"ContainerInherit, ObjectInherit",[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow)))}',
      '$everyone=[Security.Principal.SecurityIdentifier]::new("S-1-1-0")',
      '[void]$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($everyone,[Security.AccessControl.FileSystemRights]::AppendData,[Security.AccessControl.AccessControlType]::Allow)))',
      'Set-Acl -LiteralPath $path -AclObject $acl',
      '$allowed=@($current.Value,$system.Value,$admins.Value)',
      'try { Assert-RecoveryWitnessAcl -Path $path -AllowedSids $allowed; exit 9 } catch { "blocked" }',
    ].join('; ');
    const result = spawnSync(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { cwd: repositoryRoot, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /blocked/);
  },
);

test(
  'Windows PowerShell 5.1 читает UTF-8 env с кириллическим путём',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'workwear-env-utf8-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const envPath = path.join(root, '.env');
    await writeFile(envPath, 'BACKUP_ROOT=C:\\РЖД\\Копии\n', 'utf8');
    const commonPath = quotePowerShell(path.join(repositoryRoot, 'scripts', 'backup-common.ps1'));
    const command = [
      `. '${commonPath}'`,
      `$values=Read-DotEnvFile -Path '${quotePowerShell(envPath)}'`,
      'if($values.BACKUP_ROOT -ne "C:\\РЖД\\Копии"){exit 8}',
    ].join('; ');
    const result = spawnSync(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { cwd: repositoryRoot, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  },
);

test(
  'пустой путь sentinel из standalone-установщика не включает кластерный режим',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'workwear-no-sentinel-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const missing = path.join(root, 'cluster-mode.json');
    const commonPath = quotePowerShell(path.join(repositoryRoot, 'scripts', 'recovery-common.ps1'));
    const command = [
      `. '${commonPath}'`,
      `$values=@{RECOVERY_SENTINEL_PATH='${quotePowerShell(missing)}';RECOVERY_STATE_ROOT='${quotePowerShell(root)}'}`,
      '$result=Get-RecoveryClusterSentinel -EnvironmentValues $values',
      'if($null -ne $result){exit 7}',
    ].join('; ');
    const result = spawnSync(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { cwd: repositoryRoot, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  },
);

test(
  'PowerShell релиза П синтаксически совместим с Windows PowerShell 5.1',
  { skip: process.platform !== 'win32' },
  async () => {
    const files = [
      'scripts/recovery-common.ps1',
      'scripts/emergency-recover.ps1',
      'deploy/windows/prepare-reserve.ps1',
      'deploy/windows/emergency-recovery-ui.ps1',
    ];
    const command = files
      .map(
        (file) =>
          `$tokens=$null;$errors=$null;[Management.Automation.Language.Parser]::ParseFile('${quotePowerShell(path.join(repositoryRoot, file))}',[ref]$tokens,[ref]$errors)|Out-Null;if($errors){$errors|% Message;exit 1}`,
      )
      .join(';');
    const result = spawnSync(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  },
);
