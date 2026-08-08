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
    returnId: null,
    kitId: null,
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
    if (state.returnId) {
      await models.ReturnDocument.destroy({ where: { id: state.returnId } });
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
    if (state.kitId) await models.PositionKitItem.destroy({ where: { id: state.kitId } });
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
  const kit = await auth(agent.post('/api/v1/kits')).send({
    positionId: state.positionId,
    modelId: state.modelId,
    quantity: 1,
    serviceLifeYears: 4,
    season: 'summer',
  });
  assert.equal(kit.status, 201);
  state.kitId = kit.body.data.id;

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
    const cellValues = [];
    let hasFormula = false;
    sheet.eachRow((row) =>
      row.eachCell((cell) => {
        cellValues.push(String(cell.value ?? ''));
        if (cell.value && typeof cell.value === 'object' && cell.value.formula) hasFormula = true;
      }),
    );
    assert.ok(
      cellValues.some((value) => value.trim()),
      `${form}: форма не должна быть пустой`,
    );
    assert.ok(cellValues.some((value) => value.includes(unique)));
    assert.ok(cellValues.some((value) => value.toUpperCase().includes('ИТОГО')));
    assert.ok(hasFormula, `${form}: в расчётных ячейках должны быть формулы`);
    if (form === 'appendix-1-7') {
      assert.equal(sheet.getColumn(8).hidden, false, 'колонка цены должна быть видимой');
      assert.equal(sheet.getCell('H8').fill?.pattern, 'solid');
      assert.match(sheet.getCell('H8').numFmt, /0\.0000/);
    }
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

  const mixedArchivePayloads = [
    {
      type: 'nomenclature',
      dpo: unique,
      effectiveDate: '2026-07-15',
      name: unique,
      unit: 'шт.',
      employee: {
        fullName: employee.body.data.fullName,
        personnelNumber: employee.body.data.personnelNumber,
      },
      quantity: 2,
      priceWithoutVat: 1000,
      priceWithVat: 1050,
      subtotalWithoutVat: 2000,
      vatAmount: 100,
      totalWithVat: 2100,
    },
    {
      type: 'nomenclature',
      dpo: unique,
      effectiveDate: '2026-07-20',
      name: `${unique} смешанный архив`,
      unit: 'шт.',
      employee: { fullName: 'Архивный сотрудник', personnelNumber: 'MIX-001' },
      quantity: 1,
      priceWithoutVat: 500,
      priceWithVat: 525,
      subtotalWithoutVat: 500,
      vatAmount: 25,
      totalWithVat: 525,
    },
  ];
  for (const [index, payload] of mixedArchivePayloads.entries()) {
    const record = await models.SourceImportRecord.create({
      sourceKey: `print-form-mixed-test-${Date.now()}-${index}`,
      sourceFile: 'zz-mixed-archive.xlsx',
      fileHash: String(index + 7).repeat(64),
      recordType: 'normalized_candidate',
      sheetName: 'Приложение 1.7',
      rowNumber: index + 1,
      payload,
    });
    state.sourceRecordIds.push(record.id);
  }
  const mixed = await auth(agent.get('/api/v1/print-forms/appendix-1-7'))
    .query({
      dpoId: state.dpoId,
      from: '2026-07-01',
      to: '2026-07-31',
      format: 'xlsx',
    })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(mixed.status, 200);
  const mixedWorkbook = new ExcelJS.Workbook();
  await mixedWorkbook.xlsx.load(mixed.body);
  const mixedModels = [];
  mixedWorkbook.worksheets[0].getColumn(4).eachCell((cell) => {
    mixedModels.push(String(cell.value ?? ''));
  });
  assert.equal(
    mixedModels.filter((value) => value === unique).length,
    2,
    'архивная копия живой выдачи не должна создавать третью строку',
  );
  assert.ok(mixedModels.includes(`${unique} смешанный архив`));

  const returnDraft = await auth(agent.post('/api/v1/issuance/returns')).send({
    employeeId: state.employeeId,
    warehouseId: state.warehouseId,
    documentDate: '2026-07-29',
  });
  assert.equal(returnDraft.status, 201);
  state.returnId = returnDraft.body.data.id;
  await auth(agent.post(`/api/v1/issuance/returns/${state.returnId}/lines`)).send({
    instanceId: state.instanceIds[0],
    condition: 'good',
  });
  const returnPosted = await auth(agent.post(`/api/v1/issuance/returns/${state.returnId}/post`));
  assert.equal(returnPosted.status, 200);

  const personalCard = await auth(agent.get('/api/v1/print-forms/personal-card'))
    .query({ employeeId: state.employeeId, format: 'xlsx' })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(personalCard.status, 200);
  const personalWorkbook = new ExcelJS.Workbook();
  await personalWorkbook.xlsx.load(personalCard.body);
  const personalSheet = personalWorkbook.worksheets[0];
  assert.match(String(personalSheet.getCell('A6').value ?? ''), /Петров Пётр Петрович/);
  assert.match(String(personalSheet.getCell('A7').value ?? ''), /52\/182/);
  assert.equal(personalSheet.getCell('B13').value, unique);
  assert.equal(personalSheet.getCell('F13').value, 4);
  assert.equal(personalSheet.getCell('G13').value, 1);
  assert.equal(personalSheet.getCell('H13').value, '15.07.2026');
  const returnedRow = [13, 14].find(
    (rowNumber) => personalSheet.getCell(`J${rowNumber}`).value === 1,
  );
  assert.ok(returnedRow, 'возврат должен быть отражён в личной карточке');
  assert.equal(personalSheet.getCell(`K${returnedRow}`).value, '29.07.2026');

  const personalPdf = await auth(agent.get('/api/v1/print-forms/personal-card'))
    .query({ employeeId: state.employeeId, format: 'pdf' })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(personalPdf.status, 200);
  assert.equal(personalPdf.body.subarray(0, 4).toString(), '%PDF');
  assert.ok(personalPdf.body.length > 5000);
  if (qaDirectory) {
    await writeFile(path.join(qaDirectory, 'personal-card.xlsx'), personalCard.body);
    await writeFile(path.join(qaDirectory, 'personal-card.pdf'), personalPdf.body);
  }

  await models.StockMovement.destroy({ where: { instanceId: state.instanceIds } });
  await models.ReturnDocument.destroy({ where: { id: state.returnId } });
  state.returnId = null;
  await models.IssuanceDocument.destroy({ where: { id: state.issuanceId } });
  state.issuanceId = null;
  await models.Instance.destroy({ where: { id: state.instanceIds } });
  state.instanceIds = [];

  const archiveCandidates = [
    {
      type: 'nomenclature',
      dpo: unique,
      effectiveDate: '2026-07-31',
      rowNumber: 20,
      name: `${unique} архив 1.5 поздняя строка`,
      unit: 'шт.',
      position: 'Архивная должность',
      employee: null,
      quantity: 2,
      coverageDays: 62,
      priceWithoutVat: 800,
      subtotalWithoutVat: 800,
      totalWithoutVat: 840,
      vatAmount: 80,
      totalWithVat: 1680,
      sourceFormulas: {},
    },
    {
      type: 'nomenclature',
      dpo: unique,
      effectiveDate: '2026-07-31',
      rowNumber: 10,
      name: `${unique} архив 1.5 ранняя строка`,
      unit: 'шт.',
      position: 'Архивная должность',
      employee: null,
      quantity: 0,
      coverageDays: 0,
      priceWithoutVat: 123.45678,
      subtotalWithoutVat: 0,
      totalWithoutVat: 6.172839,
      vatAmount: 0,
      totalWithVat: 0,
      sourceFormulas: {},
    },
    {
      type: 'nomenclature',
      dpo: unique,
      effectiveDate: '2026-07-31',
      formType: 'fpu-26',
      rowNumber: 43,
      name: `${unique} архив ФПУ поздняя строка`,
      unit: 'шт.',
      position: null,
      employee: null,
      quantity: 5,
      priceWithoutVat: 2264.79,
      displayedPriceWithoutVat: 2264.79,
      subtotalWithoutVat: 11323.95,
      vatAmount: 566.1975,
      totalWithVat: 11890.1475,
      sourceFormulas: {},
    },
    {
      type: 'nomenclature',
      dpo: unique,
      effectiveDate: '2026-07-31',
      formType: 'fpu-26',
      rowNumber: 42,
      name: `${unique} архив ФПУ ранняя строка`,
      unit: 'шт.',
      position: null,
      employee: null,
      quantity: 1,
      priceWithoutVat: 2224.85,
      displayedPriceWithoutVat: 2224.85,
      subtotalWithoutVat: 2224.85,
      vatAmount: 111.2425,
      totalWithVat: 2336.0925,
      sourceFormulas: {},
    },
    {
      type: 'nomenclature',
      dpo: unique,
      effectiveDate: '2026-07-31',
      rowNumber: 20,
      name: `${unique} архив 1.7 поздняя строка`,
      unit: 'шт.',
      position: null,
      employee: {
        fullName: 'Архивный Работник Заказчика',
        personnelNumber: 'АРХ-001',
      },
      quantity: 1,
      priceWithoutVat: 900,
      priceWithVat: 945,
      subtotalWithoutVat: 900,
      vatAmount: 45,
      totalWithVat: 945,
    },
    {
      type: 'nomenclature',
      dpo: unique,
      effectiveDate: '2026-07-31',
      rowNumber: 10,
      name: `${unique} архив 1.7 ранняя строка`,
      unit: 'шт.',
      position: null,
      employee: {
        fullName: 'Архивный Работник Заказчика',
        personnelNumber: 'АРХ-001',
      },
      quantity: 0,
      priceWithoutVat: 123.45678,
      priceWithVat: 0,
      subtotalWithoutVat: 0,
      vatAmount: 0,
      totalWithVat: 0,
    },
    {
      type: 'nomenclature',
      dpo: unique,
      effectiveDate: '2021-06-01',
      formType: 'personal-card',
      cardStartRow: 1,
      rowNumber: 13,
      name: `${unique} архив личной карточки`,
      unit: 'шт.',
      position: unique,
      employee: {
        fullName: 'Петров Пётр Петрович',
        personnelNumber: employee.body.data.personnelNumber,
      },
      quantity: 1,
      normQuantity: 1,
      serviceLifeYears: 3,
      issuedQuantity: 1,
      issuedDate: '2021-06-01',
      returnedQuantity: 1,
      returnedDate: '2024-06-01',
    },
    {
      type: 'nomenclature',
      formType: 'upd',
      effectiveDate: '2026-07-31',
      documentNumber: '172-ТЕСТ',
      paymentDocumentNumber: '224027',
      paymentDocumentDate: '2026-07-07',
      rowNumber: 1,
      article: 'ТЕСТ-УПД-01',
      name: `${unique} архив УПД`,
      unitCode: '796',
      unit: 'шт.',
      quantity: 2,
      priceWithoutVat: 1000,
      subtotalWithoutVat: 2000,
      vatRate: 5,
      vatAmount: 100,
      totalWithVat: 2100,
    },
  ];
  for (const [index, payload] of archiveCandidates.entries()) {
    const isFpu26 = payload.formType === 'fpu-26';
    const isPersonalCard = payload.formType === 'personal-card';
    const isUpd = payload.formType === 'upd';
    const record = await models.SourceImportRecord.create({
      sourceKey: `print-form-archive-test-${Date.now()}-${index}`,
      sourceFile: isPersonalCard
        ? 'archive-personal-card.xlsx'
        : isUpd
          ? 'archive-upd.pdf'
          : isFpu26
            ? 'archive-order-fpu-26.xlsx'
            : payload.employee
              ? 'archive-order-1-7.xlsx'
              : 'archive-order-1-5.xlsx',
      fileHash: String(index + 1).repeat(64),
      recordType: 'normalized_candidate',
      sheetName: isPersonalCard
        ? 'Личная карточка'
        : isUpd
          ? 'УПД'
          : isFpu26
            ? 'Акт выполненных работ'
            : payload.employee
              ? 'Приложение 1.7'
              : 'Приложение 1.5',
      rowNumber: payload.rowNumber ?? null,
      payload,
    });
    state.sourceRecordIds.push(record.id);
  }

  const updPdf = await auth(agent.get('/api/v1/print-forms/upd'))
    .query({
      dpoId: state.dpoId,
      from: '2026-07-01',
      to: '2026-07-31',
      format: 'pdf',
    })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(updPdf.status, 200);
  assert.match(updPdf.headers['content-type'], /application\/pdf/);
  assert.equal(updPdf.body.subarray(0, 4).toString(), '%PDF');
  assert.ok(updPdf.body.length > 5000);
  if (qaDirectory) await writeFile(path.join(qaDirectory, 'upd.pdf'), updPdf.body);

  const updXlsx = await auth(agent.get('/api/v1/print-forms/upd')).query({
    dpoId: state.dpoId,
    from: '2026-07-01',
    to: '2026-07-31',
    format: 'xlsx',
  });
  assert.equal(updXlsx.status, 400);

  const archivedPersonalCard = await auth(agent.get('/api/v1/print-forms/personal-card'))
    .query({ employeeId: state.employeeId, format: 'xlsx' })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(archivedPersonalCard.status, 200);
  const archivedPersonalWorkbook = new ExcelJS.Workbook();
  await archivedPersonalWorkbook.xlsx.load(archivedPersonalCard.body);
  const archivedPersonalSheet = archivedPersonalWorkbook.worksheets[0];
  assert.equal(archivedPersonalSheet.getCell('B13').value, `${unique} архив личной карточки`);
  assert.equal(archivedPersonalSheet.getCell('F13').value, 3);
  assert.equal(archivedPersonalSheet.getCell('H13').value, '01.06.2021');
  assert.equal(archivedPersonalSheet.getCell('K13').value, '01.06.2024');

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
          : `${unique} архив ФПУ`;
    assert.ok(
      values.some((value) => value.includes(expected)),
      `${form}: архивные строки`,
    );
    if (form === 'appendix-1-5') {
      const sheet = workbook.worksheets[0];
      assert.equal(sheet.getColumn(7).hidden, false, 'исходная цена должна быть видимой');
      assert.match(
        String(sheet.getCell('C7').value ?? ''),
        /ранняя строка/,
        'строки архивного приложения 1.5 должны сохранять исходный порядок Excel',
      );
      assert.match(String(sheet.getCell('C8').value ?? ''), /поздняя строка/);
      assert.equal(sheet.getCell('G7').value, 123.45678);
      assert.equal(sheet.getCell('H7').value, 0);
      assert.equal(sheet.getCell('I7').value, 6.172839);
      assert.equal(sheet.getCell('J8').value, 80);
      assert.equal(sheet.getCell('K8').value, 1680);
    }
    if (form === 'appendix-1-7') {
      assert.match(
        String(workbook.worksheets[0].getCell('D8').value ?? ''),
        /ранняя строка/,
        'строки архивного акта должны сохранять исходный порядок Excel',
      );
    }
    if (form === 'fpu-26') {
      const sheet = workbook.worksheets[0];
      assert.equal(sheet.getColumn(7).hidden, false, 'исходная цена ФПУ должна быть видимой');
      assert.match(
        String(sheet.getCell('A42').value ?? ''),
        /ранняя строка/,
        'строки архивного ФПУ-26 должны сохранять исходный порядок Excel',
      );
      assert.match(String(sheet.getCell('A43').value ?? ''), /поздняя строка/);
      assert.equal(sheet.getCell('F42').value, 1);
      assert.equal(sheet.getCell('G42').value, 2224.85);
      assert.equal(sheet.getCell('H42').value, 2224.85);
      assert.equal(sheet.getCell('I43').value, 11323.95);
      assert.equal(sheet.getCell('K43').value, 566.1975);
      assert.equal(sheet.getCell('L43').value, 11890.1475);
    }
  }
});
