// Требует применённых миграций и сида (pnpm db:migrate && pnpm db:seed).
// Релиз Д (docs/TZ_NEXT_RELEASES_2026-08-19.md): доукомплектовка как
// полноценная отдельная выдача — "Оформить довыдачу" создаёт обычный
// черновик Выдачи из открытых задач, задачи закрываются только по факту
// успешного проведения этого черновика (частично или полностью).
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

// Создаёт организацию/ДПО/склад/поставщика/размер/модель/работника — общий
// каркас для всех сценариев ниже, без остатка на складе (остаток заводится
// точечно через receiveStock/createShortageTask, где он нужен). ДПО с
// реквизитами договора — обязателен для сохранной расписки (сценарий 1),
// остальным сценариям не мешает.
async function createFixture(auth, agent, state, unique) {
  const org = await auth(agent.post('/api/v1/organizations')).send({ name: unique });
  const warehouse = await auth(agent.post('/api/v1/warehouses')).send({
    organizationId: org.body.data.id,
    name: unique,
  });
  const supplier = await auth(agent.post('/api/v1/suppliers')).send({ name: unique });
  const size = await auth(agent.post('/api/v1/sizes')).send({ type: 'clothing', value: unique });
  const model = await auth(agent.post('/api/v1/nomenclature-models')).send({
    name: unique,
    sizeType: 'clothing',
  });
  const dpo = await auth(agent.post('/api/v1/dpo')).send({
    name: unique,
    fullName: `${unique} — заказчик`,
    contractNumber: 'ТЕСТ-Д',
    contractDate: '2026-01-15',
    directorFullName: 'Иванов Иван Иванович',
    directorBasis: 'Устав',
  });
  const employee = await auth(agent.post('/api/v1/employees')).send({
    organizationId: org.body.data.id,
    dpoId: dpo.body.data.id,
    fullName: unique,
    hireDate: '2022-01-10',
  });

  return {
    organizationId: org.body.data.id,
    warehouseId: warehouse.body.data.id,
    supplierId: supplier.body.data.id,
    sizeId: size.body.data.id,
    modelId: model.body.data.id,
    dpoId: dpo.body.data.id,
    employeeId: employee.body.data.id,
  };
}

// Проводит поступление на quantity экземпляров модели/размера fixture —
// отдельным поступлением каждый раз, чтобы можно было точно контролировать,
// сколько именно доступно на складе к моменту конкретного проведения.
async function receiveStock(auth, agent, state, fixture, quantity, documentDate = '2026-08-01') {
  const receiving = await auth(agent.post('/api/v1/purchases/receiving')).send({
    supplierId: fixture.supplierId,
    warehouseId: fixture.warehouseId,
    documentDate,
  });
  state.receivingDocIds.push(receiving.body.data.id);
  await auth(agent.post(`/api/v1/purchases/receiving/${receiving.body.data.id}/lines`)).send({
    modelId: fixture.modelId,
    sizeId: fixture.sizeId,
    quantity,
    purchasePrice: 1000,
  });
  const posted = await auth(
    agent.post(`/api/v1/purchases/receiving/${receiving.body.data.id}/post`),
  );
  state.batchIds.push(posted.body.data.batchId);
  const instances = await models.Instance.findAll({
    where: { modelId: fixture.modelId, status: 'in_stock' },
  });
  state.instanceIds.push(
    ...instances.map((i) => i.id).filter((id) => !state.instanceIds.includes(id)),
  );
}

// Проводит документ Выдачи на requested, предварительно оприходовав ровно
// available — при available < requested (и available > 0, иначе проведение
// отклонится целиком и задача не появится) возникает открытая задача на
// доукомплектовку. Возвращает саму задачу.
async function createShortageTask(auth, agent, state, fixture, { available, requested }) {
  if (available > 0) {
    await receiveStock(auth, agent, state, fixture, available);
  }

  const draft = await auth(agent.post('/api/v1/issuance/documents')).send({
    employeeId: fixture.employeeId,
    warehouseId: fixture.warehouseId,
    documentDate: '2026-08-01',
  });
  const documentId = draft.body.data.id;
  state.issuanceDocIds.push(documentId);
  await auth(agent.post(`/api/v1/issuance/documents/${documentId}/lines`)).send({
    modelId: fixture.modelId,
    sizeId: fixture.sizeId,
    quantity: requested,
  });
  await auth(agent.post(`/api/v1/issuance/documents/${documentId}/post`));

  const openTasks = await auth(agent.get('/api/v1/issuance/tasks')).query({ status: 'open' });
  const task = openTasks.body.data.find(
    (item) => item.sourceDocumentId === documentId && item.modelId === fixture.modelId,
  );
  state.taskIds.push(task.id);
  return task;
}

