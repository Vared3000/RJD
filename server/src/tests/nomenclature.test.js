// Требует применённых миграций и сида (pnpm db:migrate && pnpm db:seed).
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

test('номенклатура: модель -> размер -> экземпляр с автогенерацией инв. номера', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = Date.now();

  // Тест создаёт реальные записи в dev-БД (не в транзакции) — подчищаем за
  // собой, иначе инвентарные номера/данные копятся между запусками.
  const createdInstanceIds = [];
  t.after(async () => {
    if (createdInstanceIds.length > 0) {
      await models.Instance.destroy({ where: { id: createdInstanceIds } });
    }
    await models.NomenclatureModel.destroy({ where: { name: `Test Model ${unique}` } });
    await models.Size.destroy({ where: { value: `TEST-${unique}` } });
  });

  const model = await auth(agent.post('/api/v1/nomenclature-models')).send({
    name: `Test Model ${unique}`,
    sizeType: 'clothing',
  });
  assert.equal(model.status, 201);

  const size = await auth(agent.post('/api/v1/sizes')).send({
    type: 'clothing',
    value: `TEST-${unique}`,
  });
  assert.equal(size.status, 201);

  const instance1 = await auth(agent.post('/api/v1/instances')).send({
    modelId: model.body.data.id,
    sizeId: size.body.data.id,
  });
  assert.equal(instance1.status, 201);
  createdInstanceIds.push(instance1.body.data.id);
  assert.match(instance1.body.data.inventoryNumber, /^СО-\d{6}$/);
  assert.equal(instance1.body.data.barcode, instance1.body.data.inventoryNumber);
  assert.equal(instance1.body.data.status, 'in_stock');
  assert.equal(instance1.body.data.condition, 'new');

  const instance2 = await auth(agent.post('/api/v1/instances')).send({
    modelId: model.body.data.id,
    sizeId: size.body.data.id,
  });
  createdInstanceIds.push(instance2.body.data.id);
  assert.notEqual(instance2.body.data.inventoryNumber, instance1.body.data.inventoryNumber);

  const withBadModel = await auth(agent.post('/api/v1/instances')).send({
    modelId: '00000000-0000-0000-0000-000000000000',
    sizeId: size.body.data.id,
  });
  assert.equal(withBadModel.status, 400);

  const fetched = await auth(agent.get(`/api/v1/instances/${instance1.body.data.id}`));
  assert.equal(fetched.body.data.model.id, model.body.data.id);
  assert.equal(fetched.body.data.size.id, size.body.data.id);

  const byBarcode = await auth(agent.get(`/api/v1/barcodes/${instance1.body.data.barcode}`));
  assert.equal(byBarcode.status, 200);
  assert.equal(byBarcode.body.data.id, instance1.body.data.id);

  for (const labelType of ['qr', 'code128']) {
    const labels = await auth(agent.post('/api/v1/barcodes/labels')).send({
      instanceIds: [instance1.body.data.id, instance2.body.data.id],
      labelType,
    });
    assert.equal(labels.status, 200);
    assert.equal(labels.headers['content-type'], 'application/pdf');
    assert.equal(Buffer.from(labels.body).subarray(0, 4).toString(), '%PDF');
  }

  const invalidPage = await auth(agent.get('/api/v1/instances?page=0'));
  assert.equal(invalidPage.status, 400);

  const page = await auth(agent.get('/api/v1/instances?page=1&limit=1'));
  assert.equal(page.status, 200);
  assert.equal(page.body.data.length, 1);
  assert.equal(page.body.meta.limit, 1);
  assert.ok(page.body.meta.total >= 2);

  const updated = await auth(agent.patch(`/api/v1/instances/${instance1.body.data.id}`)).send({
    status: 'repair',
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.status, 'repair');

  const history = await auth(agent.get(`/api/v1/instances/${instance1.body.data.id}/history`));
  assert.equal(history.status, 200);
  assert.equal(history.body.data.length, 2);
  assert.equal(history.body.data[0].eventType, 'adjustment');
  assert.equal(history.body.data[0].details.action, 'manual_create');
  assert.equal(history.body.data[1].fromStatus, 'in_stock');
  assert.equal(history.body.data[1].toStatus, 'repair');
  assert.deepEqual(history.body.data[1].details.changedFields, ['status']);
});
