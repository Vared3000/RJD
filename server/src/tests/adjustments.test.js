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

test('корректировка: излишек/недостача/перемещение/состояние + черновик из инвентаризации', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `Test Adjustments ${Date.now()}`;

  const state = {
    instanceIds: [],
    adjustmentDocIds: [],
    inventoryDocIds: [],
    receivingDocIds: [],
    batchIds: [],
  };
  t.after(async () => {
    if (state.instanceIds.length > 0) {
      await models.StockMovement.destroy({ where: { instanceId: state.instanceIds } });
    }
    if (state.adjustmentDocIds.length > 0) {
      await models.StockAdjustment.destroy({ where: { id: state.adjustmentDocIds } });
    }
    if (state.inventoryDocIds.length > 0) {
      await models.InventoryDocument.destroy({ where: { id: state.inventoryDocIds } });
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
    await models.NomenclatureModel.destroy({ where: { name: unique } });
    await models.Size.destroy({ where: { value: unique } });
    await models.Warehouse.destroy({ where: { name: [`${unique} A`, `${unique} B`] } });
    await models.Supplier.destroy({ where: { name: unique } });
    await models.Organization.destroy({ where: { name: unique } });
  });

  const org = await auth(agent.post('/api/v1/organizations')).send({ name: unique });
  const organizationId = org.body.data.id;
  const warehouseA = await auth(agent.post('/api/v1/warehouses')).send({
    organizationId,
    name: `${unique} A`,
  });
  const warehouseAId = warehouseA.body.data.id;
  const warehouseB = await auth(agent.post('/api/v1/warehouses')).send({
    organizationId,
    name: `${unique} B`,
  });
  const warehouseBId = warehouseB.body.data.id;
  const supplier = await auth(agent.post('/api/v1/suppliers')).send({ name: unique });
  const size = await auth(agent.post('/api/v1/sizes')).send({ type: 'clothing', value: unique });
  const sizeId = size.body.data.id;
  const model = await auth(agent.post('/api/v1/nomenclature-models')).send({
    name: unique,
    sizeType: 'clothing',
  });
  const modelId = model.body.data.id;

  const receivingDraft = await auth(agent.post('/api/v1/purchases/receiving')).send({
    supplierId: supplier.body.data.id,
    warehouseId: warehouseAId,
    documentDate: '2026-08-01',
  });
  const receivingId = receivingDraft.body.data.id;
  state.receivingDocIds.push(receivingId);
  await auth(agent.post(`/api/v1/purchases/receiving/${receivingId}/lines`)).send({
    modelId,
    sizeId,
    quantity: 6,
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
  const [shortageInstanceId, relocateInstanceId, conditionInstanceId] = instances.map((i) => i.id);

  // --- Документ с четырьмя типами строк ---
  const adjustmentDraft = await auth(agent.post('/api/v1/adjustments/documents')).send({
    warehouseId: warehouseAId,
    documentDate: '2026-08-08',
  });
  assert.equal(adjustmentDraft.status, 201);
  assert.match(adjustmentDraft.body.data.number, /^КР-\d{6}$/);
  const adjustmentId = adjustmentDraft.body.data.id;
  state.adjustmentDocIds.push(adjustmentId);

  const noReason = await auth(
    agent.post(`/api/v1/adjustments/documents/${adjustmentId}/lines`),
  ).send({ adjustmentType: 'shortage', instanceId: shortageInstanceId, reason: '' });
  assert.equal(noReason.status, 400, 'основание обязательно');

  const shortageLine = await auth(
    agent.post(`/api/v1/adjustments/documents/${adjustmentId}/lines`),
  ).send({
    adjustmentType: 'shortage',
    instanceId: shortageInstanceId,
    reason: 'Не найден при пересчёте',
  });
  assert.equal(shortageLine.status, 201);

  // Дубль строки по тому же экземпляру отклоняется.
  const dupLine = await auth(
    agent.post(`/api/v1/adjustments/documents/${adjustmentId}/lines`),
  ).send({
    adjustmentType: 'condition',
    instanceId: shortageInstanceId,
    toCondition: 'damaged',
    reason: 'Дубль',
  });
  assert.equal(dupLine.status, 400);

  const relocateLine = await auth(
    agent.post(`/api/v1/adjustments/documents/${adjustmentId}/lines`),
  ).send({
    adjustmentType: 'relocate',
    instanceId: relocateInstanceId,
    toWarehouseId: warehouseBId,
    reason: 'Найден на складе B',
  });
  assert.equal(relocateLine.status, 201);

  const conditionLine = await auth(
    agent.post(`/api/v1/adjustments/documents/${adjustmentId}/lines`),
  ).send({
    adjustmentType: 'condition',
    instanceId: conditionInstanceId,
    toCondition: 'damaged',
    reason: 'Ошибочно указано состояние при поступлении',
  });
  assert.equal(conditionLine.status, 201);

  const surplusLine = await auth(
    agent.post(`/api/v1/adjustments/documents/${adjustmentId}/lines`),
  ).send({
    adjustmentType: 'surplus',
    modelId,
    sizeId,
    toWarehouseId: warehouseAId,
    cost: 500,
    reason: 'Обнаружен лишний экземпляр при пересчёте',
  });
  assert.equal(surplusLine.status, 201);

  const adjustmentPosted = await auth(
    agent.post(`/api/v1/adjustments/documents/${adjustmentId}/post`),
  );
  assert.equal(adjustmentPosted.status, 200);
  assert.equal(adjustmentPosted.body.data.status, 'posted');

  const shortageInstance = await models.Instance.findByPk(shortageInstanceId);
  assert.equal(shortageInstance.status, 'write_off');
  assert.equal(shortageInstance.warehouseId, null);

  const relocateInstance = await models.Instance.findByPk(relocateInstanceId);
  assert.equal(relocateInstance.status, 'in_stock');
  assert.equal(relocateInstance.warehouseId, warehouseBId);

  const conditionInstance = await models.Instance.findByPk(conditionInstanceId);
  assert.equal(conditionInstance.condition, 'damaged');
  assert.equal(conditionInstance.warehouseId, warehouseAId);

  const postedDoc = adjustmentPosted.body.data;
  const surplusPostedLine = postedDoc.lines.find((l) => l.adjustmentType === 'surplus');
  assert.ok(surplusPostedLine.instanceId, 'surplus-строка получает id созданного экземпляра');
  state.instanceIds.push(surplusPostedLine.instanceId);
  const surplusInstance = await models.Instance.findByPk(surplusPostedLine.instanceId);
  assert.equal(surplusInstance.status, 'in_stock');
  assert.equal(surplusInstance.warehouseId, warehouseAId);
  assert.equal(surplusInstance.cost, undefined);

  const movements = await models.StockMovement.findAll({
    where: { documentId: adjustmentId, documentType: 'stock_adjustment' },
  });
  assert.equal(movements.length, 4, 'по одному движению на каждую из 4 строк');

  // Повторное проведение отклоняется.
  const repost = await auth(agent.post(`/api/v1/adjustments/documents/${adjustmentId}/post`));
  assert.equal(repost.status, 409);

  // --- Черновик из завершённой инвентаризации ---
  const inventoryDraft = await auth(agent.post('/api/v1/inventory/documents')).send({
    warehouseId: warehouseAId,
    documentDate: '2026-08-08',
  });
  assert.equal(inventoryDraft.status, 201);
  // На складе A остались: экземпляр с исправленным состоянием, 2 нетронутых,
  // излишек (создан проведением surplus-строки) — итого 5.
  assert.equal(inventoryDraft.body.data.lines.length, 5);
  const inventoryId = inventoryDraft.body.data.id;
  state.inventoryDocIds.push(inventoryId);
  const inventoryLines = inventoryDraft.body.data.lines;

  const fromDraftInventory = await auth(
    agent.post(`/api/v1/adjustments/documents/from-inventory/${inventoryId}`),
  ).send({});
  assert.equal(fromDraftInventory.status, 400, 'инвентаризация ещё не завершена');

  // Подтверждаем три позиции из пяти — две остаются расхождением.
  await auth(
    agent.patch(`/api/v1/inventory/documents/${inventoryId}/lines/${inventoryLines[0].id}`),
  ).send({ confirmed: true });
  await auth(
    agent.patch(`/api/v1/inventory/documents/${inventoryId}/lines/${inventoryLines[1].id}`),
  ).send({ confirmed: true });
  await auth(
    agent.patch(`/api/v1/inventory/documents/${inventoryId}/lines/${inventoryLines[2].id}`),
  ).send({ confirmed: true });

  const inventoryCompleted = await auth(
    agent.post(`/api/v1/inventory/documents/${inventoryId}/complete`),
  );
  assert.equal(inventoryCompleted.status, 200);

  const fromInventory = await auth(
    agent.post(`/api/v1/adjustments/documents/from-inventory/${inventoryId}`),
  ).send({ note: 'Авто по итогам сверки' });
  assert.equal(fromInventory.status, 201);
  assert.match(fromInventory.body.data.number, /^КР-\d{6}$/);
  const fromInventoryId = fromInventory.body.data.id;
  state.adjustmentDocIds.push(fromInventoryId);
  assert.equal(fromInventory.body.data.lines.length, 2);
  for (const line of fromInventory.body.data.lines) {
    assert.equal(line.adjustmentType, 'shortage');
    assert.equal(line.inventoryDocument.id, inventoryId);
  }

  const fromInventoryPosted = await auth(
    agent.post(`/api/v1/adjustments/documents/${fromInventoryId}/post`),
  );
  assert.equal(fromInventoryPosted.status, 200);
  const writtenOffFromInventory = await models.Instance.findAll({
    where: { id: fromInventory.body.data.lines.map((l) => l.instanceId) },
  });
  for (const instance of writtenOffFromInventory) {
    assert.equal(instance.status, 'write_off');
  }

  // Повторный запрос из той же инвентаризации — расхождений для документа больше нет,
  // но записи расхождения в инвентаризации остались неподтверждёнными по прежнему снимку,
  // поэтому черновик создастся снова с теми же позициями (инвентаризация — не источник истины
  // после первой корректировки, документ не меняет её строки).
  const fromInventoryAgain = await auth(
    agent.post(`/api/v1/adjustments/documents/from-inventory/${inventoryId}`),
  ).send({});
  assert.equal(fromInventoryAgain.status, 201);
  state.adjustmentDocIds.push(fromInventoryAgain.body.data.id);
});