function baseState() {
  return {
    instanceIds: [],
    issuanceDocIds: [],
    receivingDocIds: [],
    batchIds: [],
    taskIds: [],
  };
}

async function cleanup(state, uniques) {
  if (state.issuanceDocIds.length > 0) {
    await models.DocumentRevision.destroy({
      where: { documentType: 'issuance', documentId: state.issuanceDocIds },
    });
  }
  if (state.taskIds.length > 0) {
    await models.IssuanceTaskFulfillment.destroy({ where: { taskId: state.taskIds } });
    await models.IssuanceTask.destroy({ where: { id: state.taskIds } });
  }
  if (state.instanceIds.length > 0) {
    await models.StockMovement.destroy({ where: { instanceId: state.instanceIds } });
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
  // Двумя проходами: сначала всё, что ссылается на организацию/ДПО (в т.ч.
  // "лишние" склады, заведённые с именем ДРУГОГО unique на организации ПЕРВОГО
  // unique — см. тест про разные склады), затем сами организация и ДПО —
  // иначе RESTRICT на organization_id/dpo_id может сработать раньше времени.
  for (const unique of uniques) {
    await models.Employee.destroy({ where: { fullName: unique } });
    await models.NomenclatureModel.destroy({ where: { name: unique } });
    await models.Size.destroy({ where: { value: unique } });
    await models.Warehouse.destroy({ where: { name: unique } });
    await models.Supplier.destroy({ where: { name: unique } });
  }
  for (const unique of uniques) {
    await models.Organization.destroy({ where: { name: unique } });
    await models.Dpo.destroy({ where: { name: unique } });
  }
}

test('довыдача: одна задача → черновик → проведение → отдельная выдача → сохранная расписка', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }
  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `TaskDraft1 ${Date.now()}`;
  const state = baseState();
  t.after(() => cleanup(state, [unique]));

  const fixture = await createFixture(auth, agent, state, unique);
  const task = await createShortageTask(auth, agent, state, fixture, {
    available: 1,
    requested: 2,
  });
  assert.equal(task.quantity, 1);
  assert.equal(task.status, 'open');

  // Валидация: пустой список и несуществующий id.
  const emptyDraft = await auth(agent.post('/api/v1/issuance/tasks/create-draft')).send({
    taskIds: [],
  });
  assert.equal(emptyDraft.status, 400);
  const missingDraft = await auth(agent.post('/api/v1/issuance/tasks/create-draft')).send({
    taskIds: ['00000000-0000-4000-8000-000000000000'],
  });
  assert.equal(missingDraft.status, 404);

  const created = await auth(agent.post('/api/v1/issuance/tasks/create-draft')).send({
    taskIds: [task.id],
  });
  assert.equal(created.status, 201);
  const documentId = created.body.data.id;
  state.issuanceDocIds.push(documentId);
  assert.equal(created.body.data.status, 'draft');
  assert.equal(created.body.data.employeeId, fixture.employeeId);
  assert.equal(created.body.data.lines.length, 1);
  assert.equal(created.body.data.lines[0].quantity, 1);

  const inProgressTask = await models.IssuanceTask.findByPk(task.id);
  assert.equal(inProgressTask.status, 'in_progress');
  assert.equal(inProgressTask.draftDocumentId, documentId);

  // Довозим недостающую единицу, затем проводим черновик довыдачи штатной
  // кнопкой — не отдельным эндпоинтом.
  await receiveStock(auth, agent, state, fixture, 1, '2026-08-05');

  const posted = await auth(agent.post(`/api/v1/issuance/documents/${documentId}/post`));
  assert.equal(posted.status, 200);
  assert.equal(posted.body.data.status, 'posted');
  assert.equal(posted.body.meta.shortages.length, 0);

  const completedTask = await models.IssuanceTask.findByPk(task.id);
  assert.equal(completedTask.status, 'completed');
  assert.equal(completedTask.quantity, 0);
  assert.equal(completedTask.draftDocumentId, null);

  const fulfillments = await models.IssuanceTaskFulfillment.findAll({ where: { taskId: task.id } });
  assert.equal(fulfillments.length, 1);
  assert.equal(fulfillments[0].documentId, documentId);
  assert.equal(fulfillments[0].quantity, 1);

  const receipt = await auth(agent.get('/api/v1/print-forms/preservation-receipt')).query({
    issuanceId: documentId,
    format: 'xlsx',
  });
  assert.equal(receipt.status, 200);
});

