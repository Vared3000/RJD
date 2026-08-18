// Требует применённых миграций и сида (pnpm db:migrate && pnpm db:seed).
// Задача 22: редактирование проведённого документа "Выдача".
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

async function createPricedFixture(auth, agent, unique) {
  const org = await auth(agent.post('/api/v1/organizations')).send({ name: unique });
  const warehouse = await auth(agent.post('/api/v1/warehouses')).send({
    organizationId: org.body.data.id,
    name: unique,
  });
  const supplier = await auth(agent.post('/api/v1/suppliers')).send({ name: unique });
  const model = await auth(agent.post('/api/v1/nomenclature-models')).send({
    name: unique,
    sizeType: 'clothing',
    rentalPrice: 1000,
    rentalVatRate: 5,
  });
  const size = await auth(agent.post('/api/v1/sizes')).send({ type: 'clothing', value: unique });
  return { org, warehouse, supplier, model, size };
}

test('выдача: чистая редакция меняет работника/дату и пересчитывает цену без дублей движений', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `IssRevClean-${Date.now()}`;

  const state = {
    instanceIds: [],
    issuanceIds: [],
    receivingIds: [],
    batchIds: [],
    employeeIds: [],
  };
  t.after(async () => {
    if (state.issuanceIds.length > 0) {
      await models.DocumentRevision.destroy({
        where: { documentType: 'issuance', documentId: state.issuanceIds },
      });
    }
    if (state.instanceIds.length > 0) {
      await models.StockMovement.destroy({ where: { instanceId: state.instanceIds } });
    }
    if (state.issuanceIds.length > 0) {
      await models.IssuanceDocument.destroy({ where: { id: state.issuanceIds } });
    }
    if (state.instanceIds.length > 0) {
      await models.Instance.destroy({ where: { id: state.instanceIds } });
    }
    if (state.receivingIds.length > 0) {
      await models.ReceivingDocument.destroy({ where: { id: state.receivingIds } });
    }
    if (state.batchIds.length > 0) {
      await models.Batch.destroy({ where: { id: state.batchIds } });
    }
    if (state.employeeIds.length > 0) {
      await models.Employee.destroy({ where: { id: state.employeeIds } });
    }
    await models.NomenclaturePrice.destroy({ where: { modelId: state.modelId ?? null } });
    await models.SourceImportRecord.destroy({ where: { sourceKey: `issuance-revise-${unique}` } });
    await models.Warehouse.destroy({ where: { name: unique } });
    await models.Supplier.destroy({ where: { name: unique } });
    await models.NomenclatureModel.destroy({ where: { name: unique } });
    await models.Size.destroy({ where: { value: unique } });
    await models.Organization.destroy({ where: { name: unique } });
  });

  const { org, warehouse, supplier, model, size } = await createPricedFixture(auth, agent, unique);
  state.modelId = model.body.data.id;

  const employeeA = await auth(agent.post('/api/v1/employees')).send({
    organizationId: org.body.data.id,
    fullName: `${unique} A`,
    hireDate: '2022-01-10',
  });
  const employeeB = await auth(agent.post('/api/v1/employees')).send({
    organizationId: org.body.data.id,
    fullName: `${unique} B`,
    hireDate: '2022-01-10',
  });
  state.employeeIds.push(employeeA.body.data.id, employeeB.body.data.id);

  const receivingDraft = await auth(agent.post('/api/v1/purchases/receiving')).send({
    supplierId: supplier.body.data.id,
    warehouseId: warehouse.body.data.id,
    documentDate: '2026-01-15',
  });
  const receivingId = receivingDraft.body.data.id;
  state.receivingIds.push(receivingId);
  await auth(agent.post(`/api/v1/purchases/receiving/${receivingId}/lines`)).send({
    modelId: model.body.data.id,
    sizeId: size.body.data.id,
    quantity: 1,
    purchasePrice: 1500,
  });
  const receivingPosted = await auth(agent.post(`/api/v1/purchases/receiving/${receivingId}/post`));
  assert.equal(receivingPosted.status, 200);
  state.batchIds.push(receivingPosted.body.data.batchId);
  const instance = await models.Instance.findOne({ where: { modelId: model.body.data.id } });
  state.instanceIds.push(instance.id);

  const issuanceDraft = await auth(agent.post('/api/v1/issuance/documents')).send({
    employeeId: employeeA.body.data.id,
    warehouseId: warehouse.body.data.id,
    documentDate: '2026-01-20',
  });
  const issuanceId = issuanceDraft.body.data.id;
  state.issuanceIds.push(issuanceId);
  await auth(agent.post(`/api/v1/issuance/documents/${issuanceId}/lines`)).send({
    modelId: model.body.data.id,
    sizeId: size.body.data.id,
    quantity: 1,
  });
  const issuancePosted = await auth(agent.post(`/api/v1/issuance/documents/${issuanceId}/post`));
  assert.equal(issuancePosted.status, 200);
  assert.equal(issuancePosted.body.data.revisionNumber, 1);

  const revised = await auth(agent.post(`/api/v1/issuance/documents/${issuanceId}/revise`)).send({
    header: {
      employeeId: employeeB.body.data.id,
      warehouseId: warehouse.body.data.id,
      documentDate: '2026-01-25',
    },
    lines: [{ modelId: model.body.data.id, sizeId: size.body.data.id, quantity: 1 }],
    reason: 'Перепутан работник',
  });
  assert.equal(revised.status, 200);
  assert.equal(revised.body.data.revisionNumber, 2);
  assert.equal(revised.body.data.employeeId, employeeB.body.data.id);

  await instance.reload();
  assert.equal(instance.status, 'issued');
  assert.equal(instance.employeeId, employeeB.body.data.id);

  const movements = await models.StockMovement.findAll({
    where: { documentId: issuanceId, documentType: 'issuance' },
  });
  assert.equal(movements.length, 1, 'движения старой редакции не должны оставаться дублями');

  const events = await models.InstanceEvent.findAll({
    where: { documentId: issuanceId, documentType: 'issuance' },
  });
  assert.equal(events.length, 1);

  const revisedLine = await models.IssuanceLine.findOne({ where: { documentId: issuanceId } });
  assert.equal(Number(revisedLine.priceWithoutVatSnapshot), 1000, 'цена должна быть пересчитана');
});

