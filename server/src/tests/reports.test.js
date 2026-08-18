// Требует применённых миграций и сида (pnpm db:migrate && pnpm db:seed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { models } from '../database/models/index.js';

async function loginAsAdmin(agent) {
  const res = await agent
    .post('/api/v1/auth/login')
    .send({ login: env.BOOTSTRAP_ADMIN_LOGIN, password: env.BOOTSTRAP_ADMIN_PASSWORD });
  return res.body.data.accessToken;
}

function binaryParser(res, callback) {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

test('отчёты: дни обеспечения по ДПО/работникам + smoke по остальным эндпоинтам', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `Test Reports ${Date.now()}`;

  const state = {
    instanceIds: [],
    issuanceDocIds: [],
    returnDocIds: [],
    receivingDocIds: [],
    batchIds: [],
    employeeIds: [],
    dpoId: null,
    writeoffDocIds: [],
    organizationId: null,
  };
  t.after(async () => {
    if (state.instanceIds.length > 0) {
      await models.StockMovement.destroy({ where: { instanceId: state.instanceIds } });
    }
    if (state.returnDocIds.length > 0) {
      await models.ReturnDocument.destroy({ where: { id: state.returnDocIds } });
    }
    if (state.issuanceDocIds.length > 0) {
      await models.IssuanceDocument.destroy({ where: { id: state.issuanceDocIds } });
    }
    if (state.writeoffDocIds.length > 0) {
      await models.WriteoffDocument.destroy({ where: { id: state.writeoffDocIds } });
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
    if (state.employeeIds.length > 0) {
      await models.Employee.destroy({ where: { id: state.employeeIds } });
    }
    if (state.dpoId) {
      await models.DpoHistory.destroy({ where: { dpoId: state.dpoId } });
      await models.Dpo.destroy({ where: { id: state.dpoId } });
    }
    await models.NomenclatureModel.destroy({ where: { name: unique } });
    await models.Size.destroy({ where: { value: unique } });
    await models.Warehouse.destroy({ where: { name: unique } });
    await models.Supplier.destroy({ where: { name: unique } });
    if (state.organizationId) {
      await models.Organization.destroy({ where: { id: state.organizationId } });
    }
  });

  const org = await auth(agent.post('/api/v1/organizations')).send({ name: unique });
  const organizationId = org.body.data.id;
  state.organizationId = organizationId;
  const warehouse = await auth(agent.post('/api/v1/warehouses')).send({
    organizationId,
    name: unique,
  });
  const warehouseId = warehouse.body.data.id;
  const supplier = await auth(agent.post('/api/v1/suppliers')).send({ name: unique });
  const supplierId = supplier.body.data.id;
  const size = await auth(agent.post('/api/v1/sizes')).send({ type: 'clothing', value: unique });
  const sizeId = size.body.data.id;
  const model = await auth(agent.post('/api/v1/nomenclature-models')).send({
    name: unique,
    sizeType: 'clothing',
  });
  const modelId = model.body.data.id;

  const dpo = await auth(agent.post('/api/v1/dpo')).send({
    name: unique,
    fullName: `${unique} — структурное подразделение ЦДПО`,
  });
  const dpoId = dpo.body.data.id;
  state.dpoId = dpoId;

  const employee1 = await auth(agent.post('/api/v1/employees')).send({
    organizationId,
    dpoId,
    fullName: `${unique} 1`,
    hireDate: '2020-01-01',
  });
  const employee1Id = employee1.body.data.id;
  const employee2 = await auth(agent.post('/api/v1/employees')).send({
    organizationId,
    dpoId,
    fullName: `${unique} 2`,
    hireDate: '2020-01-01',
  });
  const employee2Id = employee2.body.data.id;
  state.employeeIds.push(employee1Id, employee2Id);

  // Оприходуем ровно 1 экземпляр — переиспользуем его для двух
  // последовательных выдач (разным работникам), чтобы проверить
  // атрибуцию дней обеспечения при смене владельца.
  const receivingDraft = await auth(agent.post('/api/v1/purchases/receiving')).send({
    supplierId,
    warehouseId,
    documentDate: '2026-06-01',
  });
  const receivingId = receivingDraft.body.data.id;
  state.receivingDocIds.push(receivingId);
  await auth(agent.post(`/api/v1/purchases/receiving/${receivingId}/lines`)).send({
    modelId,
    sizeId,
    quantity: 1,
    purchasePrice: 1000,
  });
  const receivingPosted = await auth(agent.post(`/api/v1/purchases/receiving/${receivingId}/post`));
  assert.equal(receivingPosted.status, 200);
  state.batchIds.push(receivingPosted.body.data.batchId);
  const instance = await models.Instance.findOne({ where: { modelId } });
  state.instanceIds.push(instance.id);

  // --- Выдача №1: работник 1, 01.06 -> возврат 15.06 ---
  const issuance1 = await auth(agent.post('/api/v1/issuance/documents')).send({
    employeeId: employee1Id,
    warehouseId,
    documentDate: '2026-06-01',
  });
  state.issuanceDocIds.push(issuance1.body.data.id);
  await auth(agent.post(`/api/v1/issuance/documents/${issuance1.body.data.id}/lines`)).send({
    modelId,
    sizeId,
    quantity: 1,
  });
  const issuance1Posted = await auth(
    agent.post(`/api/v1/issuance/documents/${issuance1.body.data.id}/post`),
  );
  assert.equal(issuance1Posted.status, 200);

  const return1 = await auth(agent.post('/api/v1/issuance/returns')).send({
    employeeId: employee1Id,
    warehouseId,
    documentDate: '2026-06-15',
  });
  state.returnDocIds.push(return1.body.data.id);
  await auth(agent.post(`/api/v1/issuance/returns/${return1.body.data.id}/lines`)).send({
    instanceId: instance.id,
    condition: 'good',
  });
  const return1Posted = await auth(
    agent.post(`/api/v1/issuance/returns/${return1.body.data.id}/post`),
  );
  assert.equal(return1Posted.status, 200);

  // --- Выдача №2: тот же экземпляр -> работник 2, с 20.06, без возврата ---
  const issuance2 = await auth(agent.post('/api/v1/issuance/documents')).send({
    employeeId: employee2Id,
    warehouseId,
    documentDate: '2026-06-20',
  });
  state.issuanceDocIds.push(issuance2.body.data.id);
  await auth(agent.post(`/api/v1/issuance/documents/${issuance2.body.data.id}/lines`)).send({
    modelId,
    sizeId,
    quantity: 1,
  });
  const issuance2Posted = await auth(
    agent.post(`/api/v1/issuance/documents/${issuance2.body.data.id}/post`),
  );
  assert.equal(issuance2Posted.status, 200);

  // --- Отчёт по работникам: дни обеспечения за июнь 2026 ---
  const employeesReport = await auth(agent.get('/api/v1/reports/employees')).query({
    dpoId,
    from: '2026-06-01',
    to: '2026-06-30',
  });
  assert.equal(employeesReport.status, 200);
  const row1 = employeesReport.body.data.find((r) => r.employeeId === employee1Id);
  const row2 = employeesReport.body.data.find((r) => r.employeeId === employee2Id);
  assert.equal(row1.coverageDaysInPeriod, 14, 'работник 1: с 1 по 15 июня — 14 дней');
  assert.equal(row2.coverageDaysInPeriod, 11, 'работник 2: с 20 по 30 июня включительно — 11 дней');
  // Только работник 2 сейчас фактически держит экземпляр.
  assert.equal(row1.propertyItemsCount, 0);
  assert.equal(row2.propertyItemsCount, 1);

  // --- Отчёт по ДПО: агрегаты совпадают с суммой по работникам ---
  const dpoReport = await auth(agent.get('/api/v1/reports/dpo')).query({
    dpoId,
    from: '2026-06-01',
    to: '2026-06-30',
  });
  assert.equal(dpoReport.status, 200);
  assert.equal(dpoReport.body.data.length, 1);
  assert.equal(dpoReport.body.data[0].employeesCount, 2);
  assert.equal(dpoReport.body.data[0].coverageDaysInPeriod, 25);
  assert.equal(dpoReport.body.data[0].propertyItemsCount, 1);

  // --- Smoke: остальные отчёты отвечают 200 и отдают ожидаемую форму ---
  const stockBalances = await auth(agent.get('/api/v1/reports/stock-balances')).query({
    warehouseId,
  });
  assert.equal(stockBalances.status, 200);
  assert.ok(Array.isArray(stockBalances.body.data));

  const propertyCost = await auth(agent.get('/api/v1/reports/property-cost')).query({ dpoId });
  assert.equal(propertyCost.status, 200);
  assert.equal(propertyCost.body.meta.totals.itemsCount, 1);

  const purchases = await auth(agent.get('/api/v1/reports/purchases')).query({
    from: '2026-06-01',
    to: '2026-06-30',
    supplierId,
  });
  assert.equal(purchases.status, 200);
  assert.equal(purchases.body.meta.totals.documentsCount, 1);
  assert.equal(purchases.body.meta.totals.quantity, 1);

  const suppliersReport = await auth(agent.get('/api/v1/reports/suppliers')).query({
    from: '2026-06-01',
    to: '2026-06-30',
  });
  assert.equal(suppliersReport.status, 200);
  assert.ok(suppliersReport.body.data.some((r) => r.supplierId === supplierId));

  const warehousesReport = await auth(agent.get('/api/v1/reports/warehouses')).query({
    from: '2026-06-01',
    to: '2026-06-30',
    warehouseId,
  });
  assert.equal(warehousesReport.status, 200);

  const writeoffsReport = await auth(agent.get('/api/v1/reports/writeoffs')).query({
    from: '2026-06-01',
    to: '2026-06-30',
    warehouseId,
  });
  assert.equal(writeoffsReport.status, 200);

  const repairsReport = await auth(agent.get('/api/v1/reports/repairs')).query({
    from: '2026-06-01',
    to: '2026-06-30',
    warehouseId,
  });
  assert.equal(repairsReport.status, 200);

  const exportQueries = {
    'stock-balances': { warehouseId },
    'property-cost': { dpoId },
    purchases: { from: '2026-06-01', to: '2026-06-30', supplierId },
    suppliers: { from: '2026-06-01', to: '2026-06-30' },
    writeoffs: { from: '2026-06-01', to: '2026-06-30', warehouseId },
    repairs: { from: '2026-06-01', to: '2026-06-30', warehouseId },
    warehouses: { from: '2026-06-01', to: '2026-06-30', warehouseId },
    employees: { from: '2026-06-01', to: '2026-06-30', dpoId },
    dpo: { from: '2026-06-01', to: '2026-06-30', dpoId },
  };
  for (const [report, query] of Object.entries(exportQueries)) {
    const xlsx = await auth(agent.get(`/api/v1/reports/${report}/export`))
      .query({ ...query, format: 'xlsx' })
      .buffer(true)
      .parse(binaryParser);
    assert.equal(xlsx.status, 200, `${report}: Excel`);
    assert.match(xlsx.headers['content-type'], /spreadsheetml/);
    assert.equal(xlsx.body.subarray(0, 2).toString(), 'PK');
    if (report === 'stock-balances') {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(xlsx.body);
      const sheet = workbook.worksheets[0];
      const headerRowNumber = Array.from(
        { length: sheet.actualRowCount },
        (_, index) => index + 1,
      ).find((rowNumber) => sheet.getCell(rowNumber, 1).value === 'Склад');
      assert.ok(headerRowNumber);
      const headerRow = sheet.getRow(headerRowNumber);
      assert.deepEqual(headerRow.values.slice(1, 6), [
        'Склад',
        'Модель',
        'Размер',
        'Рост',
        'Количество',
      ]);
      assert.equal(headerRow.cellCount, 5);
    }

    const pdf = await auth(agent.get(`/api/v1/reports/${report}/export`))
      .query({ ...query, format: 'pdf' })
      .buffer(true)
      .parse(binaryParser);
    assert.equal(pdf.status, 200, `${report}: PDF`);
    assert.match(pdf.headers['content-type'], /application\/pdf/);
    assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');
    assert.ok(pdf.body.length > 1000);
  }
});
