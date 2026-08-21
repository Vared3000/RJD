// Требует применённых миграций и сида (pnpm db:migrate && pnpm db:seed).
// Node-тесты запускаются несколькими файлами параллельно (см.
// run-isolated.js) — ни в одном сценарии здесь не изменяется реальный
// bootstrap-администратор (кроме отклонённых попыток, которые не пишут в
// БД), чтобы не ломать логин других файлов, полагающихся на него.
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
  return res.body.data;
}

test('администрирование: CRUD пользователей, пароль, блокировка, последний администратор, сессии', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const { accessToken: adminToken, user: adminUser } = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${adminToken}`);
  const unique = `testadmin${Date.now()}`;

  const state = { userIds: [] };
  t.after(async () => {
    if (state.userIds.length > 0) {
      await models.UserAdminEvent.destroy({ where: { userId: state.userIds } });
      await models.RefreshToken.destroy({ where: { userId: state.userIds } });
      await models.User.destroy({ where: { id: state.userIds } });
    }
  });

  const rolesRes = await auth(agent.get('/api/v1/admin/roles'));
  assert.equal(rolesRes.status, 200);
  const adminRole = rolesRes.body.data.find((r) => r.code === 'admin');
  const viewerRole = rolesRes.body.data.find((r) => r.code === 'viewer');
  assert.ok(adminRole && viewerRole, 'ожидались сидированные роли admin/viewer');

  const permissionsRes = await auth(agent.get('/api/v1/admin/permissions'));
  assert.equal(permissionsRes.status, 200);
  assert.ok(permissionsRes.body.data.some((p) => p.code === 'admin.manage'));

  // --- Последний активный администратор: проверяем ДО создания тестовых
  // администраторов, пока bootstrap — единственный активный обладатель
  // admin.manage в схеме. Попытка отклоняется до записи в БД, поэтому
  // состояние bootstrap не меняется и другие параллельно бегущие файлы не
  // страдают.
  const demoteSoleAdmin = await auth(agent.patch(`/api/v1/admin/users/${adminUser.id}`)).send({
    roleId: viewerRole.id,
  });
  assert.equal(
    demoteSoleAdmin.status,
    400,
    'нельзя понизить единственного активного администратора',
  );

  // --- Требования к сложности пароля ---
  const weakPassword = await auth(agent.post('/api/v1/admin/users')).send({
    login: unique,
    password: 'weak',
    fullName: 'Тестовый Пользователь',
    roleId: viewerRole.id,
  });
  assert.equal(weakPassword.status, 400);

  // --- Создание, passwordHash не возвращается ---
  const created = await auth(agent.post('/api/v1/admin/users')).send({
    login: unique,
    password: 'Passw0rd123',
    fullName: 'Тестовый Пользователь',
    roleId: viewerRole.id,
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.passwordHash, undefined);
  const testUserId = created.body.data.id;
  state.userIds.push(testUserId);

  // Повторный логин отклоняется уникальностью.
  const dupLogin = await auth(agent.post('/api/v1/admin/users')).send({
    login: unique,
    password: 'Passw0rd123',
    fullName: 'Дубль',
    roleId: viewerRole.id,
  });
  assert.equal(dupLogin.status, 409);

  // --- Поиск ---
  const searchRes = await auth(agent.get('/api/v1/admin/users')).query({ search: unique });
  assert.equal(searchRes.status, 200);
  assert.equal(searchRes.body.data.length, 1);
  assert.equal(searchRes.body.data[0].id, testUserId);

  // --- Редактирование ---
  const updated = await auth(agent.patch(`/api/v1/admin/users/${testUserId}`)).send({
    fullName: 'Изменённое Имя',
    roleId: viewerRole.id,
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.fullName, 'Изменённое Имя');

  // --- Запрет самоблокировки ---
  const selfBlock = await auth(agent.patch(`/api/v1/admin/users/${adminUser.id}`)).send({
    isActive: false,
  });
  assert.equal(selfBlock.status, 400);

  // --- Блокировка отзывает refresh-токены ---
  const testAgent = request.agent(app);
  const testLogin = await testAgent
    .post('/api/v1/auth/login')
    .send({ login: unique, password: 'Passw0rd123' });
  assert.equal(testLogin.status, 200);

  const backupStatus = await auth(agent.get('/api/v1/admin/backup-status'));
  assert.equal(backupStatus.status, 200);
  assert.equal(backupStatus.body.data.targets.length, 3);
  const viewerBackupStatus = await testAgent
    .get('/api/v1/admin/backup-status')
    .set('Authorization', `Bearer ${testLogin.body.data.accessToken}`);
  assert.equal(viewerBackupStatus.status, 403);

  const block = await auth(agent.patch(`/api/v1/admin/users/${testUserId}`)).send({
    isActive: false,
  });
  assert.equal(block.status, 200);
  assert.equal(block.body.data.isActive, false);

  const refreshAfterBlock = await testAgent.post('/api/v1/auth/refresh');
  assert.equal(refreshAfterBlock.status, 401, 'refresh-токен должен быть отозван блокировкой');

  const loginWhileBlocked = await request
    .agent(app)
    .post('/api/v1/auth/login')
    .send({ login: unique, password: 'Passw0rd123' });
  assert.equal(loginWhileBlocked.status, 401, 'заблокированный пользователь не может войти');

  const unblock = await auth(agent.patch(`/api/v1/admin/users/${testUserId}`)).send({
    isActive: true,
  });
  assert.equal(unblock.status, 200);

  // --- Сброс пароля ---
  const weakReset = await auth(agent.post(`/api/v1/admin/users/${testUserId}/reset-password`)).send(
    { password: 'weak' },
  );
  assert.equal(weakReset.status, 400);

  const reset = await auth(agent.post(`/api/v1/admin/users/${testUserId}/reset-password`)).send({
    password: 'NewPassw0rd1',
  });
  assert.equal(reset.status, 200);

  const oldPasswordLogin = await request
    .agent(app)
    .post('/api/v1/auth/login')
    .send({ login: unique, password: 'Passw0rd123' });
  assert.equal(oldPasswordLogin.status, 401);

  const newPasswordLogin = await request
    .agent(app)
    .post('/api/v1/auth/login')
    .send({ login: unique, password: 'NewPassw0rd1' });
  assert.equal(newPasswordLogin.status, 200);

  // --- Завершение сессий по кнопке (без блокировки) ---
  const sessionAgent = request.agent(app);
  await sessionAgent.post('/api/v1/auth/login').send({ login: unique, password: 'NewPassw0rd1' });
  const revoke = await auth(agent.post(`/api/v1/admin/users/${testUserId}/revoke-sessions`));
  assert.equal(revoke.status, 200);
  const refreshAfterRevoke = await sessionAgent.post('/api/v1/auth/refresh');
  assert.equal(refreshAfterRevoke.status, 401);

  // --- Журнал событий ---
  const events = await auth(agent.get(`/api/v1/admin/users/${testUserId}/events`));
  assert.equal(events.status, 200);
  const eventTypes = events.body.data.map((e) => e.eventType);
  assert.ok(eventTypes.includes('create'));
  assert.ok(eventTypes.includes('block'));
  assert.ok(eventTypes.includes('unblock'));
  assert.ok(eventTypes.includes('password_reset'));
  assert.ok(eventTypes.includes('sessions_revoked'));

  // --- Последний активный администратор: с другим активным администратором
  // действие разрешено (bootstrap остаётся вторым). testAdmin — отдельный
  // от testUserId пользователь, чтобы не смешивать сценарии.
  const testAdmin = await auth(agent.post('/api/v1/admin/users')).send({
    login: `${unique}admin`,
    password: 'Passw0rd123',
    fullName: 'Тестовый Администратор',
    roleId: adminRole.id,
  });
  assert.equal(testAdmin.status, 201);
  const testAdminId = testAdmin.body.data.id;
  state.userIds.push(testAdminId);

  const blockOtherAdmin = await auth(agent.patch(`/api/v1/admin/users/${testAdminId}`)).send({
    isActive: false,
  });
  assert.equal(blockOtherAdmin.status, 200, 'bootstrap остаётся активным администратором');
});
