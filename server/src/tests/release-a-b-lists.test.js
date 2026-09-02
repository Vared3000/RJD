// Требует применённых миграций и сида (pnpm db:migrate && pnpm db:seed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { models } from '../database/models/index.js';

async function loginAsAdmin(agent) {
  const response = await agent
    .post('/api/v1/auth/login')
    .send({ login: env.BOOTSTRAP_ADMIN_LOGIN, password: env.BOOTSTRAP_ADMIN_PASSWORD });
  return response.body.data.accessToken;
}

test('релизы B3–B5: фильтры поступлений и черновики выдач сверху', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const agent = request.agent(createApp());
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `Release AB ${Date.now()}`;
  const state = {
    receivingIds: [],
    issuanceIds: [],
    employeeId: null,
    warehouseIds: [],
    supplierIds: [],
    organizationId: null,
  };

  t.after(async () => {
    if (state.issuanceIds.length) {
      await models.IssuanceDocument.destroy({ where: { id: state.issuanceIds } });
    }
    if (state.receivingIds.length) {
      await models.ReceivingDocument.destroy({ where: { id: state.receivingIds } });
    }
    if (state.employeeId) await models.Employee.destroy({ where: { id: state.employeeId } });
    if (state.warehouseIds.length) {
      await models.Warehouse.destroy({ where: { id: state.warehouseIds } });
    }
    if (state.supplierIds.length) {
      await models.Supplier.destroy({ where: { id: state.supplierIds } });
    }
    if (state.organizationId) {
      await models.Organization.destroy({ where: { id: state.organizationId } });
    }
  });

  const organization = await auth(agent.post('/api/v1/organizations')).send({ name: unique });
  state.organizationId = organization.body.data.id;
  const warehouse1 = await auth(agent.post('/api/v1/warehouses')).send({
    organizationId: state.organizationId,
    name: `${unique} склад 1`,
  });
  const warehouse2 = await auth(agent.post('/api/v1/warehouses')).send({
    organizationId: state.organizationId,
    name: `${unique} склад 2`,
  });
  state.warehouseIds.push(warehouse1.body.data.id, warehouse2.body.data.id);
  const supplier1 = await auth(agent.post('/api/v1/suppliers')).send({
    name: `${unique} поставщик 1`,
  });
  const supplier2 = await auth(agent.post('/api/v1/suppliers')).send({
    name: `${unique} поставщик 2`,
  });
  state.supplierIds.push(supplier1.body.data.id, supplier2.body.data.id);

  const receiving1 = await auth(agent.post('/api/v1/purchases/receiving')).send({
    supplierId: supplier1.body.data.id,
    warehouseId: warehouse1.body.data.id,
    invoiceNumber: `УПД-${unique}-ONE`,
    documentDate: '2026-06-10',
  });
  const receiving2 = await auth(agent.post('/api/v1/purchases/receiving')).send({
    supplierId: supplier2.body.data.id,
    warehouseId: warehouse2.body.data.id,
    invoiceNumber: `УПД-${unique}-TWO`,
    documentDate: '2026-07-10',
  });
  state.receivingIds.push(receiving1.body.data.id, receiving2.body.data.id);
  await models.ReceivingDocument.update(
    { status: 'posted' },
    { where: { id: receiving2.body.data.id } },
  );

  const filteredReceiving = await auth(agent.get('/api/v1/purchases/receiving')).query({
    supplierId: supplier1.body.data.id,
    warehouseId: warehouse1.body.data.id,
    status: 'draft',
    dateFrom: '2026-06-01',
    dateTo: '2026-06-30',
    search: `${unique}-one`,
  });
  assert.equal(filteredReceiving.status, 200);
  assert.equal(filteredReceiving.body.meta.total, 1);
  assert.equal(filteredReceiving.body.data[0].id, receiving1.body.data.id);
  assert.equal(filteredReceiving.body.data[0].invoiceNumber, `УПД-${unique}-ONE`);

  const supplierSearch = await auth(agent.get('/api/v1/purchases/receiving')).query({
    search: `${unique} поставщик 2`,
  });
  assert.equal(supplierSearch.status, 200);
  assert.ok(supplierSearch.body.data.some((item) => item.id === receiving2.body.data.id));

  const invalidRange = await auth(agent.get('/api/v1/purchases/receiving')).query({
    dateFrom: '2026-07-01',
    dateTo: '2026-06-01',
  });
  assert.equal(invalidRange.status, 400);

  const employee = await auth(agent.post('/api/v1/employees')).send({
    organizationId: state.organizationId,
    fullName: `${unique} работник`,
    hireDate: '2026-01-01',
  });
  state.employeeId = employee.body.data.id;
  const olderDraft = await auth(agent.post('/api/v1/issuance/documents')).send({
    employeeId: state.employeeId,
    warehouseId: warehouse1.body.data.id,
    documentDate: '2026-06-10',
  });
  state.issuanceIds.push(olderDraft.body.data.id);
  await new Promise((resolve) => setTimeout(resolve, 10));
  const newerPosted = await auth(agent.post('/api/v1/issuance/documents')).send({
    employeeId: state.employeeId,
    warehouseId: warehouse1.body.data.id,
    documentDate: '2026-06-11',
  });
  state.issuanceIds.push(newerPosted.body.data.id);
  await models.IssuanceDocument.update(
    { status: 'posted' },
    { where: { id: newerPosted.body.data.id } },
  );

  const issuanceList = await auth(agent.get('/api/v1/issuance/documents')).query({
    employeeId: state.employeeId,
  });
  assert.equal(issuanceList.status, 200);
  assert.deepEqual(
    issuanceList.body.data.map((item) => item.id),
    [olderDraft.body.data.id, newerPosted.body.data.id],
    'черновик должен быть выше более нового проведённого документа',
  );

  const postedOnly = await auth(agent.get('/api/v1/issuance/documents')).query({
    employeeId: state.employeeId,
    status: 'posted',
  });
  assert.equal(postedOnly.status, 200);
  assert.deepEqual(
    postedOnly.body.data.map((item) => item.id),
    [newerPosted.body.data.id],
  );
});
