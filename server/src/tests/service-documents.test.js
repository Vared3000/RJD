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

test('стирка/ремонт: отправка -> завершение, дубли строк, и Возврат с routeTo в стирку', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `Test SvcDoc ${Date.now()}`;

  const state = {
    instanceIds: [],
    laundryDocIds: [],
    repairDocIds: [],
    issuanceDocIds: [],
    returnDocIds: [],
    receivingDocIds: [],
    batchIds: [],
  };
  t.after(async () => {
    if (state.instanceIds.length > 0) {
      await models.StockMovement.destroy({ where: { instanceId: state.instanceIds } });
    }
    if (state.laundryDocIds.length > 0) {
      await models.LaundryDocument.destroy({ where: { id: state.laundryDocIds } });
    }
    if (state.repairDocIds.length > 0) {
      await models.RepairDocument.destroy({ where: { id: state.repairDocIds } });
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

  // Оприходуем 4 экземпляра: 1 в стирку, 1 в ремонт, 1 запасной (дубль-тест), 1 для сценария Возврат-в-стирку.
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
    quantity: 4,
    purchasePrice: 1000,
  });
  const receivingPosted = await auth(agent.post(`/api/v1/purchases/receiving/${receivingId}/post`));
  assert.equal(receivingPosted.status, 200);
  state.batchIds.push(receivingPosted.body.data.batchId);
  const instances = await models.Instance.findAll({
    where: { modelId },
    order: [['createdAt', 'ASC']],
  });
  state.instanceIds.push(...instances.map((i) => i.id));
  const [laundryInstanceId, repairInstanceId, spareInstanceId] = instances.map((i) => i.id);

  // --- Стирка: отправка -> завершение ---
  const laundryDraft = await auth(agent.post('/api/v1/laundry/documents')).send({
    warehouseId,
    documentDate: '2026-07-29',
  });
  assert.equal(laundryDraft.status, 201);
  assert.match(laundryDraft.body.data.number, /^СТ-\d{6}$/);
  const laundryId = laundryDraft.body.data.id;
  state.laundryDocIds.push(laundryId);

  const laundryLine = await auth(agent.post(`/api/v1/laundry/documents/${laundryId}/lines`)).send({
    instanceId: laundryInstanceId,
  });
  assert.equal(laundryLine.status, 201);

  // Дубль той же позиции отклоняется.
  const laundryDupLine = await auth(
    agent.post(`/api/v1/laundry/documents/${laundryId}/lines`),
  ).send({ instanceId: laundryInstanceId });
  assert.equal(laundryDupLine.status, 400);

  const laundrySent = await auth(agent.post(`/api/v1/laundry/documents/${laundryId}/send`));
  assert.equal(laundrySent.status, 200);
  assert.equal(laundrySent.body.data.status, 'sent');

  const afterSend = await models.Instance.findByPk(laundryInstanceId);
  assert.equal(afterSend.status, 'laundry');

  // После отправки строки уже не добавить (документ не черновик).
  const laundryLineAfterSend = await auth(
    agent.post(`/api/v1/laundry/documents/${laundryId}/lines`),
  ).send({ instanceId: spareInstanceId });
  assert.equal(laundryLineAfterSend.status, 400);

  const sentLineId = laundrySent.body.data.lines[0].id;
  const laundryComplete = await auth(
    agent.post(`/api/v1/laundry/documents/${laundryId}/complete`),
  ).send({ lines: [{ lineId: sentLineId, conditionAfter: 'good' }] });
  assert.equal(laundryComplete.status, 200);
  assert.equal(laundryComplete.body.data.status, 'completed');

  const afterComplete = await models.Instance.findByPk(laundryInstanceId);
  assert.equal(afterComplete.status, 'in_stock');
  assert.equal(afterComplete.condition, 'good');
  assert.equal(afterComplete.warehouseId, warehouseId);

  const laundryMovements = await models.StockMovement.findAll({
    where: { documentId: laundryId, documentType: 'laundry' },
    order: [['occurredAt', 'ASC']],
  });
  assert.equal(laundryMovements.length, 2);
  assert.equal(laundryMovements[0].fromWarehouseId, warehouseId);
  assert.equal(laundryMovements[0].toWarehouseId, null);
  assert.equal(laundryMovements[1].fromWarehouseId, null);
  assert.equal(laundryMovements[1].toWarehouseId, warehouseId);

  // --- Ремонт: отправка -> завершение со стоимостью ремонта ---
  const repairDraft = await auth(agent.post('/api/v1/repair/documents')).send({
    warehouseId,
    documentDate: '2026-07-29',
  });
  assert.match(repairDraft.body.data.number, /^РМ-\d{6}$/);
  const repairId = repairDraft.body.data.id;
  state.repairDocIds.push(repairId);

  const repairLineRes = await auth(agent.post(`/api/v1/repair/documents/${repairId}/lines`)).send({
    instanceId: repairInstanceId,
  });
  assert.equal(repairLineRes.status, 201);

  const repairSent = await auth(agent.post(`/api/v1/repair/documents/${repairId}/send`));
  assert.equal(repairSent.status, 200);
  assert.equal((await models.Instance.findByPk(repairInstanceId)).status, 'repair');

  const repairLineId = repairSent.body.data.lines[0].id;
  const repairComplete = await auth(
    agent.post(`/api/v1/repair/documents/${repairId}/complete`),
  ).send({ lines: [{ lineId: repairLineId, conditionAfter: 'worn', cost: 350.5 }] });
  assert.equal(repairComplete.status, 200);

  const repairedInstance = await models.Instance.findByPk(repairInstanceId);
  assert.equal(repairedInstance.status, 'in_stock');
  assert.equal(repairedInstance.condition, 'worn');

  const repairLineRecord = await models.RepairLine.findByPk(repairLineId);
  assert.equal(Number(repairLineRecord.cost), 350.5);

  // Незавершённый список позиций при complete отклоняется (нужно указать все строки).
  const repairDraft2 = await auth(agent.post('/api/v1/repair/documents')).send({
    warehouseId,
    documentDate: '2026-07-29',
  });
  const repairId2 = repairDraft2.body.data.id;
  state.repairDocIds.push(repairId2);
  await auth(agent.post(`/api/v1/repair/documents/${repairId2}/lines`)).send({
    instanceId: spareInstanceId,
  });
  const repairSent2 = await auth(agent.post(`/api/v1/repair/documents/${repairId2}/send`));
  assert.equal(repairSent2.status, 200);
  const repairComplete2 = await auth(
    agent.post(`/api/v1/repair/documents/${repairId2}/complete`),
  ).send({ lines: [] });
  assert.equal(
    repairComplete2.status,
    400,
    'complete без всех позиций документа должен отклоняться',
  );
  // Уборка за собой: довершим документ корректно, чтобы не оставлять экземпляр в repair.
  const repairId2LineId = repairSent2.body.data.lines[0].id;
  await auth(agent.post(`/api/v1/repair/documents/${repairId2}/complete`)).send({
    lines: [{ lineId: repairId2LineId, conditionAfter: 'good' }],
  });

  // --- Возврат с routeTo: работник сдаёт вещь сразу в стирку, минуя склад ---
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
  t.after(() => models.Position.destroy({ where: { name: unique } }));

  const issuanceDraft = await auth(agent.post('/api/v1/issuance/documents')).send({
    employeeId,
    warehouseId,
    documentDate: '2026-07-29',
  });
  const issuanceId = issuanceDraft.body.data.id;
  state.issuanceDocIds.push(issuanceId);
  await auth(agent.post(`/api/v1/issuance/documents/${issuanceId}/lines`)).send({
    modelId,
    sizeId,
    quantity: 1,
  });
  const issuancePosted = await auth(agent.post(`/api/v1/issuance/documents/${issuanceId}/post`));
  assert.equal(issuancePosted.status, 200);

  const returnDraft = await auth(agent.post('/api/v1/issuance/returns')).send({
    employeeId,
    warehouseId,
    documentDate: '2026-07-29',
  });
  const returnId = returnDraft.body.data.id;
  state.returnDocIds.push(returnId);
  const returnedInstance = await models.Instance.findOne({
    where: { employeeId, status: 'issued' },
  });
  await auth(agent.post(`/api/v1/issuance/returns/${returnId}/lines`)).send({
    instanceId: returnedInstance.id,
    condition: 'worn',
    routeTo: 'laundry',
  });
  const returnPosted = await auth(agent.post(`/api/v1/issuance/returns/${returnId}/post`));
  assert.equal(returnPosted.status, 200);

  const routedInstance = await models.Instance.findByPk(returnedInstance.id);
  assert.equal(
    routedInstance.status,
    'laundry',
    'routeTo=laundry должен направить экземпляр в стирку, минуя in_stock',
  );
  assert.equal(routedInstance.warehouseId, warehouseId);
});
