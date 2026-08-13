import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { models } from '../database/models/index.js';

async function login(agent, loginName, password) {
  const response = await agent.post('/api/v1/auth/login').send({ login: loginName, password });
  assert.equal(response.status, 200);
  return response.body.data.accessToken;
}

test('возврат и списание: отмена проведения, перепроведение, аудит и зависимости', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const adminToken = await login(agent, env.BOOTSTRAP_ADMIN_LOGIN, env.BOOTSTRAP_ADMIN_PASSWORD);
  const admin = (req) => req.set('Authorization', `Bearer ${adminToken}`);
  const unique = `Revision ${Date.now()}`;

  const organization = await models.Organization.create({ name: unique });
  const warehouse = await models.Warehouse.create({
    organizationId: organization.id,
    name: unique,
  });
  const employee = await models.Employee.create({
    organizationId: organization.id,
    fullName: unique,
  });
  const model = await models.NomenclatureModel.create({ name: unique });
  const returnInstance = await models.Instance.create({
    modelId: model.id,
    inventoryNumber: `${unique}-RET`,
    status: 'issued',
    condition: 'good',
    warehouseId: null,
    employeeId: employee.id,
  });
  const writeoffInstance = await models.Instance.create({
    modelId: model.id,
    inventoryNumber: `${unique}-WO`,
    status: 'in_stock',
    condition: 'worn',
    warehouseId: warehouse.id,
  });

  const returnDraft = await admin(agent.post('/api/v1/issuance/returns')).send({
    employeeId: employee.id,
    warehouseId: warehouse.id,
    documentDate: '2026-08-10',
  });
  assert.equal(returnDraft.status, 201);
  const returnId = returnDraft.body.data.id;
  await admin(agent.post(`/api/v1/issuance/returns/${returnId}/lines`)).send({
    instanceId: returnInstance.id,
    condition: 'worn',
    routeTo: 'in_stock',
  });
  const returnPosted = await admin(agent.post(`/api/v1/issuance/returns/${returnId}/post`));
  assert.equal(returnPosted.status, 200);
  assert.equal((await returnInstance.reload()).status, 'in_stock');

  const warehouseRole = await models.Role.findOne({ where: { code: 'warehouse_manager' } });
  const restrictedLogin = `revision-${Date.now()}`;
  const restrictedPassword = 'Passw0rd123';
  const restrictedUser = await admin(agent.post('/api/v1/admin/users')).send({
    login: restrictedLogin,
    password: restrictedPassword,
    fullName: 'Проверка отдельного права',
    roleId: warehouseRole.id,
  });
  assert.equal(restrictedUser.status, 201);
  const restrictedToken = await login(agent, restrictedLogin, restrictedPassword);
  const restrictedUnpost = await agent
    .post(`/api/v1/issuance/returns/${returnId}/unpost`)
    .set('Authorization', `Bearer ${restrictedToken}`)
    .send({});
  assert.equal(restrictedUnpost.status, 403);

  const returnUnposted = await admin(
    agent.post(`/api/v1/issuance/returns/${returnId}/unpost`),
  ).send({ reason: 'Исправление состояния' });
  assert.equal(returnUnposted.status, 200);
  assert.equal(returnUnposted.body.data.status, 'draft');
  assert.equal(returnUnposted.body.data.revisionNumber, 2);
  await returnInstance.reload();
  assert.equal(returnInstance.status, 'issued');
  assert.equal(returnInstance.employeeId, employee.id);
  assert.equal(
    await models.InstanceEvent.count({ where: { documentType: 'return', documentId: returnId } }),
    0,
  );

  const returnReposted = await admin(agent.post(`/api/v1/issuance/returns/${returnId}/post`));
  assert.equal(returnReposted.status, 200);
  assert.equal(returnReposted.body.data.revisionNumber, 3);
  assert.deepEqual(
    (
      await models.DocumentRevision.findAll({
        where: { documentType: 'return', documentId: returnId },
        order: [['revisionNumber', 'ASC']],
      })
    ).map((revision) => revision.action),
    ['unpost', 'repost'],
  );

  const blockerDraft = await admin(agent.post('/api/v1/writeoff/documents')).send({
    warehouseId: warehouse.id,
    documentDate: '2026-08-11',
  });
  const blockerId = blockerDraft.body.data.id;
  await admin(agent.post(`/api/v1/writeoff/documents/${blockerId}/lines`)).send({
    instanceId: returnInstance.id,
    reason: 'Последующая операция',
  });
  await admin(agent.post(`/api/v1/writeoff/documents/${blockerId}/post`));

  const blockedReturn = await admin(agent.post(`/api/v1/issuance/returns/${returnId}/unpost`)).send(
    {},
  );
  assert.equal(blockedReturn.status, 409);
  assert.equal(blockedReturn.body.error.details.blockingDocuments[0].documentId, blockerId);

  const writeoffDraft = await admin(agent.post('/api/v1/writeoff/documents')).send({
    warehouseId: warehouse.id,
    documentDate: '2026-08-12',
  });
  const writeoffId = writeoffDraft.body.data.id;
  await admin(agent.post(`/api/v1/writeoff/documents/${writeoffId}/lines`)).send({
    instanceId: writeoffInstance.id,
    reason: 'Износ',
  });
  await admin(agent.post(`/api/v1/writeoff/documents/${writeoffId}/post`));
  assert.equal((await writeoffInstance.reload()).status, 'write_off');

  const writeoffUnposted = await admin(
    agent.post(`/api/v1/writeoff/documents/${writeoffId}/unpost`),
  ).send({ reason: 'Ошибочное списание' });
  assert.equal(writeoffUnposted.status, 200);
  assert.equal(writeoffUnposted.body.data.status, 'draft');
  await writeoffInstance.reload();
  assert.equal(writeoffInstance.status, 'in_stock');
  assert.equal(writeoffInstance.condition, 'worn');
  assert.equal(writeoffInstance.warehouseId, warehouse.id);
});