test('выдача: редакция блокируется, если по экземпляру уже есть возврат', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `IssRevBlock-${Date.now()}`;

  const state = {
    instanceIds: [],
    issuanceIds: [],
    receivingIds: [],
    returnIds: [],
    batchIds: [],
    employeeIds: [],
  };
  t.after(async () => {
    if (state.issuanceIds.length > 0) {
      await models.DocumentRevision.destroy({
        where: { documentType: 'issuance', documentId: state.issuanceIds },
      });
    }
    if (state.instanceIds.length > 0) {
      await models.StockMovement.destroy({ where: { instanceId: state.instanceIds } });
    }
    if (state.returnIds.length > 0) {
      await models.ReturnDocument.destroy({ where: { id: state.returnIds } });
    }
    if (state.issuanceIds.length > 0) {
      await models.IssuanceDocument.destroy({ where: { id: state.issuanceIds } });
    }
    if (state.instanceIds.length > 0) {
      await models.Instance.destroy({ where: { id: state.instanceIds } });
    }
    if (state.receivingIds.length > 0) {
      await models.ReceivingDocument.destroy({ where: { id: state.receivingIds } });
    }
    if (state.batchIds.length > 0) {
      await models.Batch.destroy({ where: { id: state.batchIds } });
    }
    if (state.employeeIds.length > 0) {
      await models.Employee.destroy({ where: { id: state.employeeIds } });
    }
    await models.Warehouse.destroy({ where: { name: unique } });
    await models.Supplier.destroy({ where: { name: unique } });
    await models.NomenclatureModel.destroy({ where: { name: unique } });
    await models.Size.destroy({ where: { value: unique } });
    await models.Organization.destroy({ where: { name: unique } });
  });

  const org = await auth(agent.post('/api/v1/organizations')).send({ name: unique });
  const warehouse = await auth(agent.post('/api/v1/warehouses')).send({
    organizationId: org.body.data.id,
    name: unique,
  });
  const supplier = await auth(agent.post('/api/v1/suppliers')).send({ name: unique });
  const model = await auth(agent.post('/api/v1/nomenclature-models')).send({
    name: unique,
    sizeType: 'clothing',
  });
  const size = await auth(agent.post('/api/v1/sizes')).send({ type: 'clothing', value: unique });
  const employee = await auth(agent.post('/api/v1/employees')).send({
    organizationId: org.body.data.id,
    fullName: unique,
    hireDate: '2022-01-10',
  });
  state.employeeIds.push(employee.body.data.id);

  const receivingDraft = await auth(agent.post('/api/v1/purchases/receiving')).send({
    supplierId: supplier.body.data.id,
    warehouseId: warehouse.body.data.id,
    documentDate: '2026-01-15',
  });
  const receivingId = receivingDraft.body.data.id;
  state.receivingIds.push(receivingId);
  await auth(agent.post(`/api/v1/purchases/receiving/${receivingId}/lines`)).send({
    modelId: model.body.data.id,
    sizeId: size.body.data.id,
    quantity: 1,
    purchasePrice: 1500,
  });
  const receivingPosted = await auth(agent.post(`/api/v1/purchases/receiving/${receivingId}/post`));
  assert.equal(receivingPosted.status, 200);
  state.batchIds.push(receivingPosted.body.data.batchId);
  const instance = await models.Instance.findOne({ where: { modelId: model.body.data.id } });
  state.instanceIds.push(instance.id);

  const issuanceDraft = await auth(agent.post('/api/v1/issuance/documents')).send({
    employeeId: employee.body.data.id,
    warehouseId: warehouse.body.data.id,
    documentDate: '2026-01-16',
  });
  const issuanceId = issuanceDraft.body.data.id;
  state.issuanceIds.push(issuanceId);
  await auth(agent.post(`/api/v1/issuance/documents/${issuanceId}/lines`)).send({
    modelId: model.body.data.id,
    sizeId: size.body.data.id,
    quantity: 1,
  });
  const issuancePosted = await auth(agent.post(`/api/v1/issuance/documents/${issuanceId}/post`));
  assert.equal(issuancePosted.status, 200);

  const returnDraft = await auth(agent.post('/api/v1/issuance/returns')).send({
    employeeId: employee.body.data.id,
    warehouseId: warehouse.body.data.id,
    documentDate: '2026-01-17',
  });
  const returnId = returnDraft.body.data.id;
  state.returnIds.push(returnId);
  await auth(agent.post(`/api/v1/issuance/returns/${returnId}/lines`)).send({
    instanceId: instance.id,
    condition: 'good',
  });
  const returnPosted = await auth(agent.post(`/api/v1/issuance/returns/${returnId}/post`));
  assert.equal(returnPosted.status, 200);

  const revised = await auth(agent.post(`/api/v1/issuance/documents/${issuanceId}/revise`)).send({
    header: {
      employeeId: employee.body.data.id,
      warehouseId: warehouse.body.data.id,
      documentDate: '2026-01-16',
    },
    lines: [{ modelId: model.body.data.id, sizeId: size.body.data.id, quantity: 1 }],
  });
  assert.equal(revised.status, 409);
  const blockingDocuments = revised.body.error.details.blockingDocuments;
  assert.equal(blockingDocuments.length, 1);
  assert.equal(blockingDocuments[0].documentType, 'return');
  assert.equal(blockingDocuments[0].number, returnPosted.body.data.number);
});

