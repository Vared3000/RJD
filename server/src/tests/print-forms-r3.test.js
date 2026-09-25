import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { models } from '../database/models/index.js';
import {
  setupApp,
  setupBaseFixture,
  cleanupFixtureState,
  binaryParser,
} from './print-forms-fixture.js';

test('Р3: API сохранки — 22 модели, количество 2, повторная печать и исправление выдачи', async (t) => {
  const { agent, auth } = await setupApp();
  const { state } = await setupBaseFixture({
    agent,
    auth,
    unique: `Р3 ${Date.now()}`,
  });
  const extraModels = [];
  let receivingId;
  let batchId;
  t.after(async () => {
    await models.PositionKitItem.destroy({ where: { modelId: extraModels } });
    const extraInstances = await models.Instance.findAll({
      where: { modelId: extraModels },
      attributes: ['id'],
    });
    await models.StockMovement.destroy({
      where: { instanceId: extraInstances.map((instance) => instance.id) },
    });
    await models.Instance.destroy({ where: { modelId: extraModels } });
    if (receivingId) await models.ReceivingDocument.destroy({ where: { id: receivingId } });
    if (batchId) await models.Batch.destroy({ where: { id: batchId } });
    await cleanupFixtureState(state);
    await models.NomenclatureModel.destroy({ where: { id: extraModels } });
  });
  const post = async (url, data, status = 200) => {
    const response = await auth(agent.post(`/api/v1/${url}`)).send(data);
    assert.equal(response.status, status, JSON.stringify(response.body));
    return response.body.data;
  };
  const workbook = async (form, query) => {
    const response = await auth(agent.get(`/api/v1/print-forms/${form}`))
      .query({ ...query, format: 'xlsx' })
      .buffer(true)
      .parse(binaryParser);
    assert.equal(response.status, 200, response.body.toString());
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(response.body);
    return { book, sheet: book.worksheets[0], buffer: response.body };
  };
  const receiptRows = (sheet) => {
    const result = [];
    for (let row = 5; row <= sheet.rowCount; row++) {
      if (sheet.getCell(`D${row}`).value)
        result.push([sheet.getCell(`D${row}`).value, sheet.getCell(`F${row}`).value]);
    }
    return result;
  };

  // Создаём реальное поступление и выдачу только в изолированной тестовой схеме.
  const receiving = await post(
    'purchases/receiving',
    { supplierId: state.supplierId, warehouseId: state.warehouseId, documentDate: '2026-07-01' },
    201,
  );
  receivingId = receiving.id;
  for (let index = 1; index <= 21; index++) {
    const model = await models.NomenclatureModel.create({
      name: `Р3 изделие ${String(index).padStart(2, '0')} форменное длинное наименование для проверки переноса`,
      unit: 'шт.',
      rentalPrice: 100,
      rentalVatRate: 5,
      wearMonths: [11, 12, 1, 2, 3],
    });
    extraModels.push(model.id);
    await post(`purchases/receiving/${receivingId}/lines`, { modelId: model.id, quantity: 1 }, 201);
  }
  batchId = (await post(`purchases/receiving/${receivingId}/post`)).batchId;
  const instances = await models.Instance.findAll({ where: { modelId: extraModels } });
  state.instanceIds.push(...instances.map((instance) => instance.id));
  const lines = [
    { modelId: state.modelId, sizeId: state.sizeId, quantity: 2 },
    ...extraModels.map((modelId) => ({ modelId, quantity: 1 })),
  ];
  const header = {
    employeeId: state.employeeId,
    warehouseId: state.warehouseId,
    documentDate: '2026-07-15',
  };
  await models.NomenclatureModel.update(
    { wearMonths: [4, 5, 6, 7, 8, 9, 10] },
    { where: { id: state.modelId } },
  );
  await post(`issuance/documents/${state.issuanceId}/revise`, {
    header,
    lines,
    reason: 'Р3: 22 модели',
  });
  assert.equal(
    await models.StockMovement.count({
      where: { documentId: state.issuanceId, documentType: 'issuance' },
    }),
    23,
  );
  const calendarBeforePrinting = (
    await models.StockMovement.findOne({
      where: {
        documentId: state.issuanceId,
        instanceId: state.instanceIds.slice(0, 3),
        documentType: 'issuance',
      },
    })
  ).wearMonthsSnapshot;
  const one = await workbook('preservation-receipt', { issuanceId: state.issuanceId });
  const two = await workbook('preservation-receipt', { issuanceId: state.issuanceId });
  assert.equal(receiptRows(one.sheet).length, 22);
  assert.equal(
    receiptRows(one.sheet).reduce((sum, row) => sum + row[1], 0),
    23,
  );
  assert.deepEqual(receiptRows(one.sheet), receiptRows(two.sheet));
  assert.doesNotMatch(JSON.stringify(one.sheet.model.rows), /Эксплуатация|Период эксплуатации/);
  const card = await workbook('personal-card', { employeeId: state.employeeId });
  const cardRows = [];
  for (let row = 13; row <= card.sheet.rowCount; row++) {
    if (typeof card.sheet.getCell(`A${row}`).value === 'number') cardRows.push(row);
  }
  assert.equal(cardRows.length, 22);
  assert.equal(
    cardRows.reduce((sum, row) => sum + card.sheet.getCell(`G${row}`).value, 0),
    23,
  );
  assert.doesNotMatch(JSON.stringify(card.sheet.model.rows), /Эксплуатация|Период эксплуатации/);
  assert.equal(card.sheet.getCell('F13').value, 4, 'норматив носки сохраняется');
  assert.match(card.sheet.getCell('A7').value, /52\/182/, 'размер и рост остаются в шапке');
  const seasonalMovement = await models.StockMovement.findOne({
    where: {
      documentId: state.issuanceId,
      instanceId: state.instanceIds.slice(0, 3),
      documentType: 'issuance',
    },
  });
  assert.deepEqual(
    seasonalMovement.wearMonthsSnapshot,
    calendarBeforePrinting,
    'календарь носки остаётся в данных',
  );
  assert.deepEqual(
    (await models.NomenclatureModel.findByPk(state.modelId)).wearMonths,
    [4, 5, 6, 7, 8, 9, 10],
  );

  for (const [form, query, xlsx] of [
    ['preservation-receipt', { issuanceId: state.issuanceId }, one],
    ['personal-card', { employeeId: state.employeeId }, card],
  ]) {
    const pdf = await auth(agent.get(`/api/v1/print-forms/${form}`))
      .query({ ...query, format: 'pdf' })
      .buffer(true)
      .parse(binaryParser);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');
    if (process.env.R3_QA_DIR) {
      await fs.mkdir(process.env.R3_QA_DIR, { recursive: true });
      await fs.writeFile(path.join(process.env.R3_QA_DIR, `${form}.xlsx`), xlsx.buffer);
      await fs.writeFile(path.join(process.env.R3_QA_DIR, `${form}.pdf`), pdf.body);
    }
  }

  // Уменьшение до одного экземпляра: старые строки и движения не попадают в текущую печать.
  await post(`issuance/documents/${state.issuanceId}/revise`, {
    header,
    lines: [{ modelId: state.modelId, sizeId: state.sizeId, quantity: 1 }],
    reason: 'Р3: исправление количества',
  });
  const revised = await workbook('preservation-receipt', { issuanceId: state.issuanceId });
  assert.equal(receiptRows(revised.sheet).length, 1);
  assert.equal(receiptRows(revised.sheet)[0][1], 1);
  assert.equal(
    await models.StockMovement.count({
      where: { documentId: state.issuanceId, documentType: 'issuance' },
    }),
    1,
  );
  const revisedCard = await workbook('personal-card', { employeeId: state.employeeId });
  assert.equal(revisedCard.sheet.getCell('G13').value, 1);
  assert.notEqual(typeof revisedCard.sheet.getCell('A14').value, 'number');
  const revisions = await models.DocumentRevision.findAll({
    where: { documentType: 'issuance', documentId: state.issuanceId },
  });
  assert.ok(revisions.length >= 2, 'история исправлений сохранена отдельно');
});
