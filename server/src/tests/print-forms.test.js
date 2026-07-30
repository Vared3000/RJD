// Требует применённых миграций и сида (pnpm db:migrate && pnpm db:seed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { models } from '../database/models/index.js';
import { printFormsRepository } from '../modules/print-forms/print-forms.repository.js';

async function loginAsAdmin(agent) {
  const res = await agent
    .post('/api/v1/auth/login')
    .send({ login: env.BOOTSTRAP_ADMIN_LOGIN, password: env.BOOTSTRAP_ADMIN_PASSWORD });
  return res.body.data.accessToken;
}

function binaryParser(res, callback) {
  res.setEncoding('binary');
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => callback(null, Buffer.from(data, 'binary')));
}

test('печатные формы: ФПУ-26 и приложения 1.5/1.7 формируются в Excel и PDF', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `Test Print Forms ${Date.now()}`;
  const qaDirectory =
    process.env.PRINT_FORMS_QA === 'true' ? path.resolve('tmp', 'print-forms-qa', 'full') : null;
  if (qaDirectory) await mkdir(qaDirectory, { recursive: true });
  const state = {
    organizationId: null,
    dpoId: null,
    employeeId: null,
    positionId: null,
    modelId: null,
    sizeId: null,
    warehouseId: null,
    supplierId: null,
    receivingId: null,
    batchId: null,
    issuanceId: null,
    instanceIds: [],
    sourceRecordIds: [],
  };

  t.after(async () => {
    if (state.instanceIds.length > 0) {
      await models.StockMovement.destroy({ where: { instanceId: state.instanceIds } });
    }
    if (state.issuanceId) {
      await models.IssuanceDocument.destroy({ where: { id: state.issuanceId } });
    }
    if (state.instanceIds.length > 0) {
      await models.Instance.destroy({ where: { id: state.instanceIds } });
    }
    if (state.receivingId) {
      await models.ReceivingDocument.destroy({ where: { id: state.receivingId } });
    }
    if (state.batchId) await models.Batch.destroy({ where: { id: state.batchId } });
    if (state.sourceRecordIds.length > 0) {
      await models.NomenclaturePrice.destroy({ where: { sourceRecordId: state.sourceRecordIds } });
      await models.SourceImportRecord.destroy({ where: { id: state.sourceRecordIds } });
    }
    if (state.employeeId) await models.Employee.destroy({ where: { id: state.employeeId } });
    if (state.dpoId) {
      await models.DpoHistory.destroy({ where: { dpoId: state.dpoId } });
      await models.Dpo.destroy({ where: { id: state.dpoId } });
    }
    if (state.positionId) await models.Position.destroy({ where: { id: state.positionId } });
    if (state.modelId) await models.NomenclatureModel.destroy({ where: { id: state.modelId } });
    if (state.sizeId) await models.Size.destroy({ where: { id: state.sizeId } });
    if (state.warehouseId) await models.Warehouse.destroy({ where: { id: state.warehouseId } });
    if (state.supplierId) await models.Supplier.destroy({ where: { id: state.supplierId } });
    if (state.organizationId) {
      await models.Organization.destroy({ where: { id: state.organizationId } });
    }
  });

  const organization = await auth(agent.post('/api/v1/organizations')).send({ name: unique });
  state.organizationId = organization.body.data.id;
  const warehouse = await auth(agent.post('/api/v1/warehouses')).send({
    organizationId: state.organizationId,
    name: unique,
  });
  state.warehouseId = warehouse.body.data.id;
  const supplier = await auth(agent.post('/api/v1/suppliers')).send({ name: unique });
  state.supplierId = supplier.body.data.id;
  const size = await auth(agent.post('/api/v1/sizes')).send({
    type: 'clothing',
    value: '52/182',
  });
  state.sizeId = size.body.data.id;
  const model = await auth(agent.post('/api/v1/nomenclature-models')).send({
    name: unique,
    sizeType: 'clothing',
    unit: 'шт.',
  });
  state.modelId = model.body.data.id;
  const position = await auth(agent.post('/api/v1/positions')).send({ name: unique });
  state.positionId = position.body.data.id;
  const dpo = await auth(agent.post('/api/v1/dpo')).send({
    name: unique,
    fullName: `${unique} — заказчик`,
    contractNumber: 'ТЕСТ-26',
    contractDate: '2026-01-15',
    directorFullName: 'Иванов Иван Иванович',
    directorBasis: 'Устав',
  });
  state.dpoId = dpo.body.data.id;
  const employee = await auth(agent.post('/api/v1/employees')).send({
    organizationId: state.organizationId,
    dpoId: state.dpoId,
    positionId: state.positionId,
    fullName: 'Петров Пётр Петрович',
    personnelNumber: `PF-${Date.now()}`,
    hireDate: '2020-01-01',
    clothingSizeId: state.sizeId,
  });
  assert.equal(employee.status, 201);
  assert.equal(employee.body.data.positionId, state.positionId);
  state.employeeId = employee.body.data.id;

  const sourceRecord = await models.SourceImportRecord.create({
    sourceKey: `print-form-test-${Date.now()}`,
    sourceFile: 'test.xlsx',
    fileHash: '0'.repeat(64),
    recordType: 'price',
    sheetName: 'Тест',
    rowNumber: 1,
    payload: { test: true },
  });
  state.sourceRecordIds.push(sourceRecord.id);
  await models.NomenclaturePrice.create({
    modelId: state.modelId,
    dpoId: state.dpoId,
    sourceRecordId: sourceRecord.id,
    effectiveDate: '2026-01-01',
    priceWithoutVat: 1000,
    vatRate: 5,
    priceWithVat: 1050,
  });

  const receiving = await auth(agent.post('/api/v1/purchases/receiving')).send({
    supplierId: state.supplierId,
    warehouseId: state.warehouseId,
    documentDate: '2026-07-01',
  });
  state.receivingId = receiving.body.data.id;
  await auth(agent.post(`/api/v1/purchases/receiving/${state.receivingId}/lines`)).send({
    modelId: state.modelId,
    sizeId: state.sizeId,
    quantity: 2,
    purchasePrice: 1000,
  });
  const receivingPosted = await auth(
    agent.post(`/api/v1/purchases/receiving/${state.receivingId}/post`),
  );
  assert.equal(receivingPosted.status, 200);
  state.batchId = receivingPosted.body.data.batchId;
  const instances = await models.Instance.findAll({ where: { modelId: state.modelId } });
  state.instanceIds = instances.map((instance) => instance.id);

  const issuance = await auth(agent.post('/api/v1/issuance/documents')).send({
    employeeId: state.employeeId,
    warehouseId: state.warehouseId,
    documentDate: '2026-07-15',
  });
  state.issuanceId = issuance.body.data.id;
  await auth(agent.post(`/api/v1/issuance/documents/${state.issuanceId}/lines`)).send({
    modelId: state.modelId,
    sizeId: state.sizeId,
    quantity: 2,
  });
  const issuancePosted = await auth(
    agent.post(`/api/v1/issuance/documents/${state.issuanceId}/post`),
  );
  assert.equal(issuancePosted.status, 200);
  const documents = await printFormsRepository.findIssuanceDocuments({
    dpoId: state.dpoId,
    from: new Date('2026-07-01T00:00:00.000Z'),
    to: new Date('2026-07-31T23:59:59.999Z'),
  });
  assert.equal(documents[0].employee.position.name, unique);

  for (const form of ['fpu-26', 'appendix-1-5', 'appendix-1-7']) {
    const query = {
      dpoId: state.dpoId,
      from: '2026-07-01',
      to: '2026-07-31',
    };
    const xlsx = await auth(agent.get(`/api/v1/print-forms/${form}`))
      .query({
        ...query,
        format: 'xlsx',
      })
      .buffer(true)
      .parse(binaryParser);
    assert.equal(xlsx.status, 200);
    assert.match(xlsx.headers['content-type'], /spreadsheetml/);
    assert.equal(xlsx.body.subarray(0, 2).toString(), 'PK');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsx.body);
    const sheet = workbook.worksheets[0];
    assert.ok(sheet);
    assert.ok(sheet.getCell('A1').value);
    const cellValues = [];
    let hasFormula = false;
    sheet.eachRow((row) =>
      row.eachCell((cell) => {
        cellValues.push(String(cell.value ?? ''));
        if (cell.value && typeof cell.value === 'object' && cell.value.formula) hasFormula = true;
      }),
    );
    assert.ok(cellValues.some((value) => value.includes(unique)));
    assert.ok(cellValues.some((value) => value.includes('ИТОГО')));
    assert.ok(hasFormula, `${form}: в расчётных ячейках должны быть формулы`);
    if (qaDirectory) await writeFile(path.join(qaDirectory, `${form}.xlsx`), xlsx.body);

    const pdf = await auth(agent.get(`/api/v1/print-forms/${form}`))
      .query({
        ...query,
        format: 'pdf',
      })
      .buffer(true)
      .parse(binaryParser);
    assert.equal(pdf.status, 200);
    assert.match(pdf.headers['content-type'], /application\/pdf/);
    assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');
    assert.ok(pdf.body.length > 5000);
    if (qaDirectory) await writeFile(path.join(qaDirectory, `${form}.pdf`), pdf.body);
  }

  await models.StockMovement.destroy({ where: { instanceId: state.instanceIds } });
  await models.IssuanceDocument.destroy({ where: { id: state.issuanceId } });
  state.issuanceId = null;
  await models.Instance.destroy({ where: { id: state.instanceIds } });
  state.instanceIds = [];

  const archiveCandidates = [
    {
      type: 'nomenclature',
      dpo: unique,
      effectiveDate: '2026-07-31',
      name: `${unique} архив 1.5`,
      unit: 'шт.',
      position: 'Архивная должность',
      employee: null,
      quantity: 2,
      coverageDays: 62,
      priceWithoutVat: 800,
      priceWithVat: 840,
    },
    {
      type: 'nomenclature',
      dpo: unique,
      effectiveDate: '2026-07-31',
      name: `${unique} архив 1.7`,
      unit: 'шт.',
      position: null,
      employee: {
        fullName: 'Архивный Работник Заказчика',
        personnelNumber: 'АРХ-001',
      },
      quantity: 1,
      priceWithoutVat: 900,
      priceWithVat: 945,
    },
  ];
  for (const [index, payload] of archiveCandidates.entries()) {
    const record = await models.SourceImportRecord.create({
      sourceKey: `print-form-archive-test-${Date.now()}-${index}`,
      sourceFile: `archive-${index}.xlsx`,
      fileHash: String(index + 1).repeat(64),
      recordType: 'normalized_candidate',
      sheetName: index === 0 ? 'Приложение 1.5' : 'Приложение 1.7',
      payload,
    });
    state.sourceRecordIds.push(record.id);
  }

  for (const form of ['fpu-26', 'appendix-1-5', 'appendix-1-7']) {
    const xlsx = await auth(agent.get(`/api/v1/print-forms/${form}`))
      .query({
        dpoId: state.dpoId,
        from: '2026-07-01',
        to: '2026-07-31',
        format: 'xlsx',
      })
      .buffer(true)
      .parse(binaryParser);
    assert.equal(xlsx.status, 200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsx.body);
    const values = [];
    workbook.worksheets[0].eachRow((row) =>
      row.eachCell((cell) => values.push(String(cell.value ?? ''))),
    );
    const expected =
      form === 'appendix-1-5'
        ? 'Архивная должность'
        : form === 'appendix-1-7'
          ? 'Архивный Работник Заказчика'
          : `${unique} архив 1.7`;
    assert.ok(
      values.some((value) => value.includes(expected)),
      `${form}: архивные строки`,
    );
  }
});