test('выдача: недостаточно остатка в редакции откатывает всю транзакцию', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `IssRevRoll-${Date.now()}`;

  const state = {
    instanceIds: [],
    issuanceIds: [],
    receivingIds: [],
    batchIds: [],
    employeeIds: [],
  };
  t.after(async () => {
    if (state.issuanceIds.length > 0) {
      await models.DocumentRevision.destroy({
        where: { documentType: 'issuance', documentId: state.issuanceIds },
      });
    }
    if (state.instanceIds.length > 0) {
      await models.StockMovement.destroy({ where: { instanceId: state.instanceIds } });
    }
    if (state.issuanceIds.length > 0) {
      await models.IssuanceDocument.destroy({ where: { id: state.issuanceIds } });
    }
    if (state.instanceIds.length > 0) {
      await models.Instance.destroy({ where: { id: state.instanceIds } });
    }
    if (state.receivingIds.length > 0) {
      await models.ReceivingDocument.destroy({ where: { id: state.receivingIds } });
    }
    if (state.batchIds.length > 0) {
      await models.Batch.destroy({ where: { id: state.batchIds } });
    }
    if (state.employeeIds.length > 0) {
      await models.Employee.destroy({ where: { id: state.employeeIds } });
    }
    await models.Warehouse.destroy({ where: { name: unique } });
    await models.Supplier.destroy({ where: { name: unique } });
    await models.NomenclatureModel.destroy({ where: { name: unique } });
    await models.Size.destroy({ where: { value: unique } });
    await models.Organization.destroy({ where: { name: unique } });
  });

  const org = await auth(agent.post('/api/v1/organizations')).send({ name: unique });
  const warehouse = await auth(agent.post('/api/v1/warehouses')).send({
    organizationId: org.body.data.id,
    name: unique,
  });
  const supplier = await auth(agent.post('/api/v1/suppliers')).send({ name: unique });
  const model = await auth(agent.post('/api/v1/nomenclature-models')).send({
    name: unique,
    sizeType: 'clothing',
  });
  const size = await auth(agent.post('/api/v1/sizes')).send({ type: 'clothing', value: unique });
  const employee = await auth(agent.post('/api/v1/employees')).send({
    organizationId: org.body.data.id,
    fullName: unique,
    hireDate: '2022-01-10',
  });
  state.employeeIds.push(employee.body.data.id);

  const receivingDraft = await auth(agent.post('/api/v1/purchases/receiving')).send({
    supplierId: supplier.body.data.id,
    warehouseId: warehouse.body.data.id,
    documentDate: '2026-01-15',
  });
  const receivingId = receivingDraft.body.data.id;
  state.receivingIds.push(receivingId);
  await auth(agent.post(`/api/v1/purchases/receiving/${receivingId}/lines`)).send({
    modelId: model.body.data.id,
    sizeId: size.body.data.id,
    quantity: 1,
    purchasePrice: 1500,
  });
  const receivingPosted = await auth(agent.post(`/api/v1/purchases/receiving/${receivingId}/post`));
  assert.equal(receivingPosted.status, 200);
  state.batchIds.push(receivingPosted.body.data.batchId);
  const instance = await models.Instance.findOne({ where: { modelId: model.body.data.id } });
  state.instanceIds.push(instance.id);

  const issuanceDraft = await auth(agent.post('/api/v1/issuance/documents')).send({
    employeeId: employee.body.data.id,
    warehouseId: warehouse.body.data.id,
    documentDate: '2026-01-16',
  });
  const issuanceId = issuanceDraft.body.data.id;
  state.issuanceIds.push(issuanceId);
  await auth(agent.post(`/api/v1/issuance/documents/${issuanceId}/lines`)).send({
    modelId: model.body.data.id,
    sizeId: size.body.data.id,
    quantity: 1,
  });
  const issuancePosted = await auth(agent.post(`/api/v1/issuance/documents/${issuanceId}/post`));
  assert.equal(issuancePosted.status, 200);

  const revised = await auth(agent.post(`/api/v1/issuance/documents/${issuanceId}/revise`)).send({
    header: {
      employeeId: employee.body.data.id,
      warehouseId: warehouse.body.data.id,
      documentDate: '2026-01-16',
    },
    lines: [{ modelId: model.body.data.id, sizeId: size.body.data.id, quantity: 2 }],
  });
  assert.equal(revised.status, 400);

  await instance.reload();
  assert.equal(instance.status, 'issued', 'откат должен вернуть экземпляр в исходное состояние');
  assert.equal(instance.employeeId, employee.body.data.id);

  const documentAfter = await models.IssuanceDocument.findByPk(issuanceId);
  assert.equal(documentAfter.revisionNumber, 1);
});

