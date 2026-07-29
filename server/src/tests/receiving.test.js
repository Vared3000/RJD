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

test('поступление: черновик -> строки -> проведение создаёт партию/экземпляры/движения', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = Date.now();

  const state = { instanceIds: [], documentIds: [], batchIds: [] };
  t.after(async () => {
    if (state.instanceIds.length > 0) {
      await models.StockMovement.destroy({ where: { instanceId: state.instanceIds } });
      await models.Instance.destroy({ where: { id: state.instanceIds } });
    }
    if (state.documentIds.length > 0) {
      await models.ReceivingDocument.destroy({ where: { id: state.documentIds } });
    }
    if (state.batchIds.length > 0) {
      await models.Batch.destroy({ where: { id: state.batchIds } });
    }
    await models.Warehouse.destroy({ where: { name: `Test WH ${unique}` } });
    await models.Supplier.destroy({ where: { name: `Test Supplier ${unique}` } });
    await models.NomenclatureModel.destroy({ where: { name: `Test Model ${unique}` } });
    await models.Size.destroy({ where: { value: `TEST-${unique}` } });
    await models.Organization.destroy({ where: { name: `Test Org ${unique}` } });
  });

  const org = await auth(agent.post('/api/v1/organizations')).send({ name: `Test Org ${unique}` });
  const warehouse = await auth(agent.post('/api/v1/warehouses')).send({
    organizationId: org.body.data.id,
    name: `Test WH ${unique}`,
  });
  const supplier = await auth(agent.post('/api/v1/suppliers')).send({
    name: `Test Supplier ${unique}`,
  });
  const model = await auth(agent.post('/api/v1/nomenclature-models')).send({
    name: `Test Model ${unique}`,
  });
  const size = await auth(agent.post('/api/v1/sizes')).send({
    type: 'clothing',
    value: `TEST-${unique}`,
  });

  const draft = await auth(agent.post('/api/v1/purchases/receiving')).send({
    supplierId: supplier.body.data.id,
    warehouseId: warehouse.body.data.id,
    documentDate: '2026-01-15',
  });
  assert.equal(draft.status, 201);
  assert.equal(draft.body.data.status, 'draft');
  assert.match(draft.body.data.number, /^П-\d{6}$/);
  const documentId = draft.body.data.id;
  state.documentIds.push(documentId);

  const postEmpty = await auth(agent.post(`/api/v1/purchases/receiving/${documentId}/post`));
  assert.equal(postEmpty.status, 400, 'проведение документа без строк должно быть отклонено');

  const lineRes = await auth(agent.post(`/api/v1/purchases/receiving/${documentId}/lines`)).send({
    modelId: model.body.data.id,
    sizeId: size.body.data.id,
    quantity: 3,
    purchasePrice: 1500,
    employeeCost: 500,
  });
  assert.equal(lineRes.status, 201);
  assert.equal(lineRes.body.data.lines.length, 1);

  const posted = await auth(agent.post(`/api/v1/purchases/receiving/${documentId}/post`));
  assert.equal(posted.status, 200);
  assert.equal(posted.body.data.status, 'posted');
  assert.ok(posted.body.data.batch?.code);
  state.batchIds.push(posted.body.data.batchId);

  const instances = await models.Instance.findAll({ where: { modelId: model.body.data.id } });
  assert.equal(instances.length, 3, 'должно быть создано ровно 3 экземпляра (по количеству)');
  state.instanceIds.push(...instances.map((i) => i.id));
  for (const instance of instances) {
    assert.equal(instance.warehouseId, warehouse.body.data.id);
    assert.equal(instance.status, 'in_stock');
    assert.equal(Number(instance.cost), 1500);
    assert.equal(Number(instance.employeeCost), 500);
    assert.equal(instance.batchId, posted.body.data.batchId);
  }

  const movements = await models.StockMovement.findAll({
    where: { documentId, documentType: 'receiving' },
  });
  assert.equal(movements.length, 3, 'на каждый созданный экземпляр — своё движение склада');
  for (const movement of movements) {
    assert.equal(movement.fromWarehouseId, null);
    assert.equal(movement.toWarehouseId, warehouse.body.data.id);
  }

  const editAfterPost = await auth(agent.patch(`/api/v1/purchases/receiving/${documentId}`)).send({
    note: 'x',
  });
  assert.equal(
    editAfterPost.status,
    400,
    'редактирование проведённого документа должно быть отклонено',
  );

  const deleteAfterPost = await auth(agent.delete(`/api/v1/purchases/receiving/${documentId}`));
  assert.equal(
    deleteAfterPost.status,
    400,
    'удаление проведённого документа должно быть отклонено',
  );

  const doublePost = await auth(agent.post(`/api/v1/purchases/receiving/${documentId}/post`));
  assert.equal(doublePost.status, 400, 'повторное проведение должно быть отклонено');
});

test('поступление: черновик без строк можно удалить', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = Date.now();

  t.after(async () => {
    await models.Warehouse.destroy({ where: { name: `Test WH del ${unique}` } });
    await models.Supplier.destroy({ where: { name: `Test Supplier del ${unique}` } });
    await models.Organization.destroy({ where: { name: `Test Org del ${unique}` } });
  });

  const org = await auth(agent.post('/api/v1/organizations')).send({
    name: `Test Org del ${unique}`,
  });
  const warehouse = await auth(agent.post('/api/v1/warehouses')).send({
    organizationId: org.body.data.id,
    name: `Test WH del ${unique}`,
  });
  const supplier = await auth(agent.post('/api/v1/suppliers')).send({
    name: `Test Supplier del ${unique}`,
  });

  const draft = await auth(agent.post('/api/v1/purchases/receiving')).send({
    supplierId: supplier.body.data.id,
    warehouseId: warehouse.body.data.id,
    documentDate: '2026-01-15',
  });

  const del = await auth(agent.delete(`/api/v1/purchases/receiving/${draft.body.data.id}`));
  assert.equal(del.status, 200);

  const getAfterDelete = await auth(agent.get(`/api/v1/purchases/receiving/${draft.body.data.id}`));
  assert.equal(getAfterDelete.status, 404);
});
