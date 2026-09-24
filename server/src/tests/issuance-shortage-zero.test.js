import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { models } from '../database/models/index.js';
import { setupApp, setupBaseFixture, cleanupFixtureState } from './print-forms-fixture.js';

async function fixture(t) {
  const { agent, auth } = await setupApp();
  const { state } = await setupBaseFixture({ agent, auth, unique: `R1-${randomUUID()}` });
  const docs = [];
  const extraSizes = [];
  t.after(async () => {
    const tasks = await models.IssuanceTask.findAll({ where: { employeeId: state.employeeId } });
    await models.IssuanceTaskFulfillment.destroy({
      where: { taskId: tasks.map((task) => task.id) },
    });
    await models.IssuanceTask.destroy({ where: { employeeId: state.employeeId } });
    await models.IssuanceDocument.destroy({ where: { id: docs } });
    // Новые поступления ниже используют собственные партии/экземпляры.
    await cleanupFixtureState(state);
    await models.Size.destroy({ where: { id: extraSizes } });
  });
  async function draft(quantity = 2, overrides = {}) {
    const created = await auth(agent.post('/api/v1/issuance/documents')).send({
      employeeId: state.employeeId,
      warehouseId: state.warehouseId,
      documentDate: '2026-09-24',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id;
    docs.push(id);
    const line = await auth(agent.post(`/api/v1/issuance/documents/${id}/lines`)).send({
      modelId: state.modelId,
      sizeId: state.sizeId,
      quantity,
      ...overrides,
    });
    return { id, line };
  }
  const post = (id) => auth(agent.post(`/api/v1/issuance/documents/${id}/post`));
  const tasks = (id) =>
    models.IssuanceTask.findAll({ where: { sourceDocumentId: id, taskType: 'completion' } });
  return { agent, auth, state, docs, extraSizes, draft, post, tasks };
}

test('Р1: нулевой остаток создаёт одну задачу, без движений и сохранки; повтор безопасен', async (t) => {
  const f = await fixture(t);
  const drain = await f.draft(1);
  assert.equal((await f.post(drain.id)).status, 200);
  const { id, line } = await f.draft();
  assert.equal(line.status, 201, 'нулевой остаток не запрещает добавить строку');
  assert.equal((await f.tasks(id)).length, 0, 'черновик не создаёт задачу');
  const attempts = await Promise.all([f.post(id), f.post(id)]);
  assert.deepEqual(attempts.map((x) => x.status).sort(), [200, 409]);
  const result = attempts.find((x) => x.status === 200);
  assert.equal(result.body.data.status, 'posted');
  assert.equal(result.body.data.lines.length, 0);
  assert.equal(result.body.meta.shortages[0].missingQuantity, 2);
  const tasks = await f.tasks(id);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].quantity, 2);
  assert.equal(tasks[0].sizeId, f.state.sizeId);
  assert.equal(tasks[0].employeeId, f.state.employeeId);
  assert.equal(
    await models.StockMovement.count({ where: { documentId: id, documentType: 'issuance' } }),
    0,
  );
  const receipt = await f
    .auth(f.agent.get('/api/v1/print-forms/preservation-receipt'))
    .query({ issuanceId: id, format: 'xlsx' });
  assert.equal(receipt.status, 400, 'без фактических вещей сохранка не формируется');
  const revised = await f.auth(f.agent.post(`/api/v1/issuance/documents/${id}/revise`)).send({
    header: {
      employeeId: f.state.employeeId,
      warehouseId: f.state.warehouseId,
      documentDate: '2026-09-24',
    },
    lines: [{ modelId: f.state.modelId, sizeId: f.state.sizeId, quantity: 1 }],
  });
  assert.equal(revised.status, 409, 'нельзя обойти задачи редактированием пустой выдачи');
});

test('Р1: запрос 2 при остатке 1 выдаёт 1, создаёт задачу на 1 и отдельную довыдачу', async (t) => {
  const f = await fixture(t);
  const { id } = await f.draft();
  const result = await f.post(id);
  assert.equal(result.status, 200);
  assert.equal(result.body.data.lines[0].quantity, 1);
  const [task] = await f.tasks(id);
  assert.equal(task.quantity, 1);
  // Имитируем новое наличие на изолированной базе: экземпляр с уникальным номером.
  const instance = await models.Instance.create({
    modelId: f.state.modelId,
    sizeId: f.state.sizeId,
    warehouseId: f.state.warehouseId,
    inventoryNumber: randomUUID(),
    status: 'in_stock',
  });
  f.state.instanceIds.push(instance.id);
  const completion = await f
    .auth(f.agent.post('/api/v1/issuance/tasks/create-draft'))
    .send({ taskIds: [task.id] });
  assert.equal(completion.status, 201);
  f.docs.push(completion.body.data.id);
  assert.notEqual(completion.body.data.id, id);
  assert.equal((await f.post(completion.body.data.id)).status, 200);
  assert.equal((await task.reload()).status, 'completed');
  const receipt = await f
    .auth(f.agent.get('/api/v1/print-forms/preservation-receipt'))
    .query({ issuanceId: completion.body.data.id, format: 'xlsx' });
  assert.equal(receipt.status, 200);
});

