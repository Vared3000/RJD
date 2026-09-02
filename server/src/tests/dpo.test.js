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

test('ДПО: CRUD, поиск, архивация, история изменений', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `Test Dpo ${Date.now()}`;

  const dpoIds = [];
  t.after(async () => {
    if (dpoIds.length > 0) {
      await models.DpoHistory.destroy({ where: { dpoId: dpoIds } });
      await models.Dpo.destroy({ where: { id: dpoIds } });
    }
  });

  // --- Создание ---
  const created = await auth(agent.post('/api/v1/dpo')).send({
    name: unique,
    fullName: `${unique} — структурное подразделение ЦДПО`,
    code: `${unique}-CODE`,
    region: 'Свердловская',
    directorFullName: 'Иванов Иван Иванович',
    directorFullNameGenitive: 'Иванова Ивана Ивановича',
    contractNumber: '686/ОКЭ-ЦДПО/20/1/1',
    contractDate: '2021-02-02',
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.region, 'Свердловская');
  assert.equal(created.body.data.directorFullNameGenitive, 'Иванова Ивана Ивановича');
  const dpoId = created.body.data.id;
  dpoIds.push(dpoId);

  // --- Валидация: fullName обязателен ---
  const invalid = await auth(agent.post('/api/v1/dpo')).send({ name: `${unique} invalid` });
  assert.equal(invalid.status, 400);

  // --- Поиск ---
  const searchHit = await auth(agent.get('/api/v1/dpo')).query({ search: unique });
  assert.equal(searchHit.status, 200);
  assert.equal(searchHit.body.data.length, 1);
  assert.equal(searchHit.body.data[0].id, dpoId);
  assert.equal(searchHit.body.meta.page, 1);
  assert.equal(searchHit.body.meta.total, 1);

  const paginated = await auth(agent.get('/api/v1/dpo')).query({
    search: unique,
    page: 1,
    limit: 1,
    sort: 'name',
    order: 'DESC',
  });
  assert.equal(paginated.status, 200);
  assert.equal(paginated.body.data.length, 1);
  assert.equal(paginated.body.meta.limit, 1);
  const invalidPage = await auth(agent.get('/api/v1/dpo')).query({ page: 0 });
  assert.equal(invalidPage.status, 400);

  const searchMiss = await auth(agent.get('/api/v1/dpo')).query({ search: 'no-such-dpo-xyz' });
  assert.equal(searchMiss.body.data.length, 0);

  // --- Правка №1: меняем ответственное лицо и доп. соглашение ---
  const update1 = await auth(agent.patch(`/api/v1/dpo/${dpoId}`)).send({
    directorFullName: 'Петров Пётр Петрович',
    directorFullNameGenitive: 'Петрова Петра Петровича',
    additionalAgreementNumber: 'ДС-1',
    additionalAgreementDate: '2025-01-10',
    region: 'Московская',
  });
  assert.equal(update1.status, 200);
  assert.equal(update1.body.data.directorFullName, 'Петров Пётр Петрович');
  assert.equal(update1.body.data.directorFullNameGenitive, 'Петрова Петра Петровича');
  assert.equal(update1.body.data.region, 'Московская');

  const historyAfter1 = await auth(agent.get(`/api/v1/dpo/${dpoId}/history`));
  assert.equal(historyAfter1.status, 200);
  assert.equal(historyAfter1.body.data.length, 1);
  assert.equal(historyAfter1.body.data[0].changes.directorFullName.from, 'Иванов Иван Иванович');
  assert.equal(historyAfter1.body.data[0].changes.directorFullName.to, 'Петров Пётр Петрович');
  assert.equal(
    historyAfter1.body.data[0].changes.directorFullNameGenitive.from,
    'Иванова Ивана Ивановича',
  );
  assert.equal(
    historyAfter1.body.data[0].changes.directorFullNameGenitive.to,
    'Петрова Петра Петровича',
  );
  assert.equal(historyAfter1.body.data[0].changes.additionalAgreementNumber.from, null);
  assert.equal(historyAfter1.body.data[0].changes.additionalAgreementNumber.to, 'ДС-1');
  assert.equal(historyAfter1.body.data[0].changes.region.from, 'Свердловская');
  assert.equal(historyAfter1.body.data[0].changes.region.to, 'Московская');

  // --- Правка №2: снова меняем ответственное лицо (второе доп. соглашение) ---
  const update2 = await auth(agent.patch(`/api/v1/dpo/${dpoId}`)).send({
    directorFullName: 'Сидоров Сидор Сидорович',
    additionalAgreementNumber: 'ДС-2',
  });
  assert.equal(update2.status, 200);

  const historyAfter2 = await auth(agent.get(`/api/v1/dpo/${dpoId}/history`));
  assert.equal(historyAfter2.body.data.length, 2);
  // Новые записи первыми.
  assert.equal(historyAfter2.body.data[0].changes.directorFullName.from, 'Петров Пётр Петрович');
  assert.equal(historyAfter2.body.data[0].changes.directorFullName.to, 'Сидоров Сидор Сидорович');
  // Старая запись должна показывать промежуточное значение как "to", а не текущее.
  assert.equal(historyAfter2.body.data[1].changes.directorFullName.from, 'Иванов Иван Иванович');
  assert.equal(historyAfter2.body.data[1].changes.directorFullName.to, 'Петров Пётр Петрович');

  // --- Правка без изменений полей истории не создаёт новую запись ---
  const update3 = await auth(agent.patch(`/api/v1/dpo/${dpoId}`)).send({
    directorFullName: 'Сидоров Сидор Сидорович',
  });
  assert.equal(update3.status, 200);
  const historyAfter3 = await auth(agent.get(`/api/v1/dpo/${dpoId}/history`));
  assert.equal(historyAfter3.body.data.length, 2, 'повтор того же значения не пишет новую запись');

  // --- Архивация/восстановление ---
  const archived = await auth(agent.delete(`/api/v1/dpo/${dpoId}`));
  assert.equal(archived.status, 200);

  const listAfterArchive = await auth(agent.get('/api/v1/dpo')).query({ search: unique });
  assert.equal(listAfterArchive.body.data.length, 0, 'архивная запись не в обычном списке');

  const listWithArchived = await auth(agent.get('/api/v1/dpo')).query({
    search: unique,
    includeArchived: 'true',
  });
  assert.equal(listWithArchived.body.data.length, 1);

  const restored = await auth(agent.patch(`/api/v1/dpo/${dpoId}/restore`));
  assert.equal(restored.status, 200);
  const listAfterRestore = await auth(agent.get('/api/v1/dpo')).query({ search: unique });
  assert.equal(listAfterRestore.body.data.length, 1);
});

