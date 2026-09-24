import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { models } from '../database/models/index.js';

async function loginAsAdmin(agent) {
  const response = await agent.post('/api/v1/auth/login').send({
    login: env.BOOTSTRAP_ADMIN_LOGIN,
    password: env.BOOTSTRAP_ADMIN_PASSWORD,
  });
  assert.equal(response.status, 200);
  return response.body.data.accessToken;
}

test('возврат: массовый выбор атомарен, защищён от дублей и совместим с одиночным API', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (requestBuilder) => requestBuilder.set('Authorization', `Bearer ${token}`);
  const unique = `Bulk return ${Date.now()}`;

  const organization = await models.Organization.create({ name: unique });
  const warehouse = await models.Warehouse.create({
    organizationId: organization.id,
    name: unique,
  });
  const employee = await models.Employee.create({
    organizationId: organization.id,
    fullName: `${unique} employee`,
  });
  const anotherEmployee = await models.Employee.create({
    organizationId: organization.id,
    fullName: `${unique} another`,
  });
  const model = await models.NomenclatureModel.create({ name: unique });
  const ownInstances = await models.Instance.bulkCreate(
    ['A', 'B', 'C'].map((suffix) => ({
      modelId: model.id,
      inventoryNumber: `${unique}-${suffix}`,
      status: 'issued',
      condition: 'good',
      employeeId: employee.id,
    })),
    { returning: true },
  );
  const foreignInstance = await models.Instance.create({
    modelId: model.id,
    inventoryNumber: `${unique}-FOREIGN`,
    status: 'issued',
    condition: 'good',
    employeeId: anotherEmployee.id,
  });

  const draft = await auth(agent.post('/api/v1/issuance/returns')).send({
    employeeId: employee.id,
    warehouseId: warehouse.id,
    documentDate: '2026-09-20',
  });
  assert.equal(draft.status, 201);
  const documentId = draft.body.data.id;

  t.after(async () => {
    await models.ReturnLine.destroy({ where: { documentId } });
    await models.ReturnDocument.destroy({ where: { id: documentId } });
    await models.Instance.destroy({
      where: { id: [...ownInstances.map((instance) => instance.id), foreignInstance.id] },
    });
    await models.NomenclatureModel.destroy({ where: { id: model.id } });
    await models.Employee.destroy({ where: { id: [employee.id, anotherEmployee.id] } });
    await models.Warehouse.destroy({ where: { id: warehouse.id } });
    await models.Organization.destroy({ where: { id: organization.id } });
  });

  const duplicatedRequest = await auth(
    agent.post(`/api/v1/issuance/returns/${documentId}/lines/bulk`),
  ).send({
    instanceIds: [ownInstances[0].id, ownInstances[0].id],
    condition: 'worn',
    routeTo: 'in_stock',
  });
  assert.equal(duplicatedRequest.status, 400);
  assert.equal(await models.ReturnLine.count({ where: { documentId } }), 0);

  const invalidBatch = await auth(
    agent.post(`/api/v1/issuance/returns/${documentId}/lines/bulk`),
  ).send({
    instanceIds: [ownInstances[0].id, foreignInstance.id],
    condition: 'worn',
    routeTo: 'in_stock',
    note: 'Общее примечание',
  });
  assert.equal(invalidBatch.status, 400);
  assert.match(invalidBatch.body.error.message, /не числится за работником/);
  assert.equal(await models.ReturnLine.count({ where: { documentId } }), 0);

  const payload = {
    instanceIds: [ownInstances[0].id, ownInstances[1].id],
    condition: 'worn',
    routeTo: 'in_stock',
    note: 'Массовый возврат',
  };
  const concurrentResults = await Promise.all([
    auth(agent.post(`/api/v1/issuance/returns/${documentId}/lines/bulk`)).send(payload),
    auth(agent.post(`/api/v1/issuance/returns/${documentId}/lines/bulk`)).send(payload),
  ]);
  assert.deepEqual(concurrentResults.map((response) => response.status).sort(), [201, 400]);
  const bulkLines = await models.ReturnLine.findAll({
    where: { documentId },
    order: [['sortOrder', 'ASC']],
  });
  assert.equal(bulkLines.length, 2);
  assert.deepEqual(
    bulkLines.map((line) => line.instanceId),
    [ownInstances[0].id, ownInstances[1].id],
  );
  assert.ok(bulkLines.every((line) => line.condition === 'worn'));
  assert.ok(bulkLines.every((line) => line.note === 'Массовый возврат'));

  const singleLine = await auth(agent.post(`/api/v1/issuance/returns/${documentId}/lines`)).send({
    instanceId: ownInstances[2].id,
    condition: 'good',
    routeTo: 'in_stock',
  });
  assert.equal(singleLine.status, 201);
  assert.equal(singleLine.body.data.lines.length, 3);
});
