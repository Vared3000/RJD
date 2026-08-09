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

  const state = {
    instanceIds: [],
    issuanceDocIds: [],
    returnDocIds: [],
    receivingDocIds: [],
    batchIds: [],
  };
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
    season: 'summer',
  });
  assert.equal(kitItem.status, 201);

  // Безразмерные позиции (бейджи, бирки и т. п.) разрешены в комплекте.
  const modelNoType = await auth(agent.post('/api/v1/nomenclature-models')).send({
    name: `${unique} no-type`,
  });
  t.after(() => models.NomenclatureModel.destroy({ where: { name: `${unique} no-type` } }));
  const sizeLessKitItem = await auth(agent.post('/api/v1/kits')).send({
    positionId,
    modelId: modelNoType.body.data.id,
    season: 'summer',
  });
  assert.equal(sizeLessKitItem.status, 201);
  const archivedSizeLessKitItem = await auth(
    agent.delete(`/api/v1/kits/${sizeLessKitItem.body.data.id}`),
  );
  assert.equal(archivedSizeLessKitItem.status, 200);
  const filteredKit = await auth(agent.get('/api/v1/kits')).query({ positionId, limit: 200 });
  assert.equal(filteredKit.status, 200);
  assert.equal(filteredKit.body.data.length, 1);
  assert.equal(filteredKit.body.data[0].positionId, positionId);

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
  assert.equal(issuanceDraft.body.data.employee.clothingSize.value, unique);
  assert.equal(issuanceDraft.body.data.employee.heightSize, null);
  const issuanceId = issuanceDraft.body.data.id;
  state.issuanceDocIds.push(issuanceId);

  const applied = await auth(agent.post(`/api/v1/issuance/documents/${issuanceId}/apply-kit`)).send(
    { season: 'summer' },
  );
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
  const doubleReturnPost = await auth(
    agent.post(`/api/v1/issuance/returns/${doubleReturnId}/post`),
  );
  assert.equal(
    doubleReturnPost.status,
    400,
    'повторный возврат уже возвращённого экземпляра должен быть отклонён',
  );

  // Дубликат строки Выдачи (та же модель+размер) отклоняется на addLine, до проведения.
  const dupIssuanceDraft = await auth(agent.post('/api/v1/issuance/documents')).send({
    employeeId,
    warehouseId,
    documentDate: '2026-07-29',
  });
  const dupIssuanceId = dupIssuanceDraft.body.data.id;
  state.issuanceDocIds.push(dupIssuanceId);
  const firstLine = await auth(
    agent.post(`/api/v1/issuance/documents/${dupIssuanceId}/lines`),
  ).send({
    modelId,
    sizeId,
    quantity: 1,
  });
  assert.equal(firstLine.status, 201);
  const dupLine = await auth(agent.post(`/api/v1/issuance/documents/${dupIssuanceId}/lines`)).send({
    modelId,
    sizeId,
    quantity: 1,
  });
  assert.equal(
    dupLine.status,
    400,
    'повторная строка с той же моделью и размером должна быть отклонена',
  );
  await auth(agent.delete(`/api/v1/issuance/documents/${dupIssuanceId}`));

  // Дубликат строки Возврата (тот же instanceId) отклоняется на addLine, до проведения.
  const dupReturnDraft = await auth(agent.post('/api/v1/issuance/returns')).send({
    employeeId,
    warehouseId,
    documentDate: '2026-07-29',
  });
  const dupReturnId = dupReturnDraft.body.data.id;
  state.returnDocIds.push(dupReturnId);
  const secondInstanceToReturn = available.body.data[1].id;
  const firstReturnLine = await auth(
    agent.post(`/api/v1/issuance/returns/${dupReturnId}/lines`),
  ).send({
    instanceId: secondInstanceToReturn,
    condition: 'good',
  });
  assert.equal(firstReturnLine.status, 201);
  const dupReturnLine = await auth(
    agent.post(`/api/v1/issuance/returns/${dupReturnId}/lines`),
  ).send({
    instanceId: secondInstanceToReturn,
    condition: 'good',
  });
  assert.equal(
    dupReturnLine.status,
    400,
    'повторная строка с тем же экземпляром должна быть отклонена',
  );
  await auth(agent.delete(`/api/v1/issuance/returns/${dupReturnId}`));
});

