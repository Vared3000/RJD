// Требует применённых миграций и сида (pnpm db:migrate && pnpm db:seed).
// Задача 22: редактирование проведённого документа "Поступление".
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

test('поступление: чистая редакция без зависимостей пересоздаёт экземпляры и увеличивает редакцию', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `RcvRevClean-${Date.now()}`;

  const state = { instanceIds: [], documentIds: [], batchIds: [] };
  t.after(async () => {
    if (state.documentIds.length > 0) {
      await models.DocumentRevision.destroy({
        where: { documentType: 'receiving', documentId: state.documentIds },
      });
    }
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

  const draft = await auth(agent.post('/api/v1/purchases/receiving')).send({
    supplierId: supplier.body.data.id,
    warehouseId: warehouse.body.data.id,
    documentDate: '2026-01-15',
  });
  const documentId = draft.body.data.id;
  state.documentIds.push(documentId);

  await auth(agent.post(`/api/v1/purchases/receiving/${documentId}/lines`)).send({
    modelId: model.body.data.id,
    sizeId: size.body.data.id,
    quantity: 2,
    purchasePrice: 1500,
  });
  const posted = await auth(agent.post(`/api/v1/purchases/receiving/${documentId}/post`));
  assert.equal(posted.status, 200);
  assert.equal(posted.body.data.revisionNumber, 1);
  state.batchIds.push(posted.body.data.batchId);

  const oldInstances = await models.Instance.findAll({ where: { modelId: model.body.data.id } });
  assert.equal(oldInstances.length, 2);
  const oldInstanceIds = oldInstances.map((instance) => instance.id);
  state.instanceIds.push(...oldInstanceIds);

  const revised = await auth(agent.post(`/api/v1/purchases/receiving/${documentId}/revise`)).send({
    header: {
      supplierId: supplier.body.data.id,
      warehouseId: warehouse.body.data.id,
      documentDate: '2026-01-20',
    },
    lines: [
      {
        modelId: model.body.data.id,
        sizeId: size.body.data.id,
        quantity: 3,
        purchasePrice: 2000,
      },
    ],
    reason: 'Исправлена цена и количество',
  });
  assert.equal(revised.status, 200);
  assert.equal(revised.body.data.revisionNumber, 2);
  assert.equal(revised.body.data.documentDate, '2026-01-20');
  assert.ok(revised.body.data.lastRevisedAt);

  const survivingOld = await models.Instance.findAll({ where: { id: oldInstanceIds } });
  assert.equal(survivingOld.length, 0, 'старые экземпляры должны быть удалены, а не задублированы');

  const newInstances = await models.Instance.findAll({ where: { modelId: model.body.data.id } });
  assert.equal(newInstances.length, 3, 'должно быть создано ровно 3 новых экземпляра');
  state.instanceIds.push(...newInstances.map((instance) => instance.id));
  for (const instance of newInstances) {
    assert.equal(Number(instance.cost), 2000);
    assert.equal(instance.status, 'in_stock');
  }

  const movements = await models.StockMovement.findAll({
    where: { documentId, documentType: 'receiving' },
  });
  assert.equal(movements.length, 3, 'движения старой редакции не должны оставаться дублями');

  const events = await models.InstanceEvent.findAll({
    where: { documentId, documentType: 'receiving' },
  });
  assert.equal(events.length, 3);

  const revision = await models.DocumentRevision.findOne({
    where: { documentType: 'receiving', documentId, revisionNumber: 2 },
  });
  assert.ok(revision, 'должна быть создана запись в журнале редакций');
  assert.equal(revision.previousData.lines.length, 1);
  assert.equal(revision.newData.lines.length, 1);
  assert.equal(revision.reason, 'Исправлена цена и количество');
});

test('поступление: редакция блокируется, если по экземпляру уже есть более поздний документ', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `RcvRevBlock-${Date.now()}`;

  const state = { instanceIds: [], receivingIds: [], issuanceIds: [], batchIds: [] };
  t.after(async () => {
    if (state.receivingIds.length > 0) {
      await models.DocumentRevision.destroy({
        where: { documentType: 'receiving', documentId: state.receivingIds },
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
    await models.Employee.destroy({ where: { fullName: unique } });
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

  const revised = await auth(agent.post(`/api/v1/purchases/receiving/${receivingId}/revise`)).send({
    header: {
      supplierId: supplier.body.data.id,
      warehouseId: warehouse.body.data.id,
      documentDate: '2026-01-15',
    },
    lines: [
      { modelId: model.body.data.id, sizeId: size.body.data.id, quantity: 2, purchasePrice: 1500 },
    ],
  });
  assert.equal(revised.status, 409);
  const blockingDocuments = revised.body.error.details.blockingDocuments;
  assert.equal(blockingDocuments.length, 1);
  assert.equal(blockingDocuments[0].documentType, 'issuance');
  assert.equal(blockingDocuments[0].number, issuancePosted.body.data.number);

  const documentAfter = await models.ReceivingDocument.findByPk(receivingId);
  assert.equal(documentAfter.revisionNumber, 1, 'заблокированная редакция не должна применяться');
});

test('поступление: ошибка в середине перепроведения откатывает всю транзакцию', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `RcvRevRoll-${Date.now()}`;

  const state = { instanceIds: [], documentIds: [], batchIds: [] };
  t.after(async () => {
    if (state.documentIds.length > 0) {
      await models.DocumentRevision.destroy({
        where: { documentType: 'receiving', documentId: state.documentIds },
      });
    }
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
    await models.Warehouse.destroy({ where: { name: unique } });
    await models.Supplier.destroy({ where: { name: unique } });
    await models.NomenclatureModel.destroy({ where: { name: unique } });
    await models.Organization.destroy({ where: { name: unique } });
  });

  const org = await auth(agent.post('/api/v1/organizations')).send({ name: unique });
  const warehouse = await auth(agent.post('/api/v1/warehouses')).send({
    organizationId: org.body.data.id,
    name: unique,
  });
  const supplier = await auth(agent.post('/api/v1/suppliers')).send({ name: unique });
  const model = await auth(agent.post('/api/v1/nomenclature-models')).send({ name: unique });

  const draft = await auth(agent.post('/api/v1/purchases/receiving')).send({
    supplierId: supplier.body.data.id,
    warehouseId: warehouse.body.data.id,
    documentDate: '2026-01-15',
  });
  const documentId = draft.body.data.id;
  state.documentIds.push(documentId);
  await auth(agent.post(`/api/v1/purchases/receiving/${documentId}/lines`)).send({
    modelId: model.body.data.id,
    quantity: 1,
    purchasePrice: 100,
  });
  const posted = await auth(agent.post(`/api/v1/purchases/receiving/${documentId}/post`));
  assert.equal(posted.status, 200);
  state.batchIds.push(posted.body.data.batchId);

  const oldInstances = await models.Instance.findAll({ where: { modelId: model.body.data.id } });
  const oldInstanceIds = oldInstances.map((instance) => instance.id);
  state.instanceIds.push(...oldInstanceIds);
  const oldMovementsCount = await models.StockMovement.count({
    where: { documentId, documentType: 'receiving' },
  });

  const failedRevise = await auth(
    agent.post(`/api/v1/purchases/receiving/${documentId}/revise`),
  ).send({
    header: {
      supplierId: supplier.body.data.id,
      warehouseId: warehouse.body.data.id,
      documentDate: '2026-01-16',
    },
    lines: [
      {
        modelId: '00000000-0000-4000-8000-000000000000',
        quantity: 1,
        purchasePrice: 100,
      },
    ],
  });
  assert.equal(failedRevise.status, 400);

  const survivingInstances = await models.Instance.findAll({ where: { id: oldInstanceIds } });
  assert.equal(survivingInstances.length, 1, 'старый экземпляр должен сохраниться после отката');
  assert.equal(survivingInstances[0].status, 'in_stock');
  assert.equal(survivingInstances[0].warehouseId, warehouse.body.data.id);

  const movementsAfter = await models.StockMovement.count({
    where: { documentId, documentType: 'receiving' },
  });
  assert.equal(movementsAfter, oldMovementsCount, 'движения не должны измениться после отката');

  const documentAfter = await models.ReceivingDocument.findByPk(documentId);
  assert.equal(documentAfter.revisionNumber, 1);
});

test('поступление: редакция черновика через /revise отклоняется', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `RcvRevDraft-${Date.now()}`;

  const state = { documentId: null };
  t.after(async () => {
    if (state.documentId) {
      await models.ReceivingDocument.destroy({ where: { id: state.documentId } });
    }
    await models.Warehouse.destroy({ where: { name: unique } });
    await models.Supplier.destroy({ where: { name: unique } });
    await models.Organization.destroy({ where: { name: unique } });
  });

  const org = await auth(agent.post('/api/v1/organizations')).send({ name: unique });
  const warehouse = await auth(agent.post('/api/v1/warehouses')).send({
    organizationId: org.body.data.id,
    name: unique,
  });
  const supplier = await auth(agent.post('/api/v1/suppliers')).send({ name: unique });

  const draft = await auth(agent.post('/api/v1/purchases/receiving')).send({
    supplierId: supplier.body.data.id,
    warehouseId: warehouse.body.data.id,
    documentDate: '2026-01-15',
  });
  const documentId = draft.body.data.id;
  state.documentId = documentId;

  const revised = await auth(agent.post(`/api/v1/purchases/receiving/${documentId}/revise`)).send({
    header: {
      supplierId: supplier.body.data.id,
      warehouseId: warehouse.body.data.id,
      documentDate: '2026-01-15',
    },
    lines: [{ modelId: '00000000-0000-4000-8000-000000000000', quantity: 1, purchasePrice: 1 }],
  });
  assert.equal(revised.status, 409);
});

test('поступление: редакция без права purchases.manage отклоняется', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `RcvRevPerm-${Date.now()}`;

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
    await models.Warehouse.destroy({ where: { name: unique } });
    await models.Supplier.destroy({ where: { name: unique } });
    await models.NomenclatureModel.destroy({ where: { name: unique } });
    await models.Organization.destroy({ where: { name: unique } });
  });

  const org = await auth(agent.post('/api/v1/organizations')).send({ name: unique });
  const warehouse = await auth(agent.post('/api/v1/warehouses')).send({
    organizationId: org.body.data.id,
    name: unique,
  });
  const supplier = await auth(agent.post('/api/v1/suppliers')).send({ name: unique });
  const model = await auth(agent.post('/api/v1/nomenclature-models')).send({ name: unique });

  const draft = await auth(agent.post('/api/v1/purchases/receiving')).send({
    supplierId: supplier.body.data.id,
    warehouseId: warehouse.body.data.id,
    documentDate: '2026-01-15',
  });
  const documentId = draft.body.data.id;
  state.documentIds.push(documentId);
  await auth(agent.post(`/api/v1/purchases/receiving/${documentId}/lines`)).send({
    modelId: model.body.data.id,
    quantity: 1,
    purchasePrice: 100,
  });
  const posted = await auth(agent.post(`/api/v1/purchases/receiving/${documentId}/post`));
  assert.equal(posted.status, 200);
  state.batchIds.push(posted.body.data.batchId);
  const instances = await models.Instance.findAll({ where: { modelId: model.body.data.id } });
  state.instanceIds.push(...instances.map((instance) => instance.id));

  const rolesRes = await auth(agent.get('/api/v1/admin/roles'));
  const viewerRole = rolesRes.body.data.find((role) => role.code === 'viewer');
  assert.ok(viewerRole, 'ожидалась сидированная роль viewer (без purchases.manage)');
  const limitedLogin = `revlimited${Date.now()}`;
  const limitedUser = await auth(agent.post('/api/v1/admin/users')).send({
    login: limitedLogin,
    password: 'Passw0rd123',
    fullName: 'Ограниченный Пользователь',
    roleId: viewerRole.id,
  });
  assert.equal(limitedUser.status, 201);
  t.after(() => models.User.destroy({ where: { id: limitedUser.body.data.id } }));

  const limitedAgent = request.agent(createApp());
  const limitedLoginRes = await limitedAgent
    .post('/api/v1/auth/login')
    .send({ login: limitedLogin, password: 'Passw0rd123' });
  const limitedToken = limitedLoginRes.body.data.accessToken;

  const forbidden = await limitedAgent
    .post(`/api/v1/purchases/receiving/${documentId}/revise`)
    .set('Authorization', `Bearer ${limitedToken}`)
    .send({
      header: {
        supplierId: supplier.body.data.id,
        warehouseId: warehouse.body.data.id,
        documentDate: '2026-01-15',
      },
      lines: [{ modelId: model.body.data.id, quantity: 1, purchasePrice: 100 }],
    });
  assert.equal(forbidden.status, 403);
});
