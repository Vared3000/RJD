import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('LAN deployment публикует только frontend на явно заданном адресе', async () => {
  const compose = await readFile(path.join(repositoryRoot, 'docker-compose.yml'), 'utf8');

  assert.doesNotMatch(compose, /['"]?5432:5432['"]?/);
  assert.doesNotMatch(compose, /['"]?4000:4000['"]?/);
  assert.match(compose, /LAN_BIND_ADDRESS[^\n]+:80:80/);
  assert.match(compose, /database:\s*\n\s+internal: true/);
});

test('reverse proxy передаёт API и healthcheck во внутренний backend', async () => {
  const nginx = await readFile(path.join(repositoryRoot, 'client', 'nginx.conf'), 'utf8');

  assert.match(nginx, /location \/api\//);
  assert.match(nginx, /location = \/health/);
  assert.match(nginx, /proxy_pass http:\/\/server:4000/);
});

test('эксплуатационные скрипты не содержат Cloudflare Tunnel', async () => {
  const deployDirectory = path.join(repositoryRoot, 'deploy');
  const files = await readdir(deployDirectory);
  assert.equal(
    files.some((file) => /tunnel/i.test(file)),
    false,
  );

  const launchScripts = files.filter(
    (name) => /\.(?:ps1|vbs)$/i.test(name) && name !== 'test-lan-mode.ps1',
  );
  for (const file of launchScripts) {
    const content = await readFile(path.join(deployDirectory, file), 'utf8');
    assert.doesNotMatch(content, /cloudflared|trycloudflare/i);
  }
});