test('выдача: редакция помечает затронутый месячный акт как требующий пересчёта', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `IssRevStale-${Date.now()}`;

  const state = {
    instanceIds: [],
    issuanceIds: [],
    receivingIds: [],
    batchIds: [],
    employeeIds: [],
    dpoId: null,
    actId: null,
  };
  t.after(async () => {
    if (state.actId) {
      await models.MonthlyRentalAct.destroy({ where: { id: state.actId } });
    }
    if (state.issuanceIds.length > 0) {
      await models.DocumentRevision.destroy({
        where: { documentType: 'issuance', documentId: state.issuanceIds },
      });
    }
    if (state.instanceIds.length > 0) {
      await models.StockMovement.destroy({ where: { instanceId: state.instanceIds } });
    }
    if (state.issuanceIds.length > 0) {
      await models.IssuanceDocument.destroy({ where: { id: state.issuanceIds } });
    }
    if (state.instanceIds.length > 0) {
      await models.Instance.destroy({ where: { id: state.instanceIds } });
    }
    if (state.receivingIds.length > 0) {
      await models.ReceivingDocument.destroy({ where: { id: state.receivingIds } });
    }
    if (state.batchIds.length > 0) {
      await models.Batch.destroy({ where: { id: state.batchIds } });
    }
    if (state.employeeIds.length > 0) {
      await models.EmployeeDpoAssignment.destroy({ where: { employeeId: state.employeeIds } });
      await models.Employee.destroy({ where: { id: state.employeeIds } });
    }
    if (state.dpoId) {
      await models.Dpo.destroy({ where: { id: state.dpoId } });
    }
    await models.Warehouse.destroy({ where: { name: unique } });
    await models.Supplier.destroy({ where: { name: unique } });
    await models.NomenclatureModel.destroy({ where: { name: unique } });
    await models.Size.destroy({ where: { value: unique } });
    await models.Organization.destroy({ where: { name: unique } });
  });

  const org = await auth(agent.post('/api/v1/organizations')).send({ name: unique });
  const warehouse = await auth(agent.post('/api/v1/warehouses')).send({
    organizationId: org.body.data.id,
    name: unique,
  });
  const supplier = await auth(agent.post('/api/v1/suppliers')).send({ name: unique });
  const model = await auth(agent.post('/api/v1/nomenclature-models')).send({
    name: unique,
    sizeType: 'clothing',
  });
  const size = await auth(agent.post('/api/v1/sizes')).send({ type: 'clothing', value: unique });
  const dpo = await auth(agent.post('/api/v1/dpo')).send({
    name: unique,
    fullName: `${unique} — заказчик`,
  });
  state.dpoId = dpo.body.data.id;
  const employee = await auth(agent.post('/api/v1/employees')).send({
    organizationId: org.body.data.id,
    dpoId: state.dpoId,
    fullName: unique,
    hireDate: '2026-01-01',
  });
  state.employeeIds.push(employee.body.data.id);

  const receivingDraft = await auth(agent.post('/api/v1/purchases/receiving')).send({
    supplierId: supplier.body.data.id,
    warehouseId: warehouse.body.data.id,
    documentDate: '2026-02-01',
  });
  const receivingId = receivingDraft.body.data.id;
  state.receivingIds.push(receivingId);
  await auth(agent.post(`/api/v1/purchases/receiving/${receivingId}/lines`)).send({
    modelId: model.body.data.id,
    sizeId: size.body.data.id,
    quantity: 1,
    purchasePrice: 1500,
  });
  const receivingPosted = await auth(agent.post(`/api/v1/purchases/receiving/${receivingId}/post`));
  assert.equal(receivingPosted.status, 200);
  state.batchIds.push(receivingPosted.body.data.batchId);
  const instance = await models.Instance.findOne({ where: { modelId: model.body.data.id } });
  state.instanceIds.push(instance.id);

  const act = await models.MonthlyRentalAct.create({
    dpoId: state.dpoId,
    reportMonth: '2026-02-01',
    snapshot: {},
    generatedAt: new Date(),
    isStale: false,
  });
  state.actId = act.id;

  const issuanceDraft = await auth(agent.post('/api/v1/issuance/documents')).send({
    employeeId: employee.body.data.id,
    warehouseId: warehouse.body.data.id,
    documentDate: '2026-02-05',
  });
  const issuanceId = issuanceDraft.body.data.id;
  state.issuanceIds.push(issuanceId);
  await auth(agent.post(`/api/v1/issuance/documents/${issuanceId}/lines`)).send({
    modelId: model.body.data.id,
    sizeId: size.body.data.id,
    quantity: 1,
  });
  const issuancePosted = await auth(agent.post(`/api/v1/issuance/documents/${issuanceId}/post`));
  assert.equal(issuancePosted.status, 200);

  await act.reload();
  assert.equal(
    act.isStale,
    false,
    'проведение без правки не должно трогать уже зафиксированный акт',
  );

  const revised = await auth(agent.post(`/api/v1/issuance/documents/${issuanceId}/revise`)).send({
    header: {
      employeeId: employee.body.data.id,
      warehouseId: warehouse.body.data.id,
      documentDate: '2026-02-10',
    },
    lines: [{ modelId: model.body.data.id, sizeId: size.body.data.id, quantity: 1 }],
  });
  assert.equal(revised.status, 200);

  await act.reload();
  assert.equal(act.isStale, true, 'редакция должна пометить акт как требующий пересчёта');
  assert.ok(act.staleAt);
});