test('довыдача: несколько задач одного работника и склада объединяются в одну выдачу', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }
  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `TaskDraft2 ${Date.now()}`;
  const state = baseState();
  t.after(() => cleanup(state, [unique]));

  const fixture = await createFixture(auth, agent, state, unique);
  // Две отдельные нехватки одного и того же (modelId,sizeId) — из двух разных
  // исходных документов — должны слиться в одну строку черновика довыдачи.
  const taskA = await createShortageTask(auth, agent, state, fixture, {
    available: 1,
    requested: 3,
  });
  const taskB = await createShortageTask(auth, agent, state, fixture, {
    available: 1,
    requested: 2,
  });
  assert.equal(taskA.quantity, 2);
  assert.equal(taskB.quantity, 1);

  const created = await auth(agent.post('/api/v1/issuance/tasks/create-draft')).send({
    taskIds: [taskA.id, taskB.id],
  });
  assert.equal(created.status, 201);
  state.issuanceDocIds.push(created.body.data.id);
  assert.equal(created.body.data.lines.length, 1, 'одинаковый ключ должен слиться в одну строку');
  assert.equal(created.body.data.lines[0].quantity, 3);

  const [reloadedA, reloadedB] = await Promise.all([
    models.IssuanceTask.findByPk(taskA.id),
    models.IssuanceTask.findByPk(taskB.id),
  ]);
  assert.equal(reloadedA.status, 'in_progress');
  assert.equal(reloadedB.status, 'in_progress');
  assert.equal(reloadedA.draftDocumentId, created.body.data.id);
  assert.equal(reloadedB.draftDocumentId, created.body.data.id);
});

test('довыдача: задачи одного работника по разным складам не объединяются', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }
  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `TaskDraft3 ${Date.now()}`;
  const uniqueWarehouse2 = `TaskDraft3b ${Date.now()}`;
  const state = baseState();
  t.after(() => cleanup(state, [unique, uniqueWarehouse2]));

  const fixture = await createFixture(auth, agent, state, unique);
  const warehouse2 = await auth(agent.post('/api/v1/warehouses')).send({
    organizationId: fixture.organizationId,
    name: uniqueWarehouse2,
  });
  const fixture2 = {
    ...fixture,
    warehouseId: warehouse2.body.data.id,
  };

  const taskA = await createShortageTask(auth, agent, state, fixture, {
    available: 1,
    requested: 2,
  });
  const taskB = await createShortageTask(auth, agent, state, fixture2, {
    available: 1,
    requested: 2,
  });

  const created = await auth(agent.post('/api/v1/issuance/tasks/create-draft')).send({
    taskIds: [taskA.id, taskB.id],
  });
  assert.equal(created.status, 400);
});

test('довыдача: двойной клик не создаёт два документа', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }
  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `TaskDraft4 ${Date.now()}`;
  const state = baseState();
  t.after(() => cleanup(state, [unique]));

  const fixture = await createFixture(auth, agent, state, unique);
  const task = await createShortageTask(auth, agent, state, fixture, {
    available: 1,
    requested: 2,
  });

  const first = await auth(agent.post('/api/v1/issuance/tasks/create-draft')).send({
    taskIds: [task.id],
  });
  assert.equal(first.status, 201);
  state.issuanceDocIds.push(first.body.data.id);

  const second = await auth(agent.post('/api/v1/issuance/tasks/create-draft')).send({
    taskIds: [task.id],
  });
  assert.equal(second.status, 409);
});

test('довыдача: удаление черновика возвращает задачи в open', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }
  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `TaskDraft5 ${Date.now()}`;
  const state = baseState();
  t.after(() => cleanup(state, [unique]));

  const fixture = await createFixture(auth, agent, state, unique);
  const task = await createShortageTask(auth, agent, state, fixture, {
    available: 1,
    requested: 2,
  });

  const created = await auth(agent.post('/api/v1/issuance/tasks/create-draft')).send({
    taskIds: [task.id],
  });
  assert.equal(created.status, 201);
  const documentId = created.body.data.id;

  const removed = await auth(agent.delete(`/api/v1/issuance/documents/${documentId}`));
  assert.equal(removed.status, 200);

  const reopened = await models.IssuanceTask.findByPk(task.id);
  assert.equal(reopened.status, 'open');
  assert.equal(reopened.draftDocumentId, null);
  assert.equal(reopened.quantity, 1);
});