test('выдача: составной размер одежды подбирает экземпляр нужного роста', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const stamp = String(Date.now()).slice(-10);
  const unique = `Test Composite Size ${stamp}`;
  const state = {
    organizationId: null,
    warehouseId: null,
    supplierId: null,
    positionId: null,
    modelId: null,
    sizeIds: [],
    employeeIds: [],
    receivingId: null,
    batchId: null,
    issuanceIds: [],
    instanceIds: [],
  };

  t.after(async () => {
    if (state.instanceIds.length) {
      await models.StockMovement.destroy({ where: { instanceId: state.instanceIds } });
    }
    if (state.issuanceIds.length) {
      await models.IssuanceDocument.destroy({ where: { id: state.issuanceIds } });
    }
    if (state.instanceIds.length) {
      await models.Instance.destroy({ where: { id: state.instanceIds } });
    }
    if (state.receivingId) {
      await models.ReceivingDocument.destroy({ where: { id: state.receivingId } });
    }
    if (state.batchId) {
      await models.Batch.destroy({ where: { id: state.batchId } });
    }
    if (state.employeeIds.length) {
      await models.Employee.destroy({ where: { id: state.employeeIds } });
    }
    if (state.positionId) {
      await models.PositionKitItem.destroy({ where: { positionId: state.positionId } });
      await models.Position.destroy({ where: { id: state.positionId } });
    }
    if (state.modelId) {
      await models.NomenclatureModel.destroy({ where: { id: state.modelId } });
    }
    if (state.sizeIds.length) {
      await models.Size.destroy({ where: { id: state.sizeIds } });
    }
    if (state.warehouseId) {
      await models.Warehouse.destroy({ where: { id: state.warehouseId } });
    }
    if (state.supplierId) {
      await models.Supplier.destroy({ where: { id: state.supplierId } });
    }
    if (state.organizationId) {
      await models.Organization.destroy({ where: { id: state.organizationId } });
    }
  });

  const organization = await models.Organization.create({ name: unique });
  state.organizationId = organization.id;
  const warehouse = await models.Warehouse.create({
    organizationId: organization.id,
    name: unique,
  });
  state.warehouseId = warehouse.id;
  const supplier = await models.Supplier.create({ name: unique });
  state.supplierId = supplier.id;
  const clothingSize = await models.Size.create({ type: 'clothing', value: `CS56-${stamp}` });
  state.sizeIds.push(clothingSize.id);
  const height170 = await models.Size.create({ type: 'height', value: `H170-${stamp}` });
  state.sizeIds.push(height170.id);
  const height182 = await models.Size.create({ type: 'height', value: `H182-${stamp}` });
  state.sizeIds.push(height182.id);
  const model = await models.NomenclatureModel.create({
    name: unique,
    sizeType: 'clothing',
    requiresHeightSize: true,
  });
  state.modelId = model.id;
  const position = await models.Position.create({ name: unique });
  state.positionId = position.id;
  await models.PositionKitItem.create({
    positionId: position.id,
    modelId: model.id,
    season: 'summer',
    quantity: 1,
  });
  const employeeWithHeight = await models.Employee.create({
    organizationId: organization.id,
    positionId: position.id,
    fullName: `${unique} with height`,
    hireDate: '2026-01-01',
    clothingSizeId: clothingSize.id,
    heightSizeId: height170.id,
  });
  const employeeWithoutHeight = await models.Employee.create({
    organizationId: organization.id,
    positionId: position.id,
    fullName: `${unique} without height`,
    hireDate: '2026-01-01',
    clothingSizeId: clothingSize.id,
  });
  state.employeeIds.push(employeeWithHeight.id, employeeWithoutHeight.id);

  // Одно поступление содержит два экземпляра одинаковых модели/размера,
  // различающихся только ростом.
  const receiving = await auth(agent.post('/api/v1/purchases/receiving')).send({
    supplierId: supplier.id,
    warehouseId: warehouse.id,
    documentDate: '2026-07-01',
  });
  state.receivingId = receiving.body.data.id;
  for (const heightSizeId of [height170.id, height182.id]) {
    const line = await auth(
      agent.post(`/api/v1/purchases/receiving/${state.receivingId}/lines`),
    ).send({
      modelId: model.id,
      sizeId: clothingSize.id,
      heightSizeId,
      quantity: 1,
      purchasePrice: 2500,
    });
    assert.equal(line.status, 201);
  }
  const postedReceiving = await auth(
    agent.post(`/api/v1/purchases/receiving/${state.receivingId}/post`),
  );
  assert.equal(postedReceiving.status, 200);
  state.batchId = postedReceiving.body.data.batchId;
  const instances = await models.Instance.findAll({ where: { modelId: model.id } });
  state.instanceIds.push(...instances.map((instance) => instance.id));
  assert.deepEqual(
    new Set(instances.map((instance) => instance.heightSizeId)),
    new Set([height170.id, height182.id]),
  );

  const issuance = await auth(agent.post('/api/v1/issuance/documents')).send({
    employeeId: employeeWithHeight.id,
    warehouseId: warehouse.id,
    documentDate: '2026-07-30',
  });
  state.issuanceIds.push(issuance.body.data.id);
  const applied = await auth(
    agent.post(`/api/v1/issuance/documents/${issuance.body.data.id}/apply-kit`),
  ).send({ season: 'summer' });
  assert.equal(applied.status, 200);
  assert.equal(applied.body.data.lines[0].sizeId, clothingSize.id);
  assert.equal(applied.body.data.lines[0].heightSizeId, height170.id);
  assert.deepEqual(applied.body.meta.skipped, []);

  const postedIssuance = await auth(
    agent.post(`/api/v1/issuance/documents/${issuance.body.data.id}/post`),
  );
  assert.equal(postedIssuance.status, 200);
  const selectedInstance = await models.Instance.findOne({
    where: { modelId: model.id, employeeId: employeeWithHeight.id },
  });
  assert.equal(selectedInstance.heightSizeId, height170.id);
  const otherHeightInstance = await models.Instance.findOne({
    where: { modelId: model.id, heightSizeId: height182.id },
  });
  assert.equal(otherHeightInstance.status, 'in_stock');

  const skippedIssuance = await auth(agent.post('/api/v1/issuance/documents')).send({
    employeeId: employeeWithoutHeight.id,
    warehouseId: warehouse.id,
    documentDate: '2026-07-30',
  });
  state.issuanceIds.push(skippedIssuance.body.data.id);
  const skipped = await auth(
    agent.post(`/api/v1/issuance/documents/${skippedIssuance.body.data.id}/apply-kit`),
  ).send({ season: 'summer' });
  assert.equal(skipped.status, 200);
  assert.equal(skipped.body.data.lines.length, 0);
  assert.equal(skipped.body.meta.skipped.length, 1);
  assert.equal(skipped.body.meta.skipped[0].reason, 'no-size');
});

