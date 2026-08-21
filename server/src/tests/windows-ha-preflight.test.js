import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function read(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8');
}

test('HA preflight остаётся read-only и не выдаёт автоматические проверки за приёмку', async () => {
  const preflight = await read('deploy/ha/preflight.mjs');
  const wrapper = await read('deploy/ha/preflight.ps1');
  const guide = await read('docs/WINDOWS_HA_PREFLIGHT.md');

  assert.match(preflight, /synchronous_mode !== 'quorum'/);
  assert.match(preflight, /synchronous_node_count\) !== 1/);
  assert.match(preflight, /synchronous_mode_strict !== true/);
  assert.match(preflight, /leaders\.length !== 1 \|\| replicas\.length !== 2/);
  assert.match(preflight, /automatic-checks-passed-physical-pending/);
  assert.match(preflight, /flag: 'wx'/);
  assert.doesNotMatch(preflight, /child_process|exec\(|spawn\(|rmSync|unlink|Remove-Item/);
  assert.match(wrapper, /--env-file-if-exists=/);
  assert.match(guide, /WORKWEAR_HA_MODE=disabled/);
  assert.match(guide, /не повторяет POST\/PUT\/PATCH\/DELETE/);
});

test('frontend повторяет только безопасные чтения и явно показывает переподключение', async () => {
  const client = await read('client/src/shared/api/http-client.js');
  const layout = await read('client/src/widgets/layout/AppLayout.jsx');

  assert.match(client, /retryableMethods = new Set\(\['get', 'head', 'options'\]\)/);
  assert.match(client, /HA_RETRY_WINDOW_MS = 120_000/);
  assert.match(client, /if \(!retryableMethods\.has\(method\)\) return Promise\.reject/);
  assert.match(layout, /Восстанавливается соединение…/);
});

test(
  'PowerShell-оболочка HA preflight совместима с Windows PowerShell 5.1 и UTF-8 BOM',
  { skip: process.platform !== 'win32' },
  async () => {
    const relativePath = 'deploy/ha/preflight.ps1';
    const fullPath = path.join(repositoryRoot, relativePath);
    const bytes = await readFile(fullPath);
    assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    const quoted = fullPath.replaceAll("'", "''");
    const command = [
      '$tokens=$null; $errors=$null',
      `[void][Management.Automation.Language.Parser]::ParseFile('${quoted}',[ref]$tokens,[ref]$errors)`,
      'if($errors.Count){$errors | ForEach-Object {$_.Message}; exit 1}',
    ].join('; ');
    const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', command], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  },
);