test('довыдача: недостаточный остаток при проведении не закрывает задачу', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }
  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `TaskDraft6 ${Date.now()}`;
  const state = baseState();
  t.after(() => cleanup(state, [unique]));

  const fixture = await createFixture(auth, agent, state, unique);
  const task = await createShortageTask(auth, agent, state, fixture, {
    available: 1,
    requested: 2,
  });

  const created = await auth(agent.post('/api/v1/issuance/tasks/create-draft')).send({
    taskIds: [task.id],
  });
  assert.equal(created.status, 201);
  const documentId = created.body.data.id;
  state.issuanceDocIds.push(documentId);

  // Остаток из createShortageTask уже полностью ушёл в исходный документ —
  // на складе сейчас снова нет ни одной штуки, проведение отклоняется целиком.
  const posted = await auth(agent.post(`/api/v1/issuance/documents/${documentId}/post`));
  assert.equal(posted.status, 400);

  const stillInProgress = await models.IssuanceTask.findByPk(task.id);
  assert.equal(stillInProgress.status, 'in_progress');
  assert.equal(stillInProgress.draftDocumentId, documentId);
  assert.equal(stillInProgress.quantity, 1);
});

test('довыдача: частичная довыдача оставляет точный открытый остаток', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }
  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `TaskDraft7 ${Date.now()}`;
  const state = baseState();
  t.after(() => cleanup(state, [unique]));

  const fixture = await createFixture(auth, agent, state, unique);
  const task = await createShortageTask(auth, agent, state, fixture, {
    available: 1,
    requested: 6,
  });
  assert.equal(task.quantity, 5);

  const created = await auth(agent.post('/api/v1/issuance/tasks/create-draft')).send({
    taskIds: [task.id],
  });
  assert.equal(created.status, 201);
  const documentId = created.body.data.id;
  state.issuanceDocIds.push(documentId);
  const lineId = created.body.data.lines[0].id;

  // Кладовщик вручную уменьшает количество в черновике перед проведением.
  await auth(agent.patch(`/api/v1/issuance/documents/${documentId}/lines/${lineId}`)).send({
    quantity: 3,
  });

  await receiveStock(auth, agent, state, fixture, 3, '2026-08-05');

  const posted = await auth(agent.post(`/api/v1/issuance/documents/${documentId}/post`));
  assert.equal(posted.status, 200);
  assert.equal(posted.body.meta.shortages.length, 0);

  const remainder = await models.IssuanceTask.findByPk(task.id);
  assert.equal(remainder.status, 'open');
  assert.equal(remainder.quantity, 2);
  assert.equal(remainder.draftDocumentId, null);
});

test('довыдача: revise() проведённого документа не ломает статус и остаток задачи', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }
  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `TaskDraft8 ${Date.now()}`;
  const state = baseState();
  t.after(() => cleanup(state, [unique]));

  // 3 экземпляра сразу доступны и уходят в исходный документ (нужно 6, есть
  // 3 → выдаётся 3, задача на недостающие 3). Довыдаче по этой задаче нужно
  // ещё 3 — оприходуем их отдельно ниже.
  const fixture = await createFixture(auth, agent, state, unique);
  const task = await createShortageTask(auth, agent, state, fixture, {
    available: 3,
    requested: 6,
  });
  assert.equal(task.quantity, 3);

  await receiveStock(auth, agent, state, fixture, 3, '2026-08-02');

  const created = await auth(agent.post('/api/v1/issuance/tasks/create-draft')).send({
    taskIds: [task.id],
  });
  assert.equal(created.status, 201);
  const documentId = created.body.data.id;
  state.issuanceDocIds.push(documentId);
  assert.equal(created.body.data.lines[0].quantity, 3);

  const posted = await auth(agent.post(`/api/v1/issuance/documents/${documentId}/post`));
  assert.equal(posted.status, 200);
  const completedTask = await models.IssuanceTask.findByPk(task.id);
  assert.equal(completedTask.status, 'completed');
  assert.equal(completedTask.quantity, 0);

  // Правим уже проведённую довыдачу — уменьшаем количество с 3 до 1.
  const revised = await auth(agent.post(`/api/v1/issuance/documents/${documentId}/revise`)).send({
    header: {
      employeeId: fixture.employeeId,
      warehouseId: fixture.warehouseId,
      documentDate: '2026-08-01',
    },
    lines: [{ modelId: fixture.modelId, sizeId: fixture.sizeId, quantity: 1 }],
    reason: 'Ошиблись с количеством',
  });
  assert.equal(revised.status, 200);

  const reopenedTask = await models.IssuanceTask.findByPk(task.id);
  assert.equal(reopenedTask.status, 'open', 'остаток потребности должен вернуться в open');
  assert.equal(
    reopenedTask.quantity,
    2,
    '3 (было закрыто) - 1 (осталось закрыто после revise) = 2',
  );

  const fulfillmentsAfterRevise = await models.IssuanceTaskFulfillment.findAll({
    where: { taskId: task.id },
  });
  assert.equal(
    fulfillmentsAfterRevise.length,
    1,
    'старая запись должна быть заменена новой, не задублирована',
  );
  assert.equal(fulfillmentsAfterRevise[0].quantity, 1);
});
