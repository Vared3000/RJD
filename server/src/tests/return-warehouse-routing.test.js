import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { models } from '../database/models/index.js';
import { setupApp } from './print-forms-fixture.js';

async function fixture(t) {
  const { agent, auth } = await setupApp();
  const org = await models.Organization.create({ name: `Р2-${randomUUID()}` });
  const main = await models.Warehouse.create({
    organizationId: org.id,
    name: 'Переименованный основной',
    isPrimaryForReturns: true,
  });
  const returns = await models.Warehouse.create({
    organizationId: org.id,
    name: 'Склад возвратов',
  });
  const employee = await models.Employee.create({
    organizationId: org.id,
    fullName: `Р2-${randomUUID()}`,
  });
  const model = await models.NomenclatureModel.create({ name: `Р2-${randomUUID()}` });
  const instances = await models.Instance.bulkCreate(
    Array.from({ length: 4 }, () => ({
      modelId: model.id,
      inventoryNumber: randomUUID(),
      status: 'issued',
      condition: 'good',
      employeeId: employee.id,
    })),
    { returning: true },
  );
  const docs = [];
  t.after(async () => {
    await models.DocumentRevision.destroy({ where: { documentType: 'return', documentId: docs } });
    await models.StockMovement.destroy({ where: { instanceId: instances.map((i) => i.id) } });
    await models.ReturnDocument.destroy({ where: { id: docs } });
    await models.Instance.destroy({ where: { id: instances.map((i) => i.id) } });
    await models.Employee.destroy({ where: { id: employee.id } });
    await models.NomenclatureModel.destroy({ where: { id: model.id } });
    await models.Warehouse.destroy({ where: { organizationId: org.id } });
    await models.Organization.destroy({ where: { id: org.id } });
  });
  async function draft(warehouseId = returns.id) {
    const res = await auth(agent.post('/api/v1/issuance/returns')).send({
      employeeId: employee.id,
      warehouseId,
      documentDate: '2026-09-25',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    docs.push(res.body.data.id);
    return res.body.data.id;
  }
  const add = (id, data, bulk = false) =>
    auth(agent.post(`/api/v1/issuance/returns/${id}/lines${bulk ? '/bulk' : ''}`)).send(data);
  const post = (id) => auth(agent.post(`/api/v1/issuance/returns/${id}/post`));
  return { agent, auth, org, main, returns, employee, instances, draft, add, post };
}

test('Р2: смешанный возврат, новые на Основной, остальные на выбранный; отмена и повтор', async (t) => {
  const f = await fixture(t);
  const id = await f.draft(f.main.id);
  const newer = await f.add(id, {
    instanceId: f.instances[0].id,
    condition: 'new',
    targetWarehouseId: f.returns.id,
  });
  assert.equal(newer.status, 201);
  assert.equal(newer.body.data.lines[0].targetWarehouseId, f.main.id);
  const bulk = await f.add(
    id,
    {
      instanceIds: [f.instances[1].id, f.instances[2].id],
      condition: 'good',
      targetWarehouseId: f.returns.id,
    },
    true,
  );
  assert.equal(bulk.status, 201, JSON.stringify(bulk.body));
  const repair = await f.add(id, {
    instanceId: f.instances[3].id,
    condition: 'damaged',
    routeTo: 'repair',
    targetWarehouseId: f.returns.id,
  });
  assert.equal(repair.status, 201);
  const posted = await f.post(id);
  assert.equal(posted.status, 200, JSON.stringify(posted.body));
  assert.equal((await f.instances[0].reload()).warehouseId, f.main.id);
  for (const instance of f.instances.slice(1))
    assert.equal((await instance.reload()).warehouseId, f.returns.id);
  assert.equal(f.instances[3].status, 'repair');
  assert.equal(posted.body.data.lines[1].targetWarehouse.name, f.returns.name);
  const movements = await models.StockMovement.findAll({
    where: { documentType: 'return', documentId: id },
  });
  assert.equal(movements.filter((m) => m.toWarehouseId === f.main.id).length, 1);
  assert.equal(movements.filter((m) => m.toWarehouseId === f.returns.id).length, 3);
  const unpost = await f
    .auth(f.agent.post(`/api/v1/issuance/returns/${id}/unpost`))
    .send({ reason: 'Проверка Р2' });
  assert.equal(unpost.status, 200, JSON.stringify(unpost.body));
  for (const instance of f.instances) {
    await instance.reload();
    assert.equal(instance.status, 'issued');
    assert.equal(instance.employeeId, f.employee.id);
    assert.equal(instance.warehouseId, null);
  }
  assert.equal((await f.post(id)).status, 200);
  assert.equal(
    await models.StockMovement.count({ where: { documentType: 'return', documentId: id } }),
    4,
  );
});

test('Р2: нет основного, архивный склад, конфликт нового со стиркой — понятные ошибки без списания', async (t) => {
  const f = await fixture(t);
  const id = await f.draft();
  const incompatible = await f.add(id, {
    instanceId: f.instances[0].id,
    condition: 'new',
    routeTo: 'laundry',
  });
  assert.equal(incompatible.status, 400);
  await f.main.update({ isPrimaryForReturns: false });
  const missing = await f.add(id, { instanceId: f.instances[0].id, condition: 'new' });
  assert.equal(missing.status, 400);
  assert.match(JSON.stringify(missing.body), /не назначен/);
  await f.main.update({ isPrimaryForReturns: true });
  assert.equal((await f.add(id, { instanceId: f.instances[0].id, condition: 'new' })).status, 201);
  await f.main.update({ archivedAt: new Date() });
  assert.equal((await f.post(id)).status, 400);
  assert.equal((await f.instances[0].reload()).status, 'issued');
  assert.equal(
    await models.StockMovement.count({ where: { documentType: 'return', documentId: id } }),
    0,
  );
  await f.returns.update({ archivedAt: new Date() });
  const archived = await f
    .auth(f.agent.post('/api/v1/issuance/returns'))
    .send({ employeeId: f.employee.id, warehouseId: f.returns.id, documentDate: '2026-09-25' });
  assert.equal(archived.status, 400);
});

test('Р2: все активные склады доступны, основной назначается явно и не дублируется', async (t) => {
  const f = await fixture(t);
  const options = await f.auth(f.agent.get('/api/v1/issuance/returns/warehouse-options'));
  assert.equal(options.status, 200);
  assert.ok(options.body.data.some((w) => w.id === f.returns.id));
  assert.ok(options.body.data.some((w) => w.id === f.main.id && w.isPrimaryForReturns));
  const conflict = await f
    .auth(f.agent.patch(`/api/v1/warehouses/${f.returns.id}`))
    .send({ isPrimaryForReturns: true });
  assert.equal(conflict.status, 409);
  const rename = await f
    .auth(f.agent.patch(`/api/v1/warehouses/${f.main.id}`))
    .send({ name: 'Любое новое название' });
  assert.equal(rename.status, 200);
  const id = await f.draft();
  const added = await f.add(
    id,
    { instanceIds: f.instances.map((i) => i.id), condition: 'new' },
    true,
  );
  assert.equal(added.status, 201);
  assert.ok(added.body.data.lines.every((line) => line.targetWarehouseId === f.main.id));
  assert.equal((await f.post(id)).status, 200);
  const unauthorized = await f.agent.get('/api/v1/issuance/returns/warehouse-options');
  assert.equal(unauthorized.status, 401);
});
