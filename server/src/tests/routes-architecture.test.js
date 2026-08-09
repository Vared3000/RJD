import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const modulesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../modules');

async function findRouteFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findRouteFiles(entryPath);
      return entry.isFile() && entry.name.endsWith('.routes.js') ? [entryPath] : [];
    }),
  );
  return nested.flat();
}

test('route-файлы не содержат бизнес-логику и доступ к Sequelize', async () => {
  const routeFiles = await findRouteFiles(modulesRoot);
  assert.ok(routeFiles.length > 0);

  for (const routeFile of routeFiles) {
    const content = await readFile(routeFile, 'utf8');
    const relativePath = path.relative(modulesRoot, routeFile);
    const message = `${relativePath} должен оставаться тонким HTTP-слоем`;

    assert.doesNotMatch(content, /database\/models|\.model\.js/, message);
    assert.doesNotMatch(content, /\.service\.js|\.repository\.js/, message);
    assert.doesNotMatch(
      content,
      /\.(findAll|findOne|findByPk|findAndCountAll|create|update|destroy|bulkCreate)\s*\(/,
      message,
    );
    assert.doesNotMatch(content, /asyncHandler\s*\(\s*async\b/, message);
    assert.doesNotMatch(content, /createReferenceModule|createServiceDocumentModule/, message);
  }
});
