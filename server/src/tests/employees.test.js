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

test('работники: create с организацией/подразделением/должностью/размером + отклонение неверного типа размера', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `Test Employees ${Date.now()}`;

  t.after(async () => {
    await models.Employee.destroy({ where: { fullName: unique } });
    await models.Subdivision.destroy({ where: { name: unique } });
    await models.Position.destroy({ where: { name: unique } });
    await models.Size.destroy({ where: { value: unique } });
    await models.Organization.destroy({ where: { name: unique } });
  });

  const org = await auth(agent.post('/api/v1/organizations')).send({ name: unique });
  assert.equal(org.status, 201);
  const organizationId = org.body.data.id;

  const otherOrg = await auth(agent.post('/api/v1/organizations')).send({ name: `${unique} 2` });
  const otherOrganizationId = otherOrg.body.data.id;
  t.after(() => models.Organization.destroy({ where: { name: `${unique} 2` } }));

  const subdivision = await auth(agent.post('/api/v1/subdivisions')).send({
    organizationId,
    name: unique,
  });
  assert.equal(subdivision.status, 201);
  const subdivisionId = subdivision.body.data.id;

  const position = await auth(agent.post('/api/v1/positions')).send({ name: unique });
  assert.equal(position.status, 201);
  const positionId = position.body.data.id;

  const size = await auth(agent.post('/api/v1/sizes')).send({ type: 'clothing', value: unique });
  assert.equal(size.status, 201);
  const clothingSizeId = size.body.data.id;

  const badSubdivision = await auth(agent.post('/api/v1/employees')).send({
    organizationId: otherOrganizationId,
    subdivisionId,
    fullName: unique,
    hireDate: '2020-01-15',
  });
  assert.equal(badSubdivision.status, 400);

  const badSizeType = await auth(agent.post('/api/v1/employees')).send({
    organizationId,
    fullName: unique,
    hireDate: '2020-01-15',
    heightSizeId: clothingSizeId,
  });
  assert.equal(badSizeType.status, 400);

  const created = await auth(agent.post('/api/v1/employees')).send({
    organizationId,
    subdivisionId,
    positionId,
    fullName: unique,
    hireDate: '2020-01-15',
    clothingSizeId,
  });
  assert.equal(created.status, 201);
  const employeeId = created.body.data.id;

  const listed = await auth(agent.get('/api/v1/employees'));
  const found = listed.body.data.find((item) => item.id === employeeId);
  assert.ok(found);
  assert.equal(found.organization.id, organizationId);
  assert.equal(found.subdivision.id, subdivisionId);
  assert.equal(found.position.id, positionId);
  assert.equal(found.clothingSize.id, clothingSizeId);

  const archived = await auth(agent.delete(`/api/v1/employees/${employeeId}`));
  assert.equal(archived.status, 200);

  const listAfterArchive = await auth(agent.get('/api/v1/employees'));
  assert.ok(!listAfterArchive.body.data.some((item) => item.id === employeeId));
});