test('ДПО: привязка работника (Employee.dpoId)', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `Test DpoEmp ${Date.now()}`;

  const state = { dpoId: null, employeeId: null, organizationId: null };
  t.after(async () => {
    if (state.employeeId) await models.Employee.destroy({ where: { id: state.employeeId } });
    if (state.organizationId) {
      await models.Organization.destroy({ where: { id: state.organizationId } });
    }
    if (state.dpoId) await models.Dpo.destroy({ where: { id: state.dpoId } });
  });

  const dpo = await auth(agent.post('/api/v1/dpo')).send({
    name: unique,
    fullName: `${unique} — структурное подразделение ЦДПО`,
  });
  state.dpoId = dpo.body.data.id;

  const org = await auth(agent.post('/api/v1/organizations')).send({ name: unique });
  state.organizationId = org.body.data.id;

  const employee = await auth(agent.post('/api/v1/employees')).send({
    organizationId: state.organizationId,
    dpoId: state.dpoId,
    fullName: unique,
    hireDate: '2024-01-01',
  });
  assert.equal(employee.status, 201);
  state.employeeId = employee.body.data.id;

  const fetched = await auth(agent.get(`/api/v1/employees/${state.employeeId}`));
  assert.equal(fetched.body.data.dpo.id, state.dpoId);

  // Ссылка на архивированное/несуществующее ДПО отклоняется.
  const badDpoEmployee = await auth(agent.post('/api/v1/employees')).send({
    organizationId: state.organizationId,
    dpoId: '00000000-0000-0000-0000-000000000000',
    fullName: `${unique} 2`,
    hireDate: '2024-01-01',
  });
  assert.equal(badDpoEmployee.status, 400);
});
