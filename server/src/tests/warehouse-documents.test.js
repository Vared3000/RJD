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

test('перемещение, списание, инвентаризация: полный цикл + дубли/расхождения', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `Test WhDocs ${Date.now()}`;

  const state = {
    instanceIds: [],
    transferDocIds: [],
    writeoffDocIds: [],
    inventoryDocIds: [],
    receivingDocIds: [],
    batchIds: [],
  };
  t.after(async () => {
    if (state.instanceIds.length > 0) {
      await models.StockMovement.destroy({ where: { instanceId: state.instanceIds } });
    }
    if (state.transferDocIds.length > 0) {
      await models.TransferDocument.destroy({ where: { id: state.transferDocIds } });
    }
    if (state.writeoffDocIds.length > 0) {
      await models.WriteoffDocument.destroy({ where: { id: state.writeoffDocIds } });
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
    documentDate: '2026-07-01',
  });
  const receivingId = receivingDraft.body.data.id;
  state.receivingDocIds.push(receivingId);
  await auth(agent.post(`/api/v1/purchases/receiving/${receivingId}/lines`)).send({
    modelId,
    sizeId,
    quantity: 5,
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
  const [transferInstanceId, writeoffInstanceId] = instances.map((i) => i.id);

  // --- Перемещение: fromWarehouseId === toWarehouseId отклоняется на схеме ---
  const invalidTransfer = await auth(agent.post('/api/v1/transfers/documents')).send({
    fromWarehouseId: warehouseAId,
    toWarehouseId: warehouseAId,
    documentDate: '2026-07-29',
  });
  assert.equal(invalidTransfer.status, 400);

  const transferDraft = await auth(agent.post('/api/v1/transfers/documents')).send({
    fromWarehouseId: warehouseAId,
    toWarehouseId: warehouseBId,
    documentDate: '2026-07-29',
  });
  assert.equal(transferDraft.status, 201);
  assert.match(transferDraft.body.data.number, /^ПМ-\d{6}$/);
  const transferId = transferDraft.body.data.id;
  state.transferDocIds.push(transferId);

  const transferLine = await auth(
    agent.post(`/api/v1/transfers/documents/${transferId}/lines`),
  ).send({ instanceId: transferInstanceId });
  assert.equal(transferLine.status, 201);

  // Дубль строки отклоняется.
  const transferDupLine = await auth(
    agent.post(`/api/v1/transfers/documents/${transferId}/lines`),
  ).send({ instanceId: transferInstanceId });
  assert.equal(transferDupLine.status, 400);

  const transferPosted = await auth(agent.post(`/api/v1/transfers/documents/${transferId}/post`));
  assert.equal(transferPosted.status, 200);
  assert.equal(transferPosted.body.data.status, 'posted');

  const movedInstance = await models.Instance.findByPk(transferInstanceId);
  assert.equal(movedInstance.warehouseId, warehouseBId);
  assert.equal(movedInstance.status, 'in_stock');

  const transferMovements = await models.StockMovement.findAll({
    where: { documentId: transferId, documentType: 'transfer' },
  });
  assert.equal(transferMovements.length, 1);
  assert.equal(transferMovements[0].fromWarehouseId, warehouseAId);
  assert.equal(transferMovements[0].toWarehouseId, warehouseBId);

  // Повторное проведение отклоняется.
  const transferRepost = await auth(agent.post(`/api/v1/transfers/documents/${transferId}/post`));
  assert.equal(transferRepost.status, 400);

  // --- Списание ---
  const writeoffDraft = await auth(agent.post('/api/v1/writeoff/documents')).send({
    warehouseId: warehouseAId,
    documentDate: '2026-07-29',
  });
  assert.match(writeoffDraft.body.data.number, /^СП-\d{6}$/);
  const writeoffId = writeoffDraft.body.data.id;
  state.writeoffDocIds.push(writeoffId);

  const writeoffLineNoReason = await auth(
    agent.post(`/api/v1/writeoff/documents/${writeoffId}/lines`),
  ).send({ instanceId: writeoffInstanceId, reason: '' });
  assert.equal(writeoffLineNoReason.status, 400, 'причина списания обязательна');

  const writeoffLine = await auth(
    agent.post(`/api/v1/writeoff/documents/${writeoffId}/lines`),
  ).send({ instanceId: writeoffInstanceId, reason: 'Износ' });
  assert.equal(writeoffLine.status, 201);

  const writeoffPosted = await auth(agent.post(`/api/v1/writeoff/documents/${writeoffId}/post`));
  assert.equal(writeoffPosted.status, 200);

  const writtenOffInstance = await models.Instance.findByPk(writeoffInstanceId);
  assert.equal(writtenOffInstance.status, 'write_off');

  const writeoffMovements = await models.StockMovement.findAll({
    where: { documentId: writeoffId, documentType: 'writeoff' },
  });
  assert.equal(writeoffMovements.length, 1);
  assert.equal(writeoffMovements[0].fromWarehouseId, warehouseAId);
  assert.equal(writeoffMovements[0].toWarehouseId, null);

  // --- Инвентаризация: снимок остатков склада A (3 оставшихся in_stock экземпляра) ---
  const inventoryDraft = await auth(agent.post('/api/v1/inventory/documents')).send({
    warehouseId: warehouseAId,
    documentDate: '2026-07-29',
  });
  assert.equal(inventoryDraft.status, 201);
  assert.match(inventoryDraft.body.data.number, /^ИН-\d{6}$/);
  assert.deepEqual(inventoryDraft.body.meta.summary, { total: 3, confirmed: 0, missing: 3 });
  const inventoryId = inventoryDraft.body.data.id;
  state.inventoryDocIds.push(inventoryId);

  const inventoryLines = inventoryDraft.body.data.lines;
  assert.equal(inventoryLines.length, 3);

  // Подтверждаем две из трёх позиций.
  const confirm1 = await auth(
    agent.patch(`/api/v1/inventory/documents/${inventoryId}/lines/${inventoryLines[0].id}`),
  ).send({ confirmed: true });
  assert.equal(confirm1.status, 200);
  const confirm2 = await auth(
    agent.patch(`/api/v1/inventory/documents/${inventoryId}/lines/${inventoryLines[1].id}`),
  ).send({ confirmed: true });
  assert.deepEqual(confirm2.body.meta.summary, { total: 3, confirmed: 2, missing: 1 });

  const inventoryCompleted = await auth(
    agent.post(`/api/v1/inventory/documents/${inventoryId}/complete`),
  );
  assert.equal(inventoryCompleted.status, 200);
  assert.equal(inventoryCompleted.body.data.status, 'completed');
  assert.deepEqual(inventoryCompleted.body.meta.summary, { total: 3, confirmed: 2, missing: 1 });

  // Инвентаризация не меняет остатки: все три экземпляра остаются in_stock
  // на складе A независимо от того, подтверждена позиция или нет.
  const inventoriedInstances = await models.Instance.findAll({
    where: { id: inventoryLines.map((l) => l.instanceId) },
  });
  for (const instance of inventoriedInstances) {
    assert.equal(instance.status, 'in_stock');
    assert.equal(instance.warehouseId, warehouseAId);
  }
  const inventoryMovements = await models.StockMovement.findAll({
    where: { documentId: inventoryId },
  });
  assert.equal(inventoryMovements.length, 0, 'инвентаризация не создаёт движений склада');

  // Завершённый документ недоступен для изменения.
  const editAfterComplete = await auth(
    agent.patch(`/api/v1/inventory/documents/${inventoryId}/lines/${inventoryLines[2].id}`),
  ).send({ confirmed: true });
  assert.equal(editAfterComplete.status, 400);
});