test('выдача: редакция черновика через /revise отклоняется', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `IssRevDraft-${Date.now()}`;

  const state = { employeeIds: [], issuanceDocumentId: null };
  t.after(async () => {
    if (state.issuanceDocumentId) {
      await models.IssuanceDocument.destroy({ where: { id: state.issuanceDocumentId } });
    }
    if (state.employeeIds.length > 0) {
      await models.Employee.destroy({ where: { id: state.employeeIds } });
    }
    await models.Warehouse.destroy({ where: { name: unique } });
    await models.Organization.destroy({ where: { name: unique } });
  });

  const org = await auth(agent.post('/api/v1/organizations')).send({ name: unique });
  const warehouse = await auth(agent.post('/api/v1/warehouses')).send({
    organizationId: org.body.data.id,
    name: unique,
  });
  const employee = await auth(agent.post('/api/v1/employees')).send({
    organizationId: org.body.data.id,
    fullName: unique,
    hireDate: '2022-01-10',
  });
  state.employeeIds.push(employee.body.data.id);

  const draft = await auth(agent.post('/api/v1/issuance/documents')).send({
    employeeId: employee.body.data.id,
    warehouseId: warehouse.body.data.id,
    documentDate: '2026-01-15',
  });
  const documentId = draft.body.data.id;
  state.issuanceDocumentId = documentId;

  const revised = await auth(agent.post(`/api/v1/issuance/documents/${documentId}/revise`)).send({
    header: {
      employeeId: employee.body.data.id,
      warehouseId: warehouse.body.data.id,
      documentDate: '2026-01-15',
    },
    lines: [{ modelId: '00000000-0000-4000-8000-000000000000', quantity: 1 }],
  });
  assert.equal(revised.status, 409);
});