test('безразмерная позиция проходит поступление, комплект и выдачу без размера', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `Test Sizeless ${Date.now()}`;
  const state = {};

  t.after(async () => {
    if (state.instanceId) {
      await models.StockMovement.destroy({ where: { instanceId: state.instanceId } });
    }
    if (state.issuanceId) {
      await models.IssuanceDocument.destroy({ where: { id: state.issuanceId } });
    }
    if (state.instanceId) {
      await models.Instance.destroy({ where: { id: state.instanceId } });
    }
    if (state.receivingId) {
      await models.ReceivingDocument.destroy({ where: { id: state.receivingId } });
    }
    if (state.batchId) {
      await models.Batch.destroy({ where: { id: state.batchId } });
    }
    if (state.positionId) {
      await models.PositionKitItem.destroy({ where: { positionId: state.positionId } });
    }
    if (state.employeeId) {
      await models.Employee.destroy({ where: { id: state.employeeId } });
    }
    if (state.positionId) {
      await models.Position.destroy({ where: { id: state.positionId } });
    }
    if (state.modelId) {
      await models.NomenclatureModel.destroy({ where: { id: state.modelId } });
    }
    if (state.warehouseId) {
      await models.Warehouse.destroy({ where: { id: state.warehouseId } });
    }
    if (state.supplierId) {
      await models.Supplier.destroy({ where: { id: state.supplierId } });
    }
    if (state.organizationId) {
      await models.Organization.destroy({ where: { id: state.organizationId } });
    }
  });

  const organization = await models.Organization.create({ name: unique });
  state.organizationId = organization.id;
  const warehouse = await models.Warehouse.create({
    organizationId: organization.id,
    name: unique,
  });
  state.warehouseId = warehouse.id;
  const supplier = await models.Supplier.create({ name: unique });
  state.supplierId = supplier.id;
  const model = await models.NomenclatureModel.create({ name: `${unique} Badge`, sizeType: null });
  state.modelId = model.id;
  const position = await models.Position.create({ name: unique });
  state.positionId = position.id;
  const employee = await models.Employee.create({
    organizationId: organization.id,
    positionId: position.id,
    fullName: unique,
    hireDate: '2026-01-01',
  });
  state.employeeId = employee.id;
  await models.PositionKitItem.create({
    positionId: position.id,
    modelId: model.id,
    season: 'summer',
    quantity: 1,
  });

  const receiving = await auth(agent.post('/api/v1/purchases/receiving')).send({
    supplierId: supplier.id,
    warehouseId: warehouse.id,
    documentDate: '2026-07-31',
  });
  state.receivingId = receiving.body.data.id;
  const receivingLine = await auth(
    agent.post(`/api/v1/purchases/receiving/${state.receivingId}/lines`),
  ).send({
    modelId: model.id,
    quantity: 1,
    purchasePrice: 100,
  });
  assert.equal(receivingLine.status, 201);
  assert.equal(receivingLine.body.data.lines[0].sizeId, null);

  const postedReceiving = await auth(
    agent.post(`/api/v1/purchases/receiving/${state.receivingId}/post`),
  );
  assert.equal(postedReceiving.status, 200);
  state.batchId = postedReceiving.body.data.batchId;
  const instance = await models.Instance.findOne({ where: { modelId: model.id } });
  state.instanceId = instance.id;
  assert.equal(instance.sizeId, null);

  const issuance = await auth(agent.post('/api/v1/issuance/documents')).send({
    employeeId: employee.id,
    warehouseId: warehouse.id,
    documentDate: '2026-07-31',
  });
  state.issuanceId = issuance.body.data.id;
  const applied = await auth(
    agent.post(`/api/v1/issuance/documents/${state.issuanceId}/apply-kit`),
  ).send({ season: 'summer' });
  assert.equal(applied.status, 200);
  assert.equal(applied.body.data.lines.length, 1);
  assert.equal(applied.body.data.lines[0].sizeId, null);
  assert.deepEqual(applied.body.meta.skipped, []);

  const postedIssuance = await auth(
    agent.post(`/api/v1/issuance/documents/${state.issuanceId}/post`),
  );
  assert.equal(postedIssuance.status, 200);
  await instance.reload();
  assert.equal(instance.status, 'issued');
  assert.equal(instance.employeeId, employee.id);
});

