// Требует применённых миграций и сида (pnpm db:migrate && pnpm db:seed)
// с учётной записью BOOTSTRAP_ADMIN_LOGIN / BOOTSTRAP_ADMIN_PASSWORD из .env.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { sequelize } from '../database/models/index.js';

test('логин -> me -> refresh -> logout', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск интеграционного теста');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);

  const loginRes = await agent
    .post('/api/v1/auth/login')
    .send({ login: env.BOOTSTRAP_ADMIN_LOGIN, password: env.BOOTSTRAP_ADMIN_PASSWORD });
  assert.equal(loginRes.status, 200);
  assert.ok(loginRes.body.data.accessToken);
  assert.equal(loginRes.body.data.user.role.code, 'admin');

  const { accessToken } = loginRes.body.data;

  const meRes = await agent.get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
  assert.equal(meRes.status, 200);
  assert.equal(meRes.body.data.user.login, env.BOOTSTRAP_ADMIN_LOGIN);

  const refreshRes = await agent.post('/api/v1/auth/refresh');
  assert.equal(refreshRes.status, 200);
  assert.ok(refreshRes.body.data.accessToken);

  const logoutRes = await agent.post('/api/v1/auth/logout');
  assert.equal(logoutRes.status, 200);

  const refreshAfterLogout = await agent.post('/api/v1/auth/refresh');
  assert.equal(refreshAfterLogout.status, 401);

  await sequelize.close();
});
