// Требует применённых миграций и сида (pnpm db:migrate && pnpm db:seed).
// Расчёт формулы неполного месяца/предупреждений покрыт отдельными юнит-тестами
// в monthly-rental-act.test.js (calculateMonthlyRentalRows, resolveMonth) — этот
// файл проверяет HTTP-цепочку: предпросмотр -> фиксация снимка -> неизменность
// после смены цены -> Excel/PDF.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { env } from '../config/env.js';
import { models } from '../database/models/index.js';
import {
  binaryParser,
  setupApp,
  setupBaseFixture,
  addSecondPriceAndIssuance,
  createReturnDocument,
  cleanupFixtureState,
} from './print-forms-fixture.js';
import { floorMoney } from '../modules/print-forms/shared/money.js';

test('ежемесячный акт аренды: предпросмотр, фиксация снимка, неизменность после смены цены', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const { agent, auth } = await setupApp();
  const unique = `Test MonthlyRental ${Date.now()}`;
  const { state, model } = await setupBaseFixture({ agent, auth, unique });
  t.after(() => cleanupFixtureState(state));

  // Все 3 экземпляра (2 из первой выдачи + 1 из второй) остаются у работника
  // весь август — ни один не возвращён, поэтому ожидается 3 строки по 31 дню.
  const { secondPrice } = await addSecondPriceAndIssuance({ agent, auth, state, model });

  const augustPreview = await auth(agent.get('/api/v1/print-forms/monthly-rental/preview')).query({
    dpoId: state.dpoId,
    month: '2026-08',
  });
  assert.equal(augustPreview.status, 200);
  assert.equal(augustPreview.body.data.finalized, false);
  assert.equal(augustPreview.body.data.rows.length, 3);
  assert.deepEqual(
    augustPreview.body.data.rows.map((row) => row.rentalDays),
    [31, 31, 31],
  );
  // Цена на конец августа — 2000 (последняя действующая для модели), поэтому
  // все три строки, включая выданные по цене 1000, оцениваются по ней.
  assert.equal(augustPreview.body.data.totals.costWithoutVat, 6000);
  assert.equal(augustPreview.body.data.totals.vatAmount, 300);
  assert.equal(augustPreview.body.data.totals.totalWithVat, 6300);

  const monthlyExcel = await auth(agent.get('/api/v1/print-forms/monthly-rental'))
    .query({ dpoId: state.dpoId, month: '2026-08', format: 'xlsx' })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(monthlyExcel.status, 200);
  assert.equal(monthlyExcel.body.subarray(0, 2).toString(), 'PK');
  const monthlyWorkbook = new ExcelJS.Workbook();
  await monthlyWorkbook.xlsx.load(monthlyExcel.body);
  const monthlySheet = monthlyWorkbook.worksheets[0];
  assert.ok(monthlySheet.rowCount > 5);
  assert.match(String(monthlySheet.getCell('A1').value ?? ''), /АКТ/);
  assert.match(String(monthlySheet.getCell('A1').value ?? ''), /аренде форменной одежды/);
  assert.equal(monthlySheet.getCell('A1').font.name, 'Times New Roman');
  assert.equal(monthlySheet.getCell('A8').value, '№\nп/п');

  const fixedPreview = await auth(agent.get('/api/v1/print-forms/monthly-rental/preview')).query({
    dpoId: state.dpoId,
    month: '2026-08',
  });
  assert.equal(fixedPreview.body.data.finalized, true);
  assert.equal(fixedPreview.body.data.versionNumber, 1);
  assert.equal(fixedPreview.body.data.versions.length, 1);
  state.monthlyActIds.push(fixedPreview.body.data.actId);

  const storedAfterExcel = await models.MonthlyRentalActVersion.findOne({
    where: { actId: fixedPreview.body.data.actId, versionNumber: 1 },
  });
  assert.ok(storedAfterExcel.excelFileData.length > 1000);
  assert.equal(storedAfterExcel.excelChecksum.length, 64);

  await models.NomenclaturePrice.update(
    { priceWithoutVat: 1234, priceWithVat: 1295.7 },
    { where: { id: secondPrice.id } },
  );
  await models.NomenclatureModel.update(
    { rentalPrice: 1234, rentalVatRate: 5 },
    { where: { id: state.modelId } },
  );
  const frozenPreview = await auth(agent.get('/api/v1/print-forms/monthly-rental/preview')).query({
    dpoId: state.dpoId,
    month: '2026-08',
  });
  assert.equal(frozenPreview.body.data.totals.costWithoutVat, 6000);

  const monthlyPdf = await auth(agent.get('/api/v1/print-forms/monthly-rental'))
    .query({ dpoId: state.dpoId, month: '2026-08', format: 'pdf' })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(monthlyPdf.status, 200);
  assert.equal(monthlyPdf.body.subarray(0, 4).toString(), '%PDF');
  assert.ok(monthlyPdf.body.length > 5000);

  const storedAfterPdf = await storedAfterExcel.reload();
  assert.ok(storedAfterPdf.pdfFileData.length > 5000);
  assert.equal(storedAfterPdf.pdfChecksum.length, 64);

  await models.MonthlyRentalAct.update(
    {
      isStale: true,
      staleReason: 'Изменена исходная выдача',
      staleAt: new Date(),
    },
    { where: { id: fixedPreview.body.data.actId } },
  );

  const recalculatedPreview = await auth(
    agent.get('/api/v1/print-forms/monthly-rental/preview'),
  ).query({ dpoId: state.dpoId, month: '2026-08' });
  assert.equal(recalculatedPreview.body.data.needsNewVersion, true);
  assert.equal(recalculatedPreview.body.data.versionNumber, 1);
  assert.equal(recalculatedPreview.body.data.totals.costWithoutVat, 3702);
  assert.equal(recalculatedPreview.body.data.versions.length, 1);

  const versionTwoExcel = await auth(agent.get('/api/v1/print-forms/monthly-rental'))
    .query({
      dpoId: state.dpoId,
      month: '2026-08',
      format: 'xlsx',
      reason: 'Пересчёт после исправления выдачи',
    })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(versionTwoExcel.status, 200);
  assert.equal(versionTwoExcel.body.subarray(0, 2).toString(), 'PK');

  const versionedPreview = await auth(
    agent.get('/api/v1/print-forms/monthly-rental/preview'),
  ).query({ dpoId: state.dpoId, month: '2026-08' });
  assert.equal(versionedPreview.body.data.needsNewVersion, false);
  assert.equal(versionedPreview.body.data.versionNumber, 2);
  assert.deepEqual(
    versionedPreview.body.data.versions.map((version) => version.versionNumber),
    [2, 1],
  );

  const historicalPdf = await auth(
    agent.get(`/api/v1/print-forms/monthly-rental/${fixedPreview.body.data.actId}/versions/1/pdf`),
  )
    .buffer(true)
    .parse(binaryParser);
  assert.equal(historicalPdf.status, 200);
  assert.deepEqual(historicalPdf.body, monthlyPdf.body);

  const versionOne = await models.MonthlyRentalActVersion.findOne({
    where: { actId: fixedPreview.body.data.actId, versionNumber: 1 },
  });
  const versionTwo = await models.MonthlyRentalActVersion.findOne({
    where: { actId: fixedPreview.body.data.actId, versionNumber: 2 },
  });
  assert.equal(versionOne.snapshot.totals.costWithoutVat, 6000);
  assert.equal(versionTwo.snapshot.totals.costWithoutVat, 3702);
  assert.equal(versionTwo.reason, 'Пересчёт после исправления выдачи');
});

