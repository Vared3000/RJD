// Требует применённых миграций и сида (pnpm db:migrate && pnpm db:seed).
// Проверяет общую фабрику reference-crud.factory.js на примере организаций
// (базовый CRUD + архивирование) и подразделений (+ проверка внешнего ключа).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { models } from '../database/models/index.js';

async function loginAsAdmin(agent) {
  const res = await agent
    .post('/api/v1/auth/login')
    .send({ login: env.BOOTSTRAP_ADMIN_LOGIN, password: env.BOOTSTRAP_ADMIN_PASSWORD });
  return res.body.data.accessToken;
}

test('справочники: организации — create/list/archive/restore + уникальность имени', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const uniqueName = `Test Org ${Date.now()}`;
  t.after(() => models.Organization.destroy({ where: { name: uniqueName } }));

  const created = await auth(agent.post('/api/v1/organizations')).send({ name: uniqueName });
  assert.equal(created.status, 201);
  const orgId = created.body.data.id;

  const duplicate = await auth(agent.post('/api/v1/organizations')).send({ name: uniqueName });
  assert.equal(duplicate.status, 409);

  const listed = await auth(agent.get('/api/v1/organizations'));
  assert.ok(listed.body.data.some((item) => item.id === orgId));

  const archived = await auth(agent.delete(`/api/v1/organizations/${orgId}`));
  assert.equal(archived.status, 200);

  const listAfterArchive = await auth(agent.get('/api/v1/organizations'));
  assert.ok(!listAfterArchive.body.data.some((item) => item.id === orgId));

  const listWithArchived = await auth(agent.get('/api/v1/organizations?includeArchived=true'));
  assert.ok(listWithArchived.body.data.some((item) => item.id === orgId));

  const restored = await auth(agent.patch(`/api/v1/organizations/${orgId}/restore`));
  assert.equal(restored.status, 200);

  const listAfterRestore = await auth(agent.get('/api/v1/organizations'));
  assert.ok(listAfterRestore.body.data.some((item) => item.id === orgId));
});

test('справочники: подразделение отклоняется с несуществующей организацией', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);

  const res = await auth(agent.post('/api/v1/subdivisions')).send({
    organizationId: '00000000-0000-0000-0000-000000000000',
    name: 'Тестовое подразделение',
  });
  assert.equal(res.status, 400);
});
