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

test('выдача: автоподбор комплекта -> проведение -> возврат, с защитой от нехватки остатка и двойного возврата', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `Test Issuance ${Date.now()}`;

  const state = { instanceIds: [], issuanceDocIds: [], returnDocIds: [], receivingDocIds: [], batchIds: [] };
  t.after(async () => {
    if (state.instanceIds.length > 0) {
      await models.StockMovement.destroy({ where: { instanceId: state.instanceIds } });
    }
    if (state.returnDocIds.length > 0) {
      await models.ReturnDocument.destroy({ where: { id: state.returnDocIds } });
    }
    if (state.issuanceDocIds.length > 0) {
      await models.IssuanceDocument.destroy({ where: { id: state.issuanceDocIds } });
    }
    if (state.instanceIds.length > 0) {
      await models.Instance.destroy({ where: { id: state.instanceIds } });
    }
    if (state.receivingDocIds.length > 0) {
      await models.ReceivingDocument.destroy({ where: { id: state.receivingDocIds } });
    }
    if (state.batchIds.length > 0) {
      await models.Batch.destroy({ where: { id: state.batchIds } });
    }
    await models.Employee.destroy({ where: { fullName: unique } });
    const position = await models.Position.findOne({ where: { name: unique } });
    if (position) {
      await models.PositionKitItem.destroy({ where: { positionId: position.id } });
    }
    await models.Position.destroy({ where: { name: unique } });
    await models.NomenclatureModel.destroy({ where: { name: unique } });
    await models.Size.destroy({ where: { value: unique } });
    await models.Warehouse.destroy({ where: { name: unique } });
    await models.Supplier.destroy({ where: { name: unique } });
    await models.Organization.destroy({ where: { name: unique } });
  });

  const org = await auth(agent.post('/api/v1/organizations')).send({ name: unique });
  const organizationId = org.body.data.id;
  const warehouse = await auth(agent.post('/api/v1/warehouses')).send({
    organizationId,
    name: unique,
  });
  const warehouseId = warehouse.body.data.id;
  const supplier = await auth(agent.post('/api/v1/suppliers')).send({ name: unique });
  const size = await auth(agent.post('/api/v1/sizes')).send({ type: 'clothing', value: unique });
  const sizeId = size.body.data.id;
  const model = await auth(agent.post('/api/v1/nomenclature-models')).send({
    name: unique,
    sizeType: 'clothing',
  });
  const modelId = model.body.data.id;
  const position = await auth(agent.post('/api/v1/positions')).send({ name: unique });
  const positionId = position.body.data.id;
  const employee = await auth(agent.post('/api/v1/employees')).send({
    organizationId,
    positionId,
    fullName: unique,
    hireDate: '2022-01-10',
    clothingSizeId: sizeId,
  });
  const employeeId = employee.body.data.id;

  // Комплект по должности: 2 единицы модели.
  const kitItem = await auth(agent.post('/api/v1/kits')).send({
    positionId,
    modelId,
    quantity: 2,
  });
  assert.equal(kitItem.status, 201);

  // Комплект отклоняет модель без sizeType.
  const modelNoType = await auth(agent.post('/api/v1/nomenclature-models')).send({
    name: `${unique} no-type`,
  });
  t.after(() => models.NomenclatureModel.destroy({ where: { name: `${unique} no-type` } }));
  const kitRejected = await auth(agent.post('/api/v1/kits')).send({
    positionId,
    modelId: modelNoType.body.data.id,
  });
  assert.equal(kitRejected.status, 400);

  // Оприходуем 2 экземпляра.
  const receivingDraft = await auth(agent.post('/api/v1/purchases/receiving')).send({
    supplierId: supplier.body.data.id,
    warehouseId,
    documentDate: '2026-07-01',
  });
  const receivingId = receivingDraft.body.data.id;
  state.receivingDocIds.push(receivingId);
  await auth(agent.post(`/api/v1/purchases/receiving/${receivingId}/lines`)).send({
    modelId,
    sizeId,
    quantity: 2,
    purchasePrice: 1500,
  });
  const receivingPosted = await auth(agent.post(`/api/v1/purchases/receiving/${receivingId}/post`));
  assert.equal(receivingPosted.status, 200);
  state.batchIds.push(receivingPosted.body.data.batchId);
  const instances = await models.Instance.findAll({ where: { modelId } });
  state.instanceIds.push(...instances.map((i) => i.id));

  // Документ "Выдача": автоподбор комплекта.
  const issuanceDraft = await auth(agent.post('/api/v1/issuance/documents')).send({
    employeeId,
    warehouseId,
    documentDate: '2026-07-29',
  });
  assert.equal(issuanceDraft.status, 201);
  assert.match(issuanceDraft.body.data.number, /^В-\d{6}$/);
  const issuanceId = issuanceDraft.body.data.id;
  state.issuanceDocIds.push(issuanceId);

  const applied = await auth(agent.post(`/api/v1/issuance/documents/${issuanceId}/apply-kit`));
  assert.equal(applied.status, 200);
  assert.equal(applied.body.data.lines.length, 1);
  assert.equal(applied.body.data.lines[0].quantity, 2);
  assert.equal(applied.body.data.lines[0].sizeId, sizeId);
  assert.deepEqual(applied.body.meta.skipped, []);

  const issuancePosted = await auth(agent.post(`/api/v1/issuance/documents/${issuanceId}/post`));
  assert.equal(issuancePosted.status, 200);
  assert.equal(issuancePosted.body.data.status, 'posted');

  const issuedInstances = await models.Instance.findAll({ where: { id: state.instanceIds } });
  for (const instance of issuedInstances) {
    assert.equal(instance.status, 'issued');
    assert.equal(instance.employeeId, employeeId);
    assert.equal(instance.warehouseId, null);
  }

  const issuanceMovements = await models.StockMovement.findAll({
    where: { documentId: issuanceId, documentType: 'issuance' },
  });
  assert.equal(issuanceMovements.length, 2);
  for (const movement of issuanceMovements) {
    assert.equal(movement.fromWarehouseId, warehouseId);
    assert.equal(movement.toWarehouseId, null);
  }

  // Недостаточно остатка: третий экземпляр того же модели/размера уже не в наличии.
  const shortageDraft = await auth(agent.post('/api/v1/issuance/documents')).send({
    employeeId,
    warehouseId,
    documentDate: '2026-07-29',
  });
  const shortageId = shortageDraft.body.data.id;
  await auth(agent.post(`/api/v1/issuance/documents/${shortageId}/lines`)).send({
    modelId,
    sizeId,
    quantity: 1,
  });
  const shortagePost = await auth(agent.post(`/api/v1/issuance/documents/${shortageId}/post`));
  assert.equal(shortagePost.status, 400, 'проведение при нехватке остатка должно быть отклонено');
  await auth(agent.delete(`/api/v1/issuance/documents/${shortageId}`));

  // Документ "Возврат": берём один из выданных экземпляров.
  const available = await auth(
    agent.get(`/api/v1/issuance/returns/available?employeeId=${employeeId}`),
  );
  assert.equal(available.status, 200);
  assert.equal(available.body.data.length, 2);
  const instanceToReturn = available.body.data[0].id;

  const returnDraft = await auth(agent.post('/api/v1/issuance/returns')).send({
    employeeId,
    warehouseId,
    documentDate: '2026-07-29',
  });
  assert.match(returnDraft.body.data.number, /^ВЗ-\d{6}$/);
  const returnId = returnDraft.body.data.id;
  state.returnDocIds.push(returnId);

  await auth(agent.post(`/api/v1/issuance/returns/${returnId}/lines`)).send({
    instanceId: instanceToReturn,
    condition: 'good',
  });
  const returnPosted = await auth(agent.post(`/api/v1/issuance/returns/${returnId}/post`));
  assert.equal(returnPosted.status, 200);

  const returnedInstance = await models.Instance.findByPk(instanceToReturn);
  assert.equal(returnedInstance.status, 'in_stock');
  assert.equal(returnedInstance.employeeId, null);
  assert.equal(returnedInstance.warehouseId, warehouseId);
  assert.equal(returnedInstance.condition, 'good');

  const returnMovements = await models.StockMovement.findAll({
    where: { documentId: returnId, documentType: 'return' },
  });
  assert.equal(returnMovements.length, 1);
  assert.equal(returnMovements[0].fromWarehouseId, null);
  assert.equal(returnMovements[0].toWarehouseId, warehouseId);

  // Повторный возврат того же экземпляра должен быть отклонён (уже не issued).
  const doubleReturnDraft = await auth(agent.post('/api/v1/issuance/returns')).send({
    employeeId,
    warehouseId,
    documentDate: '2026-07-29',
  });
  const doubleReturnId = doubleReturnDraft.body.data.id;
  state.returnDocIds.push(doubleReturnId);
  await auth(agent.post(`/api/v1/issuance/returns/${doubleReturnId}/lines`)).send({
    instanceId: instanceToReturn,
    condition: 'good',
  });
  const doubleReturnPost = await auth(agent.post(`/api/v1/issuance/returns/${doubleReturnId}/post`));
  assert.equal(doubleReturnPost.status, 400, 'повторный возврат уже возвращённого экземпляра должен быть отклонён');
});