// Раньше это был открытый вопрос (docs/CUSTOMER_DECISIONS.md, п. 3
// "Не определено правило для выдачи и возврата в один день") — заказчик
// подтвердил: даже один день владения включается в счёт за месяц.
test('ежемесячный акт аренды: выдача и возврат в один день дают один оплачиваемый день', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const { agent, auth } = await setupApp();
  const unique = `Test MonthlyRentalSameDay ${Date.now()}`;
  const { state } = await setupBaseFixture({ agent, auth, unique });
  t.after(() => cleanupFixtureState(state));

  // setupBaseFixture оприходует 3 экземпляра и выдаёт 2 — один остаётся на
  // складе свободным для этого сценария.
  const spareInstance = await models.Instance.findOne({
    where: { modelId: state.modelId, status: 'in_stock' },
  });
  assert.ok(spareInstance, 'должен остаться неиспользованный экземпляр из базовой фикстуры');

  const sameDayIssuance = await auth(agent.post('/api/v1/issuance/documents')).send({
    employeeId: state.employeeId,
    warehouseId: state.warehouseId,
    documentDate: '2026-08-20',
  });
  state.secondIssuanceId = sameDayIssuance.body.data.id;
  await auth(agent.post(`/api/v1/issuance/documents/${state.secondIssuanceId}/lines`)).send({
    modelId: state.modelId,
    sizeId: state.sizeId,
    quantity: 1,
  });
  await auth(agent.post(`/api/v1/issuance/documents/${state.secondIssuanceId}/post`));

  await createReturnDocument({
    agent,
    auth,
    state,
    instanceId: spareInstance.id,
    documentDate: '2026-08-20',
  });

  const augustPreview = await auth(agent.get('/api/v1/print-forms/monthly-rental/preview')).query({
    dpoId: state.dpoId,
    month: '2026-08',
  });
  assert.equal(augustPreview.status, 200);
  const row = augustPreview.body.data.rows.find((item) => item.instanceId === spareInstance.id);
  assert.ok(row, 'экземпляр, выданный и возвращённый в один день, должен попасть в акт');
  assert.equal(row.rentalDays, 1, 'выдача и возврат в один день — один оплачиваемый день');
  assert.equal(row.issuedDate, '2026-08-20');
  assert.equal(row.returnedDate, '2026-08-20');
  assert.equal(row.costWithoutVat, floorMoney(row.monthlyPriceWithoutVat / 31));
});
