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

test('партии: постраничный реестр, поиск, агрегаты и карточка с экземплярами', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `Test Batch ${Date.now()}`;
  const state = {
    organizationId: null,
    warehouseId: null,
    supplierId: null,
    sizeId: null,
    modelId: null,
    documentIds: [],
    batchIds: [],
    instanceIds: [],
  };

  t.after(async () => {
    if (state.instanceIds.length) {
      await models.InstanceEvent.destroy({ where: { instanceId: state.instanceIds } });
      await models.StockMovement.destroy({ where: { instanceId: state.instanceIds } });
      await models.Instance.destroy({ where: { id: state.instanceIds } });
    }
    if (state.documentIds.length) {
      await models.ReceivingDocument.destroy({ where: { id: state.documentIds } });
    }
    if (state.batchIds.length) await models.Batch.destroy({ where: { id: state.batchIds } });
    if (state.modelId) await models.NomenclatureModel.destroy({ where: { id: state.modelId } });
    if (state.sizeId) await models.Size.destroy({ where: { id: state.sizeId } });
    if (state.warehouseId) await models.Warehouse.destroy({ where: { id: state.warehouseId } });
    if (state.supplierId) await models.Supplier.destroy({ where: { id: state.supplierId } });
    if (state.organizationId) {
      await models.Organization.destroy({ where: { id: state.organizationId } });
    }
  });

  const organization = await auth(agent.post('/api/v1/organizations')).send({ name: unique });
  state.organizationId = organization.body.data.id;
  const warehouse = await auth(agent.post('/api/v1/warehouses')).send({
    organizationId: state.organizationId,
    name: unique,
  });
  state.warehouseId = warehouse.body.data.id;
  const supplierName = `${unique} Supplier`;
  const supplier = await auth(agent.post('/api/v1/suppliers')).send({ name: supplierName });
  state.supplierId = supplier.body.data.id;
  const size = await auth(agent.post('/api/v1/sizes')).send({
    type: 'clothing',
    value: unique,
  });
  state.sizeId = size.body.data.id;
  const model = await auth(agent.post('/api/v1/nomenclature-models')).send({
    name: unique,
    sizeType: 'clothing',
  });
  state.modelId = model.body.data.id;

  async function postReceiving(suffix, quantity) {
    const draft = await auth(agent.post('/api/v1/purchases/receiving')).send({
      supplierId: state.supplierId,
      warehouseId: state.warehouseId,
      documentDate: `2026-08-${suffix === 'A' ? '10' : '11'}`,
      note: `${unique} ${suffix}`,
    });
    state.documentIds.push(draft.body.data.id);
    await auth(agent.post(`/api/v1/purchases/receiving/${draft.body.data.id}/lines`)).send({
      modelId: state.modelId,
      sizeId: state.sizeId,
      quantity,
      purchasePrice: 1250,
    });
    const posted = await auth(agent.post(`/api/v1/purchases/receiving/${draft.body.data.id}/post`));
    assert.equal(posted.status, 200);
    state.batchIds.push(posted.body.data.batchId);
    const instances = await models.Instance.findAll({
      where: { batchId: posted.body.data.batchId },
    });
    state.instanceIds.push(...instances.map((instance) => instance.id));
    return { document: posted.body.data, instances };
  }

  const first = await postReceiving('A', 2);
  await postReceiving('B', 1);

  const page = await auth(agent.get('/api/v1/batches')).query({
    search: unique,
    page: 1,
    limit: 1,
    sort: 'receivedDate',
    order: 'ASC',
  });
  assert.equal(page.status, 200);
  assert.equal(page.body.data.length, 1);
  assert.equal(page.body.meta.total, 2);
  assert.equal(page.body.meta.pages, 2);
  assert.equal(page.body.data[0].initialQuantity, 2);
  assert.equal(page.body.data[0].inStock, 2);
  assert.equal(page.body.data[0].initialCost, undefined);
  assert.equal(page.body.data[0].receivingDocument.id, first.document.id);

  const bySupplier = await auth(agent.get('/api/v1/batches')).query({ search: supplierName });
  assert.equal(bySupplier.status, 200);
  assert.equal(bySupplier.body.meta.total, 2);

  const detail = await auth(agent.get(`/api/v1/batches/${first.document.batchId}`)).query({
    page: 1,
    limit: 1,
    search: first.instances[0].inventoryNumber,
  });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.receivingDocument.id, first.document.id);
  assert.equal(detail.body.data.initialQuantity, 2);
  assert.equal(detail.body.data.instances.length, 1);
  assert.equal(detail.body.data.instances[0].model.id, state.modelId);
  assert.equal(detail.body.data.instances[0].cost, undefined);
  assert.equal(detail.body.meta.instances.total, 1);
  assert.equal(detail.body.meta.instances.limit, 1);

  const missing = await auth(agent.get('/api/v1/batches/00000000-0000-0000-0000-000000000000'));
  assert.equal(missing.status, 404);
});