test('Р1: запрос 2 при остатке 2 не создаёт нехватку; конкурентные выдачи не списывают вещь дважды', async (t) => {
  const f = await fixture(t);
  const extra = await models.Instance.create({
    modelId: f.state.modelId,
    sizeId: f.state.sizeId,
    warehouseId: f.state.warehouseId,
    inventoryNumber: randomUUID(),
    status: 'in_stock',
  });
  f.state.instanceIds.push(extra.id);
  const full = await f.draft();
  const fullResult = await f.post(full.id);
  assert.equal(fullResult.status, 200);
  assert.equal(fullResult.body.data.lines[0].quantity, 2);
  assert.equal((await f.tasks(full.id)).length, 0);
  const last = await models.Instance.create({
    modelId: f.state.modelId,
    sizeId: f.state.sizeId,
    warehouseId: f.state.warehouseId,
    inventoryNumber: randomUUID(),
    status: 'in_stock',
  });
  f.state.instanceIds.push(last.id);
  const first = await f.draft(1);
  const second = await f.draft(1);
  const results = await Promise.all([f.post(first.id), f.post(second.id)]);
  assert.deepEqual(
    results.map((x) => x.status),
    [200, 200],
  );
  assert.equal(
    results.flatMap((x) => x.body.data.lines).reduce((n, l) => n + l.quantity, 0),
    1,
  );
  assert.equal((await f.tasks(first.id)).length + (await f.tasks(second.id)).length, 1);
});

test('Р1: нет размера, роста или модели на складе — ручной ввод и комплект сохраняют потребность', async (t) => {
  const f = await fixture(t);
  const size = await models.Size.create({
    type: 'clothing',
    value: `R1-${randomUUID().slice(0, 8)}`,
  });
  const height = await models.Size.create({
    type: 'height',
    value: `R1-${randomUUID().slice(0, 8)}`,
  });
  f.extraSizes.push(size.id, height.id);
  const wrongSize = await f.draft(2, { sizeId: size.id });
  assert.equal(wrongSize.line.status, 201);
  assert.equal((await f.post(wrongSize.id)).status, 200);
  assert.equal((await f.tasks(wrongSize.id))[0].sizeId, size.id);
  await models.NomenclatureModel.update(
    { requiresHeightSize: true },
    { where: { id: f.state.modelId } },
  );
  const noHeight = await f.draft();
  assert.equal(noHeight.line.status, 400, 'неуказанный обязательный рост — ошибка, не нехватка');
  const wrongHeight = await f.draft(2, { heightSizeId: height.id });
  assert.equal(wrongHeight.line.status, 201);
  assert.equal((await f.post(wrongHeight.id)).status, 200);
  assert.equal((await f.tasks(wrongHeight.id))[0].heightSizeId, height.id);
  await models.Employee.update(
    { clothingSizeId: size.id, heightSizeId: height.id },
    { where: { id: f.state.employeeId } },
  );
  await models.PositionKitItem.update({ quantity: 2 }, { where: { id: f.state.kitId } });
  const kit = await f.draft(2, { heightSizeId: height.id });
  await f.auth(
    f.agent.delete(`/api/v1/issuance/documents/${kit.id}/lines/${kit.line.body.data.lines[0].id}`),
  );
  const preview = await f
    .auth(f.agent.get(`/api/v1/issuance/documents/${kit.id}/kit-preview`))
    .query({ season: 'summer' });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.data.items[0].availableQuantity, 0);
  assert.equal(preview.body.data.items[0].missingSize, false);
  const applied = await f
    .auth(f.agent.post(`/api/v1/issuance/documents/${kit.id}/apply-kit`))
    .send({ season: 'summer' });
  assert.equal(applied.status, 200);
  assert.equal((await f.tasks(kit.id)).length, 0);
  assert.equal((await f.post(kit.id)).status, 200);
  const [kitTask] = await f.tasks(kit.id);
  assert.equal(kitTask.quantity, 2);
  assert.equal(kitTask.sizeId, size.id);
  assert.equal(kitTask.heightSizeId, height.id);
  const model = await models.NomenclatureModel.create({
    name: `R1-empty-${randomUUID()}`,
    unit: 'шт.',
  });
  f.state.additionalModelId = model.id;
  const noModelStock = await f.draft(2, { modelId: model.id, sizeId: null });
  assert.equal(noModelStock.line.status, 201);
  assert.equal((await f.post(noModelStock.id)).status, 200);
  assert.equal((await f.tasks(noModelStock.id))[0].modelId, model.id);
  const invalid = await f.draft(2, { modelId: randomUUID() });
  assert.equal(invalid.line.status, 400);
  assert.equal((await f.tasks(invalid.id)).length, 0);
});

test('Р1: остаток исчез после создания довыдачи — исходная задача переоткрывается без дубля', async (t) => {
  const f = await fixture(t);
  const initial = await f.draft();
  await f.post(initial.id);
  const [task] = await f.tasks(initial.id);
  const instance = await models.Instance.create({
    modelId: f.state.modelId,
    sizeId: f.state.sizeId,
    warehouseId: f.state.warehouseId,
    inventoryNumber: randomUUID(),
    status: 'in_stock',
  });
  f.state.instanceIds.push(instance.id);
  const completion = await f
    .auth(f.agent.post('/api/v1/issuance/tasks/create-draft'))
    .send({ taskIds: [task.id] });
  assert.equal(completion.status, 201);
  f.docs.push(completion.body.data.id);
  const competing = await f.draft(1);
  assert.equal((await f.post(competing.id)).status, 200);
  const result = await f.post(completion.body.data.id);
  assert.equal(result.status, 200);
  assert.equal(result.body.data.lines.length, 0);
  assert.equal(result.body.meta.shortages[0].missingQuantity, 1);
  await task.reload();
  assert.equal(task.status, 'open');
  assert.equal(task.quantity, 1);
  assert.equal(task.draftDocumentId, null);
  assert.equal((await f.tasks(completion.body.data.id)).length, 0);
});