test('комплект учитывает пол и сезон, выбирает самый точный вариант и не создаёт дубли', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `Test Kit Variants ${Date.now()}`;
  const state = {
    issuanceIds: [],
    employeeIds: [],
    modelIds: [],
  };

  t.after(async () => {
    if (state.issuanceIds.length) {
      await models.IssuanceDocument.destroy({ where: { id: state.issuanceIds } });
    }
    if (state.positionId) {
      await models.PositionKitItem.destroy({ where: { positionId: state.positionId } });
    }
    if (state.employeeIds.length) {
      await models.Employee.destroy({ where: { id: state.employeeIds } });
    }
    if (state.positionId) {
      await models.Position.destroy({ where: { id: state.positionId } });
    }
    if (state.modelIds.length) {
      await models.NomenclatureModel.destroy({ where: { id: state.modelIds } });
    }
    if (state.warehouseId) {
      await models.Warehouse.destroy({ where: { id: state.warehouseId } });
    }
    if (state.organizationId) {
      await models.Organization.destroy({ where: { id: state.organizationId } });
    }
  });

  const organization = await models.Organization.create({ name: unique });
  state.organizationId = organization.id;
  const warehouse = await models.Warehouse.create({
    organizationId: organization.id,
    name: unique,
  });
  state.warehouseId = warehouse.id;
  const position = await models.Position.create({ name: unique });
  state.positionId = position.id;

  const variantModel = await models.NomenclatureModel.create({ name: `${unique} Variant` });
  const legacyModel = await models.NomenclatureModel.create({ name: `${unique} Legacy` });
  const maleOnlyModel = await models.NomenclatureModel.create({ name: `${unique} Male only` });
  const winterOnlyModel = await models.NomenclatureModel.create({ name: `${unique} Winter` });
  state.modelIds.push(variantModel.id, legacyModel.id, maleOnlyModel.id, winterOnlyModel.id);

  const employees = await Promise.all(
    [
      { suffix: 'Male', gender: 'male' },
      { suffix: 'Female', gender: 'female' },
      { suffix: 'Unknown', gender: null },
    ].map(({ suffix, gender }) =>
      models.Employee.create({
        organizationId: organization.id,
        positionId: position.id,
        fullName: `${unique} ${suffix}`,
        hireDate: '2026-01-01',
        gender,
      }),
    ),
  );
  state.employeeIds.push(...employees.map((employee) => employee.id));
  const [maleEmployee, femaleEmployee, unknownEmployee] = employees;

  for (const data of [
    { season: 'summer', gender: 'male', quantity: 2 },
    { season: 'summer', gender: 'female', quantity: 3 },
    { season: 'summer', gender: null, quantity: 1 },
    { season: 'winter', gender: null, quantity: 8 },
  ]) {
    const created = await auth(agent.post('/api/v1/kits')).send({
      positionId: position.id,
      modelId: variantModel.id,
      ...data,
    });
    assert.equal(created.status, 201);
  }

  const duplicate = await auth(agent.post('/api/v1/kits')).send({
    positionId: position.id,
    modelId: variantModel.id,
    season: 'summer',
    gender: 'male',
    quantity: 99,
  });
  assert.equal(duplicate.status, 409);

  const invalidGender = await auth(agent.post('/api/v1/kits')).send({
    positionId: position.id,
    modelId: variantModel.id,
    season: 'summer',
    gender: 'other',
  });
  assert.equal(invalidGender.status, 400);

  await models.PositionKitItem.bulkCreate([
    {
      positionId: position.id,
      modelId: legacyModel.id,
      season: null,
      gender: null,
      quantity: 4,
    },
    {
      positionId: position.id,
      modelId: legacyModel.id,
      season: 'summer',
      gender: null,
      quantity: 5,
    },
    {
      positionId: position.id,
      modelId: maleOnlyModel.id,
      season: 'summer',
      gender: 'male',
      quantity: 6,
    },
    {
      positionId: position.id,
      modelId: winterOnlyModel.id,
      season: 'winter',
      gender: null,
      quantity: 7,
    },
  ]);

  async function createDraftAndPreview(employeeId, season) {
    const draft = await auth(agent.post('/api/v1/issuance/documents')).send({
      employeeId,
      warehouseId: warehouse.id,
      documentDate: '2026-08-08',
    });
    assert.equal(draft.status, 201);
    state.issuanceIds.push(draft.body.data.id);
    const preview = await auth(
      agent.get(`/api/v1/issuance/documents/${draft.body.data.id}/kit-preview?season=${season}`),
    );
    assert.equal(preview.status, 200);
    assert.equal(draft.body.data.employee.position.name, position.name);
    assert.equal(preview.body.data.positionName, position.name);
    return { draftId: draft.body.data.id, preview: preview.body.data.items };
  }

  function assertPreview(items, expectedEntries) {
    assert.equal(items.length, expectedEntries.length);
    assert.equal(new Set(items.map((item) => item.modelId)).size, expectedEntries.length);
    const quantities = new Map(items.map((item) => [item.modelId, item.quantity]));
    for (const [modelId, quantity] of expectedEntries) {
      assert.equal(quantities.get(modelId), quantity);
    }
  }

  const maleSummer = await createDraftAndPreview(maleEmployee.id, 'summer');
  assertPreview(maleSummer.preview, [
    [variantModel.id, 2],
    [legacyModel.id, 5],
    [maleOnlyModel.id, 6],
  ]);

  const femaleSummer = await createDraftAndPreview(femaleEmployee.id, 'summer');
  assertPreview(femaleSummer.preview, [
    [variantModel.id, 3],
    [legacyModel.id, 5],
  ]);

  const unknownSummer = await createDraftAndPreview(unknownEmployee.id, 'summer');
  assertPreview(unknownSummer.preview, [
    [variantModel.id, 1],
    [legacyModel.id, 5],
    [maleOnlyModel.id, 6],
  ]);

  const maleWinter = await createDraftAndPreview(maleEmployee.id, 'winter');
  assertPreview(maleWinter.preview, [
    [variantModel.id, 8],
    [winterOnlyModel.id, 7],
  ]);

  const applied = await auth(
    agent.post(`/api/v1/issuance/documents/${maleSummer.draftId}/apply-kit`),
  ).send({ season: 'summer' });
  assert.equal(applied.status, 200);
  assert.equal(applied.body.data.lines.length, 3);
  assert.equal(new Set(applied.body.data.lines.map((line) => line.modelId)).size, 3);
  assertPreview(applied.body.data.lines, [
    [variantModel.id, 2],
    [legacyModel.id, 5],
    [maleOnlyModel.id, 6],
  ]);
});
