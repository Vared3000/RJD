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
  cleanupFixtureState,
} from './print-forms-fixture.js';

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
  state.monthlyActIds.push(fixedPreview.body.data.actId);

  await models.NomenclaturePrice.update(
    { priceWithoutVat: 1234, priceWithVat: 1295.7 },
    { where: { id: secondPrice.id } },
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
});
